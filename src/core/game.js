import {
  BASE_TICK,
  COMBO_TICKS,
  DIFF_CFG,
  DIFFICULTY,
  FOOD,
  GRACE_MS,
  MODES,
  POWER,
  POWER_DURATION,
  POWER_LIST,
  QUEUE_MAX,
  TIME_ATTACK_SECONDS,
  ENDLESS_CLEAR_BONUS,
} from "./constants.js";
import { buildOccupancy, getMap } from "./maps.js";
import { mulberry32 } from "./rng.js";

export function opp(a, b) {
  return a.x === -b.x && a.y === -b.y;
}

export function same(a, b) {
  return a.x === b.x && a.y === b.y;
}

export function cloneDir(d) {
  return { x: d.x, y: d.y, name: d.name };
}

function ck(x, y) {
  return ((y + 64) << 8) | (x + 64);
}

const occSet = new Set();
const pickScratch = { x: 0, y: 0 };
const wrapScratch = { x: 0, y: 0 };
const portScratch = { x: 0, y: 0, used: false };
const segPool = [];

function occupiedSet(state) {
  occSet.clear();
  for (const p of state.snake) occSet.add(ck(p.x, p.y));
  for (const o of state.obstacles) occSet.add(ck(o.x, o.y));
  for (const w of state.movingWalls) {
    for (let i = 0; i < w.len; i++)
      occSet.add(ck(w.x + w.dx * i, w.y + w.dy * i));
  }
  if (state.food) occSet.add(ck(state.food.x, state.food.y));
  for (const p of state.powerups) occSet.add(ck(p.x, p.y));
  for (const p of state.portals) {
    occSet.add(ck(p.ax, p.ay));
    occSet.add(ck(p.bx, p.by));
  }
  return occSet;
}

function freeCells(state, extra) {
  const occ = occupiedSet(state);
  if (extra) for (const k of extra) occ.add(k);
  const cells = [];
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      if (!occ.has(ck(x, y))) cells.push({ x, y });
    }
  }
  return cells;
}

function pickCell(state, rng) {
  const occ = occupiedSet(state);
  let n = 0;
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      if (!occ.has(ck(x, y))) n++;
    }
  }
  if (!n) return null;
  let pick = (rng() * n) | 0;
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      if (occ.has(ck(x, y))) continue;
      if (pick === 0) {
        pickScratch.x = x;
        pickScratch.y = y;
        return pickScratch;
      }
      pick--;
    }
  }
  return null;
}

function spawnFood(state) {
  const cell = pickCell(state, state.rng);
  if (!cell) return false;
  let type = FOOD.NORMAL;
  const roll = state.rng();
  if (state.mode !== MODES.ZEN && roll < state.diff.poison) type = FOOD.POISON;
  else if (
    state.mode !== MODES.ZEN &&
    state.score >= 30 &&
    roll < state.diff.poison + 0.14 + (state.perk === "lucky" ? 0.12 : 0)
  )
    type = FOOD.GOLD;
  state.food = state.food || { x: 0, y: 0, type: FOOD.NORMAL };
  state.food.x = cell.x;
  state.food.y = cell.y;
  state.food.type = type;
  return true;
}

function maybeSpawnPower(state) {
  if (state.mode === MODES.ZEN) return;
  if (state.powerups.length >= 2) return;
  if (state.rng() > 0.18) return;
  const cell = pickCell(state, state.rng);
  if (!cell) return;
  const type = POWER_LIST[(state.rng() * POWER_LIST.length) | 0];
  state.powerups.push({ x: cell.x, y: cell.y, type, life: 80 });
}

function applyPower(state, type) {
  state.powersGot.add(type);
  if (type === POWER.SHRINK) {
    const minLen = 3;
    const cut = Math.min(4, Math.max(0, state.snake.length - minLen));
    if (cut) {
      for (let i = 0; i < cut; i++) {
        const t = state.snake.pop();
        if (t) segPool.push(t);
      }
    }
    state.events.push({ type: "shrink", cut });
    return;
  }
  state.active[type] = POWER_DURATION[type];
  state.events.push({ type: "power", power: type });
}

function wrapPos(state, x, y) {
  if (state.wrapOn) {
    const cols = state.cols;
    const rows = state.rows;
    wrapScratch.x = ((x % cols) + cols) % cols;
    wrapScratch.y = ((y % rows) + rows) % rows;
  } else {
    wrapScratch.x = x;
    wrapScratch.y = y;
  }
  return wrapScratch;
}

function inBounds(state, x, y) {
  return x >= 0 && y >= 0 && x < state.cols && y < state.rows;
}

function isObstacle(state, x, y) {
  for (const o of state.obstacles) if (o.x === x && o.y === y) return true;
  for (const w of state.movingWalls) {
    for (let i = 0; i < w.len; i++) {
      if (w.x + w.dx * i === x && w.y + w.dy * i === y) return true;
    }
  }
  return false;
}

function portalExit(state, x, y) {
  for (const p of state.portals) {
    if (p.ax === x && p.ay === y) {
      portScratch.x = p.bx;
      portScratch.y = p.by;
      portScratch.used = true;
      return portScratch;
    }
    if (p.bx === x && p.by === y) {
      portScratch.x = p.ax;
      portScratch.y = p.ay;
      portScratch.used = true;
      return portScratch;
    }
  }
  portScratch.x = x;
  portScratch.y = y;
  portScratch.used = false;
  return portScratch;
}

function magnetPull(state) {
  if (state.active[POWER.MAGNET] <= 0 || !state.food) return;
  const h = state.snake[0];
  const f = state.food;
  const dx = Math.sign(h.x - f.x);
  const dy = Math.sign(h.y - f.y);
  const nx = f.x + (state.tickCount % 2 === 0 ? dx : 0);
  const ny = f.y + (state.tickCount % 2 === 1 ? dy : 0);
  if (inBounds(state, nx, ny) && !isObstacle(state, nx, ny)) {
    const hitSnake = state.snake.some(
      (p, i) => i > 0 && p.x === nx && p.y === ny,
    );
    if (!hitSnake) {
      f.x = nx;
      f.y = ny;
    }
  }
}

function stepMovingWalls(state) {
  if (state.mode === MODES.ZEN) return;
  for (const w of state.movingWalls) {
    w.t++;
    if (w.t % 2 !== 0) continue;
    let nx = w.x + w.dx;
    let ny = w.y + w.dy;
    const pos = w.axis === "x" ? nx : ny;
    if (pos < w.min || pos > w.max - w.len + 1) {
      w.dx *= -1;
      w.dy *= -1;
      nx = w.x + w.dx;
      ny = w.y + w.dy;
    }
    w.x = nx;
    w.y = ny;
  }
}

function tickPowers(state) {
  for (const k of POWER_LIST) {
    if (state.active[k] > 0) state.active[k]--;
  }
  for (let i = state.powerups.length - 1; i >= 0; i--) {
    state.powerups[i].life--;
    if (state.powerups[i].life <= 0) state.powerups.splice(i, 1);
  }
}

function currentTick(state) {
  let t = state.tickMs;
  if (state.active[POWER.SLOW] > 0) t *= 1.7;
  if (state.mode === MODES.ZEN) t = Math.max(t, 160);
  return t;
}

/**
 * Create a new deterministic game state.
 */
export function createGame(opts = {}) {
  const mode = opts.mode || MODES.CLASSIC;
  const difficulty = opts.difficulty || DIFFICULTY.NORMAL;
  const map = opts.map || getMap(opts.mapId || "arena");
  const seed = opts.seed >>> 0 || 1;
  const rng = mulberry32(seed);
  const built = buildOccupancy(map);
  const wrapOn = opts.wrapOn != null ? !!opts.wrapOn : map.wrapDefault;
  const diff = DIFF_CFG[difficulty] || DIFF_CFG[DIFFICULTY.NORMAL];
  const cols = map.cols;
  const rows = map.rows;
  const mx = (cols / 2) | 0;
  const my = (rows / 2) | 0;

  const snake = [
    { x: mx, y: my },
    { x: mx - 1, y: my },
    { x: mx - 2, y: my },
  ];

  const state = {
    seed,
    rng,
    mode,
    difficulty,
    mapId: map.id,
    cols,
    rows,
    snake,
    prev: snake.map((p) => ({ ...p })),
    dir: { x: 1, y: 0, name: "right" },
    queued: [],
    food: null,
    special: false,
    powerups: [],
    active: {
      [POWER.SLOW]: 0,
      [POWER.GHOST]: 0,
      [POWER.MAGNET]: 0,
      [POWER.X2]: 0,
      [POWER.SHRINK]: 0,
    },
    obstacles: built.obstacles,
    movingWalls: built.walls,
    portals: built.portals,
    score: 0,
    combo: 0,
    maxCombo: 0,
    lastEatTick: -999,
    tickCount: 0,
    wrapOn,
    tickMs: diff.tick,
    minTick: diff.minTick,
    diff,
    alive: true,
    won: false,
    deathReason: null,
    timeLeft: mode === MODES.TIME ? TIME_ATTACK_SECONDS * 1000 : 0,
    level: 1,
    foodsThisLevel: 0,
    foodsEaten: 0,
    levelTarget: 8,
    events: [],
    inputLog: [],
    powersGot: new Set(),
    poisonIgnored: 0,
    ghostPass: false,
    portalUsed: false,
    lastStepAt: 0,
    graceDir: null,
    graceUntil: 0,
    paused: false,
  };

  spawnFood(state);
  const perk = opts.perk || "none";
  state.perk = perk;
  state.upgrades = opts.upgrades || {};
  applyPerk(state, perk);
  applyMeta(state);
  return state;
}

function applyPerk(state, perk) {
  if (perk === "hardy") {
    const h = state.snake[state.snake.length - 1];
    state.snake.push({ x: h.x - 1, y: h.y }, { x: h.x - 2, y: h.y });
    snapshotSnake(state);
  }
  if (perk === "swift")
    state.tickMs = Math.max(state.minTick, state.tickMs - 18);
  if (perk === "magnet") state.active[POWER.MAGNET] = 24;
  if (perk === "ghost") state.active[POWER.GHOST] = 16;
}

function applyMeta(state) {
  const u = state.upgrades || {};
  const extra = Math.min(3, u.len | 0);
  if (extra) {
    const t = state.snake[state.snake.length - 1];
    for (let i = 1; i <= extra; i++) state.snake.push({ x: t.x - i, y: t.y });
    snapshotSnake(state);
  }
  if (u.slow) state.tickMs += 8 * Math.min(2, u.slow | 0);
}

export function snapshotSnake(state) {
  const n = state.snake.length;
  const prev = state.prev;
  while (prev.length < n) prev.push({ x: 0, y: 0 });
  if (prev.length > n) prev.length = n;
  for (let i = 0; i < n; i++) {
    prev[i].x = state.snake[i].x;
    prev[i].y = state.snake[i].y;
  }
  return prev;
}

export function enqueueDir(state, dir, now = 0) {
  if (!dir || !state.alive) return false;
  const last = state.queued.length
    ? state.queued[state.queued.length - 1]
    : state.dir;
  if (same(last, dir)) return false;
  if (opp(last, dir)) {
    if (
      now &&
      now <= state.graceUntil &&
      state.graceDir &&
      !opp(state.graceDir, dir)
    ) {
      /* allow grace reverse-buffer as perpendicular vs previous */
    } else {
      return false;
    }
  }
  if (state.queued.length >= QUEUE_MAX) return false;
  state.queued.push(cloneDir(dir));
  if (now) {
    state.graceDir = cloneDir(dir);
    state.graceUntil = now + GRACE_MS;
  }
  return true;
}

export function recordInput(state, dirName, tick) {
  state.inputLog.push({ t: tick, d: dirName });
}

function scoreFor(state, foodType) {
  const base =
    foodType === FOOD.GOLD ? 35 : foodType === FOOD.POISON ? -20 : 10;
  const comboAdd = state.combo > 1 ? (state.combo - 1) * 5 : 0;
  let n = base + (base > 0 ? comboAdd : 0);
  if (state.active[POWER.X2] > 0 && n > 0) n *= 2;
  n = Math.round(n * state.diff.scoreMul);
  return n;
}

function kill(state, reason) {
  state.alive = false;
  state.deathReason = reason;
  state.events.push({ type: "die", reason });
}

function tryEat(state, hx, hy) {
  const f = state.food;
  if (!f || f.x !== hx || f.y !== hy) return false;
  if (f.type === FOOD.POISON) {
    state.events.push({ type: "poison" });
    const add = scoreFor(state, FOOD.POISON);
    state.score = Math.max(0, state.score + add);
    state.combo = 0;
    spawnFood(state);
    maybeSpawnPower(state);
    return "poison";
  }
  const wasGold = f.type === FOOD.GOLD;
  const comboWin =
    COMBO_TICKS + (state.upgrades && state.upgrades.combo ? 4 : 0);
  const fast = state.tickCount - state.lastEatTick <= comboWin;
  state.combo = fast ? state.combo + 1 : 1;
  if (state.combo > state.maxCombo) state.maxCombo = state.combo;
  const add = scoreFor(state, f.type);
  state.score += add;
  state.lastEatTick = state.tickCount;
  state.foodsEaten++;
  state.tickMs = Math.max(
    state.minTick,
    state.tickMs - (wasGold ? state.diff.accel + 2.4 : state.diff.accel),
  );
  state.events.push({
    type: "eat",
    gold: wasGold,
    add,
    combo: state.combo,
    x: hx,
    y: hy,
  });
  state.foodsThisLevel++;
  if (!spawnFood(state)) {
    if (state.mode === MODES.ENDLESS) {
      advanceLevel(state);
    } else if (state.mode === MODES.ZEN) {
      spawnFood(state);
    } else {
      state.won = true;
      state.alive = false;
      state.events.push({ type: "win" });
    }
  } else {
    maybeSpawnPower(state);
  }
  return "eat";
}

function tryPower(state, hx, hy) {
  const i = state.powerups.findIndex((p) => p.x === hx && p.y === hy);
  if (i < 0) return false;
  const p = state.powerups.splice(i, 1)[0];
  applyPower(state, p.type);
  return true;
}

function advanceLevel(state) {
  state.level++;
  state.foodsThisLevel = 0;
  state.levelTarget = 8 + state.level * 2;
  state.score += ENDLESS_CLEAR_BONUS;
  state.tickMs = Math.max(state.minTick, state.tickMs - 4);
  const mapCycle = [
    "arena",
    "garden",
    "fortress",
    "rivers",
    "voidgate",
    "colossus",
  ];
  const nextId = mapCycle[(state.level - 1) % mapCycle.length];
  const map = getMap(nextId);
  state.mapId = map.id;
  state.cols = map.cols;
  state.rows = map.rows;
  const built = buildOccupancy(map);
  state.obstacles = built.obstacles;
  state.movingWalls = built.walls;
  state.portals = built.portals;
  const mx = (map.cols / 2) | 0;
  const my = (map.rows / 2) | 0;
  const keep = Math.min(state.snake.length, 8);
  state.snake = [];
  for (let i = 0; i < keep; i++) {
    state.snake.push({ x: mx - i, y: my });
  }
  state.prev = state.snake.map((p) => ({ ...p }));
  state.dir = { x: 1, y: 0, name: "right" };
  state.queued.length = 0;
  state.powerups.length = 0;
  spawnFood(state);
  const pool = ["hardy", "swift", "magnet", "lucky", "ghost"].filter(
    (p) => p !== state.perk,
  );
  const picks = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const j = (state.rng() * pool.length) | 0;
    picks.push(pool.splice(j, 1)[0]);
  }
  state.draft = picks;
  state.events.push({ type: "level", level: state.level, draft: picks });
}

export function applyDraft(state, perkId) {
  if (!state.draft || !state.draft.includes(perkId)) return false;
  applyPerk(state, perkId);
  state.perk = perkId;
  state.draft = null;
  state.paused = false;
  return true;
}

function selfHit(state, hx, hy, growing) {
  const end = growing ? state.snake.length : state.snake.length - 1;
  for (let i = 0; i < end; i++) {
    if (state.snake[i].x === hx && state.snake[i].y === hy) return true;
  }
  return false;
}

/**
 * Advance one simulation tick. Deterministic.
 * @returns {object} state
 */
export function step(state, now = 0) {
  state.events.length = 0;
  if (!state.alive || state.paused) return state;

  snapshotSnake(state);
  if (state.queued.length) state.dir = state.queued.shift();

  tickPowers(state);
  stepMovingWalls(state);
  magnetPull(state);

  let hx = state.snake[0].x + state.dir.x;
  let hy = state.snake[0].y + state.dir.y;
  const wrapped = wrapPos(state, hx, hy);
  hx = wrapped.x;
  hy = wrapped.y;

  if (!state.wrapOn && !inBounds(state, hx, hy)) {
    if (tryGrace(state, now)) return step(state, 0);
    kill(state, "wall");
    return state;
  }

  const port = portalExit(state, hx, hy);
  if (port.used) {
    const px = port.x;
    const py = port.y;
    hx = px + state.dir.x;
    hy = py + state.dir.y;
    const w2 = wrapPos(state, hx, hy);
    hx = w2.x;
    hy = w2.y;
    state.portalUsed = true;
    state.events.push({ type: "portal" });
  }

  const ghost = state.active[POWER.GHOST] > 0;
  const growingFood =
    state.food &&
    state.food.x === hx &&
    state.food.y === hy &&
    state.food.type !== FOOD.POISON;

  if (isObstacle(state, hx, hy) && !ghost) {
    if (tryGrace(state, now)) return step(state, 0);
    kill(state, "obstacle");
    return state;
  }

  if (selfHit(state, hx, hy, !!growingFood)) {
    if (ghost) {
      state.ghostPass = true;
      state.events.push({ type: "ghost-pass" });
    } else {
      if (tryGrace(state, now)) return step(state, 0);
      kill(state, "self");
      return state;
    }
  }

  const head = segPool.pop() || { x: 0, y: 0 };
  head.x = hx;
  head.y = hy;
  state.snake.unshift(head);
  const ate = tryEat(state, hx, hy);
  tryPower(state, hx, hy);

  if (ate === "poison") {
    const tail = state.snake.pop();
    if (tail) segPool.push(tail);
    if (state.snake.length < 3) {
      kill(state, "poison");
      return state;
    }
  } else if (ate !== "eat") {
    const tail = state.snake.pop();
    if (tail) segPool.push(tail);
    if (state.food && state.food.type === FOOD.POISON) {
      const old = state.prev[0];
      const f = state.food;
      if (old && Math.abs(old.x - f.x) + Math.abs(old.y - f.y) === 1) {
        const h = state.snake[0];
        if (Math.abs(h.x - f.x) + Math.abs(h.y - f.y) > 1)
          state.poisonIgnored++;
      }
    }
  } else {
    const t = state.snake[state.snake.length - 1];
    const p = state.prev;
    while (p.length < state.snake.length) p.push({ x: t.x, y: t.y });
    p[p.length - 1].x = t.x;
    p[p.length - 1].y = t.y;
  }

  state.tickCount++;
  state.lastStepAt = now;
  return state;
}

function tryGrace(state, now) {
  if (!now || now > state.graceUntil || !state.queued.length) return false;
  const nxt = state.queued[0];
  if (!nxt || opp(nxt, state.dir) || same(nxt, state.dir)) return false;
  state.events.push({ type: "grace" });
  return true;
}

export function getTickMs(state) {
  return currentTick(state);
}

export function timeTick(state, dt) {
  if (state.mode !== MODES.TIME || !state.alive) return;
  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    kill(state, "time");
  }
}

/**
 * Replay: recreate from seed + input log and verify score.
 * inputs: [{t: tickCount, d: 'up'|'down'|...}]
 */
export function replay(opts, inputs) {
  const state = createGame(opts);
  const dirMap = {
    up: { x: 0, y: -1, name: "up" },
    down: { x: 0, y: 1, name: "down" },
    left: { x: -1, y: 0, name: "left" },
    right: { x: 1, y: 0, name: "right" },
  };
  let i = 0;
  const max = 20000;
  while (state.alive && state.tickCount < max) {
    while (i < inputs.length && inputs[i].t === state.tickCount) {
      const d = dirMap[inputs[i].d];
      if (d) enqueueDir(state, d, 0);
      i++;
    }
    step(state, 0);
    if (state.draft && state.draft.length) applyDraft(state, state.draft[0]);
  }
  return state;
}

export function verifyReplay(opts, inputs, expectedScore) {
  const s = replay(opts, inputs);
  return s.score === expectedScore;
}

export { spawnFood, pickCell, occupiedSet, freeCells };
