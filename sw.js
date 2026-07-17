const CACHE_NAME = 'asset-tracker-v33';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icons/icon.svg',
    './lib/chart.umd.min.js',
    './lib/chartjs-adapter-date-fns.bundle.min.js'
];

// 安装 - 缓存核心资源（单个资源失败不影响整体，避免 CDN 抖动导致装不上离线包）
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            Promise.allSettled(ASSETS_TO_CACHE.map(url => cache.add(url)))
        )
    );
    self.skipWaiting();
});

// 激活 - 清理旧缓存
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// 拦截请求 - 本地资源 stale-while-revalidate（秒开 + 后台更新），CDN 资源 cache-first
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    const isLocal = url.origin === self.location.origin;

    event.respondWith(
        isLocal ? staleWhileRevalidate(event.request) : cacheFirst(event.request)
    );
});

// 立即返回缓存（秒开），同时后台拉取新版本写入缓存，下次打开生效。
// 配合 index.html 里的 updatefound→reload，既不卡又能拿到更新。
async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const fetchPromise = fetch(request).then(response => {
        if (response && response.status === 200) cache.put(request, response.clone());
        return response;
    }).catch(() => null);
    return cached || (await fetchPromise) || caches.match('./index.html');
}

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
        return response;
    } catch (e) {
        return new Response('', { status: 408 });
    }
}
