/* Service worker for Web Push (Mini-Telegram) */
/* Sound: uses your device's default notification sound (no custom sound in Web Push). */
self.addEventListener('push', (event) => {
  let data = { title: 'Mini Telegram', body: '' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {}
  const options = {
    body: data.body || 'New message',
    tag: data.tag || 'mini-telegram-push',
    data: { url: data.url || '/' },
    silent: false, /* play system default notification sound */
    vibrate: [200, 100, 200], /* short vibration pattern on supported devices (e.g. Android) */
  };
  event.waitUntil(self.registration.showNotification(data.title || 'Mini Telegram', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      if (list.length) {
        const w = list[0];
        if (w.navigate) w.navigate(url);
        w.focus();
      } else if (clients.openWindow) {
        clients.openWindow(url);
      }
    })
  );
});
