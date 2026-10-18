import { normalizeEntry } from './core.js';
const DB_NAME = 'starry-wall';
let databasePromise;
function database() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('浏览器不支持本地保存，请使用普通窗口中的现代浏览器。')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences');
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); databasePromise = undefined; };
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('无法打开本地存储。'));
    request.onblocked = () => reject(new Error('其他标签页正在使用旧版本，请关闭后重试。'));
  }).catch(error => { databasePromise = undefined; throw error; });
  return databasePromise;
}
async function transaction(store, mode, operation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    let result;
    const tx = db.transaction(store, mode);
    const request = operation(tx.objectStore(store));
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () => reject(tx.error || request.error || new Error('保存失败，请检查浏览器存储空间后重试。'));
  });
}
export const storage = {
  async load() {
    const [records, preferences] = await Promise.all([
      transaction('entries', 'readonly', store => store.getAll()),
      transaction('preferences', 'readonly', store => store.get('settings')),
    ]);
    let invalidCount = 0;
    const entries = records.flatMap(record => { try { return [normalizeEntry(record)]; } catch { invalidCount++; return []; } });
    return { entries, preferences: preferences || {}, invalidCount };
  },
  saveEntry(entry) { return transaction('entries', 'readwrite', store => store.put(normalizeEntry(entry))); },
  deleteEntry(id) { return transaction('entries', 'readwrite', store => store.delete(id)); },
  savePreferences(preferences) { return transaction('preferences', 'readwrite', store => store.put(structuredClone(preferences), 'settings')); },
};
