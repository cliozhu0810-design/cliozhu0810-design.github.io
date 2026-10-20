'use strict';
const nativeFetch=window.fetch.bind(window),photoURLs=[];
let adminToken='';
try{adminToken=sessionStorage.getItem('tomespot:admin-token')||'';}catch{}
function clearAdminPhotos(){for(const url of photoURLs)URL.revokeObjectURL(url);photoURLs.length=0;}
async function loadAdminPhoto(path,img,link){try{const response=await fetch(tomespotApi(path),{headers:{Authorization:'Bearer '+adminToken}});if(!response.ok)throw Error();const blob=await response.blob();if(!img.isConnected)return;const url=URL.createObjectURL(blob);photoURLs.push(url);img.src=url;link.href=url;}catch{img.alt='写真を読み込めません / 图片加载失败';}}
const loginForm=document.getElementById('admin-login'),loginStatus=document.getElementById('login-status'),logoutButton=document.getElementById('admin-logout');
loginForm.hidden=!!adminToken;logoutButton.hidden=!adminToken;
window.fetch=async function(input,options={}){
  const raw=typeof input==='string'?input:'';
  const isAPI=raw.startsWith('/api/')||raw.startsWith(window.TOMESPOT_CONFIG.apiBase+'/api/');
  if(!isAPI)return nativeFetch(input,options);
  const headers=new Headers(options.headers);if(adminToken)headers.set('Authorization','Bearer '+adminToken);
  const response=await nativeFetch(raw.startsWith('/api/')?tomespotApi(raw):raw,{...options,headers});
  if(response.status===401||response.status===403){loginForm.hidden=false;logoutButton.hidden=false;}
  if(raw==='/api/admin/session'&&(response.status===401||response.status===403))return Response.json({admin:false});
  return response;
};
loginForm.onsubmit=async event=>{
  event.preventDefault();const button=loginForm.querySelector('button');button.disabled=true;loginStatus.textContent='…';
  try{
    const response=await nativeFetch(window.TOMESPOT_CONFIG.supabaseUrl+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:window.TOMESPOT_CONFIG.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify({email:loginForm.elements.email.value.trim(),password:loginForm.elements.password.value})});
    loginForm.elements.password.value='';
    const session=await response.json();if(!response.ok||!session.access_token)throw Error();
    const check=await nativeFetch(tomespotApi('/api/admin/session'),{headers:{Authorization:'Bearer '+session.access_token}});
    if(!check.ok||!(await check.json()).admin)throw Error();
    // Session-only token. Never persist the password or service-role key.
    sessionStorage.setItem('tomespot:admin-token',session.access_token);location.reload();
  }catch{loginStatus.textContent='ログインできません / 登录失败，请检查管理员账号和密码。';}finally{button.disabled=false;}
};
logoutButton.onclick=async()=>{try{if(adminToken)await nativeFetch(window.TOMESPOT_CONFIG.supabaseUrl+'/auth/v1/logout',{method:'POST',headers:{apikey:window.TOMESPOT_CONFIG.supabaseKey,Authorization:'Bearer '+adminToken}});}finally{sessionStorage.removeItem('tomespot:admin-token');adminToken='';clearAdminPhotos();location.reload();}};
window.addEventListener('pagehide',clearAdminPhotos);
