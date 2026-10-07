import {
  ACHIEVEMENTS,
  SKINS,
  TRAILS,
  THEMES,
  XP_PER_SCORE,
  XP_PER_LEVEL,
  MODES,
} from "../core/constants.js";
import { pushBoard } from "../core/storage.js";
import { utcDateKey } from "../core/rng.js";

export function xpForScore(score) {
  return Math.floor(score * XP_PER_SCORE);
}

export function applyXp(save, gained) {
  save.xp += gained;
  let need = XP_PER_LEVEL(save.level);
  const unlocked = [];
  while (save.xp >= need) {
    save.xp -= need;
    save.level += 1;
    need = XP_PER_LEVEL(save.level);
    unlocked.push(...checkUnlocks(save));
  }
  return unlocked;
}

export function checkUnlocks(save) {
  const got = [];
  for (const s of SKINS) {
    if (save.level >= s.unlock && !save.unlocked.skins.includes(s.id)) {
      save.unlocked.skins.push(s.id);
      got.push({ kind: "skin", id: s.id, name: s.name });
    }
  }
  for (const t of TRAILS) {
    if (save.level >= t.unlock && !save.unlocked.trails.includes(t.id)) {
      save.unlocked.trails.push(t.id);
      got.push({ kind: "trail", id: t.id, name: t.name });
    }
  }
  for (const t of THEMES) {
    if (save.level >= t.unlock && !save.unlocked.themes.includes(t.id)) {
      save.unlocked.themes.push(t.id);
      got.push({ kind: "theme", id: t.id, name: t.name });
    }
  }
  return got;
}

export function grantAchievement(save, id) {
  if (save.achievements[id]) return false;
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return false;
  save.achievements[id] = Date.now();
  return def;
}

export function evaluateRun(save, state, eventsSeen) {
  const unlocked = [];
  const add = (id) => {
    const a = grantAchievement(save, id);
    if (a) unlocked.push(a);
  };
  if (state.score > 0 || eventsSeen.eat) add("first-bite");
  if (state.maxCombo >= 5) add("combo-5");
  if (state.maxCombo >= 10) add("combo-10");
  if (state.score >= 100) add("score-100");
  if (state.score >= 500) add("score-500");
  if (state.ghostPass) add("ghost-walk");
  if (state.portalUsed) add("portal");
  if (state.mode === MODES.DAILY) add("daily");
  if (state.mode === MODES.ZEN && state.snake.length >= 50) add("zen-50");
  if (state.won) add("clear");
  if (state.poisonIgnored >= 10) add("poison-dodge");
  if (state.powersGot && state.powersGot.size >= 5) add("all-powers");
  if (
    (state.difficulty === "hard" || state.difficulty === "viper") &&
    state.score >= 200
  )
    add("hard-win");
  if (state.mode === MODES.TIME && state.score >= 200) add("time-200");
  if (save.level >= 5) add("level-5");
  return unlocked;
}

export function dailyMissions(date = new Date()) {
  const key = utcDateKey(date);
  return [
    { id: key + "-eat", desc: "Eat 12 food", target: 12, kind: "eat" },
    { id: key + "-combo", desc: "Hit a 4x combo", target: 4, kind: "combo" },
    {
      id: key + "-score",
      desc: "Score 80 in one run",
      target: 80,
      kind: "score",
    },
  ];
}

export function recordRun(save, state) {
  const entry = {
    score: state.score,
    at: Date.now(),
    len: state.snake.length,
    combo: state.maxCombo,
    map: state.mapId,
  };
  pushBoard(save, state.mode, state.difficulty, entry);
  if (state.mode === MODES.DAILY) {
    const k = utcDateKey();
    const cur = save.daily[k] || { score: 0 };
    if (state.score > cur.score) save.daily[k] = entry;
  }
  if (state.score > save.best) save.best = state.score;
  const mul = 1 + 0.15 * Math.min(2, (save.upgrades && save.upgrades.xp) || 0);
  const gained = Math.floor(xpForScore(state.score) * mul);
  const cosmetics = applyXp(save, gained);
  tickStreak(save, state);
  const ach = evaluateRun(save, state, { eat: state.score > 0 });
  tickMissions(save, state);
  return { gained, cosmetics, ach, best: state.score >= save.best };
}

export function tickMissions(save, state) {
  const list = dailyMissions();
  if (!save.missions) save.missions = {};
  for (const m of list) {
    const cur = save.missions[m.id] || {
      progress: 0,
      done: false,
      claimed: false,
    };
    if (cur.done) {
      save.missions[m.id] = cur;
      continue;
    }
    if (m.kind === "eat")
      cur.progress = Math.max(cur.progress, state.foodsEaten || 0);
    if (m.kind === "combo")
      cur.progress = Math.max(cur.progress, state.maxCombo);
    if (m.kind === "score") cur.progress = Math.max(cur.progress, state.score);
    if (cur.progress >= m.target) cur.done = true;
    save.missions[m.id] = cur;
  }
}

export function claimMission(save, id) {
  const cur = save.missions && save.missions[id];
  if (!cur || !cur.done || cur.claimed) return false;
  cur.claimed = true;
  save.xp += 40;
  return true;
}

export function tickStreak(save, state) {
  if (state.mode !== MODES.DAILY) return;
  const k = utcDateKey();
  if (save.lastDaily === k) return;
  const y = new Date();
  y.setUTCDate(y.getUTCDate() - 1);
  const prev = utcDateKey(y);
  save.streak = save.lastDaily === prev ? (save.streak || 0) + 1 : 1;
  save.lastDaily = k;
}

export function makeReplay(state) {
  return {
    v: 1,
    seed: state.seed,
    mode: state.mode,
    difficulty: state.difficulty,
    mapId: state.mapId,
    wrapOn: state.wrapOn,
    perk: state.perk || "none",
    upgrades: state.upgrades || {},
    inputs: state.inputLog.slice(),
    score: state.score,
  };
}

export async function shareCard(canvas, score, mode) {
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return false;
  const file = new File([blob], "viper.png", { type: "image/png" });
  const text = `VIPER ${mode} — ${score}`;
  try {
    if (
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({ files: [file], title: "VIPER", text });
      return true;
    }
  } catch (_) {}
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "viper-score.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return true;
}
