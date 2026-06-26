// Offline action queue backed by IndexedDB (via idb-keyval).
// Captures clock punches, leave submissions, and approval decisions while
// offline, then replays them in FIFO order when the network returns.
import { get, set } from "idb-keyval";

export type QueuedKind =
  | "clock_in"
  | "clock_out"
  | "submit_leave"
  | "decide_leave"
  | "decide_paf";

export type QueuedAction = {
  id: string;
  kind: QueuedKind;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError?: string;
};

const KEY = "civicplexus.offline.queue.v1";
const EVT = "civicplexus:queue-changed";

async function read(): Promise<QueuedAction[]> {
  if (typeof indexedDB === "undefined") return [];
  return (await get<QueuedAction[]>(KEY)) ?? [];
}
async function write(q: QueuedAction[]) {
  await set(KEY, q);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVT));
  }
}

export async function listQueue(): Promise<QueuedAction[]> {
  return read();
}

export async function enqueue(
  kind: QueuedKind,
  payload: Record<string, unknown>,
): Promise<QueuedAction> {
  const action: QueuedAction = {
    id: crypto.randomUUID(),
    kind,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  };
  const q = await read();
  q.push(action);
  await write(q);
  // Best-effort sync attempt immediately if online.
  if (typeof navigator !== "undefined" && navigator.onLine) {
    void syncQueue();
  }
  return action;
}

export async function removeFromQueue(id: string) {
  const q = (await read()).filter((a) => a.id !== id);
  await write(q);
}

let syncing = false;

async function runAction(a: QueuedAction): Promise<void> {
  switch (a.kind) {
    case "clock_in": {
      const { clockIn } = await import("@/lib/timekeeping.functions");
      await clockIn();
      return;
    }
    case "clock_out": {
      const { clockOut } = await import("@/lib/timekeeping.functions");
      await clockOut();
      return;
    }
    case "submit_leave": {
      const { submitLeaveRequest } = await import("@/lib/leave.functions");
      await submitLeaveRequest({ data: a.payload as never });
      return;
    }
    case "decide_leave": {
      const { decideLeaveRequest } = await import("@/lib/leave.functions");
      await decideLeaveRequest({ data: a.payload as never });
      return;
    }
    case "decide_paf": {
      const { decidePafStep } = await import("@/lib/paf.functions");
      await decidePafStep({ data: a.payload as never });
      return;
    }
  }
}

export async function syncQueue(): Promise<{ ok: number; failed: number }> {
  if (syncing) return { ok: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: 0, failed: 0 };
  syncing = true;
  let ok = 0;
  let failed = 0;
  try {
    const q = await read();
    for (const action of q) {
      try {
        await runAction(action);
        await removeFromQueue(action.id);
        ok++;
      } catch (err) {
        action.attempts += 1;
        action.lastError = err instanceof Error ? err.message : String(err);
        failed++;
        // Persist updated attempt info, keep in queue for manual retry.
        const cur = await read();
        const next = cur.map((a) => (a.id === action.id ? action : a));
        await write(next);
        // Stop on first failure to preserve order.
        break;
      }
    }
  } finally {
    syncing = false;
  }
  return { ok, failed };
}

export function onQueueChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => cb();
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}

export function installAutoSync() {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => void syncQueue());
  // Also try when the tab regains focus.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      void syncQueue();
    }
  });
  // Initial drain.
  if (navigator.onLine) void syncQueue();
}