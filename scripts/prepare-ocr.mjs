import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const destination = new URL('../public/ocr/', import.meta.url);
await mkdir(new URL('core/', destination), { recursive: true });
await mkdir(new URL('lang/', destination), { recursive: true });
const tesseractRoot = dirname(require.resolve('tesseract.js/package.json'));
const coreRoot = dirname(require.resolve('tesseract.js-core/package.json'));
await copyFile(join(tesseractRoot, 'dist/worker.min.js'), new URL('worker.min.js', destination));
for (const file of await readdir(coreRoot)) {
  if (/\.wasm(?:\.js)?$/.test(file)) {
    await copyFile(join(coreRoot, file), new URL(`core/${file}`, destination));
  }
}
for (const language of ['eng', 'fra']) {
  const root = dirname(require.resolve(`@tesseract.js-data/${language}/package.json`));
  await copyFile(join(root, `4.0.0_best_int/${language}.traineddata.gz`), new URL(`lang/${language}.traineddata.gz`, destination));
}
// Keep upstream notices alongside the redistributed engine and language data.
for (const [name, root] of [['tesseract', tesseractRoot], ['core', coreRoot], ...['eng', 'fra'].map(lang => [lang, dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`))])]) {
  const licenses = (await readdir(root)).filter(file => /^licen[cs]e/i.test(file));
  for (const file of licenses) await copyFile(join(root, file), new URL(`${name}-${file}`, destination));
}
