const CONFIG = /* PWA_CONFIG */;
const ROOT = self.registration.scope;
const PREFIX = `minibcr:${ROOT}:`;
const APP_CACHE = `${PREFIX}app:${CONFIG.version}`;
const OCR_CACHE = `${PREFIX}ocr:${CONFIG.ocrVersion}`;
const absolute = path => new URL(path,ROOT).href;
const shellURLs = new Set(CONFIG.shell.map(absolute));
const ocrURLs = new Set(CONFIG.ocr.map(absolute));

self.addEventListener('install',event=>{
  // Keep a new release waiting until the user chooses to apply it.
  event.waitUntil(caches.open(APP_CACHE).then(cache=>cache.addAll(CONFIG.shell.map(absolute))));
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    // Keep one previous app release for tabs that are still using its hashed JS.
    const appCaches=names.filter(name=>name.startsWith(`${PREFIX}app:`));
    const keep=new Set([APP_CACHE,...appCaches.filter(name=>name!==APP_CACHE).slice(-1)]);
    await Promise.all(appCaches.filter(name=>!keep.has(name)).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||!request.url.startsWith(ROOT))return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(APP_CACHE);
      const shell=await cache.match(absolute('index.html'));
      return shell||fetch(request);
    })());
    return;
  }
  const url=new URL(request.url);url.search='';
  if(!shellURLs.has(url.href)&&!ocrURLs.has(url.href)){
    if(url.href.startsWith(absolute('assets/')))event.respondWith(caches.match(url.href).then(cached=>cached||fetch(request)));
    return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(ocrURLs.has(url.href)?OCR_CACHE:APP_CACHE);
    const cached=await cache.match(url.href);
    if(cached)return cached;
    // An older live tab can still fetch its release's assets offline.
    const previous=await caches.match(url.href);
    if(previous)return previous;
    const response=await fetch(request);
    if(response.ok)await cache.put(url.href,response.clone());
    return response;
  })());
});

async function offlineStatus(){
  const cache=await caches.open(OCR_CACHE);
  const present=await Promise.all(CONFIG.ocr.map(path=>cache.match(absolute(path))));
  return {ready:present.every(Boolean),bytes:CONFIG.ocrBytes};
}
self.addEventListener('message',event=>{
  const port=event.ports[0];
  if(event.data?.type==='APPLY_UPDATE'){self.skipWaiting();return;}
  if(!port)return;
  event.waitUntil((async()=>{
    try{
      if(event.data?.type==='STATUS'){port.postMessage({type:'status',...await offlineStatus()});return;}
      if(event.data?.type!=='PREPARE_OCR')return;
      const cache=await caches.open(OCR_CACHE);
      for(const [index,path] of CONFIG.ocr.entries()){
        const url=absolute(path);
        if(!await cache.match(url)){
          const response=await fetch(url,{cache:'reload'});
          if(!response.ok)throw new Error('Un fichier du moteur est indisponible.');
          await cache.put(url,response);
        }
        port.postMessage({type:'progress',progress:Math.round((index+1)/CONFIG.ocr.length*100)});
      }
      port.postMessage({type:'complete',...await offlineStatus()});
    }catch(error){port.postMessage({type:'error',message:error.message||'Téléchargement impossible.'});}
  })());
});
