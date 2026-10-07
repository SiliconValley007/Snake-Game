import { describe, it, expect } from "vitest";
import { createGame, step, enqueueDir, replay, verifyReplay, getTickMs } from "../src/core/game.js";
import { DIRS, FOOD, MODES, POWER, DIFFICULTY } from "../src/core/constants.js";
import { MAPS, getMap, cellKey } from "../src/core/maps.js";
import { mulberry32, hashString, dailySeed, utcDateKey } from "../src/core/rng.js";
import { unwrapCell, headCell, tailCell, catmull, buildChain, chainMaxGap } from "../src/render/interp.js";

function runTicks(state, n) {
  for (let i = 0; i < n && state.alive; i++) step(state, 0);
  return state;
}

describe("rng", () => {
  it("is deterministic", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });
  it("hashes strings stably", () => {
    expect(hashString("viper")).toBe(hashString("viper"));
    expect(hashString("a")).not.toBe(hashString("b"));
  });
  it("daily seed uses UTC date", () => {
    const d = new Date(Date.UTC(2026, 0, 15));
    expect(utcDateKey(d)).toBe("2026-01-15");
    expect(dailySeed(d)).toBe(dailySeed(d));
  });
});

describe("seeded runs", () => {
  it("same seed yields same food and score path", () => {
    const opts = { mode: MODES.CLASSIC, difficulty: DIFFICULTY.NORMAL, mapId: "arena", seed: 12345, wrapOn: true };
    const a = createGame(opts);
    const b = createGame(opts);
    expect(a.food).toEqual(b.food);
    enqueueDir(a, DIRS.up);
    enqueueDir(b, DIRS.up);
    runTicks(a, 40);
    runTicks(b, 40);
    expect(a.score).toBe(b.score);
    expect(a.snake.map((p) => p.x + "," + p.y)).toEqual(b.snake.map((p) => p.x + "," + p.y));
    expect(a.tickCount).toBe(b.tickCount);
  });
});

describe("collisions", () => {
  it("dies on wall when wrap is off", () => {
    const s = createGame({ seed: 1, wrapOn: false, mapId: "arena" });
    const startX = s.snake[0].x;
    runTicks(s, s.cols - startX + 2);
    expect(s.alive).toBe(false);
    expect(s.deathReason).toBe("wall");
  });
  it("dies on self when looping", () => {
    const s = createGame({ seed: 99, wrapOn: true, mapId: "arena" });
    s.snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 9, y: 11 },
      { x: 10, y: 11 },
      { x: 11, y: 11 },
      { x: 11, y: 10 },
      { x: 11, y: 9 },
    ];
    s.prev = s.snake.map((p) => ({ ...p }));
    s.dir = { x: 0, y: 1, name: "down" };
    s.food = { x: 0, y: 0, type: FOOD.NORMAL };
    step(s, 0);
    expect(s.alive).toBe(false);
    expect(s.deathReason).toBe("self");
  });
  it("dies on obstacle", () => {
    const s = createGame({ seed: 3, wrapOn: false, mapId: "arena" });
    const h = s.snake[0];
    s.obstacles = [{ x: h.x + 1, y: h.y }];
    s.food = { x: 0, y: 0, type: FOOD.NORMAL };
    step(s, 0);
    expect(s.alive).toBe(false);
    expect(s.deathReason).toBe("obstacle");
  });
});

describe("wrap", () => {
  it("wraps through edges", () => {
    const s = createGame({ seed: 7, wrapOn: true, mapId: "arena" });
    s.snake = [
      { x: s.cols - 1, y: 10 },
      { x: s.cols - 2, y: 10 },
      { x: s.cols - 3, y: 10 },
    ];
    s.prev = s.snake.map((p) => ({ ...p }));
    s.dir = { x: 1, y: 0, name: "right" };
    s.food = { x: 5, y: 5, type: FOOD.NORMAL };
    step(s, 0);
    expect(s.alive).toBe(true);
    expect(s.snake[0].x).toBe(0);
    expect(s.snake[0].y).toBe(10);
  });
});

describe("scoring and food", () => {
  it("awards points and grows on eat", () => {
    const s = createGame({ seed: 11, wrapOn: true, mapId: "arena" });
    const h = s.snake[0];
    s.food = { x: h.x + 1, y: h.y, type: FOOD.NORMAL };
    const len = s.snake.length;
    step(s, 0);
    expect(s.score).toBeGreaterThan(0);
    expect(s.snake.length).toBe(len + 1);
    expect(s.events.some((e) => e.type === "eat")).toBe(true);
  });
  it("gold food scores more than normal", () => {
    const a = createGame({ seed: 12, wrapOn: true, mapId: "arena" });
    const b = createGame({ seed: 12, wrapOn: true, mapId: "arena" });
    const h = a.snake[0];
    a.food = { x: h.x + 1, y: h.y, type: FOOD.NORMAL };
    b.food = { x: h.x + 1, y: h.y, type: FOOD.GOLD };
    step(a, 0);
    step(b, 0);
    expect(b.score).toBeGreaterThan(a.score);
  });
  it("combo increases when eating within window", () => {
    const s = createGame({ seed: 13, wrapOn: true, mapId: "arena" });
    const eatNext = () => {
      const h = s.snake[0];
      s.food = { x: h.x + s.dir.x, y: h.y + s.dir.y, type: FOOD.NORMAL };
      if (s.food.x < 0 || s.food.x >= s.cols) s.food.x = h.x;
      step(s, 0);
    };
    eatNext();
    eatNext();
    eatNext();
    expect(s.combo).toBeGreaterThanOrEqual(2);
    expect(s.maxCombo).toBeGreaterThanOrEqual(s.combo);
  });
});

describe("power-ups", () => {
  it("ghost survives self overlap", () => {
    const s = createGame({ seed: 21, wrapOn: true, mapId: "arena" });
    s.snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 9, y: 11 },
      { x: 10, y: 11 },
      { x: 11, y: 11 },
      { x: 11, y: 10 },
      { x: 11, y: 9 },
    ];
    s.prev = s.snake.map((p) => ({ ...p }));
    s.dir = { x: 0, y: 1, name: "down" };
    s.active[POWER.GHOST] = 10;
    s.food = { x: 0, y: 0, type: FOOD.NORMAL };
    step(s, 0);
    expect(s.alive).toBe(true);
    expect(s.ghostPass).toBe(true);
  });
  it("x2 doubles food score", () => {
    const a = createGame({ seed: 22, wrapOn: true, mapId: "arena" });
    const b = createGame({ seed: 22, wrapOn: true, mapId: "arena" });
    const h = a.snake[0];
    a.food = { x: h.x + 1, y: h.y, type: FOOD.NORMAL };
    b.food = { x: h.x + 1, y: h.y, type: FOOD.NORMAL };
    b.active[POWER.X2] = 10;
    step(a, 0);
    step(b, 0);
    expect(b.score).toBe(a.score * 2);
  });
  it("shrink shortens the snake", () => {
    const s = createGame({ seed: 23, wrapOn: true, mapId: "arena" });
    s.snake = [];
    for (let i = 0; i < 10; i++) s.snake.push({ x: 10 - i, y: 10 });
    s.prev = s.snake.map((p) => ({ ...p }));
    const h = s.snake[0];
    s.powerups = [{ x: h.x + 1, y: h.y, type: POWER.SHRINK, life: 20 }];
    s.food = { x: 0, y: 0, type: FOOD.NORMAL };
    const before = s.snake.length;
    step(s, 0);
    expect(s.snake.length).toBeLessThan(before);
  });
  it("slow-mo increases tick ms", () => {
    const s = createGame({ seed: 24, wrapOn: true, mapId: "arena" });
    const base = getTickMs(s);
    s.active[POWER.SLOW] = 10;
    expect(getTickMs(s)).toBeGreaterThan(base);
  });
  it("magnet moves food toward head", () => {
    const s = createGame({ seed: 25, wrapOn: true, mapId: "arena" });
    s.active[POWER.MAGNET] = 20;
    const h = s.snake[0];
    s.food = { x: h.x + 6, y: h.y, type: FOOD.NORMAL };
    const fx = s.food.x;
    step(s, 0);
    expect(Math.abs(s.food.x - h.x)).toBeLessThanOrEqual(Math.abs(fx - h.x));
  });
});

describe("portals", () => {
  it("teleports through paired portals", () => {
    const s = createGame({ seed: 31, wrapOn: false, mapId: "arena" });
    s.portals = [{ ax: 12, ay: 10, bx: 3, by: 3 }];
    s.snake = [
      { x: 11, y: 10 },
      { x: 10, y: 10 },
      { x: 9, y: 10 },
    ];
    s.prev = s.snake.map((p) => ({ ...p }));
    s.dir = { x: 1, y: 0, name: "right" };
    s.food = { x: 0, y: 0, type: FOOD.NORMAL };
    s.obstacles = [];
    step(s, 0);
    expect(s.portalUsed).toBe(true);
    expect(s.snake[0].x).toBe(4);
    expect(s.snake[0].y).toBe(3);
  });
});

describe("poison", () => {
  it("reduces score and does not grow", () => {
    const s = createGame({ seed: 41, wrapOn: true, mapId: "arena" });
    s.score = 50;
    const h = s.snake[0];
    const len = s.snake.length;
    s.food = { x: h.x + 1, y: h.y, type: FOOD.POISON };
    step(s, 0);
    expect(s.score).toBeLessThan(50);
    expect(s.snake.length).toBe(len);
  });
  it("increments poisonIgnored when leaving a poison cell", () => {
    const s = createGame({ seed: 42, wrapOn: true, mapId: "arena" });
    const h = s.snake[0];
    s.food = { x: h.x, y: h.y - 1, type: FOOD.POISON };
    s.dir = { x: 1, y: 0, name: "right" };
    const before = s.poisonIgnored;
    step(s, 0);
    expect(s.poisonIgnored).toBe(before + 1);
  });
});

describe("grace turn", () => {
  it("uses queued perpendicular dir instead of dying into a wall", () => {
    const s = createGame({ seed: 1, wrapOn: false, mapId: "arena" });
    s.snake = [
      { x: s.cols - 1, y: 10 },
      { x: s.cols - 2, y: 10 },
      { x: s.cols - 3, y: 10 },
    ];
    s.prev = s.snake.map((p) => ({ ...p }));
    s.dir = { x: 1, y: 0, name: "right" };
    s.food = { x: 5, y: 5, type: FOOD.NORMAL };
    enqueueDir(s, DIRS.up, 10);
    s.graceUntil = 50;
    step(s, 20);
    expect(s.alive).toBe(true);
    expect(s.snake[0].y).toBe(9);
    expect(s.snake[0].x).toBe(s.cols - 1);
  });
});

describe("maps", () => {
  it("has at least 5 maps", () => {
    expect(MAPS.length).toBeGreaterThanOrEqual(5);
    expect(getMap("fortress").id).toBe("fortress");
    expect(cellKey(1, 2)).toBe("1,2");
  });
  it("generates a deterministic procedural map", async () => {
    const { generateProcMap } = await import("../src/core/maps.js");
    const a = generateProcMap(99);
    const b = generateProcMap(99);
    expect(a.cols).toBe(b.cols);
    expect(a.obstacles).toEqual(b.obstacles);
    expect(a.id).toMatch(/^proc-/);
  });
});

describe("perks and drafts", () => {
  it("hardy starts longer than default", () => {
    const a = createGame({ seed: 1, wrapOn: true, perk: "none" });
    const b = createGame({ seed: 1, wrapOn: true, perk: "hardy" });
    expect(b.snake.length).toBeGreaterThan(a.snake.length);
  });
  it("swift starts with a faster tick", () => {
    const a = createGame({ seed: 1, wrapOn: true, perk: "none" });
    const b = createGame({ seed: 1, wrapOn: true, perk: "swift" });
    expect(getTickMs(b)).toBeLessThan(getTickMs(a));
  });
  it("applies a draft perk", async () => {
    const { applyDraft } = await import("../src/core/game.js");
    const s = createGame({ seed: 1, wrapOn: true, perk: "none" });
    s.draft = ["magnet", "lucky", "ghost"];
    s.paused = true;
    expect(applyDraft(s, "magnet")).toBe(true);
    expect(s.paused).toBe(false);
    expect(s.active[POWER.MAGNET]).toBeGreaterThan(0);
  });
});

describe("replay verification", () => {
  it("replays input log to the same score", () => {
    const opts = { mode: MODES.CLASSIC, difficulty: DIFFICULTY.EASY, mapId: "arena", seed: 777, wrapOn: true };
    const s = createGame(opts);
    const dirs = [DIRS.up, DIRS.right, DIRS.down, DIRS.left, DIRS.up, DIRS.right];
    for (let i = 0; i < 80 && s.alive; i++) {
      if (i % 7 === 0) {
        const d = dirs[(i / 7) | 0];
        if (d && enqueueDir(s, d, 0)) s.inputLog.push({ t: s.tickCount, d: d.name });
      }
      step(s, 0);
    }
    expect(verifyReplay(opts, s.inputLog, s.score)).toBe(true);
    const r = replay(opts, s.inputLog);
    expect(r.score).toBe(s.score);
    expect(verifyReplay(opts, s.inputLog, s.score + 1)).toBe(false);
  });
});

describe("motion (no logic hitstop)", () => {
  it("keeps stepping immediately after eating", () => {
    const s = createGame({ seed: 11, wrapOn: true, mapId: "arena" });
    const h = s.snake[0];
    s.food = { x: h.x + 1, y: h.y, type: FOOD.NORMAL };
    step(s, 0);
    const t1 = s.tickCount;
    step(s, 0);
    expect(s.tickCount).toBe(t1 + 1);
    expect("hitstop" in s).toBe(false);
  });
});

describe("interpolation continuity", () => {
  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  it("head and tail stay continuous across eat growth", () => {
    const s = createGame({ seed: 11, wrapOn: true, mapId: "arena" });
    const h = s.snake[0];
    s.food = { x: h.x + 1, y: h.y, type: FOOD.NORMAL };
    const beforeH = { ...headCell(s, 1) };
    const beforeT = { ...tailCell(s, 1) };
    const len = s.snake.length;
    step(s, 0);
    expect(s.snake.length).toBe(len + 1);
    const afterH = { ...headCell(s, 0) };
    const afterT = { ...tailCell(s, 0) };
    expect(dist(beforeH, afterH)).toBeLessThan(0.05);
    expect(dist(beforeT, afterT)).toBeLessThan(0.05);
  });
  it("wrap unwrap keeps head continuous in unwrapped space", () => {
    const s = createGame({ seed: 7, wrapOn: true, mapId: "arena" });
    s.snake = [
      { x: s.cols - 1, y: 10 },
      { x: s.cols - 2, y: 10 },
      { x: s.cols - 3, y: 10 },
    ];
    s.prev = s.snake.map((p) => ({ ...p }));
    s.dir = { x: 1, y: 0, name: "right" };
    s.food = { x: 5, y: 5, type: FOOD.NORMAL };
    const before = { ...headCell(s, 1) };
    step(s, 0);
    const after = { ...headCell(s, 0) };
    expect(dist(before, after)).toBeLessThan(0.05);
    const mid = { x: 0, y: 0, split: false };
    unwrapCell(s, 0, 0.5, mid);
    expect(mid.x).toBeGreaterThan(s.cols - 1);
    expect(mid.split).toBe(false);
  });
  it("portal hop marks split instead of teleport lerp", () => {
    const s = createGame({ seed: 31, wrapOn: false, mapId: "arena" });
    s.portals = [{ ax: 12, ay: 10, bx: 3, by: 3 }];
    s.snake = [
      { x: 11, y: 10 },
      { x: 10, y: 10 },
      { x: 9, y: 10 },
    ];
    s.prev = s.snake.map((p) => ({ ...p }));
    s.dir = { x: 1, y: 0, name: "right" };
    s.food = { x: 0, y: 0, type: FOOD.NORMAL };
    s.obstacles = [];
    step(s, 0);
    const o = { x: 0, y: 0, split: false };
    unwrapCell(s, 0, 0.4, o);
    expect(o.split).toBe(true);
    expect(o.x).toBe(s.prev[0].x);
    unwrapCell(s, 0, 0.6, o);
    expect(o.split).toBe(true);
    expect(o.x).toBe(s.snake[0].x);
  });
  it("catmull midpoint sits between endpoints", () => {
    const out = { x: 0, y: 0 };
    catmull({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, 0.5, out);
    expect(out.x).toBeGreaterThan(1);
    expect(out.x).toBeLessThan(2);
    expect(out.y).toBeCloseTo(0);
  });
  it("speed-ramp alpha stays in 0..1 after tick rescale", () => {
    const s = createGame({ seed: 24, wrapOn: true, mapId: "arena" });
    const tick0 = getTickMs(s);
    let acc = tick0 * 0.7;
    s.active[POWER.SLOW] = 10;
    const tick1 = getTickMs(s);
    acc = (acc / tick0) * tick1;
    const a = Math.min(1, Math.max(0, acc / tick1));
    expect(a).toBeCloseTo(0.7);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
  });
});

describe("wrap-turn chain continuity", () => {
  const cx = new Float64Array(32);
  const cy = new Float64Array(32);
  const cs = new Uint8Array(32);
  function place(s, cells, dir) {
    s.snake = cells.map((p) => ({ x: p.x, y: p.y }));
    s.prev = s.snake.map((p) => ({ ...p }));
    s.dir = dir;
    s.food = { x: (s.snake[0].x + 3 + s.cols) % s.cols, y: (s.snake[0].y + 3 + s.rows) % s.rows, type: FOOD.NORMAL };
    s.obstacles = [];
    s.wrapOn = true;
  }
  function assertChain(s) {
    for (let k = 0; k <= 10; k++) {
      const a = k / 10;
      const gap = chainMaxGap(s, a, cx, cy, cs);
      expect(gap).toBeLessThanOrEqual(1.05);
      const n = buildChain(s, a, cx, cy, cs);
      expect(n).toBe(s.snake.length);
      for (let i = 1; i < n; i++) {
        if (cs[i]) continue;
        expect(Math.hypot(cx[i] - cx[i - 1], cy[i] - cy[i - 1])).toBeLessThanOrEqual(1.05);
      }
    }
  }
  const cases = [
    { name: "right wall then up", cells: [{ x: 16, y: 8 }, { x: 15, y: 8 }, { x: 14, y: 8 }, { x: 13, y: 8 }], dir: DIRS.right, turn: DIRS.up },
    { name: "left wall then down", cells: [{ x: 0, y: 8 }, { x: 1, y: 8 }, { x: 2, y: 8 }, { x: 3, y: 8 }], dir: DIRS.left, turn: DIRS.down },
    { name: "top wall then right", cells: [{ x: 8, y: 0 }, { x: 8, y: 1 }, { x: 8, y: 2 }, { x: 8, y: 3 }], dir: DIRS.up, turn: DIRS.right },
    { name: "bottom wall then left", cells: [{ x: 8, y: 16 }, { x: 8, y: 15 }, { x: 8, y: 14 }, { x: 8, y: 13 }], dir: DIRS.down, turn: DIRS.left },
    { name: "NE corner right then up", cells: [{ x: 16, y: 0 }, { x: 15, y: 0 }, { x: 14, y: 0 }, { x: 13, y: 0 }], dir: DIRS.right, turn: DIRS.up },
    { name: "NW corner left then up", cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }], dir: DIRS.left, turn: DIRS.up },
    { name: "SE corner right then down", cells: [{ x: 16, y: 16 }, { x: 15, y: 16 }, { x: 14, y: 16 }, { x: 13, y: 16 }], dir: DIRS.right, turn: DIRS.down },
    { name: "SW corner left then down", cells: [{ x: 0, y: 16 }, { x: 1, y: 16 }, { x: 2, y: 16 }, { x: 3, y: 16 }], dir: DIRS.left, turn: DIRS.down },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const s = createGame({ seed: 77, wrapOn: true, mapId: "arena" });
      place(s, c.cells, c.dir);
      step(s, 0);
      enqueueDir(s, c.turn, 0);
      step(s, 0);
      assertChain(s);
      s.food = { x: s.snake[0].x + s.dir.x, y: s.snake[0].y + s.dir.y, type: FOOD.NORMAL };
      if (s.food.x < 0) s.food.x += s.cols;
      if (s.food.y < 0) s.food.y += s.rows;
      if (s.food.x >= s.cols) s.food.x -= s.cols;
      if (s.food.y >= s.rows) s.food.y -= s.rows;
      step(s, 0);
      assertChain(s);
      s.active[POWER.SLOW] = 8;
      step(s, 0);
      assertChain(s);
    });
  }
});

describe("modes", () => {
  it("time attack starts with a clock", () => {
    const s = createGame({ mode: MODES.TIME, seed: 1, wrapOn: true });
    expect(s.timeLeft).toBeGreaterThan(0);
    expect(s.mode).toBe(MODES.TIME);
  });
  it("zen never spawns poison", () => {
    const s = createGame({ mode: MODES.ZEN, seed: 55, wrapOn: true });
    for (let i = 0; i < 30 && s.food; i++) {
      expect(s.food.type).not.toBe(FOOD.POISON);
      s.food = null;
      s.powerups.length = 0;
      const h = s.snake[0];
      s.food = { x: h.x + 1, y: h.y, type: FOOD.NORMAL };
      step(s, 0);
    }
  });
});
