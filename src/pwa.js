import './pwa.css';

export function initializePWA({beforeUpdate}={}){
  const $=id=>document.getElementById(id);
  let installPrompt=null, registration=null, reloadOnUpdate=false, installedByEvent=false;
  const installed=()=>installedByEvent||window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const android=/Android/i.test(navigator.userAgent);
  function installationState(){
    $('install-app').hidden=installed();
    $('install-now').hidden=!installPrompt||installed();
    $('installation-copy').textContent=installed()?'MiniBCR est ouvert comme une application sur cet appareil.':ios
      ?'Ouvrez ce site dans Safari, puis Partager → Sur l’écran d’accueil. Activez « Ouvrir comme app web » si cette option apparaît, puis touchez Ajouter.'
      :android?'Ouvrez ce site dans Chrome. Touchez Installer ci-dessous si le bouton est proposé, ou utilisez le menu ⋮ → Installer l’application / Ajouter à l’écran d’accueil.'
        :'Utilisez Installer ci-dessous si le navigateur le propose, ou son menu d’installation. Sur téléphone, ouvrez le lien du site dans Safari ou Chrome.';
  }
  function networkState(){
    $('pwa-network').textContent=navigator.onLine?'Connexion disponible':'Vous êtes hors connexion';
  }
  function send(type,onProgress){
    return new Promise((resolve,reject)=>{
      const worker=registration?.active;
      if(!worker){reject(new Error('L’application n’est pas encore prête. Réessayez dans un instant.'));return;}
      const channel=new MessageChannel();
      let timeout;
      const resetTimeout=()=>{clearTimeout(timeout);timeout=setTimeout(()=>{channel.port1.close();reject(new Error('Préparation trop longue. Vérifiez la connexion puis réessayez.'));},180000);};
      resetTimeout();
      channel.port1.onmessage=event=>{
        const message=event.data;
        if(message.type==='progress'){resetTimeout();onProgress?.(message.progress);return;}
        clearTimeout(timeout);channel.port1.close();
        if(message.type==='error')reject(new Error(message.message));else resolve(message);
      };
      worker.postMessage({type},[channel.port2]);
    });
  }
  async function refreshOfflineStatus(){
    try{
      const status=await send('STATUS');
      $('offline-ocr').disabled=status.ready;
      $('offline-ocr').textContent=status.ready?'Scan hors connexion prêt':`Préparer le scan hors connexion (${Math.ceil(status.bytes/1024/1024)} Mo)`;
      $('offline-ocr-status').textContent=status.ready?'Le moteur de scan est disponible sur cet appareil.':'Téléchargez le moteur une fois pour scanner aussi sans réseau. Les photos restent sur cet appareil.';
    }catch(error){$('offline-ocr-status').textContent=error.message;}
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;installationState();});
  window.addEventListener('appinstalled',()=>{installedByEvent=true;installPrompt=null;installationState();$('installation-copy').textContent='MiniBCR a été installé. Retrouvez son icône sur votre appareil.';});
  $('install-app').addEventListener('click',()=>{installationState();$('install-dialog').showModal();});
  $('close-install').addEventListener('click',()=>$('install-dialog').close());
  $('install-now').addEventListener('click',async()=>{
    if(!installPrompt)return;
    const prompt=installPrompt;installPrompt=null;
    try{
      await prompt.prompt();const choice=await prompt.userChoice;
      $('installation-copy').textContent=choice.outcome==='accepted'?'Installation demandée. Le navigateur vous indiquera quand l’application sera prête.':'Installation annulée. Vous pourrez réessayer depuis le menu de votre navigateur.';
    }catch{$('installation-copy').textContent='Utilisez le menu de votre navigateur pour ajouter MiniBCR à l’écran d’accueil.';}
    $('install-now').hidden=true;
  });
  $('offline-ocr').addEventListener('click',async()=>{
    $('offline-ocr').disabled=true;$('offline-progress').hidden=false;$('offline-progress').value=0;
    $('offline-ocr-status').textContent='Téléchargement du moteur sur cet appareil… Gardez cette fenêtre ouverte.';
    try{await send('PREPARE_OCR',progress=>{$('offline-progress').value=progress;});await refreshOfflineStatus();}
    catch(error){$('offline-ocr-status').textContent=`Préparation incomplète : ${error.message} Vous pouvez réessayer ; les fichiers déjà reçus seront conservés.`;$('offline-ocr').disabled=false;}
    finally{$('offline-progress').hidden=true;}
  });
  $('apply-update').addEventListener('click',async()=>{
    if(!registration?.waiting)return;
    $('apply-update').disabled=true;
    try{await beforeUpdate?.();reloadOnUpdate=true;registration.waiting.postMessage({type:'APPLY_UPDATE'});}
    catch{$('update-status').textContent='La sauvegarde n’a pas pu être terminée. Fermez la fiche ou sauvegardez le catalogue avant de réessayer.';$('apply-update').disabled=false;}
  });
  function waitingUpdate(){if(registration?.waiting){$('pwa-update').hidden=false;}}
  window.addEventListener('online',networkState);window.addEventListener('offline',networkState);
  installationState();networkState();
  $('offline-ocr').disabled=true;
  if(!import.meta.env.PROD){
    $('offline-app-status').textContent='L’installation et le mode hors connexion sont disponibles dans la version construite et publiée du site.';
    $('offline-ocr-status').textContent='Cet aperçu de développement ne prépare pas le fonctionnement hors connexion.';
    return;
  }
  if(!('serviceWorker'in navigator)){
    $('offline-app-status').textContent='Ce navigateur ne permet pas de préparer le mode hors connexion. Essayez Safari ou Chrome.';return;
  }
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloadOnUpdate)location.reload();});
  const root=new URL(import.meta.env.BASE_URL,document.baseURI);
  navigator.serviceWorker.register(new URL('sw.js',root),{scope:root.pathname,updateViaCache:'none'}).then(async result=>{
    registration=result;waitingUpdate();
    registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      worker?.addEventListener('statechange',()=>{if(worker.state==='installed')waitingUpdate();});
    });
    let readinessTimeout;
    try{await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{readinessTimeout=setTimeout(()=>reject(new Error('Préparation interrompue.')),30000);})]);}
    finally{clearTimeout(readinessTimeout);}
    $('offline-app-status').textContent='Application et catalogue disponibles hors connexion sur cet appareil.';
    await refreshOfflineStatus();
  }).catch(()=>{
    $('offline-app-status').textContent='La préparation hors connexion a échoué. Vérifiez la connexion et rechargez le site.';
    $('offline-ocr-status').textContent='Le catalogue local reste enregistré, mais le site doit encore être disponible pour l’ouvrir.';
  });
}
