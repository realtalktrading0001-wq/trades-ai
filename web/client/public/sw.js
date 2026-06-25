// TRADES AI service worker.
// Intentionally minimal: it makes the app installable (browsers require a service
// worker with a fetch handler) WITHOUT any offline caching — every request still
// goes to the network, so the app behaves exactly like the website. If we later
// want offline support, add a cache strategy inside the fetch handler.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // No respondWith() → the browser performs its default network fetch (no cache).
});
