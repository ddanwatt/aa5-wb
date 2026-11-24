/* Offline: cache the app on first open, open instantly from the cache, refresh it in the background. */
var CACHE = 'aa5wb-v12';
var ASSETS = ['./', 'styles.css', 'calc.js', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
var NET_TIMEOUT_MS = 6000;

/* Safari refuses a page the worker serves if the stored response was redirected; store a clean copy. */
function clean(res) {
  if (!res || !res.redirected) return Promise.resolve(res);
  return res.blob().then(function (body) {
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  });
}
function withTimeout(p, ms) {
  return new Promise(function (resolve, reject) {
    var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
    p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
  });
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(ASSETS.map(function (a) {
      return fetch(a, { cache: 'no-cache' }).then(function (res) {
        if (!res.ok) throw new Error('fetch ' + a + ' ' + res.status);
        return clean(res).then(function (r) { return c.put(a, r); });
      });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).catch(function () {}).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  var isPage = req.mode === 'navigate';
  var key = isPage ? './' : req;

  var refresh = withTimeout(fetch(isPage ? './' : req, { cache: 'no-cache' }), NET_TIMEOUT_MS).then(function (res) {
    if (!res || !res.ok) return res;
    return clean(res).then(function (r) {
      return caches.open(CACHE).then(function (c) { return c.put(key, r.clone()); }).then(function () { return r; }, function () { return r; });
    });
  });

  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(key, { ignoreSearch: true });
  }).then(function (hit) {
    if (hit) {
      e.waitUntil(refresh.catch(function () {}));
      return hit;                       /* cached copy answers at once, network or not */
    }
    return refresh.then(function (res) { return res || Response.error(); }, function () {
      return caches.match('./').then(function (any) { return any || Response.error(); });
    });
  }).catch(function () { return fetch(req); }));
});
