export function registerSW(onUpdate) {
  if (!("serviceWorker" in navigator)) return;
  const go = () => {
    const url = new URL("./sw.js", document.baseURI || window.location.href);
    navigator.serviceWorker
      .register(url.href, { scope: "./" })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller && onUpdate)
          onUpdate(reg);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener("statechange", () => {
            if (
              w.state === "installed" &&
              navigator.serviceWorker.controller &&
              onUpdate
            )
              onUpdate(reg);
          });
        });
      })
      .catch(() => {});
  };
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go);
}

export function applyWaiting(reg) {
  if (reg && reg.waiting) reg.waiting.postMessage("SKIP_WAIT");
}

export async function requestWakeLock() {
  try {
    if (navigator.wakeLock) return await navigator.wakeLock.request("screen");
  } catch (_) {}
  return null;
}

export async function enterFullscreen(el) {
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch (_) {}
}
