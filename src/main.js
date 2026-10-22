import './styles.css';
import './mobile.css';
import { blankContact, fields, contactName, toVCard } from './contacts.js';
import * as storage from './storage.js';
import { resizeImage, recognizeCard } from './recognition.js';
import { createPhotoEditor } from './photo-editor.js';
import { eventLabels, makeEvent, safePhoto, parseCatalogueBackup } from './catalogue.js';
import { initializePWA } from './pwa.js';

const icons = {
  history:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
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
// Storage failures must remain visible in Scanner and Historique as well.
$('main').before($('storage-warning'));
const state = { contacts: [], history:[], view:'scan', detailId:null, selected: new Set(), draft: null, temporary: false, stream: null, cameraToken: 0, ocr: null };
const dateLabel=value=>Number.isFinite(value)&&Math.abs(value)<=8640000000000000?new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short'}).format(value):'Date inconnue';
const photoEditor=createPhotoEditor((image,edits)=>{
  if(!state.draft)return;
  state.draft.sourceImage ||= state.draft.image;
  state.draft.image=image;state.draft.photoEdits=edits;
  $('card-preview').src=image;queueDraft();
  $('editor-notice').textContent='Photo recadrée et améliorée. Vous pouvez relancer l’analyse sur cette version avant d’enregistrer.';
});
let draftTimer, toastTimer, draftRevision=0;
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
  const visible = state.contacts.filter(contact => fields.some(field => (contact[field] || '').toLocaleLowerCase('fr').includes(search)))
    .filter(contact=>$('catalogue-filter').value!=='photos'||contact.image)
    .sort($('catalogue-sort').value==='name'?(a,b)=>contactName(a).localeCompare(contactName(b),'fr'):(a,b)=>(b.createdAt||b.updatedAt)-(a.createdAt||a.updatedAt));
  $('main').dataset.view=state.view;
  document.querySelectorAll('[data-view]').forEach(button=>{if(button.tagName==='BUTTON')button.setAttribute('aria-pressed',String(button.dataset.view===state.view));});
  $('history-section').hidden=state.view!=='history';
  $('nav-count').textContent=state.contacts.length;
  $('photo-count').textContent=`${state.contacts.filter(contact=>contact.image).length} avec photo`;
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
  $('clear-button').hidden = !state.contacts.length && !state.draft && !state.history.length;
  $('backup-button').disabled=!state.contacts.length&&!state.history.length;
  $('contact-list').innerHTML = visible.map(contact => {
    const name = contactName(contact);
    const initials = name.split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('fr');
    const subtitle = [contact.title, contact.organization].filter(Boolean).join(' · ') || contact.emails.split('\n')[0] || contact.phones.split('\n')[0] || 'Contact à compléter';
    const photo=safePhoto(contact.image)?`<img src="${contact.image}" alt="Carte de visite de ${escapeHTML(name)}" loading="lazy" />`:`<span class="card-placeholder">${escapeHTML(initials)}<small>Fiche sans photo</small></span>`;
    return `<article class="contact-row" data-id="${escapeHTML(contact.id)}"><button class="card-photo view-card" aria-label="Voir la carte de ${escapeHTML(name)}">${photo}</button><div class="card-row-info"><label class="checkbox-label"><span class="sr-only">Sélectionner ${escapeHTML(name)}</span><input type="checkbox" class="contact-checkbox" ${state.selected.has(contact.id) ? 'checked' : ''} /></label><button class="contact-info edit-contact" aria-label="Modifier ${escapeHTML(name)}"><strong>${escapeHTML(name)}</strong><small>${escapeHTML(subtitle)}</small></button></div><div class="card-row-footer"><time>${escapeHTML(dateLabel(contact.createdAt||contact.updatedAt))}</time><div class="row-actions"><button class="icon-button download-contact" aria-label="Exporter ${escapeHTML(name)}">${icon('download')}</button><button class="icon-button delete-contact" aria-label="Supprimer ${escapeHTML(name)}">${icon('trash')}</button></div></div></article>`;
  }).join('');
  const events=state.history.toSorted((a,b)=>b.timestamp-a.timestamp);
  $('history-empty').hidden=events.length>0;
  $('history-list').innerHTML=events.map(event=>`<article class="history-event"><span class="history-marker" aria-hidden="true">${icon(event.kind==='delete'?'trash':event.kind==='scan'?'camera':'history')}</span><div><span class="history-kind">${eventLabels[event.kind]||'Événement'}</span><strong>${escapeHTML(event.name)}</strong><time>${escapeHTML(dateLabel(event.timestamp))}</time></div>${state.contacts.some(contact=>contact.id===event.contactId)?`<button class="text-button history-open" data-id="${escapeHTML(event.contactId)}" aria-label="Ouvrir la fiche de ${escapeHTML(event.name)}">Voir la fiche →</button>`:'<span class="history-deleted">Fiche supprimée</span>'}</article>`).join('');
}

function setView(view){state.view=view;render();window.scrollTo({top:0,behavior:'instant'});}

function openCard(contact){
  state.detailId=contact.id;$('card-title').textContent=contactName(contact);
  $('detail-photo').hidden=!safePhoto(contact.image);
  if(safePhoto(contact.image))$('detail-photo').src=contact.image;else $('detail-photo').removeAttribute('src');
  $('download-photo').hidden=!safePhoto(contact.image);
  $('detail-date').textContent=`Ajoutée le ${dateLabel(contact.createdAt||contact.updatedAt)} · Modifiée le ${dateLabel(contact.updatedAt)}`;
  const labels={firstName:'Prénom',lastName:'Nom',organization:'Organisation',title:'Fonction',phones:'Téléphones',emails:'E-mails',website:'Site web',address:'Adresse',notes:'Notes'};
  $('detail-fields').innerHTML=fields.filter(field=>contact[field]).map(field=>`<div><dt>${labels[field]}</dt><dd>${escapeHTML(contact[field])}</dd></div>`).join('');
  $('detail-history').innerHTML=state.history.filter(event=>event.contactId===contact.id).toSorted((a,b)=>b.timestamp-a.timestamp).map(event=>`<p>${eventLabels[event.kind]}<time>${escapeHTML(dateLabel(event.timestamp))}</time></p>`).join('')||'<p>Fiche créée avant l’activation de l’historique.</p>';
  $('card-dialog').showModal();
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
  const revision=++draftRevision;
  const snapshot = structuredClone(state.draft);
  $('draft-status').textContent = state.temporary ? 'Brouillon en mémoire uniquement' : 'Sauvegarde du brouillon…';
  draftQueue = draftQueue.then(async () => {
    try {
      await storage.saveDraft(snapshot);
      if (!state.temporary && revision===draftRevision) $('draft-status').textContent = 'Brouillon sauvegardé dans ce navigateur';
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
  $('edit-photo').disabled=busy;
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
  $('camera-dialog').close();
  $('capture-hint').textContent = 'Caméra arrière recommandée · JPG, PNG, WebP ou BMP';
}

async function startCamera() {
  if ($('camera-dialog').open) return;
  $('camera-error').hidden = true;
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraError('La caméra est indisponible ici. Utilisez un navigateur récent en HTTPS ou importez une photo.');
    return;
  }
  const token = ++state.cameraToken;
  $('camera-dialog').showModal();
  $('capture-button').disabled = true;
  $('camera-status').textContent = 'Autorisez la caméra dans la demande du navigateur.';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } } });
    if (token !== state.cameraToken) { stream.getTracks().forEach(track => track.stop()); return; }
    state.stream = stream;
    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities?.();
    if (capabilities?.focusMode?.includes('continuous')) {
      // Unsupported camera controls must not prevent the preview from opening.
      track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    }
    $('camera-video').srcObject = stream;
    await $('camera-video').play();
    if (token !== state.cameraToken) return;
    $('capture-button').disabled = false;
    $('camera-status').textContent = 'L’image entière de la caméra est affichée. Gardez l’appareil stable.';
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

async function scanImage(image) {
  openEditor({ ...blankContact(), image, sourceImage:image, rawText: '' });
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
  let phase = { label: 'Préparation du moteur sur votre appareil…', start: 0, end: 25 };
  const cancellation = new Promise((_, reject) => { rejectCancel = reject; });
  const job = { cancel() { cancelled = true; rejectCancel(new Error('cancelled')); worker?.terminate(); } };
  state.ocr = job;
  setEditorBusy(true);
  $('progress-bar').value = 0;
  $('ocr-status').textContent = 'Chargement du moteur de reconnaissance…';
  const timeout = setTimeout(() => job.cancel(), 120000);
  try {
    const operation = (async () => {
      const { createWorker } = await import('tesseract.js');
      if (cancelled) return;
      const root = new URL(`${import.meta.env.BASE_URL}ocr/`, document.baseURI).href;
      worker = await createWorker(['fra', 'eng'], 1, {
        workerPath: `${root}worker.min.js`, corePath: `${root}core/`, langPath: `${root}lang`, workerBlobURL: false,
        errorHandler(error) { rejectCancel(new Error(String(error))); },
        logger(message) {
          if (state.ocr !== job || cancelled) return;
          const recognizing = message.status === 'recognizing text';
          $('ocr-status').textContent = phase.label;
          $('progress-bar').value = recognizing ? phase.start + Math.round((message.progress || 0) * (phase.end - phase.start)) : phase.start;
        },
      });
      if (cancelled) { await worker.terminate(); return; }
      return recognizeCard(worker, image, (label, start, end) => {
        phase = { label, start, end };
        if (!cancelled && state.ocr === job) { $('ocr-status').textContent = label; $('progress-bar').value = start; }
      }, () => cancelled);
    })();
    const result = await Promise.race([operation, cancellation]);
    if (cancelled || state.ocr !== job || !state.draft || !result) return;
    const text = result.text;
    state.draft.rawText = text;
    const extracted = result.extracted;
    // Replace previous automatic suggestions, but preserve human corrections.
    for (const field of fields) {
      if (state.draft.manuallyEditedFields?.includes(field)) continue;
      if (!state.draft[field] || state.draft[field] === state.draft.suggestedFields?.[field]) state.draft[field] = extracted[field];
    }
    state.draft.suggestedFields = extracted;
    if (result.rotation) { state.draft.image = await resizeImage(image, result.rotation); $('card-preview').src = state.draft.image; }
    writeForm(state.draft);
    $('raw-text').textContent = text || 'Aucun texte détecté.';
    $('editor-notice').textContent = !text ? 'Aucun texte lisible détecté. Essayez une photo plus nette ou complétez la fiche à la main.'
      : result.confidence < 75 ? 'Lecture incertaine : vérifiez chaque champ avec la photo, notamment les lettres, chiffres et coordonnées.'
        : 'Plusieurs lectures ont été comparées. Vérifiez les champs proposés et complétez les informations manquantes.';
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
$('camera-dialog').addEventListener('cancel', event => { event.preventDefault(); stopCamera(); });
$('capture-button').addEventListener('click', async () => {
  const video = $('camera-video');
  if (!video.videoWidth || !replaceDraftAllowed()) return;
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 3200 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = canvas.toDataURL('image/jpeg', .95);
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
  try { state.draft.image = await resizeImage(state.draft.image, 90); $('card-preview').src = state.draft.image; queueDraft(); }
  catch { notify('Impossible de pivoter cette image.'); }
  finally { $('rotate-button').disabled = false; }
});
$('reanalyze-button').addEventListener('click', event => { event.preventDefault(); analyzeImage(); });
$('edit-photo').addEventListener('click',()=>{if(state.draft?.image&&!state.ocr){syncDraft();photoEditor.open(state.draft);}});
form.addEventListener('input', event => {
  draftRevision++;
  syncDraft();
  if (state.draft && fields.includes(event.target.name)) {
    state.draft.manuallyEditedFields = [...new Set([...(state.draft.manuallyEditedFields || []), event.target.name])];
  }
  $('draft-status').textContent = state.temporary ? 'Brouillon en mémoire uniquement' : 'Sauvegarde…';
  clearTimeout(draftTimer);
  draftTimer = setTimeout(queueDraft, 250);
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (state.ocr || !state.draft) return;
  syncDraft();
  if (!fields.some(field => state.draft[field]) && !state.draft.image) { notify('Renseignez au moins une information ou ajoutez une photo pour enregistrer une fiche.'); return; }
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
  const previous=state.contacts.find(contact=>contact.id===editing);
  const contact = { ...state.draft, id: editing || crypto.randomUUID(), createdAt:previous?.createdAt||previous?.updatedAt||Date.now(), updatedAt: Date.now() };
  delete contact.editingId;
  const activity=makeEvent(editing?(contact.image!==previous?.image?'photo':'edit'):(contact.image?'scan':'add'),contact);
  try { await storage.saveContact(contact,activity); } catch { storageFailed(); }
  state.contacts = [contact, ...state.contacts.filter(item => item.id !== contact.id)];
  state.history.unshift(activity);
  state.draft = null;
  editor.close();
  setView('catalogue');
  notify(editing ? 'Contact modifié.' : 'Contact ajouté au carnet.');
});
$('search-input').addEventListener('input', render);
for(const id of ['catalogue-sort','catalogue-filter'])$(id).addEventListener('change',render);
document.querySelectorAll('.app-nav button').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
$('history-list').addEventListener('click',event=>{const button=event.target.closest('.history-open');if(button){const contact=state.contacts.find(contact=>contact.id===button.dataset.id);if(contact)openCard(contact);}});
$('close-card').addEventListener('click',()=>$('card-dialog').close());
$('detail-edit').addEventListener('click',()=>{
  const contact=state.contacts.find(contact=>contact.id===state.detailId);if(!contact||!replaceDraftAllowed())return;
  $('card-dialog').close();openEditor({...contact,editingId:contact.id});
});
$('detail-export').addEventListener('click',()=>{const contact=state.contacts.find(contact=>contact.id===state.detailId);if(contact)downloadContacts([contact]);});
$('download-photo').addEventListener('click',()=>{
  const contact=state.contacts.find(contact=>contact.id===state.detailId);if(!safePhoto(contact?.image))return;
  const a=document.createElement('a');a.href=contact.image;a.download=`minibcr-carte-${contact.id}.jpg`;document.body.append(a);a.click();a.remove();
});
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
  if(event.target.closest('.view-card'))openCard(contact);
  if (event.target.closest('.edit-contact')) {
    if (state.draft?.editingId === contact.id) openEditor(state.draft);
    else if (replaceDraftAllowed()) openEditor({ ...contact, editingId: contact.id });
  }
  if (event.target.closest('.download-contact')) downloadContacts([contact]);
  if (event.target.closest('.delete-contact')) {
    if (!window.confirm(`Supprimer ${contactName(contact)} de ce navigateur ?`)) return;
    const activity=makeEvent('delete',contact);
    try { await storage.deleteContact(contact.id,activity); }
    catch { storageFailed(); notify('La suppression locale a échoué. Le contact est conservé ; réessayez.'); return; }
    state.contacts = state.contacts.filter(item => item.id !== contact.id);
    state.history.unshift(activity);
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
  if (!window.confirm('Effacer toutes les fiches, leurs photos, l’historique et le brouillon de ce navigateur ? Pensez à sauvegarder le catalogue avant de continuer.')) return;
  clearTimeout(draftTimer);
  await draftQueue;
  try { await storage.clearData(); }
  catch { storageFailed(); notify('L’effacement local a échoué. Réessayez ou effacez les données du site dans votre navigateur.'); return; }
  state.contacts = []; state.history=[]; state.selected.clear(); state.draft = null;
  render(); notify('Contacts et brouillon effacés de ce navigateur.');
});
$('backup-button').addEventListener('click',()=>{
  const backup={application:'MiniBCR',version:1,exportedAt:new Date().toISOString(),contacts:state.contacts,history:state.history};
  const url=URL.createObjectURL(new Blob([JSON.stringify(backup)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`minibcr-catalogue-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  notify('Catalogue sauvegardé avec les photos et l’historique. Conservez ce fichier dans un endroit sûr.');
});
$('restore-button').addEventListener('click',()=>$('backup-input').click());
$('backup-input').addEventListener('change',async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  try{
    if(file.size>120000000)throw new Error('La sauvegarde dépasse 120 Mo.');
    const backup=parseCatalogueBackup(await file.text());
    const contacts=backup.contacts.filter(contact=>!state.contacts.some(existing=>existing.id===contact.id));
    const events=backup.history.filter(event=>!state.history.some(existing=>existing.id===event.id));
    const restored=contacts.map(contact=>makeEvent('restore',contact));
    await storage.restoreCatalogue(contacts,[...events,...restored]);
    state.contacts.push(...contacts);state.history.push(...events,...restored);setView('catalogue');
    notify(`${contacts.length} fiche(s) restaurée(s). Les fiches déjà présentes ont été conservées.`);
  }catch(error){notify(`Restauration impossible : ${error.message}`);}
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
    state.history=await storage.getHistory();
    state.view=state.contacts.length?'catalogue':'scan';
  } catch { storageFailed(); }
  controls.forEach(id => { $(id).disabled = false; });
  render();
}
initialize();
initializePWA({beforeUpdate:async()=>{
  if(state.ocr)throw new Error('Analyse en cours.');
  if(editor.open){syncDraft();await queueDraft();if(state.temporary)throw new Error('Sauvegarde indisponible.');}
}});
