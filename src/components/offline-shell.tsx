import { useEffect, useRef, useState } from "react";
import { Wifi, WifiOff, RefreshCw, Clock, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listQueue,
  onQueueChange,
  removeFromQueue,
  syncQueue,
  type QueuedAction,
} from "@/lib/offline-queue";

function useOnlineStatus() {
  // navigator.onLine is notoriously unreliable — many browsers (and embedded
  // webviews / preview iframes) report `false` even with a working connection.
  // We treat it as a hint only, and confirm with a tiny same-origin probe
  // before declaring the user offline.
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const probing = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function probe(): Promise<boolean> {
      if (probing.current) return online;
      probing.current = true;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3500);
        // Cache-busted HEAD to a tiny same-origin asset that always exists.
        const res = await fetch(`/favicon.ico?_=${Date.now()}`, {
          method: "HEAD",
          cache: "no-store",
          signal: ctrl.signal,
        });
        clearTimeout(t);
        return res.ok || res.status < 500;
      } catch {
        return false;
      } finally {
        probing.current = false;
      }
    }

    async function recheck() {
      const ok = await probe();
      if (!cancelled) setOnline(ok);
    }

    const up = () => setOnline(true);
    const down = () => void recheck(); // confirm before flipping to offline
    window.addEventListener("online", up);
    window.addEventListener("offline", down);

    // Initial confirmation: if the browser claims offline, double-check.
    if (!navigator.onLine) void recheck();

    // Periodic light recheck so a false-offline state self-heals.
    const iv = window.setInterval(() => {
      if (!online) void recheck();
    }, 15000);

    return () => {
      cancelled = true;
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      window.clearInterval(iv);
    };
  }, [online]);
  return online;
}

export function useQueue() {
  const [items, setItems] = useState<QueuedAction[]>([]);
  useEffect(() => {
    let alive = true;
    listQueue().then((q) => alive && setItems(q));
    const off = onQueueChange(() => {
      listQueue().then((q) => alive && setItems(q));
    });
    return () => {
      alive = false;
      off();
    };
  }, []);
  return items;
}

export function OfflineBanner() {
  const online = useOnlineStatus();
  const items = useQueue();
  const [syncing, setSyncing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (online && items.length === 0) return null;
  if (dismissed && online) return null;

  return (
    <div
      className={`sticky top-0 z-40 flex items-center justify-between gap-3 px-4 py-2 text-sm ${
        online ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-destructive/10 text-destructive"
      }`}
    >
      <div className="flex items-center gap-2">
        {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
        <span>
          {online
            ? `${items.length} queued action${items.length === 1 ? "" : "s"} pending sync`
            : `You're offline — actions will queue and sync automatically.`}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {online && items.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              try {
                await syncQueue();
              } finally {
                setSyncing(false);
              }
            }}
          >
            <RefreshCw className={`mr-1 h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
            Sync now
          </Button>
        )}
        {online && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function QueueList() {
  const items = useQueue();
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No queued actions. Anything you do offline will appear here until it syncs.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li
          key={a.id}
          className="flex items-start justify-between gap-3 rounded-md border bg-card p-3 text-sm"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium capitalize">
              <Clock className="h-3.5 w-3.5" />
              {a.kind.replace(/_/g, " ")}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Queued {new Date(a.createdAt).toLocaleString()}
              {a.attempts > 0 && ` · ${a.attempts} attempt${a.attempts === 1 ? "" : "s"}`}
            </div>
            {a.lastError && (
              <div className="mt-1 text-xs text-destructive">{a.lastError}</div>
            )}
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => removeFromQueue(a.id)}
            aria-label="Remove from queue"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}