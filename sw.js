'use strict';
// Service worker: guarda o app e as perguntas no aparelho para uso offline.
// Estratégia "rede primeiro": com internet, busca sempre a versão mais nova (revalidando, sem usar o cache HTTP);
// sem internet, ou se a rede demorar demais, usa a cópia guardada.
const CACHE = 'clf-c02-v2';
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
const LIMITE_REDE_MS = 4000;

self.addEventListener('install', (e) => {
  // 'reload' ignora o cache HTTP, para não guardar uma cópia velha como se fosse nova.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function comLimite(promessa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('rede lenta')), ms);
    promessa.then((v) => { clearTimeout(t); resolve(v); }, (err) => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const resp = await comLimite(fetch(req, { cache: 'no-cache' }), LIMITE_REDE_MS);
        if (resp && resp.ok) cache.put(req, resp.clone());
        return resp;
      } catch (erro) {
        const guardada = await cache.match(req, { ignoreSearch: true });
        if (guardada) return guardada;
        if (req.mode === 'navigate') {
          const inicio = await cache.match('index.html');
          if (inicio) return inicio;
        }
        return Response.error();
      }
    })
  );
});
