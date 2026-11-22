// Service worker: gemmer appen og alle filer fra offline-filer.json, saa den virker uden net.
// VERSION opdateres af lav-offline-liste.ps1; en ny version henter og gemmer alle filer paa ny.
const VERSION = '20261122-170952';
const CACHE = 'bordplan-' + VERSION;

self.addEventListener('install', e => e.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  let files = [];
  try { files = (await (await fetch('offline-filer.json', { cache: 'no-store' })).json()).files || []; } catch (err) {}
  // en fil der mangler maa ikke vaelte hele installationen
  await Promise.all(['./', 'index.html', ...files].map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
  await self.skipWaiting();
})()));

self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('bordplan-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

// Safari afspiller kun lyd, hvis Range-forespoergsler besvares med 206 - det goer vi ud fra den gemte fil.
async function rangeResponse(req, res) {
  const buf = await res.clone().arrayBuffer(), m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  if (!m) return res;
  let start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : buf.byteLength - 1;
  if (!m[1] && m[2]) { start = Math.max(0, buf.byteLength - +m[2]); end = buf.byteLength - 1; }
  end = Math.min(end, buf.byteLength - 1);
  return new Response(buf.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers: {
    'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
    'Content-Range': 'bytes ' + start + '-' + end + '/' + buf.byteLength,
    'Content-Length': String(end - start + 1) } });
}

// Gemt udgave vises med det samme; i baggrunden hentes en ny, hvis der er net.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req.url);
    const refresh = fetch(req.url).then(res => { if (res.ok) cache.put(req.url, res.clone()); return res; }).catch(() => null);
    e.waitUntil(refresh);
    let res = hit || await refresh;
    if (!res && req.mode === 'navigate') res = await cache.match('index.html');
    if (!res) return new Response('Offline', { status: 503, statusText: 'Offline' });
    return req.headers.has('range') ? rangeResponse(req, res) : res;
  })());
});
