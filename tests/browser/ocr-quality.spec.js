import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { extractContact } from '../../src/contacts.js';

async function cardFixture(page, variant) {
  return page.evaluate(variant => {
    const small = variant === 'small';
    const dark = variant === 'dark';
    const width = small ? 620 : 1400, height = small ? 360 : 800;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = dark ? '#182e44' : small ? '#ddd9ce' : '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = dark ? '#d4e0e8' : small ? '#77776f' : '#173e35';
    const left = small ? 35 : 90;
    ctx.font = `bold ${small ? 24 : 66}px Arial`;
    ctx.fillText('Élise BERNARD', left, small ? 45 : 100);
    ctx.font = `${small ? 12 : 36}px Arial`;
    const lines = ['Atelier Lumen', 'Architecte', '+33 6 12 34 56 78', 'elise.bernard@lumen.design', 'www.lumen.design', '12 rue des Arts', '75011 Paris'];
    lines.forEach((line, index) => ctx.fillText(line, left, (small ? 90 : 205) + index * (small ? 35 : 80)));
    if (variant === 'sideways') {
      const rotated = document.createElement('canvas'); rotated.width = height; rotated.height = width;
      const rotation = rotated.getContext('2d'); rotation.translate(height, 0); rotation.rotate(Math.PI / 2); rotation.drawImage(canvas, 0, 0);
      return rotated.toDataURL('image/png');
    }
    return canvas.toDataURL('image/png');
  }, variant);
}

const expected = { firstName: 'Élise', lastName: 'BERNARD', organization: 'Atelier Lumen', title: 'Architecte', phones: '+33 6 12 34 56 78', emails: 'elise.bernard@lumen.design', website: 'www.lumen.design' };
const canonical = (field, value) => field === 'phones' ? value.replace(/\D/g, '') : value.toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim();
function matchedFields(contact) {
  return Object.entries(expected).filter(([field, value]) => canonical(field, contact[field] || '') === canonical(field, value)).map(([field]) => field);
}

for (const variant of ['clean', 'small', 'dark', 'sideways']) {
  test(`OCR quality: ${variant} printed card compared to previous single-pass recognition`, async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('./');
    const source = await cardFixture(page, variant);
    await mkdir('docs/evidence', { recursive: true });
    const buffer = Buffer.from(source.split(',')[1], 'base64');
    await writeFile(`docs/evidence/card-${variant}.png`, buffer);
    await page.locator('#image-input').setInputFiles({ name: `${variant}.png`, mimeType: 'image/png', buffer });
    await expect(page.locator('#ocr-progress')).not.toBeVisible({ timeout: 90000 });
    const current = await page.locator('#contact-form').evaluate(form => Object.fromEntries([...new FormData(form)]));
    const currentText = await page.locator('#raw-text').textContent();
    // Historical OCR configuration: 2000 px cap, sparse segmentation, no image
    // correction, no auto-deskew and no orientation recovery. Same language models.
    await page.addScriptTag({ path: 'node_modules/tesseract.js/dist/tesseract.min.js' });
    const baseline = await page.evaluate(async source => {
      const image = new Image(); image.src = source; await image.decode();
      const scale = Math.min(1, 2000 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      const root = new URL('ocr/', document.baseURI).href;
      const worker = await window.Tesseract.createWorker(['fra', 'eng'], 1, { workerPath: `${root}worker.min.js`, corePath: `${root}core/`, langPath: `${root}lang`, workerBlobURL: false, errorHandler() {} });
      try {
        await worker.setParameters({ tessedit_pageseg_mode: '11', user_defined_dpi: '300' });
        return (await worker.recognize(canvas.toDataURL('image/jpeg', .9))).data.text;
      } finally { await worker.terminate(); }
    }, source);
    const baselineFields = matchedFields(extractContact(baseline));
    const currentFields = matchedFields(current);
    const report = { fixture: variant, expected, baseline: { fieldsMatched: baselineFields, text: baseline }, improved: { fieldsMatched: currentFields, text: currentText }, note: 'Cartes synthétiques uniquement. Même extraction actuelle sur le texte ancien : la comparaison isole surtout le pipeline OCR ; aucun taux global de précision sur des cartes réelles.' };
    await writeFile(`docs/evidence/ocr-${variant}-comparison.json`, JSON.stringify(report, null, 2) + '\n');
    expect(currentFields).toContain('emails');
    expect(currentFields).toContain('phones');
    expect(currentFields.length).toBeGreaterThanOrEqual(baselineFields.length);
    expect(currentFields.length).toBeGreaterThanOrEqual(6);
  });
}
