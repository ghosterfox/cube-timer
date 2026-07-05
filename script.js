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
const PYRA_COLORS = { U: "#12a150", L: "#1466c4", R: "#d1332b", B: "#ffd21a" };
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

function renderPyraminx(state) {
  const h = Math.sqrt(3); // height of a side-2 equilateral triangle
  const P_T = [1, 0], P_BL = [0, h], P_BR = [2, h];
  const M_L = [0.5, h / 2], M_R = [1.5, h / 2], M_B = [1, h];
  // Net = one big triangle split into 4: center face inverted, 3 faces at corners.
  // Corner net-points per face [A, B, C] chosen so shared edges (and colors) align.
  const FP = { U: [M_L, M_R, M_B], L: [P_BR, M_R, M_B], R: [P_BL, M_L, M_B], B: [P_T, M_L, M_R] };
  let polys = "";
  PYRA_FACES.forEach((f, fi) => {
    const [A, B, C] = FP[f];
    for (let li = 0; li < 9; li++) {
      const pts = PYRA_TRIS[li].map(([i, j, k]) =>
        `${((i * A[0] + j * B[0] + k * C[0]) / 3).toFixed(3)},${((i * A[1] + j * B[1] + k * C[1]) / 3).toFixed(3)}`
      ).join(" ");
      polys += `<polygon points="${pts}" fill="${PYRA_COLORS[state[fi * 9 + li]]}" stroke="#0d0b12" stroke-width="0.05" stroke-linejoin="round"/>`;
    }
  });
  return `<div class="pzl-net" style="aspect-ratio:${(2 / h).toFixed(4)}">` +
    `<svg viewBox="-0.07 -0.07 ${(2 + 0.14).toFixed(2)} ${(h + 0.14).toFixed(3)}" preserveAspectRatio="xMidYMid meet">${polys}</svg></div>`;
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
  let polys = "";
  SKEWB_FACES.forEach((f, fi) => {
    const [c, r] = pos[f];
    const ox = c * step, oy = r * step;
    for (let s = 0; s < 5; s++) {
      const pts = shapes[s].map(([x, y]) => `${(ox + x).toFixed(3)},${(oy + y).toFixed(3)}`).join(" ");
      polys += `<polygon points="${pts}" fill="${CUBE_COLORS[state[fi * 5 + s]]}" stroke="#0d0b12" stroke-width="0.055" stroke-linejoin="round"/>`;
    }
  });
  const W = 4 + 3 * gap, H = 3 + 2 * gap;
  return `<div class="pzl-net" style="aspect-ratio:${(W / H).toFixed(4)}">` +
    `<svg viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}" preserveAspectRatio="xMidYMid meet">${polys}</svg></div>`;
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
const bestEl = document.getElementById("stat-best");
const ao5El = document.getElementById("stat-ao5");
const ao12El = document.getElementById("stat-ao12");
const pbAo5El = document.getElementById("stat-pb-ao5");
const pbAo12El = document.getElementById("stat-pb-ao12");
const ao50El = document.getElementById("stat-ao50");
const ao100El = document.getElementById("stat-ao100");
const pbAo50El = document.getElementById("stat-pb-ao50");
const pbAo100El = document.getElementById("stat-pb-ao100");
const statGrid = document.getElementById("stat-grid");
const solveListEl = document.getElementById("solve-list");
const solveEmptyEl = document.getElementById("solve-empty");
const sidebarCountEl = document.getElementById("sidebar-count");
const clearAllBtn = document.getElementById("clear-all");
const previewEl = document.getElementById("preview");
const settingsToggle = document.getElementById("settings-toggle");
const settingsPanel = document.getElementById("settings-panel");
const optHideUI = document.getElementById("opt-hide-ui");
const optHideTimer = document.getElementById("opt-hide-timer");
const optManual = document.getElementById("opt-manual");
const manualInput = document.getElementById("manual-input");
const optShowAo50 = document.getElementById("opt-show-ao50");
const optShowAo100 = document.getElementById("opt-show-ao100");
const settingsClose = document.getElementById("settings-close");
const puzzleSelect = document.getElementById("puzzle-select");
const sessionSelect = document.getElementById("session-select");
const sessionNewBtn = document.getElementById("session-new");
const sessionRenameBtn = document.getElementById("session-rename");
const sessionDeleteBtn = document.getElementById("session-delete");
const scrambleModal = document.getElementById("scramble-modal");
const modalTitle = document.getElementById("modal-title");
const modalScramble = document.getElementById("modal-scramble");
const modalPreview = document.getElementById("modal-preview");
const modalClose = document.getElementById("modal-close");
const dockPreview = document.querySelector(".dock-preview");

// ---------- State ----------
// "idle"    -> waiting to start
// "ready"   -> space held down, timer armed (green)
// "running" -> timer counting
const STATE = { IDLE: "idle", READY: "ready", RUNNING: "running" };
let state = STATE.IDLE;
let startTime = 0;
let rafId = null;
let currentScramble = "";

// ---------- Settings ----------
const SETTINGS_KEY = "cube-timer-settings";
const DEFAULT_SETTINGS = { hideUI: true, hideTimer: false, showAo50: false, showAo100: false, manualEntry: false };
let settings = loadSettings();

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    // Migrate the old combined "showBig" toggle to the two separate ones.
    if (parsed.showBig) { parsed.showAo50 = true; parsed.showAo100 = true; }
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

function loadData() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    // Migrate the old one-session-per-puzzle shape ({ puzzleId: [solves] }).
    for (const pid of Object.keys(data)) {
      if (Array.isArray(data[pid])) {
        data[pid] = { active: "s1", list: [{ id: "s1", name: "Session 1", solves: data[pid] }] };
      }
    }
    return data;
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

// ---------- Scramble modal ----------
function openScrambleModal(title, text) {
  modalTitle.textContent = title;
  modalScramble.innerHTML = scrambleToHTML(text);
  modalPreview.innerHTML = previewForScramble(text, currentPuzzle) || "";
  scrambleModal.hidden = false;
}

function closeScrambleModal() {
  scrambleModal.hidden = true;
}

// ---------- Timer loop ----------
function tick() {
  const elapsed = performance.now() - startTime;
  timerEl.textContent = formatTime(elapsed);
  rafId = requestAnimationFrame(tick);
}

function startTimer() {
  state = STATE.RUNNING;
  timerEl.classList.remove("ready");
  timerEl.classList.add("running");
  hintEl.textContent = "Press Space to stop";
  startTime = performance.now();

  if (settings.hideTimer) {
    // Show the "solve" label instead of the ticking time.
    timerEl.textContent = "solve";
    timerEl.classList.add("solve-label");
  } else {
    rafId = requestAnimationFrame(tick);
  }
}

function stopTimer() {
  cancelAnimationFrame(rafId);
  const elapsed = performance.now() - startTime;
  timerEl.classList.remove("running", "solve-label");
  timerEl.textContent = formatTime(elapsed);
  state = STATE.IDLE;
  document.body.classList.remove("solving");
  hintEl.textContent = "Press and hold Space to get ready";
  recordSolve(elapsed);
  newScramble();
}

// ---------- Solves ----------
function recordSolve(ms) {
  // Best among prior (non-DNF) solves, to detect a new PB.
  const prior = solves.filter((s) => s.penalty !== "DNF").map(effectiveTime);
  const prevBest = prior.length ? Math.min(...prior) : Infinity;
  const hadPrior = solves.length > 0;

  solves.push({ time: ms, penalty: null, scramble: currentScramble, date: new Date().toISOString() });
  saveSolves();
  render();

  // Celebrate beating a previous personal best (not the very first solve).
  if (hadPrior && ms < prevBest) fireConfetti();
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

// Current rolling average of the most recent n solves.
function currentAverage(n) {
  if (solves.length < n) return null;
  return averageOfWindow(solves.slice(-n));
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

// ---------- Rendering ----------
function render() {
  renderStats();
  renderSolveList();
}

function renderStats() {
  // PB single ignores DNF solves entirely.
  const finished = solves.filter((s) => s.penalty !== "DNF").map(effectiveTime);
  bestEl.textContent = finished.length ? formatTime(Math.min(...finished)) : "—";

  ao5El.textContent = formatAverage(currentAverage(5));
  ao12El.textContent = formatAverage(currentAverage(12));
  pbAo5El.textContent = formatAverage(bestAverage(5));
  pbAo12El.textContent = formatAverage(bestAverage(12));
  ao50El.textContent = formatAverage(currentAverage(50));
  ao100El.textContent = formatAverage(currentAverage(100));
  pbAo50El.textContent = formatAverage(bestAverage(50));
  pbAo100El.textContent = formatAverage(bestAverage(100));
}

function renderSolveList() {
  sidebarCountEl.textContent = solves.length;
  solveEmptyEl.style.display = solves.length === 0 ? "block" : "none";
  solveListEl.innerHTML = "";

  const finished = solves.filter((s) => s.penalty !== "DNF").map(effectiveTime);
  const bestTime = finished.length ? Math.min(...finished) : null;

  solves.forEach((solve, index) => {
    const li = document.createElement("li");
    li.className = "solve-item";
    li.title = solve.scramble;

    const num = document.createElement("span");
    num.className = "solve-index";
    num.textContent = `${index + 1}.`;

    const time = document.createElement("span");
    time.className = "solve-time";
    time.textContent = formatSolve(solve);
    if (solve.penalty === "DNF") time.classList.add("dnf");
    else if (bestTime !== null && effectiveTime(solve) === bestTime) {
      time.style.color = "var(--ready)";
    }

    // Clicking the number/time opens the solve's scramble.
    const main = document.createElement("div");
    main.className = "solve-main";
    main.title = "View scramble";
    main.append(num, time);
    main.addEventListener("click", () =>
      openScrambleModal(`Solve ${index + 1} — ${formatSolve(solve)}`, solve.scramble)
    );

    const actions = document.createElement("div");
    actions.className = "solve-actions";

    const plus2 = document.createElement("button");
    plus2.className = "pen" + (solve.penalty === "+2" ? " active" : "");
    plus2.type = "button";
    plus2.textContent = "+2";
    plus2.title = "Toggle +2 penalty";
    plus2.addEventListener("click", () => togglePenalty(index, "+2"));

    const dnf = document.createElement("button");
    dnf.className = "dnf" + (solve.penalty === "DNF" ? " active" : "");
    dnf.type = "button";
    dnf.textContent = "DNF";
    dnf.title = "Toggle DNF";
    dnf.addEventListener("click", () => togglePenalty(index, "DNF"));

    const del = document.createElement("button");
    del.className = "del";
    del.type = "button";
    del.textContent = "×";
    del.title = "Delete solve";
    del.addEventListener("click", () => deleteSolve(index));

    actions.append(plus2, dnf, del);
    li.append(main, actions);
    solveListEl.prepend(li); // newest on top
  });
}

// ---------- Keyboard handling ----------
document.addEventListener("keydown", (e) => {
  // Escape closes an open modal.
  if (e.key === "Escape") {
    if (!scrambleModal.hidden) { closeScrambleModal(); return; }
    if (!settingsPanel.hidden) { closeSettings(); return; }
  }
  if (e.code !== "Space") return;
  if (settings.manualEntry) return; // manual entry uses the text box, not the timer
  const active = document.activeElement;
  if (active && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName)) return;
  if (!scrambleModal.hidden || !settingsPanel.hidden) return; // don't arm behind a modal
  e.preventDefault();
  if (e.repeat) return; // ignore auto-repeat while holding

  if (state === STATE.RUNNING) {
    stopTimer();
  } else if (state === STATE.IDLE) {
    // Arm the timer: go green and enter focus mode.
    state = STATE.READY;
    timerEl.classList.add("ready");
    timerEl.textContent = "0.00";
    hintEl.textContent = "Release to start";
    if (settings.hideUI) document.body.classList.add("solving");
  }
});

document.addEventListener("keyup", (e) => {
  if (e.code !== "Space") return;
  e.preventDefault();

  if (state === STATE.READY) {
    startTimer();
  }
});

// ---------- UI events ----------
newScrambleBtn.addEventListener("click", () => {
  newScramble();
  newScrambleBtn.blur(); // keep Space bound to the timer, not the button
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

// ---------- Options menu (modal) ----------
// Show/hide the Ao50 and Ao100 cards independently, and size the grid to fit.
function applyStatCols() {
  statGrid.classList.toggle("show-ao50", settings.showAo50);
  statGrid.classList.toggle("show-ao100", settings.showAo100);
  const cols = 2 + (settings.showAo50 ? 1 : 0) + (settings.showAo100 ? 1 : 0);
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
optHideTimer.checked = settings.hideTimer;
optManual.checked = settings.manualEntry;
optShowAo50.checked = settings.showAo50;
optShowAo100.checked = settings.showAo100;
applyStatCols();
applyManualMode();

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

optHideTimer.addEventListener("change", () => {
  settings.hideTimer = optHideTimer.checked;
  saveSettings();
});

optManual.addEventListener("change", () => {
  settings.manualEntry = optManual.checked;
  saveSettings();
  applyManualMode();
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
