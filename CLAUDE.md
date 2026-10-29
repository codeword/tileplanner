# Merola Metro Rhombus Tile Planner

Single-file web app (`tile-planner.html`) for planning a tile wall built from Merola Tile "Metro Rhombus" mosaic sheets (tumbling-blocks / isometric cube pattern).

## What it does
- Sheet model: 10.5″ W × 12.13″ H, 3 cubes × 4 rows = 36 rhombus tiles per sheet, 10 sheets per box.
- Inputs: wall width, total height, tiled height (paint above), two tile colors, paint color, grout color.
- Tiled area split into Color 1 (bottom) / transition / Color 2 (top) bands. The boundary wanders horizontally via 4-octave seeded noise.
- Five fade styles: lightning (jagged teeth), Bayer 4×4 dither, cellular clusters, glitch scanlines, blue-noise dissolve. Plus "rogue noise" that scatters opposite-color tiles outside the transition band.
- Deterministic: all randomness from seeded hashes (`currentSeed`).
- Takeoff: each sheet labeled by majority color (tie → C1). Minority tiles = hand-swaps. Box order = ceil(sheets × 1.10 / 10).
- Extras: click a tile to flip it (manualOverrides), save multiple walls for a combined order, JSON config export/import, PNG download.

## State model (done: refactor step 1)
- One `state` object, defaults only in `DEFAULTS`, ranges in `LIMITS`. All changes go through `setState(patch)` → `normalizeState` (clamps, validates, caps tiled height at total height) → `syncControls()` → `scheduleRender()`. HTML controls carry no default values.
- Tiles carry `baseColorIdx` / `colorIdx` (0 = C1, 1 = C2); hex is looked up from `palette` only when drawing.
- `manualOverrides` maps `${col}_f${tierAboveFloor}_${type}` → 0|1. The tier is counted up from the floor (`floorRowIndex`), so flips stay put when the tiled height changes. The pattern hashes still use `row` counted from the top, to keep renders identical.
- Config JSON has `version: 2`. Unversioned (v1) configs are still accepted; their hex/row-from-top overrides are converted. Rejected or clamped fields are listed in the modal instead of being applied silently.

## Known bugs (fix first)
1. `devicePixelRatio` is ignored: blurry on high-DPI screens, and the PNG export isn't actually high-res.
2. The Sheet Overlay `<button>` wraps a checkbox, so only the checkbox itself toggles. Use a `<label>`.
3. `hash2D` uses a float `*` instead of `Math.imul`, losing precision. Fixing it changes every pattern.
4. Row parity (cube x-offset) is taken from the row counted from the top, so changing the tiled height by an odd number of tiers shifts the whole layout half a cube sideways.

## Refactor plan (agreed direction)
1. ~~Single state object~~ (done)
2. ~~Color indices (0/1) on tiles~~ (done)
3. **Pipeline of pure functions** replacing the monolithic `renderTiling()`:
   `buildSheetGrid(state)` → `assignColors(grid, state)` → `computeInventory(colored, state)` → `renderCanvas(...)` → `renderDashboard(inventory)`.
4. **Work in inches**, apply one canvas transform at draw time (handles zoom, DPR, and high-res export). Derive sheet height from tile geometry (currently 12.13 constant vs ~12.12 computed).
5. **Fade algorithm registry** (`FADES = { id: { label, params, assign } }`), building the `<select>` from it. Named params replace magic numbers.
6. Split into ES modules: constants, noise, geometry, fades/*, inventory, state, config, renderer, ui/controls, ui/takeoff.
7. Saved walls should store the inventory object and full config (not values parsed back from DOM text). Use event delegation instead of inline `onclick` and the `window.removeSavedWall` global.

Constraint: for the same seed and settings, the refactored version should render the identical pattern, so before/after can be compared.

## Takeoff accuracy improvements
- Box counts per color, not one total.
- Swap supply: extra C1 sheets = ceil(max(0, swappedC1 − swappedC2) / 36). Mirror for C2. Add to majority sheets before waste.
- Count only tiles whose center is inside the wall (exclude cut-off tiles past the edges and below the floor).
- Make sheet alignment/left offset adjustable (currently hard-coded at 1.875″).
- Grout joint isn't modeled. Verify Merola's published sheet dimensions.

## Debugging aids to add
- Debug overlay: boundary curve, transition band edges, tile (col,row,type) labels.
- Hover inspector: tile ID, sheet #, distance to boundary, reason for color (base/tooth/rogue/override).
- `window.planner = { state, lastGrid, lastInventory }`.
- Snapshot tests of the pure stages using fixed seeds.

## UX backlog
- High value: printable per-sheet swap map; undo/redo and drag-to-paint; confirm before Re-Seed wipes manual edits; editable seed field with history; autosave to localStorage and URL-hash sharing; saved walls that persist and can be reopened.
- Polish: zoom/pan; hover-highlight sheet; zone bar in actual tile colors; indicate when transition % is clamped; clean preview mode; responsive layout; ft-in and metric display; named walls; label/`for` accessibility and C1/C2 letters on sheet badges.

## Suggested order
1. ~~State object, color indices, clamping, stable override keys~~ (done)
2. Pipeline split and inches-based geometry.
3. Takeoff math (per-color boxes, swap supply).
4. Autosave/URL sharing, undo, debug overlay.
5. Fade registry, module split, per-sheet swap map.
