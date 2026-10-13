/* sw.js — تخزين مؤقت للتطبيق للعمل دون اتصال */
var CACHE = 'ai-agents-space-v1';
var ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './assets/css/app.css',
  './assets/js/core.js', './assets/js/providers.js', './assets/js/chat.js',
  './assets/js/tools.js', './assets/js/agent.js', './assets/js/ui.js', './assets/js/boot.js',
  './icons/icon-192.png', './icons/icon-512.png'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); })
    .then(function () { return self.skipWaiting(); }).catch(function () {}));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = e.request.url;
  if (url.indexOf('http') !== 0) return;
  e.respondWith(
    caches.match(e.request).then(function (r) {
      return r || fetch(e.request).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var cp = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, cp); });
        }
        return res;
      }).catch(function () { return caches.match('./index.html'); });
    })
  );
});
