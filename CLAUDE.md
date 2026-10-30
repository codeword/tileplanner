# Merola Metro Rhombus Tile Planner

Web app for planning a tile wall built from Merola Tile "Metro Rhombus" mosaic sheets (tumbling-blocks / isometric cube pattern). Source is ES modules in `src/`; `tile-planner.html` is a single-file build of them that opens by double-click.

## Working on it
- **Edit `src/`, never `tile-planner.html`.** After changing `src/`, run `python3 build.py` (stdlib only, no Node needed) and commit both.
- Develop by serving the repo (`python3 -m http.server`) and opening `/src/index.html`. Module files don't load from `file://`; the built file does, because its code is one inline `<script type="module">`.
- `build.py` concatenates modules in dependency order into one scope (drops imports, strips `export`). It fails on duplicate top-level names across modules and on names used from another module without an import (those work in the bundle but break `src/`). Only `export function|const|let|class` and `import { a, b } from './x.js'` are supported.

## Layout (`src/`)
| Module | Contents |
|---|---|
| `constants.js` | Sheet geometry, layout, navigation, takeoff constants, `CONFIG_VERSION` |
| `noise.js` | `hashScatter`, `hash2D`, `smoothNoise`, `mod` |
| `fades.js` | `FADES` registry, `BOUNDARY_OCTAVES`, `getNormalizedZones`, `assignColors` |
| `geometry.js` | `floorRowIndex`, `overrideKey`, wall/void clipping, `buildSheetGrid`, `markCutTiles`, `isPointInPolygon` |
| `inventory.js` | `computeInventory` |
| `state.js` | `DEFAULTS`, `LIMITS`, `normalizeState`, voids/overrides sanitizing, `state`, `setState`, `onStateChange` |
| `view.js` | `computeView`, `toScreen`, `toWall` |
| `renderer.js` | `renderCanvas`, `drawSpecCard`, label helpers |
| `config.js` | `configFromState`, `stateFromConfig` (pure; any version → state + warnings) |
| `app.js` | Render loop (`scheduleRender`, `renderTiling`, `last*`, `nav`), PNG export |
| `ui/canvases.js` | Plan and HUD canvases |
| `ui/controls.js` | `syncControls`, `bindInputs`, void list |
| `ui/pointer.js` | Click/drag/pan/zoom, cursor HUD |
| `ui/takeoff.js` | Dashboard bar, saved walls |
| `ui/config-modal.js` | Config JSON modal |
| `main.js` | Wires `onStateChange(syncControls)` and `onStateChange(scheduleRender)`, binds inputs, `window.planner` |

The pipeline modules (`noise`, `fades`, `geometry`, `inventory`, `view`, `config`, `renderer`) don't touch the DOM or app state; `state.js` only depends on `fades` (for the algorithm list) and `geometry`. `app.js` ↔ `ui/pointer.js` and `app.js` ↔ `ui/takeoff.js` import each other, which is fine because neither uses the other at load time.

## What it does
- Sheet model: 10.5″ W × 12.13″ H, 3 cubes × 4 rows = 36 rhombus tiles per sheet, 10 sheets per box.
- Inputs: wall width, total height, tiled height (paint above), two tile colors, paint color, grout color.
- Tiled area split into Color 1 (top) / transition / Color 2 (bottom) bands. Sidebar order: Color 1 % (derived), Color 2 % slider (`floorPercent`, the bottom band), transition slider, rogue noise slider. The boundary wanders horizontally via 4-octave seeded noise.
- Five fade styles: lightning (jagged teeth), Bayer 4×4 dither, cellular clusters, glitch scanlines, blue-noise dissolve. Plus "rogue noise" that scatters opposite-color tiles outside the transition band.
- Deterministic: all randomness from seeded hashes (`currentSeed`).
- Takeoff: each sheet labeled by majority color (tie → C2, the bottom color). Minority tiles = hand-swaps. Box order = ceil(sheets × 1.10 / 10).
- Extras: click a tile to flip it (manualOverrides), save multiple walls for a combined order, JSON config export/import, PNG download.

## State model (done: refactor step 1)
- One `state` object, defaults only in `DEFAULTS`, ranges in `LIMITS`. All changes go through `setState(patch)` → `normalizeState` (clamps, validates, caps tiled height at total height) → `syncControls()` → `scheduleRender()`. HTML controls carry no default values.
- Tiles carry `baseColorIdx` / `colorIdx`: constants `C1 = 0` (top color) and `C2 = 1` (bottom color). Hex is looked up from `palette` only when drawing. Sheet outlines: orange = C1 majority, blue = C2.
- `manualOverrides` maps `${col}_f${tierAboveFloor}_${type}` → 0|1. The tier is counted up from the floor (`floorRowIndex`), so flips stay put when the tiled height changes. The pattern hashes use `floorRow` too (since the bug 2–4 fixes); `row` (from the top) is only the layout loop index. Row stagger is fixed per sheet: rows 1 and 3 of each sheet (from the top) sit half a cube (`CUBE_DX_INCHES`, 1.75″) right of rows 2 and 4.
- Config JSON is now `version: 5` (v3 made `colors.color1` = top, `tiledSubZones.color2Percent` = bottom band). In v1/v2, color1 and `color1Percent` were the bottom color; those are mapped on import, v2 override indices are flipped, and v1 hex/row-from-top overrides are converted. Rejected or clamped fields are listed in the modal instead of being applied silently.

## Render pipeline (done: refactor step 2)
`renderTiling()` runs `buildSheetGrid(state)` → `assignColors(grid, state)` → `computeInventory(grid)` → `computeView(state, viewport, dpr)` → `renderCanvas(ctx, view, grid, inventory, state)` → `renderDashboard(inventory)`, and keeps `lastGrid` / `lastInventory` / `lastView`.
- Geometry is in **wall inches**: origin at the floor line on the left wall edge, y up. Tiles have `x`, `y` (center), `points`, `col`, `row` (from the top), `floorRow` (used by the pattern hashes), `overrideKey`.
- `view` maps inches to CSS px (`scale`, `originX/Y`, the snapped wall rect) plus `dpr`. Use `toScreen(view, x, y)` / `toWall(view, sx, sy)`. `renderCanvas` draws tiles and sheet outlines through one wall-space transform, and text and wall lines in CSS px. Both include `dpr`.
- The canvas backing store is sized by `devicePixelRatio` and re-renders when it changes. PNG export re-renders off-screen at 4× (longest side capped at 8192 px).
- `window.planner` exposes `state`, `lastGrid`, `lastInventory`, `lastView`, `nav`, `setState`, `render` (runs `renderTiling` synchronously; handy when the page is hidden and `requestAnimationFrame` is paused).

## Navigation and pointer (done: plan step 3)
- The page is pinned to the window height (`h-screen`); the sidebar scrolls on its own. `#tileCanvas` fills `#canvasArea`, and `#hudCanvas` sits on top of it (pointer-events none).
- `computeView(state, area, dpr, nav)`: the fitted scale (clamped 4–18 px/in, `FIT_PADDING_PX` around) × `nav.zoom`, with the content (wall + margins) centered and then shifted by `nav.panX/panY`. Everything outside `view.content` is `CANVAS_BG`, and drawing is clipped to the content. Without `nav` (PNG export) the canvas is exactly the content at the fitted scale, so zoom/pan never affect the export.
- `nav = { zoom, panX, panY }` is view-only (not in state or config). Zoom is 0.5–12× the fitted scale.
- `renderTiling()` rebuilds grid/colors/inventory only when `state` changes (identity check against `lastState`); pan, zoom and resize just redraw.
- Pointer: a press that moves < 3px (`DRAG_THRESHOLD_PX`) is a click and flips the tile under it (`flipTileAt`). Shift+drag pans. A plain drag currently does nothing; it's reserved for drawing voids. Wheel zooms around the cursor (`zoomAt` keeps that wall point fixed); trackpad pinch arrives as ctrl+wheel. Zoom buttons: −, +, Fit.
- HUD (`drawHud`, on `#hudCanvas`): while hovering over the content and not dragging, shows `X: …″, Y: …″` (wall inches, `formatInches`, 1 decimal) next to the cursor, flipped away from canvas edges, with dashed guides to the floor line and the left wall edge.
- Verifying refactors: compare against the previous version, scenario by scenario, on tile pattern (sheet, col/row/type, color index, center to 1e-5″) and takeoff numbers, which must match exactly. The step-2 transform shifts anti-aliasing on some tile edges (≤ 10/255 per channel), so exact pixel equality is no longer the bar.

## Known bugs (fix first)
1. ~~The Sheet Overlay `<button>` wraps a checkbox~~ (fixed: it's a `<label>` now).
2. ~~`hash2D` float multiply~~ (fixed: `Math.imul`).
3. ~~Sheet row count used 12.13″~~ (fixed: rows = ceil(tiled height / `SHEET_DRAWN_HEIGHT_INCHES`); e.g. a 48.5″ tiled height used to leave a ~0.002″ untiled sliver at the floor). `SHEET_HEIGHT_INCHES` is kept only as the published size.
4. ~~Row parity counted from the top~~ (fixed: every pattern hash uses `floorRow`; Bayer uses `mod()` so it continues below the floor). Raising the tiled height no longer recolors tiles near the floor. Row stagger was briefly tied to `floorRow` too, but that put the wrong row of a sheet on the right for some tiled heights; it's per sheet again (top row right), so an odd change in tiers does shift the floor area half a cube sideways, as it would on the real wall.

Fixes 2–4 changed the pattern for every seed (config `version: 5`; older configs load their settings unchanged but render the new pattern). Pattern comparisons start from this version.

## Refactor plan (agreed direction)
1. ~~Single state object~~ (done)
2. ~~Color indices (0/1) on tiles~~ (done)
3. ~~Pipeline of pure functions~~ (done)
4. ~~Work in inches with one canvas transform~~ (done). Deriving the sheet height from tile geometry is deferred (known bug 3).
5. ~~**Fade algorithm registry**~~ (done). `FADES = { id: { label, params, assign(tile, ctx, params) } }`; `ctx` = `{ dist, transSpan, typeIdx, seed }`, returns C1/C2. `ALGORITHMS` and the `<select>` options come from it. The boundary octaves are `BOUNDARY_OCTAVES`; rogue noise uses `ROGUE_SALT` / `ROGUE_SEED_OFFSET`. Hash salts stay inline in each fade (they only decorrelate streams).
6. ~~Split into ES modules~~ (done; see Layout). `setState` no longer calls the UI directly: listeners registered with `onStateChange` run in order.
7. ~~Saved walls~~ (done): each stores `config: configFromState(state)` plus its counts, and has Load and ✕ buttons handled by one delegated listener (`bindSavedWallsList`). Import is split into `stateFromConfig(parsed, base)` → `{ next, warnings }` (pure) and `applyConfigJson` (modal). Saved walls still live in memory only.

Constraint: for the same seed and settings, the refactored version should render the identical pattern, so before/after can be compared.

## Voids, cut tiles and takeoff (done: plan step 4)
From a feature audit written with Gemini, rebuilt on the state model. All coordinates are inches from the floor at the left wall edge, x right, y up.

**Voids.** `state.voids` = `[{ id, x, y, w, h }]`, where (x, y) is the bottom-left corner.
- Drawing: a plain drag draws one (cyan dashed preview with live label on the HUD canvas). It snaps to 1/16″ (`snapInches`) and is clamped to the wall from floor to ceiling, so it can cross the tile line. Escape cancels.
- Look: dashed fuchsia outline, no fill, with a label `W″ × H″ @ (X″, Y″)` (`formatLength`: exact decimals, trailing zeros dropped). A red × badge (on screen only, hit-tested via `view.voidBadges`) deletes the void.
- Sidebar "Voids" list: editable W/H/X/Y. Typing updates live; `change` snaps (W/H at least 1/16″) and commits.
- `sanitizeVoids` (in `normalizeState`) only validates and assigns ids. Trimming to the wall happens on commit (`commitVoidClip`: wall width/height `change`, void field `change`, JSON import). Until then the canvas draws voids clipped to the wall as a preview. A void trimmed to nothing is deleted.
- Re-Seed keeps voids; Reset clears them. Config `version: 4` adds `voids: [{ x, y, width, height }]` (older configs import with none); voids that get dropped or trimmed on import are reported.

**Cut tiles** (`markCutTiles`, between grid build and color assignment). The usable wall (wall minus voids) is split into disjoint rectangles along every void edge (`usableCells`). A tile is cut if its clipped area against all of them is zero (`clippedArea`, Sutherland–Hodgman). This is exact, so overlapping voids act as one region and narrow gaps between voids keep their tiles usable.
- Cut tiles keep their procedural color but are drawn as dotted outlines with no fill, under the usable tiles. They can't be click-flipped. Outside the wall gets a light grey wash.
- Sheets whose tiles are all cut are removed. The rest are renumbered 1..n, keep their full outline, and have the badge centered on the whole sheet.

**Takeoff** (`computeInventory`).
- Majority color and hand-swaps count usable tiles only (tie → C2). Cut tiles on a kept sheet are spares of its majority color (`sheet.cutCount`).
- Extra C1 sheets = ceil(max(0, swappedC1 − swappedC2 − spareC1) / 36), mirrored for C2. (C1 tiles pulled out of C1 sheets for C2 swaps are C1 supply.)
- Boxes per color: ceil((sheets + extra) × 1.10 / 10). Total = sum.
- The dashboard shows sheets, extra and boxes per color, swaps, spares and the order. Saved walls store extras and total boxes per color.

**Spec card** (`drawSpecCard`): wall/grid line, one row per color (swatch, hex, sheets + extra → boxes), swaps, spares and the order. It is laid out at 480×118 and scaled down uniformly to fit. `computeView` places it in the painted area when that fits at the fitted scale, otherwise in a strip added below the bottom margin (`view.card`); zoom never moves it.

**PNG export**: the fitted plan at 4×. No × badges, HUD or drag preview. Sheet outlines/badges only if the overlay is on.

**Still open (defaults chosen):** label units (now exact decimals like 36.0625″; fractions like 36 1/16″ would be a change to `formatLength` only; the HUD uses `formatInches`, 1 decimal); the exact export resolution; drag-to-paint (would need a modifier key, since plain drag draws voids).

## Takeoff accuracy improvements
- Done in step 4: per-color boxes, swap supply with spares, and the cut-tile rule.
- Make sheet alignment/left offset adjustable (currently hard-coded at 1.875″).
- Grout joint isn't modeled. Verify Merola's published sheet dimensions.

## Debugging aids to add
- Debug overlay: boundary curve, transition band edges, tile (col,row,type) labels.
- Hover inspector: tile ID, sheet #, distance to boundary, reason for color (base/tooth/rogue/override).
- Snapshot tests of the pure stages using fixed seeds.

## UX backlog
- High value: printable per-sheet swap map; undo/redo (including void edits); confirm before Re-Seed wipes manual edits; editable seed field with history; autosave to localStorage and URL-hash sharing; saved walls that persist and can be reopened.
- Deferred: drag-to-paint (not needed yet).
- Polish: hover-highlight sheet; zone bar in actual tile colors; indicate when transition % is clamped; clean preview mode; responsive layout; ft-in and metric display; named walls; label/`for` accessibility and C1/C2 letters on sheet badges.

## Suggested order
1. ~~State object, color indices, clamping, stable override keys~~ (done)
2. ~~Pipeline split, inches geometry, DPR fix, `window.planner`~~ (done)
3. ~~Interaction foundation: pointer handling, zoom/pan, cursor HUD~~ (done)
4. ~~Voids, cut tiles, sheet culling, takeoff math, spec card, clean PNG~~ (done). Output changed on purpose, so later refactors compare against this version.
5. Autosave/URL sharing, undo (covers voids), debug overlay, confirm before Re-Seed.
6. ~~Fade registry, module split~~ (done); per-sheet swap map still to do.

Why features wait until after steps 2–3: they change output on purpose, which ends the before/after pattern check the refactors rely on. They also depend on the inches transform and the pipeline stages.
