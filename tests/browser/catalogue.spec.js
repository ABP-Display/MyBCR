import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';

async function legacyCard(page){
  await page.goto('robots.txt');
  return page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=700;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#364a43';ctx.fillRect(0,0,1000,700);
    ctx.beginPath();ctx.moveTo(150,105);ctx.lineTo(850,154);ctx.lineTo(800,595);ctx.lineTo(100,525);ctx.closePath();ctx.fillStyle='#f5e7d2';ctx.fill();
    ctx.fillStyle='#1761ab';ctx.fillRect(260,230,85,85);ctx.fillStyle='#a94a24';ctx.fillRect(375,230,85,85);
    ctx.fillStyle='#173e35';ctx.font='bold 40px Arial';ctx.fillText('STUDIO AZUR',240,400);
    ctx.font='24px Arial';ctx.fillText('Camille Martin',240,450);
    const image=canvas.toDataURL('image/png');
    await new Promise((resolve,reject)=>{const req=indexedDB.open('minibcr',1);req.onupgradeneeded=()=>{req.result.createObjectStore('contacts',{keyPath:'id'});req.result.createObjectStore('settings');};req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('contacts','readwrite');tx.objectStore('contacts').put({id:'legacy-card',firstName:'Camille',lastName:'Martin',organization:'Studio Azur',title:'Designer',phones:'',emails:'camille@exemple.fr',website:'',address:'',notes:'',image,updatedAt:1720000000000});tx.oncomplete=()=>{db.close();resolve();};};});
    return image;
  });
}

test('mobile catalogue keeps an old photo, rectifies four corners, records history and restores a full backup',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const original=await legacyCard(page);
  await page.goto('./');
  await expect(page.getByRole('button',{name:'Voir la carte de Camille Martin'})).toBeVisible();
  await page.getByRole('button',{name:'Voir la carte de Camille Martin'}).click();
  await expect(page.locator('#detail-photo')).toHaveAttribute('src',original);
  await page.getByRole('button',{name:'Modifier la fiche',exact:true}).click();
  await page.getByRole('button',{name:'Recadrer et améliorer',exact:true}).click();
  await expect(page.locator('#photo-dialog')).toBeVisible();
  const bounds=await page.locator('#crop-stage').boundingBox();
  const points=[[.15,.15],[.85,.22],[.8,.85],[.1,.75]];
  for(let i=0;i<4;i++){
    const box=await page.locator('.crop-handle').nth(i).boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    await page.mouse.move(bounds.x+points[i][0]*bounds.width,bounds.y+points[i][1]*bounds.height,{steps:5});await page.mouse.up();
  }
  await page.getByRole('combobox',{name:'Proportions',exact:true}).selectOption('1.545454545');
  await page.getByRole('button',{name:'Prévisualiser',exact:true}).click();
  await expect(page.locator('#photo-result')).toBeVisible();
  const processed=await page.locator('#photo-result-image').getAttribute('src');
  expect(processed).not.toBe(original);
  const measurement=await page.locator('#photo-result-image').evaluate(async image=>{
    await image.decode();const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;
    let coloured=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])>50)coloured++;
    return {ratio:c.width/c.height,coloured};
  });
  expect(measurement.ratio).toBeCloseTo(85/55,2);expect(measurement.coloured).toBeGreaterThan(1000);
  await mkdir('docs/evidence',{recursive:true});
  await page.screenshot({path:'docs/evidence/mobile-photo-editor.png'});
  await page.getByRole('button',{name:'Utiliser cette photo',exact:true}).click();
  await expect(page.locator('#card-preview')).toHaveAttribute('src',processed);
  await page.getByRole('button',{name:'Enregistrer les modifications',exact:true}).click();
  await expect(page.locator('#editor-dialog')).not.toBeVisible();
  await page.reload();
  await expect(page.locator('.card-photo img')).toHaveAttribute('src',processed);
  const stored=await page.evaluate(()=>new Promise(resolve=>{const req=indexedDB.open('minibcr',2);req.onsuccess=()=>{const db=req.result,tx=db.transaction('contacts');const r=tx.objectStore('contacts').get('legacy-card');r.onsuccess=()=>resolve(r.result);tx.oncomplete=()=>db.close();};}));
  expect(stored.sourceImage).toBe(original);expect(stored.photoEdits.corners[0].x).toBeCloseTo(.15,2);
  await page.screenshot({path:'docs/evidence/mobile-catalogue.png'});
  const backupDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Sauvegarder le catalogue complet'}).click();
  const file=await backupDownload;const backup=await readFile(await file.path(),'utf8');
  expect(JSON.parse(backup).contacts[0].sourceImage).toBe(original);
  expect(JSON.parse(backup).history.some(event=>event.kind==='photo')).toBe(true);
  await page.getByRole('button',{name:'Historique',exact:true}).click();
  await expect(page.locator('#history-list')).toContainText('Photo retouchée');
  await page.screenshot({path:'docs/evidence/mobile-history.png'});
  await page.getByRole('button',{name:/Ouvrir la fiche de Camille Martin/}).click();
  await expect(page.locator('#detail-photo')).toHaveAttribute('src',processed);
  await page.getByRole('button',{name:'Fermer la fiche',exact:true}).click();
  await page.getByRole('button',{name:/Catalogue/}).click();
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Effacer mes données locales'}).click();
  await expect(page.locator('#empty-state')).toBeVisible();
  await page.locator('#backup-input').setInputFiles({name:'catalogue.json',mimeType:'application/json',buffer:Buffer.from(backup)});
  await expect(page.getByRole('button',{name:'Voir la carte de Camille Martin'})).toBeVisible();
  await page.reload();
  await expect(page.locator('.card-photo img')).toHaveAttribute('src',processed);
  await page.getByRole('button',{name:'Historique',exact:true}).click();await expect(page.locator('#history-list')).toContainText('Fiche restaurée');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('catalogue filtering, cancelled crop and deletion history are consistent',async({page})=>{
  const original=await legacyCard(page);await page.goto('./');
  await page.getByRole('button',{name:'Modifier Camille Martin',exact:true}).click();
  await page.getByRole('button',{name:'Recadrer et améliorer',exact:true}).click();
  const first=page.getByRole('button',{name:/Coin haut gauche/});await first.focus();await page.keyboard.press('ArrowRight');
  await expect(first).toHaveAttribute('aria-label',/1 %/);
  await page.getByRole('button',{name:'Pivoter l’original',exact:true}).click();
  await expect(page.locator('#crop-image')).not.toHaveAttribute('src',original);
  await expect(page.locator('#photo-status')).toContainText('Photo tournée');
  await page.keyboard.press('Escape');await expect(page.locator('#card-preview')).toHaveAttribute('src',original);
  await page.getByRole('button',{name:'Fermer et garder le brouillon'}).click();
  await page.getByRole('combobox',{name:'Afficher',exact:true}).selectOption('photos');await expect(page.locator('.contact-row')).toHaveCount(1);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Supprimer Camille Martin'}).click();
  await expect(page.locator('.contact-row')).toHaveCount(0);
  await page.getByRole('button',{name:'Historique',exact:true}).click();
  await expect(page.locator('#history-list')).toContainText('Fiche supprimée');await expect(page.locator('.history-open')).toHaveCount(0);
});

test('a card design can be kept without extracted contact fields',async({page})=>{
  await legacyCard(page);await page.goto('./');
  await page.getByRole('button',{name:'Modifier Camille Martin',exact:true}).click();
  for(const input of await page.locator('#contact-fields input,#contact-fields textarea').all())await input.fill('');
  await page.getByRole('button',{name:'Enregistrer les modifications',exact:true}).click();
  await expect(page.locator('#editor-dialog')).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('button',{name:'Voir la carte de Carte sans coordonnées',exact:true})).toBeVisible();
  await expect(page.locator('.card-photo img')).toBeVisible();
});
