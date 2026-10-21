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
