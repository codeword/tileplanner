// Canvas pointer: click to flip, drag to draw voids, Shift+drag pan, wheel zoom, cursor HUD.
import { lastArea, lastGrid, lastView, nav, scheduleRender } from '../app.js';
import { DRAG_THRESHOLD_PX, VOID_BADGE_RADIUS_PX, ZOOM_MAX, ZOOM_MIN } from '../constants.js';
import { isPointInPolygon } from '../geometry.js';
import { drawPill, voidLabel } from '../renderer.js';
import { setState, snapInches, state } from '../state.js';
import { canvas, hudCtx } from './canvases.js';
import { isInventoryShown } from './takeoff.js';
import { computeView, toScreen, toWall } from '../view.js';

// --- Cursor HUD (overlay canvas) ---
// Shows the wall coordinate under the cursor, with guide lines to the floor line and the
// left wall edge. Hidden while dragging and when the cursor is off the plan.
let hoverPoint = null; // CSS px within the canvas, or null

function formatInches(v) {
    const rounded = Math.round(v * 10) / 10;
    return (Object.is(rounded, -0) ? 0 : rounded).toFixed(1) + '″';
}

export function drawHud() {
    if (!lastView) return;
    const view = lastView;
    const dpr = view.dpr;
    hudCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hudCtx.clearRect(0, 0, view.cssWidth, view.cssHeight);
    if (isInventoryShown()) return;

    // Void being drawn: cyan dashed outline, faint fill and live dimensions
    if (voidPreview) {
        const v = voidPreview;
        const tl = toScreen(view, v.x, v.y + v.h);
        const br = toScreen(view, v.x + v.w, v.y);
        hudCtx.save();
        hudCtx.fillStyle = 'rgba(34, 211, 238, 0.12)';
        hudCtx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
        hudCtx.strokeStyle = '#22d3ee';
        hudCtx.lineWidth = 1.5;
        hudCtx.setLineDash([6, 4]);
        hudCtx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
        hudCtx.restore();
        drawPill(hudCtx, voidLabel(v), (tl.x + br.x) / 2, (tl.y + br.y) / 2);
        return;
    }

    const c = view.content;
    if (!hoverPoint || (pointerDrag && pointerDrag.dragging)) return;
    const { x: sx, y: sy } = hoverPoint;
    if (sx < c.x || sx > c.x + c.width || sy < c.y || sy > c.y + c.height) return;

    const pt = toWall(view, sx, sy);

    // Guide lines to the floor line and the left wall edge
    hudCtx.save();
    hudCtx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
    hudCtx.lineWidth = 1;
    hudCtx.setLineDash([4, 4]);
    hudCtx.beginPath();
    hudCtx.moveTo(Math.round(sx) + 0.5, sy);
    hudCtx.lineTo(Math.round(sx) + 0.5, view.originY);
    hudCtx.moveTo(sx, Math.round(sy) + 0.5);
    hudCtx.lineTo(view.originX, Math.round(sy) + 0.5);
    hudCtx.stroke();
    hudCtx.restore();

    // Badge next to the cursor, flipped to the other side near the canvas edges
    const tile = tileAt(pt);
    const label = `X: ${formatInches(pt.x)}, Y: ${formatInches(pt.y)}` + (tile ? `  Sheet ${tile.sheetId}, tile ${tile.tileNumber}` : '');
    hudCtx.font = '600 11px JetBrains Mono, monospace';
    const w = Math.ceil(hudCtx.measureText(label).width) + 14;
    const h = 22;
    const gap = 14;
    let bx = sx + gap;
    let by = sy + gap;
    if (bx + w > view.cssWidth - 4) bx = sx - gap - w;
    if (by + h > view.cssHeight - 4) by = sy - gap - h;
    bx = Math.max(4, bx);
    by = Math.max(4, by);

    hudCtx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    hudCtx.beginPath();
    hudCtx.roundRect(bx, by, w, h, 4);
    hudCtx.fill();
    hudCtx.strokeStyle = 'rgba(34, 211, 238, 0.7)';
    hudCtx.lineWidth = 1;
    hudCtx.stroke();

    hudCtx.fillStyle = '#e0f2fe';
    hudCtx.textAlign = 'left';
    hudCtx.textBaseline = 'middle';
    hudCtx.fillText(label, bx + 7, by + h / 2);
}

let hudFrameId = null;
function scheduleHud() {
    if (hudFrameId) return;
    hudFrameId = requestAnimationFrame(() => {
        hudFrameId = null;
        drawHud();
    });
}

// --- Canvas pointer & navigation ---
// A press that moves less than DRAG_THRESHOLD_PX is a click (flips the tile under it, or
// deletes a void via its × badge). Shift+drag pans. A plain drag draws a void.
let pointerDrag = null; // { id, startX, startY, lastX, lastY, startWall, pan, dragging, cancelled }
let voidPreview = null; // void being drawn, in wall inches

// Rectangle between two wall points, snapped to 1/16″ and clamped to the wall
function voidFromDrag(a, b) {
    const clampX = (v) => Math.min(state.wallWidthInches, Math.max(0, snapInches(v)));
    const clampY = (v) => Math.min(state.wallTotalHeightInches, Math.max(0, snapInches(v)));
    const x0 = clampX(Math.min(a.x, b.x)), x1 = clampX(Math.max(a.x, b.x));
    const y0 = clampY(Math.min(a.y, b.y)), y1 = clampY(Math.max(a.y, b.y));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function voidBadgeAt(p) {
    if (!lastView) return null;
    return lastView.voidBadges.find(b => Math.hypot(p.x - b.x, p.y - b.y) <= VOID_BADGE_RADIUS_PX + 2) || null;
}

export function deleteVoid(id) {
    setState({ voids: state.voids.filter(v => v.id !== id) });
}

function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

export function canvasCenter() {
    return { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
}

// The tile under a wall point (topmost drawn first), or null
function tileAt(pt) {
    if (!lastGrid) return null;
    const tiles = lastGrid.tiles;
    for (let i = tiles.length - 1; i >= 0; i--) {
        if (isPointInPolygon(pt, tiles[i].points)) return tiles[i];
    }
    return null;
}

function flipTileAt(screenPt) {
    const tile = tileAt(toWall(lastView, screenPt.x, screenPt.y));
    if (!tile || tile.cut) return; // spares can't be flipped
    setState({
        manualOverrides: { ...state.manualOverrides, [tile.overrideKey]: 1 - tile.colorIdx }
    });
}

// Zoom to `zoom` keeping the wall point under `screenPt` fixed
export function zoomAt(screenPt, zoom) {
    if (!lastView) return;
    const anchor = toWall(lastView, screenPt.x, screenPt.y);
    nav.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
    const next = computeView(state, lastArea, lastView.dpr, nav);
    const moved = toScreen(next, anchor.x, anchor.y);
    nav.panX += screenPt.x - moved.x;
    nav.panY += screenPt.y - moved.y;
    scheduleRender();
}

export function bindCanvasPointer() {
    canvas.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || pointerDrag || !lastView || isInventoryShown()) return;
        const p = canvasPoint(e);
        const badge = voidBadgeAt(p);
        if (badge) {
            deleteVoid(badge.id);
            return;
        }
        pointerDrag = {
            id: e.pointerId, startX: p.x, startY: p.y, lastX: p.x, lastY: p.y,
            startWall: toWall(lastView, p.x, p.y), pan: e.shiftKey, dragging: false, cancelled: false
        };
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    });

    canvas.addEventListener('pointermove', (e) => {
        const p = canvasPoint(e);
        hoverPoint = p;
        const d = pointerDrag;
        if (d && e.pointerId === d.id) {
            if (!d.dragging && Math.hypot(p.x - d.startX, p.y - d.startY) >= DRAG_THRESHOLD_PX) {
                d.dragging = true;
                if (d.pan) canvas.style.cursor = 'grabbing';
            }
            if (d.dragging && d.pan) {
                nav.panX += p.x - d.lastX;
                nav.panY += p.y - d.lastY;
                scheduleRender();
            } else if (d.dragging && !d.cancelled) {
                voidPreview = voidFromDrag(d.startWall, toWall(lastView, p.x, p.y));
            }
            d.lastX = p.x;
            d.lastY = p.y;
        } else if (!d) {
            canvas.style.cursor = voidBadgeAt(p) ? 'pointer' : '';
        }
        scheduleHud();
    });

    const endDrag = (e, cancelled) => {
        const d = pointerDrag;
        if (!d || e.pointerId !== d.id) return;
        pointerDrag = null;
        canvas.style.cursor = '';
        try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
        const rect = voidPreview;
        voidPreview = null;
        if (!cancelled && !d.cancelled) {
            if (!d.dragging) flipTileAt(canvasPoint(e));
            else if (!d.pan && rect && rect.w > 0 && rect.h > 0) setState({ voids: [...state.voids, { id: null, ...rect }] });
        }
        scheduleHud();
    };
    canvas.addEventListener('pointerup', (e) => endDrag(e, false));
    canvas.addEventListener('pointercancel', (e) => endDrag(e, true));

    canvas.addEventListener('pointerleave', () => {
        if (pointerDrag) return; // captured; keep the HUD state until release
        hoverPoint = null;
        scheduleHud();
    });

    // Escape abandons a void being drawn
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && pointerDrag && !pointerDrag.pan) {
            pointerDrag.cancelled = true;
            voidPreview = null;
            scheduleHud();
        }
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (isInventoryShown()) return;
        // Trackpad pinch arrives as ctrl+wheel with small deltas; Firefox may report lines
        const deltaY = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        const factor = Math.exp(-deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        zoomAt(canvasPoint(e), nav.zoom * factor);
    }, { passive: false });
}
