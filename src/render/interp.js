const _h = { x: 0, y: 0, split: false };
const _t = { x: 0, y: 0, split: false };
const _tmp = { x: 0, y: 0, split: false };

function minImage(from, to, size) {
  let d = to - from;
  if (!size) return to;
  d -= size * Math.round(d / size);
  return from + d;
}

export function unwrapCell(state, i, a, out) {
  const p = state.snake[i];
  const q = state.prev[i] || p;
  let px = p.x;
  let py = p.y;
  const dx = px - q.x;
  const dy = py - q.y;
  if (state.wrapOn) {
    if (dx > state.cols / 2) px -= state.cols;
    else if (dx < -state.cols / 2) px += state.cols;
    if (dy > state.rows / 2) py -= state.rows;
    else if (dy < -state.rows / 2) py += state.rows;
  }
  const ux = px - q.x;
  const uy = py - q.y;
  if (Math.abs(ux) > 1.5 || Math.abs(uy) > 1.5) {
    if (a < 0.5) {
      out.x = q.x;
      out.y = q.y;
    } else {
      out.x = p.x;
      out.y = p.y;
    }
    out.split = true;
    return out;
  }
  out.x = q.x + ux * a;
  out.y = q.y + uy * a;
  out.split = false;
  return out;
}

export function buildChain(state, a, outX, outY, outSplit) {
  const n = state.snake.length;
  const cols = state.cols;
  const rows = state.rows;
  const wrap = !!state.wrapOn;
  for (let i = 0; i < n; i++) {
    unwrapCell(state, i, a, _tmp);
    if (i === 0) {
      outX[i] = _tmp.x;
      outY[i] = _tmp.y;
      if (outSplit) outSplit[i] = _tmp.split ? 1 : 0;
    } else if (!wrap || _tmp.split) {
      outX[i] = _tmp.x;
      outY[i] = _tmp.y;
      if (outSplit) outSplit[i] = 1;
    } else {
      outX[i] = minImage(outX[i - 1], _tmp.x, cols);
      outY[i] = minImage(outY[i - 1], _tmp.y, rows);
      if (outSplit) outSplit[i] = 0;
    }
  }
  return n;
}

export function chainMaxGap(state, a, outX, outY, outSplit) {
  const n = buildChain(state, a, outX, outY, outSplit);
  let max = 0;
  for (let i = 1; i < n; i++) {
    if (outSplit && outSplit[i]) continue;
    const g = Math.hypot(outX[i] - outX[i - 1], outY[i] - outY[i - 1]);
    if (g > max) max = g;
  }
  return max;
}

export function headCell(state, a) {
  return unwrapCell(state, 0, a, _h);
}

export function tailCell(state, a) {
  return unwrapCell(state, state.snake.length - 1, a, _t);
}

export function catmull(p0, p1, p2, p3, t, out) {
  const t2 = t * t;
  const t3 = t2 * t;
  out.x =
    0.5 *
    (2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  out.y =
    0.5 *
    (2 * p1.y +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  return out;
}
