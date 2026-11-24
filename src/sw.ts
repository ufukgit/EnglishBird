/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
self.skipWaiting();
clientsClaim();

// Günlük hatırlatma. Worker yükü olmayan (boş) bir push gönderir; metin burada sabittir.
self.addEventListener('push', (event) => {
  let body = 'Bugünün oturumu hazır.';
  try {
    const data = event.data?.json() as { body?: string } | undefined;
    if (data?.body) body = data.body;
  } catch {
    /* boş push */
  }
  event.waitUntil(
    self.registration.showNotification('EnglishBird', {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'daily-reminder',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (all[0]) return all[0].focus();
      return self.clients.openWindow('/');
    })(),
  );
});
