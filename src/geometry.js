// Sheet grid in wall inches, wall/void clipping and the cut-tile stage.
import { CUBE_DX_INCHES, CUBE_DY_INCHES, CUBE_STEP_X_INCHES, LEFT_OFFSET_INCHES, SHEET_DRAWN_HEIGHT_INCHES, SHEET_WIDTH_INCHES, TIER_STEP_INCHES } from './constants.js';

// Tile rows are numbered from the top tile line down, so a row index shifts whenever the
// tiled height changes. The pattern hashes use the tier counted up from the floor instead
// (negative below the floor line). Row stagger comes from the sheet.
export function floorRowIndex(globalRow, tiledHeightInches) {
    const cubeCenterAboveFloor = tiledHeightInches - (globalRow * TIER_STEP_INCHES + CUBE_DY_INCHES);
    return Math.round(cubeCenterAboveFloor / TIER_STEP_INCHES);
}

// Tiles are numbered 0–35 within a sheet, row by row from the top. In each row the three
// tops come first (left to right), then left, right of cube 1, cube 2, cube 3.
export function tileNumber(localRow, localCol, type) {
    const inRow = (type === 'top') ? localCol : 3 + localCol * 2 + (type === 'right' ? 1 : 0);
    return localRow * 9 + inRow;
}

// Overrides in state are keyed by the sheet's grid position (row from the tile line, column
// from the left) and the tile number, so they survive sheet renumbering. The config uses
// the badge number instead (see config.js).
export function overrideKey(sRow, sCol, n) {
    return `${sRow}_${sCol}_t${n}`;
}

// Intersection of a rectangle with the wall (0..W × 0..H), or null if nothing is left
export function clipRectToWall(r, s) {
    const x0 = Math.max(0, r.x);
    const y0 = Math.max(0, r.y);
    const x1 = Math.min(s.wallWidthInches, r.x + r.w);
    const y1 = Math.min(s.wallTotalHeightInches, r.y + r.h);
    if (x1 - x0 <= 0 || y1 - y0 <= 0) return null;
    return { ...r, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function clipVoidsToWall(s) {
    return s.voids.map(v => clipRectToWall(v, s)).filter(Boolean);
}

// --- Pipeline stage 1: sheet grid ---
// All geometry is in wall inches: origin at the floor line on the left wall edge, y up.

// The 3 rhombuses of one isometric cube whose shared vertex is (cx, cy)
function cubeRhombi(cx, cy) {
    const dx = CUBE_DX_INCHES;
    const dy = CUBE_DY_INCHES;
    return [
        {
            type: 'top',
            x: cx,
            y: cy + dy,
            points: [
                { x: cx, y: cy + 2 * dy },
                { x: cx + dx, y: cy + dy },
                { x: cx, y: cy },
                { x: cx - dx, y: cy + dy }
            ]
        },
        {
            type: 'left',
            x: cx - (dx * 0.5),
            y: cy - (dy * 0.5),
            points: [
                { x: cx - dx, y: cy + dy },
                { x: cx, y: cy },
                { x: cx, y: cy - 2 * dy },
                { x: cx - dx, y: cy - dy }
            ]
        },
        {
            type: 'right',
            x: cx + (dx * 0.5),
            y: cy - (dy * 0.5),
            points: [
                { x: cx, y: cy },
                { x: cx + dx, y: cy + dy },
                { x: cx + dx, y: cy - dy },
                { x: cx, y: cy - 2 * dy }
            ]
        }
    ];
}

// Sheets are anchored at the tile line and laid out top-down, starting LEFT_OFFSET_INCHES
// left of the wall edge. Sheets that miss the wall entirely are skipped.
export function buildSheetGrid(s) {
    const wallWidth = s.wallWidthInches;
    const tiledHeight = s.tiledHeightInches;

    const gridLeft = -LEFT_OFFSET_INCHES;
    const cols = Math.ceil((wallWidth + LEFT_OFFSET_INCHES) / SHEET_WIDTH_INCHES);
    const rows = Math.ceil(tiledHeight / SHEET_DRAWN_HEIGHT_INCHES);

    const sheets = [];
    const tiles = [];

    for (let sRow = 0; sRow < rows; sRow++) {
        const top = tiledHeight - (sRow * SHEET_DRAWN_HEIGHT_INCHES);
        const bottom = top - SHEET_DRAWN_HEIGHT_INCHES;

        for (let sCol = 0; sCol < cols; sCol++) {
            const left = gridLeft + (sCol * SHEET_WIDTH_INCHES);
            const right = left + SHEET_WIDTH_INCHES;

            // Sheets start at the tile line, so only the floor and side edges can miss
            const sheetIntersectsWall = (right > 0) && (left < wallWidth) && (top > 0);
            if (!sheetIntersectsWall) continue;

            const sheetId = sheets.length; // badge numbers start at 0
            const sheetTiles = [];

            for (let localR = 0; localR < 4; localR++) {
                const row = sRow * 4 + localR;
                const floorRow = floorRowIndex(row, tiledHeight);
                const cy = top - (localR * TIER_STEP_INCHES) - CUBE_DY_INCHES;

                for (let localC = 0; localC < 3; localC++) {
                    const col = sCol * 3 + localC;
                    // The stagger is fixed by the sheet: its 1st and 3rd rows (from the top)
                    // sit half a cube right of its 2nd and 4th
                    const rowOffset = (localR % 2 === 0) ? CUBE_DX_INCHES : 0;
                    const cx = left + (localC * CUBE_STEP_X_INCHES) + rowOffset + CUBE_DX_INCHES;

                    for (const rhomb of cubeRhombi(cx, cy)) {
                        const n = tileNumber(localR, localC, rhomb.type);
                        const tile = {
                            ...rhomb,
                            sheetId,
                            col,
                            row,
                            floorRow,
                            localCol: localC,
                            tileNumber: n,
                            overrideKey: overrideKey(sRow, sCol, n)
                        };
                        tiles.push(tile);
                        sheetTiles.push(tile);
                    }
                }
            }

            sheets.push({ id: sheetId, sCol, sRow, left, right, top, bottom, tiles: sheetTiles });
        }
    }

    return { cols, rows, sheets, tiles };
}

// --- Pipeline stage 1b: cut tiles and sheet culling ---
// Void space = the voids plus everything outside the wall. A tile is cut if it lies fully
// in void space (zero area on the usable wall); cut tiles are spares, not installed.
// Sheets whose tiles are all cut are dropped, and the remaining sheets renumbered.
const CUT_AREA_EPSILON = 1e-6; // sq in

// The usable wall as disjoint rectangles: the wall split along every void edge, keeping
// the cells that aren't inside a void. Overlapping voids just merge.
function usableCells(s) {
    const voids = clipVoidsToWall(s);
    const uniqueSorted = (vals) => [...new Set(vals)].sort((a, b) => a - b);
    const xs = uniqueSorted([0, s.wallWidthInches, ...voids.flatMap(v => [v.x, v.x + v.w])]);
    const ys = uniqueSorted([0, s.wallTotalHeightInches, ...voids.flatMap(v => [v.y, v.y + v.h])]);
    const cells = [];
    for (let i = 0; i + 1 < xs.length; i++) {
        for (let j = 0; j + 1 < ys.length; j++) {
            const cx = (xs[i] + xs[i + 1]) / 2;
            const cy = (ys[j] + ys[j + 1]) / 2;
            const inVoid = voids.some(v => cx > v.x && cx < v.x + v.w && cy > v.y && cy < v.y + v.h);
            if (!inVoid) cells.push({ x0: xs[i], x1: xs[i + 1], y0: ys[j], y1: ys[j + 1] });
        }
    }
    return cells;
}

// Area of a convex polygon clipped to an axis-aligned rectangle (Sutherland–Hodgman)
function clippedArea(points, r) {
    let poly = points;
    const planes = [['x', r.x0, 1], ['x', r.x1, -1], ['y', r.y0, 1], ['y', r.y1, -1]];
    for (const [axis, value, sign] of planes) {
        const next = [];
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            const aIn = (a[axis] - value) * sign >= 0;
            const bIn = (b[axis] - value) * sign >= 0;
            if (aIn) next.push(a);
            if (aIn !== bIn) {
                const t = (value - a[axis]) / (b[axis] - a[axis]);
                next.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
            }
        }
        poly = next;
        if (poly.length < 3) return 0;
    }
    let twiceArea = 0;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        twiceArea += a.x * b.y - b.x * a.y;
    }
    return Math.abs(twiceArea) / 2;
}

export function markCutTiles(grid, s) {
    const cells = usableCells(s);
    for (const tile of grid.tiles) {
        const xs = tile.points.map(p => p.x);
        const ys = tile.points.map(p => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);

        tile.cut = true;
        for (const c of cells) {
            if (maxX <= c.x0 || minX >= c.x1 || maxY <= c.y0 || minY >= c.y1) continue;
            const insideCell = minX >= c.x0 && maxX <= c.x1 && minY >= c.y0 && maxY <= c.y1;
            if (insideCell || clippedArea(tile.points, c) > CUT_AREA_EPSILON) {
                tile.cut = false;
                break;
            }
        }
    }

    grid.sheets = grid.sheets.filter(sheet => sheet.tiles.some(t => !t.cut));
    grid.sheets.forEach((sheet, i) => {
        sheet.id = i;
        for (const t of sheet.tiles) t.sheetId = sheet.id;
    });
    grid.tiles = grid.sheets.flatMap(sheet => sheet.tiles);
}

export function isPointInPolygon(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
            (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}
