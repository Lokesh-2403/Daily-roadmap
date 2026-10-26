
const CACHE_NAME = 'daily-roadmap-v1';

const APP_FILES = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(APP_FILES)
    )
  );

  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(
              key =>
                key.startsWith('daily-roadmap-') &&
                key !== CACHE_NAME
            )
            .map(key => caches.delete(key))
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match('/');
        if (cached) return cached;
        return Response.error();
      })
    );
  }
});

// Display compatible push messages, including Firebase-style payloads.
self.addEventListener('push', event => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = {
        body: event.data.text()
      };
    }
  }

  const notification = payload.notification || {};
  const data = payload.data || {};

  const title =
    notification.title ||
    payload.title ||
    data.title ||
    'Dayymarkk';

  const body =
    notification.body ||
    payload.body ||
    data.body ||
    'You have a roadmap task to check.';

  const requestedUrl =
    data.url ||
    payload.url ||
    '/';

  let safeUrl = self.location.origin + '/';

  try {
    const targetUrl = new URL(
      requestedUrl,
      self.location.origin
    );

    if (targetUrl.origin === self.location.origin) {
      safeUrl = targetUrl.href;
    }
  } catch {
    // Keep the safe default URL.
  }

event.waitUntil(
  self.registration.showNotification(title, {
    body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: {
      url: safeUrl
    }
  })
);
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  let target = self.location.origin + '/';

  try {
    const targetUrl = new URL(
      event.notification.data?.url || '/',
      self.location.origin
    );

    if (targetUrl.origin === self.location.origin) {
      target = targetUrl.href;
    }
  } catch {
    // Keep the safe default URL.
  }

  event.waitUntil(
    self.clients
      .matchAll({
        type: 'window',
        includeUncontrolled: true
      })
      .then(async clients => {
        const existing = clients.find(client => {
          try {
            return new URL(client.url).href === target;
          } catch {
            return false;
          }
        });

        if (existing) {
          return existing.focus();
        }

        return self.clients.openWindow(target);
      })
  );
});
