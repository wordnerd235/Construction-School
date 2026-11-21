# Construction School: project notes for Claude

A kid's rock-grinding simulator built for Caleb's nephew. The nephew asked for a game called "Construction School" about using tools, with a **rock grinder** and a **little arm** that picks up rocks and drops them in. Caleb wants it reasonably realistic. Main target device: **iPad (Safari)**, plus desktop browsers. It will be hosted on **GitHub Pages**.

## Hard requirements
- **No build step, no dependencies.** Plain HTML/CSS/JS served as static files. `index.html` must work from GitHub Pages and from a double-click (file://).
- **iPad first.** Touch with Pointer Events. No pinch, scroll or double-tap zoom. Buttons at least ~44px. Two-handed play (drag on the canvas while tapping GRAB) must keep working. Audio unlocks on the first touch (`ac()`).
- Kid-friendly. A young child should be able to play without reading much. Keep text short and controls big.
- Keep the realism (see below). Caleb is a process-safety engineer, and the safety features (startup horn, beacon, interlock trip, coast-down) are on purpose.

## Files
- `index.html`: markup for the HUD overlays (job card, buttons, modals). The game draws on `<canvas id="c">`.
- `css/style.css`: HUD and modal styling.
- `js/game.js`: everything else, in one IIFE-style block. Sections are marked with `/* ===== name ===== */` banners: constants, state, world colliders, canvas sizing, audio, toast, rocks, physics, arm, power, truck, particles and gems, update, HUD, modals, input, drawing helpers, loop.
- `tests/smoke_test.py`: Playwright smoke test that drives a full load cycle at iPad size and saves screenshots.

## World and coordinates
- Fixed world of **1100 × 620** units with the ground at `GY = 560`. It's scaled to fit the screen with letterboxing (`resize()`). Sky and ground are drawn past the world edges so letterbox bars never show.
- `toWorld(clientX, clientY)` converts screen coordinates to world coordinates.
- Layout from left to right:
  - dump-truck lane and rock pile (x ≈ 40–390)
  - excavator base (shoulder `S` = 430,455)
  - jaw crusher (x 588–830)
  - conveyor (`belt` segment 648,500 → 880,407)
  - feed funnel with a grate (x 874–952, y 421)
  - ball mill (`M` = 960,486, R 60)
  - dust bin (x 1030–1096)

## Simulation model (realism notes)
- **Physics:** a custom 2D engine with circle rocks against line segments and one static circle (the mill). There are 4 substeps per frame and 2 solver iterations. Rock-pair position correction is capped at 3 per iteration to stop pieces from tunneling.
- **Jaw crusher:** `jawL` is fixed. `jawR` swings with `crPhase`. The bottom gap varies between about 17 and 27.
  - Jaw collisions are **one-sided**: they always push rocks into the chamber (`collideJaw`), so new pieces can't escape out the back.
  - A rock is "squeezed" when it touches both jaws, directly or through a neighbouring rock (`tL/tR/nL/nR` flags). Neighbour contact counts so two rocks can't bridge the V and jam it.
  - Squeezed rocks lose HP mostly on the closing stroke. HP = hardness × r × 1.25.
  - At 0 HP a rock splits into 2–3 pieces (area mostly kept). Pieces below `MIN_SPLIT_R` don't split again. Pieces smaller than the gap fall through onto the belt.
- **Conveyor:** touching the belt segment pulls a rock's tangential velocity toward `beltSpeed`.
- **Ball mill:** only rocks with r ≤ `MILL_MAX_R` pass the grate. They're absorbed into `mill.load` (kg = r²/16). The mill grinds at 16 kg/s × speed into dust, and that dust is what counts for jobs.
  - Rocks too big for the mill sit on the grate. After about 2.2 s they're sent back to the pile with a "too big" message.
- **Unreachable rocks** that sit still for 2.2 s get dropped back onto the pile.
- **Machine speed** `sp` ramps up and coasts down, so there's flywheel inertia. Crushing needs `sp > 0.4`.
- **Power states:** `off → warn` (1.4 s horn and flashing beacon) → `on`. `tripped` happens when the claw enters the jaw zone while running (`clawInJaws`, below y 325, between the jaws). START is refused while the claw is still inside.

## Arm
- **Touch mode:** the finger sets `arm.tgt`. A commanded point `arm.cmd` moves toward it in a straight line (max 420/s). Two-link IK (`solveIK`, L1 215 and L2 200) runs on `cmd`, with an elbow-up branch and ±30 hysteresis around the shoulder x. Joint angles follow quickly.
  - The straight-line motion matters: joint-space interpolation used to swing the claw through the crusher and trip the interlock by itself.
- **Lever mode:** the hold buttons directly drive the boom angle `lever.t1` and the arm-relative angle `lever.rel`.
- **Claw:** the grab point `arm.G` is the tip + `CLAW`. GRAB picks the nearest rock within r+16. Releasing the rock passes on the claw's velocity, so throwing works.
- The open claw deliberately does **not** push rocks. An earlier version did, and rocks squirted away when you tried to grab them.

## Game layer
- `JOBS[]` has 5 jobs (dust targets or a crystal count), a weighted rock-type mix per job, and a badge each. After the last job it's `FREE` play.
- Geodes release a crystal the first time they split. The crystal flies up to the 💎 counter.
- Progress is saved to `localStorage` under `construction-school-v1`, inside try/catch.
- The truck arrives whenever fewer than 2 big rocks are left outside the crusher. It can also be called with 🚚.

## Testing
- Quick check: open `index.html` in a browser. For a real touch test, push to GitHub Pages and open it on the iPad.
- Smoke test: `pip install playwright && playwright install chromium`, then `python tests/smoke_test.py`. It uses the `window.__cs` hook at the bottom of `game.js`.
- After changing the physics, the crusher, the conveyor or the arm, run the smoke test and check that `jobDust` rises above 0 and power isn't `tripped`.

## Ideas not built yet
- Crusher gap setting (closed-side setting): a tighter gap gives finer gravel but works slower.
- More machines: bulldozer, cement mixer that uses the dust, screen/sifter.
- Waiting on the nephew's feedback after he plays.
