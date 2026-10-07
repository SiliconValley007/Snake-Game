import { DIRS, SWIPE_PX_DEFAULT } from "../core/constants.js";

const BLOCK = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  " ",
  "Spacebar",
]);

export function createInput(opts) {
  const {
    onDir,
    onPause,
    onRestart,
    onPrimary,
    keys,
    getSwipePx,
    isChip,
    isRestart,
    padEl,
  } = opts;

  let ignoreSwipe = false;
  let swipe = null;
  let pad = null;
  let remap = null;
  const gamepadDir = { x: 0, y: 0 };
  let lastGp = 0;

  function dirFromKey(key) {
    const k = keys();
    if (k.up.includes(key)) return DIRS.up;
    if (k.down.includes(key)) return DIRS.down;
    if (k.left.includes(key)) return DIRS.left;
    if (k.right.includes(key)) return DIRS.right;
    return null;
  }

  function onKey(e) {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    if (remap) {
      e.preventDefault();
      remap(e.key, e.code);
      remap = null;
      return;
    }
    const onChip = !!(
      e.target &&
      e.target.closest &&
      e.target.closest(".chip, #panel, input, select, textarea, button")
    );
    const onRestart = !!(
      e.target &&
      e.target.closest &&
      e.target.closest("#restartBtn")
    );
    const extra = isChip ? isChip(e.target) : onChip;
    const extraR = isRestart ? isRestart(e.target) : onRestart;
    if ((BLOCK.has(e.key) || e.code === "Space") && !extra && !extraR)
      e.preventDefault();
    if (
      e.repeat &&
      (e.code === "Space" ||
        e.key === "Enter" ||
        e.key === "r" ||
        e.key === "R")
    )
      return;

    const k = keys();
    if (e.key === "Escape") {
      onPause();
      return;
    }
    if (e.key === "p" || e.key === "P") {
      onPause();
      return;
    }
    if (e.code === "Space" || e.key === " ") {
      if (extra || extraR) return;
      onPrimary();
      return;
    }
    if (k.restart.includes(e.key)) {
      onRestart();
      return;
    }
    const v = dirFromKey(e.key);
    if (v) onDir(v);
    if (e.key === "Enter") {
      if (e.target && e.target.closest && e.target.closest("button")) return;
      onPrimary();
    }
  }

  function onPad(e) {
    const b = e.target.closest("button");
    if (!b) return;
    ignoreSwipe = true;
    e.preventDefault();
    b.classList.remove("ripple");
    void b.offsetWidth;
    b.classList.add("ripple");
    setTimeout(() => b.classList.remove("ripple"), 360);
    const dx = +b.dataset.dx;
    const dy = +b.dataset.dy;
    const dir =
      dx === 1
        ? DIRS.right
        : dx === -1
          ? DIRS.left
          : dy === 1
            ? DIRS.down
            : DIRS.up;
    onDir(dir);
  }

  function pointerOnUi(x, y) {
    const node = document.elementFromPoint(x, y);
    return !!(
      node &&
      node.closest &&
      node.closest("#ui, #panel, #pad, #pause, .chip, .cta, .menu, #splash")
    );
  }

  function applySwipe(dx, dy) {
    const th = (getSwipePx && getSwipePx()) || SWIPE_PX_DEFAULT;
    if (Math.hypot(dx, dy) < th) return;
    const v =
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? DIRS.right
          : DIRS.left
        : dy > 0
          ? DIRS.down
          : DIRS.up;
    onDir(v);
  }

  function onPointerDown(e) {
    if (e.pointerType === "touch" || e.pointerType === "pen")
      document.body.classList.add("touch");
    if (pointerOnUi(e.clientX, e.clientY)) {
      ignoreSwipe = true;
      return;
    }
    if (swipe) return;
    swipe = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      lx: e.clientX,
      ly: e.clientY,
    };
  }

  function onPointerMove(e) {
    if (!swipe || swipe.id !== e.pointerId || ignoreSwipe) return;
    const dx = e.clientX - swipe.lx;
    const dy = e.clientY - swipe.ly;
    const th = (getSwipePx && getSwipePx()) || SWIPE_PX_DEFAULT;
    if (Math.hypot(dx, dy) >= th) {
      applySwipe(dx, dy);
      swipe.lx = e.clientX;
      swipe.ly = e.clientY;
    }
  }

  function onPointerUp(e) {
    if (ignoreSwipe && (!swipe || swipe.id === e.pointerId)) {
      ignoreSwipe = false;
      swipe = null;
      return;
    }
    if (!swipe || swipe.id !== e.pointerId) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    applySwipe(dx, dy);
  }

  function onPointerCancel(e) {
    if (swipe && swipe.id === e.pointerId) swipe = null;
    ignoreSwipe = false;
  }

  function pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const g = pads && pads[0];
    if (!g) return;
    const ax = g.axes[0] || 0;
    const ay = g.axes[1] || 0;
    const now = performance.now();
    let dir = null;
    if (g.buttons[12] && g.buttons[12].pressed) dir = DIRS.up;
    else if (g.buttons[13] && g.buttons[13].pressed) dir = DIRS.down;
    else if (g.buttons[14] && g.buttons[14].pressed) dir = DIRS.left;
    else if (g.buttons[15] && g.buttons[15].pressed) dir = DIRS.right;
    else if (Math.abs(ax) > 0.45 || Math.abs(ay) > 0.45) {
      dir =
        Math.abs(ax) > Math.abs(ay)
          ? ax > 0
            ? DIRS.right
            : DIRS.left
          : ay > 0
            ? DIRS.down
            : DIRS.up;
    }
    if (
      dir &&
      (dir.x !== gamepadDir.x || dir.y !== gamepadDir.y) &&
      now - lastGp > 80
    ) {
      gamepadDir.x = dir.x;
      gamepadDir.y = dir.y;
      lastGp = now;
      onDir(dir);
    }
    if (!dir) {
      gamepadDir.x = 0;
      gamepadDir.y = 0;
    }
    if (g.buttons[9] && g.buttons[9].pressed && now - lastGp > 250) {
      lastGp = now;
      onPause();
    }
    if (g.buttons[0] && g.buttons[0].pressed && now - lastGp > 250) {
      lastGp = now;
      onPrimary();
    }
  }

  function bind(ac) {
    const sig = { signal: ac.signal };
    document.addEventListener("keydown", onKey, sig);
    document.addEventListener("pointerdown", onPointerDown, sig);
    document.addEventListener("pointermove", onPointerMove, sig);
    document.addEventListener("pointerup", onPointerUp, sig);
    document.addEventListener("pointercancel", onPointerCancel, sig);
    if (padEl) {
      padEl.addEventListener("pointerdown", onPad, {
        signal: ac.signal,
        passive: false,
      });
    }
    document.addEventListener(
      "touchmove",
      (e) => {
        if (!(e.target && e.target.closest && e.target.closest("#ui, #panel")))
          e.preventDefault();
      },
      { signal: ac.signal, passive: false },
    );
    document.addEventListener("gesturestart", (e) => e.preventDefault(), sig);
    document.addEventListener("contextmenu", (e) => e.preventDefault(), sig);
    window.addEventListener("gamepadconnected", () => {}, sig);
  }

  return {
    bind,
    pollGamepad,
    setRemap(fn) {
      remap = fn;
    },
  };
}
