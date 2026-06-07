const CACHE_NAME = 'weekly-todo-v1';

// При установке воркера — сразу активируем, чтобы не ждать закрытия вкладок
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    // Удаляем старые кеши (на случай обновления версии)
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        )
      )
  );
  self.clients.claim(); // воркер сразу начинает управлять всеми страницами
});

// Стратегия: Cache First (сначала кеш, если нет — сеть, и обновление кеша из сети)
self.addEventListener('fetch', event => {
  // Кешируем только GET‑запросы к нашему домену
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // не кешируем CDN и внешние API

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Если есть в кеше — отдаём, а в фоне обновляем кеш из сети
      const fetchPromise = fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Если сети нет, и в кеше ничего не было — вернётся ошибка, но до этого не дойдёт, т.к. ниже есть cachedResponse
        });
      return cachedResponse || fetchPromise;
    })
  );
});
