(function (root) {
  'use strict';
  let database;
  function open() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('lyric-motion-recovery', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('work');
      request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); database = null; }; resolve(db); };
      request.onerror = () => { database = null; reject(request.error); };
      request.onblocked = () => { database = null; reject(new Error('他のタブで保存領域を使用しています。')); };
    });
    return database;
  }
  async function read() {
    const db = await open(); return new Promise((resolve, reject) => {
      const transaction = db.transaction('work', 'readonly'), store = transaction.objectStore('work'), results = {};
      for (const key of ['state', 'audio', 'reference']) { const request = store.get(key); request.onsuccess = () => { results[key] = request.result || null; }; }
      transaction.oncomplete = () => resolve(results); transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('復帰データの読み込みに失敗しました。'));
    });
  }
  async function write(state, changes = {}) {
    const db = await open(); return new Promise((resolve, reject) => {
      const transaction = db.transaction('work', 'readwrite'), store = transaction.objectStore('work'); store.put(state, 'state');
      for (const key of ['audio', 'reference']) if (Object.hasOwn(changes, key)) { if (changes[key]) store.put(changes[key], key); else store.delete(key); }
      transaction.oncomplete = resolve; transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('自動保存に失敗しました。'));
    });
  }
  async function clear() {
    const db = await open(); return new Promise((resolve, reject) => { const transaction = db.transaction('work', 'readwrite'); transaction.objectStore('work').clear(); transaction.oncomplete = resolve; transaction.onabort = transaction.onerror = () => reject(transaction.error); });
  }
  root.LyricMotionRecovery = { read, write, clear };
})(globalThis);
