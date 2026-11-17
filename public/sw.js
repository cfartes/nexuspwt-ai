const CACHE = 'nexus-shell-v1';
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const shell = await fetch('/');
      if (!shell.ok) throw new Error('Não foi possível preparar o modo offline');
      const html = await shell.clone().text();
      await cache.put('/', shell);
      const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"\s]+)"/g)].map((m) =>
        m[1].replaceAll('&amp;', '&'),
      );
      await cache.addAll([...new Set(['/icon.svg', '/manifest.webmanifest', ...assets])]);
    })(),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('nexus-shell-') && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      ),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (
    url.pathname.startsWith('/_next/static/') ||
    ['/icon.svg', '/manifest.webmanifest'].includes(url.pathname)
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((c) => c.put(event.request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }
  if (event.request.mode === 'navigate')
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && url.pathname === '/') {
            const copy = response.clone();
            caches.open(CACHE).then((c) => c.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/')),
    );
});
