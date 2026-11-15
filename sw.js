'use strict';
// Service worker: guarda o app e as perguntas no aparelho para uso offline.
// Estratégia "stale-while-revalidate": responde do cache na hora e atualiza em segundo plano.
const CACHE = 'clf-c02-v1';
const ARQUIVOS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'data/questions.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const emCache = await cache.match(req, { ignoreSearch: true });
      const rede = fetch(req)
        .then((resp) => {
          if (resp && resp.ok) cache.put(req, resp.clone());
          return resp;
        })
        .catch(() => null);
      if (emCache) {
        e.waitUntil(rede);
        return emCache;
      }
      return (await rede) || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
    })
  );
});
