// ---------- Theme (shared with the timer page via localStorage settings) ----------
(function applyStoredTheme() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem("cube-timer-settings") || "{}"); } catch { /* ignore */ }
  const root = document.documentElement;
  if (s.surface && s.surface !== "charcoal") root.dataset.surface = s.surface;
  if (s.accent === "custom" && s.customAccent) {
    root.style.setProperty("--ready", s.customAccent);
  } else if (s.accent && s.accent !== "green") {
    root.dataset.accent = s.accent;
  }
})();

// ---------- Shared config ----------
const PUZZLES = [
  { id: "222", name: "2x2" }, { id: "333", name: "3x3" }, { id: "444", name: "4x4" },
  { id: "555", name: "5x5" }, { id: "666", name: "6x6" }, { id: "777", name: "7x7" },
  { id: "pyram", name: "Pyraminx" }, { id: "skewb", name: "Skewb" },
  { id: "mega", name: "Megaminx" }, { id: "sq1", name: "Square-1" },
];
const STORAGE_KEY = "cube-timer-sessions";
const PUZZLE_KEY = "cube-timer-puzzle";

function formatTime(ms) {
  const s = ms / 1000;
  if (s < 60) return s.toFixed(2);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;
}

// Effective time in ms; null for DNF (excluded from analysis).
function effectiveTime(solve) {
  if (solve.penalty === "DNF") return null;
  return solve.time + (solve.penalty === "+2" ? 2000 : 0);
}

// ---------- Data ----------
function loadData() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
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

const allData = loadData();
let currentPuzzleId = (() => {
  const hash = location.hash.replace("#", "");
  if (PUZZLES.some((p) => p.id === hash)) return hash;
  try { return localStorage.getItem(PUZZLE_KEY) || "333"; } catch { return "333"; }
})();
let currentSessionId = null;

const puzzleSelect = document.getElementById("puzzle-select");
const sessionSelect = document.getElementById("session-select");

function puzzleData(pid) {
  const pd = allData[pid];
  if (!pd || !pd.list || !pd.list.length) {
    return { active: "s1", list: [{ id: "s1", name: "Session 1", solves: [] }] };
  }
  return pd;
}

function activeSolves() {
  const pd = puzzleData(currentPuzzleId);
  const s = pd.list.find((x) => x.id === currentSessionId) || pd.list[0];
  return s ? s.solves : [];
}

// ---------- Number helpers ----------
function niceNum(x, round) {
  if (x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const f = x / Math.pow(10, exp);
  let nf;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * Math.pow(10, exp);
}

function axisTicks(min, max, count) {
  const range = niceNum(max - min || 1, false);
  const step = niceNum(range / Math.max(1, count - 1), true);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const out = [];
  for (let v = start; v <= end + step * 1e-6; v += step) out.push(v);
  return { ticks: out, start, end, step };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// ---------- Chart geometry ----------
const W = 820, H = 330;
const M = { l: 62, r: 20, t: 16, b: 32 };
const PW = W - M.l - M.r;
const PH = H - M.t - M.b;

// ---------- KPIs ----------
function renderKPIs(solves) {
  const el = document.getElementById("kpis");
  const times = solves.map(effectiveTime).filter((t) => t != null);
  if (!times.length) { el.innerHTML = ""; return; }
  const best = Math.min(...times);
  const worst = Math.max(...times);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const variance = times.reduce((a, b) => a + (b - mean) ** 2, 0) / times.length;
  const std = Math.sqrt(variance);
  const tiles = [
    { label: "Solves", value: String(solves.length) },
    { label: "Best", value: formatTime(best), accent: true },
    { label: "Mean", value: formatTime(mean) },
    { label: "Worst", value: formatTime(worst) },
    { label: "Std dev", value: formatTime(std) },
  ];
  el.innerHTML = tiles.map((t) =>
    `<div class="kpi"><div class="kpi-label">${t.label}</div>` +
    `<div class="kpi-value${t.accent ? " accent" : ""}">${t.value}</div></div>`
  ).join("");
}

// ---------- Progression chart ----------
function renderProgression(solves) {
  const plot = document.getElementById("prog-plot");
  const pts = [];
  solves.forEach((s) => {
    const t = effectiveTime(s);
    if (t != null) pts.push(t);
  });
  if (pts.length < 2) {
    plot.innerHTML = `<div class="empty">Need at least 2 solves to chart progression.</div>`;
    return;
  }

  // Trailing average of up to 12.
  const trend = pts.map((_, i) => {
    const from = Math.max(0, i - 11);
    const win = pts.slice(from, i + 1);
    return win.reduce((a, b) => a + b, 0) / win.length;
  });

  const all = pts.concat(trend);
  let yMin = Math.min(...all), yMax = Math.max(...all);
  const pad = (yMax - yMin) * 0.12 || yMax * 0.1 || 1;
  yMin = Math.max(0, yMin - pad); yMax += pad;
  const yt = axisTicks(yMin, yMax, 5);
  yMin = yt.start; yMax = yt.end;

  const n = pts.length;
  const x = (i) => M.l + (n === 1 ? PW / 2 : (i / (n - 1)) * PW);
  const y = (v) => M.t + PH - ((v - yMin) / (yMax - yMin)) * PH;

  let svg = "";
  // gridlines + y labels
  for (const tk of yt.ticks) {
    const yy = y(tk).toFixed(1);
    svg += `<line x1="${M.l}" y1="${yy}" x2="${W - M.r}" y2="${yy}" stroke="var(--grid)" stroke-width="1"/>`;
    svg += `<text x="${M.l - 10}" y="${yy}" fill="var(--muted)" font-size="12" font-weight="700" text-anchor="end" dominant-baseline="middle">${formatTime(tk)}</text>`;
  }
  // x labels (a few solve numbers)
  const xStep = Math.max(1, Math.round((n - 1) / 6));
  for (let i = 0; i < n; i += xStep) {
    svg += `<text x="${x(i).toFixed(1)}" y="${H - 10}" fill="var(--muted)" font-size="12" font-weight="700" text-anchor="middle">${i + 1}</text>`;
  }

  // raw line
  const rawPath = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  svg += `<path d="${rawPath}" fill="none" stroke="var(--series-1)" stroke-width="1.5" stroke-opacity="0.55" stroke-linejoin="round"/>`;
  // trend line
  const trPath = trend.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  svg += `<path d="${trPath}" fill="none" stroke="var(--series-2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  // raw dots (only when not too dense)
  if (n <= 80) {
    pts.forEach((v, i) => {
      svg += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" fill="var(--series-1)" stroke="var(--card)" stroke-width="1.5"/>`;
    });
  }
  // direct end-labels
  const lastRaw = pts[n - 1], lastTr = trend[n - 1];
  svg += `<circle cx="${x(n - 1).toFixed(1)}" cy="${y(lastTr).toFixed(1)}" r="3.5" fill="var(--series-2)" stroke="var(--card)" stroke-width="2"/>`;
  svg += `<text x="${(x(n - 1) - 6).toFixed(1)}" y="${(y(lastRaw) - 8).toFixed(1)}" fill="var(--fg)" font-size="12" font-weight="800" text-anchor="end">${formatTime(lastRaw)}</text>`;

  // crosshair + hover targets
  svg += `<line class="xhair" x1="0" y1="${M.t}" x2="0" y2="${M.t + PH}" stroke="var(--axis)" stroke-width="1" opacity="0"/>`;
  svg += `<circle class="xdot" r="4" fill="var(--series-1)" stroke="var(--card)" stroke-width="2" opacity="0"/>`;

  plot.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${svg}</svg>` +
    `<div class="tooltip" id="prog-tip"></div>`;

  // hover
  const svgEl = plot.querySelector("svg");
  const tip = plot.querySelector("#prog-tip");
  const xhair = plot.querySelector(".xhair");
  const xdot = plot.querySelector(".xdot");
  svgEl.addEventListener("mousemove", (e) => {
    const r = svgEl.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    let i = Math.round(((sx - M.l) / PW) * (n - 1));
    i = Math.max(0, Math.min(n - 1, i));
    const px = x(i), py = y(pts[i]);
    xhair.setAttribute("x1", px); xhair.setAttribute("x2", px); xhair.setAttribute("opacity", "1");
    xdot.setAttribute("cx", px); xdot.setAttribute("cy", py); xdot.setAttribute("opacity", "1");
    tip.style.opacity = "1";
    tip.style.left = `${(px / W) * r.width}px`;
    tip.style.top = `${(py / H) * r.height}px`;
    tip.innerHTML = `<span class="t-muted">Solve ${i + 1}</span><br>${formatTime(pts[i])}` +
      `<br><span class="t-muted">avg ${formatTime(trend[i])}</span>`;
  });
  svgEl.addEventListener("mouseleave", () => {
    tip.style.opacity = "0"; xhair.setAttribute("opacity", "0"); xdot.setAttribute("opacity", "0");
  });
}

// ---------- Distribution chart ----------
function renderDistribution(solves) {
  const plot = document.getElementById("dist-plot");
  const times = solves.map(effectiveTime).filter((t) => t != null);
  if (!times.length) {
    plot.innerHTML = `<div class="empty">No solves to show yet.</div>`;
    return;
  }
  const minMs = Math.min(...times), maxMs = Math.max(...times);
  // bucket width in ms, aiming for ~10 buckets
  let bw = niceNum((maxMs - minMs) / 10 || 1000, true);
  bw = Math.max(bw, 10);
  const start = Math.floor(minMs / bw) * bw;
  const nb = Math.max(1, Math.round((maxMs - start) / bw) + 1);
  const counts = new Array(nb).fill(0);
  times.forEach((t) => {
    let b = Math.floor((t - start) / bw);
    b = Math.max(0, Math.min(nb - 1, b));
    counts[b]++;
  });
  const maxCount = Math.max(...counts);
  const yt = axisTicks(0, maxCount, Math.min(5, maxCount + 1));
  const yMax = yt.end || 1;

  const band = PW / nb;
  const gap = 2;
  const x = (b) => M.l + b * band;
  const y = (c) => M.t + PH - (c / yMax) * PH;

  let svg = "";
  for (const tk of yt.ticks) {
    const yy = y(tk).toFixed(1);
    svg += `<line x1="${M.l}" y1="${yy}" x2="${W - M.r}" y2="${yy}" stroke="var(--grid)" stroke-width="1"/>`;
    svg += `<text x="${M.l - 10}" y="${yy}" fill="var(--muted)" font-size="12" font-weight="700" text-anchor="end" dominant-baseline="middle">${tk}</text>`;
  }
  // bars with 4px rounded tops (square base)
  counts.forEach((c, b) => {
    const bx = x(b) + gap / 2;
    const bwPx = band - gap;
    const top = y(c);
    const h = M.t + PH - top;
    if (h <= 0) return;
    const rr = Math.min(4, bwPx / 2, h);
    svg += `<path d="M${bx.toFixed(1)},${(M.t + PH).toFixed(1)} V${(top + rr).toFixed(1)} Q${bx.toFixed(1)},${top.toFixed(1)} ${(bx + rr).toFixed(1)},${top.toFixed(1)} H${(bx + bwPx - rr).toFixed(1)} Q${(bx + bwPx).toFixed(1)},${top.toFixed(1)} ${(bx + bwPx).toFixed(1)},${(top + rr).toFixed(1)} V${(M.t + PH).toFixed(1)} Z" fill="var(--series-1)"/>`;
  });
  // x labels at bucket boundaries (every other if crowded)
  const lblStep = nb > 8 ? 2 : 1;
  for (let b = 0; b <= nb; b += lblStep) {
    svg += `<text x="${x(b).toFixed(1)}" y="${H - 10}" fill="var(--muted)" font-size="11" font-weight="700" text-anchor="middle">${formatTime(start + b * bw)}</text>`;
  }

  plot.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${svg}</svg>` +
    `<div class="tooltip" id="dist-tip"></div>`;

  const svgEl = plot.querySelector("svg");
  const tip = plot.querySelector("#dist-tip");
  svgEl.addEventListener("mousemove", (e) => {
    const r = svgEl.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    let b = Math.floor((sx - M.l) / band);
    if (b < 0 || b >= nb) { tip.style.opacity = "0"; return; }
    tip.style.opacity = "1";
    tip.style.left = `${((x(b) + band / 2) / W) * r.width}px`;
    tip.style.top = `${(y(counts[b]) / H) * r.height}px`;
    const lo = formatTime(start + b * bw), hi = formatTime(start + (b + 1) * bw);
    tip.innerHTML = `<span class="t-muted">${lo}–${hi}</span><br>${counts[b]} solve${counts[b] === 1 ? "" : "s"}`;
  });
  svgEl.addEventListener("mouseleave", () => { tip.style.opacity = "0"; });
}

// ---------- Wiring ----------
function renderSessionOptions() {
  const pd = puzzleData(currentPuzzleId);
  if (!pd.list.some((s) => s.id === currentSessionId)) {
    currentSessionId = (allData[currentPuzzleId] && allData[currentPuzzleId].active) || pd.list[0].id;
    if (!pd.list.some((s) => s.id === currentSessionId)) currentSessionId = pd.list[0].id;
  }
  sessionSelect.innerHTML = pd.list
    .map((s) => `<option value="${s.id}">${esc(s.name)} (${s.solves.length})</option>`)
    .join("");
  sessionSelect.value = currentSessionId;
}

function renderAll() {
  const solves = activeSolves();
  renderKPIs(solves);
  renderProgression(solves);
  renderDistribution(solves);
}

function init() {
  puzzleSelect.innerHTML = PUZZLES.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
  puzzleSelect.value = currentPuzzleId;
  renderSessionOptions();
  renderAll();

  puzzleSelect.addEventListener("change", () => {
    currentPuzzleId = puzzleSelect.value;
    currentSessionId = null;
    renderSessionOptions();
    renderAll();
  });
  sessionSelect.addEventListener("change", () => {
    currentSessionId = sessionSelect.value;
    renderAll();
  });
  window.addEventListener("resize", renderAll);
}

init();
