// Service Worker for Hive PWA
const CACHE_NAME = "hive-v2";
const STATIC_CACHE = "hive-static-v2";
const DYNAMIC_CACHE = "hive-dynamic-v2";

// Assets to cache on install (only static files that won't redirect)
// Note: Don't include '/' as it redirects based on auth state
const STATIC_ASSETS = ["/offline", "/manifest.json"];

// Cache assets individually to handle failures gracefully
async function cacheAssets(cache, assets) {
  const results = await Promise.allSettled(
    assets.map(async (url) => {
      try {
        const response = await fetch(url);
        if (response.ok && !response.redirected) {
          await cache.put(url, response);
          console.log("[SW] Cached:", url);
          return { url, success: true };
        }
        console.log("[SW] Skipped (redirect or not ok):", url);
        return { url, success: false };
      } catch (error) {
        console.log("[SW] Failed to cache:", url, error.message);
        return { url, success: false };
      }
    })
  );
  return results;
}

// Install event - cache static assets
self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker...");
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log("[SW] Caching static assets");
      return cacheAssets(cache, STATIC_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker...");
  const validCaches = [STATIC_CACHE, DYNAMIC_CACHE];
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => !validCaches.includes(key))
          .map((key) => {
            console.log("[SW] Removing old cache:", key);
            return caches.delete(key);
          })
      );
    })
  );
  // Take control immediately
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip cross-origin requests (except for CDN assets)
  if (url.origin !== location.origin) {
    // Allow caching of specific CDN assets
    if (
      !url.hostname.includes("convex.cloud") &&
      !url.hostname.includes("r2.cloudflarestorage.com")
    ) {
      return;
    }
  }

  // Skip API requests and auth endpoints
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("convex") ||
    url.pathname.includes("auth")
  ) {
    return;
  }

  // For navigation requests, use network first
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone and cache the response
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Fallback to cache, then offline page
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || caches.match("/offline");
          });
        })
    );
    return;
  }

  // For other requests, use stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          // Update cache with fresh response
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// Push notification event
self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || "New notification",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/badge-72x72.png",
    vibrate: [100, 50, 100],
    data: {
      url: data.url || "/",
      ...data,
    },
    actions: data.actions || [],
    tag: data.tag || "default",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(data.title || "Hive", options));
});

// Notification click event
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url === url && "focus" in client) {
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Background sync event
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-posts") {
    event.waitUntil(syncPosts());
  }
});

async function syncPosts() {
  // Implement background sync for offline posts
  console.log("[SW] Background sync: posts");
}
