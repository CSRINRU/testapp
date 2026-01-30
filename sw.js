const CACHE_NAME = 'smart-receipt-v2';
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
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // キャッシュヒット - レスポンスを返す
                if (response) {
                    return response;
                }
                return fetch(event.request)
                    .then((response) => {
                        // 有効なレスポンスか確認
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // レスポンスを複製
                        const responseToCache = response.clone();

                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                // http/https以外はキャッシュしない (例: chrome-extensionなど)
                                if (event.request.url.startsWith('http')) {
                                    cache.put(event.request, responseToCache);
                                }
                            });

                        return response;
                    });
            })
    );
});
