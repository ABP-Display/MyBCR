import test from 'node:test';
import assert from 'node:assert/strict';
import { blankContact, extractContact, toVCard } from '../src/contacts.js';

test('extracts multiple phones and emails without crossing line boundaries', () => {
  const contact = extractContact('Camille Martin\nStudio Horizon SAS\nDirectrice artistique\n+33 6 12 34 56 78\n01 42 12 34 56\ncamille@horizon.fr\ncontact@horizon.fr\nwww.horizon.fr\n12 rue des Lilas\n75011 Paris');
  assert.equal(contact.firstName, 'Camille');
  assert.equal(contact.lastName, 'Martin');
  assert.equal(contact.organization, 'Studio Horizon SAS');
  assert.equal(contact.title, 'Directrice artistique');
  assert.equal(contact.phones, '+33 6 12 34 56 78\n01 42 12 34 56');
  assert.equal(contact.emails, 'camille@horizon.fr\ncontact@horizon.fr');
  assert.equal(contact.website, 'www.horizon.fr');
  assert.equal(contact.address, '12 rue des Lilas\n75011 Paris');
});

test('does not invent a person from ambiguous name and company lines', () => {
  const contact = extractContact('Camille Martin\nHorizon Créatif\nbonjour@exemple.fr');
  assert.equal(contact.firstName, '');
  assert.equal(contact.lastName, '');
  assert.equal(contact.website, '');
  assert.equal(contact.emails, 'bonjour@exemple.fr');
});

test('recovers spaced email and website, preserving a new domain extension', () => {
  const contact = extractContact('Élise BERNARD\nAtelier Lumen\nArchitecte\nEmail : elise . bernard @ lumen . design\nWeb : https : // www . lumen . design/projets\nTél : +33 (0)6 12 34 56 78');
  assert.equal(contact.firstName, 'Élise');
  assert.equal(contact.lastName, 'BERNARD');
  assert.equal(contact.emails, 'elise.bernard@lumen.design');
  assert.equal(contact.website, 'https://www.lumen.design/projets');
  assert.equal(contact.phones, '+33 6 12 34 56 78');
});

test('handles OCR digit confusion only in labelled phone numbers', () => {
  const contact = extractContact('Olivier Blanc\nCabinet Nova\nTél. : O1 42 1o 2O 3O\nMobile: +33 6 I2 34 56 78\nFax: 01.42.10.20.30\nSIRET : 12345678901234\nTVA FR 123456789\nDate 2026-10-21');
  assert.equal(contact.firstName, 'Olivier');
  assert.equal(contact.phones, '01 42 10 20 30\n+33 6 12 34 56 78');
});

test('recognizes UK and international phones and does not turn email domains into websites', () => {
  const contact = extractContact('John Smith\nNorth Wave Ltd\nSales Director\nT: +44 (0)20 7946 0958 / +1 (415) 555-0123\njohn.smith@northwave.co.uk\nwww.northwave.co.uk');
  assert.equal(contact.firstName, 'John');
  assert.equal(contact.phones, '+44 20 7946 0958\n+1 (415) 555-0123');
  assert.equal(contact.emails, 'john.smith@northwave.co.uk');
  assert.equal(contact.website, 'www.northwave.co.uk');
});

test('uses email and typography to distinguish a person from an unknown brand', () => {
  const contact = extractContact('JEAN-PIERRE DUPONT\nHorizon Créatif\nChef de projet\njean-pierre.dupont@exemple.fr', [
    { text: 'JEAN-PIERRE DUPONT', height: 56 }, { text: 'Horizon Créatif', height: 22 }, { text: 'Chef de projet', height: 20 }, { text: 'jean-pierre.dupont@exemple.fr', height: 20 },
  ]);
  assert.equal(contact.firstName, 'JEAN-PIERRE');
  assert.equal(contact.lastName, 'DUPONT');
});

test('supports surname-first and separate first/last name lines', () => {
  assert.deepEqual(Object.fromEntries(['firstName', 'lastName'].map(key => [key, extractContact('DUPONT Jean-Pierre\nStudio Horizon SAS')[key]])), { firstName: 'Jean-Pierre', lastName: 'DUPONT' });
  const contact = extractContact('Camille\nMartin\nStudio Horizon SAS\nDesigner');
  assert.equal(contact.firstName, 'Camille');
  assert.equal(contact.lastName, 'Martin');
});

test('keeps postal addresses out of name candidates', () => {
  const contact = extractContact('Camille Martin\nStudio Horizon SAS\n12 avenue des Arts\n75011 Paris\nFrance\ncamille@horizon.fr');
  assert.equal(contact.firstName, 'Camille');
  assert.equal(contact.address, '12 avenue des Arts\n75011 Paris\nFrance');
});

test('vCard escapes values to prevent field injection and supports multiple contacts', () => {
  const first = { ...blankContact(), firstName: 'Zoé', lastName: 'Dupré', organization: 'Studio; A,B\\C', notes: 'hello\r\nEND:VCARD\nBEGIN:VCARD', phones: '+33 6 12 34 56 78\n01 42 12 34 56', emails: 'zoe@exemple.fr\ncontact@exemple.fr', address: '1 rue du Test\nParis' };
  const output = toVCard([first, { ...blankContact(), organization: 'Second' }]);
  assert.equal((output.match(/^BEGIN:VCARD\r$/gm) || []).length, 2);
  assert.match(output, /N:Dupré;Zoé;;;/);
  assert.ok(output.includes('ORG:Studio\\; A\\,B\\\\C'));
  assert.ok(output.includes('NOTE:hello\\nEND:VCARD\\nBEGIN:VCARD'));
  assert.ok(output.includes('ADR;TYPE=WORK:;;1 rue du Test\\nParis;;;;'));
  assert.equal((output.match(/TEL;TYPE=VOICE:/g) || []).length, 2);
  assert.equal((output.match(/EMAIL;TYPE=INTERNET:/g) || []).length, 2);
});

test('vCard folds long Unicode lines at 75 octets without corrupting text', () => {
  const notes = 'Éléphant 🐘 '.repeat(30);
  const output = toVCard([{ ...blankContact(), firstName: 'Test', notes }]);
  for (const line of output.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
  assert.ok(output.replace(/\r\n /g, '').includes(`NOTE:${notes}`));
  assert.ok(output.endsWith('END:VCARD\r\n'));
});
