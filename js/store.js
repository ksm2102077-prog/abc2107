/*
 * 反射ガイド — 端末内への保存（IndexedDB）
 * 使えない環境（プライベートブラウズ等）では、メモリ上にだけ保持して動作を続ける。
 */
(function (root) {
  'use strict';
  const DB_NAME = 'reflect-guide';
  const DB_VER = 1;
  const STORES = ['kv', 'images', 'layouts'];
  let dbPromise = null;
  const mem = { kv: new Map(), images: new Map(), layouts: new Map() };
  let useMem = false;

  function open() {
    if (useMem) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VER);
      } catch (e) {
        useMem = true;
        resolve(null);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { useMem = true; resolve(null); };
      req.onblocked = () => { useMem = true; resolve(null); };
    });
    return dbPromise;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    if (!db) return fn(null, mem[store]);
    return new Promise((resolve, reject) => {
      let result;
      try {
        const t = db.transaction(store, mode);
        const os = t.objectStore(store);
        result = fn(os, null);
        t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  function wrap(req) { return { __req: req }; }

  const api = {
    async get(store, key) {
      try {
        return await tx(store, 'readonly', (os, m) => (os ? wrap(os.get(key)) : m.get(key)));
      } catch (e) { return undefined; }
    },
    async set(store, key, value) {
      try {
        await tx(store, 'readwrite', (os, m) => (os ? wrap(os.put(value, key)) : m.set(key, value)));
        return true;
      } catch (e) {
        mem[store].set(key, value);
        return false;
      }
    },
    async del(store, key) {
      try {
        await tx(store, 'readwrite', (os, m) => (os ? wrap(os.delete(key)) : m.delete(key)));
      } catch (e) { /* noop */ }
    },
    async all(store) {
      try {
        const db = await open();
        if (!db) return Array.from(mem[store].entries()).map(([key, value]) => ({ key, value }));
        return await new Promise((resolve, reject) => {
          const out = [];
          const t = db.transaction(store, 'readonly');
          const req = t.objectStore(store).openCursor();
          req.onsuccess = () => {
            const c = req.result;
            if (c) { out.push({ key: c.key, value: c.value }); c.continue(); } else resolve(out);
          };
          req.onerror = () => reject(req.error);
        });
      } catch (e) { return []; }
    },
    async clearAll() {
      for (const s of STORES) {
        try { await tx(s, 'readwrite', (os, m) => (os ? wrap(os.clear()) : m.clear())); } catch (e) { /* noop */ }
      }
    },
    isMemoryOnly() { return useMem; },
  };

  // 小さな設定値は localStorage（使えなければ無視）
  api.local = {
    get(key, fallback) {
      try {
        const v = root.localStorage.getItem('rg:' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { root.localStorage.setItem('rg:' + key, JSON.stringify(value)); } catch (e) { /* noop */ }
    },
  };

  root.RG = root.RG || {};
  root.RG.store = api;
})(typeof self !== 'undefined' ? self : this);
