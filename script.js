// ---------- Puzzle definitions ----------
const PUZZLES = [
  { id: "222", name: "2x2", type: "cube", size: 2 },
  { id: "333", name: "3x3", type: "cube", size: 3 },
  { id: "444", name: "4x4", type: "cube", size: 4 },
  { id: "555", name: "5x5", type: "cube", size: 5 },
  { id: "666", name: "6x6", type: "cube", size: 6 },
  { id: "777", name: "7x7", type: "cube", size: 7 },
  { id: "pyram", name: "Pyraminx", type: "pyraminx" },
  { id: "skewb", name: "Skewb", type: "skewb" },
  { id: "mega", name: "Megaminx", type: "megaminx" },
  { id: "sq1", name: "Square-1", type: "sq1" },
];

const randInt = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[randInt(arr.length)];

// ---------- NxN cube engine ----------
// State: flat array of 6*n*n face letters, faces ordered U,R,F,D,L,B, each n*n
// row-major. Verified in Python against the trusted 3x3 engine (3000 random
// scrambles match exactly) plus move^4=I / scramble*inverse / sexy^6 for n=2..7.
const CUBE_COLORS = {
  U: "#f7f7f7", R: "#d1332b", F: "#12a150",
  D: "#ffd21a", L: "#ff6a00", B: "#1466c4",
};

// For a clockwise turn of `face`, the 4 adjacent strip cells (in content-cycle
// order) at depth d, position c, on an n-cube. Returns [faceLetter, localIndex].
const STRIPS = {
  U: (d, c, n) => [["B", d * n + c], ["R", d * n + c], ["F", d * n + c], ["L", d * n + c]],
  D: (d, c, n) => { const r = n - 1 - d; return [["F", r * n + c], ["R", r * n + c], ["B", r * n + c], ["L", r * n + c]]; },
  R: (d, c, n) => [["U", c * n + (n - 1 - d)], ["B", (n - 1 - c) * n + d], ["D", c * n + (n - 1 - d)], ["F", c * n + (n - 1 - d)]],
  L: (d, c, n) => [["U", c * n + d], ["F", c * n + d], ["D", c * n + d], ["B", (n - 1 - c) * n + (n - 1 - d)]],
  F: (d, c, n) => [["U", (n - 1 - d) * n + c], ["R", c * n + d], ["D", d * n + (n - 1 - c)], ["L", (n - 1 - c) * n + (n - 1 - d)]],
  B: (d, c, n) => [["U", d * n + c], ["L", (n - 1 - c) * n + d], ["D", (n - 1 - d) * n + (n - 1 - c)], ["R", c * n + (n - 1 - d)]],
};

function faceStarts(n) {
  const per = n * n;
  return { U: 0, R: per, F: 2 * per, D: 3 * per, L: 4 * per, B: 5 * per };
}

function solvedCube(n) {
  const per = n * n;
  const order = "URFDLB";
  return Array.from({ length: 6 * per }, (_, i) => order[Math.floor(i / per)]);
}

// Clockwise turn of `width` layers on `face`.
function applyCWLayers(state, face, width, n) {
  const start = faceStarts(n);
  const next = state.slice();
  // Rotate the outer face itself CW.
  const s = start[face];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      next[s + c * n + (n - 1 - r)] = state[s + r * n + c];
    }
  }
  // Cycle the adjacent strips for each affected layer.
  for (let d = 0; d < width; d++) {
    for (let c = 0; c < n; c++) {
      const cells = STRIPS[face](d, c, n);
      for (let i = 0; i < 4; i++) {
        const [ft, it] = cells[(i + 1) % 4];
        const [ff, iff] = cells[i];
        next[start[ft] + it] = state[start[ff] + iff];
      }
    }
  }
  return next;
}

// Parse notation like "R", "R'", "Rw2", "3Rw'".
function parseCubeMove(mv) {
  let i = 0;
  let widthNum = null;
  if (mv[0] >= "0" && mv[0] <= "9") { widthNum = parseInt(mv[0], 10); i = 1; }
  const face = mv[i]; i++;
  let wide = false;
  if (mv[i] === "w") { wide = true; i++; }
  const mod = mv.slice(i);
  const width = wide ? widthNum || 2 : 1;
  const count = mod === "'" ? 3 : mod === "2" ? 2 : 1;
  return { face, width, count };
}

function cubeStateFromMoves(moves, n) {
  let state = solvedCube(n);
  for (const mv of moves) {
    const { face, width, count } = parseCubeMove(mv);
    for (let k = 0; k < count; k++) state = applyCWLayers(state, face, width, n);
  }
  return state;
}

// ---------- Scramble generators ----------
const CUBE_LEN = { 2: 11, 3: 20, 4: 40, 5: 60, 6: 80, 7: 100 };

// 3x3 uses the WCA-standard constrained generator (no same face twice, no move
// on a face when the previous two were on the same axis).
function scramble333() {
  const faces = ["U", "D", "L", "R", "F", "B"];
  const axis = { U: 0, D: 0, L: 1, R: 1, F: 2, B: 2 };
  const mods = ["", "'", "2"];
  const moves = [];
  let prev = null, prevPrev = null;
  while (moves.length < CUBE_LEN[3]) {
    const f = pick(faces);
    if (f === prev) continue;
    if (prev && prevPrev && axis[f] === axis[prev] && axis[f] === axis[prevPrev]) continue;
    moves.push(f + pick(mods));
    prevPrev = prev; prev = f;
  }
  return moves;
}

function notateWide(face, width, mod) {
  if (width === 1) return face + mod;
  if (width === 2) return face + "w" + mod;
  return width + face + "w" + mod;
}

// NxN random-move scramble with wide turns (no same face consecutively).
function scrambleNxN(n) {
  if (n === 3) return scramble333();
  const faces = n === 2 ? ["R", "U", "F"] : ["U", "L", "F", "R", "B", "D"];
  const mods = ["", "'", "2"];
  const maxWidth = Math.max(1, Math.floor(n / 2));
  const moves = [];
  let prev = null;
  while (moves.length < CUBE_LEN[n]) {
    const f = pick(faces);
    if (f === prev) continue;
    prev = f;
    const width = n === 2 ? 1 : 1 + randInt(maxWidth);
    moves.push(notateWide(f, width, pick(mods)));
  }
  return moves;
}

// Pyraminx: up to 11 face turns (U L R B, ± only) then optional tips (u l r b).
function scramblePyraminx() {
  const faces = ["U", "L", "R", "B"];
  const moves = [];
  let prev = null;
  while (moves.length < 10) {
    const f = pick(faces);
    if (f === prev) continue;
    prev = f;
    moves.push(f + pick(["", "'"]));
  }
  for (const tip of ["u", "l", "r", "b"]) {
    const r = randInt(3); // 0 = skip
    if (r === 1) moves.push(tip);
    else if (r === 2) moves.push(tip + "'");
  }
  return moves.join(" ");
}

// Skewb: 11 axis turns (U L R B, ± only), no same face consecutively.
function scrambleSkewb() {
  const faces = ["U", "L", "R", "B"];
  const moves = [];
  let prev = null;
  while (moves.length < 11) {
    const f = pick(faces);
    if (f === prev) continue;
    prev = f;
    moves.push(f + pick(["", "'"]));
  }
  return moves.join(" ");
}

// Megaminx: WCA fixed format — 7 lines of (R±± D±±)x5 then U/U'.
function scrambleMegaminx() {
  const lines = [];
  for (let l = 0; l < 7; l++) {
    const parts = [];
    for (let i = 0; i < 5; i++) {
      parts.push("R" + (randInt(2) ? "++" : "--"));
      parts.push("D" + (randInt(2) ? "++" : "--"));
    }
    parts.push(randInt(2) ? "U" : "U'");
    lines.push(parts.join(" "));
  }
  return lines.join("\n");
}

// Square-1: sequence of (top, bottom) twists separated by slices.
function scrambleSquare1() {
  const twists = [];
  for (let i = 0; i < 11; i++) {
    let a, b;
    do { a = randInt(12) - 5; b = randInt(12) - 5; } while (a === 0 && b === 0);
    twists.push(`(${a},${b})`);
  }
  return twists.join(" / ");
}

// Build a scramble (and preview HTML) for a given puzzle.
function makeScramble(puzzle) {
  let text;
  if (puzzle.type === "cube") {
    text = scrambleNxN(puzzle.size).join(" ");
  } else {
    text = {
      pyraminx: scramblePyraminx,
      skewb: scrambleSkewb,
      megaminx: scrambleMegaminx,
      sq1: scrambleSquare1,
    }[puzzle.type]();
  }
  return { text, preview: previewForScramble(text, puzzle) };
}

// Render the cube state as an unfolded net of HTML boxes. Each face is its own
// grid group (small gap between stickers, larger gap between faces) laid out on
// a 4x3 cross: U on top, L F R B band, D below. Works for any cube size n.
function renderPreview(state, n = 3) {
  const per = n * n;
  const faceStart = { U: 0, R: per, F: 2 * per, D: 3 * per, L: 4 * per, B: 5 * per };
  // Face position (column, row) on the 4-wide x 3-tall cross (1-indexed).
  const faceOrigin = { U: [2, 1], L: [1, 2], F: [2, 2], R: [3, 2], B: [4, 2], D: [2, 3] };

  let faces = "";
  for (const face of Object.keys(faceOrigin)) {
    const [col, row] = faceOrigin[face];
    let stickers = "";
    for (let i = 0; i < per; i++) {
      stickers += `<div class="sticker" style="background:${CUBE_COLORS[state[faceStart[face] + i]]}"></div>`;
    }
    faces +=
      `<div class="face" style="grid-column:${col};grid-row:${row};` +
      `grid-template-columns:repeat(${n},1fr);grid-template-rows:repeat(${n},1fr)">${stickers}</div>`;
  }
  return `<div class="cube-net">${faces}</div>`;
}

// ---------- Pyraminx & Skewb engines ----------
// Move permutation tables (newState[i] = state[perm[i]]) were derived from a
// geometric 3D model and verified in Python: every move^3 = identity, capital
// moves cycle 12 facelets / tips cycle 3, scramble·inverse = solved, and sticker
// colors are conserved. "'" applies the perm twice (its inverse, since order 3).
function applyPerm(state, perm) {
  return perm.map((p) => state[p]);
}

function stateFromScramble(text, moves, solved) {
  let st = solved.slice();
  for (const tok of text.split(/\s+/).filter(Boolean)) {
    const perm = moves[tok[0]];
    if (!perm) continue;
    const times = tok.endsWith("'") ? 2 : 1;
    for (let k = 0; k < times; k++) st = applyPerm(st, perm);
  }
  return st;
}

// --- Pyraminx: 4 triangular faces, 9 facelets each (index = face*9 + local) ---
const PYRA_FACES = ["U", "L", "R", "B"];
// Oriented for the WCA holding convention — green front, yellow bottom, red left,
// blue right — so the preview matches a scramble done in that orientation. Verified
// in Python: a clockwise U sends the front (green) tip onto the left (red) face.
const PYRA_COLORS = { U: "#ffd21a", L: "#1466c4", R: "#d1332b", B: "#12a150" };
const PYRA_MOVES = {
  U: [0,1,2,3,4,5,6,7,8,18,21,20,19,13,14,15,16,17,27,30,29,28,22,23,24,25,26,9,10,11,12,31,32,33,34,35],
  u: [0,1,2,3,4,5,6,7,8,18,10,11,12,13,14,15,16,17,27,19,20,21,22,23,24,25,26,9,28,29,30,31,32,33,34,35],
  L: [31,28,32,33,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,3,20,21,0,2,1,25,26,27,24,29,30,22,23,19,34,35],
  l: [31,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,0,23,24,25,26,27,28,29,30,22,32,33,34,35],
  R: [0,15,2,3,13,14,10,7,8,9,33,11,12,35,34,30,16,17,18,19,20,21,22,23,24,25,26,27,28,29,1,31,32,6,5,4],
  r: [0,1,2,3,13,5,6,7,8,9,10,11,12,35,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,4],
  B: [0,1,2,21,4,5,24,25,26,9,10,11,6,13,14,3,7,8,18,19,20,15,22,23,12,16,17,27,28,29,30,31,32,33,34,35],
  b: [0,1,2,3,4,5,6,7,26,9,10,11,12,13,14,15,16,8,18,19,20,21,22,23,24,25,17,27,28,29,30,31,32,33,34,35],
};
const PYRA_SOLVED = PYRA_FACES.flatMap((f) => Array(9).fill(f));

function pyraStateFromScramble(text) {
  return stateFromScramble(text, PYRA_MOVES, PYRA_SOLVED);
}

// 9 sub-triangles per face as barycentric-int corners (i,j,k)/3 over the face's
// (A=top, B=bottom-left, C=bottom-right) vertices — matches the verified model.
const PYRA_TRIS = [
  [[3,0,0],[2,1,0],[2,0,1]],
  [[2,1,0],[1,2,0],[1,1,1]],
  [[2,1,0],[1,1,1],[2,0,1]],
  [[2,0,1],[1,1,1],[1,0,2]],
  [[1,2,0],[0,3,0],[0,2,1]],
  [[1,2,0],[0,2,1],[1,1,1]],
  [[1,1,1],[0,2,1],[0,1,2]],
  [[1,1,1],[0,1,2],[1,0,2]],
  [[1,0,2],[0,1,2],[0,0,3]],
];

// --- Shared SVG helpers so the puzzle nets match the cube net's tactile look ---
function _centroid(pts) {
  const s = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
  return [s[0] / pts.length, s[1] / pts.length];
}
function _toward(pts, c, f) {
  return pts.map((p) => [c[0] + (p[0] - c[0]) * f, c[1] + (p[1] - c[1]) * f]);
}
// Path for a polygon with rounded corners (radius clamped to each edge).
function _roundedPath(pts, r) {
  const n = pts.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const p1 = pts[i], p0 = pts[(i - 1 + n) % n], p2 = pts[(i + 1) % n];
    let v1 = [p0[0] - p1[0], p0[1] - p1[1]], v2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const l1 = Math.hypot(v1[0], v1[1]) || 1, l2 = Math.hypot(v2[0], v2[1]) || 1;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const a = [p1[0] + (v1[0] / l1) * rr, p1[1] + (v1[1] / l1) * rr];
    const b = [p1[0] + (v2[0] / l2) * rr, p1[1] + (v2[1] / l2) * rr];
    d += (i === 0 ? "M" : "L") + `${a[0].toFixed(3)},${a[1].toFixed(3)}`;
    d += `Q${p1[0].toFixed(3)},${p1[1].toFixed(3)} ${b[0].toFixed(3)},${b[1].toFixed(3)}`;
  }
  return d + "Z";
}
// Top-light / bottom-dark inset-style bevel, mapped to each sticker's bbox.
const NET_BEVEL =
  `<defs><linearGradient id="netbev" x1="0" y1="0" x2="0" y2="1">` +
  `<stop offset="0" stop-color="#fff" stop-opacity="0.34"/>` +
  `<stop offset="0.14" stop-color="#fff" stop-opacity="0"/>` +
  `<stop offset="0.86" stop-color="#000" stop-opacity="0"/>` +
  `<stop offset="1" stop-color="#000" stop-opacity="0.26"/></linearGradient></defs>`;
// One beveled sticker: colored fill + gradient overlay, inset for a gap + rounded.
function _sticker(pts, color, gap, radius) {
  const s = _roundedPath(_toward(pts, _centroid(pts), gap), radius);
  return `<path d="${s}" fill="${color}"/><path d="${s}" fill="url(#netbev)"/>`;
}

function renderPyraminx(state) {
  const h = Math.sqrt(3); // height of a side-2 equilateral triangle
  const P_T = [1, 0], P_BL = [0, h], P_BR = [2, h];
  const M_L = [0.5, h / 2], M_R = [1.5, h / 2], M_B = [1, h];
  // Net = one big triangle split into 4: center face inverted, 3 faces at corners.
  // Corner net-points per face [A, B, C] chosen so shared edges (and colors) align.
  const FP = { U: [M_L, M_R, M_B], L: [P_BR, M_R, M_B], R: [P_BL, M_L, M_B], B: [P_T, M_L, M_R] };
  const faceSep = 0.9, stickGap = 0.84, radius = 0.05;
  let bg = "", fg = "";
  PYRA_FACES.forEach((f, fi) => {
    const [A, B, C] = FP[f];
    const fc = _centroid([A, B, C]);
    // dark face backing (rounded triangle), shrunk to separate faces from each other
    bg += `<path d="${_roundedPath(_toward([A, B, C], fc, faceSep), 0.08)}" fill="#0d0b12"/>`;
    for (let li = 0; li < 9; li++) {
      let pts = PYRA_TRIS[li].map(([i, j, k]) =>
        [(i * A[0] + j * B[0] + k * C[0]) / 3, (i * A[1] + j * B[1] + k * C[1]) / 3]);
      pts = _toward(pts, fc, faceSep); // move into the separated face
      fg += _sticker(pts, PYRA_COLORS[state[fi * 9 + li]], stickGap, radius);
    }
  });
  const W = 2, H = h;
  return `<div class="pzl-net" style="aspect-ratio:${(W / H).toFixed(4)}">` +
    `<svg viewBox="-0.1 -0.1 ${(W + 0.2).toFixed(2)} ${(H + 0.2).toFixed(3)}" preserveAspectRatio="xMidYMid meet">${NET_BEVEL}${bg}${fg}</svg></div>`;
}

// --- Skewb: 6 faces, 5 facelets each (index = face*5 + [center,TL,TR,BR,BL]) ---
const SKEWB_FACES = ["U", "R", "F", "D", "L", "B"];
const SKEWB_MOVES = {
  U: [5,1,9,6,7,10,12,13,8,11,0,2,3,4,14,15,16,22,18,19,20,21,26,23,24,25,17,27,28,29],
  L: [20,21,22,3,24,5,6,11,8,9,10,19,12,13,14,15,16,17,18,7,25,27,28,23,26,0,4,1,2,29],
  R: [0,1,24,3,4,25,6,28,29,26,10,11,12,2,14,5,16,7,8,9,20,21,22,23,13,15,19,27,17,18],
  B: [0,1,2,3,9,5,6,7,8,28,15,17,12,19,16,20,23,24,18,22,10,21,13,14,11,25,26,27,4,29],
};
const SKEWB_SOLVED = SKEWB_FACES.flatMap((f) => Array(5).fill(f));

function skewbStateFromScramble(text) {
  return stateFromScramble(text, SKEWB_MOVES, SKEWB_SOLVED);
}

function renderSkewb(state) {
  const gap = 0.14, step = 1 + gap;
  const pos = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
  // 5 facelet polygons within a unit square: center diamond + 4 corner triangles.
  const shapes = [
    [[0.5,0],[1,0.5],[0.5,1],[0,0.5]], // center
    [[0,0],[0.5,0],[0,0.5]],           // TL
    [[1,0],[1,0.5],[0.5,0]],           // TR
    [[1,1],[0.5,1],[1,0.5]],           // BR
    [[0,1],[0,0.5],[0.5,1]],           // BL
  ];
  const stickGap = 0.86, radius = 0.06;
  let bg = "", fg = "";
  SKEWB_FACES.forEach((f, fi) => {
    const [c, r] = pos[f];
    const ox = c * step, oy = r * step;
    // dark rounded face backing (like a cube net face)
    bg += `<rect x="${ox.toFixed(3)}" y="${oy.toFixed(3)}" width="1" height="1" rx="0.09" fill="#0d0b12"/>`;
    for (let s = 0; s < 5; s++) {
      const pts = shapes[s].map(([x, y]) => [ox + x, oy + y]);
      fg += _sticker(pts, CUBE_COLORS[state[fi * 5 + s]], stickGap, radius);
    }
  });
  const W = 4 + 3 * gap, H = 3 + 2 * gap;
  return `<div class="pzl-net" style="aspect-ratio:${(W / H).toFixed(4)}">` +
    `<svg viewBox="-0.05 -0.05 ${(W + 0.1).toFixed(2)} ${(H + 0.1).toFixed(2)}" preserveAspectRatio="xMidYMid meet">${NET_BEVEL}${bg}${fg}</svg></div>`;
}

// ---------- Time formatting ----------
// X.XX format: shows seconds with two decimals; minutes appear once >= 60s.
function formatTime(ms) {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return totalSeconds.toFixed(2);
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(2).padStart(5, "0");
  return `${minutes}:${seconds}`;
}

// Value shown for an average (number ms, Infinity = DNF, null = not enough solves).
function formatAverage(value) {
  if (value === null) return "—";
  if (value === Infinity) return "DNF";
  return formatTime(value);
}

// Parse a typed time into ms. Returns null if invalid.
//  - With "." or ":" it's read literally: "34.15" -> 34.15s, "1:23.45" -> 83.45s
//  - Pure digits fill from the right: last 2 = centiseconds, next 2 = seconds,
//    the rest = minutes.  "316" -> 3.16, "3415" -> 34.15, "12345" -> 1:23.45
function parseTimeInput(str) {
  str = (str || "").trim();
  if (!str) return null;

  if (str.includes(":") || str.includes(".")) {
    let minutes = 0;
    let rest = str;
    if (str.includes(":")) {
      const [m, r] = str.split(":");
      minutes = parseInt(m, 10) || 0;
      rest = r;
    }
    const sec = parseFloat(rest);
    if (isNaN(sec)) return null;
    return Math.round((minutes * 60 + sec) * 1000);
  }

  if (!/^\d+$/.test(str)) return null;
  const cs = parseInt(str.slice(-2) || "0", 10);
  const sec = parseInt(str.slice(-4, -2) || "0", 10);
  const min = parseInt(str.slice(0, -4) || "0", 10);
  return (min * 60 + sec) * 1000 + cs * 10;
}

// ---------- Penalty helpers ----------
// penalty: null | "+2" | "DNF"
function effectiveTime(solve) {
  if (solve.penalty === "DNF") return Infinity;
  return solve.time + (solve.penalty === "+2" ? 2000 : 0);
}

function formatSolve(solve) {
  if (solve.penalty === "DNF") return "DNF";
  const shown = formatTime(solve.time + (solve.penalty === "+2" ? 2000 : 0));
  return solve.penalty === "+2" ? shown + "+" : shown;
}

// ---------- DOM references ----------
const scrambleEl = document.getElementById("scramble");
const timerEl = document.getElementById("timer");
const hintEl = document.getElementById("hint");
const newScrambleBtn = document.getElementById("new-scramble");
const copyScrambleBtn = document.getElementById("copy-scramble");
const editScrambleBtn = document.getElementById("edit-scramble");
const scrambleEditModal = document.getElementById("scramble-edit-modal");
const scrambleEditInput = document.getElementById("scramble-edit-input");
const scrambleEditApply = document.getElementById("scramble-edit-apply");
const scrambleEditClose = document.getElementById("scramble-edit-close");
const bestEl = document.getElementById("stat-best");
const ao5El = document.getElementById("stat-ao5");
const ao12El = document.getElementById("stat-ao12");
const mo3El = document.getElementById("stat-mo3");
const ao50El = document.getElementById("stat-ao50");
const ao100El = document.getElementById("stat-ao100");
const statGrid = document.getElementById("stat-grid");
const pbMo3El = document.getElementById("pb-mo3");
const pbAo5El = document.getElementById("pb-ao5");
const pbAo12El = document.getElementById("pb-ao12");
const pbAveragesEl = document.getElementById("pb-averages");
const pbAvgMo3El = document.getElementById("pb-avg-mo3");
const optShowMo3 = document.getElementById("opt-show-mo3");
const themeSelect = document.getElementById("theme-select");
const accentColor = document.getElementById("accent-color");
const solveListEl = document.getElementById("solve-list");
const solveColsEl = document.getElementById("solve-cols");
const solveEmptyEl = document.getElementById("solve-empty");
const sidebarCountEl = document.getElementById("sidebar-count");
const clearAllBtn = document.getElementById("clear-all");
const previewEl = document.getElementById("preview");
const settingsToggle = document.getElementById("settings-toggle");
const settingsPanel = document.getElementById("settings-panel");
const optHideUI = document.getElementById("opt-hide-ui");
const optInspection = document.getElementById("opt-inspection");
const optRunningDisplay = document.getElementById("opt-running-display");
const optTimerFont = document.getElementById("opt-timer-font");
const optManual = document.getElementById("opt-manual");
const manualInput = document.getElementById("manual-input");
const optShowAo50 = document.getElementById("opt-show-ao50");
const optShowAo100 = document.getElementById("opt-show-ao100");
const settingsClose = document.getElementById("settings-close");
const dataExportBtn = document.getElementById("data-export");
const dataImportBtn = document.getElementById("data-import");
const dataMergeBtn = document.getElementById("data-merge");
const dataImportInput = document.getElementById("data-import-input");
const dataStatus = document.getElementById("data-status");
const puzzleSelect = document.getElementById("puzzle-select");
const sessionSelect = document.getElementById("session-select");
const sessionNewBtn = document.getElementById("session-new");
const sessionRenameBtn = document.getElementById("session-rename");
const sessionDeleteBtn = document.getElementById("session-delete");
const scrambleModal = document.getElementById("scramble-modal");
const modalTitle = document.getElementById("modal-title");
const modalSub = document.getElementById("modal-sub");
const modalActions = document.getElementById("modal-actions");
const modalScramble = document.getElementById("modal-scramble");
const modalPreview = document.getElementById("modal-preview");
const modalClose = document.getElementById("modal-close");
const dockPreview = document.querySelector(".dock-preview");

// ---------- State ----------
// "idle"    -> waiting to start
// "holding" -> space pressed, charging the hold delay (red, not armed yet)
// "ready"   -> held long enough, timer armed (green)
// "running" -> timer counting
const STATE = { IDLE: "idle", INSPECTING: "inspecting", HOLDING: "holding", READY: "ready", RUNNING: "running" };
let state = STATE.IDLE;
let startTime = 0;
let rafId = null;
let currentScramble = "";
let holdTimeout = null;
const HOLD_MS = 500; // must hold Space this long before the timer arms

// WCA inspection
const INSPECT_SEC = 15;
let inspecting = false;
let inspectionStart = 0;
let inspectionRaf = null;
let inspectionPenalty = null; // "+2" | "DNF" | null, applied to the resulting solve

// ---------- Settings ----------
const SETTINGS_KEY = "cube-timer-settings";
const DEFAULT_SETTINGS = { hideUI: true, inspection: false, runningDisplay: "full", timerFont: "digital", showMo3: true, showAo50: false, showAo100: false, manualEntry: false, theme: "green", customAccent: "#26d366" };

// Each colorway's accent hex, so the picker reflects the active theme and other
// pages can render it.
const THEME_ACCENT_HEX = {
  green: "#26d366", ocean: "#38bdf8", violet: "#a78bfa", rose: "#fb6f92",
  ember: "#ff9f43", mint: "#2dd4bf", light: "#16a34a",
};

let settings = loadSettings();

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    // Migrate the old combined "showBig" toggle to the two separate ones.
    if (parsed.showBig) { parsed.showAo50 = true; parsed.showAo100 = true; }
    // Migrate the old "hide timer during solve" boolean to the display dropdown.
    if (parsed.hideTimer === true && parsed.runningDisplay === undefined) parsed.runningDisplay = "hidden";
    // Migrate the old default theme name.
    if (parsed.theme === "default") parsed.theme = "green";
    // Migrate the short-lived split surface/accent model back to a single theme.
    if (parsed.theme === undefined && parsed.accent) {
      parsed.theme = parsed.surface === "light" ? "light"
        : ({ green: "green", blue: "ocean", violet: "violet", rose: "rose", amber: "ember", teal: "mint", custom: "custom" }[parsed.accent] || "green");
    }
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable — session-only settings */
  }
}

// ---------- Sessions (multiple named sessions per puzzle) ----------
// Storage shape: { [puzzleId]: { active: sessionId, list: [ { id, name, solves } ] } }
const STORAGE_KEY = "cube-timer-sessions";
const PUZZLE_KEY = "cube-timer-puzzle";
let allData = loadData();
let currentPuzzle = loadCurrentPuzzle();
let solves = []; // points at the current session's solves array
syncSolves();

// Migrate the old one-session-per-puzzle shape ({ puzzleId: [solves] }) in place.
function migrateSessionsShape(data) {
  for (const pid of Object.keys(data)) {
    if (Array.isArray(data[pid])) {
      data[pid] = { active: "s1", list: [{ id: "s1", name: "Session 1", solves: data[pid] }] };
    }
  }
  return data;
}

function loadData() {
  try {
    return migrateSessionsShape(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
  } catch {
    return {};
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
  } catch {
    /* storage unavailable — session-only history */
  }
}

// ---------- Backup: export & merge-import ----------
// Solves carry no id, so identity = timestamp + time + penalty + scramble.
function solveSignature(s) {
  return `${s.date || ""}|${s.time}|${s.penalty || ""}|${s.scramble || ""}`;
}

function totalSolveCount(data) {
  return Object.values(data).reduce((n, pd) =>
    n + ((pd && pd.list) || []).reduce((m, s) => m + (Array.isArray(s.solves) ? s.solves.length : 0), 0), 0);
}

// Merge `incoming` sessions data into `base` (no overwrite). Sessions match by id
// (so the default "Session 1" combines across devices); solves dedupe by signature.
// Returns the number of new solves added.
function mergeData(base, incoming) {
  migrateSessionsShape(incoming);
  let added = 0;
  for (const pid of Object.keys(incoming)) {
    const inc = incoming[pid];
    if (!inc || !Array.isArray(inc.list)) continue;
    if (!base[pid] || !Array.isArray(base[pid].list)) {
      base[pid] = inc;
      added += (inc.list || []).reduce((n, s) => n + (Array.isArray(s.solves) ? s.solves.length : 0), 0);
      continue;
    }
    for (const incSess of inc.list) {
      const incomingSolves = Array.isArray(incSess.solves) ? incSess.solves : [];
      const match = base[pid].list.find((s) => s.id === incSess.id);
      if (!match) {
        base[pid].list.push(incSess);
        added += incomingSolves.length;
        continue;
      }
      const seen = new Set(match.solves.map(solveSignature));
      for (const sv of incomingSolves) {
        const sig = solveSignature(sv);
        if (seen.has(sig)) continue;
        seen.add(sig);
        match.solves.push(sv);
        added++;
      }
      // Keep the merged history in chronological order.
      match.solves.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    }
  }
  return added;
}

function exportData() {
  const payload = { app: "cube-timer", version: 1, exportedAt: new Date().toISOString(), sessions: allData };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cube-timer-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  const total = totalSolveCount(allData);
  showDataStatus(`Backup downloaded — ${total} solve${total === 1 ? "" : "s"}.`);
}

// Parse + validate a backup file, then hand the sessions object to `onData`.
function readBackupFile(file, onData) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch {
      showDataStatus("Couldn't read that file — is it a backup JSON?", true);
      return;
    }
    const incoming = parsed && parsed.sessions ? parsed.sessions : parsed;
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
      showDataStatus("That doesn't look like a cube-timer backup.", true);
      return;
    }
    onData(incoming);
  };
  reader.onerror = () => showDataStatus("Couldn't read that file.", true);
  reader.readAsText(file);
}

function importAndMerge(file) {
  readBackupFile(file, (incoming) => {
    let added;
    try {
      added = mergeData(allData, incoming);
    } catch {
      showDataStatus("Couldn't merge that file.", true);
      return;
    }
    saveData();
    syncSolves();
    renderSessions();
    render();
    showDataStatus(
      added
        ? `Merged — added ${added} new solve${added === 1 ? "" : "s"}.`
        : "Already up to date — nothing new to add."
    );
  });
}

// Replace ALL data on this device with the backup (destructive — confirm first).
function importReplace(file) {
  readBackupFile(file, (incoming) => {
    migrateSessionsShape(incoming);
    const count = totalSolveCount(incoming);
    const ok = window.confirm(
      `Replace ALL data on this device with this backup (${count} solve${count === 1 ? "" : "s"})?\n\n` +
      "Your current solves on this device will be overwritten. This can't be undone."
    );
    if (!ok) { showDataStatus("Import cancelled — nothing changed."); return; }
    allData = incoming;
    syncSolves();
    saveData();
    renderSessions();
    render();
    showDataStatus(`Imported — this device now has ${count} solve${count === 1 ? "" : "s"}.`);
  });
}

let dataStatusTimer = null;
function showDataStatus(msg, isError) {
  if (!dataStatus) return;
  dataStatus.textContent = msg;
  dataStatus.classList.toggle("err", !!isError);
  dataStatus.hidden = false;
  clearTimeout(dataStatusTimer);
  dataStatusTimer = setTimeout(() => { dataStatus.hidden = true; }, 6000);
}

function newSessionId() {
  return "s" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

// The session container for a puzzle, creating a default session if needed.
function puzzleData(pid) {
  if (!allData[pid] || !allData[pid].list || allData[pid].list.length === 0) {
    allData[pid] = { active: "s1", list: [{ id: "s1", name: "Session 1", solves: [] }] };
  }
  return allData[pid];
}

function currentSession() {
  const pd = puzzleData(currentPuzzle.id);
  let s = pd.list.find((x) => x.id === pd.active);
  if (!s) { s = pd.list[0]; pd.active = s.id; }
  return s;
}

// Point `solves` at the active session's array.
function syncSolves() {
  solves = currentSession().solves;
}

function saveSolves() {
  currentSession().solves = solves; // re-sync in case the ref was replaced
  saveData();
}

function loadCurrentPuzzle() {
  // A URL hash (e.g. #444) selects a puzzle directly; otherwise use the saved one.
  const hashId = location.hash.replace("#", "");
  const hashPuzzle = PUZZLES.find((p) => p.id === hashId);
  if (hashPuzzle) return hashPuzzle;
  let id;
  try { id = localStorage.getItem(PUZZLE_KEY); } catch { id = null; }
  return PUZZLES.find((p) => p.id === id) || PUZZLES.find((p) => p.id === "333");
}

function setPuzzle(id) {
  const puzzle = PUZZLES.find((p) => p.id === id);
  if (!puzzle || puzzle.id === currentPuzzle.id) return;
  currentPuzzle = puzzle;
  try { localStorage.setItem(PUZZLE_KEY, id); } catch { /* ignore */ }
  syncSolves();
  renderSessions();
  newScramble();
  render();
}

// ---------- Session management ----------
function renderSessions() {
  const pd = puzzleData(currentPuzzle.id);
  sessionSelect.innerHTML = "";
  for (const s of pd.list) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    sessionSelect.appendChild(opt);
  }
  sessionSelect.value = pd.active;
  sessionDeleteBtn.disabled = pd.list.length <= 1;
}

function switchSession(id) {
  const pd = puzzleData(currentPuzzle.id);
  if (!pd.list.some((s) => s.id === id)) return;
  pd.active = id;
  saveData();
  syncSolves();
  render();
}

function createSession() {
  const pd = puzzleData(currentPuzzle.id);
  const name = (prompt("Name for the new session:", `Session ${pd.list.length + 1}`) || "").trim();
  if (!name) return;
  const id = newSessionId();
  pd.list.push({ id, name, solves: [] });
  pd.active = id;
  saveData();
  syncSolves();
  renderSessions();
  render();
}

function renameSession() {
  const s = currentSession();
  const name = (prompt("Rename session:", s.name) || "").trim();
  if (!name) return;
  s.name = name;
  saveData();
  renderSessions();
}

function deleteSession() {
  const pd = puzzleData(currentPuzzle.id);
  if (pd.list.length <= 1) return;
  const s = currentSession();
  if (!confirm(`Delete session "${s.name}" and all its solves?`)) return;
  pd.list = pd.list.filter((x) => x.id !== pd.active);
  pd.active = pd.list[0].id;
  saveData();
  syncSolves();
  renderSessions();
  render();
}

// ---------- Scramble rendering ----------
// Format scramble text as move spans (handles multi-line scrambles like Megaminx).
function scrambleToHTML(text) {
  return text
    .split("\n")
    .map((line) =>
      line.split(" ").map((m) => `<span class="move">${m}</span>`).join(" ")
    )
    .join("<br>");
}

// Net HTML for an arbitrary scramble under `puzzle`, or null when unsupported.
function previewForScramble(text, puzzle) {
  if (puzzle.type === "cube") {
    const moves = text.split(/\s+/).filter(Boolean);
    return renderPreview(cubeStateFromMoves(moves, puzzle.size), puzzle.size);
  }
  if (puzzle.type === "pyraminx") return renderPyraminx(pyraStateFromScramble(text));
  if (puzzle.type === "skewb") return renderSkewb(skewbStateFromScramble(text));
  return null;
}

function newScramble() {
  const { text, preview } = makeScramble(currentPuzzle);
  currentScramble = text;
  scrambleEl.innerHTML = scrambleToHTML(text);
  previewEl.innerHTML =
    preview ||
    `<div class="no-preview">No preview yet<span>${currentPuzzle.name} — scramble only</span></div>`;
}

// ---------- Scramble / solve modal ----------
// Plain scramble view (e.g. enlarging the dock preview) — no solve actions.
function openScrambleModal(title, text) {
  modalTitle.textContent = title;
  modalSub.hidden = true;
  modalActions.hidden = true;
  modalActions.innerHTML = "";
  modalScramble.innerHTML = scrambleToHTML(text);
  modalPreview.innerHTML = previewForScramble(text, currentPuzzle) || "";
  scrambleModal.hidden = false;
}

// Solve popup — scramble + ao context + +2 / DNF / delete controls.
function openSolveModal(index) {
  const solve = solves[index];
  if (!solve) return;
  fillSolveModal(index);
  modalScramble.innerHTML = scrambleToHTML(solve.scramble);
  modalPreview.innerHTML = previewForScramble(solve.scramble, currentPuzzle) || "";
  scrambleModal.hidden = false;
}

// (Re)fill the title, ao subtitle, and action buttons for a solve popup.
function fillSolveModal(index) {
  const solve = solves[index];
  if (!solve) { closeScrambleModal(); return; }
  modalTitle.textContent = `Solve ${index + 1} — ${formatSolve(solve)}`;

  const ao5 = index >= 4 ? averageOfWindow(solves.slice(index - 4, index + 1)) : null;
  const ao12 = index >= 11 ? averageOfWindow(solves.slice(index - 11, index + 1)) : null;
  const mo3 = index >= 2 ? meanOfWindow(solves.slice(index - 2, index + 1)) : null;
  modalSub.textContent =
    `mo3 ${formatAverage(mo3)}  ·  ao5 ${formatAverage(ao5)}  ·  ao12 ${formatAverage(ao12)}`;
  modalSub.hidden = false;

  const mk = (cls, label, title, fn) => {
    const b = document.createElement("button");
    b.className = "modal-action " + cls;
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", fn);
    return b;
  };
  modalActions.innerHTML = "";
  modalActions.append(
    mk("pen" + (solve.penalty === "+2" ? " active" : ""), "+2", "Toggle +2 penalty",
      () => { togglePenalty(index, "+2"); fillSolveModal(index); }),
    mk("dnf" + (solve.penalty === "DNF" ? " active" : ""), "DNF", "Toggle DNF",
      () => { togglePenalty(index, "DNF"); fillSolveModal(index); }),
    mk("del", "Delete", "Delete solve",
      () => { deleteSolve(index); closeScrambleModal(); })
  );
  modalActions.hidden = false;
}

function closeScrambleModal() {
  scrambleModal.hidden = true;
}

// ---------- Timer loop ----------
// Whole seconds only (no centiseconds), with minutes once >= 60s.
function formatSeconds(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return String(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function tick() {
  const elapsed = performance.now() - startTime;
  timerEl.textContent = settings.runningDisplay === "seconds" ? formatSeconds(elapsed) : formatTime(elapsed);
  rafId = requestAnimationFrame(tick);
}

function startTimer() {
  // If inspecting, lock in the inspection penalty before the solve starts.
  if (inspecting) {
    const inspEl = (performance.now() - inspectionStart) / 1000;
    inspectionPenalty = inspEl > 17 ? "DNF" : inspEl > INSPECT_SEC ? "+2" : null;
    endInspection();
  }
  state = STATE.RUNNING;
  timerEl.classList.remove("ready", "insp", "insp-warn", "insp-danger");
  timerEl.classList.add("running");
  hintEl.textContent = "Press Space to stop";
  startTime = performance.now();

  if (settings.runningDisplay === "hidden") {
    // Show the "solve" label instead of the ticking time.
    timerEl.textContent = "solve";
    timerEl.classList.add("solve-label");
  } else {
    timerEl.classList.remove("solve-label");
    rafId = requestAnimationFrame(tick);
  }
}

function idleHintText() {
  return settings.inspection ? "Press Space to inspect" : "Press and hold Space to get ready";
}

// ---------- WCA inspection ----------
function startInspection() {
  state = STATE.INSPECTING;
  inspecting = true;
  inspectionPenalty = null;
  inspectionStart = performance.now();
  timerEl.classList.remove("running", "solve-label", "holding", "ready");
  timerEl.classList.add("insp");
  hintEl.textContent = "Inspecting — hold Space when ready";
  cancelAnimationFrame(inspectionRaf);
  inspectionRaf = requestAnimationFrame(inspectionTick);
}

function inspectionTick() {
  if (!inspecting) return;
  if (state === STATE.INSPECTING) {
    const elapsed = (performance.now() - inspectionStart) / 1000;
    const over = elapsed > INSPECT_SEC;
    // "+2"/"DNF" need a real font, digits can use the seven-seg one.
    timerEl.classList.toggle("solve-label", over);
    timerEl.classList.toggle("insp-warn", elapsed >= 8 && elapsed < 12);
    timerEl.classList.toggle("insp-danger", elapsed >= 12);
    timerEl.textContent = over
      ? (elapsed > 17 ? "DNF" : "+2")
      : String(Math.max(1, Math.ceil(INSPECT_SEC - elapsed)));
  }
  inspectionRaf = requestAnimationFrame(inspectionTick);
}

function endInspection() {
  inspecting = false;
  cancelAnimationFrame(inspectionRaf);
  timerEl.classList.remove("insp", "insp-warn", "insp-danger");
}

function cancelInspection() {
  endInspection();
  state = STATE.IDLE;
  timerEl.classList.remove("holding", "ready", "solve-label");
  timerEl.textContent = "0.00";
  hintEl.textContent = idleHintText();
}

// Timer font (data-timer-font on <html>); Digital (DSEG7) is the default.
function applyTimerFont() {
  const f = settings.timerFont || "digital";
  if (f === "digital") document.documentElement.removeAttribute("data-timer-font");
  else document.documentElement.dataset.timerFont = f;
  optTimerFont.value = f;
}

function stopTimer() {
  cancelAnimationFrame(rafId);
  const elapsed = performance.now() - startTime;
  timerEl.classList.remove("running", "solve-label");
  timerEl.textContent = formatTime(elapsed);
  state = STATE.IDLE;
  document.body.classList.remove("solving");
  hintEl.textContent = idleHintText();
  recordSolve(elapsed);
  newScramble();
}

// Space pressed: start charging the hold delay (red) — not armed yet.
function beginHold() {
  state = STATE.HOLDING;
  timerEl.classList.remove("ready", "insp", "insp-warn", "insp-danger", "solve-label");
  timerEl.classList.add("holding");
  timerEl.textContent = "0.00";
  hintEl.textContent = "Keep holding…";
  clearTimeout(holdTimeout);
  holdTimeout = setTimeout(armTimer, HOLD_MS);
}

// Held long enough: arm the timer (green) and enter focus mode.
function armTimer() {
  if (state !== STATE.HOLDING) return;
  state = STATE.READY;
  timerEl.classList.remove("holding");
  timerEl.classList.add("ready");
  hintEl.textContent = "Release to start";
  if (settings.hideUI) document.body.classList.add("solving");
}

// Released before arming: cancel. Returns to inspection if it was running.
function cancelHold() {
  clearTimeout(holdTimeout);
  holdTimeout = null;
  timerEl.classList.remove("holding");
  if (inspecting) {
    state = STATE.INSPECTING;
    timerEl.classList.add("insp");
    hintEl.textContent = "Inspecting — hold Space when ready";
  } else {
    state = STATE.IDLE;
    hintEl.textContent = idleHintText();
  }
}

// ---------- Solves ----------
function recordSolve(ms) {
  // A pending inspection penalty (if any) applies to this solve.
  const penalty = inspectionPenalty;
  inspectionPenalty = null;

  // Best among prior (non-DNF) solves, to detect a new PB.
  const prior = solves.filter((s) => s.penalty !== "DNF").map(effectiveTime);
  const prevBest = prior.length ? Math.min(...prior) : Infinity;
  const hadPrior = solves.length > 0;

  solves.push({ time: ms, penalty, scramble: currentScramble, date: new Date().toISOString() });
  saveSolves();
  render();

  // Celebrate beating a previous personal best (not the very first solve).
  const eff = penalty === "DNF" ? Infinity : ms + (penalty === "+2" ? 2000 : 0);
  if (hadPrior && eff < prevBest) fireConfetti();
}

// ---------- Confetti (self-contained canvas burst) ----------
function fireConfetti() {
  const canvas = document.createElement("canvas");
  canvas.className = "confetti-canvas";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const colors = ["#d1332b", "#12a150", "#ffd21a", "#ff6a00", "#1466c4", "#2ecc71", "#f7f7f7"];
  // Burst from the center of the timer.
  const rect = timerEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const particles = [];
  for (let i = 0; i < 170; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 10;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 5, // bias the burst upward
      size: 5 + Math.random() * 6,
      color: colors[(Math.random() * colors.length) | 0],
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.3,
      life: 0,
      ttl: 90 + Math.random() * 45,
    });
  }

  const gravity = 0.16;
  const drag = 0.99;
  function frame() {
    ctx.clearRect(0, 0, w, h);
    let alive = false;
    for (const p of particles) {
      if (p.life > p.ttl) continue;
      alive = true;
      p.life++;
      p.vx *= drag;
      p.vy = p.vy * drag + gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.ttl);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
      ctx.restore();
    }
    if (alive) requestAnimationFrame(frame);
    else canvas.remove();
  }
  frame();
}

function deleteSolve(index) {
  solves.splice(index, 1);
  saveSolves();
  render();
}

// Toggle a penalty on a solve (clicking the active penalty clears it).
function togglePenalty(index, penalty) {
  solves[index].penalty = solves[index].penalty === penalty ? null : penalty;
  saveSolves();
  render();
}

function clearSolves() {
  if (solves.length === 0) return;
  if (!confirm("Delete all solves?")) return;
  solves = [];
  saveSolves();
  render();
}

// ---------- Statistics ----------
// Average of exactly n solves per WCA: drop the single best and single worst,
// mean the rest. A DNF counts as the worst; two or more DNF -> DNF average.
function averageOfWindow(windowSolves) {
  const times = windowSolves.map(effectiveTime).sort((a, b) => a - b);
  const trimmed = times.slice(1, -1);
  if (trimmed.some((t) => t === Infinity)) return Infinity; // DNF average
  const sum = trimmed.reduce((acc, t) => acc + t, 0);
  return sum / trimmed.length;
}

// Mean of n (mo3) — arithmetic mean, no trim; any DNF makes the whole mean a DNF.
function meanOfWindow(windowSolves) {
  const times = windowSolves.map(effectiveTime);
  if (times.some((t) => t === Infinity)) return Infinity;
  return times.reduce((a, b) => a + b, 0) / times.length;
}

// Current rolling average of the most recent n solves.
function currentAverage(n) {
  if (solves.length < n) return null;
  return averageOfWindow(solves.slice(-n));
}

// Current rolling mean of the most recent n solves (mo3).
function currentMean(n) {
  if (solves.length < n) return null;
  return meanOfWindow(solves.slice(-n));
}

// Best (lowest) average of n across every consecutive window in history.
function bestAverage(n) {
  if (solves.length < n) return null;
  let best = Infinity;
  for (let i = 0; i + n <= solves.length; i++) {
    const avg = averageOfWindow(solves.slice(i, i + n));
    if (avg < best) best = avg;
  }
  return best === Infinity ? Infinity : best;
}

// Best (lowest) mean of n (mo3) across every consecutive window in history.
function bestMean(n) {
  if (solves.length < n) return null;
  let best = Infinity;
  for (let i = 0; i + n <= solves.length; i++) {
    const m = meanOfWindow(solves.slice(i, i + n));
    if (m < best) best = m;
  }
  return best === Infinity ? Infinity : best;
}

// ---------- Rendering ----------
function render() {
  renderStats();
  renderSolveList();
}

function renderStats() {
  // PB single ignores DNF solves entirely.
  const finished = solves.filter((s) => s.penalty !== "DNF").map(effectiveTime);
  bestEl.textContent = finished.length ? formatTime(Math.min(...finished)) : "—";

  mo3El.textContent = formatAverage(currentMean(3));
  ao5El.textContent = formatAverage(currentAverage(5));
  ao12El.textContent = formatAverage(currentAverage(12));
  ao50El.textContent = formatAverage(currentAverage(50));
  ao100El.textContent = formatAverage(currentAverage(100));

  // Best-average strip above the solve list.
  pbMo3El.textContent = formatAverage(bestMean(3));
  pbAo5El.textContent = formatAverage(bestAverage(5));
  pbAo12El.textContent = formatAverage(bestAverage(12));
  pbAveragesEl.style.display = solves.length ? "grid" : "none";
}

function renderSolveList() {
  sidebarCountEl.textContent = solves.length;
  solveEmptyEl.style.display = solves.length === 0 ? "block" : "none";
  if (solveColsEl) solveColsEl.style.display = solves.length === 0 ? "none" : "grid";
  solveListEl.innerHTML = "";

  const finished = solves.filter((s) => s.penalty !== "DNF").map(effectiveTime);
  const bestTime = finished.length ? Math.min(...finished) : null;

  // Rolling ao5 / ao12 *ending at* each solve, so the list shows their progression.
  const ao5s = solves.map((_, i) => (i >= 4 ? averageOfWindow(solves.slice(i - 4, i + 1)) : null));
  const ao12s = solves.map((_, i) => (i >= 11 ? averageOfWindow(solves.slice(i - 11, i + 1)) : null));
  const bestAo5 = bestAverage(5);
  const bestAo12 = bestAverage(12);
  const isBest = (v, best) => v != null && isFinite(v) && best != null && isFinite(best) && v === best;

  solves.forEach((solve, index) => {
    const li = document.createElement("li");
    li.className = "solve-item";
    li.title = "View / edit solve";
    li.addEventListener("click", () => openSolveModal(index));

    const num = document.createElement("span");
    num.className = "solve-index";
    num.textContent = index + 1;

    const time = document.createElement("span");
    time.className = "solve-single";
    time.textContent = formatSolve(solve);
    if (solve.penalty === "DNF") time.classList.add("dnf");
    else if (bestTime !== null && effectiveTime(solve) === bestTime) time.classList.add("best");

    const ao5 = document.createElement("span");
    ao5.className = "solve-ao" + (isBest(ao5s[index], bestAo5) ? " best" : "");
    ao5.textContent = formatAverage(ao5s[index]);

    const ao12 = document.createElement("span");
    ao12.className = "solve-ao" + (isBest(ao12s[index], bestAo12) ? " best" : "");
    ao12.textContent = formatAverage(ao12s[index]);

    li.append(num, time, ao5, ao12);
    solveListEl.prepend(li); // newest on top
  });
}

// ---------- Keyboard handling ----------
document.addEventListener("keydown", (e) => {
  // Escape closes an open modal.
  if (e.key === "Escape") {
    if (!scrambleModal.hidden) { closeScrambleModal(); return; }
    if (!scrambleEditModal.hidden) { closeScrambleEdit(); return; }
    if (!settingsPanel.hidden) { closeSettings(); return; }
    if (inspecting) { cancelInspection(); return; } // bail out of inspection
  }
  if (e.code !== "Space") return;
  if (settings.manualEntry) return; // manual entry uses the text box, not the timer
  const active = document.activeElement;
  if (active && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName)) return;
  if (!scrambleModal.hidden || !settingsPanel.hidden || !scrambleEditModal.hidden) return; // don't arm behind a modal
  e.preventDefault();
  if (e.repeat) return; // ignore auto-repeat while holding

  if (state === STATE.RUNNING) {
    stopTimer();
  } else if (state === STATE.IDLE) {
    if (settings.inspection) startInspection();
    else beginHold();
  } else if (state === STATE.INSPECTING) {
    beginHold(); // charge the hold to arm while the inspection clock keeps running
  }
});

document.addEventListener("keyup", (e) => {
  if (e.code !== "Space") return;
  e.preventDefault();

  if (state === STATE.READY) {
    startTimer();
  } else if (state === STATE.HOLDING) {
    cancelHold(); // released too early — don't start
  }
});

// ---------- Copy / manual scramble ----------
let toastTimer = null;
function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1500);
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      resolve();
    } catch (e) { reject(e); }
  });
}

function openScrambleEdit() {
  scrambleEditInput.value = currentScramble;
  scrambleEditModal.hidden = false;
  setTimeout(() => scrambleEditInput.focus(), 0);
}

function closeScrambleEdit() { scrambleEditModal.hidden = true; }

// Apply a pasted/typed scramble as the current one (with its preview).
function applyManualScramble() {
  const text = scrambleEditInput.value.trim();
  if (!text) { closeScrambleEdit(); return; }
  currentScramble = text;
  scrambleEl.innerHTML = scrambleToHTML(text);
  let preview = null;
  try { preview = previewForScramble(text, currentPuzzle); } catch { preview = null; }
  previewEl.innerHTML =
    preview || `<div class="no-preview">No preview<span>couldn't read that scramble</span></div>`;
  closeScrambleEdit();
}

// ---------- UI events ----------
newScrambleBtn.addEventListener("click", () => {
  newScramble();
  newScrambleBtn.blur(); // keep Space bound to the timer, not the button
});

copyScrambleBtn.addEventListener("click", () => {
  if (!currentScramble) return;
  copyText(currentScramble).then(
    () => {
      copyScrambleBtn.classList.add("copied");
      setTimeout(() => copyScrambleBtn.classList.remove("copied"), 900);
      toast("Scramble copied");
    },
    () => toast("Copy failed")
  );
  copyScrambleBtn.blur();
});

editScrambleBtn.addEventListener("click", () => { openScrambleEdit(); editScrambleBtn.blur(); });
scrambleEditApply.addEventListener("click", applyManualScramble);
scrambleEditClose.addEventListener("click", closeScrambleEdit);
scrambleEditModal.addEventListener("click", (e) => {
  if (e.target === scrambleEditModal) closeScrambleEdit();
});
scrambleEditInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); applyManualScramble(); }
});

// Click the dock preview to enlarge the current scramble.
dockPreview.addEventListener("click", () => {
  openScrambleModal(`${currentPuzzle.name} scramble`, currentScramble);
});

// Modal close: X button, backdrop click.
modalClose.addEventListener("click", closeScrambleModal);
scrambleModal.addEventListener("click", (e) => {
  if (e.target === scrambleModal) closeScrambleModal();
});

// Puzzle selector: populate and switch sessions.
for (const p of PUZZLES) {
  const opt = document.createElement("option");
  opt.value = p.id;
  opt.textContent = p.name;
  puzzleSelect.appendChild(opt);
}
puzzleSelect.value = currentPuzzle.id;
puzzleSelect.addEventListener("change", () => {
  setPuzzle(puzzleSelect.value);
  puzzleSelect.blur();
});

clearAllBtn.addEventListener("click", () => {
  clearSolves();
  clearAllBtn.blur();
});

// Session controls
sessionSelect.addEventListener("change", () => {
  switchSession(sessionSelect.value);
  sessionSelect.blur();
});
sessionNewBtn.addEventListener("click", () => { createSession(); sessionNewBtn.blur(); });
sessionRenameBtn.addEventListener("click", () => { renameSession(); sessionRenameBtn.blur(); });
sessionDeleteBtn.addEventListener("click", () => { deleteSession(); sessionDeleteBtn.blur(); });

// Data backup: export a JSON file, or import (replace) / merge another device's.
let pendingImportMode = "merge";
dataExportBtn.addEventListener("click", exportData);
dataImportBtn.addEventListener("click", () => { pendingImportMode = "replace"; dataImportInput.click(); });
dataMergeBtn.addEventListener("click", () => { pendingImportMode = "merge"; dataImportInput.click(); });
dataImportInput.addEventListener("change", () => {
  const file = dataImportInput.files && dataImportInput.files[0];
  if (file) (pendingImportMode === "replace" ? importReplace : importAndMerge)(file);
  dataImportInput.value = ""; // allow re-importing the same file
});

// ---------- Options menu (modal) ----------
// Show/hide the Ao50 and Ao100 cards independently, and size the grid to fit.
// Apply the chosen colorway (data-theme on <html>). Green is the :root default
// (no attribute); Custom sets --ready/--accent2 inline from settings.customAccent.
function applyTheme() {
  const root = document.documentElement;
  const t = settings.theme || "green";

  if (t === "custom") {
    root.removeAttribute("data-theme");
    root.style.setProperty("--ready", settings.customAccent);
    root.style.setProperty("--accent2", settings.customAccent);
  } else {
    root.style.removeProperty("--ready");
    root.style.removeProperty("--accent2");
    if (t === "green") root.removeAttribute("data-theme");
    else root.dataset.theme = t;
  }

  themeSelect.value = t;
  accentColor.value = t === "custom" ? settings.customAccent : (THEME_ACCENT_HEX[t] || "#26d366");
}

function applyStatCols() {
  statGrid.classList.toggle("show-mo3", settings.showMo3);
  statGrid.classList.toggle("show-ao50", settings.showAo50);
  statGrid.classList.toggle("show-ao100", settings.showAo100);
  if (pbAvgMo3El) pbAvgMo3El.style.display = settings.showMo3 ? "flex" : "none";
  const cols = 2 + (settings.showMo3 ? 1 : 0) + (settings.showAo50 ? 1 : 0) + (settings.showAo100 ? 1 : 0);
  statGrid.dataset.cols = String(cols);
}

function closeSettings() {
  settingsPanel.hidden = true;
}

// Toggle manual time-entry mode.
function applyManualMode() {
  document.body.classList.toggle("manual", settings.manualEntry);
  if (settings.manualEntry) {
    timerEl.textContent = "0.00";
    manualInput.value = "";
    manualInput.focus();
  }
}

// Live preview: show the parsed time in the big display as you type.
manualInput.addEventListener("input", () => {
  const ms = parseTimeInput(manualInput.value);
  timerEl.textContent = ms == null ? "0.00" : formatTime(ms);
});

// Enter records the solve for the current scramble.
manualInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const ms = parseTimeInput(manualInput.value);
  if (ms == null || ms <= 0) {
    manualInput.classList.remove("shake");
    void manualInput.offsetWidth; // restart animation
    manualInput.classList.add("shake");
    return;
  }
  recordSolve(ms);
  newScramble();
  manualInput.value = "";
  timerEl.textContent = "0.00";
  manualInput.focus();
});

optHideUI.checked = settings.hideUI;
optInspection.checked = settings.inspection;
optRunningDisplay.value = settings.runningDisplay;
optManual.checked = settings.manualEntry;
optShowMo3.checked = settings.showMo3;
optShowAo50.checked = settings.showAo50;
optShowAo100.checked = settings.showAo100;
applyStatCols();
applyTheme();
applyTimerFont();
applyManualMode();
hintEl.textContent = idleHintText();

settingsToggle.addEventListener("click", () => {
  settingsPanel.hidden = false;
  settingsToggle.blur();
});

settingsClose.addEventListener("click", closeSettings);
settingsPanel.addEventListener("click", (e) => {
  if (e.target === settingsPanel) closeSettings();
});

optHideUI.addEventListener("change", () => {
  settings.hideUI = optHideUI.checked;
  saveSettings();
});

optInspection.addEventListener("change", () => {
  settings.inspection = optInspection.checked;
  saveSettings();
  if (state === STATE.IDLE) hintEl.textContent = idleHintText();
});

optRunningDisplay.addEventListener("change", () => {
  settings.runningDisplay = optRunningDisplay.value;
  saveSettings();
});

optTimerFont.addEventListener("change", () => {
  settings.timerFont = optTimerFont.value;
  saveSettings();
  applyTimerFont();
});

optManual.addEventListener("change", () => {
  settings.manualEntry = optManual.checked;
  saveSettings();
  applyManualMode();
});

optShowMo3.addEventListener("change", () => {
  settings.showMo3 = optShowMo3.checked;
  saveSettings();
  applyStatCols();
});

themeSelect.addEventListener("change", () => {
  settings.theme = themeSelect.value;
  saveSettings();
  applyTheme();
});

accentColor.addEventListener("input", () => {
  settings.theme = "custom";
  settings.customAccent = accentColor.value;
  saveSettings();
  applyTheme();
});

optShowAo50.addEventListener("change", () => {
  settings.showAo50 = optShowAo50.checked;
  saveSettings();
  applyStatCols();
});

optShowAo100.addEventListener("change", () => {
  settings.showAo100 = optShowAo100.checked;
  saveSettings();
  applyStatCols();
});

// ---------- Init ----------
renderSessions();
newScramble();
render();
