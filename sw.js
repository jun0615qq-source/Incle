self.addEventListener('install', (e) => {
    // Automatically take over the previous service worker
    self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
    // Extremely lightweight pass-through to allow PWA installation
    // In the future you can cache index.html or assets for offline viewing
    e.respondWith(fetch(e.request).catch(() => new Response('오프라인 상태입니다. 인터넷을 연결해주세요.')));
});
