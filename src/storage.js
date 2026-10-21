const databaseName = 'minibcr';
let connection;

export function openDatabase() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('contacts', { keyPath: 'id' });
      db.createObjectStore('settings');
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
    try { request = operation(tx); } catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Sauvegarde interrompue.'));
  });
}

export const getContacts = () => transaction(['contacts'], 'readonly', tx => tx.objectStore('contacts').getAll());
export const getDraft = () => transaction(['settings'], 'readonly', tx => tx.objectStore('settings').get('draft'));
export const saveDraft = draft => transaction(['settings'], 'readwrite', tx => draft
  ? tx.objectStore('settings').put(draft, 'draft') : tx.objectStore('settings').delete('draft'));
export const saveContact = contact => transaction(['contacts', 'settings'], 'readwrite', tx => {
  tx.objectStore('contacts').put(contact);
  tx.objectStore('settings').delete('draft');
});
export const deleteContact = id => transaction(['contacts'], 'readwrite', tx => tx.objectStore('contacts').delete(id));
export const clearData = () => transaction(['contacts', 'settings'], 'readwrite', tx => {
  tx.objectStore('contacts').clear();
  tx.objectStore('settings').clear();
});
