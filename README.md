# Metro Rhombus Tile Planner

A browser app for planning a tile wall made from Merola Tile **Metro Rhombus** mosaic sheets (the tumbling-blocks / isometric cube pattern). It lays out whole sheets on the wall, paints a two-color fade across them, and works out how many sheets of each color to order, including hand-swapped tiles, cutouts and spares.

**Use it:** download [`tile-planner.html`](tile-planner.html) and open it in a browser. It's a single file with no install, server or internet connection needed.

## What it does

- **Wall and sheets.** Enter the wall width, total height and tiled height (paint above). The wall is filled with 10.5″ × 12.13″ sheets of 36 rhombus tiles (3 cubes × 4 rows), hung from the tile line.
- **Two-color fade.** The tiled area is split into a top color band, a transition band and a bottom color band. Five fade styles: lightning (jagged teeth), Bayer dither, cellular clusters, glitch scanlines and blue-noise dissolve, plus "rogue noise" that scatters odd tiles outside the transition. Every pattern comes from a seed, so the same settings always give the same wall.
- **Hand edits.** Click a tile to flip its color. Invert swaps the two colors for a wall.
- **Voids.** Drag on the wall to mark a window, niche or outlet, or type exact sizes. Tiles inside a void are cut; sheets that are entirely cut are dropped. A void can also be "measure only", a measurement that cuts nothing.
- **Takeoff.** Each sheet counts as the color most of its tiles have; the rest are hand-swaps. Spare tiles from cuts and swaps are settled into whole sheets, so the order per color is exact, with 0–35 tiles left over.
- **Saved walls.** Save several walls (one per wall of a room), rename and reorder them, and see a pooled order for all of them, where one wall's spares cover another's swaps.
- **Exports.**
  - PNG of the wall, either as a planning overlay (sheet outlines and numbers) or as a clean mockup, with a spec card underneath.
  - ZIP of every saved wall in both versions, plus an inventory image.
  - Inventory image: per-wall and pooled totals, with +5% and +10% reserves.
- **Config JSON.** Export or import the colors and every saved wall as JSON. Saved walls otherwise live only in the open browser tab, so export before closing it. Example: [`src/configs/fullBathroom.json`](src/configs/fullBathroom.json).

## Controls

| Action | How |
|---|---|
| Flip a tile | Click it |
| Draw a void | Drag on the wall (Escape cancels) |
| Pan | Shift + drag |
| Zoom | Scroll or pinch, or the −/+/Fit buttons |
| Delete a void | Its red × badge, or the ✕ in the Voids list |

## Development

The source is ES modules in [`src/`](src). [`tile-planner.html`](tile-planner.html) is built from them and committed.

```bash
python3 -m http.server 8765
```

Open http://127.0.0.1:8765/src/index.html. Module files don't load from `file://`, so the source version needs a server; the built file doesn't.

After changing `src/`, rebuild and commit both:

```bash
python3 build.py
```

`build.py` uses only the Python standard library. It joins the modules in dependency order into one inline `<script type="module">`, and fails on duplicate top-level names or on names used from another module without an import.

### Layout

| Path | Contents |
|---|---|
| `src/constants.js`, `noise.js`, `fades.js`, `geometry.js`, `inventory.js`, `view.js`, `renderer.js`, `config.js`, `zip.js`, `inventory-image.js` | Pure pipeline: sheet grid → cut tiles → colors → takeoff → drawing. No DOM or app state. |
| `src/state.js` | The single state object, defaults, limits and validation |
| `src/app.js` | Render loop and PNG export |
| `src/ui/` | Sidebar controls, pointer handling, saved walls, exports, config modal |
| `src/configs/` | Exported configs |
| `build.py` | Single-file build |
| `CLAUDE.md` | Detailed design notes: geometry, takeoff math, config versions |

Coordinates are in wall inches, with the origin at the floor on the left wall edge and y pointing up.

## License

[MIT](LICENSE). This is an independent project, not affiliated with Merola Tile.
