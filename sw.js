const CACHE_NAME = 'smart-receipt-v4';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './js/analysis.js',
    './js/camera.js',
    './js/constants.js',
    './js/db.js',
    './js/debug_ui.js',
    './js/dictionary.js',
    './js/gemini.js',
    './js/main.js',
    './js/ocr.js',
    './js/ocr_worker.js',
    './js/onnx_ocr.js',
    './js/preprocessing_ui.js',
    './js/store.js',
    './js/ui.js',
    './js/utils.js',
    './lib/ort.all.min.js',
    './lib/ort-wasm-simd-threaded.mjs',
    './lib/ort-wasm-simd-threaded.wasm',
    './lib/ort-wasm-simd-threaded.jsep.mjs',
    './lib/ort-wasm-simd-threaded.jsep.wasm',
    './models/ppocrv5/ppocrv5_dict.txt',
    './models/ppocrv5/det/det.onnx',
    './models/ppocrv5/rec/rec.onnx',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                return cache.addAll(ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            let response = await cache.match(event.request);

            // 1. Determine if we need to fetch from network
            if (!response) {
                try {
                    response = await fetch(event.request);
                } catch (e) {
                    console.error('Fetch failed:', e);
                }
            }

            // 2. If still no response (e.g. offline and no cache), try fallback (optional, skipping here)
            if (!response) {
                return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
            }

            // 3. Cache new network responses (except for some types)
            if (response && response.status === 200 && response.type === 'basic' && event.request.url.startsWith('http')) {
                // Check if already in cache to avoid unnecessary writes, but usually put overwrites.
                // We should only cache if we fetched from network.
                // But simplified logic: if it's a valid response, ensure it's in cache if it's in our ASSETS list?
                // Actually cache.put here caches EVERYTHING visited.
                // Let's keep it simple as before.
                // Note: we can't put a used response. verify response.body used?
                // We clone below.
                const responseToCache = response.clone();
                cache.put(event.request, responseToCache);
            }

            // 4. Inject COOP/COEP headers for SharedArrayBuffer support (required for ONNX Runtime Web threaded)
            // We can only recreate the response if it has a valid status (not opaque/0)
            if (response && response.status >= 200 && response.status < 600) {
                if (event.request.mode === 'navigate') {
                    const newHeaders = new Headers(response.headers);
                    newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders
                    });
                } else {
                    const newHeaders = new Headers(response.headers);
                    newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders
                    });
                }
            }

            return response;
        })()
    );
});
