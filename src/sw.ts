/// <reference lib="webworker" />
// Custom service worker (injectManifest). Adds:
//  - Precaching + NetworkFirst navigations + CacheFirst static assets
//  - Background Sync: drains the offline action queue when connectivity
//    returns, even if no client tab is open.

import { precacheAndRoute } from "workbox-precaching";
import { registerRoute, setCatchHandler } from "workbox-routing";
import { NetworkFirst, CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { get, set } from "idb-keyval";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const QUEUE_KEY = "civicplexus.offline.queue.v1";
const SYNC_TAG = "civicplexus-offline-sync";
const REPLAY_URL = "/api/public/hooks/offline-replay";

type QueuedAction = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  token?: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
};

precacheAndRoute(self.__WB_MANIFEST || []);

// HTML navigations: NetworkFirst with a short timeout, fall back to /offline-shell.
registerRoute(
  ({ request, url }) =>
    request.mode === "navigate" &&
    !url.pathname.startsWith("/~oauth") &&
    !url.pathname.startsWith("/api/") &&
    !url.pathname.startsWith("/auth"),
  new NetworkFirst({
    cacheName: "pages",
    networkTimeoutSeconds: 4,
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 })],
  }),
);

// Static same-origin hashed assets.
registerRoute(
  ({ url, sameOrigin }) =>
    sameOrigin && /\.(?:js|css|woff2?|png|svg|ico)$/i.test(url.pathname),
  new CacheFirst({
    cacheName: "static-assets",
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
);

setCatchHandler(async ({ request }) => {
  if (request.mode === "navigate") {
    const cache = await caches.open("pages");
    const fallback = await cache.match("/offline-shell");
    if (fallback) return fallback;
  }
  return Response.error();
});

self.addEventListener("install", () => {
  void self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// --- Background Sync ---------------------------------------------------------

async function readQueue(): Promise<QueuedAction[]> {
  return (await get<QueuedAction[]>(QUEUE_KEY)) ?? [];
}
async function writeQueue(q: QueuedAction[]) {
  await set(QUEUE_KEY, q);
}

async function replayOne(action: QueuedAction): Promise<void> {
  if (!action.token) throw new Error("Missing auth token for queued action");
  const res = await fetch(REPLAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${action.token}`,
    },
    body: JSON.stringify({ kind: action.kind, payload: action.payload }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Replay failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

async function drainQueue(): Promise<{ ok: number; failed: number; remaining: number }> {
  const q = await readQueue();
  let ok = 0;
  let failed = 0;
  const remaining: QueuedAction[] = [];
  for (let i = 0; i < q.length; i++) {
    const action = q[i];
    try {
      await replayOne(action);
      ok++;
    } catch (err) {
      action.attempts = (action.attempts || 0) + 1;
      action.lastError = err instanceof Error ? err.message : String(err);
      failed++;
      // Preserve FIFO ordering: keep this and everything after it.
      remaining.push(...q.slice(i));
      break;
    }
  }
  await writeQueue(remaining);
  // Notify any open clients so their UI updates.
  const clients = await self.clients.matchAll({ type: "window" });
  for (const c of clients) {
    c.postMessage({ type: "queue-synced", ok, failed, remaining: remaining.length });
  }
  // Signal to retry-sync if items remain (transient errors).
  if (remaining.length > 0 && failed > 0) {
    throw new Error("Sync incomplete; will retry");
  }
  return { ok, failed, remaining: remaining.length };
}

self.addEventListener("sync", (event: Event) => {
  const ev = event as ExtendableEvent & { tag: string };
  if (ev.tag !== SYNC_TAG) return;
  ev.waitUntil(drainQueue());
});

self.addEventListener("message", (event) => {
  const data = (event.data ?? {}) as { type?: string };
  if (data.type === "drain-queue") {
    event.waitUntil(drainQueue().catch(() => undefined));
  }
});

export {};