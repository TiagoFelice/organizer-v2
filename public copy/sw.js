// Service Worker para cache offline - Organizador de Tarefas

const CACHE_NAME = 'organizer-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/app-optimized.js',
  '/styles.css',
  // Firebase URLs podem ser adicionados aqui
];

// Instalar o service worker e cachear recursos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.log('Erro ao cachear recursos:', error);
      })
  );
});

// Interceptar requisições e servir do cache quando possível
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Retornar do cache se disponível
        if (response) {
          return response;
        }
        
        // Caso contrário, buscar da rede
        return fetch(event.request)
          .then(response => {
            // Não cachear requisições que não sejam GET ou que não sejam bem-sucedidas
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clonar a resposta
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          });
      })
      .catch(error => {
        console.log('Erro no service worker:', error);
        // Retornar página offline se disponível
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      })
  );
});

// Limpar caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
