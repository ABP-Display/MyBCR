import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';

async function addContact(page, firstName = 'Camille', email = 'camille@exemple.fr') {
  await page.getByRole('button',{name:'Scanner',exact:true}).click();
  await page.getByRole('button', { name: 'Saisir un contact' }).click();
  await page.getByLabel('Prénom', { exact: true }).fill(firstName);
  await page.getByLabel('Nom', { exact: true }).fill('Martin');
  await page.getByLabel('Organisation', { exact: true }).fill('Studio Horizon SAS');
  await page.getByLabel('E-mail(s)', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Ajouter au carnet' }).click();
  await expect(page.locator('#editor-dialog')).not.toBeVisible();
}

async function fixtureCard(page) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1400; canvas.height = 800;
    const context = canvas.getContext('2d');
    context.fillStyle = 'white'; context.fillRect(0, 0, 1400, 800);
    context.fillStyle = '#172d25';
    context.font = 'bold 66px Arial'; context.fillText('Camille Martin', 90, 130);
    context.font = '42px Arial';
    ['Studio Horizon SAS', 'Directrice artistique', '+33 6 12 34 56 78', 'camille@horizon.fr', 'www.horizon.fr', '12 rue des Lilas', '75011 Paris'].forEach((line, index) => context.fillText(line, 90, 225 + index * 75));
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return { name: 'carte-fictive.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
}

test('desktop and mobile empty states, keyboard access and no overflow', async ({ page }) => {
  await mkdir('docs/evidence', { recursive: true });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Saisir un contact' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Exporter les contacts' })).toBeDisabled();
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(()=>window.scrollTo(0,0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/evidence/empty-${width}.png` });
  }
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Aller au contenu' })).toBeFocused();
  await page.getByRole('button', { name: 'Vos données restent ici' }).click();
  await expect(page.getByRole('dialog', { name: 'Votre carnet reste chez vous.' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#privacy-dialog')).not.toBeVisible();
});

test('draft and contact survive reload, edits, selection export, filtering and delete', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Saisir un contact' }).click();
  await page.getByLabel('Prénom', { exact: true }).fill('Zoé');
  await expect(page.locator('#draft-status')).toHaveText('Brouillon sauvegardé dans ce navigateur');
  await page.reload();
  await page.getByRole('button', { name: /Un brouillon vous attend/ }).click();
  await expect(page.getByLabel('Prénom', { exact: true })).toHaveValue('Zoé');
  await page.getByLabel('Nom', { exact: true }).fill('Dupré');
  await page.getByLabel('E-mail(s)', { exact: true }).fill('zoe@exemple.fr');
  await page.getByRole('button', { name: 'Ajouter au carnet' }).click();
  await expect(page.locator('#editor-dialog')).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Modifier Zoé Dupré' })).toBeVisible();
  await expect(page.locator('#resume-draft')).not.toBeVisible();
  await addContact(page);
  await page.getByRole('button', { name: 'Modifier Camille Martin' }).click();
  await page.getByLabel('Fonction', { exact: true }).fill('Responsable des projets internationaux et des partenariats');
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();
  await page.getByRole('checkbox', { name: 'Sélectionner Zoé Dupré' }).check();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter la sélection (1)' }).click();
  const download = await downloadPromise;
  const text = await readFile(await download.path(), 'utf8');
  expect(text).toContain('FN:Zoé Dupré');
  expect(text).not.toContain('Camille');
  await page.getByRole('searchbox').fill('Horizon');
  await expect(page.locator('.contact-row')).toHaveCount(1);
  await page.getByRole('searchbox').fill('introuvable');
  await expect(page.locator('#no-results')).toBeVisible();
  await page.getByRole('searchbox').fill('');
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/evidence/contacts-${width}.png` });
  }
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Supprimer Camille Martin' }).click();
  await expect(page.locator('.contact-row')).toHaveCount(1);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Effacer mes données locales' }).click();
  await expect(page.locator('#empty-state')).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:/Catalogue/}).click();
  await expect(page.locator('#empty-state')).toBeVisible();
  await expect(page.locator('#resume-draft')).not.toBeVisible();
});

test('real local OCR on a fictional card with no external requests', async ({ page }) => {
  test.setTimeout(90000);
  const external = [], errors = [];
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4173/')) external.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await page.locator('#image-input').setInputFiles(await fixtureCard(page));
  await expect(page.locator('#ocr-progress')).toBeVisible();
  await page.screenshot({ path: 'docs/evidence/ocr-loading.png' });
  await expect(page.locator('#ocr-progress')).not.toBeVisible({ timeout: 60000 });
  await expect(page.getByLabel('E-mail(s)', { exact: true })).toHaveValue('camille@horizon.fr');
  await expect(page.getByLabel('Prénom', { exact: true })).toHaveValue('Camille');
  await expect(page.getByLabel('Organisation', { exact: true })).toHaveValue('Studio Horizon SAS');
  await expect(page.getByLabel('Téléphone(s)', { exact: true })).toHaveValue('+33 6 12 34 56 78');
  await page.getByLabel('Organisation', { exact: true }).fill('Organisation corrigée à la main');
  await page.getByLabel('Fonction', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Relancer l’analyse' }).click();
  await expect(page.locator('#ocr-progress')).not.toBeVisible({ timeout: 60000 });
  await expect(page.getByLabel('Organisation', { exact: true })).toHaveValue('Organisation corrigée à la main');
  await expect(page.getByLabel('Fonction', { exact: true })).toHaveValue('');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/evidence/editor-mobile.png' });
  await page.getByRole('button', { name: 'Pivoter la photo' }).click();
  await page.getByRole('button', { name: 'Ajouter au carnet' }).click();
  await expect(page.locator('#editor-dialog')).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Modifier Camille Martin' })).toBeVisible();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('camera permission denied has a usable recovery', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Scanner une carte' }).click();
  await expect(page.getByRole('alert')).toContainText('Accès à la caméra refusé');
  await expect(page.getByRole('button', { name: 'Importer une photo' })).toBeVisible();
  await page.screenshot({ path: 'docs/evidence/camera-denied.png' });
});

test('camera preview is released on close and after capture', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 500;
      const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, 800, 500);
      for (const [x, y, color] of [[0, 0, '#e04040'], [720, 0, '#42a660'], [0, 420, '#4488dd'], [720, 420, '#e1c044']]) {
        context.fillStyle = color; context.fillRect(x, y, 80, 80);
      }
      context.fillStyle = '#173e35'; context.font = '36px Arial'; context.fillText('Image complète de la caméra', 110, 250);
      const stream = canvas.captureStream(1);
      window.testStream = stream;
      return stream;
    };
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Scanner une carte' }).click();
  await expect(page.getByRole('button', { name: 'Prendre la photo' })).toBeEnabled();
  for (const [width, height] of [[390, 844], [844, 390], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    const bounds = await page.locator('#camera-dialog').boundingBox();
    expect(bounds.width).toBe(width);
    expect(bounds.height).toBe(height);
    await expect(page.locator('#camera-video')).toHaveCSS('object-fit', 'contain');
    const video = await page.locator('#camera-video').boundingBox();
    const capture = await page.locator('#capture-button').boundingBox();
    expect(video.height).toBeGreaterThan(height * .45);
    expect(capture.y + capture.height).toBeLessThanOrEqual(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/evidence/camera-${width}.png` });
  }
  await page.getByRole('button', { name: 'Fermer la caméra' }).click();
  expect(await page.evaluate(() => window.testStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  await expect(page.locator('#camera-dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Scanner une carte' }).click();
  await expect(page.getByRole('button', { name: 'Prendre la photo' })).toBeEnabled();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.testStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  await page.getByRole('button', { name: 'Scanner une carte' }).click();
  await page.getByRole('button', { name: 'Prendre la photo' }).click();
  await expect(page.locator('#editor-dialog')).toBeVisible();
  expect(await page.evaluate(() => window.testStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  await page.getByRole('button', { name: 'Annuler l’analyse' }).click();
  await expect(page.getByLabel('Prénom', { exact: true })).toBeEnabled();
});

test('storage failure does not claim a backup and still allows export', async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => { throw new DOMException('Blocked', 'SecurityError'); };
  });
  await page.goto('./');
  await expect(page.locator('#storage-warning')).toBeVisible();
  await addContact(page);
  await expect(page.locator('#storage-caption')).toContainText('Mode temporaire');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter tous les contacts (1)' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.vcf$/);
  await page.screenshot({ path: 'docs/evidence/storage-error.png' });
});

test('failed OCR download offers manual correction without a stuck loader', async ({ page }) => {
  await page.route('**/ocr/lang/**', route => route.abort());
  await page.goto('./');
  await page.locator('#image-input').setInputFiles(await fixtureCard(page));
  await expect(page.locator('#editor-notice')).toContainText('L’analyse a échoué', { timeout: 15000 });
  await expect(page.getByLabel('Prénom', { exact: true })).toBeEnabled();
  await expect(page.locator('#ocr-progress')).not.toBeVisible();
});

test('failed local deletion keeps the visible contact and reports the failure', async ({ page }) => {
  await page.goto('./');
  await addContact(page);
  await page.evaluate(() => {
    IDBObjectStore.prototype.clear = () => { throw new DOMException('Denied', 'SecurityError'); };
  });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Effacer mes données locales' }).click();
  await expect(page.locator('#toast')).toContainText('L’effacement local a échoué');
  await expect(page.locator('.contact-row')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.contact-row')).toHaveCount(1);
});

test('HTML in a contact is rendered as text, and an empty contact is rejected', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Saisir un contact' }).click();
  await page.getByRole('button', { name: 'Ajouter au carnet' }).click();
  await expect(page.locator('#editor-dialog')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Renseignez au moins' })).toBeVisible();
  await page.getByLabel('Prénom', { exact: true }).fill('<img src=x onerror=alert(1)>');
  await page.getByRole('button', { name: 'Ajouter au carnet' }).click();
  await expect(page.locator('.contact-info strong')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#contact-list img')).toHaveCount(0);
});
