const CACHE_NAME = 'zynk-cache-v4';
const ASSETS = ['/', '/index.html', '/manifest.json'];


// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(ASSETS).catch(err => console.log('Assets caching skipped:', err))
    )
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch (network-first for HTML, stale-while-revalidate for assets) ────────
self.addEventListener('fetch', (e) => {
  if (
    e.request.mode === 'navigate' ||
    (e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html'))
  ) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) {
        fetch(e.request).then(res => {
          if (res.status === 200) caches.open(CACHE_NAME).then(c => c.put(e.request, res));
        }).catch(() => {});
        return cached;
      }
      return fetch(e.request);
    })
  );
});

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (e) => {
  if (!e.data) return;

  let payload;
  try {
    payload = e.data.json();
  } catch {
    payload = { title: 'Zynk', body: e.data.text() };
  }

  const title   = payload.title   || 'Zynk';
  const options = {
    body:             payload.body             || 'You have a new notification',
    icon:             payload.icon             || '/manifest-icon-192.png',
    badge:            payload.badge            || '/manifest-icon-192.png',
    tag:              payload.tag              || 'zynk-notification',
    requireInteraction: payload.requireInteraction || false,
    vibrate:          [200, 100, 200],
    data:             payload.data             || { url: '/' },
    actions: payload.data?.type === 'call'
      ? [
          { action: 'open', title: '📱 Open Zynk' },
          { action: 'dismiss', title: '✕ Dismiss' }
        ]
      : [
          { action: 'open', title: 'Open' },
          { action: 'dismiss', title: 'Dismiss' }
        ]
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification Click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  if (e.action === 'dismiss') return;

  const urlToOpen = (e.notification.data && e.notification.data.url) || '/';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus an existing tab if one is open
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.focus();
          // Tell the app to navigate / refresh conversations
          client.postMessage({ type: 'NOTIFICATION_CLICK', data: e.notification.data });
          return;
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// ── Push Subscription Change ──────────────────────────────────────────────────
self.addEventListener('pushsubscriptionchange', (e) => {
  // Re-subscribe when the browser rotates the subscription
  e.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: e.oldSubscription && e.oldSubscription.options.applicationServerKey
    }).then(subscription => {
      // Post new subscription back to the app client
      return clients.matchAll({ type: 'window' }).then(windowClients => {
        if (windowClients.length > 0) {
          windowClients[0].postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', subscription });
        }
      });
    })
  );
});

// ── Update Handler ────────────────────────────────────────────────────────────
// When the page sends SKIP_WAITING, activate immediately and tell all clients to reload
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data && e.data.type === 'GET_VERSION') {
    e.source.postMessage({ type: 'VERSION', version: CACHE_NAME });
  }
});

