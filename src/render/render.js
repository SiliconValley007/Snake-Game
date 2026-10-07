import { FOOD, POWER, THEMES, SKINS, COLORBLIND } from "../core/constants.js";
import { catmull, buildChain, chainMaxGap } from "./interp.js";

function makeCache(w, h) {
  const c =
    typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(w, h)
      : document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  let cssSize = 1;
  let cell = 1;
  let dpr = 1;
  let bgCache = null;
  let gridCache = null;
  let vigCache = null;
  let cacheKey = "";
  const parts = [];
  const floats = [];
  const partPool = [];
  const floatPool = [];
  const PART_CAP = 80;
  const FLOAT_CAP = 12;
  const trailBuf = new Array(48);
  for (let i = 0; i < trailBuf.length; i++) trailBuf[i] = { x: 0, y: 0, a: 0 };
  let trailN = 0;
  let zoom = 1;
  let squash = 1;
  let tongue = 0;
  let punch = 0;
  let shake = 0;
  let eatFx = 0;
  let eatCol = "#7dffb0";
  let flash = 0;
  let flashCol = "#22c55e";
  let reduced = false;
  let quality = "high";
  let theme = THEMES[0];
  let skin = SKINS[0];
  let trailId = "none";
  let cb = null;
  let fpsEma = 60;
  let lastFrame = 0;
  let autoGlow = 2;
  const glowCache = new Map();
  const flashState = { flash: 0, flashCol: "#22c55e" };

  function setTheme(id, skinId, trail, colorblind, reduce) {
    theme = THEMES.find((t) => t.id === id) || THEMES[0];
    skin = SKINS.find((s) => s.id === skinId) || SKINS[0];
    trailId = trail || "none";
    cb = COLORBLIND[colorblind] || null;
    reduced = !!reduce;
    cacheKey = "";
  }

  function setQuality(q) {
    quality =
      q === "low"
        ? "low"
        : q === "med"
          ? "med"
          : q === "auto"
            ? "auto"
            : "high";
    autoGlow = 2;
  }

  function glowLevel() {
    if (reduced) return 0;
    if (quality === "low") return 0;
    if (quality === "med") return 1;
    if (quality === "high") return 2;
    return autoGlow;
  }

  function glowSpriteHSL(h, s, l) {
    const key = "h" + h + ":" + s + ":" + l;
    let sprite = glowCache.get(key);
    if (sprite) return sprite;
    const S = 64;
    sprite = makeCache(S, S);
    const g = sprite.getContext("2d");
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, "hsla(" + h + "," + s + "%," + l + "%,.6)");
    grd.addColorStop(0.5, "hsla(" + h + "," + s + "%," + l + "%,.18)");
    grd.addColorStop(1, "hsla(" + h + "," + s + "%," + l + "%,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    glowCache.set(key, sprite);
    return sprite;
  }

  function glowSpriteHex(hex) {
    const key = "x" + hex;
    let sprite = glowCache.get(key);
    if (sprite) return sprite;
    const S = 64;
    sprite = makeCache(S, S);
    const g = sprite.getContext("2d");
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, hex + "a6");
    grd.addColorStop(0.5, hex + "30");
    grd.addColorStop(1, hex + "00");
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    glowCache.set(key, sprite);
    return sprite;
  }

  function blitGlow(sprite, x, y, r) {
    ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    cssSize = Math.max(1, rect.width);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.max(1, Math.round(cssSize * dpr));
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
      cacheKey = "";
    }
  }

  function rebuild(cols, rows) {
    const W = canvas.width;
    cell = W / Math.max(cols, rows);
    const key = W + ":" + cols + ":" + rows + ":" + theme.id;
    if (key === cacheKey && bgCache) return;
    cacheKey = key;
    bgCache = makeCache(W, W);
    gridCache = makeCache(W, W);
    vigCache = makeCache(W, W);
    const b = bgCache.getContext("2d");
    const g = b.createLinearGradient(0, 0, 0, W);
    g.addColorStop(0, theme.bg0);
    g.addColorStop(1, theme.bg1);
    b.fillStyle = g;
    b.fillRect(0, 0, W, W);
    const neb = b.createRadialGradient(W * 0.5, 0, 0, W * 0.5, 0, W * 0.9);
    neb.addColorStop(0, "rgba(23,48,86,.55)");
    neb.addColorStop(1, "rgba(0,0,0,0)");
    b.fillStyle = neb;
    b.fillRect(0, 0, W, W);
    const gc = gridCache.getContext("2d");
    gc.clearRect(0, 0, W, W);
    gc.strokeStyle = "rgba(255,255,255,.034)";
    gc.lineWidth = Math.max(1, dpr * 0.5);
    gc.beginPath();
    const cw = W / cols;
    const ch = W / rows;
    for (let i = 1; i < cols; i++) {
      gc.moveTo(i * cw, 0);
      gc.lineTo(i * cw, W);
    }
    for (let i = 1; i < rows; i++) {
      gc.moveTo(0, i * ch);
      gc.lineTo(W, i * ch);
    }
    gc.stroke();
    const vc = vigCache.getContext("2d");
    vc.clearRect(0, 0, W, W);
    const vg = vc.createRadialGradient(
      W / 2,
      W / 2,
      W * 0.28,
      W / 2,
      W / 2,
      W * 0.72,
    );
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,.32)");
    vc.fillStyle = vg;
    vc.fillRect(0, 0, W, W);
  }

  const ptPool = [];
  function ptAt(i) {
    let p = ptPool[i];
    if (!p) p = ptPool[i] = { x: 0, y: 0 };
    return p;
  }

  let chainX = new Float64Array(64);
  let chainY = new Float64Array(64);
  let chainSplit = new Uint8Array(64);
  function ensureChain(n) {
    if (chainX.length >= n) return;
    let cap = chainX.length;
    while (cap < n) cap *= 2;
    chainX = new Float64Array(cap);
    chainY = new Float64Array(cap);
    chainSplit = new Uint8Array(cap);
  }

  const tiles = new Float64Array(18);
  const cmOut = { x: 0, y: 0 };
  const p0s = { x: 0, y: 0 };
  const p1s = { x: 0, y: 0 };
  const p2s = { x: 0, y: 0 };
  const p3s = { x: 0, y: 0 };

  function fillChain(state, a, cw, ch) {
    const n = state.snake.length;
    ensureChain(n);
    buildChain(state, a, chainX, chainY, chainSplit);
    for (let i = 0; i < n; i++) {
      const p = ptAt(i);
      p.x = (chainX[i] + 0.5) * cw;
      p.y = (chainY[i] + 0.5) * ch;
    }
    return n;
  }

  function collectTiles(n, W) {
    let k = 0;
    tiles[k++] = 0;
    tiles[k++] = 0;
    if (!n) return k;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = ptAt(i);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const left = minX < 0;
    const right = maxX > W;
    const top = minY < 0;
    const bot = maxY > W;
    if (left) {
      tiles[k++] = 1;
      tiles[k++] = 0;
    }
    if (right) {
      tiles[k++] = -1;
      tiles[k++] = 0;
    }
    if (top) {
      tiles[k++] = 0;
      tiles[k++] = 1;
    }
    if (bot) {
      tiles[k++] = 0;
      tiles[k++] = -1;
    }
    if (left && top) {
      tiles[k++] = 1;
      tiles[k++] = 1;
    }
    if (left && bot) {
      tiles[k++] = 1;
      tiles[k++] = -1;
    }
    if (right && top) {
      tiles[k++] = -1;
      tiles[k++] = 1;
    }
    if (right && bot) {
      tiles[k++] = -1;
      tiles[k++] = -1;
    }
    return k;
  }

  function burst(gx, gy, col, n) {
    if (reduced) return;
    n = Math.min(n, 28);
    for (let i = 0; i < n; i++) {
      const p = partPool.pop() || {
        gx: 0,
        gy: 0,
        vx: 0,
        vy: 0,
        life: 0,
        col: "",
      };
      const ang = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.4;
      const sp = 1.1 + Math.random() * 2.6;
      p.gx = gx;
      p.gy = gy;
      p.vx = Math.cos(ang) * sp;
      p.vy = Math.sin(ang) * sp;
      p.life = 1;
      p.col = col;
      parts.push(p);
    }
    while (parts.length > PART_CAP) partPool.push(parts.shift());
  }

  function addFloat(gx, gy, txt, col) {
    const f = floatPool.pop() || { gx: 0, gy: 0, t: 0, txt: "", col: "" };
    f.gx = gx;
    f.gy = gy;
    f.t = 1;
    f.txt = txt;
    f.col = col;
    floats.push(f);
    while (floats.length > FLOAT_CAP) floatPool.push(floats.shift());
  }

  function recycleAll() {
    while (parts.length) partPool.push(parts.pop());
    while (floats.length) floatPool.push(floats.pop());
    trailN = 0;
  }

  function handleEvents(state) {
    for (const e of state.events) {
      if (e.type === "eat") {
        eatFx = 1;
        eatCol = e.gold ? "#fbbf24" : "#7dffb0";
        flash = e.gold ? 0.3 : 0.18;
        flashCol = e.gold ? "#fbbf24" : "#22c55e";
        punch = 1;
        squash = 1.35;
        addFloat(
          e.x + 0.5,
          e.y + 0.2,
          "+" + e.add,
          e.gold ? "#fde68a" : "#7dffb0",
        );
        burst(
          e.x + 0.5,
          e.y + 0.5,
          e.gold ? "#fbbf24" : "#7dffb0",
          e.gold ? 10 : 8,
        );
      } else if (e.type === "die") {
        shake = reduced ? 0 : 0.5;
        flash = 0.38;
        flashCol = "#ff4d62";
        burst(state.snake[0].x + 0.5, state.snake[0].y + 0.5, "#ff6b7a", 26);
      } else if (e.type === "power") {
        burst(state.snake[0].x + 0.5, state.snake[0].y + 0.5, "#a78bfa", 16);
      } else if (e.type === "poison") {
        flash = 0.22;
        flashCol = "#fb7185";
      }
    }
  }

  function updateFx(dt) {
    const k = dt / 16.67;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.gx += p.vx * 0.055 * k;
      p.gy += p.vy * 0.055 * k;
      p.vy += 0.035 * k;
      p.life -= 0.03 * k;
      if (p.life <= 0) {
        partPool.push(parts[i]);
        parts.splice(i, 1);
      }
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.gy -= 0.02 * k;
      f.t -= 0.02 * k;
      if (f.t <= 0) {
        floatPool.push(floats[i]);
        floats.splice(i, 1);
      }
    }
    if (eatFx > 0) eatFx = Math.max(0, eatFx - 0.055 * k);
    if (shake > 0) shake = Math.max(0, shake - dt * 0.0022);
    if (flash > 0) flash = Math.max(0, flash - dt * 0.004);
    if (punch > 0) punch = Math.max(0, punch - dt * 0.008);
    squash += (1 - squash) * Math.min(1, dt * 0.012);
    tongue = (tongue + dt * 0.01) % (Math.PI * 2);
    zoom += (1 + punch * 0.045 - zoom) * Math.min(1, dt * 0.02);
  }

  function goodCol() {
    return cb ? cb.good : "#4ade80";
  }
  function goldCol() {
    return cb ? cb.gold : "#f59e0b";
  }
  function badCol() {
    return cb ? cb.bad : "#ff6b7a";
  }

  function drawHeadAt(state, x, y, cw, ch, hue) {
    const minCell = Math.min(cw, ch);
    const hr = minCell * 0.42 * squash;
    const ex = state.dir.x;
    const ey = state.dir.y;
    const off = minCell * 0.15;
    const gl = glowLevel();
    if (gl > 0)
      blitGlow(glowSpriteHSL(hue, 80, 58), x, y, hr * (gl === 2 ? 2.1 : 1.7));
    ctx.fillStyle = "#ecffe8";
    ctx.beginPath();
    ctx.arc(x, y, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#06210f";
    ctx.beginPath();
    ctx.arc(
      x - ey * off + ex * hr * 0.28,
      y + ex * off + ey * hr * 0.28,
      hr * 0.18,
      0,
      Math.PI * 2,
    );
    ctx.arc(
      x + ey * off + ex * hr * 0.28,
      y - ex * off + ey * hr * 0.28,
      hr * 0.18,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    if (!reduced) {
      const tl = (0.55 + 0.45 * Math.sin(tongue * 3)) * hr * 0.9;
      ctx.strokeStyle = "#ff6b7a";
      ctx.lineWidth = Math.max(1.5, dpr);
      ctx.beginPath();
      ctx.moveTo(x + ex * hr, y + ey * hr);
      ctx.lineTo(x + ex * (hr + tl), y + ey * (hr + tl));
      ctx.stroke();
    }
  }

  function drawBodyOnTile(state, len, ox, oy, minCell, hue, ghostAlpha) {
    const gl = glowLevel();
    if (gl > 0 && ghostAlpha === 1) {
      const sprite = glowSpriteHSL(hue, 80, 52);
      const step = gl === 2 ? 1 : 2;
      for (let i = len - 1; i > 0; i -= step) {
        const A = ptAt(i);
        blitGlow(
          sprite,
          A.x + ox,
          A.y + oy,
          (0.78 - (i / len) * 0.38) * minCell * 0.95,
        );
      }
    }
    const samples = gl === 2 ? 4 : 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < len - 1; i++) {
      if (chainSplit[i + 1]) continue;
      const A = ptAt(i);
      const B = ptAt(i + 1);
      const P0 = ptAt(Math.max(0, i - 1));
      const P3 = ptAt(Math.min(len - 1, i + 2));
      p0s.x = P0.x + ox;
      p0s.y = P0.y + oy;
      p1s.x = A.x + ox;
      p1s.y = A.y + oy;
      p2s.x = B.x + ox;
      p2s.y = B.y + oy;
      p3s.x = P3.x + ox;
      p3s.y = P3.y + oy;
      const t = i / len;
      ctx.strokeStyle =
        ghostAlpha < 1
          ? "#93c5fd"
          : "hsl(" + (hue - i * 1.6) + " 72% " + (52 - t * 18) + "%)";
      ctx.lineWidth =
        (ghostAlpha < 1 ? 0.68 - t * 0.3 : 0.78 - t * 0.38) * minCell;
      ctx.beginPath();
      ctx.moveTo(p1s.x, p1s.y);
      for (let s = 1; s <= samples; s++) {
        catmull(p0s, p1s, p2s, p3s, s / samples, cmOut);
        ctx.lineTo(cmOut.x, cmOut.y);
      }
      ctx.stroke();
    }
  }

  function drawSnake(state, a) {
    const W = canvas.width;
    const cw = W / state.cols;
    const ch = W / state.rows;
    const len = fillChain(state, a, cw, ch);
    const hue = skin.hue;
    const minCell = Math.min(cw, ch);
    const ghost = state.active[POWER.GHOST] > 0;
    if (ghost) ctx.globalAlpha = 0.55;
    const nt = collectTiles(len, W);
    for (let t = 0; t < nt; t += 2) {
      drawBodyOnTile(
        state,
        len,
        tiles[t] * W,
        tiles[t + 1] * W,
        minCell,
        hue,
        1,
      );
    }
    ctx.globalAlpha = 1;
    const H = ptAt(0);
    for (let t = 0; t < nt; t += 2) {
      drawHeadAt(
        state,
        H.x + tiles[t] * W,
        H.y + tiles[t + 1] * W,
        cw,
        ch,
        hue,
      );
    }
    if (trailId !== "none") {
      const slot = trailBuf[trailN % trailBuf.length];
      slot.x = H.x;
      slot.y = H.y;
      slot.a = 1;
      trailN++;
      const tr = minCell * 0.42;
      ctx.fillStyle =
        trailId === "ember"
          ? "#fb923c"
          : trailId === "ion"
            ? "#67e8f9"
            : trailId === "ribbon"
              ? "#c4b5fd"
              : "#86efac";
      for (let i = 0; i < Math.min(trailN, trailBuf.length); i++) {
        const trl = trailBuf[i];
        trl.a *= 0.92;
        if (trl.a < 0.04) continue;
        ctx.globalAlpha = trl.a * 0.35;
        for (let t = 0; t < nt; t += 2) {
          ctx.beginPath();
          ctx.arc(
            trl.x + tiles[t] * W,
            trl.y + tiles[t + 1] * W,
            tr * 0.35 * trl.a,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawGhost(state, a) {
    const W = canvas.width;
    const cw = W / state.cols;
    const ch = W / state.rows;
    const len = fillChain(state, a, cw, ch);
    if (!len) return;
    const minCell = Math.min(cw, ch);
    ctx.globalAlpha = 0.32;
    const nt = collectTiles(len, W);
    for (let t = 0; t < nt; t += 2) {
      drawBodyOnTile(
        state,
        len,
        tiles[t] * W,
        tiles[t + 1] * W,
        minCell,
        210,
        0.32,
      );
    }
    const H = ptAt(0);
    ctx.fillStyle = "#bfdbfe";
    for (let t = 0; t < nt; t += 2) {
      ctx.beginPath();
      ctx.arc(
        H.x + tiles[t] * W,
        H.y + tiles[t + 1] * W,
        minCell * 0.34,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMenu() {
    resize();
    const W = canvas.width;
    if (!W) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = theme.bg0;
    ctx.fillRect(0, 0, W, W);
    const g = ctx.createLinearGradient(0, 0, 0, W);
    g.addColorStop(0, theme.bg0);
    g.addColorStop(1, theme.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, W);
  }

  function draw(state, now, alpha, ghost) {
    if (lastFrame) {
      const fps = 1000 / Math.max(8, now - lastFrame);
      fpsEma = fpsEma * 0.9 + fps * 0.1;
      if (quality === "auto") {
        if (fpsEma < 42 && autoGlow > 0) autoGlow--;
        else if (fpsEma > 56 && autoGlow < 2) autoGlow++;
      }
    }
    lastFrame = now;
    const W = canvas.width;
    rebuild(state.cols, state.rows);
    const cw = W / state.cols;
    const ch = W / state.rows;
    cell = Math.min(cw, ch);
    const ox = !reduced && shake ? (Math.random() - 0.5) * shake * 10 : 0;
    const oy = !reduced && shake ? (Math.random() - 0.5) * shake * 10 : 0;
    ctx.setTransform(
      zoom,
      0,
      0,
      zoom,
      ox + (1 - zoom) * W * 0.5,
      oy + (1 - zoom) * W * 0.5,
    );
    ctx.drawImage(bgCache, 0, 0);
    ctx.drawImage(gridCache, 0, 0);

    for (const o of state.obstacles) {
      ctx.fillStyle = "rgba(255,255,255,.08)";
      ctx.fillRect(o.x * cw + 2, o.y * ch + 2, cw - 4, ch - 4);
    }
    for (const w of state.movingWalls) {
      ctx.fillStyle = "rgba(248,113,113,.55)";
      for (let i = 0; i < w.len; i++) {
        ctx.fillRect(
          (w.x + w.dx * i) * cw + 2,
          (w.y + w.dy * i) * ch + 2,
          cw - 4,
          ch - 4,
        );
      }
    }
    for (const p of state.portals) {
      ctx.fillStyle = "#818cf8";
      ctx.beginPath();
      ctx.arc(
        (p.ax + 0.5) * cw,
        (p.ay + 0.5) * ch,
        cell * 0.32,
        0,
        Math.PI * 2,
      );
      ctx.arc(
        (p.bx + 0.5) * cw,
        (p.by + 0.5) * ch,
        cell * 0.32,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    const food = state.food;
    if (food) {
      const pulse = reduced
        ? 0.5
        : 0.5 + 0.5 * Math.sin(now / (food.type === FOOD.GOLD ? 160 : 240));
      const fx = (food.x + 0.5) * cw;
      const fy = (food.y + 0.5) * ch;
      const fr = cell * (0.26 + 0.07 * pulse);
      const isP = food.type === FOOD.POISON;
      const isG = food.type === FOOD.GOLD;
      const fcol = isP ? badCol() : isG ? goldCol() : goodCol();
      const fgl = glowLevel();
      if (fgl > 0)
        blitGlow(glowSpriteHex(fcol), fx, fy, fr * (2.4 + 0.9 * pulse));
      ctx.fillStyle = fcol;
      ctx.beginPath();
      ctx.arc(fx, fy, fr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = isG ? "#fff7d6" : "#d8ffe8";
      ctx.beginPath();
      ctx.arc(fx - fr * 0.22, fy - fr * 0.22, fr * 0.26, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const p of state.powerups) {
      const px = (p.x + 0.5) * cw;
      const py = (p.y + 0.5) * ch;
      ctx.fillStyle =
        p.type === POWER.X2
          ? "#fbbf24"
          : p.type === POWER.GHOST
            ? "#c4b5fd"
            : p.type === POWER.MAGNET
              ? "#67e8f9"
              : p.type === POWER.SLOW
                ? "#93c5fd"
                : "#86efac";
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0b1220";
      ctx.font =
        "700 " + ((cell * 0.28) | 0) + "px ui-sans-serif,system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const glyph =
        p.type === POWER.X2
          ? "2"
          : p.type === POWER.GHOST
            ? "G"
            : p.type === POWER.MAGNET
              ? "M"
              : p.type === POWER.SLOW
                ? "S"
                : "-";
      ctx.fillText(glyph, px, py);
    }

    const a = alpha;
    if (ghost && ghost.alive && ghost.snake.length) drawGhost(ghost, a);
    drawSnake(state, a);

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(p.gx * cw, p.gy * ch, cell * 0.08 * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < floats.length; i++) {
      const f = floats[i];
      ctx.globalAlpha = f.t;
      ctx.fillStyle = f.col;
      ctx.font =
        "700 " + ((cell * 0.42) | 0) + "px ui-sans-serif,system-ui,sans-serif";
      ctx.fillText(f.txt, f.gx * cw, f.gy * ch);
    }
    ctx.globalAlpha = 1;
    if (eatFx > 0 && food) {
      ctx.globalAlpha = eatFx * 0.32;
      ctx.strokeStyle = eatCol;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        (food.x + 0.5) * cw,
        (food.y + 0.5) * ch,
        cell * (0.42 + (1 - eatFx)),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(vigCache, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    flashState.flash = flash;
    flashState.flashCol = flashCol;
    return flash;
  }

  return {
    ctx,
    resize,
    setTheme,
    setQuality,
    drawMenu,
    handleEvents,
    updateFx,
    draw,
    recycleAll,
    getFlash: () => flashState,
    burst,
    addFloat,
    chainMaxGap: (state, a) => {
      const n = state.snake.length;
      ensureChain(n);
      return chainMaxGap(state, a, chainX, chainY, chainSplit);
    },
  };
}
