export const fields = ['firstName', 'lastName', 'organization', 'title', 'phones', 'emails', 'website', 'address', 'notes'];
export const blankContact = () => Object.fromEntries(fields.map(key => [key, '']));
const unique = values => [...new Set(values.map(value => value.trim()).filter(Boolean))];

const fold = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const letters = value => fold(value).replace(/[^a-z]/g, '');
const commonTLDs = new Set('fr com org net io eu co dev be ch uk de it es info biz app ai tech design agency studio consulting solutions me pro ca us nl lu pt at tv online site shop paris bzh alsace re au nz ie se no dk fi pl cz in jp cn'.split(' '));
const emailPattern = /[a-z0-9_%+'-]+(?:[ \t]*\.[ \t]*[a-z0-9_%+'-]+)*[ \t]*@[ \t]*(?:[a-z0-9-]+[ \t]*\.[ \t]*)+[a-z]{2,63}/gi;
const urlPattern = /(?:https?[ \t]*:[ \t]*\/[ \t]*\/[ \t]*|www[ \t]*\.[ \t]*)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?[ \t]*\.[ \t]*)+[a-z]{2,63}(?::\d{2,5})?(?:\/[^\s<>]*)?/gi;

export function normalizeOCRText(text) {
  return String(text).normalize('NFKC').replace(/\r\n?/g, '\n')
    .replace(/[\u200b-\u200d\ufeff]/g, '').replace(/[‐‑‒–—−]/g, '-')
    .replace(/\[(?:at|arobase)\]|\((?:at|arobase)\)/gi, '@')
    .replace(/\[(?:dot|point)\]|\((?:dot|point)\)/gi, '.')
    .split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).join('\n');
}

function coordinates(text) {
  const emails = unique((text.match(emailPattern) || []).map(value => value.replace(/\s/g, '').toLowerCase()));
  // Remove entire email spans before finding URLs, including malformed email hosts.
  const withoutEmails = text.replace(emailPattern, ' ').replace(/\S*@\S*/g, ' ');
  const websites = unique((withoutEmails.match(urlPattern) || []).map(value => value.replace(/\s/g, '').replace(/[.,;!?)+]+$/, ''))
    .filter(value => /^https?:\/\//i.test(value) || /^www\./i.test(value) || commonTLDs.has(value.split('/')[0].split(':')[0].split('.').at(-1).toLowerCase())));
  const phones = [];
  for (const line of withoutEmails.replace(urlPattern, ' ').split('\n')) {
    const labelled = /(?:^|[\s:;|])(?:t[eé]l(?:[eé]phone)?|telephone|phone|mobile|mob|fax|portable|cell|direct|t|m)\b\.?\s*[:.]?\s*(?=[+\d(OoIl|])/i.test(line);
    if (/\b(siret|siren|tva|vat|rcs|iban|s\/?n)\b/i.test(line) && !labelled) continue;
    for (const segment of line.split(/[;•·]|\s+\/\s+/)) {
      const pattern = labelled ? /(?:\+|00)?[\dOoIl|][\dOoIl| \t().-]{5,}[\dOoIl|]/g : /(?:\+|00)?\d[\d \t().-]{5,}\d/g;
      for (let value of segment.match(pattern) || []) {
        if (/^\d{4}-\d{2}-\d{2}$|^\d{2}[./-]\d{2}[./-]\d{4}$|^\d{1,3}(?:\.\d{1,3}){3}$/.test(value.trim())) continue;
        if (labelled) value = value.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1');
        value = value.trim().replace(/^(\+\d{1,3})\s*\(0\)\s*/, '$1 ').replace(/^00/, '+');
        const digits = value.replace(/\D/g, '');
        if (digits.length >= (labelled ? 7 : 9) && digits.length <= 15) phones.push(value);
      }
    }
  }
  const seen = new Set();
  return { emails, websites, phones: phones.filter(value => {
    const key = value.replace(/\D/g, '');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }) };
}

function splitName(name) {
  const words = name.replace(/^(?:M(?:me|lle)?\.?|Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Pr\.?)\s+/i, '').trim().split(/\s+/);
  const upper = word => /\p{L}/u.test(word) && word === word.toLocaleUpperCase('fr');
  let firstUpper = 0;
  while (firstUpper < words.length && upper(words[firstUpper])) firstUpper++;
  // DUPONT Jean-Pierre, as well as Jean-Pierre DUPONT.
  if (firstUpper && firstUpper < words.length) return { lastName: words.slice(0, firstUpper).join(' '), firstName: words.slice(firstUpper).join(' ') };
  return { firstName: words[0] || '', lastName: words.slice(1).join(' ') };
}

// Geometric hints and email spellings resolve some ambiguities. Uncertain fields
// remain empty; we never apply phone-specific O/0 substitutions to people's names.
export function extractContact(input, layoutLines = []) {
  const text = normalizeOCRText(input);
  const result = blankContact();
  const lines = text.split('\n').filter(Boolean);
  const { emails, websites, phones } = coordinates(text);
  result.emails = emails.join('\n'); result.phones = phones.join('\n'); result.website = websites[0] || '';
  const job = /\b(direct(?:eur|rice|or)|responsable|manager|ingenieur|engineer|developpeu[rs]e?|developer|designer|consultant[e]?|fondateur|fondatrice|founder|cofondateur|ceo|cto|coo|cfo|president|commercial[e]?|architecte|avocat[e]?|medecin|marketing|sales|chef|charge[e]?|photographe|photographer|artisan|accountant|comptable|gerant[e]?|owner|partner|partenaire|product|ux|ui|rh|recrutement|recruiter)\b/i;
  const company = /\b(sas|sarl|sasu|eurl|inc|ltd|llc|groupe|group|studio|agence|agency|solutions|technologies|conseil|consulting|cabinet|atelier|collectif|association)\b/i;
  const street = /\b(rue|avenue|av\.|boulevard|bd\.|route|chemin|place|impasse|allee|street|road|lane|drive|cedex|bp\s*\d)\b/i;
  const postal = /^(?:[a-z]{1,2}-)?\d{4,6}\s+\p{L}|\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/u;
  const addressIndexes = new Set();
  lines.forEach((line, index) => {
    if (street.test(fold(line)) || postal.test(line)) {
      addressIndexes.add(index);
      const next = lines[index + 1];
      if (next && (postal.test(next) || /^(france|belgique|suisse|united kingdom|germany|italia|espana|canada|usa)$/i.test(next))) addressIndexes.add(index + 1);
    }
  });
  result.address = lines.filter((_, index) => addressIndexes.has(index)).join('\n');
  const candidates = lines.filter((line, index) => !addressIndexes.has(index) && !/[@\d]/.test(line)
    && !coordinates(line).websites.length
    && !/^(?:t[eé]l(?:[eé]phone)?|tel|mobile|fax|email|e-mail|contact|www|web|site)\s*[:.]/i.test(line));
  result.title = candidates.find(line => job.test(fold(line))) || '';
  result.organization = candidates.find(line => company.test(fold(line)) && line !== result.title) || '';
  const domainStems = [...emails.map(value => value.split('@')[1]), ...websites.map(value => value.replace(/^https?:\/\/(?:www\.)?|^www\./i, '').split('/')[0])]
    .map(value => value.split('.')[0]).filter(stem => stem.length > 3 && !/^(gmail|outlook|hotmail|yahoo|orange|icloud|proton|wanadoo|exemple|example)$/i.test(stem));
  if (!result.organization) {
    result.organization = candidates.find(line => line !== result.title && domainStems.some(stem => letters(line).startsWith(letters(stem)))) || '';
  }
  const identityLines = candidates.filter(line => line !== result.title && line !== result.organization);
  const names = identityLines
    .filter(line => /^(?:[\p{L}’'.-]+\s+){1,5}[\p{L}’'.-]+$/u.test(line));
  if (!names.length && identityLines.length === 2 && identityLines.every(line => /^[\p{L}’'-]{2,}$/u.test(line))) {
    names.push(identityLines.join(' '));
  }
  const localNames = emails.map(email => email.split('@')[0]).filter(local => !/^(contact|bonjour|hello|info|office|sales|support|admin)$/i.test(local));
  const ranked = names.map(line => {
    const tokens = line.split(/\s+/).map(letters).filter(token => token.length > 2);
    const matchesEmail = localNames.some(local => tokens.filter(token => letters(local).includes(token)).length >= 2);
    const height = layoutLines.find(item => letters(item.text) === letters(line))?.height || 0;
    const heights = layoutLines.filter(item => item.height > 0).map(item => item.height).sort((a,b) => a-b);
    const median = heights[Math.floor(heights.length / 2)] || 0;
    return { line, score: (matchesEmail ? 5 : 0) + (median && height > median * 1.25 ? 3 : 0) };
  }).sort((a,b) => b.score - a.score);
  if (ranked.length === 1 || (ranked[0]?.score >= 3 && ranked[0].score > (ranked[1]?.score || 0))) {
    Object.assign(result, splitName(ranked[0].line));
  }
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
