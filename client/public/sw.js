const CACHE_NAME = 'zynk-cache-v6';
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
        cacheNames.filter(n => n.startsWith('zynk-cache-') && n !== CACHE_NAME).map(n => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch (network-first for HTML, stale-while-revalidate for assets) ────────
self.addEventListener('fetch', (e) => {
  // Capture authentication token and API base url for background delivery receipts
  const authHeader = e.request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    e.waitUntil(
      caches.open('zynk-auth').then(cache => cache.put('https://zynk-token.local/token', new Response(token)))
    );
  }
  if (e.request.url.includes('/api/')) {
    try {
      const urlObj = new URL(e.request.url);
      const apiIdx = urlObj.pathname.indexOf('/api');
      if (apiIdx !== -1) {
        const apiBase = urlObj.origin + urlObj.pathname.substring(0, apiIdx + 4);
        e.waitUntil(
          caches.open('zynk-auth').then(cache => cache.put('https://zynk-token.local/api-base', new Response(apiBase)))
        );
      }
    } catch (err) {
      console.warn('[SW] Error parsing api url:', err);
    }
  }

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
    payload = { data: { title: 'Zynk', body: e.data.text() } };
  }

  // Parse payload (supports standard structures and nested FCM data block)
  const data = payload.data || {};
  const title = data.title || payload.title || 'Zynk';
  const body = data.body || payload.body || 'You have a new notification';
  const icon = data.icon || payload.icon || '/manifest-icon-192.png';
  const badge = data.badge || payload.badge || '/manifest-icon-192.png';
  const tag = data.tag || payload.tag || 'zynk-notification';
  const type = data.type || payload.type || 'message';
  const conversationId = data.conversationId || payload.conversationId || '';
  const messageId = data.messageId || payload.messageId || '';
  
  const reqInteraction = data.requireInteraction === 'true' || 
                         data.requireInteraction === true || 
                         payload.requireInteraction === true;

  const options = {
    body,
    icon,
    badge,
    tag,
    requireInteraction: reqInteraction,
    vibrate: [200, 100, 200],
    data: {
      type,
      conversationId,
      messageId,
      url: data.url || payload.url || '/'
    },
    actions: type === 'call'
      ? [
          { action: 'open', title: '📱 Answer Call' },
          { action: 'dismiss', title: '✕ Dismiss' }
        ]
      : [
          { action: 'open', title: 'Open' },
          { action: 'dismiss', title: 'Dismiss' }
        ]
  };

  // 1. Mark delivered silent in the background
  let reportDeliveryPromise = Promise.resolve();
  if (messageId && conversationId) {
    reportDeliveryPromise = caches.open('zynk-auth').then(async (cache) => {
      const tokenRes = await cache.match('https://zynk-token.local/token');
      const apiRes = await cache.match('https://zynk-token.local/api-base');
      if (!tokenRes || !apiRes) {
        throw new Error('No cached credentials found for background delivery receipt');
      }
      const token = await tokenRes.text();
      const apiBase = await apiRes.text();

      return fetch(`${apiBase}/messages/delivered-silent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ messageId, conversationId })
      });
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      console.log('[SW] Delivery acknowledged for:', messageId);
    }).catch(err => {
      console.warn('[SW] Could not report delivery receipt in background:', err.message);
    });
  }

  // 2. Determine whether to show the notification (Prevent duplicate when chat is active)
  const showNotificationPromise = caches.open('zynk-auth').then(async (cache) => {
    const activeConvRes = await cache.match('https://zynk-token.local/active-conv');
    const activeConv = activeConvRes ? await activeConvRes.text() : null;

    return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      let shouldShow = true;

      // Always show incoming call notifications to prevent missed calls
      if (type !== 'call') {
        for (const client of windowClients) {
          // If app window is visible, focused, and viewing this exact conversation, suppress notification
          if (client.visibilityState === 'visible' && client.focused && activeConv === conversationId) {
            shouldShow = false;
            break;
          }
        }
      }

      if (shouldShow) {
        return self.registration.showNotification(title, options);
      }
    });
  });

  e.waitUntil(
    Promise.all([
      showNotificationPromise,
      reportDeliveryPromise
    ])
  );
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

