// Guarded service worker registration. Refuses to register in dev, Lovable
// preview iframes, or when `?sw=off` is present, and unregisters any stale
// /sw.js registration in those contexts.
const SW_URL = "/sw.js";

function isPreviewHost(host: string) {
  return (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  );
}

async function unregisterApp() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs
      .filter((r) => r.active?.scriptURL?.endsWith(SW_URL))
      .map((r) => r.unregister()),
  );
}

export async function registerPwa() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const url = new URL(window.location.href);
  const inIframe = window.self !== window.top;
  const refused =
    !import.meta.env.PROD ||
    inIframe ||
    isPreviewHost(window.location.hostname) ||
    url.searchParams.get("sw") === "off";

  if (refused) {
    await unregisterApp().catch(() => {});
    return;
  }

  try {
    const { Workbox } = await import("workbox-window");
    const wb = new Workbox(SW_URL, { scope: "/" });
    wb.addEventListener("waiting", () => wb.messageSkipWaiting());
    await wb.register();
  } catch (err) {
    console.warn("PWA registration failed", err);
  }
}