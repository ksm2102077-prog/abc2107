/*
 * 反射ガイド — オフライン用 Service Worker
 * 一度開けば、電波がなくても起動できるようにアプリ本体をキャッシュする。
 * アプリを更新したら CACHE の番号を上げる。
 */
const CACHE = 'reflect-guide-v1';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/physics.js',
  './js/detect.js',
  './js/store.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 同じサイトの GET だけを扱う。先にネットを見て、つながらなければキャッシュを返す（更新がすぐ届くように）。
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const fromCache = () => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'));
  const network = fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  });
  // 電波が弱い時に待たされないよう、3秒でキャッシュに切り替える
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000)).then(fromCache);
  event.respondWith(
    Promise.race([network, timeout])
      .then((res) => res || network)
      .catch(fromCache)
  );
});
