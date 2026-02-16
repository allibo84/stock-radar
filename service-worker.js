// Ce service worker remplace l'ancien et se désinstalle
// pour laisser la place à sw.js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(names =>
            Promise.all(names.map(n => caches.delete(n)))
        ).then(() => self.registration.unregister())
    );
});
