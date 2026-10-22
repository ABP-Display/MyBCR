import { blankContact, fields, contactName } from './contacts.js';
import { validCorners } from './photo.js';

export const eventLabels = { scan:'Carte scannée', add:'Contact ajouté', edit:'Informations modifiées', photo:'Photo retouchée', delete:'Fiche supprimée', restore:'Fiche restaurée' };
export const makeEvent = (kind, contact) => ({ id:crypto.randomUUID(), kind, contactId:contact.id, name:contactName(contact), timestamp:Date.now() });
const photoPattern=/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export function safePhoto(value) { return typeof value==='string' && value.length<=15000000 && photoPattern.test(value); }

export function parseCatalogueBackup(text) {
  if(text.length>120000000) throw new Error('La sauvegarde dépasse 120 Mo.');
  let backup;
  try{backup=JSON.parse(text);}catch{throw new Error('Ce fichier JSON est illisible.');}
  if(backup?.application!=='MiniBCR'||backup.version!==1||!Array.isArray(backup.contacts)||!Array.isArray(backup.history)||backup.contacts.length>5000||backup.history.length>50000) throw new Error('Ce fichier n’est pas une sauvegarde MiniBCR compatible.');
  const contacts=backup.contacts.map(item=>{
    if(!item||typeof item.id!=='string'||!item.id||item.id.length>100)throw new Error('Une fiche de la sauvegarde est invalide.');
    const contact={...blankContact(),id:item.id};
    for(const field of fields) {if(typeof item[field]!=='string'||item[field].length>10000)throw new Error('Les informations d’une fiche sont invalides.');contact[field]=item[field];}
    for(const key of ['image','sourceImage']) if(item[key]) {if(!safePhoto(item[key]))throw new Error('Une photo de la sauvegarde est invalide.');contact[key]=item[key];}
    for(const key of ['createdAt','updatedAt']) contact[key]=Number.isFinite(item[key])&&item[key]>=0?item[key]:Date.now();
    if(typeof item.rawText==='string')contact.rawText=item.rawText.slice(0,100000);
    if(Array.isArray(item.manuallyEditedFields))contact.manuallyEditedFields=item.manuallyEditedFields.filter(field=>fields.includes(field));
    if(item.suggestedFields&&typeof item.suggestedFields==='object')contact.suggestedFields=Object.fromEntries(fields.filter(field=>typeof item.suggestedFields[field]==='string').map(field=>[field,item.suggestedFields[field].slice(0,10000)]));
    if(item.photoEdits&&validCorners(item.photoEdits.corners||[])&&['auto','1.545454545','1','0.647058824'].includes(item.photoEdits.ratio))contact.photoEdits={corners:item.photoEdits.corners.map(({x,y})=>({x,y})),rotation:[0,90,180,270].includes(item.photoEdits.rotation)?item.photoEdits.rotation:0,enhance:!!item.photoEdits.enhance,ratio:item.photoEdits.ratio,editedAt:Number(item.photoEdits.editedAt)||0};
    return contact;
  });
  if(new Set(contacts.map(contact=>contact.id)).size!==contacts.length)throw new Error('La sauvegarde contient des identifiants de fiches en double.');
  const history=backup.history.map(event=>{
    if(!event||!Object.hasOwn(eventLabels,event.kind)||typeof event.id!=='string'||!event.id||event.id.length>100||typeof event.contactId!=='string'||event.contactId.length>100||typeof event.name!=='string'||event.name.length>1000||!Number.isFinite(event.timestamp)||event.timestamp<0)throw new Error('L’historique de la sauvegarde est invalide.');
    return {id:event.id,kind:event.kind,contactId:event.contactId,name:event.name,timestamp:event.timestamp};
  });
  if(new Set(history.map(event=>event.id)).size!==history.length)throw new Error('L’historique contient des identifiants en double.');
  return {contacts,history};
}
