/** @typedef {{ id: string, name: string, cols: number, rows: number, wrapDefault: boolean, obstacles: (c:number,r:number)=>{x:number,y:number}[], portals: (c:number,r:number)=>{ax:number,ay:number,bx:number,by:number}[], walls: (c:number,r:number)=>object[] }} MapDef */
import { mulberry32 } from "./rng.js";

const CUSTOM = [];

function rect(x0, y0, x1, y1) {
  const out = [];
  for (let x = x0; x <= x1; x++) {
    out.push({ x, y: y0 }, { x, y: y1 });
  }
  for (let y = y0 + 1; y < y1; y++) {
    out.push({ x: x0, y }, { x: x1, y });
  }
  return out;
}

function plus(cx, cy, arm) {
  const out = [{ x: cx, y: cy }];
  for (let i = 1; i <= arm; i++) {
    out.push(
      { x: cx + i, y: cy },
      { x: cx - i, y: cy },
      { x: cx, y: cy + i },
      { x: cx, y: cy - i },
    );
  }
  return out;
}

export const MAPS = [
  {
    id: "arena",
    name: "Arena",
    cols: 21,
    rows: 21,
    wrapDefault: false,
    obstacles: () => [],
    portals: () => [],
    walls: () => [],
  },
  {
    id: "garden",
    name: "Garden",
    cols: 25,
    rows: 25,
    wrapDefault: false,
    obstacles: (c, r) => {
      const cx = (c / 2) | 0;
      const cy = (r / 2) | 0;
      return [
        { x: 4, y: 4 },
        { x: c - 5, y: 4 },
        { x: 4, y: r - 5 },
        { x: c - 5, y: r - 5 },
        { x: cx, y: 3 },
        { x: cx, y: r - 4 },
        { x: 3, y: cy },
        { x: c - 4, y: cy },
      ];
    },
    portals: (c, r) => [{ ax: 2, ay: 2, bx: c - 3, by: r - 3 }],
    walls: () => [],
  },
  {
    id: "fortress",
    name: "Fortress",
    cols: 19,
    rows: 19,
    wrapDefault: false,
    obstacles: (c, r) => {
      const box = rect(5, 5, c - 6, r - 6).filter(
        (p) =>
          !((p.x === 5 || p.x === c - 6) && p.y === ((r / 2) | 0)) &&
          !((p.y === 5 || p.y === r - 6) && p.x === ((c / 2) | 0)),
      );
      return box;
    },
    portals: (c, r) => [
      { ax: 1, ay: 1, bx: c - 2, by: r - 2 },
      { ax: c - 2, ay: 1, bx: 1, by: r - 2 },
    ],
    walls: () => [],
  },
  {
    id: "rivers",
    name: "Rivers",
    cols: 23,
    rows: 17,
    wrapDefault: true,
    obstacles: (c, r) => {
      const out = [];
      for (let x = 2; x < c - 2; x++) {
        if (x % 5 === 0) continue;
        out.push({ x, y: 4 }, { x, y: r - 5 });
      }
      return out;
    },
    portals: (c, r) => [{ ax: 0, ay: (r / 2) | 0, bx: c - 1, by: (r / 2) | 0 }],
    walls: (c, r) => [
      {
        x: 6,
        y: (r / 2) | 0,
        dx: 1,
        dy: 0,
        min: 3,
        max: c - 4,
        axis: "x",
        len: 3,
      },
    ],
  },
  {
    id: "voidgate",
    name: "Voidgate",
    cols: 17,
    rows: 17,
    wrapDefault: false,
    obstacles: (c, r) => {
      const cx = (c / 2) | 0;
      const cy = (r / 2) | 0;
      return plus(cx, cy, 2).filter((p) => !(p.x === cx && p.y === cy));
    },
    portals: (c, r) => [
      { ax: 1, ay: (r / 2) | 0, bx: c - 2, by: (r / 2) | 0 },
      { ax: (c / 2) | 0, ay: 1, bx: (c / 2) | 0, by: r - 2 },
    ],
    walls: (c, r) => [
      { x: 3, y: 3, dx: 0, dy: 1, min: 2, max: r - 3, axis: "y", len: 2 },
      {
        x: c - 4,
        y: r - 4,
        dx: 0,
        dy: -1,
        min: 2,
        max: r - 3,
        axis: "y",
        len: 2,
      },
    ],
  },
  {
    id: "colossus",
    name: "Colossus",
    cols: 29,
    rows: 29,
    wrapDefault: false,
    obstacles: (c, r) => {
      const out = [];
      for (let i = 6; i < c - 6; i += 4) {
        out.push({ x: i, y: 6 }, { x: i, y: r - 7 });
      }
      for (let j = 8; j < r - 8; j += 4) {
        out.push({ x: 6, y: j }, { x: c - 7, y: j });
      }
      return out;
    },
    portals: (c, r) => [
      { ax: 2, ay: 2, bx: c - 3, by: r - 3 },
      { ax: c - 3, ay: 2, bx: 2, by: r - 3 },
    ],
    walls: (c, r) => [
      {
        x: (c / 2) | 0,
        y: 8,
        dx: 1,
        dy: 0,
        min: 8,
        max: c - 9,
        axis: "x",
        len: 4,
      },
    ],
  },
];

export function getMap(id) {
  return (
    CUSTOM.find((m) => m.id === id) || MAPS.find((m) => m.id === id) || MAPS[0]
  );
}

export function applyCustomMaps(list) {
  CUSTOM.length = 0;
  if (!list) return;
  for (const m of list) {
    if (!m || !m.id) continue;
    CUSTOM.push(hydrateMap(m));
  }
}

export function hydrateMap(raw) {
  const cols = raw.cols | 0 || 21;
  const rows = raw.rows | 0 || 21;
  const obstacles = (raw.obstacles || []).map((p) => ({ x: p.x, y: p.y }));
  const portals = (raw.portals || []).map((p) => ({
    ax: p.ax,
    ay: p.ay,
    bx: p.bx,
    by: p.by,
  }));
  const walls = (raw.walls || []).map((w) => ({ ...w }));
  return {
    id: raw.id,
    name: raw.name || raw.id,
    cols,
    rows,
    wrapDefault: !!raw.wrapDefault,
    obstacles: () => obstacles.map((p) => ({ ...p })),
    portals: () => portals.map((p) => ({ ...p })),
    walls: () => walls.map((w) => ({ ...w })),
  };
}

export function allMaps() {
  return MAPS.concat(CUSTOM);
}

export function generateProcMap(seed) {
  const rng = mulberry32(seed);
  const size = 17 + ((rng() * 3) | 0) * 2;
  const obstacles = [];
  const n = 6 + ((rng() * 8) | 0);
  for (let i = 0; i < n; i++) {
    const x = 2 + ((rng() * (size - 4)) | 0);
    const y = 2 + ((rng() * (size - 4)) | 0);
    if (
      Math.abs(x - ((size / 2) | 0)) < 2 &&
      Math.abs(y - ((size / 2) | 0)) < 2
    )
      continue;
    obstacles.push({ x, y });
  }
  const portals = [];
  if (rng() > 0.4) {
    portals.push({
      ax: 1,
      ay: 1 + ((rng() * (size - 2)) | 0),
      bx: size - 2,
      by: 1 + ((rng() * (size - 2)) | 0),
    });
  }
  const walls = [];
  if (rng() > 0.55) {
    walls.push({
      x: 3,
      y: (size / 2) | 0,
      dx: 1,
      dy: 0,
      min: 2,
      max: size - 3,
      axis: "x",
      len: 2,
    });
  }
  const id = "proc-" + (seed >>> 0).toString(16);
  return {
    id,
    name: "Seed " + (seed >>> 0).toString(16).slice(-4),
    cols: size,
    rows: size,
    wrapDefault: rng() > 0.5,
    obstacles,
    portals,
    walls,
  };
}

export function buildOccupancy(map) {
  const obstacles = map.obstacles(map.cols, map.rows).map((p) => ({ ...p }));
  const portals = map.portals(map.cols, map.rows).map((p) => ({ ...p }));
  const walls = map.walls(map.cols, map.rows).map((w) => ({ ...w, t: 0 }));
  return { obstacles, portals, walls };
}

export function cellKey(x, y) {
  return x + "," + y;
}
