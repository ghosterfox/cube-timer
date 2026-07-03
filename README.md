# Cube Timer

A fast, dependency-free speedcubing timer that runs entirely in the browser. Generate scrambles for 10 WCA puzzles, time your solves with the spacebar, track WCA-style statistics, and see a live preview of the scrambled cube — all from three static files with no build step and no backend.

## Features

- **10 puzzles** — 2x2 through 7x7, Pyraminx, Skewb, Megaminx, and Square-1, each with its own saved session.
- **Spacebar timing** — hold `Space` to arm the timer (goes green when ready), release to start, press again to stop, just like a real stackmat workflow.
- **Scramble preview** — cube scrambles render as an unfolded net showing exactly how the puzzle will look. Click the preview (or any solve) to enlarge it in a modal.
- **WCA statistics** — personal best single, current ao5 / ao12, and best-ever ao5 / ao12, computed with the WCA trimmed-average rules (drop best and worst, DNF counts as worst).
- **Penalties** — toggle `+2` or `DNF` on any solve; averages and PBs update accordingly.
- **PB confetti** — a canvas confetti burst fires from the timer whenever you beat your previous best.
- **Focus mode** — optionally hide the interface (and even the ticking timer) during a solve to remove distractions.
- **Persistent history** — solves, settings, and the selected puzzle are saved to `localStorage`, so everything survives a page reload.
- **Deep links** — a URL hash like `#444` opens straight into a specific puzzle.

## Usage

No install, no build. Just open the app:

```bash
# Open directly
open index.html

# …or serve it (recommended so localStorage is scoped to a real origin)
python3 -m http.server 8000
# then visit http://localhost:8000
```

### Timing a solve

1. Pick a puzzle from the dropdown (or use a `#333`-style URL hash).
2. Hold `Space` — the timer turns green when armed.
3. Release to start the clock.
4. Press `Space` again to stop. The solve is recorded and a fresh scramble appears.

### Controls

| Action | How |
| --- | --- |
| Arm / start / stop timer | Hold and release `Space` |
| New scramble | `↻` button next to the timer |
| View / enlarge a scramble | Click the dock preview or any solve in the sidebar |
| Add `+2` or `DNF` penalty | Buttons on each solve in the sidebar |
| Delete a solve | `×` on the solve |
| Clear a session | **Clear** in the sidebar header |
| Options | `⚙` button (top-left) |
| Close the scramble modal | `Esc` or click outside it |

## Project structure

| File | Purpose |
| --- | --- |
| [index.html](index.html) | Markup: sidebar, timer, scramble/preview dock, options panel, modal. |
| [script.js](script.js) | All logic — puzzle definitions, an NxN cube engine, scramble generators, the timer state machine, statistics, penalties, persistence, and the confetti effect. |
| [style.css](style.css) | Dark theme, WCA cube colors, and responsive layout. |

## How it works

The core is a small **NxN cube engine** ([script.js:18](script.js#L18)) that represents a cube as a flat array of sticker letters (faces ordered U, R, F, D, L, B) and applies wide-layer turns by rotating the outer face and cycling the four adjacent strips. Applying a generated scramble to a solved cube yields the exact state drawn in the preview net.

Scramble generation is per-puzzle:

- **3x3** uses the WCA-standard constrained generator (no repeated face, no third move on an already-used axis).
- **Other NxN cubes** use random moves with wide turns and no consecutive same-face moves.
- **Pyraminx, Skewb, Megaminx, and Square-1** each follow their WCA notation and format.

Statistics follow the WCA definition of an average: sort the window, drop the single best and single worst, and mean the rest; two or more DNFs make the average a DNF.

## Notes

- Everything is client-side — there is no server, account, or network request. Clearing browser storage erases your solves.
- The cube engine's correctness was verified offline against a trusted 3x3 reference (3000 random scrambles matched exactly) plus identity checks (`move⁴ = I`, scramble × inverse, `sexy⁶ = I`) for sizes 2–7.
