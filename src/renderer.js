// Draws a plan (tiles, sheets, wall lines, voids, spec card) onto a 2D context.
import { C1, C2, CANVAS_BG, CARD_HEIGHT_PX, CARD_WIDTH_PX, CUT_TILE_STROKE, MEASURE_STROKE, OUTSIDE_WALL_WASH, VOID_BADGE_RADIUS_PX, VOID_STROKE } from './constants.js';
import { FADES, getNormalizedZones } from './fades.js';
import { clipRectToWall } from './geometry.js';
import { toScreen } from './view.js';

// --- Pipeline stage 5: canvas ---
// Tiles and sheet outlines are drawn in wall inches through one transform; text, badges and
// wall lines are drawn in CSS px. Both include view.dpr, so the same code renders the
// on-screen canvas and the high-res export.
// wall: { name, unsaved } of the linked saved wall for the spec card, or null
export function renderCanvas(ctx, view, grid, inventory, s, wall = null) {
    const { scale, dpr } = view;
    const useScreenSpace = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const useWallSpace = () => ctx.setTransform(dpr * scale, 0, 0, -dpr * scale, dpr * view.originX, dpr * view.originY);

    const palette = [s.colorTile1, s.colorTile2];
    const { wallLeftX, wallRightX, wallFloorY, wallCeilingY, tiledTopY } = view;
    const renderedWallWidth = wallRightX - wallLeftX;
    const renderedTotalHeight = wallFloorY - wallCeilingY;
    // Overlay off = clean mockup: tiles cropped at the wall and void edges, voids and
    // everything outside the wall in CANVAS_BG, and no planning marks (ghost tiles, sheet
    // outlines, wall lines, void outlines/labels/badges). The spec card stays.
    const clean = !s.showSheetOverlay;
    // The PNG export leaves everything off the wall transparent (margins, card strip, and
    // in the clean mockup the voids), where the screen shows the background or paint
    const transparent = !view.onScreen;

    useScreenSpace();

    // 0. Canvas area outside the content (only visible on screen when zoomed out or panned)
    const { content } = view;
    if (transparent) {
        ctx.clearRect(0, 0, view.cssWidth, view.cssHeight);
    }
    else {
        ctx.fillStyle = CANVAS_BG;
        ctx.fillRect(0, 0, view.cssWidth, view.cssHeight);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(content.x, content.y, content.width, content.height);
    ctx.clip(); // tiles overhanging past the margins stay hidden, as before

    // 1. Fill the content (wall + margins) with painted wall color
    if (!transparent) {
        ctx.fillStyle = clean ? CANVAS_BG : s.colorPaint;
        ctx.fillRect(content.x, content.y, content.width, content.height);
    }

    // 2. Draw wall drywall fill
    ctx.fillStyle = s.colorPaint;
    ctx.fillRect(wallLeftX, wallCeilingY, renderedWallWidth, renderedTotalHeight);

    // Light wash over everything outside the wall, so the wall edge reads clearly
    if (!clean && !transparent) {
        ctx.fillStyle = OUTSIDE_WALL_WASH;
        ctx.beginPath();
        ctx.rect(content.x, content.y, content.width, content.height);
        ctx.rect(wallLeftX, wallCeilingY, renderedWallWidth, renderedTotalHeight);
        ctx.fill('evenodd');
    }

    // 3. Tiles: cut tiles (fully in a void or outside the wall) are dotted outlines with
    // no fill; usable tiles are drawn on top of them
    const tracePath = (tile) => {
        ctx.beginPath();
        ctx.moveTo(tile.points[0].x, tile.points[0].y);
        ctx.lineTo(tile.points[1].x, tile.points[1].y);
        ctx.lineTo(tile.points[2].x, tile.points[2].y);
        ctx.lineTo(tile.points[3].x, tile.points[3].y);
        ctx.closePath();
    };
    ctx.lineJoin = 'round';
    useWallSpace();

    if (!clean) {
        ctx.save();
        ctx.lineWidth = 1 / scale;
        ctx.setLineDash([2 / scale, 2 / scale]);
        ctx.strokeStyle = CUT_TILE_STROKE;
        for (const tile of grid.tiles) {
            if (!tile.cut) continue;
            tracePath(tile);
            ctx.stroke();
        }
        ctx.restore();
    }

    // In the clean mockup, tiles are cropped at the wall edge here and at the voids below
    ctx.save();
    if (clean) {
        ctx.beginPath();
        ctx.rect(0, 0, s.wallWidthInches, s.wallTotalHeightInches);
        ctx.clip();
    }
    ctx.lineWidth = Math.max(0.75, scale * (1.0 / 16.0)) / scale;
    ctx.strokeStyle = s.colorGrout;
    for (const tile of grid.tiles) {
        if (tile.cut) continue;
        tracePath(tile);
        ctx.fillStyle = palette[tile.colorIdx];
        ctx.fill();
        ctx.stroke();
    }
    ctx.restore();

    // Voids are solid (holes in the PNG), covering the tile parts inside them
    if (clean) {
        ctx.save();
        if (transparent) ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = CANVAS_BG;
        for (const stored of s.voids) {
            const v = clipRectToWall(stored, s);
            if (v && !v.measureOnly) ctx.fillRect(v.x, v.y, v.w, v.h);
        }
        ctx.restore();
    }

    // 4. Sheet outlines and badges
    if (s.showSheetOverlay) {
        const edgeKey = (p1, p2) => {
            const x1 = Math.round(p1.x * 1e4), y1 = Math.round(p1.y * 1e4);
            const x2 = Math.round(p2.x * 1e4), y2 = Math.round(p2.y * 1e4);
            return (x1 < x2 || (x1 === x2 && y1 < y2))
                ? `${x1},${y1}_${x2},${y2}`
                : `${x2},${y2}_${x1},${y1}`;
        };

        for (const sheet of grid.sheets) {
            const edgeCounts = new Map();
            for (const tile of sheet.tiles) {
                const pts = tile.points;
                for (let i = 0; i < pts.length; i++) {
                    const key = edgeKey(pts[i], pts[(i + 1) % pts.length]);
                    edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
                }
            }

            // Orange outline for Color 1 base; Blue outline for Color 2 base
            const isC1 = (sheet.majorityIdx === C1);

            // Draw the interlocking perimeter (edges used by only one tile)
            ctx.save();
            useWallSpace();
            ctx.lineWidth = 2.2 / scale;
            ctx.strokeStyle = isC1 ? '#f59e0b' : '#38bdf8';
            ctx.beginPath();
            for (const tile of sheet.tiles) {
                const pts = tile.points;
                for (let i = 0; i < pts.length; i++) {
                    const pA = pts[i];
                    const pB = pts[(i + 1) % pts.length];
                    if (edgeCounts.get(edgeKey(pA, pB)) === 1) {
                        ctx.moveTo(pA.x, pA.y);
                        ctx.lineTo(pB.x, pB.y);
                    }
                }
            }
            ctx.stroke();

            // Sheet center badge
            useScreenSpace();
            let avgX = 0, avgY = 0;
            for (const t of sheet.tiles) { avgX += t.x; avgY += t.y; }
            const badge = toScreen(view, avgX / sheet.tiles.length, avgY / sheet.tiles.length);

            ctx.fillStyle = isC1 ? 'rgba(245, 158, 11, 0.95)' : 'rgba(14, 165, 233, 0.95)';
            ctx.beginPath();
            ctx.roundRect(badge.x - 18, badge.y - 10, 36, 20, 4);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = '600 10px JetBrains Mono, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('#' + sheet.id, badge.x, badge.y);

            ctx.restore();
        }
    }

    useScreenSpace();

    if (!clean) drawPlanningMarks(ctx, view, s);

    // 6. Specification & takeoff card (painted area, or the strip below the floor)
    drawSpecCard(ctx, view.card, inventory, s, wall);

    ctx.restore(); // content clip

    // Content border, on screen only: it separates the plan from the canvas background
    // (the clean mockup's margins already are the canvas background)
    if (view.onScreen && !clean) {
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.strokeRect(content.x + 0.5, content.y + 0.5, content.width - 1, content.height - 1);
    }
}

// Red wall lines and labels, and void outlines, labels and × badges (screen space)
function drawPlanningMarks(ctx, view, s) {
    const { wallLeftX, wallRightX, wallFloorY, wallCeilingY, tiledTopY } = view;
    const renderedWallWidth = wallRightX - wallLeftX;
    const renderedTotalHeight = wallFloorY - wallCeilingY;

    // Red Dashed Lines for Exact Physical Wall Dimensions
    ctx.save();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 6]);

    // Full Wall Boundary Box
    ctx.strokeRect(wallLeftX, wallCeilingY, renderedWallWidth, renderedTotalHeight);

    // Horizontal Tile-to-Paint Boundary Line
    ctx.beginPath();
    ctx.moveTo(wallLeftX, tiledTopY);
    ctx.lineTo(wallRightX, tiledTopY);
    ctx.stroke();

    // Red Dimension Labels
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 11px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`WALL WIDTH: ${s.wallWidthInches}″`, wallLeftX + 6, wallCeilingY - 6);

    ctx.textAlign = 'right';
    ctx.fillText(`CEILING: ${s.wallTotalHeightInches}″`, wallRightX - 6, wallCeilingY - 6);

    ctx.textBaseline = 'top';
    ctx.fillText(`FLOOR LINE (0″)`, wallRightX - 6, wallFloorY + 6);

    ctx.textAlign = 'left';
    ctx.fillText(`TILE LINE (${s.tiledHeightInches}″)`, wallLeftX + 6, tiledTopY + 6);
    ctx.restore();

    // 5. Voids: dashed outline and a dimension label, no fill. Drawn clipped to the wall,
    // which previews how a pending wall-size edit will trim them.
    ctx.save();
    for (const stored of s.voids) {
        const v = clipRectToWall(stored, s);
        if (!v) continue;
        const tl = toScreen(view, v.x, v.y + v.h);
        const br = toScreen(view, v.x + v.w, v.y);

        ctx.strokeStyle = v.measureOnly ? MEASURE_STROKE : VOID_STROKE;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
        ctx.setLineDash([]);

        drawPill(ctx, voidLabel(v), (tl.x + br.x) / 2, (tl.y + br.y) / 2);

        // Delete badge (on screen only; never in the PNG)
        if (view.onScreen) {
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(br.x, tl.y, VOID_BADGE_RADIUS_PX, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(br.x - 3, tl.y - 3); ctx.lineTo(br.x + 3, tl.y + 3);
            ctx.moveTo(br.x + 3, tl.y - 3); ctx.lineTo(br.x - 3, tl.y + 3);
            ctx.stroke();
            view.voidBadges.push({ id: stored.id, x: br.x, y: tl.y });
        }
    }
    ctx.restore();
}

// Lengths on void labels and inputs: exact to the 1/16″ snap, trailing zeros dropped
function formatLength(v) {
    return `${+v.toFixed(4)}″`;
}

export function voidLabel(v) {
    return `${formatLength(v.w)} × ${formatLength(v.h)} @ (${formatLength(v.x)}, ${formatLength(v.y)})`;
}

// White monospace text on a dark rounded pill, centered at (cx, cy)
export function drawPill(ctx, text, cx, cy) {
    ctx.save();
    ctx.font = '600 10px JetBrains Mono, monospace';
    const w = Math.ceil(ctx.measureText(text).width) + 12;
    const h = 18;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 4);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy);
    ctx.restore();
}

// Laid out at CARD_WIDTH_PX × CARD_HEIGHT_PX and scaled down uniformly when the space
// (card.width) is narrower, so the text never runs past the card
function drawSpecCard(ctx, card, inv, s, wall) {
    const k = Math.min(1, card.width / CARD_WIDTH_PX);
    if (k <= 0) return;
    const x = 0, y = 0, width = CARD_WIDTH_PX, height = CARD_HEIGHT_PX;
    const left = x + 12;
    ctx.save();
    ctx.translate(card.x, card.y);
    ctx.scale(k, k);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.40)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillText('INSTALLATION SPECIFICATIONS & MATERIAL TAKEOFF', left, y + 10);

    // Wall name: the linked saved wall, shortened with … to fit, plus an amber " (unsaved)"
    // when the wall has been changed since it was saved or loaded
    ctx.font = 'bold 11px JetBrains Mono, monospace';
    ctx.fillStyle = wall ? '#22d3ee' : '#64748b';
    const tag = wall?.unsaved ? ' (unsaved)' : '';
    const room = width - 24 - ctx.measureText(tag).width;
    let name = wall ? wall.name : 'Unsaved wall';
    while (name.length > 1 && ctx.measureText(name).width > room) name = name.slice(0, -2) + '…';
    ctx.fillText(name, left, y + 26);
    if (tag) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillText(tag, left + ctx.measureText(name).width, y + 26);
    }

    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`WALL: ${s.wallWidthInches}″ W × ${s.wallTotalHeightInches}″ H (Tiled ${s.tiledHeightInches}″)  |  GRID: ${inv.totalSheets} Sheets (${inv.gridCols}×${inv.gridRows})`, left, y + 44);

    // Fade and sub-zones: the bands as used (transition trimmed to fit), with the color
    // that fills each (Invert puts Color 2 on top). maxWidth squeezes rare long values.
    const zones = getNormalizedZones(s);
    const [topC, bottomC] = s.invertColors ? ['C2', 'C1'] : ['C1', 'C2'];
    const pct = (v) => `${+v.toFixed(1)}%`;
    ctx.fillText(`FADE: ${FADES[s.algorithm].label}  |  SEED: ${s.seed}`, left, y + 60, width - 24);
    ctx.fillText(`ZONES: Top ${topC} ${pct(zones.wallPct)} · Trans ${pct(zones.transPct)} · Bottom ${bottomC} ${pct(zones.floorPct)}  |  Rogue ${pct(s.outlierPct)}  |  Invert ${s.invertColors ? 'on' : 'off'}`, left, y + 76, width - 24);

    // One row per color: swatch, hex, sheets to order (after extras and spares), leftover
    const colorRow = (rowY, hex, name, accent, buy, leftover) => {
        ctx.fillStyle = hex;
        ctx.beginPath();
        ctx.arc(left + 6, rowY + 5, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = accent;
        ctx.font = 'bold 10px JetBrains Mono, monospace';
        ctx.fillText(`${name} ${hex.toUpperCase()}`, left + 18, rowY);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillText(`${buy} sheets, ${leftover} tiles left`, left + 140, rowY);
    };
    colorRow(y + 94, s.colorTile1, 'Color 1', '#f59e0b', inv.buyC1, inv.leftoverC1);
    colorRow(y + 110, s.colorTile2, 'Color 2', '#38bdf8', inv.buyC2, inv.leftoverC2);

    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`Hand-swaps: ${inv.handSwaps} tiles (${inv.swappedC1} C1 into C2 sheets, ${inv.swappedC2} C2 into C1 sheets)`, left, y + 128);
    ctx.fillText(`Spares from cuts: ${inv.spareC1} C1, ${inv.spareC2} C2  |  Order: ${inv.buy} sheets`, left, y + 144);

    ctx.restore();
}
