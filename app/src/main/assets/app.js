/* GRAPEVINE — Supabase-connected edition
   Security model: Supabase Auth + public.admins + Row Level Security.
   Never put a Supabase service-role/secret key in this app.
*/
const DEFAULT={settings:{name:'GRAPEVINE',motto:'Code Today. Build Tomorrow. Inspire Forever.',description:'A software engineering group built around collaboration, innovation and practical technology.',email:'grapevine@example.com',phone:'+256 700 000 000',location:'Uganda'},members:Array.from({length:11},(_,i)=>({id:'m'+(i+1),name:'Member '+(i+1),role:'Software Engineering Team',bio:'GRAPEVINE member profile. Update this profile from the admin dashboard.',skills:['Programming','Teamwork'],verified:i===0,photo:''})),projects:[{id:'p1',title:'Project One',description:'Project description and results.',tags:['Web','Software']}],skills:[{id:'s1',title:'Web Development',description:'HTML, CSS, JavaScript and responsive interfaces.'}],gallery:[{id:'g1',title:'Our identity',image:'assets/grapevine-logo.jpg'}]};
const CFG_KEY='gv_supabase_config', SESSION_KEY='gv_supabase_session';
const BUILTIN_SUPABASE={url:'https://bcinhmoyyjbkdcpkrztr.supabase.co',key:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjaW5obW95eWpia2RjcGtyenRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMzAxNDksImV4cCI6MjEwNjcwNjE0OX0.n_GlM4exGN2eceSSxXpqhGTjckkt_sUhXGR22PdRo58'};
let cfg=JSON.parse(localStorage.getItem(CFG_KEY)||'null')||BUILTIN_SUPABASE;
let session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
let state=load(); state.downloadRequests=Array.isArray(state.downloadRequests)?state.downloadRequests:[]; let route='home'; let adminSession=false; let chatTimer=null; const PENDING_CONFIRM_KEY='gv_pending_confirmation_email';
function cloneDefault(){return JSON.parse(JSON.stringify(DEFAULT))}
function load(){try{const raw=localStorage.getItem('gv_state');return raw?JSON.parse(raw):cloneDefault()}catch{return cloneDefault()}}
function save(){localStorage.setItem('gv_state',JSON.stringify(state))}
function online(){return navigator.onLine}
function configured(){return !!(cfg.url&&cfg.key)}
function uid(){try{if(window.crypto&&crypto.randomUUID)return crypto.randomUUID()}catch{}return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)}
function esc(s=''){return String(s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}

// Persistent profile-photo cache. Profile photos are remote Supabase images, so the
// service worker cannot reliably cache them because they are cross-origin. We cache
// the image bytes in IndexedDB instead, keyed by member id, and reuse them offline.
const PHOTO_DB='grapevine-media-v3';
let photoDbPromise=null;
function photoDB(){
  if(photoDbPromise)return photoDbPromise;
  photoDbPromise=new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject(new Error('IndexedDB unavailable'));return}
    const req=indexedDB.open(PHOTO_DB,2);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('photos'))req.result.createObjectStore('photos',{keyPath:'id'});if(!req.result.objectStoreNames.contains('gallery'))req.result.createObjectStore('gallery',{keyPath:'id'})};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Could not open photo cache'));
  });
  return photoDbPromise;
}
async function photoGet(id){
  try{const db=await photoDB();return await new Promise((resolve,reject)=>{const r=db.transaction('photos','readonly').objectStore('photos').get(String(id));r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)})}catch{return null}
}
async function photoPut(id,url,blob){
  try{const db=await photoDB();await new Promise((resolve,reject)=>{const r=db.transaction('photos','readwrite').objectStore('photos').put({id:String(id),url:url||'',blob,savedAt:Date.now()});r.onsuccess=resolve;r.onerror=()=>reject(r.error)});return true}catch{return false}
}
async function galleryGet(id){
  try{const db=await photoDB();return await new Promise((resolve,reject)=>{const r=db.transaction('gallery','readonly').objectStore('gallery').get(String(id));r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)})}catch{return null}
}
async function galleryGetAll(){
  try{const db=await photoDB();return await new Promise((resolve,reject)=>{const r=db.transaction('gallery','readonly').objectStore('gallery').getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}catch{return []}
}
async function galleryPut(item,blob,pending=false){
  try{const db=await photoDB();await new Promise((resolve,reject)=>{const r=db.transaction('gallery','readwrite').objectStore('gallery').put({...item,id:String(item.id),blob:blob||null,pending:!!pending,savedAt:Date.now()});r.onsuccess=resolve;r.onerror=()=>reject(r.error)});return true}catch{return false}
}
async function galleryDelete(id){
  try{const db=await photoDB();await new Promise((resolve,reject)=>{const r=db.transaction('gallery','readwrite').objectStore('gallery').delete(String(id));r.onsuccess=resolve;r.onerror=()=>reject(r.error)});return true}catch{return false}
}
function setGalleryFromBlob(img,blob){try{if(img._objectUrl)URL.revokeObjectURL(img._objectUrl);img._objectUrl=URL.createObjectURL(blob);img.src=img._objectUrl}catch{}}
async function hydrateGallery(){
  const imgs=[...document.querySelectorAll('img[data-gallery-id]')];
  await Promise.all(imgs.map(async img=>{
    const id=img.dataset.galleryId; const url=img.dataset.galleryUrl||''; const cached=await galleryGet(id);
    if(cached?.blob)setGalleryFromBlob(img,cached.blob);
    if(!online()||!url)return;
    if(cached?.blob && cached.url===url)return;
    try{const r=await fetch(url,{mode:'cors',cache:'no-store'});if(!r.ok)throw Error('Gallery image request failed');const blob=await r.blob();if(!blob.type.startsWith('image/'))throw Error('Not an image');await galleryPut({id,url,title:img.dataset.galleryTitle||'',description:img.dataset.galleryDescription||''},blob,false);setGalleryFromBlob(img,blob)}catch{if(!cached?.blob&&url)img.src=url}
  }));
  const media=[...document.querySelectorAll('video[data-gallery-id],audio[data-gallery-id]')];
  await Promise.all(media.map(async el=>{const id=el.dataset.galleryId;const url=el.dataset.galleryUrl||'';const cached=await galleryGet(id);if(cached?.blob){try{el.src=URL.createObjectURL(cached.blob)}catch{}}if(!online()||!url)return;if(cached?.blob&&cached.url===url)return;try{const r=await fetch(url,{mode:'cors',cache:'no-store'});if(!r.ok)throw Error('Media request failed');const blob=await r.blob();await galleryPut({id,url,title:el.dataset.galleryTitle||'',description:el.dataset.galleryDescription||'',media_type:el.tagName.toLowerCase()==='video'?'video':'audio'},blob,false);el.src=URL.createObjectURL(blob)}catch{if(!cached?.blob&&url)el.src=url}}));
}
async function hydrateOfflineGalleryState(){
  const cached=await galleryGetAll();
  if(!cached.length)return;
  const byId=new Map(state.gallery.map(g=>[String(g.id),g]));
  for(const x of cached){if(x.pending||!byId.has(String(x.id)))byId.set(String(x.id),{id:x.id,title:x.title||'Showcase media',description:x.description||'',image:x.url||'',media_type:x.media_type||'image',approved:!!x.approved})}
  state.gallery=[...byId.values()];
}
function mediaKind(file){const t=(file?.type||'').toLowerCase();if(t.startsWith('video/'))return 'video';if(t.startsWith('audio/'))return 'audio';return 'image'}
function mediaIcon(kind){return kind==='video'?'🎬':kind==='audio'?'🎵':'🖼️'}
async function ensureGalleryBucket(){
  if(!session?.access_token)throw Error('Please sign in before uploading media');
  try{await authFetch('/rest/v1/rpc/ensure_grapevine_gallery_bucket',{method:'POST',headers:{Prefer:'return=representation'},body:'{}'});return true}
  catch(e){return false}
}
function b64utf8(value){
  try{return btoa(unescape(encodeURIComponent(String(value))))}
  catch{return btoa(String(value))}
}
function storageUploadBase(){
  const base=cfg.url.replace(/\/$/,'');
  try{
    const u=new URL(base);
    const host=u.hostname||'';
    if(host.endsWith('.supabase.co')){
      const projectRef=host.split('.')[0];
      if(projectRef)return 'https://'+projectRef+'.storage.supabase.co';
    }
  }catch{}
  return base;
}
function storageAuthHeaders(extra={}){
  return {'apikey':cfg.key,...(session?.access_token?{Authorization:'Bearer '+session.access_token}:{}),...extra};
}
async function storageError(r,fallback){
  const detail=await r.text().catch(()=> '');
  try{
    const x=JSON.parse(detail);
    return x.message||x.error||x.error_description||x.statusCode||detail||fallback;
  }catch{return detail||fallback}
}
async function uploadGalleryResumable(base,path,file){
  // Supabase recommends the direct storage hostname for TUS uploads. The
  // WebView must also send a TUS creation request without the JSON Content-Type
  // used by the PostgREST/Auth helpers. Chunks must be exactly 6 MB.
  const endpoint=base+'/storage/v1/upload/resumable';
  const metadata=[
    'bucketName '+b64utf8('gallery-media'),
    'objectName '+b64utf8(path),
    'contentType '+b64utf8(file.type||'application/octet-stream'),
    'cacheControl '+b64utf8('3600')
  ].join(',');
  let r=await fetch(endpoint,{
    method:'POST',
    headers:storageAuthHeaders({
      'Tus-Resumable':'1.0.0',
      'Upload-Length':String(file.size),
      'Upload-Metadata':metadata,
      'x-upsert':'true'
    })
  });
  if(!r.ok)throw Error(await storageError(r,'Gallery resumable upload could not start (HTTP '+r.status+')'));
  let location=r.headers.get('Location')||r.headers.get('location');
  if(!location)throw Error('Gallery resumable upload did not return an upload location');
  if(location.startsWith('/'))location=base+location;
  else if(!/^https?:\/\//i.test(location))location=base+'/'+location.replace(/^\/+/, '');
  let offset=0;
  const chunkSize=6*1024*1024;
  while(offset<file.size){
    const end=Math.min(offset+chunkSize,file.size);
    const chunk=file.slice(offset,end);
    let attempt=0, done=false;
    while(!done && attempt<4){
      attempt++;
      r=await fetch(location,{
        method:'PATCH',
        headers:storageAuthHeaders({
          'Tus-Resumable':'1.0.0',
          'Upload-Offset':String(offset),
          'Content-Type':'application/offset+octet-stream'
        }),
        body:chunk
      });
      if(r.ok){
        const returned=r.headers.get('Upload-Offset')||r.headers.get('upload-offset');
        const next=returned===null?end:Number(returned);
        if(!Number.isFinite(next)||next<end)throw Error('Gallery upload returned an invalid upload offset');
        offset=next;
        done=true;
      }else if(attempt<4){
        await new Promise(resolve=>setTimeout(resolve,750*attempt));
      }else{
        throw Error(await storageError(r,'Gallery media upload failed during resumable transfer (HTTP '+r.status+')'));
      }
    }
  }
}
async function uploadGalleryBlob(item,file,approved=false){
  if(!file)return item;
  const safe=file.name.toLowerCase().replace(/[^a-z0-9._-]/g,'-')||'media';
  const galleryId=item.id||('g-'+uid());
  const path=galleryId+'/'+Date.now()+'-'+safe;
  const base=storageUploadBase();
  await ensureGalleryBucket();

  // Use one reliable path for every gallery file. Supabase recommends TUS
  // resumable uploads for files above 6 MB and requires 6 MB chunks. Using
  // TUS for all gallery media also avoids the Android WebView switching between
  // two different Storage upload implementations.
  await uploadGalleryResumable(base,path,file);
  item.id=galleryId;
  item.image=base+'/storage/v1/object/public/gallery-media/'+path+'?v='+Date.now();
  item.media_type=mediaKind(file);
  item.approved=!!approved;
  await galleryPut({id:item.id,url:item.image,title:item.title,description:item.description,media_type:item.media_type,approved:item.approved},file,false);
  return item;
}
async function syncPendingGallery(){
  if(!online()||!configured()||!session?.access_token)return;
  const pending=await galleryGetAll();
  for(const x of pending.filter(x=>x.pending&&x.blob)){
    try{const item={id:x.id,title:x.title||'Showcase media',description:x.description||'',image:x.url||'',media_type:x.media_type||mediaKind(x.blob),approved:!!adminSession};await uploadGalleryBlob(item,x.blob,item.approved);await dbInsert('content_items',{kind:'gallery',title:item.title,description:item.description||'',tags:[],image_url:item.image,media_type:item.media_type,approved:item.approved,uploaded_by:session.user.id});await galleryDelete(x.id)}catch(e){}
  }
}
function setPhotoFromBlob(img,blob){
  try{if(img._objectUrl)URL.revokeObjectURL(img._objectUrl);img._objectUrl=URL.createObjectURL(blob);img.src=img._objectUrl}catch{}
}
async function hydrateProfilePhotos(){
  const imgs=[...document.querySelectorAll('img[data-profile-id]')];
  await Promise.all(imgs.map(async img=>{
    const id=img.dataset.profileId;
    const url=img.dataset.photoUrl||'';
    const cached=await photoGet(id);

    // Offline: always prefer the last successfully saved photo.
    if(!online()){
      if(cached?.blob)setPhotoFromBlob(img,cached.blob);
      return;
    }

    // Online: keep the cached photo visible immediately while refreshing it.
    if(cached?.blob)setPhotoFromBlob(img,cached.blob);
    if(!url)return;

    // Do not repeatedly download the same image on every render.
    if(cached?.blob && cached.url===url)return;

    try{
      const r=await fetch(url,{mode:'cors',cache:'no-store'});
      if(!r.ok)throw new Error('Photo request failed');
      const blob=await r.blob();
      if(!blob.type.startsWith('image/'))throw new Error('Not an image');
      await photoPut(id,url,blob);
      setPhotoFromBlob(img,blob);
    }catch{
      // If Supabase is temporarily unreachable, leave the cached image in place.
      if(!cached?.blob && url)img.src=url;
    }
  }));
}
function verifiedBadge(){return '<span class="verification-badge" role="img" title="Verified member" aria-label="Verified member"><svg viewBox="0 0 32 32" focusable="false" aria-hidden="true"><polygon class="seal" points="16,1 19.31,3.64 23.5,3.01 25.05,6.95 28.99,8.5 28.36,12.69 31,16 28.36,19.31 28.99,23.5 25.05,25.05 23.5,28.99 19.31,28.36 16,31 12.69,28.36 8.5,28.99 6.95,25.05 3.01,23.5 3.64,19.31 1,16 3.64,12.69 3.01,8.5 6.95,6.95 8.5,3.01 12.69,3.64"/><path class="check" d="M9 16.5 L13.5 21 L23.5 11"/></svg></span>'}
function headers(extra={}){return {'apikey':cfg.key,'Content-Type':'application/json',...(session?.access_token?{Authorization:'Bearer '+session.access_token}:{}),...extra}}
async function authFetch(path,opts={},retry=true){if(!configured())throw Error('Supabase is not configured');let r=await fetch(cfg.url.replace(/\/$/,'')+path,{...opts,headers:headers(opts.headers||{})});if(r.status===401&&retry&&session?.refresh_token){try{await refreshSession();return authFetch(path,opts,false)}catch{}}if(!r.ok){let t=await r.text();throw Error(t||('HTTP '+r.status))}return r.status===204?null:r.json()}
async function refreshSession(){if(!session?.refresh_token)throw Error('Session expired');const r=await fetch(cfg.url.replace(/\/$/,'')+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:headers(),body:JSON.stringify({refresh_token:session.refresh_token})});if(!r.ok)throw Error('Session expired');session=await r.json();localStorage.setItem(SESSION_KEY,JSON.stringify(session));return session}
async function login(email,password){email=(email||'').trim().toLowerCase();password=password||'';if(!email||!password)throw Error('Enter your email and password');const r=await fetch(cfg.url.replace(/\/$/,'')+'/auth/v1/token?grant_type=password',{method:'POST',headers:headers(),body:JSON.stringify({email,password})});const x=await r.json().catch(()=>({}));if(!r.ok){const code=String(x.error_code||x.code||'').toLowerCase();const msg=String(x.error_description||x.msg||x.message||'').toLowerCase();if(code.includes('email_not_confirmed')||msg.includes('email not confirmed')){localStorage.setItem(PENDING_CONFIRM_KEY,email);throw Error('Your email is not confirmed yet. Open the confirmation email, then return here and sign in again.')}if(code.includes('invalid_credentials')||msg.includes('invalid login credentials'))throw Error('Email or password is incorrect. If this is a new account, confirm the email first.');throw Error(x.error_description||x.msg||x.message||'Sign in failed. Please check your email, password and email confirmation.')}if(!x.access_token||!x.user)throw Error('Sign in did not return a valid member session.');session=x;localStorage.setItem(SESSION_KEY,JSON.stringify(session));localStorage.removeItem(PENDING_CONFIRM_KEY);return session}
async function signup(name,email,password){name=(name||'').trim();email=(email||'').trim().toLowerCase();password=password||'';if(!name)throw Error('Enter your full name');if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw Error('Enter a valid email address');if(password.length<6)throw Error('Password must be at least 6 characters');const r=await fetch(cfg.url.replace(/\/$/,'')+'/auth/v1/signup',{method:'POST',headers:headers(),body:JSON.stringify({email,password,data:{full_name:name,name},options:{email_redirect_to:'grapevine://auth-callback'}})});const x=await r.json().catch(()=>({}));if(!r.ok)throw Error(x.msg||x.error_description||x.message||'Could not create member account');if(x.access_token){session=x;localStorage.setItem(SESSION_KEY,JSON.stringify(session))}return x}
async function handleGrapevineAuthCallback(raw){try{const u=new URL(raw);const hash=new URLSearchParams((u.hash||'').replace(/^#/,'').replace(/^\?/ ,''));const q=u.searchParams;const err=hash.get('error_description')||q.get('error_description')||hash.get('error');if(err)throw Error(decodeURIComponent(err));const access_token=hash.get('access_token');const refresh_token=hash.get('refresh_token');if(!access_token||!refresh_token){route='chat';render();toast('Email confirmed. Please sign in with your email and password.');return}const r=await fetch(cfg.url.replace(/\/$/,'')+'/auth/v1/user',{headers:headers({Authorization:'Bearer '+access_token})});const user=await r.json().catch(()=>({}));if(!r.ok||!user?.id)throw Error('Email was confirmed, but the member session could not be opened');session={access_token,refresh_token,token_type:hash.get('token_type')||'bearer',expires_in:Number(hash.get('expires_in')||3600),expires_at:Number(hash.get('expires_at')||0),user};localStorage.setItem(SESSION_KEY,JSON.stringify(session));localStorage.removeItem(PENDING_CONFIRM_KEY);adminSession=await isAdmin().catch(()=>false);route='chat';render();await loadChat();toast('Email confirmed. Welcome to GRAPEVINE chat.')}catch(e){toast('Confirmation failed: '+friendly(e))}}
async function signout(){session=null;adminSession=false;localStorage.removeItem(SESSION_KEY);route='admin';render()}
async function isAdmin(){if(!session?.user?.id)return false;const rows=await authFetch('/rest/v1/admins?select=user_id&user_id=eq.'+encodeURIComponent(session.user.id));return Array.isArray(rows)&&rows.length>0}
async function dbGet(table,query=''){return authFetch('/rest/v1/'+table+'?'+query,{headers:{Prefer:'return=representation'}})}
async function dbInsert(table,row){return authFetch('/rest/v1/'+table,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(row)})}
async function dbPatch(table,filter,row){return authFetch('/rest/v1/'+table+'?'+filter,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(row)})}
async function dbDelete(table,filter){return authFetch('/rest/v1/'+table+'?'+filter,{method:'DELETE',headers:{Prefer:'return=representation'}})}
async function loadRemote(){
  if(!configured()||!online())return false;
  let changed=false;
  try{const profiles=await dbGet('profiles','select=*&order=created_at.asc');if(Array.isArray(profiles)){state.members=profiles.map(p=>({id:p.id,name:p.name,role:p.role||'Member',bio:p.bio||'',skills:typeof p.skills==='string'?p.skills.split(',').map(x=>x.trim()).filter(Boolean):(p.skills||[]),verified:(p.verified===true||p.verified===1||p.verified==='true'),photo:p.photo_url||''}));changed=true}}catch{}
  try{const settings=await dbGet('site_settings','select=*&id=eq.1');if(Array.isArray(settings)&&settings[0]?.settings)state.settings={...state.settings,...settings[0].settings};changed=true}catch{}
  try{const content=await dbGet('content_items','select=*&order=created_at.asc');if(Array.isArray(content)){state.projects=content.filter(x=>x.kind==='project').map(x=>({id:x.id,title:x.title,description:x.description||'',tags:x.tags||[]}));state.skills=content.filter(x=>x.kind==='skill').map(x=>({id:x.id,title:x.title,description:x.description||''}));state.gallery=content.filter(x=>x.kind==='gallery').map(x=>({id:x.id,title:x.title,description:x.description||'',image:x.image_url||'',media_type:x.media_type||'image',approved:x.approved===true,uploaded_by:x.uploaded_by||null}));changed=true}}catch{}
  if(session?.user?.id){try{const rq=await dbGet('download_requests','select=id,content_id,requester_id,status,requested_at,reviewed_at&requester_id=eq.'+encodeURIComponent(session.user.id)+'&order=requested_at.desc');if(Array.isArray(rq))state.downloadRequests=rq}catch{} }
  save();await hydrateOfflineGalleryState();try{await syncPendingGallery()}catch{};return changed;
}

async function sync(){if(await loadRemote())render()}
window.addEventListener('online',async()=>{await syncPendingGallery();await sync();toast('Back online')});window.addEventListener('offline',()=>toast('Offline: showing cached data'));
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
function render(){document.getElementById('app').innerHTML=`<div class="shell"><header class="top"><div class="brand"><img src="assets/grapevine-logo.jpg"><div><b>${esc(state.settings.name)}</b><small>Software Engineering Group</small></div></div><span class="status ${online()?'online':'offline'}">${online()?'ONLINE':'OFFLINE'}</span></header><main class="content">${view()}</main>${bottom()}</div>`;hydrateProfilePhotos().catch(()=>{});hydrateGallery().catch(()=>{})}
function bottom(){return `<nav class="bottom">${[['home','⌂','Home'],['members','♙','Members'],['projects','▣','Projects'],['gallery','▧','Gallery'],['chat','💬','Chat'],['admin','⚙','Admin']].map(x=>`<button class="${route===x[0]?'active':''}" onclick="go('${x[0]}')"><span>${x[1]}</span>${x[2]}</button>`).join('')}</nav>`}
function view(){if(route==='members')return members();if(route==='projects')return projects();if(route==='gallery')return gallery();if(route==='chat')return chat();if(route==='admin'||route.startsWith('admin-'))return admin();return home()}
function home(){return `<section class="hero"><img src="assets/grapevine-logo.jpg"><div class="eyebrow">SOFTWARE ENGINEERING • CREATIVITY • TEAMWORK</div><h1>We Code. We Build. We Inspire.</h1><p>${esc(state.settings.description)}</p><p><b>${esc(state.settings.motto)}</b></p><div class="actions"><button class="btn gold" onclick="go('members')">Meet Members</button><button class="btn light" onclick="go('projects')">Explore Projects</button></div></section><h2>GRAPEVINE at a glance</h2><div class="grid"><div class="card"><div class="stat">${state.members.length}</div><p>Members</p></div><div class="card"><div class="stat">${state.projects.length}</div><p>Projects</p></div><div class="card"><div class="stat">${state.skills.length}</div><p>Skills</p></div><div class="card"><div class="stat">${state.gallery.length}</div><p>Gallery items</p></div></div><section class="home-overview"><div class="card"><div class="eyebrow">WELCOME TO GRAPEVINE</div><h2 class="overview-title">A place to connect, learn, build and grow.</h2><p class="overview-copy">Discover our members, explore projects, share skills and stay connected with the GRAPEVINE community.</p><div class="home-quick"><button class="btn gold" onclick="go('members')">Members</button><button class="btn light" onclick="go('projects')">Projects</button><button class="btn light" onclick="go('gallery')">Gallery</button></div></div><div class="home-cards"><article class="home-feature"><div class="feature-icon">👥</div><h3>Community</h3><p>Meet people, see member profiles and discover what the team can do.</p></article><article class="home-feature"><div class="feature-icon">🛠️</div><h3>Projects</h3><p>Explore practical ideas, software projects and collaborative work.</p></article><article class="home-feature"><div class="feature-icon">📚</div><h3>Skills</h3><p>Learn from shared experience and find skills across the community.</p></article><article class="home-feature"><div class="feature-icon">✓</div><h3>Trusted profiles</h3><p>Administrators can give the official blue check badge to verified members.</p></article></div></section><section class="home-info"><div class="info-head"><div><div class="eyebrow">ABOUT US</div><h2>More about GRAPEVINE</h2></div><span class="tag verified">Community</span></div><div class="welcome-note"><h3>A connected engineering community</h3><p>GRAPEVINE brings software engineers and technology enthusiasts together to learn, build practical solutions, share skills and grow as a team.</p></div><div class="info-grid"><article class="info-card"><div class="info-icon">💻</div><h3>Build</h3><p>Turn ideas into useful software, projects and digital solutions.</p></article><article class="info-card"><div class="info-icon">🧠</div><h3>Learn</h3><p>Share knowledge, skills and experience across the team.</p></article><article class="info-card"><div class="info-icon">🤝</div><h3>Connect</h3><p>Meet members, discover their skills and collaborate on projects.</p></article><article class="info-card"><div class="info-icon">🚀</div><h3>Grow</h3><p>Create opportunities for teamwork, creativity and professional growth.</p></article></div><div class="home-strip"><div class="card"><strong>Members</strong><span>${online()?'Live data synced with Supabase':'Using saved offline data'}</span></div><div class="card"><strong>Verification</strong><span>Admin-verified members display the official badge.</span></div></div></section><div class="card" style="margin-top:14px"><div class="eyebrow">CONTACT</div><h3>${esc(state.settings.email)}</h3><p>${esc(state.settings.phone)} • ${esc(state.settings.location)}</p></div>`}
function members(){return `<div class="admin-head"><div><div class="eyebrow">THE TEAM</div><h2>Members</h2></div></div><div class="search"><input placeholder="Search members" oninput="filterMembers(this.value)"></div><div id="memberList">${memberCards(state.members)}</div>`}
function memberCards(arr){return arr.map(m=>`<article class="card member"><img class="photo profile-photo" data-profile-id="${esc(m.id)}" data-photo-url="${esc(m.photo||'')}" src="assets/grapevine-logo.jpg" onerror="this.src='assets/grapevine-logo.jpg'"><div class="member-main"><div class="member-name"><h3 style="margin:0">${esc(m.name)}</h3>${m.verified?verifiedBadge():''}</div><div class="small">${esc(m.role)}</div><p>${esc(m.bio)}</p><div>${(m.skills||[]).map(s=>`<span class="tag">${esc(s)}</span>`).join('')}</div></div></article>`).join('')||'<div class="empty">No members found.</div>'}
function filterMembers(q){const x=(q||'').toLowerCase();document.getElementById('memberList').innerHTML=memberCards(state.members.filter(m=>(m.name+' '+m.role).toLowerCase().includes(x)));hydrateProfilePhotos().catch(()=>{})}
function projects(){return `<div class="eyebrow">OUR WORK</div><h2>Projects</h2><div class="grid">${state.projects.map(p=>`<article class="card"><div class="eyebrow">PROJECT</div><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p>${(p.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</article>`).join('')}</div>`}
function latestDownloadRequest(id){if(!Array.isArray(state.downloadRequests))return null;return state.downloadRequests.filter(r=>String(r.content_id)===String(id)).sort((a,b)=>new Date(b.requested_at||0)-new Date(a.requested_at||0))[0]||null}
function gallery(){
  const canUpload=!!session;
  const cards=state.gallery.map(g=>{const kind=g.media_type||'image';const src=esc(g.image||'');let media='';if(kind==='video')media=`<video controls preload="metadata" data-gallery-id="${esc(g.id)}" data-gallery-url="${src}" style="width:100%;aspect-ratio:1.2;object-fit:cover;border-radius:12px;background:#111"></video>`;else if(kind==='audio')media=`<div class="media-audio"><div class="media-icon">${mediaIcon(kind)}</div><audio controls preload="metadata" data-gallery-id="${esc(g.id)}" data-gallery-url="${src}" style="width:100%"></audio></div>`;else media=`<img data-gallery-id="${esc(g.id)}" data-gallery-url="${src}" data-gallery-title="${esc(g.title||'')}" data-gallery-description="${esc(g.description||'')}" style="width:100%;aspect-ratio:1.2;object-fit:cover;border-radius:12px" src="assets/grapevine-logo.jpg" onerror="this.src='assets/grapevine-logo.jpg'">`;
    const req=latestDownloadRequest(g.id); let downloadControl=''; let approvalNotice='';
    if(!g.approved) approvalNotice=`<div class="notice">This showcase media is waiting for administrator approval before it is shared with other members.</div>`;
    if(!session) downloadControl=`<button class="btn light" onclick="go('chat');toast('Sign in to request a download')">Download</button>`;
    else if(adminSession) downloadControl=`<button class="btn light" onclick="downloadGalleryMedia('${esc(g.id)}','${src}','${esc(g.title||'grapevine-media')}')">Download</button>`;
    else if(req?.status==='approved'){approvalNotice+=`<div class="notice success">✓ Administrator approved your download request. The Download button is ready.</div>`;downloadControl=`<button class="btn primary" onclick="downloadGalleryMedia('${esc(g.id)}','${src}','${esc(g.title||'grapevine-media')}')">✓ Download now</button>`;}
    else if(req?.status==='pending'){approvalNotice+=`<div class="notice">⏳ Download request sent. Waiting for administrator approval.</div>`;downloadControl=`<button class="btn light" disabled>⏳ Waiting for approval</button>`;}
    else if(req?.status==='rejected'){approvalNotice+=`<div class="notice danger">Download request was rejected. You can request permission again.</div>`;downloadControl=`<button class="btn gold" onclick="requestGalleryDownload('${esc(g.id)}')">Request download again</button>`;}
    else downloadControl=`<button class="btn light" onclick="requestGalleryDownload('${esc(g.id)}')">Download</button>`;
    return `<article class="card">${media}<h3>${esc(g.title||'Showcase media')}</h3><p>${esc(g.description||'')}</p>${approvalNotice}<div class="actions">${downloadControl}</div></article>`}).join('');
  return `<div class="eyebrow">MEMORIES</div><div class="admin-head"><div><h2>Gallery</h2><p class="small">Upload image, video or audio media. Showcase uploads need administrator approval. Downloads also require individual administrator approval.</p></div>${canUpload?'<button class="btn gold" onclick="openGalleryUpload()">＋ Upload Media</button>':''}</div><div class="actions" style="margin-bottom:12px">${session?'<button class="btn light" onclick="refreshGallery()">↻ Refresh approval status</button>':''}</div><div class="grid">${cards||'<div class="empty">No showcase media yet.</div>'}</div>`;
}
async function refreshGallery(){try{await sync();toast('Gallery and approval status refreshed')}catch(e){toast(friendly(e))}}
async function requestGalleryDownload(id){
  if(!session?.user?.id){go('chat');return}
  try{
    const item=state.gallery.find(x=>String(x.id)===String(id));if(!item)return toast('Media not found');
    const existing=latestDownloadRequest(id);
    if(existing?.status==='pending')return toast('Download request already sent. Waiting for admin approval.');
    if(existing?.status==='approved')return downloadGalleryMedia(id,item.image,item.title);
    const rows=await dbInsert('download_requests',{content_id:id,requester_id:session.user.id,status:'pending'});
    if(!Array.isArray(rows)||!rows.length)throw Error('Download request could not be created');
    await sync();render();toast('Download request sent. Please wait for admin approval.');
  }catch(e){toast('Download request failed: '+friendly(e))}
}
async function downloadGalleryMedia(id,url,title){if(!url)return toast('Media is not available for download');const item=state.gallery.find(x=>String(x.id)===String(id));if(!item?.approved)return toast('This showcase media is still waiting for admin approval');const req=latestDownloadRequest(id);if(!adminSession&&req?.status!=='approved')return toast('Your download request is waiting for admin approval');const ext=(item.media_type==='video'?'mp4':item.media_type==='audio'?'mp3':'jpg');const filename=((title||'grapevine-media').replace(/[^a-z0-9._-]+/gi,'-')||'grapevine-media')+'.'+ext;if(window.GrapevineAndroid?.downloadMedia){window.GrapevineAndroid.downloadMedia(url,filename);return}try{const r=await fetch(url,{mode:'cors',cache:'no-store'});if(!r.ok)throw Error('Download failed');const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}catch{window.open(url,'_blank','noopener')}}
function admin(){if(!configured())return configView();if(!session)return adminLogin();if(!adminSession)return `<section class="card"><div class="eyebrow">SECURE ADMIN</div><h2>Checking administrator access…</h2><p>Your Supabase account is being checked against the <b>admins</b> table. A normal member account cannot enter the control centre.</p></section>`;return adminPanel()}
function configView(){return `<section class="card"><div class="eyebrow">FIRST-TIME SETUP</div><h2>Connect GRAPEVINE</h2><p>Enter your Supabase <b>Project URL</b> and <b>Publishable/anon key</b>. These are client-side values. <b>Never enter a service-role or secret key.</b></p><div class="field"><label>Supabase Project URL</label><input id="cfg-url" placeholder="https://your-project.supabase.co"></div><div class="field"><label>Publishable / anon key</label><textarea id="cfg-key" rows="4" placeholder="eyJ..."></textarea></div><button class="btn primary" onclick="saveConfig()">Connect Supabase</button><div class="notice">After connecting, the app will use Supabase Auth and database permissions instead of a device PIN.</div></section>`}
function adminLogin(){return `<section class="card"><div class="eyebrow">SECURE ADMIN LOGIN</div><h2>Administrator sign in</h2><p>Use the email and password of the account that was added to the Supabase <b>admins</b> table. There is no admin PIN stored in this APK.</p><div class="field"><label>Email</label><input id="login-email" type="email" autocomplete="username"></div><div class="field"><label>Password</label><input id="login-pass" type="password" autocomplete="current-password"></div><button class="btn primary" onclick="doAdminLogin()">Sign in securely</button><button class="btn light" onclick="go('home')">Cancel</button></section>`}
function adminPanel(){const pendingDownloads=(state.allDownloadRequests||[]).filter(r=>r.status==='pending').length;return `<div class="admin-head"><div><div class="eyebrow">ONLINE CONTROL CENTRE</div><h2>Admin Dashboard</h2><div class="small">${esc(session?.user?.email||'Administrator')}</div></div><button class="btn light" onclick="signout()">Sign out</button></div><section class="card admin-message-banner"><div class="eyebrow">ADMIN MESSAGES</div><h3>💬 Messages & Replies</h3><p>Member messages and administrator replies are available here.</p><button class="btn primary" onclick="adminSection('chat')">Open Messages & Replies</button></section><section class="admin-quick"><button class="admin-quick-card" onclick="adminSection('chat')"><b>💬 Messages & Replies</b><span>Read member messages and send replies directly.</span></button><button class="admin-quick-card" onclick="adminSection('gallery')"><b>⬇ Download Approvals</b><span>${pendingDownloads} request${pendingDownloads===1?'':'s'} waiting for review.</span></button></section><div class="admin-tabs">${['members','projects','skills','gallery','settings','chat'].map(t=>`<button class="btn ${route==='admin-'+t?'primary':'light'}" onclick="adminSection('${t}')">${t==='chat'?'Messages & Replies':t}</button>`).join('')}</div>${route==='admin-members'?adminMembers():route==='admin-projects'?adminCollection('projects','Project'):route==='admin-skills'?adminCollection('skills','Skill'):route==='admin-gallery'?adminCollection('gallery','Gallery item'):route==='admin-chat'?adminChat():adminSettings()}`}
function adminMembers(){const total=state.members.length,verified=state.members.filter(m=>m.verified).length;return `<section class="member-control"><div class="control-hero"><div><div class="eyebrow">ADMIN • MEMBER MANAGEMENT</div><h2>Member Control Centre</h2><p>Online changes apply to the shared GRAPEVINE database for every user.</p></div><button class="btn gold big" onclick="editMember()">＋ Add Member</button></div><div class="member-stats"><div class="stat-card"><strong>${total}</strong><span>Total Members</span></div><div class="stat-card"><strong>${verified}</strong><span>Verified</span></div><div class="stat-card"><strong>${total-verified}</strong><span>Unverified</span></div></div><div class="member-toolbar"><input id="memberSearchAdmin" placeholder="Search by member name or role" oninput="filterAdminMembers(this.value)"></div><div id="adminMemberList">${adminMemberRows(state.members)}</div></section>`}
function adminMemberRows(arr){return arr.map(m=>`<article class="admin-member-card"><div class="admin-member-info"><img class="admin-avatar profile-photo" data-profile-id="${esc(m.id)}" data-photo-url="${esc(m.photo||'')}" src="assets/grapevine-logo.jpg" onerror="this.src='assets/grapevine-logo.jpg'"><div><div class="admin-member-name">${esc(m.name||'Unnamed Member')} ${m.verified?verifiedBadge():'<span class="unverified">Not verified</span>'}</div><div class="small">${esc(m.role||'No role assigned')}</div></div></div><div class="admin-member-actions"><button class="btn ${m.verified?'light':'gold'}" onclick="verifyMember('${m.id}',${!m.verified})">${m.verified?'Remove Badge':'Give Verification Badge'}</button><button class="btn light" onclick="editMember('${m.id}')">Edit Member</button><button class="btn danger" onclick="removeMember('${m.id}')">Remove Member</button></div></article>`).join('')||'<div class="empty">No members found.</div>'}
function filterAdminMembers(q){const x=(q||'').toLowerCase(),el=document.getElementById('adminMemberList');if(el){el.innerHTML=adminMemberRows(state.members.filter(m=>(m.name+' '+m.role).toLowerCase().includes(x)));hydrateProfilePhotos().catch(()=>{})}}
function adminCollection(key,label){const isGallery=key==='gallery';const base=`<div class="actions"><button class="btn gold" onclick="${isGallery?'openGalleryUpload()':`editCollection('${key}')`}">+ Add ${label}</button></div><div>${state[key].map(x=>`<div class="row"><div><b>${esc(x.title)}</b><div class="small">${esc(x.description||x.image||'')} ${isGallery?`• ${x.approved?'Showcase approved':'Pending showcase approval'} ${mediaIcon(x.media_type||'image')}`:''}</div></div><div class="actions">${isGallery&&!x.approved?`<button class="btn gold" onclick="approveGallery('${x.id}')">Approve showcase</button>`:''}<button class="btn light" onclick="editCollection('${key}','${x.id}')">Edit</button><button class="btn danger" onclick="removeItem('${key}','${x.id}')">Remove</button></div></div>`).join('')}</div>`;return isGallery?base+adminDownloadRequests():base}
function adminDownloadRequests(){const list=Array.isArray(state.allDownloadRequests)?state.allDownloadRequests:[];return `<section class="card" style="margin-top:18px"><div class="eyebrow">DOWNLOAD APPROVALS</div><h3>Member download requests</h3><p class="small">Approve or reject individual member requests. Approval unlocks the Download button for that member only.</p>${list.length?list.map(r=>{const item=state.gallery.find(g=>String(g.id)===String(r.content_id));return `<div class="row"><div><b>${esc(item?.title||'Gallery media')}</b><div class="small">Member: ${esc(r.requester_name||r.requester_id||'Unknown')} • ${esc(r.status)}</div></div><div class="actions">${r.status==='pending'?`<button class="btn gold" onclick="reviewDownloadRequest('${r.id}','approved')">Approve download</button><button class="btn danger" onclick="reviewDownloadRequest('${r.id}','rejected')">Reject</button>`:''}</div></div>`}).join(''):'<div class="empty">No download requests yet.</div>'}</section>`}
async function loadDownloadRequests(){if(!adminSession){state.allDownloadRequests=[];return}try{const rows=await dbGet('download_requests','select=id,content_id,requester_id,status,requested_at,reviewed_at&order=requested_at.desc');const profiles=await dbGet('profiles','select=id,name');const names=new Map((Array.isArray(profiles)?profiles:[]).map(p=>[String(p.id),p.name||'Member']));state.allDownloadRequests=(Array.isArray(rows)?rows:[]).map(r=>({...r,requester_name:names.get(String(r.requester_id))||r.requester_id||'Member'}))}catch{state.allDownloadRequests=[]}}
async function reviewDownloadRequest(id,status){try{if(!adminSession)throw Error('Administrator session required');const rows=await dbPatch('download_requests','id=eq.'+encodeURIComponent(id),{status,reviewed_by:session.user.id,reviewed_at:new Date().toISOString()});if(!Array.isArray(rows)||!rows.length)throw Error('Download request was not changed');await sync();await loadDownloadRequests();render();toast(status==='approved'?'Download approved for the member':'Download request rejected')}catch(e){toast(friendly(e))}}
async function approveGallery(id){try{if(!adminSession)throw Error('Administrator session required');const rows=await dbPatch('content_items','id=eq.'+encodeURIComponent(id),{approved:true});if(!Array.isArray(rows)||!rows.length)throw Error('Showcase approval failed');await sync();render();toast('Gallery media approved for viewing')}catch(e){toast(friendly(e))}}
function adminSettings(){const s=state.settings;return `<div class="card"><h3>App-wide settings</h3>${['name','motto','description','email','phone','location'].map(k=>`<div class="field"><label>${k}</label><input id="set-${k}" value="${esc(s[k]||'')}"></div>`).join('')}<button class="btn primary" onclick="saveSettings()">Save changes online</button><button class="btn light" onclick="showConfigChange()">Change Supabase connection</button></div>`}
function chat(){if(!configured())return `<section class="card"><h2>Chat</h2><p>Connect Supabase first to use secure online chat.</p></section>`;if(!session)return chatLogin();return `<section class="card"><div class="eyebrow">GRAPEVINE CHAT</div><h2>Chat with the team</h2><p>Send a message to the GRAPEVINE administrators.</p><div id="chatMessages" class="chat-box"><div class="empty">Loading messages…</div></div><div class="field"><textarea id="chatInput" rows="3" placeholder="Write your message…"></textarea></div><button class="btn primary" onclick="sendChat(false)">Send message</button><button class="btn light" onclick="signout()">Sign out</button></section>`}
function confirmationHelp(email=''){const e=String(email||localStorage.getItem(PENDING_CONFIRM_KEY)||'').trim();return `<div class="notice confirmation-box"><b>📧 Email confirmation required</b><p class="small">${e?`We sent the confirmation link to <b>${esc(e)}</b>.`: 'Check the email address you used to register.'} Check Inbox, Spam/Junk and Promotions.</p><div class="actions"><button class="btn gold" onclick="openEmailApp()">Open Email App</button><button class="btn light" onclick="resendConfirmation()">Resend confirmation</button></div><p class="small">If no message arrives after resending, the Supabase project must have a working SMTP/email provider configured. The app cannot deliver an email by itself.</p></div>`}

function chatLogin(){const pending=localStorage.getItem(PENDING_CONFIRM_KEY)||'';return `<section class="card"><div class="eyebrow">MEMBER CHAT</div><h2>Sign in to chat</h2><p>Use your GRAPEVINE member email and password. New members must confirm their email before signing in.</p>${pending?confirmationHelp(pending):''}<div class="field"><label>Email</label><input id="chat-email" type="email" autocomplete="username" value="${esc(pending)}"></div><div class="field"><label>Password</label><input id="chat-pass" type="password" autocomplete="current-password"></div><button class="btn primary" onclick="doChatLogin()">Sign in</button><button class="btn gold" onclick="showMemberSignup()">Create member account</button><button class="btn light" onclick="resendConfirmation()">Resend confirmation email</button><div class="notice">This is a normal email/password account. GRAPEVINE does not use anonymous sign-in for member chat.</div></section>`}
async function loadChat(){if(!session)return;try{const rows=await dbGet('chat_messages','select=id,sender_id,sender_name,message,is_admin,created_at&order=created_at.asc&limit=100');const el=document.getElementById('chatMessages');if(el)el.innerHTML=rows.map(m=>`<div class="chat-msg ${m.sender_id===session.user.id?'mine':''}"><b>${esc(m.sender_name||'User')}${m.is_admin?' • Admin':''}</b><p>${esc(m.message)}</p><small>${new Date(m.created_at).toLocaleString()}</small></div>`).join('')||'<div class="empty">No messages yet.</div>'}catch(e){const el=document.getElementById('chatMessages');if(el)el.innerHTML='<div class="notice">Chat could not be loaded. Check your connection.</div>'}}
function adminChat(){return `<section class="card"><div class="eyebrow">ADMIN • CHAT</div><h2>Member messages</h2><p class="small">Read member messages and reply directly from this section.</p><div id="chatMessages" class="chat-box"><div class="empty">Loading messages…</div></div><div class="field"><input id="chatReplyName" value="GRAPEVINE Admin" placeholder="Admin display name"></div><div class="field"><textarea id="chatInput" rows="3" placeholder="Write your reply to members…"></textarea></div><div class="actions"><button class="btn primary" onclick="sendChat(true)">Send Reply</button><button class="btn light" onclick="loadChat()">Refresh Messages</button></div></section>`}
async function sendChat(isAdmin){const input=document.getElementById('chatInput');const message=input?.value.trim();if(!message)return toast('Write a message first');try{await dbInsert('chat_messages',{sender_id:session.user.id,sender_name:isAdmin?(document.getElementById('chatReplyName')?.value.trim()||'GRAPEVINE Admin'):(session.user.email||'Member'),message,is_admin:isAdmin});input.value='';await loadChat();toast('Message sent')}catch(e){toast('Message failed: '+friendly(e))}}
async function doChatLogin(){try{adminSession=false;const email=document.getElementById('chat-email').value;const pass=document.getElementById('chat-pass').value;await login(email,pass);route='chat';render();await loadChat();toast('Signed in successfully')}catch(e){toast(friendly(e))}}
function showMemberSignup(){document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="signupModal"><div class="sheet"><div class="eyebrow">NEW GRAPEVINE MEMBER</div><h2>Create member account</h2><p class="small">Create your email/password account to use member chat. No anonymous sign-in is used.</p><div class="field"><label>Full name</label><input id="signup-name" autocomplete="name" placeholder="Your full name"></div><div class="field"><label>Email</label><input id="signup-email" type="email" autocomplete="email" placeholder="name@example.com"></div><div class="field"><label>Password</label><input id="signup-pass" type="password" autocomplete="new-password" placeholder="At least 6 characters"></div><div class="field"><label>Confirm password</label><input id="signup-pass2" type="password" autocomplete="new-password"></div><div class="actions"><button class="btn light" onclick="document.getElementById('signupModal').remove()">Cancel</button><button class="btn primary" onclick="doChatSignup()">Create account</button></div></div></div>`)}
async function doChatSignup(){try{const name=document.getElementById('signup-name').value.trim();const email=document.getElementById('signup-email').value.trim().toLowerCase();const pass=document.getElementById('signup-pass').value;const pass2=document.getElementById('signup-pass2').value;if(pass!==pass2)throw Error('Passwords do not match');const x=await signup(name,email,pass);document.getElementById('signupModal')?.remove();if(x.access_token){localStorage.removeItem(PENDING_CONFIRM_KEY);route='chat';render();await loadChat();toast('Account created. You are signed in.')}else{localStorage.setItem(PENDING_CONFIRM_KEY,email);route='chat';render();toast('Confirmation email sent. Check Inbox, Spam/Junk or Promotions.')}}catch(e){toast(friendly(e))}}
async function resendConfirmation(givenEmail){const email=(givenEmail||document.getElementById('chat-email')?.value||localStorage.getItem(PENDING_CONFIRM_KEY)||'').trim().toLowerCase();if(!email)return toast('Enter your email first');try{const r=await fetch(cfg.url.replace(/\/$/,'')+'/auth/v1/resend',{method:'POST',headers:headers(),body:JSON.stringify({type:'signup',email,options:{email_redirect_to:'grapevine://auth-callback'}})});const x=await r.json().catch(()=>({}));if(!r.ok)throw Error(x.msg||x.error_description||x.message||'Could not resend confirmation email');localStorage.setItem(PENDING_CONFIRM_KEY,email);toast('Confirmation email resent. Check Inbox, Spam/Junk or Promotions.')}catch(e){toast(friendly(e))}}
function openEmailApp(){if(window.GrapevineAndroid?.openEmail){window.GrapevineAndroid.openEmail();return}try{window.location.href='mailto:'}catch{toast('Open your email app and check Inbox, Spam/Junk or Promotions.')}}
async function doAdminLogin(){try{await login(document.getElementById('login-email').value.trim(),document.getElementById('login-pass').value);if(!(await isAdmin())){await signout();throw Error('This account is not an authorized GRAPEVINE administrator.')}adminSession=true;route='admin-members';await sync();render();toast('Secure admin access granted')}catch(e){toast(friendly(e))}}
function friendly(e){try{const x=JSON.parse(e.message);return x.message||x.hint||e.message}catch{return e.message||'Something went wrong'}}
async function saveConfig(){const url=document.getElementById('cfg-url').value.trim();const key=document.getElementById('cfg-key').value.trim();await saveConfigValues(url,key)}
function showConfigChange(){document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="sheet"><h2>Supabase connection</h2><p>Use only the Project URL and publishable/anon key. Never use a service-role/secret key.</p><div class="field"><label>Project URL</label><input id="cfg-url" value="${esc(cfg.url)}"></div><div class="field"><label>Publishable / anon key</label><textarea id="cfg-key" rows="4">${esc(cfg.key)}</textarea></div><div class="actions"><button class="btn light" onclick="document.getElementById('modal').remove()">Cancel</button><button class="btn primary" onclick="saveConfigFromModal()">Save</button></div></div></div>`)}
async function saveConfigFromModal(){const url=document.getElementById('cfg-url').value.trim();const key=document.getElementById('cfg-key').value.trim();document.getElementById('modal').remove();await saveConfigValues(url,key)}
async function saveConfigValues(url,key){url=url.replace(/\/$/,'');if(!/^https:\/\/[^ ]+$/i.test(url)||!key)return toast('Enter a valid Supabase Project URL and publishable/anon key');cfg={url,key};localStorage.setItem(CFG_KEY,JSON.stringify(cfg));toast('Supabase connection saved');await sync();render()}
async function adminSection(k){if(!adminSession){route='admin';render();return}route='admin-'+k;if(k==='gallery')await loadDownloadRequests();render();if(k==='chat')loadChat()}
async function verifyMember(id,v){try{if(!session?.access_token||!adminSession)throw Error('Admin session required');const rows=await dbPatch('profiles','id=eq.'+encodeURIComponent(id),{verified:v,verified_at:v?new Date().toISOString():null});if(!Array.isArray(rows)||rows.length===0)throw Error('The member was not changed. Check that this account is an administrator.');const m=state.members.find(x=>String(x.id)===String(id));if(m){m.verified=v;save()}render();toast(v?'✓ Verification badge granted online':'Verification badge removed online')}catch(e){toast(friendly(e))}}
async function removeMember(id){const m=state.members.find(x=>String(x.id)===String(id));if(!m||!confirm('Remove '+(m.name||'this member')+' from GRAPEVINE?'))return;try{await dbDelete('profiles','id=eq.'+encodeURIComponent(id));await sync();render();toast('Member removed online')}catch(e){toast(friendly(e))}}
async function editMember(id){const m=id?state.members.find(x=>String(x.id)===String(id)):null;const item=m?{...m}:{id:null,name:'',role:'Software Engineering Team',bio:'',skills:[],verified:false,photo:''};openMemberForm(id?'Edit Member':'Add New Member',item,async x=>{try{const row={name:x.name,role:x.role,bio:x.bio,skills:(x.skills||[]).join(', '),photo_url:x.photo||null,verified:!!x.verified,verified_at:x.verified?new Date().toISOString():null};if(id)await dbPatch('profiles','id=eq.'+encodeURIComponent(id),row);else await dbInsert('profiles',row);await sync();render();toast('Member saved online')}catch(e){toast(friendly(e))}})}
function openMemberForm(title,item,done){document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="sheet"><h2>${title}</h2><div class="field"><label>Name</label><input id="f-name" value="${esc(item.name)}"></div><div class="field"><label>Role</label><input id="f-role" value="${esc(item.role)}"></div><div class="field"><label>Bio</label><textarea id="f-bio">${esc(item.bio)}</textarea></div><div class="field"><label>Skills (comma separated)</label><input id="f-skills" value="${esc((item.skills||[]).join(', '))}"></div><div class="field"><label>Profile photo</label><div class="photo-picker"><img id="photo-preview" class="form-photo-preview" src="${esc(item.photo||'assets/grapevine-logo.jpg')}" onerror="this.src='assets/grapevine-logo.jpg'"><div><label class="photo-file-label" for="f-photo-file"><span class="photo-file-icon">📷</span><span>Choose / Upload Photo</span></label><input id="f-photo-file" class="native-photo-input" type="file" accept="image/*" aria-label="Choose member photo" onchange="previewMemberPhoto(this)"><div class="photo-help">Tap “Choose / Upload Photo” to open the phone gallery.</div><input id="f-photo" value="${esc(item.photo||'')}" placeholder="Photo URL (optional)" style="margin-top:8px"></div></div></div><div class="field"><label>Verification Badge</label><select id="f-verified"><option value="false" ${!item.verified?'selected':''}>Not Verified</option><option value="true" ${item.verified?'selected':''}>Verified ✓ — Give Badge</option></select></div><div class="actions"><button class="btn light" onclick="document.getElementById('modal').remove()">Cancel</button><button class="btn primary" onclick="submitMemberForm()">Save</button></div></div></div>`);window._memberForm={item,done}}
function previewMemberPhoto(input){const file=input.files&&input.files[0];if(!file)return;const img=document.getElementById('photo-preview');if(img){if(img._previewUrl)URL.revokeObjectURL(img._previewUrl);img._previewUrl=URL.createObjectURL(file);img.src=img._previewUrl}}
async function submitMemberForm(){
  const {item,done}=window._memberForm;
  item.name=document.getElementById('f-name').value.trim();
  item.role=document.getElementById('f-role').value.trim();
  item.bio=document.getElementById('f-bio').value.trim();
  item.skills=document.getElementById('f-skills').value.split(',').map(x=>x.trim()).filter(Boolean);
  item.verified=document.getElementById('f-verified').value==='true';
  const fileInput=document.getElementById('f-photo-file');
  const file=fileInput?.files?.[0]||null;
  try{
    if(file){
      if(!session?.user?.id)throw Error('Admin session expired');
      if(!file.type||!file.type.startsWith('image/'))throw Error('Please choose an image file');
      if(file.size>8*1024*1024)throw Error('Photo is too large (maximum 8 MB)');

      // Keep the selected image immediately in the device cache. This means the
      // new photo remains available even if the app goes offline after saving.
      if(item.id)await photoPut(item.id,'',file);

      const safe=file.name.toLowerCase().replace(/[^a-z0-9._-]/g,'-')||'profile.jpg';
      const memberId=item.id||uid();
      const path=memberId+'/'+Date.now()+'-'+safe;
      const base=cfg.url.replace(/\/$/,'');
      const r=await fetch(base+'/storage/v1/object/member-photos/'+path,{
        method:'POST',
        headers:headers({'x-upsert':'true','Content-Type':file.type,'Cache-Control':'3600'}),
        body:file
      });
      if(!r.ok){
        const detail=await r.text().catch(()=> '');
        throw Error(detail||('Photo upload failed (HTTP '+r.status+')'));
      }
      item.photo=base+'/storage/v1/object/public/member-photos/'+path+'?v='+Date.now();

      // Replace the temporary cache entry with the final public URL.
      if(item.id)await photoPut(item.id,item.photo,file);
    }else{
      item.photo=document.getElementById('f-photo').value.trim();
    }

    document.getElementById('modal').remove();
    await done(item);
  }catch(e){
    toast('Photo/save failed: '+friendly(e));
  }
}
async function removeItem(key,id){if(!confirm('Remove this item?'))return;try{await dbDelete('content_items','id=eq.'+encodeURIComponent(id));await sync();render()}catch(e){toast(friendly(e))}}
async function editCollection(key,id){const existing=id?state[key].find(x=>String(x.id)===String(id)):null;const item=existing?{...existing}:{id:null,title:'',description:'',tags:[],image:''};const kind=key==='projects'?'project':key==='skills'?'skill':'gallery';openContentForm('Edit '+key.slice(0,-1),item,kind,async x=>{try{const row={kind,title:x.title,description:x.description||'',tags:x.tags||[],image_url:x.image||null};if(id)await dbPatch('content_items','id=eq.'+encodeURIComponent(id),row);else await dbInsert('content_items',row);await sync();render()}catch(e){toast(friendly(e))}})}
function openGalleryUpload(){if(!session?.user?.id)return go('chat');const item={id:null,title:'',description:'',tags:[],image:''};document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="sheet"><div class="eyebrow">GALLERY SHOWCASE</div><h2>Upload Media</h2><p class="small">Choose one or more images, videos or audio files. ${adminSession?'Administrator uploads are published immediately.':'Member uploads are held for administrator approval.'}</p><div class="field"><label>Title</label><input id="f-title" placeholder="Showcase title"></div><div class="field"><label>Description</label><textarea id="f-description" placeholder="Describe this media"></textarea></div><div class="field"><label>Media files</label><input id="f-gallery-file" class="gallery-file-input" type="file" accept="image/*,video/*,audio/*" multiple aria-label="Choose gallery media"><div class="photo-help">Tap the file box to choose from your phone. Multiple files are supported.</div><div id="gallery-file-list" class="small"></div></div><div class="actions"><button class="btn light" onclick="document.getElementById('modal').remove()">Cancel</button><button class="btn primary" onclick="submitContentForm()">Upload Media</button></div></div></div>`);window._contentForm={item,done:null,kind:'gallery'};document.getElementById('f-gallery-file').addEventListener('change',function(){const files=[...this.files];document.getElementById('gallery-file-list').innerHTML=files.length?files.map(f=>`<div>✓ ${esc(f.name)} • ${mediaIcon(mediaKind(f))} • ${(f.size/1024/1024).toFixed(1)} MB</div>`).join(''):'No files selected.'})}
function openContentForm(title,item,kind,done){document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="sheet"><h2>${title}</h2><div class="field"><label>Title</label><input id="f-title" value="${esc(item.title)}"></div><div class="field"><label>Description</label><textarea id="f-description">${esc(item.description||'')}</textarea></div><div class="field"><label>Tags</label><input id="f-tags" value="${esc((item.tags||[]).join(', '))}"></div>${kind==='gallery'?`<div class="field"><label>Showcase image</label><input id="f-gallery-file" class="gallery-file-input" type="file" accept="image/*,video/*,audio/*" multiple><div class="photo-help">Choose image, video or audio media.</div><div id="gallery-file-list" class="small"></div></div>`:''}<div class="actions"><button class="btn light" onclick="document.getElementById('modal').remove()">Cancel</button><button class="btn primary" onclick="submitContentForm()">Save</button></div></div></div>`);window._contentForm={item,done,kind};if(kind==='gallery')document.getElementById('f-gallery-file').addEventListener('change',function(){const files=[...this.files];document.getElementById('gallery-file-list').innerHTML=files.map(f=>`<div>✓ ${esc(f.name)} • ${mediaIcon(mediaKind(f))}</div>`).join('')})}
function previewGalleryImage(input){const file=input.files&&input.files[0];if(!file)return;const img=document.getElementById('gallery-preview');if(img){if(img._previewUrl)URL.revokeObjectURL(img._previewUrl);img._previewUrl=URL.createObjectURL(file);img.src=img._previewUrl}}
async function submitContentForm(){
  const {item,done,kind}=window._contentForm||{};
  item.title=(document.getElementById('f-title')?.value||'Showcase media').trim();
  item.description=(document.getElementById('f-description')?.value||'').trim();
  item.tags=(document.getElementById('f-tags')?.value||'').split(',').map(x=>x.trim()).filter(Boolean);
  try{
    if(kind==='gallery'){
      if(!session?.user?.id)throw Error('Please sign in before uploading media');
      const input=document.getElementById('f-gallery-file');const files=[...(input?.files||[])];
      if(!files.length)throw Error('Choose at least one image, video or audio file');
      for(const file of files){
        if(!/^(image|video|audio)\//i.test(file.type||''))throw Error('Unsupported file: '+file.name);
        if(file.size>50*1024*1024)throw Error(file.name+' is larger than 50 MB');
        if(online()){
          const tempId='upload-'+uid();
          const uploaded={id:tempId,title:item.title||file.name,description:item.description,image:'',tags:item.tags,media_type:mediaKind(file),approved:!!adminSession};
          await uploadGalleryBlob(uploaded,file,!!adminSession);
          const rows=await dbInsert('content_items',{kind:'gallery',title:uploaded.title,description:uploaded.description,tags:uploaded.tags||[],image_url:uploaded.image,media_type:uploaded.media_type,approved:!!adminSession,uploaded_by:session.user.id});
          if(!Array.isArray(rows)||!rows[0]?.id)throw Error('Media uploaded but could not be saved to GRAPEVINE');
          await galleryPut({id:rows[0].id,url:uploaded.image,title:uploaded.title,description:uploaded.description,media_type:uploaded.media_type,approved:!!adminSession},file,false);
          await galleryDelete(tempId);
        }else{
          const offlineId='offline-'+uid();
          await galleryPut({id:offlineId,url:'',title:item.title||file.name,description:item.description,media_type:mediaKind(file),approved:false},file,true);
        }
      }
      document.getElementById('modal')?.remove();
      await sync();
      render();
      toast(online()?(adminSession?'Media uploaded and published.':'Media uploaded. Waiting for administrator showcase approval.'):'Media saved on this device. It will upload when you are online.');
      return;
    }
    if(done){document.getElementById('modal')?.remove();await done(item);render()}
  }catch(e){toast('Gallery upload failed: '+friendly(e))}
}
async function saveSettings(){const s={...state.settings};for(const k of Object.keys(s)){const el=document.getElementById('set-'+k);if(el)s[k]=el.value.trim()}try{await dbPatch('site_settings','id=eq.1',{settings:s});await sync();render();toast('Settings saved online')}catch(e){toast(friendly(e))}}
async function go(r){route=r;render();if(r==='chat'){if(session)loadChat();if(chatTimer)clearInterval(chatTimer);if(session)chatTimer=setInterval(loadChat,8000)}else if(chatTimer){clearInterval(chatTimer);chatTimer=null}if(configured()&&r!=='admin')sync()}
function toast(msg){let t=document.getElementById('toast');if(!t){t=document.createElement('div');t.id='toast';Object.assign(t.style,{position:'fixed',left:'16px',right:'16px',bottom:'82px',zIndex:50,background:'#111827',color:'#fff',padding:'12px 14px',borderRadius:'12px',textAlign:'center'});document.body.appendChild(t)}t.textContent=msg;setTimeout(()=>t.remove(),2800)}
async function init(){render();if(configured()){if(session){try{adminSession=await isAdmin();}catch{adminSession=false}}await sync();if(adminSession)await loadDownloadRequests();render()}}
init();
