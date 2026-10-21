export const fields = ['firstName', 'lastName', 'organization', 'title', 'phones', 'emails', 'website', 'address', 'notes'];
export const blankContact = () => Object.fromEntries(fields.map(key => [key, '']));
const unique = values => [...new Set(values.map(value => value.trim()).filter(Boolean))];

// Deliberately conservative: ambiguous lines remain visible in the original text.
// Names, organizations and job titles are suggestions requiring human validation.
export function extractContact(text) {
  const result = blankContact();
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const emails = unique(text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) || []);
  const phonePattern = /(?:\+|00)?\d[\d \t().-]{6,}\d/g;
  const phones = unique((text.match(phonePattern) || []).filter(value => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 15;
  }));
  const websites = unique((text.match(/(?:https?:\/\/|www\.)[^\s<>]+|\b(?:[\w-]+\.)+(?:fr|com|org|net|io|eu|co|dev|be|ch)\b(?:\/[^\s<>]*)?/gi) || [])
    .filter(value => !emails.some(email => email.includes(value)))
    .map(value => value.replace(/[.,;]+$/, '')));
  result.emails = emails.join('\n');
  result.phones = phones.join('\n');
  result.website = websites[0] || '';
  const job = /\b(direct(?:eur|rice|or)|responsable|manager|ingénieur|engineer|développeu[rs]|developer|designer|consultant[e]?|fondateur|fondatrice|founder|cofondateur|ceo|cto|président|president|commercial[e]?|architecte|avocat|médecin|marketing|sales|chef|chargé[e]?)\b/i;
  const company = /\b(sas|sarl|sasu|eurl|inc|ltd|llc|groupe|group|studio|agence|agency|solutions|technologies|conseil|consulting)\b/i;
  const address = /^(?:\d+[\s,]+.*(?:rue|avenue|boulevard|route|chemin|place|street|road|way|lane)|\d{5}\s+\p{L})|\b(?:rue|avenue|boulevard|street|cedex|bp\s*\d)\b/iu;
  const candidates = lines.filter(line => !line.includes('@') && !/https?:|www\./i.test(line)
    && !websites.some(site => line.includes(site)) && !/\d/.test(line)
    && !/^(?:tél(?:éphone)?|tel|mobile|fax|email|e-mail|contact|www)\s*[:.]/i.test(line));
  result.title = candidates.find(line => job.test(line)) || '';
  result.organization = candidates.find(line => company.test(line) && line !== result.title) || '';
  const nameCandidates = candidates.filter(line => line !== result.title && line !== result.organization)
    .filter(line => /^(?:[\p{L}’'.-]+\s+){1,3}[\p{L}’'.-]+$/u.test(line));
  // Only suggest a name if exactly one plausible person remains.
  if (nameCandidates.length === 1) {
    const [first, ...rest] = nameCandidates[0].split(/\s+/);
    result.firstName = first;
    result.lastName = rest.join(' ');
  }
  result.address = lines.filter(line => address.test(line)).join('\n');
  return result;
}

export function contactName(contact) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.organization || contact.emails || 'Contact sans nom';
}

export function escapeVCard(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

// vCard lines must be folded at 75 UTF-8 octets, without splitting a code point.
function foldLine(line) {
  let output = '', octets = 0;
  const encoder = new TextEncoder();
  for (const char of line) {
    const length = encoder.encode(char).length;
    if (octets + length > 75) { output += '\r\n '; octets = 1; }
    output += char;
    octets += length;
  }
  return output;
}

export function toVCard(contacts) {
  return contacts.map(contact => {
    const escape = escapeVCard;
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escape(contactName(contact))}`,
      `N:${escape(contact.lastName)};${escape(contact.firstName)};;;`];
    if (contact.organization) lines.push(`ORG:${escape(contact.organization)}`);
    if (contact.title) lines.push(`TITLE:${escape(contact.title)}`);
    for (const phone of unique((contact.phones || '').split('\n'))) lines.push(`TEL;TYPE=VOICE:${escape(phone)}`);
    for (const email of unique((contact.emails || '').split('\n'))) lines.push(`EMAIL;TYPE=INTERNET:${escape(email)}`);
    if (contact.website) lines.push(`URL:${escape(/^[a-z][a-z\d+.-]*:/i.test(contact.website) ? contact.website : `https://${contact.website}`)}`);
    if (contact.address) lines.push(`ADR;TYPE=WORK:;;${escape(contact.address)};;;;`);
    if (contact.notes) lines.push(`NOTE:${escape(contact.notes)}`);
    lines.push('END:VCARD');
    return lines.map(foldLine).join('\r\n');
  }).join('\r\n') + '\r\n';
}
