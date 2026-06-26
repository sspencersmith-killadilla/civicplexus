import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw, Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listQueue,
  onQueueChange,
  removeFromQueue,
  syncQueue,
  type QueuedAction,
} from "@/lib/offline-queue";

function useOnlineStatus() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
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
  if (online && items.length === 0) return null;

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