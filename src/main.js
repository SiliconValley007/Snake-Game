import "./styles.css";
import { BASE_TICK, MODES } from "./core/constants.js";
import { createGame, enqueueDir, step, getTickMs, timeTick, recordInput, replay, verifyReplay, applyDraft } from "./core/game.js";
import { loadSave, writeSave, exportSave, importSave } from "./core/storage.js";
import { dailySeed } from "./core/rng.js";
import { applyCustomMaps, generateProcMap } from "./core/maps.js";
import { createRenderer } from "./render/render.js";
import { headCell, tailCell, chainMaxGap } from "./render/interp.js";
import { createAudio } from "./audio/audio.js";
import { createInput } from "./input/input.js";
import {
  el,
  setChip,
  announce,
  buildMenu,
  overlayState,
  hideOverlay,
  fillPanel,
  hidePanel,
  isPanelOpen,
  settingsHtml,
  garageHtml,
  boardHtml,
  achHtml,
  helpHtml,
  tutorialHtml,
  treeHtml,
  mapsHtml,
} from "./ui/ui.js";
import { recordRun, makeReplay, shareCard, claimMission, dailyMissions, tickMissions } from "./meta/meta.js";
import { META_UPGRADES, PERKS } from "./core/constants.js";
import { registerSW, applyWaiting, requestWakeLock, enterFullscreen } from "./pwa/pwa.js";
import { POWER } from "./core/constants.js";

const ICON_PAUSE =
  '<rect x="2" y="1" width="4" height="14" rx="1" fill="currentColor"/><rect x="10" y="1" width="4" height="14" rx="1" fill="currentColor"/>';
const ICON_PLAY = '<path d="M4 2.2v11.6L13.4 8z" fill="currentColor"/>';

function boot() {
  const canvas = el("c");
  if (!canvas.getContext("2d", { alpha: false })) {
    el("msg").textContent = "Canvas unavailable";
    el("btn").disabled = true;
    return;
  }

  const reducedMq = matchMedia("(prefers-reduced-motion: reduce)");
  let save = loadSave(window.localStorage);
  let reduced = save.reducedMotion != null ? !!save.reducedMotion : reducedMq.matches;
  if (reduced) document.body.classList.add("reduce");
  document.body.classList.toggle("leftPad", !!save.leftPad);

  const audio = createAudio();
  const renderer = createRenderer(canvas);
  renderer.setTheme(save.theme, save.skin, save.trail, save.colorblind, reduced);
  renderer.setQuality(save.quality || "auto");
  applyCustomMaps(save.customMaps);

  let game = null;
  let screen = "idle";
  let watching = false;
  let replaySpeed = 1;
  let replayIdx = 0;
  let replayLog = [];
  let ghostRun = null;
  let ghostIdx = 0;
  let ghostLog = [];
  let rafId = 0;
  let gpIdle = 0;
  let acc = 0;
  let last = 0;
  let lastTick = 0;
  let dtEma = 1000 / 60;
  let wake = null;
  let lastReplay = null;
  const DIRMAP = {
    up: { x: 0, y: -1, name: "up" },
    down: { x: 0, y: 1, name: "down" },
    left: { x: -1, y: 0, name: "left" },
    right: { x: 1, y: 0, name: "right" },
  };

  const SC = el("sc");
  const HI = el("hi");
  const LEN = el("len");
  const SPD = el("spd");
  const CMB = el("cmb");
  const FL = el("flash");
  const PAUSE = el("pause");
  const PAUSE_ICON = el("pauseIcon");
  const UI = el("ui");
  const BTN = el("btn");
  const RESTART = el("restartBtn");
  const OPTS = el("opts");

  HI.textContent = String(save.best);

  function persist() {
    writeSave(window.localStorage, save);
  }

  function hud() {
    if (!game) return;
    LEN.textContent = "Len " + game.snake.length;
    SPD.textContent = "Spd " + (BASE_TICK / getTickMs(game)).toFixed(1) + "x";
    CMB.textContent = game.combo > 1 ? "Combo x" + game.combo : "";
    const pw = el("pwHud");
    if (pw) {
      const bits = [];
      if (game.active[POWER.SLOW] > 0) bits.push("S " + game.active[POWER.SLOW]);
      if (game.active[POWER.GHOST] > 0) bits.push("G " + game.active[POWER.GHOST]);
      if (game.active[POWER.MAGNET] > 0) bits.push("M " + game.active[POWER.MAGNET]);
      if (game.active[POWER.X2] > 0) bits.push("2 " + game.active[POWER.X2]);
      pw.textContent = bits.join(" · ");
    }
    const mh = el("msLive");
    if (mh) {
      const list = dailyMissions();
      mh.textContent = list
        .map((m) => {
          const c = (save.missions && save.missions[m.id]) || { progress: 0 };
          return Math.min(c.progress || 0, m.target) + "/" + m.target;
        })
        .join(" ");
    }
  }

  function popScore() {
    if (reduced || !SC.animate) {
      SC.classList.remove("pop");
      SC.classList.add("pop");
      return;
    }
    SC.getAnimations().forEach((a) => a.cancel());
    SC.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }],
      { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
  }

  function deferIdle(fn) {
    if (typeof requestIdleCallback === "function") requestIdleCallback(fn, { timeout: 48 });
    else queueMicrotask(fn);
  }

  function haptic(pat) {
    if (!save.haptics) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pat);
    } catch (_) {}
  }

  function seedFor() {
    if (save.mode === MODES.DAILY) return dailySeed();
    return (Math.random() * 0xffffffff) | 0;
  }

  function showIdle() {
    screen = "idle";
    overlayState(UI, {
      mode: "idle",
      title: "",
      detail: "Swipe, pad, arrows or WASD",
      cta: "Play",
      showOpts: true,
      showRestart: false,
      score: 0,
    });
    PAUSE_ICON.innerHTML = ICON_PAUSE;
    refreshMenu();
    audio.stopMusic();
    stopLoop();
    requestAnimationFrame(() => renderer.drawMenu());
    armIdlePad();
  }

  function refreshMenu() {
    const menu = buildMenu(OPTS, save, {
      onMode: (m) => {
        save.mode = m;
        persist();
        refreshMenu();
      },
      onDiff: (d) => {
        save.difficulty = d;
        persist();
        refreshMenu();
      },
      onMap: (id) => {
        save.mapId = id;
        persist();
        refreshMenu();
      },
      onPerk: (id) => {
        save.perk = id;
        persist();
        refreshMenu();
      },
      onWrap: () => {
        save.wrap = !save.wrap;
        persist();
        setChip(el("wrapBtn"), save.wrap);
        el("detail").textContent = save.wrap ? "Edges wrap around" : "Crash on walls";
      },
      onSound: () => {
        save.sound = !save.sound;
        save.muted = !save.sound;
        persist();
        audio.setEnabled(save.sound && !save.muted);
        setChip(el("sndBtn"), save.sound && !save.muted);
        if (save.sound) audio.ui();
      },
      onSettings: openSettings,
      onGarage: openGarage,
      onBoard: () => {
        fillPanel(boardHtml(save, save.mode, save.difficulty));
        bindPanelClose();
      },
      onAch: openAch,
      onHelp: () => {
        fillPanel(helpHtml());
        bindPanelClose();
      },
      onTree: openTree,
      onMaps: openMaps,
    });
    return menu;
  }

  function closePanel(e) {
    if (e) e.stopPropagation();
    hidePanel();
  }

  function bindPanelClose() {
    const panel = el("panel");
    const c = el("panelClose");
    if (c) c.addEventListener("click", closePanel);
    const tut = el("tutGo");
    if (tut)
      tut.addEventListener("click", (e) => {
        e.stopPropagation();
        save.seenTutorial = true;
        persist();
        hidePanel();
      });
    if (panel && !panel.dataset.bound) {
      panel.dataset.bound = "1";
      panel.addEventListener("click", (e) => {
        if (e.target === panel) hidePanel();
      });
    }
  }

  function openSettings() {
    fillPanel(settingsHtml(save));
    el("musicSl").addEventListener("input", (e) => {
      save.musicVol = +e.target.value;
      audio.setMusic(save.musicVol);
      persist();
    });
    el("sfxSl").addEventListener("input", (e) => {
      save.sfxVol = +e.target.value;
      audio.setSfx(save.sfxVol);
      persist();
    });
    el("hapCk").addEventListener("change", (e) => {
      save.haptics = e.target.checked;
      persist();
    });
    el("rmCk").addEventListener("change", (e) => {
      save.reducedMotion = e.target.checked;
      reduced = e.target.checked;
      document.body.classList.toggle("reduce", reduced);
      renderer.setTheme(save.theme, save.skin, save.trail, save.colorblind, reduced);
      persist();
    });
    el("swSl").addEventListener("input", (e) => {
      save.swipePx = +e.target.value;
      persist();
    });
    el("cbSel").addEventListener("change", (e) => {
      save.colorblind = e.target.value;
      renderer.setTheme(save.theme, save.skin, save.trail, save.colorblind, reduced);
      persist();
    });
    const qs = el("qualSel");
    if (qs)
      qs.addEventListener("change", (e) => {
        save.quality = e.target.value;
        renderer.setQuality(save.quality);
        persist();
      });
      const lp = el("leftPadCk");
      if (lp)
        lp.addEventListener("change", (e) => {
          save.leftPad = e.target.checked;
          document.body.classList.toggle("leftPad", save.leftPad);
          persist();
        });
      const gh = el("ghostCk");
      if (gh)
        gh.addEventListener("change", (e) => {
          save.ghost = e.target.checked;
          persist();
        });
    el("fsBtn").addEventListener("click", () => enterFullscreen(document.documentElement));
    el("exportBtn").addEventListener("click", () => {
      const blob = new Blob([exportSave(save)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "viper-save.json";
      a.click();
    });
    el("importBtn").addEventListener("click", () => el("importFile").click());
    el("importFile").addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        save = importSave(await f.text());
        persist();
        HI.textContent = String(save.best);
        refreshMenu();
        hidePanel();
      } catch (_) {}
    });
    bindPanelClose();
  }

  function openGarage() {
    fillPanel(garageHtml(save));
    const panel = el("panel");
    if (panel && !panel.dataset.garage) {
      panel.dataset.garage = "1";
      panel.addEventListener("click", onGarageClick);
    }
    bindPanelClose();
  }

  function openAch() {
    fillPanel(achHtml(save));
    const p = el("panel");
    p.querySelectorAll("[data-claim]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (claimMission(save, b.dataset.claim)) {
          persist();
          openAch();
        }
      });
    });
    bindPanelClose();
  }

  function openTree() {
    fillPanel(treeHtml(save));
    el("panel").addEventListener(
      "click",
      (e) => {
        const b = e.target.closest("[data-up]");
        if (!b) return;
        e.stopPropagation();
        const id = b.dataset.up;
        const def = META_UPGRADES.find((t) => t.id === id);
        if (!def) return;
        if (!save.upgrades) save.upgrades = {};
        const lv = save.upgrades[id] | 0;
        const cost = def.cost * (lv + 1);
        if (lv >= def.max || save.xp < cost) return;
        save.xp -= cost;
        save.upgrades[id] = lv + 1;
        persist();
        openTree();
      },
      { once: true },
    );
    bindPanelClose();
  }

  function openMaps() {
    fillPanel(mapsHtml(save));
    const canvasEd = el("edCanvas");
    const ed = { cells: new Set(), cols: 17, rows: 17 };
    function paintEd() {
      if (!canvasEd) return;
      const ctx = canvasEd.getContext("2d");
      const s = canvasEd.width / ed.cols;
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, canvasEd.width, canvasEd.height);
      ctx.strokeStyle = "rgba(255,255,255,.08)";
      for (let i = 0; i <= ed.cols; i++) {
        ctx.beginPath();
        ctx.moveTo(i * s, 0);
        ctx.lineTo(i * s, canvasEd.height);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,.25)";
      for (const k of ed.cells) {
        const [x, y] = k.split(",").map(Number);
        ctx.fillRect(x * s + 1, y * s + 1, s - 2, s - 2);
      }
    }
    paintEd();
    if (canvasEd)
      canvasEd.addEventListener("click", (e) => {
        const r = canvasEd.getBoundingClientRect();
        const s = canvasEd.width / ed.cols;
        const x = ((e.clientX - r.left) * (canvasEd.width / r.width) / s) | 0;
        const y = ((e.clientY - r.top) * (canvasEd.height / r.height) / s) | 0;
        const k = x + "," + y;
        if (ed.cells.has(k)) ed.cells.delete(k);
        else ed.cells.add(k);
        paintEd();
      });
    const proc = el("procBtn");
    if (proc)
      proc.addEventListener("click", () => {
        const raw = (el("procSeed").value || "").trim();
        const seed = raw ? (parseInt(raw, 16) || parseInt(raw, 10) || 1) : ((Math.random() * 0xffffffff) | 0);
        const m = generateProcMap(seed >>> 0);
        if (!save.customMaps) save.customMaps = [];
        save.customMaps.push(m);
        save.mapId = m.id;
        applyCustomMaps(save.customMaps);
        persist();
        openMaps();
      });
    const saveBtn = el("edSave");
    if (saveBtn)
      saveBtn.addEventListener("click", () => {
        const obstacles = [...ed.cells].map((k) => {
          const [x, y] = k.split(",").map(Number);
          return { x, y };
        });
        const m = {
          id: "custom-" + Date.now().toString(36),
          name: "Custom",
          cols: ed.cols,
          rows: ed.rows,
          wrapDefault: false,
          obstacles,
          portals: [],
          walls: [],
        };
        if (!save.customMaps) save.customMaps = [];
        save.customMaps.push(m);
        save.mapId = m.id;
        applyCustomMaps(save.customMaps);
        persist();
        openMaps();
      });
    const exp = el("edExport");
    if (exp)
      exp.addEventListener("click", () => {
        const blob = new Blob([JSON.stringify(save.customMaps || [], null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "viper-maps.json";
        a.click();
      });
    const imp = el("edImport");
    if (imp)
      imp.addEventListener("click", () => el("edFile").click());
    const file = el("edFile");
    if (file)
      file.addEventListener("change", async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try {
          const list = JSON.parse(await f.text());
          if (Array.isArray(list)) {
            save.customMaps = (save.customMaps || []).concat(list.filter((m) => m && m.id));
            applyCustomMaps(save.customMaps);
            persist();
            openMaps();
          }
        } catch (_) {}
      });
    bindPanelClose();
  }

  function offerDraft(picks) {
    if (game) game.paused = true;
    const html =
      '<div class="panelInner"><div class="panelHead"><h2>Level up</h2></div><div class="panelBody"><p>Pick a perk</p><div class="row">' +
      picks
        .map((id) => {
          const p = PERKS.find((x) => x.id === id) || { id, name: id };
          return '<button class="chip" type="button" data-draft="' + p.id + '">' + p.name + "</button>";
        })
        .join("") +
      "</div></div></div>";
    fillPanel(html);
    el("panel").querySelectorAll("[data-draft]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        applyDraft(game, b.dataset.draft);
        audio.perk();
        hidePanel();
      });
    });
  }

  function onGarageClick(e) {
    const b = e.target.closest("button[data-kind]");
    if (!b || b.disabled) return;
    e.stopPropagation();
    const kind = b.dataset.kind;
    const id = b.dataset.id;
    if (kind === "skin") save.skin = id;
    if (kind === "trail") save.trail = id;
    if (kind === "theme") save.theme = id;
    renderer.setTheme(save.theme, save.skin, save.trail, save.colorblind, reduced);
    persist();
    openGarage();
  }

  function play() {
    hidePanel();
    game = createGame({
      mode: save.mode,
      difficulty: save.difficulty,
      mapId: save.mode === MODES.DAILY ? "garden" : save.mapId,
      seed: seedFor(),
      wrapOn: save.wrap,
      perk: save.perk || "none",
      upgrades: save.upgrades,
    });
    renderer.recycleAll();
    renderer.setTheme(save.theme, save.skin, save.trail, save.colorblind, reduced);
    screen = "run";
    watching = false;
    replaySpeed = 1;
    acc = 0;
    last = performance.now();
    lastTick = 0;
    ghostRun = null;
    ghostIdx = 0;
    ghostLog = [];
    if (save.ghost !== false) {
      const gk = save.mode + ":" + save.difficulty + ":" + (save.mode === MODES.DAILY ? "garden" : save.mapId);
      const rec = save.ghosts && save.ghosts[gk];
      if (rec && rec.inputs) {
        ghostRun = createGame({
          mode: rec.mode,
          difficulty: rec.difficulty,
          mapId: rec.mapId,
          seed: rec.seed,
          wrapOn: rec.wrapOn,
          perk: rec.perk,
        });
        ghostLog = rec.inputs.slice();
      }
    }
    SC.textContent = "0";
    hud();
    hideOverlay(UI);
    PAUSE_ICON.innerHTML = ICON_PAUSE;
    disarmIdlePad();
    startLoop();
    audio.ensure();
    audio.setEnabled(save.sound && !save.muted);
    audio.setMusic(save.musicVol);
    audio.setSfx(save.sfxVol);
    audio.start();
    audio.startMusic();
    try {
      canvas.focus({ preventScroll: true });
    } catch (_) {}
    announce("Game started");
    requestWakeLock().then((w) => {
      wake = w;
    });
    renderer.resize();
  }

  function pause() {
    if (screen !== "run") return;
    screen = "pause";
    overlayState(UI, {
      mode: "pause",
      title: "Paused",
      detail: "Tap resume or press Space / Esc",
      cta: "Resume",
      showOpts: true,
      showRestart: true,
      score: game ? game.score : 0,
    });
    OPTS.innerHTML = "";
    const setBtn = document.createElement("button");
    setBtn.className = "chip";
    setBtn.type = "button";
    setBtn.textContent = "Settings";
    setBtn.addEventListener("click", openSettings);
    OPTS.appendChild(setBtn);
    PAUSE_ICON.innerHTML = ICON_PLAY;
    audio.stopMusic();
    stopLoop();
    paintOnce();
    armIdlePad();
  }

  function resume() {
    if (screen !== "pause") return;
    screen = "run";
    hideOverlay(UI);
    PAUSE_ICON.innerHTML = ICON_PAUSE;
    disarmIdlePad();
    startLoop();
    last = performance.now();
    audio.startMusic();
    try {
      canvas.focus({ preventScroll: true });
    } catch (_) {}
  }

  function restartFromPause() {
    if (screen !== "pause") return;
    showIdle();
    announce("Game restarted. Choose wrap or sound, then play");
  }

  function endRun(kind, fromWatch) {
    if (!game) return;
    const rec = fromWatch ? { gained: 0, cosmetics: [], ach: [], best: false } : recordRun(save, game);
    persist();
    HI.textContent = String(save.best);
    lastReplay = makeReplay(game);
    if (!save.ghosts) save.ghosts = {};
    const gk = game.mode + ":" + game.difficulty + ":" + game.mapId;
    const prev = save.ghosts[gk];
    if (!prev || game.score > (prev.score || 0)) save.ghosts[gk] = lastReplay;
    persist();
    const bits = [
      rec.best && game.score === save.best ? "New best" : "Best " + save.best,
      "Len " + game.snake.length,
    ];
    if (game.maxCombo > 1) bits.push("Combo x" + game.maxCombo);
    overlayState(UI, {
      mode: kind === "win" ? "win" : "over",
      title: kind === "win" ? "Board cleared" : "Game Over",
      detail: bits.join(" · "),
      cta: "Again",
      showOpts: false,
      showRestart: false,
      score: game.score,
    });
    screen = kind === "win" ? "win" : "over";
    announce((kind === "win" ? "Board cleared. " : "Game over. ") + "Score " + game.score);
    PAUSE.hidden = true;
    audio.stopMusic();
    stopLoop();
    paintOnce();
    armIdlePad();
    const share = document.createElement("button");
    share.className = "chip";
    share.type = "button";
    share.textContent = "Share";
    share.id = "shareBtn";
    share.addEventListener("click", () => shareCard(canvas, game.score, save.mode));
    el("opts").style.display = "flex";
    el("opts").innerHTML = "";
    el("opts").appendChild(share);
    if (lastReplay) {
      const watch = document.createElement("button");
      watch.className = "chip";
      watch.type = "button";
      watch.textContent = "Watch replay";
      watch.addEventListener("click", () => watchReplay(lastReplay, 1));
      el("opts").appendChild(watch);
      const x2 = document.createElement("button");
      x2.className = "chip";
      x2.type = "button";
      x2.textContent = "Replay 2x";
      x2.addEventListener("click", () => watchReplay(lastReplay, 2));
      el("opts").appendChild(x2);
      const skip = document.createElement("button");
      skip.className = "chip";
      skip.type = "button";
      skip.textContent = "Skip to end";
      skip.addEventListener("click", () => watchReplay(lastReplay, 0));
      el("opts").appendChild(skip);
    }
  }

  function handleEvents() {
    if (!game) return;
    renderer.handleEvents(game);
    for (const e of game.events) {
      if (e.type === "eat") {
        SC.textContent = String(game.score);
        popScore();
        const gold = e.gold;
        const combo = e.combo;
        deferIdle(() => {
          hud();
          audio.eat(gold, combo);
          tickMissions(save, game);
        });
        setTimeout(() => haptic(gold ? 18 : 10), 0);
      } else if (e.type === "die") {
        audio.die();
        haptic([16, 40, 26]);
        const w = watching;
        watching = false;
        endRun("over", w);
      } else if (e.type === "win") {
        audio.win();
        const w = watching;
        watching = false;
        endRun("win", w);
      } else if (e.type === "power") {
        audio.power(e.power);
        haptic(12);
        hud();
      } else if (e.type === "portal") {
        audio.portal();
      } else if (e.type === "poison") {
        audio.poison();
        SC.textContent = String(game.score);
        hud();
      } else if (e.type === "level") {
        hud();
        audio.level();
        announce("Level " + e.level);
        if (e.draft && e.draft.length) {
          if (watching) applyDraft(game, e.draft[0]);
          else offerDraft(e.draft);
        }
      }
    }
    const fx = renderer.getFlash();
    FL.style.background = fx.flashCol;
    FL.style.opacity = fx.flash > 0 ? String(fx.flash * 0.42) : "0";
  }

  function onDir(dir) {
    if (isPanelOpen()) return;
    if (screen === "idle" || screen === "over" || screen === "win") {
      play();
      enqueueDir(game, dir, performance.now());
      recordInput(game, dir.name, game.tickCount);
      return;
    }
    if (screen === "pause") resume();
    if (screen === "run" && game) {
      if (enqueueDir(game, dir, performance.now())) recordInput(game, dir.name, game.tickCount);
    }
  }

  function onPauseToggle() {
    if (isPanelOpen()) {
      hidePanel();
      return;
    }
    if (screen === "run") pause();
    else if (screen === "pause") resume();
  }

  function onRestart() {
    if (isPanelOpen()) return;
    if (screen !== "idle") play();
  }

  function onPrimary() {
    if (isPanelOpen()) return;
    if (screen === "run") pause();
    else if (screen === "pause") resume();
    else play();
  }

  const input = createInput({
    onDir,
    onPause: onPauseToggle,
    onRestart,
    onPrimary,
    keys: () => save.keys,
    getSwipePx: () => save.swipePx,
    padEl: el("pad"),
  });

  const MAX_STEPS = 3;
  function loop(now) {
    rafId = requestAnimationFrame(loop);
    let dt = now - last;
    last = now;
    if (dt < 0) dt = 0;
    if (dt > 100) dt = 100;
    dtEma += (dt - dtEma) * 0.15;
    input.pollGamepad();
    if (screen === "idle") {
      renderer.drawMenu(now);
      return;
    }
    if (screen !== "run") {
      if (game) renderer.draw(game, now, 1, watching ? null : ghostRun);
      return;
    }
    if (screen === "run" && game && game.alive && !game.paused) {
      acc += dt * (watching ? replaySpeed : 1);
      if (!watching) timeTick(game, dt);
      const tick = getTickMs(game);
      if (lastTick && lastTick !== tick) acc = (acc / lastTick) * tick;
      lastTick = tick;
      let steps = 0;
      const cap = watching ? Math.min(8, MAX_STEPS * replaySpeed) : MAX_STEPS;
      while (acc >= tick && game.alive && screen === "run" && !game.paused && steps < cap) {
        if (watching) {
          while (replayIdx < replayLog.length && replayLog[replayIdx].t === game.tickCount) {
            const d = DIRMAP[replayLog[replayIdx].d];
            if (d) enqueueDir(game, d, 0);
            replayIdx++;
          }
        }
        step(game, now);
        acc -= tick;
        steps++;
        handleEvents();
        if (!watching && ghostRun && ghostRun.alive) {
          while (ghostIdx < ghostLog.length && ghostLog[ghostIdx].t === ghostRun.tickCount) {
            const d = DIRMAP[ghostLog[ghostIdx].d];
            if (d) enqueueDir(ghostRun, d, 0);
            ghostIdx++;
          }
          step(ghostRun, 0);
        }
        if (!game.alive) break;
      }
      if (steps >= cap) acc = Math.min(acc, tick);
      if (!watching) {
        const speed = BASE_TICK / getTickMs(game);
        audio.tickMusic(dt, speed, game.combo);
      }
    } else if (screen !== "pause") {
      acc = 0;
      lastTick = 0;
    }

    renderer.updateFx(dtEma);
    if (game) {
      const tick = getTickMs(game) || 1;
      const alpha = screen === "run" && game.alive ? Math.min(1, Math.max(0, acc / tick)) : 1;
      renderer.draw(game, now, alpha, watching ? null : ghostRun);
      const fx = renderer.getFlash();
      FL.style.background = fx.flashCol;
      FL.style.opacity = fx.flash > 0 ? String(fx.flash * 0.42) : "0";
    }
  }

  function onVisibility() {
    if (document.hidden && screen === "run") pause();
  }
  function onBlur() {
    if (screen === "run") pause();
  }

  function later(fn, ms) {
    return window.setTimeout(fn, ms);
  }

  let lifeAc = null;
  function bindLifecycle() {
    if (lifeAc) lifeAc.abort();
    lifeAc = new AbortController();
    const ac = lifeAc;
    const sig = { signal: ac.signal };
    input.bind(ac);
    BTN.addEventListener("click", onPrimary, sig);
    RESTART.addEventListener("click", restartFromPause, sig);
    PAUSE.addEventListener(
      "click",
      () => {
        screen === "run" ? pause() : resume();
      },
      sig,
    );
    document.addEventListener("visibilitychange", onVisibility, sig);
    window.addEventListener("blur", onBlur, sig);
    window.addEventListener("resize", () => renderer.resize(), sig);
    window.addEventListener("orientationchange", () => later(() => renderer.resize(), 90), sig);
    if (window.visualViewport) visualViewport.addEventListener("resize", () => renderer.resize(), sig);
    if (window.ResizeObserver) {
      try {
        new ResizeObserver(() => renderer.resize()).observe(canvas.parentElement || canvas);
      } catch (_) {}
    }
    const onReduce = (e) => {
      if (save.reducedMotion == null) {
        reduced = e.matches;
        renderer.setTheme(save.theme, save.skin, save.trail, save.colorblind, reduced);
      }
    };
    if (reducedMq.addEventListener) reducedMq.addEventListener("change", onReduce, sig);
    else if (reducedMq.addListener) reducedMq.addListener(onReduce);
    if (navigator.maxTouchPoints > 0) document.body.classList.add("touch");

    window.addEventListener(
      "pagehide",
      (ev) => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        audio.stopMusic();
        try {
          if (wake) wake.release();
        } catch (_) {}
        if (!ev.persisted) {
          ac.abort();
          renderer.recycleAll();
          audio.close();
        }
      },
      sig,
    );
    window.addEventListener(
      "pageshow",
      (ev) => {
        if (!ev.persisted) return;
        save = loadSave(window.localStorage);
        audio.restore();
        bindLifecycle();
        renderer.resize();
        showIdle();
      },
      sig,
    );
  }

  window.addEventListener("error", (e) => {
    announce("Error");
    console.error(e.error || e.message);
  });
  window.addEventListener("unhandledrejection", (e) => {
    announce("Error");
    console.error(e.reason);
  });

  bindLifecycle();
  renderer.resize();
  HI.textContent = String(save.best);
  showIdle();
  const splash = el("splash");
  splash.classList.add("hide");
  splash.setAttribute("aria-hidden", "true");
  const swGo = () => {
    registerSW((reg) => {
      const toast = el("toast");
      const go = el("toastGo");
      if (!toast || !go) return;
      toast.classList.add("show");
      go.onclick = () => {
        applyWaiting(reg);
        location.reload();
      };
    });
  };
  swGo();
  if (!save.seenTutorial) {
    fillPanel(tutorialHtml());
    bindPanelClose();
  }
  function armIdlePad() {
    if (gpIdle) return;
    gpIdle = setInterval(() => input.pollGamepad(), 250);
  }
  function disarmIdlePad() {
    if (gpIdle) clearInterval(gpIdle);
    gpIdle = 0;
  }
  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }
  function startLoop() {
    if (rafId) return;
    last = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function watchReplay(rep, speed) {
    if (!rep) return;
    hidePanel();
    hideOverlay(UI);
    watching = true;
    replaySpeed = speed > 0 ? speed : 64;
    replayLog = (rep.inputs || []).slice();
    replayIdx = 0;
    ghostRun = null;
    game = createGame({
      mode: rep.mode,
      difficulty: rep.difficulty,
      mapId: rep.mapId,
      seed: rep.seed,
      wrapOn: rep.wrapOn,
      perk: rep.perk,
      upgrades: rep.upgrades,
    });
    screen = "run";
    acc = 0;
    lastTick = 0;
    last = performance.now();
    disarmIdlePad();
    startLoop();
    announce(speed === 0 ? "Skipping replay" : "Watching replay " + (speed || 1) + "x");
  }

  function paintOnce() {
    renderer.resize();
    if (game) renderer.draw(game, performance.now(), 1);
  }

  window.__VIPER__ = {
    play,
    pause,
    resume,
    getGame: () => game,
    getSave: () => save,
    verifyReplay,
    lastReplay: () => lastReplay,
    headCell,
    tailCell,
    chainMaxGap,
    musicPlaying: () => audio.isPlaying(),
    getAlpha: () => {
      if (!game) return 1;
      const tick = getTickMs(game) || 1;
      return screen === "run" && game.alive ? Math.min(1, Math.max(0, acc / tick)) : 1;
    },
  };
}

if (document.readyState === "complete") setTimeout(boot, 0);
else window.addEventListener("load", () => setTimeout(boot, 0));
