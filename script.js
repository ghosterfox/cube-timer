// ---------- WCA-compliant 3x3 scramble generator ----------
// Uses a random-move generator with WCA-standard constraints:
//  - 20 moves (standard 3x3 scramble length)
//  - no two consecutive moves on the same face
//  - no move on a face when the two previous moves were on the same axis
//    (prevents redundant U D U / R L R sequences)
const FACES = ["U", "D", "L", "R", "F", "B"];
const MODIFIERS = ["", "'", "2"]; // clockwise, counter-clockwise, double
const AXIS = { U: 0, D: 0, L: 1, R: 1, F: 2, B: 2 };
const SCRAMBLE_LENGTH = 20;

function generateScramble() {
  const moves = [];
  let prevFace = null;
  let prevPrevFace = null;

  while (moves.length < SCRAMBLE_LENGTH) {
    const face = FACES[Math.floor(Math.random() * FACES.length)];

    // Skip same face as the immediately previous move.
    if (face === prevFace) continue;

    // Skip if the last two moves were on the same axis as this one.
    if (
      prevFace !== null &&
      prevPrevFace !== null &&
      AXIS[face] === AXIS[prevFace] &&
      AXIS[face] === AXIS[prevPrevFace]
    ) {
      continue;
    }

    const modifier = MODIFIERS[Math.floor(Math.random() * MODIFIERS.length)];
    moves.push(face + modifier);
    prevPrevFace = prevFace;
    prevFace = face;
  }

  return moves;
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

// ---------- DOM references ----------
const scrambleEl = document.getElementById("scramble");
const timerEl = document.getElementById("timer");
const hintEl = document.getElementById("hint");
const newScrambleBtn = document.getElementById("new-scramble");
const countEl = document.getElementById("stat-count");
const bestEl = document.getElementById("stat-best");
const ao5El = document.getElementById("stat-ao5");
const ao12El = document.getElementById("stat-ao12");

// ---------- State ----------
// "idle"    -> waiting to start
// "ready"   -> space held down, timer armed (green)
// "running" -> timer counting
const STATE = { IDLE: "idle", READY: "ready", RUNNING: "running" };
let state = STATE.IDLE;
let startTime = 0;
let rafId = null;
const solves = [];

// ---------- Scramble rendering ----------
function newScramble() {
  const moves = generateScramble();
  scrambleEl.innerHTML = moves
    .map((m) => `<span class="move">${m}</span>`)
    .join(" ");
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
  rafId = requestAnimationFrame(tick);
}

function stopTimer() {
  cancelAnimationFrame(rafId);
  const elapsed = performance.now() - startTime;
  timerEl.textContent = formatTime(elapsed);
  timerEl.classList.remove("running");
  state = STATE.IDLE;
  hintEl.textContent = "Press and hold Space to get ready";
  recordSolve(elapsed);
  newScramble();
}

// ---------- Statistics ----------
function recordSolve(ms) {
  solves.push(ms);
  updateStats();
}

// Average of N per WCA: drop the single best and single worst, mean the rest.
function averageOf(n) {
  if (solves.length < n) return null;
  const window = solves.slice(-n).sort((a, b) => a - b);
  const trimmed = window.slice(1, -1);
  const sum = trimmed.reduce((acc, t) => acc + t, 0);
  return sum / trimmed.length;
}

function updateStats() {
  countEl.textContent = solves.length;
  bestEl.textContent = formatTime(Math.min(...solves));

  const ao5 = averageOf(5);
  ao5El.textContent = ao5 === null ? "—" : formatTime(ao5);

  const ao12 = averageOf(12);
  ao12El.textContent = ao12 === null ? "—" : formatTime(ao12);
}

// ---------- Keyboard handling ----------
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space") return;
  e.preventDefault();
  if (e.repeat) return; // ignore auto-repeat while holding

  if (state === STATE.RUNNING) {
    // Stop the timer.
    stopTimer();
  } else if (state === STATE.IDLE) {
    // Arm the timer: go green.
    state = STATE.READY;
    timerEl.classList.add("ready");
    timerEl.textContent = "0.00";
    hintEl.textContent = "Release to start";
  }
});

document.addEventListener("keyup", (e) => {
  if (e.code !== "Space") return;
  e.preventDefault();

  if (state === STATE.READY) {
    // Release from armed state starts the timer.
    startTimer();
  }
});

newScrambleBtn.addEventListener("click", () => {
  newScramble();
  newScrambleBtn.blur(); // keep Space bound to the timer, not the button
});

// ---------- Init ----------
newScramble();
