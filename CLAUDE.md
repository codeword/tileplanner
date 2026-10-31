# Merola Metro Rhombus Tile Planner

Web app for planning a tile wall built from Merola Tile "Metro Rhombus" mosaic sheets (tumbling-blocks / isometric cube pattern). Source is ES modules in `src/`; `tile-planner.html` is a single-file build of them that opens by double-click.

## Working on it
- **Edit `src/`, never `tile-planner.html`.** After changing `src/`, run `python3 build.py` (stdlib only, no Node needed) and commit both.
- Develop by serving the repo (`python3 -m http.server`) and opening `/src/index.html`. Module files don't load from `file://`; the built file does, because its code is one inline `<script type="module">`.
- `build.py` concatenates modules in dependency order into one scope (drops imports, strips `export`). It fails on duplicate top-level names across modules and on names used from another module without an import (those work in the bundle but break `src/`; template-literal text is ignored by that check, `${}` expressions aren't). Only `export function|const|let|class` and `import { a, b } from './x.js'` are supported.

## Layout (`src/`)
| Module | Contents |
|---|---|
| `constants.js` | Sheet geometry, layout, navigation, takeoff constants, `CONFIG_VERSION` |
| `noise.js` | `hashScatter`, `hash2D`, `smoothNoise`, `mod` |
| `fades.js` | `FADES` registry, `BOUNDARY_OCTAVES`, `getNormalizedZones`, `assignColors` |
| `geometry.js` | `floorRowIndex`, `tileNumber`, `overrideKey`, wall/void clipping, `buildSheetGrid`, `markCutTiles`, `isPointInPolygon` |
| `inventory.js` | `computeInventory`, `settleColor` |
| `inventory-image.js` | `drawInventoryImage`, `inventoryImageSize`, `withReserve` (saved-walls inventory PNG) |
| `zip.js` | `makeZip` (stored-entry zip writer, no library) |
| `state.js` | `DEFAULTS`, `LIMITS`, `normalizeState`, voids/overrides sanitizing, `WALL_KEYS` / `wallSettings`, `state`, `setState`, `onStateChange` |
| `view.js` | `computeView`, `toScreen`, `toWall` |
| `renderer.js` | `renderCanvas`, `drawSpecCard`, label helpers |
| `config.js` | `configFromProject`, `projectFromConfig` (pure; any version → shared colors + saved walls + warnings), `sanitizeWallName` |
| `app.js` | `computeWall` (grid → cut tiles → colors → inventory), render loop (`scheduleRender`, `renderTiling`, `last*`, `nav`), PNG export (`renderExportCanvas`, `canvasToBlob`, `downloadBlob`, `exportFileName`, `fileSafe`) |
| `ui/canvases.js` | Plan and HUD canvases |
| `ui/controls.js` | `syncControls`, `bindInputs`, void list |
| `ui/pointer.js` | Click/drag/pan/zoom, cursor HUD |
| `ui/takeoff.js` | Dashboard bar, saved walls (rename, drag reorder, `getSavedWalls` / `setSavedWalls`, `pooledTakeoff`) |
| `ui/export.js` | Saved-walls zip export and inventory PNG download |
| `ui/config-modal.js` | Config JSON modal |
| `main.js` | Wires `onStateChange(syncControls)` and `onStateChange(scheduleRender)`, binds inputs, `window.planner` |

The pipeline modules (`noise`, `fades`, `geometry`, `inventory`, `inventory-image`, `zip`, `view`, `config`, `renderer`) don't touch the DOM or app state; `state.js` only depends on `fades` (for the algorithm list) and `geometry`. `app.js` ↔ `ui/pointer.js` and `app.js` ↔ `ui/takeoff.js` import each other, which is fine because neither uses the other at load time.

## What it does
- Sheet model: 10.5″ W × 12.13″ H, 3 cubes × 4 rows = 36 rhombus tiles per sheet. The order is in sheets (no boxes or waste factor).
- Inputs: wall width, total height, tiled height (paint above), two tile colors, paint color, grout color.
- Sidebar order: Wall Dimensions (width, total height and tiled height as three number fields; Enter/blur re-shows the clamped value), Voids (fixed at two rows, 166px, always-visible scrollbar via `.void-list`), Color Specifications, Tiled Sub-Zones, Corruption Aesthetics, Saved Walls (grows with its list; the sidebar scrolls).
- Tiled area split into Color 1 (top) / transition / Color 2 (bottom) bands. Sidebar order: Color 1 % (derived), Color 2 % slider (`floorPercent`, the bottom band), transition slider, rogue noise slider. The boundary wanders horizontally via 4-octave seeded noise.
- Five fade styles: lightning (jagged teeth), Bayer 4×4 dither, cellular clusters, glitch scanlines, blue-noise dissolve. Plus "rogue noise" that scatters opposite-color tiles outside the transition band.
- Deterministic: all randomness from seeded hashes (`currentSeed`).
- Takeoff: each sheet labeled by majority color (tie → C2, the bottom color). Minority tiles = hand-swaps. Spares and swap leftovers are settled into sheets to order (see Takeoff).
- Extras: click a tile to flip it (manualOverrides), invert colors per wall, save multiple named walls for a combined order, JSON config export/import, PNG download.

## State model (done: refactor step 1)
- One `state` object, defaults only in `DEFAULTS`, ranges in `LIMITS`. All changes go through `setState(patch)` → `normalizeState` (clamps, validates, caps tiled height at total height) → `syncControls()` → `scheduleRender()`. HTML controls carry no default values.
- Tiles carry `baseColorIdx` / `colorIdx`: constants `C1 = 0` (top color) and `C2 = 1` (bottom color). Hex is looked up from `palette` only when drawing. Sheet outlines: orange = C1 majority, blue = C2.
- **Sheet/tile numbers (both 0-based).** Sheet badges count from 0, top-left first. Tiles are numbered 0–35 per sheet (`tileNumber`), row by row from the top; in each row the three tops come first (left to right), then left, right of cube 1, 2, 3. So tile 0 = row 1 cube 1 top, tile 35 = row 4 cube 3 right. The cursor HUD shows `Sheet N, tile M`.
- `manualOverrides` in state maps `overrideKey(sRow, sCol, n)` = `${sRow}_${sCol}_t${n}` (sheet grid position from the tile line and the left, plus tile number) → the color shown, 0|1. Grid positions don't change when badges are renumbered (wall resized, sheet culled by a void), so flips stay on their tiles; the config nests them as `{ sheet badge: { tile number: color index } }` using the wall's current badges (`overridesBySheet`), leaving out flips on sheets with no badge. Flips follow their sheet, which hangs from the tile line, so changing the tiled height moves them with it. The pattern hashes use `floorRow` (counted up from the floor, `floorRowIndex`, since the bug 2–4 fixes); `row` (from the top) is only the layout loop index. Row stagger is fixed per sheet: rows 1 and 3 of each sheet (from the top) sit half a cube (`CUBE_DX_INCHES`, 1.75″) right of rows 2 and 4.
- Config JSON is now `version: 8` (v8 adds `measureOnly` on voids; absent = cutout; see "Invert and saved walls"; v7 nests overrides by sheet badge and tile number, and v2–v6 `${col}_f${tierAboveFloor}_${type}` keys are converted to the tile they land on in the imported wall, unmatched ones reported; v3 made `colors.color1` = top, `tiledSubZones.color2Percent` = bottom band). In v1/v2, color1 and `color1Percent` were the bottom color; those are mapped on import, v2 override indices are flipped, and v1 hex/row-from-top overrides are converted. Rejected or clamped fields are listed in the modal instead of being applied silently.

## Render pipeline (done: refactor step 2)
`renderTiling()` runs `buildSheetGrid(state)` → `assignColors(grid, state)` → `computeInventory(grid)` → `computeView(state, viewport, dpr)` → `renderCanvas(ctx, view, grid, inventory, state)` → `renderDashboard(inventory)`, and keeps `lastGrid` / `lastInventory` / `lastView`.
- Geometry is in **wall inches**: origin at the floor line on the left wall edge, y up. Tiles have `x`, `y` (center), `points`, `col`, `row` (from the top), `floorRow` (used by the pattern hashes), `tileNumber`, `overrideKey`; `sheetId` is the badge number.
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
7. ~~Saved walls~~ (done; reworked in "Invert and saved walls"). Load, rename, ✕ and drag are handled by delegated listeners (`bindSavedWallsList`). Import is split into `projectFromConfig(parsed, base)` (pure) and `applyConfigJson` (modal). Saved walls live in memory and in the config JSON only.

Constraint: for the same seed and settings, the refactored version should render the identical pattern, so before/after can be compared.

## Voids, cut tiles and takeoff (done: plan step 4)
From a feature audit written with Gemini, rebuilt on the state model. All coordinates are inches from the floor at the left wall edge, x right, y up.

**Voids.** `state.voids` = `[{ id, x, y, w, h }]`, where (x, y) is the bottom-left corner.
- Drawing: a plain drag draws one (cyan dashed preview with live label on the HUD canvas). It snaps to 1/16″ (`snapInches`) and is clamped to the wall from floor to ceiling, so it can cross the tile line. Escape cancels.
- Look: dashed fuchsia outline, no fill, with a label `W″ × H″ @ (X″, Y″)` (`formatLength`: exact decimals, trailing zeros dropped). A red × badge (on screen only, hit-tested via `view.voidBadges`) deletes the void.
- Sidebar "Voids" list: editable W/H/X/Y. Typing updates live; `change` snaps (W/H at least 1/16″) and commits.
- **Measure only** (`measureOnly: true`, a checkbox per row): a measurement, not a cutout. `usableCells` ignores it, so no tiles are cut and the takeoff is unchanged. It's drawn in amber (`MEASURE_STROKE`) with the same label and × badge, the row reads "Measure N", it isn't filled or drawn in the clean mockup, and saved-wall summaries count only real voids. Trimming to the wall still applies. Drawn voids start as cutouts.
- `sanitizeVoids` (in `normalizeState`) only validates and assigns ids. Trimming to the wall happens on commit (`commitVoidClip`: wall width/height `change`, void field `change`, JSON import). Until then the canvas draws voids clipped to the wall as a preview. A void trimmed to nothing is deleted.
- Re-Seed keeps voids; Reset clears them. Config `version: 4` adds `voids: [{ x, y, width, height }]` (older configs import with none); voids that get dropped or trimmed on import are reported.

**Cut tiles** (`markCutTiles`, between grid build and color assignment). The usable wall (wall minus voids) is split into disjoint rectangles along every void edge (`usableCells`). A tile is cut if its clipped area against all of them is zero (`clippedArea`, Sutherland–Hodgman). This is exact, so overlapping voids act as one region and narrow gaps between voids keep their tiles usable.
- Cut tiles keep their procedural color but are drawn as dotted outlines with no fill, under the usable tiles. They can't be click-flipped. Outside the wall gets a light grey wash.
- Sheets whose tiles are all cut are removed. The rest are renumbered 1..n, keep their full outline, and have the badge centered on the whole sheet.

**Takeoff** (`computeInventory`).
- Majority color and hand-swaps count usable tiles only (tie → C2). Cut tiles on a kept sheet are spares of its majority color (`sheet.cutCount`).
- Per color, `settleColor(sheets, balance)` in `inventory.js`: balance = spares + tiles pulled out of that color's sheets for the other color's swaps − swaps needing that color (balanceC1 = spareC1 + swappedC2 − swappedC1). A shortfall buys ceil(−balance / 36) extra sheets; a surplus takes floor(balance / 36) sheets off the order. Sheets to order (`buyC1` / `buyC2`, total `buy`) = majority sheets + extra − sheets from spares, and the leftover is always 0–35 tiles. Boxes and the 10% waste factor were removed.
- The dashboard bar, spec card and saved-wall rows show sheets to order and tiles left per color (net only), plus the sheets on the wall. Spares from cuts are still listed.
- The saved-walls Total Takeoff is pooled: sheets and balances are summed over the saved walls (not the unsaved current wall) and settled once, so one wall's spares and pulled-out tiles cover another's swaps. It shows sheets to order per color, the pooled leftover tiles and the sheets on the walls. Per-wall rows still show each wall settled on its own.

**Spec card** (`drawSpecCard`): wall name, wall/grid line, fade label and seed, sub-zones (top/transition/bottom % as used by `getNormalizedZones`, with the color in each band, rogue % and invert on/off), one row per color (swatch, hex, sheets to order, tiles left), swaps, spares and the order in sheets. The fade and zones lines pass `maxWidth` to `fillText` so rare long values squeeze instead of overflowing. It is laid out at 480×166 and scaled down uniformly to fit. The name is that of the linked saved wall, the one last saved, loaded or updated (`currentWall` in `ui/takeoff.js` returns `{ name, unsaved }` or null). Once the wall being edited differs from it in any `WALL_KEYS` value, an amber " (unsaved)" follows the name; with no linked wall the card shows a grey "Unsaved wall". Renaming updates the card. `renderCanvas` takes it as its last argument, so the PNG export includes it. `computeView` always places it in a strip added below the bottom margin, left-aligned with the content (`view.card`), never on the wall; its size is in CSS px, so zoom doesn't scale it.

**PNG export**: the fitted plan at 4×. No × badges, HUD or drag preview. Sheet outlines/badges only if the overlay is on. Everything off the wall is transparent (`transparent = !view.onScreen` in `renderCanvas`: no canvas background, margin paint or wash), and in the clean mockup voids are cleared with `destination-out`. The card's own fill is 92% opaque. The file is named `<wall name>_<W>x<H>_<overlay|mockup>.png` (`exportFileName` in `app.js`): the linked saved wall's name (kept with unsaved changes) or `unsaved-wall`, made file-safe (`fileSafe`: runs of other characters → one `-`, so "Bathroom - Floor" → `Bathroom-Floor`; non-ASCII letters are dropped).

**Saved-walls export** (`ui/export.js`; buttons under Saved Walls, disabled with no saved walls).
- **Export ZIP** → `saved-walls_<YYYY-MM-DD>.zip`: for each saved wall, `<name>_<W>x<H>_overlay.png` and `_mockup.png` (rendered with `renderExportCanvas` from the wall's settings in the current shared colors, card named after the wall, no unsaved mark), plus `inventory.png`. Colliding names get `-2`, `-3`. `makeZip` stores entries uncompressed (PNGs are already compressed) with CRC-32 and UTF-8 names; checked with `unzip -t` and Python `zipfile`. Ten walls ≈ 30 MB.
- **Inventory PNG** → `inventory_<YYYY-MM-DD>.png`, the same image on its own. `drawInventoryImage` (760 CSS px wide at 2×, dark like the spec card): date and colors; one row per wall (name, W × H (tiled), sheets on wall, sheets and leftover tiles per color, each wall settled on its own); the pooled total (`pooledTakeoff`, same numbers as the sidebar); and a reserve table with the pooled minimum, +5% and +10% per color and total (`withReserve`: ceil(min × (1 + level)) per color).
- The current unsaved wall isn't included.

**Clean mockup (Sheet Overlay off).** `renderCanvas` drops the planning marks: sheet outlines/badges, cut-tile ghosts, the outside-wall wash, red wall lines and labels, and void outlines, labels and × badges (`drawPlanningMarks` only runs with the overlay on, so `view.voidBadges` stays empty). Usable tiles are clipped to the wall, and voids (clipped to the wall) are filled with `CANVAS_BG` over them, so tiles show how they'd be cut. The margins are `CANVAS_BG` too, and the on-screen content border is skipped. The spec card stays. The PNG export follows the toggle.

**Still open (defaults chosen):** label units (now exact decimals like 36.0625″; fractions like 36 1/16″ would be a change to `formatLength` only; the HUD uses `formatInches`, 1 decimal); the exact export resolution; drag-to-paint (would need a modifier key, since plain drag draws voids).

## Invert and saved walls (config v6)
- **Invert** (`state.invertColors`, per wall; sidebar "Invert: Color 2 on top"): the same pattern repainted with the colors swapped, applied in `assignColors` after the fade and rogue noise and before overrides. The bands and their sliders stay top/bottom (`floorPercent` is the bottom band, whichever color fills it); the labels say which color is where. Overrides store the color shown, so the toggle swaps them too and hand flips stay flips.
- **Shared vs per wall.** Tile/paint/grout colors and the sheet overlay are shared; `WALL_KEYS` (dimensions, zones, fade, seed, invert, overrides, voids) are per wall. A saved wall is `{ name, settings: wallSettings(state) }`. Load applies only its settings, so it shows in the current colors. Counts are recomputed with `computeWall` and cached per settings object.
- **Linked wall:** Save Wall adds a new entry named `Wall N` (N = list length + 1) and links it; Load links that entry. The linked entry has a cyan border, an "(unsaved)" tag when changed, and an Update button (enabled only when changed) that overwrites its settings in place, keeping name and position. Reset, removing the entry and applying a config unlink it. `syncSavedWallsList` (an `onStateChange` listener) re-renders the list only when the unsaved mark flips.
- **List UI:** click a name to rename it (Enter/blur saves, Escape cancels; trimmed, max 60 chars, HTML-escaped). Drag the ⋮⋮ handle to reorder (pointer events, so touch works).
- **Config v6/v7:** `{ version, colors: { color1, color2, paintedWall, grout }, walls: [{ name, invertColors, physicalWallInches, tiledSubZones: { bottomPercent, transitionPercent }, algorithm, manualOverrides: { "1": { "35": 0, "13": 1 } }, voids }] }` (v7: sheet badge (from 0) → tile number (0–35) → color index shown, 0 = Color 1; Invert swaps the values). Only saved walls are in it, not the wall being edited. Applying a config replaces the saved list and the colors and resets the wall being edited to `DEFAULTS`. A v1–v5 config becomes one saved wall named "Imported wall". Warnings are prefixed with the wall name.

## Takeoff accuracy improvements
- Done: swap supply with spares, the cut-tile rule, spares settled into whole sheets per wall, and pooling across saved walls. Tiles that cross a void or wall edge count as installed (one full tile each); their offcuts aren't credited, and they aren't counted anywhere yet.
- Make sheet alignment/left offset adjustable (currently hard-coded at 1.875″).
- Grout joint isn't modeled. Verify Merola's published sheet dimensions.

## Debugging aids to add
- Debug overlay: boundary curve, transition band edges, tile (col,row,type) labels.
- Hover inspector: tile ID, sheet #, distance to boundary, reason for color (base/tooth/rogue/override).
- Snapshot tests of the pure stages using fixed seeds.

## UX backlog
- High value: printable per-sheet swap map; undo/redo (including void edits); confirm before Re-Seed wipes manual edits; editable seed field with history; autosave to localStorage and URL-hash sharing; saved walls that persist across reloads (they can be reopened, named and reordered, but live in memory and the config JSON only).
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
