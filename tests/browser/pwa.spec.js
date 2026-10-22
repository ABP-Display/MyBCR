import {test,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';

test.use({serviceWorkers:'allow'});
async function ready(page){
  await page.goto('./');
  await page.getByRole('button',{name:'Installer l’app',exact:true}).click();
  await expect(page.locator('#offline-app-status')).toContainText('disponibles hors connexion',{timeout:20000});
}

test('manifest and app icons resolve correctly under the GitHub Pages project path',async({page,request})=>{
  await page.goto('./');
  const manifestURL=await page.locator('link[rel=manifest]').evaluate(link=>link.href);
  const response=await request.get(manifestURL);expect(response.ok()).toBe(true);
  const manifest=await response.json();expect(manifest.display).toBe('standalone');
  expect(new URL(manifest.start_url,manifestURL).pathname).toBe('/MiniBCR/');
  expect(new URL(manifest.scope,manifestURL).pathname).toBe('/MiniBCR/');
  for(const icon of manifest.icons){
    const result=await request.get(new URL(icon.src,manifestURL).href);expect(result.ok()).toBe(true);
    const png=await result.body();expect(png.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(Number(icon.sizes.split('x')[0]));
  }
  const iosIcon=await request.get(await page.locator('link[rel=apple-touch-icon]').evaluate(link=>link.href));expect(iosIcon.ok()).toBe(true);
});

test('installation help supports native prompts and iPhone home screen instructions',async({page})=>{
  await ready(page);
  await page.getByRole('button',{name:'Fermer l’aide à l’installation'}).click();
  await page.evaluate(()=>{
    const event=new Event('beforeinstallprompt',{cancelable:true});
    event.prompt=async()=>{window.testInstallPromptUsed=true;};
    event.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(event);
  });
  await page.getByRole('button',{name:'Installer l’app',exact:true}).click();
  await page.getByRole('button',{name:'Installer sur cet appareil'}).click();
  expect(await page.evaluate(()=>window.testInstallPromptUsed)).toBe(true);
  await expect(page.locator('#installation-copy')).toContainText('Installation demandée');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await mkdir('docs/evidence',{recursive:true});await page.screenshot({path:'docs/evidence/mobile-installation.png'});
  await page.getByRole('button',{name:'Fermer l’aide à l’installation'}).click();
  await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));
  await expect(page.locator('#install-app')).not.toBeVisible();
});

test('iPhone guidance does not pretend to offer an Android installation prompt',async({browser})=>{
  const context=await browser.newContext({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',viewport:{width:390,height:844},serviceWorkers:'allow'});
  const page=await context.newPage();await page.goto('http://127.0.0.1:4173/MiniBCR/');
  await page.getByRole('button',{name:'Installer l’app',exact:true}).click();
  await expect(page.locator('#installation-copy')).toContainText('Safari');
  await expect(page.locator('#installation-copy')).toContainText('Sur l’écran d’accueil');
  await expect(page.locator('#install-now')).not.toBeVisible();await context.close();
});

test('catalogue and cold-start OCR work offline after explicitly preparing the engine',async({page,context})=>{
  test.setTimeout(120000);
  await ready(page);
  await page.getByRole('button',{name:/Préparer le scan hors connexion/}).click();
  await expect(page.locator('#offline-ocr')).toHaveText('Scan hors connexion prêt',{timeout:60000});
  await page.getByRole('button',{name:'Fermer l’aide à l’installation'}).click();
  await page.getByRole('button',{name:'Scanner',exact:true}).click();
  await page.getByRole('button',{name:'Saisir un contact'}).click();
  await page.getByLabel('Prénom',{exact:true}).fill('Hors ligne');
  await page.getByRole('button',{name:'Ajouter au carnet'}).click();
  await expect(page.locator('#editor-dialog')).not.toBeVisible();
  await context.setOffline(true);await page.reload();
  await expect(page.getByRole('button',{name:'Modifier Hors ligne',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Scanner',exact:true}).click();
  await page.locator('#image-input').setInputFiles('docs/evidence/card-clean.png');
  await expect(page.locator('#ocr-progress')).not.toBeVisible({timeout:60000});
  await expect(page.getByLabel('E-mail(s)',{exact:true})).toHaveValue('elise.bernard@lumen.design');
  await page.getByRole('button',{name:'Ajouter au carnet'}).click();
  await expect(page.locator('#editor-dialog')).not.toBeVisible();
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:/Exporter tous les contacts/}).click();
  const text=await readFile(await(await download).path(),'utf8');expect(text).toContain('elise.bernard@lumen.design');
  await page.reload();await expect(page.locator('.contact-row')).toHaveCount(2);
  const cached=await page.evaluate(async()=>{const names=await caches.keys();return(await Promise.all(names.map(async name=>(await(await caches.open(name)).keys()).map(request=>request.url)))).flat();});
  expect(cached.every(url=>!url.startsWith('data:')&&!url.includes('camille@')&&!url.includes('elise.'))).toBe(true);
});

test('an update waits for confirmation and preserves a draft before reloading',async({page,request})=>{
  await ready(page);await page.getByRole('button',{name:'Fermer l’aide à l’installation'}).click();
  await page.getByRole('button',{name:'Saisir un contact'}).click();
  await page.getByLabel('Prénom',{exact:true}).fill('Brouillon avant mise à jour');
  await page.getByRole('button',{name:'Fermer et garder le brouillon'}).click();
  await request.post('__test/sw',{data:'release-'+Date.now()});
  await page.evaluate(async()=>{const registration=await navigator.serviceWorker.ready;await registration.update();});
  await expect(page.locator('#pwa-update')).toBeVisible({timeout:10000});
  await expect(page.getByRole('button',{name:/Un brouillon vous attend/})).toBeVisible();
  await page.getByRole('button',{name:'Mettre à jour',exact:true}).click();
  await expect(page.locator('#pwa-update')).not.toBeVisible({timeout:10000});
  await page.getByRole('button',{name:/Un brouillon vous attend/}).click();
  await expect(page.getByLabel('Prénom',{exact:true})).toHaveValue('Brouillon avant mise à jour');
});
