const CACHE_NAME = 'catbox-galeria-cache-v1';

// Lista de dominios que queremos cachear (ImageKit)
const TARGET_DOMAINS = [
    'ik.imagekit.io', 
    'cdn.jsdelivr.net' // Opcional: para cachear bootstrap/iconos también
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Solo interceptamos peticiones GET a ImageKit (o dominios externos definidos)
    if (event.request.method === 'GET' && TARGET_DOMAINS.some(domain => url.hostname.includes(domain))) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((cachedResponse) => {
                    // 1. ESTRATEGIA CACHE-FIRST
                    // Si está en caché, lo devolvemos y NO tocamos la red (Ahorra Request)
                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    // 2. Si no está, vamos a la red
                    return fetch(event.request).then((networkResponse) => {
                        // Clonamos la respuesta porque se va a consumir dos veces (browser y caché)
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    }).catch(() => {
                        // Manejo de errores simple (podrías retornar una imagen placeholder aquí)
                        console.log('Fallo de red para:', event.request.url);
                    });
                });
            })
        );
    }
});