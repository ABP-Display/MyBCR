const databaseName = 'minibcr';
let connection;

export function openDatabase() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('contacts')) db.createObjectStore('contacts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
      if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = undefined; };
      resolve(db);
    };
    request.onerror = () => { connection = undefined; reject(request.error); };
    request.onblocked = () => { connection = undefined; reject(new Error('Stockage bloqué par un autre onglet.')); };
  });
  return connection;
}

async function transaction(stores, mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let request;
    try { request = operation(tx); } catch (error) { tx.abort(); reject(error); return; }
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Sauvegarde interrompue.'));
  });
}

export const getContacts = () => transaction(['contacts'], 'readonly', tx => tx.objectStore('contacts').getAll());
export const getDraft = () => transaction(['settings'], 'readonly', tx => tx.objectStore('settings').get('draft'));
export const saveDraft = draft => transaction(['settings'], 'readwrite', tx => draft
  ? tx.objectStore('settings').put(draft, 'draft') : tx.objectStore('settings').delete('draft'));
export const getHistory = () => transaction(['history'], 'readonly', tx => tx.objectStore('history').getAll());
export const saveContact = (contact, event) => transaction(['contacts', 'settings', 'history'], 'readwrite', tx => {
  tx.objectStore('contacts').put(contact);
  if(event) tx.objectStore('history').put(event);
  tx.objectStore('settings').delete('draft');
});
export const deleteContact = (id, event) => transaction(['contacts', 'history'], 'readwrite', tx => {
  tx.objectStore('contacts').delete(id);
  if(event) tx.objectStore('history').put(event);
});
export const clearData = () => transaction(['contacts', 'settings', 'history'], 'readwrite', tx => {
  tx.objectStore('contacts').clear();
  tx.objectStore('settings').clear();
  tx.objectStore('history').clear();
});

export const restoreCatalogue = (contacts, history) => transaction(['contacts', 'history'], 'readwrite', tx => {
  for(const contact of contacts) tx.objectStore('contacts').put(contact);
  for(const event of history) tx.objectStore('history').put(event);
});
