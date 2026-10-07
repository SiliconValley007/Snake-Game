import { MODE_LIST, DIFF_LIST, SKINS, TRAILS, THEMES, ACHIEVEMENTS, MODES, PERKS, META_UPGRADES } from "../core/constants.js";
import { dailyMissions } from "../meta/meta.js";
import { getMap, allMaps } from "../core/maps.js";

const MODE_LABEL = {
  classic: "Classic",
  time: "Time Attack",
  endless: "Endless",
  daily: "Daily",
  zen: "Zen",
};
const DIFF_LABEL = { easy: "Easy", normal: "Normal", hard: "Hard", viper: "Viper" };

export function el(id) {
  return document.getElementById(id);
}

export function setChip(node, on) {
  node.setAttribute("aria-pressed", on ? "true" : "false");
}

export function announce(text) {
  const live = el("live");
  if (live) live.textContent = text;
}

export function buildMenu(root, save, handlers) {
  root.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "menu";
  wrap.innerHTML =
    '<div class="row" id="modeRow"></div>' +
    '<div class="row" id="diffRow"></div>' +
    '<div class="row" id="mapRow"></div>' +
    '<div class="row" id="perkRow"></div>' +
    '<div class="row" id="optRow"></div>' +
     '<div class="row extra" id="navRow"></div>' +
     '<div class="msHud" id="msHud"></div>';
  root.appendChild(wrap);

  function chips(row, items, cur, onPick, lab) {
    row.innerHTML = "";
    for (const it of items) {
      const b = document.createElement("button");
      b.className = "chip";
      b.type = "button";
      b.textContent = lab(it);
      b.dataset.id = typeof it === "string" ? it : it.id;
      setChip(b, (typeof it === "string" ? it : it.id) === cur);
      b.addEventListener("click", () => onPick(typeof it === "string" ? it : it.id));
      row.appendChild(b);
    }
  }

  const modeRow = wrap.querySelector("#modeRow");
  const diffRow = wrap.querySelector("#diffRow");
  const mapRow = wrap.querySelector("#mapRow");
  const perkRow = wrap.querySelector("#perkRow");
  const optRow = wrap.querySelector("#optRow");
  const navRow = wrap.querySelector("#navRow");

  chips(modeRow, MODE_LIST, save.mode, handlers.onMode, (m) => MODE_LABEL[m]);
  chips(diffRow, DIFF_LIST, save.difficulty, handlers.onDiff, (d) => DIFF_LABEL[d]);
  chips(mapRow, allMaps(), save.mapId, handlers.onMap, (m) => m.name);
  if (handlers.onPerk) chips(perkRow, PERKS, save.perk || "none", handlers.onPerk, (p) => p.name);
  paintMissions(wrap.querySelector("#msHud"), save);

  const wrapBtn = document.createElement("button");
  wrapBtn.className = "chip";
  wrapBtn.type = "button";
  wrapBtn.id = "wrapBtn";
  wrapBtn.textContent = "Wrap";
  setChip(wrapBtn, save.wrap);
  wrapBtn.addEventListener("click", handlers.onWrap);
  const sndBtn = document.createElement("button");
  sndBtn.className = "chip";
  sndBtn.type = "button";
  sndBtn.id = "sndBtn";
  sndBtn.textContent = "Sound";
  setChip(sndBtn, save.sound && !save.muted);
  sndBtn.addEventListener("click", handlers.onSound);
  optRow.append(wrapBtn, sndBtn);

  function nav(id, label, fn) {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.id = id;
    b.textContent = label;
    b.addEventListener("click", fn);
    navRow.appendChild(b);
  }
  nav("settingsBtn", "Settings", handlers.onSettings);
  nav("garageBtn", "Garage", handlers.onGarage);
  nav("boardBtn", "Scores", handlers.onBoard);
  nav("achBtn", "Medals", handlers.onAch);
  nav("helpBtn", "Help", handlers.onHelp);
  nav("treeBtn", "Tree", handlers.onTree);
  nav("mapEdBtn", "Maps", handlers.onMaps);
  return { wrapBtn, sndBtn, modeRow, diffRow, mapRow };
}

export function paintMissions(node, save) {
  if (!node) return;
  const list = dailyMissions();
  const bits = list.map((m) => {
    const c = (save.missions && save.missions[m.id]) || { progress: 0, done: false, claimed: false };
    return m.desc.split(" ")[0] + " " + Math.min(c.progress, m.target) + "/" + m.target + (c.done ? (c.claimed ? " ok" : " !") : "");
  });
  node.textContent = "Streak " + (save.streak || 0) + " · " + bits.join(" · ");
}

export function overlayState(ui, { mode, title, detail, cta, showOpts, showRestart, score }) {
  const TAG = el("tag");
  const MSG = el("msg");
  const DET = el("detail");
  const BTN = el("btn");
  const RESTART = el("restartBtn");
  const OPTS = el("opts");
  const PAUSE = el("pause");
  TAG.style.display = mode === "idle" ? "none" : "block";
  TAG.className = mode === "win" ? "win" : "";
  TAG.textContent = title;
  MSG.style.display = mode === "idle" ? "none" : "block";
  MSG.textContent = mode === "idle" ? "Ready" : String(score ?? 0);
  DET.textContent = detail;
  BTN.textContent = cta;
  OPTS.style.display = showOpts ? "flex" : "none";
  RESTART.hidden = !showRestart;
  ui.classList.remove("hide");
  document.body.classList.toggle("run", false);
  PAUSE.hidden = mode === "idle" || mode === "over" || mode === "win";
  if (mode === "pause") {
    PAUSE.hidden = false;
    PAUSE.setAttribute("aria-label", "Resume game");
  }
  BTN.focus();
}

export function hideOverlay(ui) {
  ui.classList.add("hide");
  el("restartBtn").hidden = true;
  el("pause").hidden = false;
  el("pause").setAttribute("aria-label", "Pause game");
  document.body.classList.add("run");
}

export function fillPanel(html) {
  const p = el("panel");
  p.innerHTML = html;
  p.hidden = false;
  p.scrollTop = 0;
}

export function hidePanel() {
  const p = el("panel");
  p.hidden = true;
  p.innerHTML = "";
}

export function isPanelOpen() {
  const p = el("panel");
  return !!(p && !p.hidden);
}

function panelShell(title, body, foot) {
  return (
    '<div class="panelInner">' +
    '<div class="panelHead"><h2>' +
    title +
    '</h2><button class="chip" type="button" id="panelClose">Close</button></div>' +
    '<div class="panelBody">' +
    body +
    "</div>" +
    (foot ? '<div class="panelFoot">' + foot + "</div>" : "") +
    "</div>"
  );
}

export function settingsHtml(save) {
  return panelShell(
    "Settings",
    '<label>Music <input id="musicSl" type="range" min="0" max="1" step="0.01" value="' +
      save.musicVol +
      '"></label>' +
      '<label>SFX <input id="sfxSl" type="range" min="0" max="1" step="0.01" value="' +
      save.sfxVol +
      '"></label>' +
      '<label>Haptics <input id="hapCk" type="checkbox" ' +
      (save.haptics ? "checked" : "") +
      "></label>" +
      '<label>Reduced motion <input id="rmCk" type="checkbox" ' +
      (save.reducedMotion ? "checked" : "") +
      "></label>" +
      '<label>Swipe sensitivity <input id="swSl" type="range" min="12" max="80" step="1" value="' +
      save.swipePx +
      '"></label>' +
      '<label>Colorblind <select id="cbSel">' +
      ["none", "deuteranopia", "protanopia", "tritanopia"]
        .map((c) => '<option value="' + c + '"' + (save.colorblind === c ? " selected" : "") + ">" + c + "</option>")
        .join("") +
      "</select></label>" +
      '<label>Quality <select id="qualSel">' +
      ["auto", "high", "med", "low"]
        .map((c) => '<option value="' + c + '"' + ((save.quality || "auto") === c ? " selected" : "") + ">" + c + "</option>")
        .join("") +
      "</select></label>" +
      '<label>Left-handed pad <input id="leftPadCk" type="checkbox" ' +
      (save.leftPad ? "checked" : "") +
      "></label>" +
      '<label>Best-run ghost <input id="ghostCk" type="checkbox" ' +
      (save.ghost !== false ? "checked" : "") +
      "></label>",
    '<button class="chip" type="button" id="fsBtn">Fullscreen</button>' +
      '<button class="chip" type="button" id="exportBtn">Export save</button>' +
      '<button class="chip" type="button" id="importBtn">Import save</button>' +
      '<input id="importFile" type="file" accept="application/json" hidden>',
  );
}

export function garageHtml(save) {
  const skin = SKINS.map(
    (s) =>
      '<button class="chip" type="button" data-kind="skin" data-id="' +
      s.id +
      '" ' +
      (save.unlocked.skins.includes(s.id) ? "" : "disabled") +
      ' aria-pressed="' +
      (save.skin === s.id) +
      '">' +
      s.name +
      "</button>",
  ).join("");
  const trail = TRAILS.map(
    (s) =>
      '<button class="chip" type="button" data-kind="trail" data-id="' +
      s.id +
      '" ' +
      (save.unlocked.trails.includes(s.id) ? "" : "disabled") +
      ' aria-pressed="' +
      (save.trail === s.id) +
      '">' +
      s.name +
      "</button>",
  ).join("");
  const theme = THEMES.map(
    (s) =>
      '<button class="chip" type="button" data-kind="theme" data-id="' +
      s.id +
      '" ' +
      (save.unlocked.themes.includes(s.id) ? "" : "disabled") +
      ' aria-pressed="' +
      (save.theme === s.id) +
      '">' +
      s.name +
      "</button>",
  ).join("");
  return panelShell(
    "Garage",
    "<p>Lv " +
      save.level +
      " · XP " +
      save.xp +
      "</p><div class='row'>" +
      skin +
      "</div><div class='row'>" +
      trail +
      "</div><div class='row'>" +
      theme +
      "</div>",
  );
}

export function boardHtml(save, mode, diff) {
  const k = mode + ":" + diff;
  const list = (save.boards[k] || []).map((e, i) => "<li>" + (i + 1) + ". " + e.score + " · len " + e.len + "</li>").join("") || "<li>Empty</li>";
  const daily = Object.keys(save.daily || {})
    .sort()
    .reverse()
    .slice(0, 10)
    .map((d) => "<li>" + d + " — " + save.daily[d].score + "</li>")
    .join("") || "<li>Empty</li>";
  return panelShell(
    "Scores",
    "<p>" + mode + " / " + diff + "</p><ol>" + list + "</ol><h3>Daily</h3><ol>" + daily + "</ol>",
  );
}

export function achHtml(save) {
  const items = ACHIEVEMENTS.map(
    (a) =>
      "<li>" +
      (save.achievements[a.id] ? "[x] " : "[ ] ") +
      a.name +
      " — " +
      a.desc +
      "</li>",
  ).join("");
  const miss = dailyMissions()
    .map((m) => {
      const c = (save.missions && save.missions[m.id]) || { progress: 0, done: false, claimed: false };
      const btn = c.done && !c.claimed
        ? ' <button class="chip" type="button" data-claim="' + m.id + '">Claim</button>'
        : c.claimed ? " claimed" : "";
      return "<li>" + m.desc + " (" + Math.min(c.progress, m.target) + "/" + m.target + ")" + btn + "</li>";
    })
    .join("");
  return panelShell(
    "Medals",
    "<p>Daily streak " + (save.streak || 0) + "</p><ul>" + items + "</ul><h3>Missions</h3><ul>" + miss + "</ul>",
  );
}

export function treeHtml(save) {
  const u = save.upgrades || {};
  const rows = META_UPGRADES.map((t) => {
    const lv = u[t.id] | 0;
    const maxed = lv >= t.max;
    const cost = t.cost * (lv + 1);
    return (
      '<button class="chip" type="button" data-up="' +
      t.id +
      '" ' +
      (maxed || save.xp < cost ? "disabled" : "") +
      ">" +
      t.name +
      " " +
      lv +
      "/" +
      t.max +
      (maxed ? "" : " · " + cost + " XP") +
      "</button>"
    );
  }).join("");
  return panelShell("Upgrade tree", "<p>XP " + save.xp + "</p><div class='row'>" + rows + "</div>");
}

export function mapsHtml(save) {
  const custom = (save.customMaps || [])
    .map((m) => '<li>' + m.name + " (" + m.cols + "x" + m.rows + ")</li>")
    .join("") || "<li>None</li>";
  return panelShell(
    "Maps",
    "<p>Seeded procedural maps and a local editor.</p>" +
      '<label>Seed <input id="procSeed" type="text" value="" placeholder="optional"></label>' +
      '<div class="row"><button class="chip" type="button" id="procBtn">Generate</button></div>' +
      "<h3>Saved</h3><ul>" + custom + "</ul>" +
      '<canvas id="edCanvas" width="240" height="240"></canvas>' +
      '<div class="row"><button class="chip" type="button" id="edSave">Save map</button>' +
      '<button class="chip" type="button" id="edExport">Export</button>' +
      '<button class="chip" type="button" id="edImport">Import</button></div>' +
      '<input id="edFile" type="file" accept="application/json" hidden>',
  );
}

export function helpHtml() {
  return panelShell(
    "How to play",
    "<p>Eat food. Don't crash. Combos stack if you eat fast.</p>" +
      "<p>Powers: S slow-mo, G ghost, M magnet, 2 double score, - shrink.</p>" +
      "<p>Hazards: walls, moving bars, portals, poison food.</p>" +
      "<p>Arrows/WASD, swipe, D-pad, gamepad. Space pause. R restart.</p>",
  );
}

export function tutorialHtml() {
  return panelShell(
    "Welcome to VIPER",
    "<p>Swipe or use the pad. Eat the glow. Avoid your tail.</p>" +
      "<p>Toggle Wrap and Sound, pick a mode, then Play.</p>",
    '<button class="cta" type="button" id="tutGo">Got it</button>',
  );
}

export function mapName(id) {
  return getMap(id).name;
}

export { MODE_LABEL, DIFF_LABEL, MODES };
