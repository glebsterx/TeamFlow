self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : { title: '', body: '', url: '/' };
  } catch {
    // Fallback для iOS, где event.data может быть не JSON
    const text = event.data ? event.data.text() : '';
    try {
      data = JSON.parse(text);
    } catch {
      data = { title: '', body: text, url: '/' };
    }
  }

  // #272 — iOS Safari требует явных параметров notification
  const options = {
    body: data.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: data.url || '/' },
    tag: data.url || 'default',  // Prevents duplicate notifications on iOS
    requireInteraction: false,    // iOS requires false; true causes issues
    renotify: true,               // Allow re-notification on iOS
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || data.body || 'TeamFlow', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there's already an open window
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      // If no matching window, open a new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
