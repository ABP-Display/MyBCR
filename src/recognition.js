import { extractContact } from './contacts.js';

export async function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Cette image ne peut pas être lue. Choisissez un fichier JPG, PNG, WebP ou BMP.'));
    image.src = source;
  });
}

function canvasFor(image, maxSide, rotation = 0) {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.round(image.naturalWidth * scale), height = Math.round(image.naturalHeight * scale);
  const sideways = Math.abs(rotation) % 180 === 90;
  const canvas = document.createElement('canvas');
  canvas.width = sideways ? height : width;
  canvas.height = sideways ? width : height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(rotation * Math.PI / 180);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  return canvas;
}

export async function resizeImage(source, rotation = 0) {
  return canvasFor(await loadImage(source), 3200, rotation).toDataURL('image/jpeg', .95);
}

// Make small print larger, remove colour casts, normalize contrast and invert
// dark cards. Keep the original as a separate OCR candidate to avoid regressions.
export async function prepareOCRImage(source) {
  const image = await loadImage(source);
  const scale = Math.min(3, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale) + 40;
  canvas.height = Math.round(image.naturalHeight * scale) + 40;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.drawImage(image, 20, 20, canvas.width - 40, canvas.height - 40);
  const pixels = context.getImageData(20, 20, canvas.width - 40, canvas.height - 40);
  const histogram = new Uint32Array(256);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(.299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2]);
    histogram[gray]++; data[i] = gray;
  }
  const total = data.length / 4;
  const quantile = fraction => {
    let sum = 0;
    for (let index = 0; index < 256; index++) { sum += histogram[index]; if (sum >= total * fraction) return index; }
    return 255;
  };
  const low = quantile(.005), high = quantile(.995), inverse = quantile(.5) < 120;
  const range = high - low;
  for (let i = 0; i < data.length; i += 4) {
    let gray = range >= 12 ? Math.max(0, Math.min(255, (data[i] - low) * 255 / range)) : data[i];
    if (inverse) gray = 255 - gray;
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  context.putImageData(pixels, 20, 20);
  return canvas;
}

function rotateCanvas(source, rotation) {
  const canvas = document.createElement('canvas');
  const sideways = rotation % 180 !== 0;
  canvas.width = sideways ? source.height : source.width;
  canvas.height = sideways ? source.width : source.height;
  const context = canvas.getContext('2d');
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(rotation * Math.PI / 180);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

export function layoutLines(blocks = []) {
  return (blocks || []).flatMap(block => block.paragraphs || []).flatMap(paragraph => paragraph.lines || []).map(line => ({
    text: line.text || (line.words || []).map(word => word.text).join(' '),
    height: line.bbox ? line.bbox.y1 - line.bbox.y0 : 0,
    confidence: line.confidence,
  }));
}

export function evaluateRecognition(data) {
  const text = (data.text || '').trim();
  const lines = layoutLines(data.blocks);
  const extracted = extractContact(text, lines);
  const confidence = Number(data.confidence) || 0;
  const useful = (text.match(/[\p{L}\p{N}]/gu) || []).length;
  const noise = (text.match(/[^\p{L}\p{N}\s@.,:/+()&'’_-]/gu) || []).length;
  const score = confidence * .6 + Math.min(useful / 8, 20)
    + (extracted.emails ? 14 : 0) + (extracted.phones ? 12 : 0) + (extracted.website ? 8 : 0)
    + (extracted.firstName ? 6 : 0) + (extracted.organization ? 4 : 0) - Math.min(noise * 2, 20);
  return { text, lines, extracted, confidence, score };
}

export async function recognizeCard(worker, source, onStep, isCancelled) {
  const results = [];
  const run = async (image, mode, adaptive, rotation, label, start, end) => {
    if (isCancelled()) throw new Error('cancelled');
    onStep(label, start, end);
    await worker.setParameters({ tessedit_pageseg_mode: mode, user_defined_dpi: '300', preserve_interword_spaces: '1', thresholding_method: adaptive ? '2' : '0' });
    const { data } = await worker.recognize(image, { rotateAuto: true }, { text: true, blocks: true });
    if (isCancelled()) throw new Error('cancelled');
    results.push({ ...evaluateRecognition(data), rotation });
  };
  // Sparse text suits a business card; automatic layout can recover grouped text
  // and coordinates missed by sparse segmentation. Each pass stays local.
  await run(source, '11', false, 0, 'Lecture de la carte · 1/2…', 25, 53);
  if (isCancelled()) throw new Error('cancelled');
  onStep('Amélioration du contraste et des petits caractères…', 53, 55);
  const prepared = await prepareOCRImage(source);
  await run(prepared, '3', true, 0, 'Vérification du texte et des coordonnées · 2/2…', 55, 83);
  let best = [...results].sort((a,b) => b.score - a.score)[0];
  if (best.confidence < 65 && (!best.extracted.emails && !best.extracted.phones || best.text.length < 35)) {
    for (const [index, rotation] of [90, 270, 180].entries()) {
      await run(rotateCanvas(prepared, rotation), '11', true, rotation, 'Recherche du sens de lecture…', 83 + index * 5, 88 + index * 5);
      best = [...results].sort((a,b) => b.score - a.score)[0];
      if (best.confidence >= 75 && (best.extracted.emails || best.extracted.phones)) break;
    }
  }
  onStep('Vérification terminée.', 100, 100);
  return best;
}
