import './styles.css';
import { blankContact, fields, contactName, extractContact, toVCard } from './contacts.js';
import * as storage from './storage.js';

const icons = {
  camera: '<path d="M14 4h-4L8 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4z"/><circle cx="12" cy="13" r="4"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  contact: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="9" r="3"/><path d="M6 19a6 6 0 0 1 12 0"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  rotate: '<path d="M3 10a9 9 0 1 1 2 8M3 3v7h7"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
const $ = id => document.getElementById(id);
const form = $('contact-form');
const editor = $('editor-dialog');
const state = { contacts: [], selected: new Set(), draft: null, temporary: false, stream: null, cameraToken: 0, ocr: null };
let draftTimer, toastTimer;
let draftQueue = Promise.resolve();
const escapeHTML = value => String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function notify(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}

function storageFailed() {
  state.temporary = true;
  $('storage-warning').hidden = false;
  $('storage-caption').textContent = 'Mode temporaire — pensez à exporter';
  $('draft-status').textContent = 'Brouillon en mémoire uniquement — sauvegarde indisponible';
}

function render() {
  const search = $('search-input').value.trim().toLocaleLowerCase('fr');
  const visible = state.contacts.filter(contact => fields.some(field => (contact[field] || '').toLocaleLowerCase('fr').includes(search)));
  $('contact-count').textContent = state.contacts.length;
  $('empty-state').hidden = state.contacts.length > 0;
  $('no-results').hidden = !state.contacts.length || !!visible.length;
  $('list-toolbar').hidden = !state.contacts.length;
  $('visible-count').textContent = `${visible.length} contact${visible.length > 1 ? 's' : ''}`;
  $('selection-label').textContent = state.selected.size ? `${state.selected.size} sélectionné${state.selected.size > 1 ? 's' : ''}` : 'Tout sélectionner';
  const selectedVisible = visible.filter(contact => state.selected.has(contact.id)).length;
  $('select-all').checked = visible.length > 0 && selectedVisible === visible.length;
  $('select-all').indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
  $('select-all').disabled = !visible.length;
  $('export-button').disabled = !state.contacts.length;
  $('export-label').textContent = state.selected.size ? `Exporter la sélection (${state.selected.size})` : state.contacts.length ? `Exporter tous les contacts (${state.contacts.length})` : 'Exporter les contacts';
  $('resume-draft').hidden = !state.draft;
  $('clear-button').hidden = !state.contacts.length && !state.draft;
  $('contact-list').innerHTML = visible.map(contact => {
    const name = contactName(contact);
    const initials = name.split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('fr');
    const subtitle = [contact.title, contact.organization].filter(Boolean).join(' · ') || contact.emails.split('\n')[0] || contact.phones.split('\n')[0] || 'Contact à compléter';
    return `<article class="contact-row" data-id="${escapeHTML(contact.id)}"><label class="checkbox-label"><span class="sr-only">Sélectionner ${escapeHTML(name)}</span><input type="checkbox" class="contact-checkbox" ${state.selected.has(contact.id) ? 'checked' : ''} /></label><div class="contact-avatar" aria-hidden="true">${escapeHTML(initials)}</div><button class="contact-info edit-contact" aria-label="Modifier ${escapeHTML(name)}"><strong>${escapeHTML(name)}</strong><small>${escapeHTML(subtitle)}</small></button><div class="row-actions"><button class="icon-button download-contact" aria-label="Exporter ${escapeHTML(name)}">${icon('download')}</button><button class="icon-button delete-contact" aria-label="Supprimer ${escapeHTML(name)}">${icon('trash')}</button></div></article>`;
  }).join('');
}

function readForm() {
  return Object.fromEntries(fields.map(field => [field, form.elements.namedItem(field).value.trim()]));
}

function writeForm(contact) {
  for (const field of fields) form.elements.namedItem(field).value = contact[field] || '';
}

function queueDraft() {
  clearTimeout(draftTimer);
  if (!state.draft) return draftQueue;
  const snapshot = structuredClone(state.draft);
  $('draft-status').textContent = state.temporary ? 'Brouillon en mémoire uniquement' : 'Sauvegarde du brouillon…';
  draftQueue = draftQueue.then(async () => {
    try {
      await storage.saveDraft(snapshot);
      if (!state.temporary) $('draft-status').textContent = 'Brouillon sauvegardé dans ce navigateur';
    } catch { storageFailed(); }
  });
  return draftQueue;
}

function syncDraft() {
  if (!state.draft) return;
  Object.assign(state.draft, readForm());
}

function setEditorBusy(busy) {
  $('contact-fields').disabled = busy;
  $('save-contact').disabled = busy;
  $('rotate-button').disabled = busy;
  $('reanalyze-button').disabled = busy;
  $('ocr-progress').hidden = !busy;
}

function openEditor(draft) {
  stopCamera();
  state.draft = draft;
  writeForm(draft);
  $('image-aside').hidden = !draft.image;
  if (draft.image) $('card-preview').src = draft.image;
  else $('card-preview').removeAttribute('src');
  $('raw-text').textContent = draft.rawText || 'Aucun texte reconnu pour le moment.';
  $('editor-notice').textContent = 'Les champs proposés peuvent contenir des erreurs. Vérifiez-les avant de valider.';
  $('save-contact').innerHTML = `${icon('check')} ${draft.editingId ? 'Enregistrer les modifications' : 'Ajouter au carnet'}`;
  setEditorBusy(false);
  if (!editor.open) editor.showModal();
  queueDraft();
  render();
}

function replaceDraftAllowed() {
  return !state.draft || window.confirm('Remplacer le brouillon en cours ? Les contacts déjà ajoutés seront conservés.');
}

async function closeEditor() {
  cancelOCR();
  syncDraft();
  queueDraft();
  editor.close();
  render();
}

async function discardDraft() {
  if (!window.confirm('Abandonner ce brouillon ?')) return;
  cancelOCR();
  clearTimeout(draftTimer);
  await draftQueue;
  try { await storage.saveDraft(null); }
  catch { storageFailed(); notify('Impossible d’effacer le brouillon local. Réessayez ou effacez les données du site dans votre navigateur.'); return; }
  state.draft = null;
  editor.close();
  render();
}

function stopCamera() {
  state.cameraToken++;
  state.stream?.getTracks().forEach(track => track.stop());
  state.stream = null;
  $('camera-video').srcObject = null;
  $('camera-view').hidden = true;
  $('camera-actions').hidden = true;
  $('card-scene').hidden = false;
  $('scan-actions').hidden = false;
  $('capture-hint').textContent = 'Caméra arrière recommandée · JPG, PNG, WebP ou BMP';
}

async function startCamera() {
  $('camera-error').hidden = true;
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraError('La caméra est indisponible ici. Utilisez un navigateur récent en HTTPS ou importez une photo.');
    return;
  }
  const token = ++state.cameraToken;
  $('camera-actions').hidden = false;
  $('camera-view').hidden = false;
  $('card-scene').hidden = true;
  $('scan-actions').hidden = true;
  $('capture-button').disabled = true;
  $('capture-hint').textContent = 'Autorisez la caméra dans la demande du navigateur.';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    if (token !== state.cameraToken) { stream.getTracks().forEach(track => track.stop()); return; }
    state.stream = stream;
    $('camera-video').srcObject = stream;
    await $('camera-video').play();
    if (token !== state.cameraToken) return;
    $('capture-button').disabled = false;
    $('capture-hint').textContent = 'Gardez l’appareil stable et évitez les reflets.';
    $('capture-button').focus();
  } catch (error) {
    if (token !== state.cameraToken) return;
    stopCamera();
    const messages = {
      NotAllowedError: 'Accès à la caméra refusé. Vous pouvez autoriser l’accès dans votre navigateur ou importer une photo.',
      NotFoundError: 'Aucune caméra détectée. Importez une photo de votre carte.',
      NotReadableError: 'La caméra est déjà utilisée ou indisponible. Fermez les autres applications ou importez une photo.',
    };
    cameraError(messages[error.name] || 'Impossible de démarrer la caméra. Essayez d’importer une photo.');
  }
}

function cameraError(message) {
  $('camera-error').textContent = message;
  $('camera-error').hidden = false;
}

async function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Cette image ne peut pas être lue. Choisissez un fichier JPG, PNG, WebP ou BMP.'));
    image.src = source;
  });
}

async function resizeImage(source, rotate = false) {
  const image = await loadImage(source);
  const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.round(image.naturalWidth * scale), height = Math.round(image.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = rotate ? height : width;
  canvas.height = rotate ? width : height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (rotate) { context.translate(canvas.width, 0); context.rotate(Math.PI / 2); }
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', .9);
}

async function scanImage(image) {
  openEditor({ ...blankContact(), image, rawText: '' });
  await analyzeImage();
}

function cancelOCR() {
  if (!state.ocr) return;
  state.ocr.cancel();
  state.ocr = null;
  setEditorBusy(false);
  $('editor-notice').textContent = 'Analyse interrompue. Vous pouvez compléter la fiche à la main ou relancer l’analyse.';
}

async function analyzeImage() {
  if (!state.draft?.image || state.ocr) return;
  syncDraft();
  const image = state.draft.image;
  let worker, cancelled = false, rejectCancel;
  const cancellation = new Promise((_, reject) => { rejectCancel = reject; });
  const job = { cancel() { cancelled = true; rejectCancel(new Error('cancelled')); worker?.terminate(); } };
  state.ocr = job;
  setEditorBusy(true);
  $('progress-bar').value = 0;
  $('ocr-status').textContent = 'Chargement du moteur de reconnaissance…';
  const timeout = setTimeout(() => job.cancel(), 120000);
  try {
    const operation = (async () => {
      const { createWorker, PSM } = await import('tesseract.js');
      if (cancelled) return;
      const root = new URL(`${import.meta.env.BASE_URL}ocr/`, document.baseURI).href;
      worker = await createWorker(['fra', 'eng'], 1, {
        workerPath: `${root}worker.min.js`, corePath: `${root}core/`, langPath: `${root}lang`, workerBlobURL: false,
        errorHandler(error) { rejectCancel(new Error(String(error))); },
        logger(message) {
          if (state.ocr !== job || cancelled) return;
          const recognizing = message.status === 'recognizing text';
          $('ocr-status').textContent = recognizing ? 'Lecture de votre carte…' : 'Préparation du moteur sur votre appareil…';
          $('progress-bar').value = recognizing ? 30 + Math.round(message.progress * 70) : Math.round((message.progress || 0) * 25);
        },
      });
      if (cancelled) { await worker.terminate(); return; }
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, user_defined_dpi: '300' });
      return worker.recognize(image);
    })();
    const result = await Promise.race([operation, cancellation]);
    if (cancelled || state.ocr !== job || !state.draft || !result) return;
    const text = result.data.text.trim();
    state.draft.rawText = text;
    // Keep existing corrections if the user reruns recognition after rotating.
    const extracted = extractContact(text);
    for (const field of fields) if (!state.draft[field]) state.draft[field] = extracted[field];
    writeForm(state.draft);
    $('raw-text').textContent = text || 'Aucun texte détecté.';
    $('editor-notice').textContent = text ? 'Lecture terminée. Vérifiez les champs proposés et complétez les informations manquantes.' : 'Aucun texte lisible détecté. Essayez une photo plus nette ou complétez la fiche à la main.';
    await queueDraft();
  } catch (error) {
    if (error.message !== 'cancelled' && state.ocr === job) {
      $('editor-notice').textContent = 'L’analyse a échoué. Vérifiez votre connexion pour charger le moteur, réessayez ou complétez la fiche à la main.';
    } else if (state.ocr === job) {
      $('editor-notice').textContent = 'Analyse interrompue ou trop longue. Complétez la fiche à la main ou réessayez.';
    }
  } finally {
    clearTimeout(timeout);
    if (worker) await worker.terminate().catch(() => {});
    if (state.ocr === job) { state.ocr = null; setEditorBusy(false); }
  }
}

function downloadContacts(contacts) {
  if (!contacts.length) return;
  const blob = new Blob([toVCard(contacts)], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = contacts.length === 1 ? `minibcr-${contactName(contacts[0]).replace(/[^\p{L}\p{N}-]+/gu, '-').slice(0, 60)}.vcf` : 'minibcr-contacts.vcf';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  notify('Fichier .vcf préparé. Ouvrez-le dans votre application Contacts pour confirmer l’import.');
}

$('camera-button').addEventListener('click', startCamera);
$('stop-camera-button').addEventListener('click', stopCamera);
$('capture-button').addEventListener('click', async () => {
  const video = $('camera-video');
  if (!video.videoWidth || !replaceDraftAllowed()) return;
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 2000 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = canvas.toDataURL('image/jpeg', .9);
  stopCamera();
  await scanImage(image);
});
$('upload-button').addEventListener('click', () => $('image-input').click());
$('image-input').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || !replaceDraftAllowed()) return;
  $('camera-error').hidden = true;
  if (!/^image\/(jpeg|png|webp|bmp|x-ms-bmp)$/.test(file.type)) { cameraError('Format non pris en charge. Choisissez une photo JPG, PNG, WebP ou BMP.'); return; }
  if (file.size > 20 * 1024 * 1024) { cameraError('Cette image dépasse 20 Mo. Choisissez une photo plus légère.'); return; }
  const url = URL.createObjectURL(file);
  $('upload-button').disabled = true;
  try { await scanImage(await resizeImage(url)); }
  catch (error) { cameraError(error.message); }
  finally { URL.revokeObjectURL(url); $('upload-button').disabled = false; }
});
$('manual-button').addEventListener('click', () => { if (replaceDraftAllowed()) openEditor({ ...blankContact() }); });
$('resume-draft').addEventListener('click', () => openEditor(state.draft));
$('close-editor').addEventListener('click', closeEditor);
editor.addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
$('discard-draft').addEventListener('click', discardDraft);
$('cancel-ocr').addEventListener('click', cancelOCR);
$('rotate-button').addEventListener('click', async event => {
  event.preventDefault();
  if (!state.draft?.image || state.ocr) return;
  $('rotate-button').disabled = true;
  try { state.draft.image = await resizeImage(state.draft.image, true); $('card-preview').src = state.draft.image; queueDraft(); }
  catch { notify('Impossible de pivoter cette image.'); }
  finally { $('rotate-button').disabled = false; }
});
$('reanalyze-button').addEventListener('click', event => { event.preventDefault(); analyzeImage(); });
form.addEventListener('input', () => {
  syncDraft();
  $('draft-status').textContent = state.temporary ? 'Brouillon en mémoire uniquement' : 'Sauvegarde…';
  clearTimeout(draftTimer);
  draftTimer = setTimeout(queueDraft, 250);
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (state.ocr || !state.draft) return;
  syncDraft();
  if (!fields.some(field => state.draft[field])) { notify('Renseignez au moins une information pour ajouter ce contact.'); return; }
  const emails = state.draft.emails.split('\n').map(email => email.trim()).filter(Boolean);
  if (emails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) { notify('Vérifiez les e-mails : une adresse complète par ligne.'); form.elements.emails.focus(); return; }
  const editing = state.draft.editingId;
  const normalizedPhone = value => value.replace(/\D/g, '');
  const duplicate = state.contacts.find(contact => contact.id !== editing && (
    emails.some(email => contact.emails.toLowerCase().split('\n').includes(email.toLowerCase())) ||
    state.draft.phones.split('\n').some(phone => phone.trim() && contact.phones.split('\n').some(existing => normalizedPhone(existing) === normalizedPhone(phone)))
  ));
  if (duplicate && !window.confirm(`Un contact possède déjà cet e-mail ou ce téléphone (${contactName(duplicate)}). Ajouter quand même ?`)) return;
  clearTimeout(draftTimer);
  $('save-contact').disabled = true;
  await draftQueue;
  const contact = { ...state.draft, id: editing || crypto.randomUUID(), updatedAt: Date.now() };
  delete contact.editingId;
  try { await storage.saveContact(contact); } catch { storageFailed(); }
  state.contacts = [contact, ...state.contacts.filter(item => item.id !== contact.id)];
  state.draft = null;
  editor.close();
  render();
  notify(editing ? 'Contact modifié.' : 'Contact ajouté au carnet.');
});
$('search-input').addEventListener('input', render);
$('select-all').addEventListener('change', event => {
  for (const row of $('contact-list').querySelectorAll('.contact-row')) {
    if (event.target.checked) state.selected.add(row.dataset.id); else state.selected.delete(row.dataset.id);
  }
  render();
});
$('contact-list').addEventListener('change', event => {
  const row = event.target.closest('.contact-row');
  if (!row) return;
  if (event.target.checked) state.selected.add(row.dataset.id); else state.selected.delete(row.dataset.id);
  const id = row.dataset.id;
  render();
  $('contact-list').querySelector(`[data-id="${CSS.escape(id)}"] .contact-checkbox`)?.focus();
});
$('contact-list').addEventListener('click', async event => {
  const row = event.target.closest('.contact-row');
  if (!row) return;
  const contact = state.contacts.find(item => item.id === row.dataset.id);
  if (!contact) return;
  if (event.target.closest('.edit-contact')) {
    if (state.draft?.editingId === contact.id) openEditor(state.draft);
    else if (replaceDraftAllowed()) openEditor({ ...contact, editingId: contact.id });
  }
  if (event.target.closest('.download-contact')) downloadContacts([contact]);
  if (event.target.closest('.delete-contact')) {
    if (!window.confirm(`Supprimer ${contactName(contact)} de ce navigateur ?`)) return;
    try { await storage.deleteContact(contact.id); }
    catch { storageFailed(); notify('La suppression locale a échoué. Le contact est conservé ; réessayez.'); return; }
    state.contacts = state.contacts.filter(item => item.id !== contact.id);
    state.selected.delete(contact.id);
    if (state.draft?.editingId === contact.id) {
      await draftQueue;
      state.draft = null;
      try { await storage.saveDraft(null); } catch { storageFailed(); }
    }
    render(); notify('Contact supprimé.');
  }
});
$('export-button').addEventListener('click', () => downloadContacts(state.selected.size ? state.contacts.filter(contact => state.selected.has(contact.id)) : state.contacts));
$('clear-button').addEventListener('click', async () => {
  if (!window.confirm('Effacer tous les contacts et le brouillon enregistrés dans ce navigateur ? Pensez à les exporter avant de continuer.')) return;
  clearTimeout(draftTimer);
  await draftQueue;
  try { await storage.clearData(); }
  catch { storageFailed(); notify('L’effacement local a échoué. Réessayez ou effacez les données du site dans votre navigateur.'); return; }
  state.contacts = []; state.selected.clear(); state.draft = null;
  render(); notify('Contacts et brouillon effacés de ce navigateur.');
});
$('privacy-button').addEventListener('click', () => $('privacy-dialog').showModal());
$('close-privacy').addEventListener('click', () => $('privacy-dialog').close());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopCamera(); if (editor.open) { syncDraft(); queueDraft(); } }
});
window.addEventListener('pagehide', () => { stopCamera(); if (editor.open) { syncDraft(); queueDraft(); } });

async function initialize() {
  const controls = ['camera-button', 'upload-button', 'manual-button'];
  controls.forEach(id => { $(id).disabled = true; });
  try {
    state.contacts = (await storage.getContacts()).sort((a, b) => b.updatedAt - a.updatedAt);
    state.draft = await storage.getDraft() || null;
  } catch { storageFailed(); }
  controls.forEach(id => { $(id).disabled = false; });
  render();
}
initialize();
