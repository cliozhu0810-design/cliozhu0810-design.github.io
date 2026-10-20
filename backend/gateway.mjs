// All administrator identity comes from a cryptographically verified Access token.
// Never trust incoming Sites identity headers on a public Worker.
const keyCache = new Map();
function decode64(value) {
  const encoded = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(encoded + '='.repeat((4 - encoded.length % 4) % 4)), c => c.charCodeAt(0));
}
export async function verifyAdmin(request, env) {
  if (!env.ADMIN_EMAIL || !env.ACCESS_AUD || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN || '')) return null;
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || request.headers.get('Cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith('CF_Authorization='))?.slice('CF_Authorization='.length);
  if (!token || token.length > 20000) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const parse = x => JSON.parse(new TextDecoder().decode(decode64(x)));
    const header = parse(parts[0]), claims = parse(parts[1]), now = Date.now() / 1000;
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || claims.iss !== env.ACCESS_TEAM_DOMAIN || claims.type !== 'app' || typeof claims.exp !== 'number' || claims.exp <= now || typeof claims.iat !== 'number' || claims.iat > now + 30 || typeof claims.nbf !== 'number' || claims.nbf > now + 30 || !Array.isArray(claims.aud) || !claims.aud.includes(env.ACCESS_AUD) || !claims.sub || typeof claims.email !== 'string' || claims.email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) return null;
    let cached = keyCache.get(env.ACCESS_TEAM_DOMAIN);
    if (!cached || cached.expires < Date.now() || !cached.keys.some(k => k.kid === header.kid)) {
      const response = await fetch(env.ACCESS_TEAM_DOMAIN + '/cdn-cgi/access/certs');
      if (!response.ok) return null;
      const jwks = await response.json();
      if (!Array.isArray(jwks.keys)) return null;
      cached = {keys: jwks.keys, expires: Date.now() + 300000};
      keyCache.set(env.ACCESS_TEAM_DOMAIN, cached);
    }
    const jwk = cached.keys.find(k => k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode64(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1])) ? claims : null;
  } catch { return null; }
}
export function cors(response, request, env) {
  const headers = new Headers(response.headers);
  headers.set('Vary', 'Origin');
  if (request.headers.get('Origin') === env.FRONTEND_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', env.FRONTEND_ORIGIN);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'same-origin');
  return new Response(response.body, {status: response.status, headers});
}
export async function dispatch(request, env, routes) {
  const url = new URL(request.url), path = url.pathname;
  if (request.method === 'OPTIONS') {
    if (request.headers.get('Origin') !== env.FRONTEND_ORIGIN || !['GET','POST'].includes(request.headers.get('Access-Control-Request-Method'))) return new Response(null, {status: 403});
    return cors(new Response(null, {status: 204}), request, env);
  }
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.startsWith('oai-authenticated-')) headers.delete(name);
  // Pending photos are visible only to the authenticated administrator.
  const requiresAdmin = path === '/admin' || path === '/admin/' || path.startsWith('/api/admin/');
  const identity = requiresAdmin || path.startsWith('/api/photos/') ? await verifyAdmin(request, env) : null;
  if (identity) {
    headers.set('oai-authenticated-user-id', identity.sub);
    headers.set('oai-authenticated-user-email', identity.email);
  }
  request = new Request(request, {headers});
  if (requiresAdmin && !identity) return cors(new Response('Administrator sign-in required. Open /admin through Cloudflare Access.', {status: 403, headers: {'Cache-Control':'no-store'}}),request,env);
  let result;
  try {
    const context = id => ({params: Promise.resolve({id})});
    if (path === '/api/comments' && request.method === 'GET') result = await routes.comments.GET(request);
    else if (path === '/api/comments' && request.method === 'POST') result = await routes.comments.POST(request);
    else if (path === '/api/admin/session' && request.method === 'GET') result = await routes.session.GET(request);
    else if (path === '/api/admin/comments' && request.method === 'GET') result = await routes.queue.GET(request);
    else if (/^\/api\/admin\/comments\/[-a-f0-9]{36}$/.test(path) && request.method === 'PATCH') result = await routes.moderate.PATCH(request, context(path.split('/').pop()));
    else if (/^\/api\/photos\/[-a-f0-9]{36}$/.test(path) && request.method === 'GET') result = await routes.photos.GET(request, context(path.split('/').pop()));
    else if ((path === '/admin' || path === '/admin/') && request.method === 'GET') result = routes.admin.GET();
    else if (['/admin.js','/comments.css','/locales.json'].includes(path) && request.method === 'GET') result = await env.ASSETS.fetch(request);
    else result = new Response('Not found', {status: 404});
  } catch { result = Response.json({error:'unavailable'}, {status:503, headers:{'Cache-Control':'no-store'}}); }
  return cors(result, request, env);
}
