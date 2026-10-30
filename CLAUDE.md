# Merola Metro Rhombus Tile Planner

Single-file web app (`tile-planner.html`) for planning a tile wall built from Merola Tile "Metro Rhombus" mosaic sheets (tumbling-blocks / isometric cube pattern).

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
- `manualOverrides` maps `${col}_f${tierAboveFloor}_${type}` → 0|1. The tier is counted up from the floor (`floorRowIndex`), so flips stay put when the tiled height changes. The pattern hashes still use `row` counted from the top, to keep renders identical.
- Config JSON has `version: 3` (`colors.color1` = top, `tiledSubZones.color2Percent` = bottom band). In v1/v2, color1 and `color1Percent` were the bottom color; those are mapped on import, v2 override indices are flipped, and v1 hex/row-from-top overrides are converted. Rejected or clamped fields are listed in the modal instead of being applied silently.

## Render pipeline (done: refactor step 2)
`renderTiling()` runs `buildSheetGrid(state)` → `assignColors(grid, state)` → `computeInventory(grid)` → `computeView(state, viewport, dpr)` → `renderCanvas(ctx, view, grid, inventory, state)` → `renderDashboard(inventory)`, and keeps `lastGrid` / `lastInventory` / `lastView`.
- Geometry is in **wall inches**: origin at the floor line on the left wall edge, y up. Tiles have `x`, `y` (center), `points`, `col`, `row` (from the top, used by the pattern hashes), `floorRow`, `overrideKey`.
- `view` maps inches to CSS px (`scale`, `originX/Y`, the snapped wall rect) plus `dpr`. Use `toScreen(view, x, y)` / `toWall(view, sx, sy)`. `renderCanvas` draws tiles and sheet outlines through one wall-space transform, and text and wall lines in CSS px. Both include `dpr`.
- The canvas backing store is sized by `devicePixelRatio` and re-renders when it changes. PNG export re-renders off-screen at 4× (longest side capped at 8192 px).
- `window.planner` exposes `state`, `lastGrid`, `lastInventory`, `lastView`, `nav`, `setState`.

## Navigation and pointer (done: plan step 3)
- The page is pinned to the window height (`h-screen`); the sidebar scrolls on its own. `#tileCanvas` fills `#canvasArea`, and `#hudCanvas` sits on top of it (pointer-events none).
- `computeView(state, area, dpr, nav)`: the fitted scale (clamped 4–18 px/in, `FIT_PADDING_PX` around) × `nav.zoom`, with the content (wall + margins) centered and then shifted by `nav.panX/panY`. Everything outside `view.content` is `CANVAS_BG`, and drawing is clipped to the content. Without `nav` (PNG export) the canvas is exactly the content at the fitted scale, so zoom/pan never affect the export.
- `nav = { zoom, panX, panY }` is view-only (not in state or config). Zoom is 0.5–12× the fitted scale.
- `renderTiling()` rebuilds grid/colors/inventory only when `state` changes (identity check against `lastState`); pan, zoom and resize just redraw.
- Pointer: a press that moves < 3px (`DRAG_THRESHOLD_PX`) is a click and flips the tile under it (`flipTileAt`). Shift+drag pans. A plain drag currently does nothing; it's reserved for drawing voids. Wheel zooms around the cursor (`zoomAt` keeps that wall point fixed); trackpad pinch arrives as ctrl+wheel. Zoom buttons: −, +, Fit.
- HUD (`drawHud`, on `#hudCanvas`): while hovering over the content and not dragging, shows `X: …″, Y: …″` (wall inches, `formatInches`, 1 decimal) next to the cursor, flipped away from canvas edges, with dashed guides to the floor line and the left wall edge.
- Verifying refactors: compare against the previous version, scenario by scenario, on tile pattern (sheet, col/row/type, color index, center to 1e-5″) and takeoff numbers, which must match exactly. The step-2 transform shifts anti-aliasing on some tile edges (≤ 10/255 per channel), so exact pixel equality is no longer the bar.

## Known bugs (fix first)
1. The Sheet Overlay `<button>` wraps a checkbox, so only the checkbox itself toggles. Use a `<label>`.
2. `hash2D` uses a float `*` instead of `Math.imul`, losing precision. Fixing it changes every pattern.
3. Sheet row count uses `SHEET_HEIGHT_INCHES` (12.13″) while sheets are drawn `SHEET_DRAWN_HEIGHT_INCHES` (~12.124″) tall. Unifying them can change the row count for some tiled heights, so it changes output.
4. Row parity (cube x-offset) is taken from the row counted from the top, so changing the tiled height by an odd number of tiers shifts the whole layout half a cube sideways.

## Refactor plan (agreed direction)
1. ~~Single state object~~ (done)
2. ~~Color indices (0/1) on tiles~~ (done)
3. ~~Pipeline of pure functions~~ (done)
4. ~~Work in inches with one canvas transform~~ (done). Deriving the sheet height from tile geometry is deferred (known bug 3).
5. **Fade algorithm registry** (`FADES = { id: { label, params, assign } }`), building the `<select>` from it. Named params replace magic numbers.
6. Split into ES modules: constants, noise, geometry, fades/*, inventory, state, config, renderer, ui/controls, ui/takeoff.
7. Saved walls should store the full config (their counts now come from `lastInventory`, not DOM text). Use event delegation instead of inline `onclick` and the `window.removeSavedWall` global.

Constraint: for the same seed and settings, the refactored version should render the identical pattern, so before/after can be compared.

## Planned features: voids, cut tiles, navigation (agreed spec)
Came from a feature audit written with Gemini; rebuilt here on the state model, not ported. All coordinates are inches from the floor at the left wall edge (0″, 0″), x right, y up.

**Void space.** A tile is *cut* if it lies fully inside void space: the union of all void rectangles plus everything outside the wall (past the left/right edges, below the floor). A tile only partly in void space is usable (installed and trimmed). Overlapping voids are allowed; test against the union (check vertices and edge midpoints so L-shapes made from two rectangles work).

**Voids (cutouts).**
- Mouse: movement < 3px between down and up = click (flips a tile). ≥ 3px = drag that creates a void. Shift+drag = pan (see Navigation). While dragging, show a cyan dashed preview with a faint fill.
- Snap to 1/16″. New voids are clamped to the wall (floor to ceiling, so a void can cross the tile line into the paint; only the part below the tile line affects tiles).
- Look: dashed outline plus a centered JetBrains Mono label `W″ × H″ @ (X″, Y″)`, where (X, Y) is the void's bottom-left corner. No fill. A red × badge in the top-right corner deletes it.
- Sidebar list of voids with editable W, H, X and Y fields.
- Stored in state as an array of `{x, y, w, h}` in inches, included in config JSON (bump `version`) and saved walls. Voids survive re-seeds, color changes and height changes.
- When the wall shrinks, stored voids are clipped to the new wall permanently, but only when the edit is committed (blur, Enter, slider release, JSON import). Live typing only previews the clip. A void clipped to zero area is deleted.

**Cut-tile rendering.** Cut tiles are drawn with a dotted outline and no fill, whether they're in a void or outside the wall (this replaces the audit's 80% grey mask). Outside the wall gets a light grey wash so the wall edge stays readable. Usable tiles render normally. Cut tiles can't be click-flipped.

**Sheets and takeoff.**
- A sheet whose 36 tiles are all cut is omitted: not drawn, outlined, numbered or counted.
- Any other sheet keeps its full outline and its badge centered on the whole sheet, and is counted.
- Majority color and hand-swaps use usable tiles only (tie → C2).
- Cut tiles on a kept sheet are spares of that sheet's majority color.
- Swap supply per color: C1 need = swappedC1 (C1 tiles placed into C2 sheets). C1 supply = swappedC2 (C1 tiles pulled out of C1 sheets) + spare C1 tiles. Extra C1 sheets = ceil(max(0, need − supply) / 36). Mirror for C2. Add to the majority-sheet count before the 10% waste.
- Boxes per color: ceil(colorSheets × 1.10 / 10). Dashboard and card show sheets, spares, swaps, extra sheets and boxes per color.

**Navigation.** Done in step 3 (see above).

**Cursor HUD.** Done in step 3 (see above).

**Spec card.** Same content as today plus hex codes next to the C1/C2 swatches and the new per-color takeoff numbers. Drawn above everything except the HUD. If the painted area is too short for it, the canvas grows a strip below the floor line and the card goes there.

**PNG export.** A clean plan at a fixed high resolution: tiles, voids with labels, wall lines and the card. Sheet outlines and badges are included only if the Sheet Overlay is on. No × badges, HUD or drag preview.

**Still open (defaults chosen, confirm when building):** label units (decimal vs fractions like 36 ⅛″, ties into the ft-in backlog item); the exact export resolution; whether drag-to-paint ever comes back (it would need a modifier key, since plain drag now makes voids).

## Takeoff accuracy improvements
- Superseded by the spec above: per-color boxes, swap supply, and the cut-tile rule (tiles past the edges or below the floor are spares, not installed).
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
4. Voids, cut-tile rendering, sheet culling, new takeoff math, spec card update, clean high-res PNG. Output changes on purpose here, so take a new snapshot baseline once it's verified.
5. Autosave/URL sharing, undo (covers voids), debug overlay, confirm before Re-Seed.
6. Fade registry, module split, per-sheet swap map.

Why features wait until after steps 2–3: they change output on purpose, which ends the before/after pattern check the refactors rely on. They also depend on the inches transform and the pipeline stages.
