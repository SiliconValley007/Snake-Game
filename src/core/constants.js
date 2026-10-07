export const STORAGE_KEY = "viper:save";
export const STORAGE_VERSION = 2;
export const LEGACY_BEST_KEY = "viperBest";
export const LEGACY_SAVE_KEY = "viper";

export const DIRS = {
  up: { x: 0, y: -1, name: "up" },
  down: { x: 0, y: 1, name: "down" },
  left: { x: -1, y: 0, name: "left" },
  right: { x: 1, y: 0, name: "right" },
};

export const DIR_LIST = [DIRS.up, DIRS.down, DIRS.left, DIRS.right];

export const BASE_TICK = 140;
export const MIN_TICK = 52;
export const QUEUE_MAX = 2;
export const COMBO_TICKS = 18;
export const GRACE_MS = 90;
export const ZOOM_PUNCH = 0.045;
export const PART_CAP = 80;
export const FLOAT_CAP = 12;
export const SWIPE_PX_DEFAULT = 30;

export const POWER = {
  SLOW: "slow",
  GHOST: "ghost",
  MAGNET: "magnet",
  X2: "x2",
  SHRINK: "shrink",
};

export const POWER_LIST = [
  POWER.SLOW,
  POWER.GHOST,
  POWER.MAGNET,
  POWER.X2,
  POWER.SHRINK,
];

export const POWER_DURATION = {
  [POWER.SLOW]: 48,
  [POWER.GHOST]: 28,
  [POWER.MAGNET]: 36,
  [POWER.X2]: 40,
  [POWER.SHRINK]: 1,
};

export const FOOD = {
  NORMAL: "normal",
  GOLD: "gold",
  POISON: "poison",
};

export const MODES = {
  CLASSIC: "classic",
  TIME: "time",
  ENDLESS: "endless",
  DAILY: "daily",
  ZEN: "zen",
};

export const MODE_LIST = [
  MODES.CLASSIC,
  MODES.TIME,
  MODES.ENDLESS,
  MODES.DAILY,
  MODES.ZEN,
];

export const DIFFICULTY = {
  EASY: "easy",
  NORMAL: "normal",
  HARD: "hard",
  VIPER: "viper",
};

export const DIFF_LIST = [
  DIFFICULTY.EASY,
  DIFFICULTY.NORMAL,
  DIFFICULTY.HARD,
  DIFFICULTY.VIPER,
];

export const DIFF_CFG = {
  [DIFFICULTY.EASY]: {
    tick: 170,
    minTick: 80,
    accel: 2.2,
    poison: 0.04,
    hazards: 0.35,
    scoreMul: 0.85,
  },
  [DIFFICULTY.NORMAL]: {
    tick: 140,
    minTick: 58,
    accel: 3.1,
    poison: 0.08,
    hazards: 0.7,
    scoreMul: 1,
  },
  [DIFFICULTY.HARD]: {
    tick: 110,
    minTick: 48,
    accel: 4.0,
    poison: 0.12,
    hazards: 1,
    scoreMul: 1.25,
  },
  [DIFFICULTY.VIPER]: {
    tick: 88,
    minTick: 40,
    accel: 5.0,
    poison: 0.16,
    hazards: 1.2,
    scoreMul: 1.6,
  },
};

export const TIME_ATTACK_SECONDS = 90;
export const ENDLESS_CLEAR_BONUS = 250;

export const XP_PER_SCORE = 0.4;
export const XP_PER_LEVEL = (lv) => 80 + lv * 45;

export const SKINS = [
  { id: "emerald", name: "Emerald", unlock: 0, hue: 148 },
  { id: "gold", name: "Auric", unlock: 3, hue: 42 },
  { id: "ice", name: "Glacier", unlock: 6, hue: 198 },
  { id: "rose", name: "Rose", unlock: 9, hue: 338 },
  { id: "void", name: "Void", unlock: 12, hue: 268 },
  { id: "solar", name: "Solar", unlock: 16, hue: 22 },
];

export const TRAILS = [
  { id: "none", name: "None", unlock: 0 },
  { id: "spark", name: "Spark", unlock: 2 },
  { id: "ribbon", name: "Ribbon", unlock: 5 },
  { id: "ember", name: "Ember", unlock: 8 },
  { id: "ion", name: "Ion", unlock: 14 },
];

export const THEMES = [
  { id: "night", name: "Night", unlock: 0, bg0: "#10182a", bg1: "#0a101c" },
  { id: "forest", name: "Forest", unlock: 4, bg0: "#0d1f16", bg1: "#07140e" },
  { id: "dusk", name: "Dusk", unlock: 7, bg0: "#1a1224", bg1: "#0e0a16" },
  { id: "abyss", name: "Abyss", unlock: 11, bg0: "#0a1422", bg1: "#050910" },
  { id: "ember", name: "Ember", unlock: 15, bg0: "#1c1210", bg1: "#100a08" },
];

export const COLORBLIND = {
  none: null,
  deuteranopia: { good: "#60a5fa", gold: "#fbbf24", bad: "#fb923c" },
  protanopia: { good: "#38bdf8", gold: "#facc15", bad: "#f97316" },
  tritanopia: { good: "#34d399", gold: "#f472b6", bad: "#f87171" },
};

export const ACHIEVEMENTS = [
  { id: "first-bite", name: "First Bite", desc: "Eat your first food" },
  { id: "combo-5", name: "Chain 5", desc: "Reach a 5x combo" },
  { id: "combo-10", name: "Hot Streak", desc: "Reach a 10x combo" },
  { id: "score-100", name: "Century", desc: "Score 100 in one run" },
  { id: "score-500", name: "High Roller", desc: "Score 500 in one run" },
  { id: "ghost-walk", name: "Phantom", desc: "Survive a ghost pass-through" },
  { id: "portal", name: "Warp", desc: "Travel through a portal" },
  { id: "daily", name: "Ritual", desc: "Complete a daily challenge" },
  { id: "zen-50", name: "Stillness", desc: "Reach length 50 in Zen" },
  { id: "clear", name: "Apex", desc: "Clear a classic board" },
  { id: "poison-dodge", name: "No Thanks", desc: "Ignore poison 10 times in a run" },
  { id: "all-powers", name: "Fully Loaded", desc: "Pick up every power-up type" },
  { id: "hard-win", name: "Venom", desc: "Score 200 on Hard or Viper" },
  { id: "time-200", name: "Sprinter", desc: "Score 200 in Time Attack" },
  { id: "level-5", name: "Climber", desc: "Reach player level 5" },
];

export const DEFAULT_KEYS = {
  up: ["ArrowUp", "w", "W"],
  down: ["ArrowDown", "s", "S"],
  left: ["ArrowLeft", "a", "A"],
  right: ["ArrowRight", "d", "D"],
  pause: [" ", "p", "P", "Escape"],
  restart: ["r", "R"],
};

export const PERKS = [
  { id: "none", name: "None", desc: "No modifier" },
  { id: "hardy", name: "Hardy", desc: "Start longer" },
  { id: "swift", name: "Swift", desc: "Faster ticks" },
  { id: "magnet", name: "Pull", desc: "Brief magnet on start" },
  { id: "lucky", name: "Lucky", desc: "Gold food more often" },
  { id: "ghost", name: "Shade", desc: "Brief ghost on start" },
];

export const META_UPGRADES = [
  { id: "len", name: "Bulk", desc: "+1 start length", cost: 80, max: 3 },
  { id: "xp", name: "Scholar", desc: "+15% XP", cost: 100, max: 2 },
  { id: "slow", name: "Calm", desc: "Start tick +8ms", cost: 90, max: 2 },
  { id: "combo", name: "Chain", desc: "Combo window +4", cost: 120, max: 1 },
];
