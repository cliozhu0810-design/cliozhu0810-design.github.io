// This module runs only in the Edge Function, never in a browser bundle.
export function createStorage(env, fetcher=fetch) {
  const serviceHeaders={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY};
  async function api(path, options={}) {
    const response=await fetcher(env.SUPABASE_URL+path,{...options,headers:{...serviceHeaders,...options.headers}});
    if(!response.ok)throw new Error('storage_unavailable');
    return response;
  }
  const query=(params)=>new URLSearchParams(params).toString();
  const rows=async(params,options)=> (await api('/rest/v1/comments?'+query(params),options)).json();
  const DB={prepare(sql){let values=[];const statement={
    bind(...items){values=items;return statement;},
    async all(){
      if(sql.startsWith('SELECT * FROM comments WHERE facility_id='))return {results:await rows({select:'*',facility_id:'eq.'+values[0],status:'eq.approved',order:'created_at.desc,id.desc',limit:21,offset:Math.floor(values[1])})};
      if(sql.startsWith('SELECT * FROM comments WHERE status='))return {results:await rows({select:'*',status:'eq.'+values[0],order:'created_at.desc,id.desc',limit:51,offset:Math.floor(values[1])})};
      throw Error('unsupported_query');
    },
    async first(){
      if(sql.startsWith('SELECT submission_hash FROM comments WHERE id=')||sql.startsWith('SELECT * FROM comments WHERE id='))return (await rows({select:sql.startsWith('SELECT submission_hash')?'submission_hash':'*',id:'eq.'+values[0],limit:1}))[0]||null;
      if(sql.startsWith('INSERT INTO submission_limits'))return (await api('/rest/v1/rpc/tomespot_rate_limit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_key:values[0],p_window:values[1]})})).json();
      if(sql.startsWith('UPDATE comments SET status='))return (await rows({id:'eq.'+values[4],select:'id'},{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({status:values[0],admin_note:values[1],reviewed_at:values[2],reviewer:values[3]})}))[0]||null;
      throw Error('unsupported_query');
    },
    async run(){
      if(!sql.startsWith('INSERT INTO comments'))throw Error('unsupported_query');
      const [id,facility_id,vehicle,body,photos,created_at,submission_hash]=values;
      await api('/rest/v1/comments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,facility_id,vehicle,body,photos,status:'pending',created_at,admin_note:'',submission_hash})});
      return {success:true};
    }
  };return statement;}};
  const encode=key=>key.split('/').map(encodeURIComponent).join('/');
  const BUCKET={
    async put(key,bytes,options){await api('/storage/v1/object/tomespot-photos/'+encode(key),{method:'POST',headers:{'Content-Type':options.httpMetadata.contentType,'x-upsert':'false'},body:bytes});},
    async get(key){
      const response=await fetcher(env.SUPABASE_URL+'/storage/v1/object/authenticated/tomespot-photos/'+encode(key),{headers:serviceHeaders});
      if(response.status===404||response.status===400)return null;
      if(!response.ok)throw Error('storage_unavailable');
      return {body:response.body,httpMetadata:{contentType:response.headers.get('Content-Type')}};
    },
    async delete(key){await api('/storage/v1/object/tomespot-photos',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[key]})});}
  };
  return {DB,BUCKET};
}
export async function verifySupabaseAdmin(request,env,fetcher=fetch){
  if(!env.ADMIN_EMAIL||!env.SUPABASE_ANON_KEY||!env.SUPABASE_URL)return null;
  const token=request.headers.get('Authorization');
  if(!/^Bearer [A-Za-z0-9._-]+$/.test(token||'')||token.length>20000)return null;
  try{
    const response=await fetcher(env.SUPABASE_URL+'/auth/v1/user',{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:token}});
    if(!response.ok)return null;
    const user=await response.json();
    return user.id&&user.email_confirmed_at&&typeof user.email==='string'&&user.email.toLowerCase()===env.ADMIN_EMAIL.toLowerCase()?{sub:user.id,email:user.email}:null;
  }catch{return null;}
}
