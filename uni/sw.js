self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('config-cache').then((cache) => {
      // Първоначално може да сложиш празен config.json
      return cache.put('/config.json', new Response('{}', {
        headers: { 'Content-Type': 'application/json' }
      }));
    })
  );
});

