import { describe, it, expect } from "vitest";
import {
  loadSave,
  writeSave,
  defaultSave,
  exportSave,
  importSave,
  pushBoard,
  boardKey,
} from "../src/core/storage.js";
import { STORAGE_KEY, LEGACY_BEST_KEY, LEGACY_SAVE_KEY, STORAGE_VERSION } from "../src/core/constants.js";
import { createGame, timeTick } from "../src/core/game.js";
import { MODES } from "../src/core/constants.js";
import { applyXp, xpForScore, grantAchievement, makeReplay, tickMissions, dailyMissions } from "../src/meta/meta.js";
import { createAudio } from "../src/audio/audio.js";
import { createInput } from "../src/input/input.js";
import { DIRS } from "../src/core/constants.js";

function mem() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

describe("storage migration", () => {
  it("loads defaults", () => {
    const s = loadSave(mem());
    expect(s.v).toBe(STORAGE_VERSION);
    expect(s.best).toBe(0);
    expect(s.sound).toBe(true);
  });
  it("migrates v1 viper key and legacy best", () => {
    const st = mem();
    st.setItem(STORAGE_KEY, JSON.stringify({ best: 40, wrap: true, sound: false }));
    st.setItem(LEGACY_BEST_KEY, "90");
    const s = loadSave(st);
    expect(s.v).toBe(STORAGE_VERSION);
    expect(s.best).toBe(90);
    expect(s.wrap).toBe(true);
    expect(s.sound).toBe(false);
    expect(s.muted).toBe(true);
  });
  it("reads legacy un-namespaced save key", () => {
    const st = mem();
    st.setItem(LEGACY_SAVE_KEY, JSON.stringify({ v: 2, best: 33, wrap: true }));
    const s = loadSave(st);
    expect(s.best).toBe(33);
    expect(s.wrap).toBe(true);
  });
  it("survives quota and missing storage", () => {
    expect(writeSave(null, defaultSave())).toBe(false);
    const st = mem();
    st.setItem = () => {
      const e = new Error("quota");
      e.name = "QuotaExceededError";
      e.code = 22;
      throw e;
    };
    expect(writeSave(st, defaultSave())).toBe(false);
  });
  it("roundtrips v2", () => {
    const st = mem();
    const d = defaultSave();
    d.best = 120;
    d.skin = "gold";
    writeSave(st, d);
    const s = loadSave(st);
    expect(s.best).toBe(120);
    expect(s.skin).toBe("gold");
  });
  it("export/import preserves data", () => {
    const d = defaultSave();
    d.best = 55;
    d.xp = 12;
    const json = exportSave(d);
    const s = importSave(json);
    expect(s.best).toBe(55);
    expect(s.xp).toBe(12);
    expect(s.v).toBe(STORAGE_VERSION);
  });
  it("imports v1 json", () => {
    const s = importSave(JSON.stringify({ best: 7, wrap: true, sound: true }));
    expect(s.best).toBe(7);
    expect(s.wrap).toBe(true);
    expect(s.v).toBe(STORAGE_VERSION);
  });
  it("keeps top 10 leaderboard", () => {
    const d = defaultSave();
    for (let i = 0; i < 15; i++) pushBoard(d, "classic", "normal", { score: i, at: i, len: 3, combo: 1 });
    const list = d.boards[boardKey("classic", "normal")];
    expect(list.length).toBe(10);
    expect(list[0].score).toBe(14);
  });
});

describe("meta + time", () => {
  it("applies xp and levels", () => {
    const d = defaultSave();
    applyXp(d, 500);
    expect(d.level).toBeGreaterThan(1);
    expect(xpForScore(100)).toBeGreaterThan(0);
  });
  it("grants achievements once", () => {
    const d = defaultSave();
    expect(grantAchievement(d, "first-bite")).toBeTruthy();
    expect(grantAchievement(d, "first-bite")).toBe(false);
  });
  it("time attack ends", () => {
    const s = createGame({ mode: MODES.TIME, seed: 1, wrapOn: true });
    timeTick(s, s.timeLeft + 10);
    expect(s.alive).toBe(false);
    expect(s.deathReason).toBe("time");
  });
  it("makeReplay snapshots inputs", () => {
    const s = createGame({ seed: 9, wrapOn: true });
    s.inputLog.push({ t: 0, d: "up" });
    const r = makeReplay(s);
    expect(r.seed).toBe(9);
    expect(r.inputs.length).toBe(1);
  });
  it("eat mission uses foodsEaten not length", () => {
    const d = defaultSave();
    const s = createGame({ seed: 1, wrapOn: true });
    s.foodsEaten = 12;
    s.snake.length = 3;
    tickMissions(d, s);
    const eat = dailyMissions().find((m) => m.kind === "eat");
    expect(d.missions[eat.id].progress).toBe(12);
    expect(d.missions[eat.id].done).toBe(true);
  });
  it("claimMission grants xp once", async () => {
    const { claimMission } = await import("../src/meta/meta.js");
    const d = defaultSave();
    const s = createGame({ seed: 1, wrapOn: true });
    s.foodsEaten = 12;
    tickMissions(d, s);
    const eat = dailyMissions().find((m) => m.kind === "eat");
    const xp = d.xp;
    expect(claimMission(d, eat.id)).toBe(true);
    expect(d.xp).toBe(xp + 40);
    expect(claimMission(d, eat.id)).toBe(false);
  });
});

describe("audio lifecycle", () => {
  it("stopMusic and close are safe without a context", () => {
    const a = createAudio();
    expect(() => a.stopMusic()).not.toThrow();
    expect(() => a.close()).not.toThrow();
    expect(() => a.restore()).not.toThrow();
  });
  it("disabling audio does not start music", () => {
    const a = createAudio();
    a.setEnabled(false);
    expect(() => a.startMusic()).not.toThrow();
    a.stopMusic();
  });
});

describe("gamepad", () => {
  it("polls primary on idle without a rAF loop", () => {
    let n = 0;
    const input = createInput({
      onDir() {},
      onPause() {},
      onRestart() {},
      onPrimary() {
        n++;
      },
      keys: () => ({ up: [], down: [], left: [], right: [], restart: [] }),
      getSwipePx: () => 30,
    });
    const pressed = Array.from({ length: 16 }, (_, i) => ({ pressed: i === 0 }));
    Object.defineProperty(globalThis, "navigator", {
      value: { getGamepads: () => [{ axes: [0, 0], buttons: pressed }] },
      configurable: true,
    });
    input.pollGamepad();
    expect(n).toBe(1);
  });
  it("dir press invokes onDir", () => {
    const dirs = [];
    const input = createInput({
      onDir(d) {
        dirs.push(d);
      },
      onPause() {},
      onRestart() {},
      onPrimary() {},
      keys: () => ({ up: [], down: [], left: [], right: [], restart: [] }),
      getSwipePx: () => 30,
    });
    const buttons = Array.from({ length: 16 }, (_, i) => ({ pressed: i === 15 }));
    Object.defineProperty(globalThis, "navigator", {
      value: { getGamepads: () => [{ axes: [0, 0], buttons }] },
      configurable: true,
    });
    input.pollGamepad();
    expect(dirs[0]).toEqual(DIRS.right);
  });
});
