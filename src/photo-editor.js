import { fullFrame, validCorners, rectifyPhoto, detectCorners } from './photo.js';
import { resizeImage } from './recognition.js';

export function createPhotoEditor(onApply) {
  const $=id=>document.getElementById(id), dialog=$('photo-dialog'), stage=$('crop-stage');
  let source, originalSource, rotation=0, points, processed=null, busy=false, request=0;
  const handles=[...stage.querySelectorAll('.crop-handle')];
  function redraw() {
    $('crop-polygon').setAttribute('points',points.map(p=>`${p.x*100},${p.y*100}`).join(' '));
    handles.forEach((handle,i)=>{handle.style.left=`${points[i].x*100}%`;handle.style.top=`${points[i].y*100}%`;handle.setAttribute('aria-label',`${['Coin haut gauche','Coin haut droit','Coin bas droit','Coin bas gauche'][i]}, ${Math.round(points[i].x*100)} %, ${Math.round(points[i].y*100)} %`);});
    processed=null; $('photo-result').hidden=true;
  }
  function setBusy(value) { busy=value; dialog.querySelectorAll('button,input,select').forEach(control=>{control.disabled=value;}); }
  async function renderPhoto() {
    if(busy) return null;
    if(!validCorners(points)) {$('photo-status').textContent='Les coins ne doivent pas se croiser. Entourez la carte dans le sens des aiguilles d’une montre.';return null;}
    const job=++request;
    setBusy(true);$('photo-status').textContent='Redressement et préparation de la photo…';
    try {
      const image=await rectifyPhoto(source,points,{enhance:$('enhance-photo').checked,ratio:$('photo-ratio').value});
      if(job!==request) return null;
      processed=image;$('photo-result-image').src=image;$('photo-result').hidden=false;
      $('photo-status').textContent='Vérifiez que toute la carte est visible et que ses couleurs sont fidèles.';
      return image;
    } catch(error) {$('photo-status').textContent=error.message;return null;}
    finally{setBusy(false);}
  }
  handles.forEach((handle,index)=>{
    handle.addEventListener('pointerdown',event=>{if(busy)return;event.preventDefault();handle.setPointerCapture(event.pointerId);});
    handle.addEventListener('pointermove',event=>{
      if(busy || !handle.hasPointerCapture(event.pointerId))return;
      const bounds=stage.getBoundingClientRect();
      points[index]={x:Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width)),y:Math.max(0,Math.min(1,(event.clientY-bounds.top)/bounds.height))};redraw();
    });
    handle.addEventListener('keydown',event=>{
      const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!delta||busy)return;
      event.preventDefault();const step=event.shiftKey ? .001 : .01;
      points[index]={x:Math.max(0,Math.min(1,points[index].x+delta[0]*step)),y:Math.max(0,Math.min(1,points[index].y+delta[1]*step))};redraw();
    });
  });
  $('reset-crop').addEventListener('click',()=>{points=fullFrame();redraw();$('photo-status').textContent='Cadrage réinitialisé sur toute la photo.';});
  $('detect-crop').addEventListener('click',async()=>{
    setBusy(true);try{const proposed=await detectCorners(source);points=proposed||fullFrame();redraw();$('photo-status').textContent=proposed?'Cadrage proposé : ajustez les quatre coins avant de valider.':'Bords difficiles à distinguer. Placez les quatre coins à la main.';}catch{$('photo-status').textContent='Détection indisponible. Ajustez les coins à la main.';}finally{setBusy(false);}
  });
  $('preview-photo').addEventListener('click',renderPhoto);
  $('rotate-source').addEventListener('click',async()=>{
    setBusy(true);
    try{rotation=(rotation+90)%360;source=rotation?await resizeImage(originalSource,rotation):originalSource;$('crop-image').src=source;points=fullFrame();redraw();$('photo-status').textContent='Photo tournée. Ajustez les coins de la carte.';}
    catch{$('photo-status').textContent='Impossible de pivoter cette photo.';}
    finally{setBusy(false);}
  });
  for(const id of ['enhance-photo','photo-ratio']) $(id).addEventListener('change',()=>{processed=null;$('photo-result').hidden=true;});
  $('apply-photo').addEventListener('click',async()=>{
    const image=processed||await renderPhoto();if(!image)return;
    onApply(image,{corners:structuredClone(points),rotation,enhance:$('enhance-photo').checked,ratio:$('photo-ratio').value,editedAt:Date.now()});dialog.close();
  });
  $('close-photo').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  return {async open(draft){originalSource=draft.sourceImage||draft.image;rotation=draft.photoEdits?.rotation||0;source=originalSource;if(rotation){try{source=await resizeImage(originalSource,rotation);}catch{rotation=0;}}points=structuredClone(draft.photoEdits?.corners||fullFrame());$('crop-image').src=source;$('enhance-photo').checked=draft.photoEdits?.enhance??true;$('photo-ratio').value=draft.photoEdits?.ratio||'auto';$('photo-status').textContent='Placez chaque repère sur un coin de la carte. Les flèches du clavier permettent un réglage fin.';redraw();dialog.showModal();}};
}
