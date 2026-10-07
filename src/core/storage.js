import {
  STORAGE_KEY,
  STORAGE_VERSION,
  LEGACY_BEST_KEY,
  LEGACY_SAVE_KEY,
  DEFAULT_KEYS,
} from "./constants.js";

export function defaultSave() {
  return {
    v: STORAGE_VERSION,
    best: 0,
    wrap: false,
    sound: true,
    musicVol: 0.55,
    sfxVol: 0.8,
    muted: false,
    haptics: true,
    reducedMotion: null,
    swipePx: 30,
    colorblind: "none",
    keys: { ...DEFAULT_KEYS },
    difficulty: "normal",
    mode: "classic",
    mapId: "arena",
    skin: "emerald",
    trail: "none",
    theme: "night",
    xp: 0,
    level: 1,
    achievements: {},
    missions: {},
    boards: {},
    daily: {},
    seenTutorial: false,
    quality: "auto",
    leftPad: false,
    perk: "none",
    ghost: true,
    ghosts: {},
    streak: 0,
    lastDaily: "",
    claimed: {},
    upgrades: {},
    customMaps: [],
    unlocked: { skins: ["emerald"], trails: ["none"], themes: ["night"] },
  };
}

function migrateV1(raw) {
  const d = defaultSave();
  d.best = Math.max(0, +raw.best || 0);
  d.wrap = !!raw.wrap;
  d.sound = raw.sound !== false;
  d.muted = raw.sound === false;
  return d;
}

export function loadSave(storage) {
  const out = defaultSave();
  try {
    if (!storage) return out;
    let raw = storage.getItem(STORAGE_KEY);
    if (!raw) raw = storage.getItem(LEGACY_SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (!s.v || s.v < 2) Object.assign(out, migrateV1(s));
      else {
        Object.assign(out, s);
        out.v = STORAGE_VERSION;
        out.best = Math.max(0, +out.best || 0);
        if (!out.keys) out.keys = { ...DEFAULT_KEYS };
        if (!out.boards) out.boards = {};
        if (!out.ghosts) out.ghosts = {};
        if (!out.upgrades) out.upgrades = {};
        if (!out.customMaps) out.customMaps = [];
        if (!out.claimed) out.claimed = {};
        if (!out.achievements) out.achievements = {};
        if (!out.unlocked) out.unlocked = defaultSave().unlocked;
      }
    }
    const legacy = +storage.getItem(LEGACY_BEST_KEY);
    if (legacy > out.best) out.best = legacy;
  } catch (_) {}
  return out;
}

export function writeSave(storage, data) {
  try {
    if (!storage) return false;
    const payload = { ...data, v: STORAGE_VERSION };
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    if (e && (e.name === "QuotaExceededError" || e.code === 22)) return false;
    return false;
  }
}

export function boardKey(mode, difficulty) {
  return mode + ":" + difficulty;
}

export function pushBoard(save, mode, difficulty, entry) {
  const k = boardKey(mode, difficulty);
  const list = save.boards[k] ? save.boards[k].slice() : [];
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  save.boards[k] = list.slice(0, 10);
  return save.boards[k];
}

export function exportSave(save) {
  return JSON.stringify({ ...save, v: STORAGE_VERSION }, null, 2);
}

export function importSave(json) {
  const s = JSON.parse(json);
  if (!s || typeof s !== "object") throw new Error("invalid");
  const d = defaultSave();
  if (!s.v || s.v < 2) return Object.assign(d, migrateV1(s));
  return Object.assign(d, s, { v: STORAGE_VERSION });
}
