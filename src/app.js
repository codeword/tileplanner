// Render loop: runs the pipeline when state changes, redraws on pan/zoom/resize, PNG export.
import { EXPORT_MAX_PIXELS, EXPORT_PIXEL_DENSITY } from './constants.js';
import { assignColors } from './fades.js';
import { buildSheetGrid, markCutTiles } from './geometry.js';
import { computeInventory } from './inventory.js';
import { renderCanvas } from './renderer.js';
import { state } from './state.js';
import { canvas, canvasArea, hudCanvas, tileCtx, zoomLabel } from './ui/canvases.js';
import { drawHud } from './ui/pointer.js';
import { currentWall, renderDashboard } from './ui/takeoff.js';
import { computeView } from './view.js';

// Render Loop
let animationFrameId = null;
export function scheduleRender() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(renderTiling);
}

// Last pipeline outputs, kept for hit-testing, export, saved walls and debugging
export let lastState = null;
export let lastGrid = null;
export let lastInventory = null;
export let lastView = null;
export let lastArea = null;

// Zoom/pan of the on-screen view. Pan is in CSS px from the centered position.
export const nav = { zoom: 1, panX: 0, panY: 0 };

// Pipeline stages 1–3 for one wall's state (also used for saved walls' counts)
export function computeWall(s) {
    const grid = buildSheetGrid(s);
    markCutTiles(grid, s);
    assignColors(grid, s);
    return { grid, inventory: computeInventory(grid) };
}

export function renderTiling() {
    // Grid, colors and inventory only depend on state; pan/zoom/resize reuse them
    if (state !== lastState) {
        ({ grid: lastGrid, inventory: lastInventory } = computeWall(state));
        lastState = state;
        renderDashboard(lastInventory);
    }

    const dpr = window.devicePixelRatio || 1;
    lastArea = { width: canvasArea.clientWidth, height: canvasArea.clientHeight };
    lastView = computeView(state, lastArea, dpr, nav);

    for (const c of [canvas, hudCanvas]) {
        c.width = Math.round(lastView.cssWidth * dpr);
        c.height = Math.round(lastView.cssHeight * dpr);
    }

    renderCanvas(tileCtx, lastView, lastGrid, lastInventory, state, currentWall(state));
    zoomLabel.textContent = Math.round(nav.zoom * 100) + '%';
    drawHud();
}

// --- Export Canvas as High-Res PNG ---
// Re-renders the current view off-screen at a higher pixel density instead of copying the
// on-screen canvas.
// It always covers the whole plan at the fitted scale, whatever the current zoom and pan.
export function downloadCanvasPNG() {
    if (!lastGrid) return;
    const fitted = computeView(state, lastArea, 1);
    const longestSide = Math.max(fitted.cssWidth, fitted.cssHeight);
    const view = computeView(state, lastArea, Math.min(EXPORT_PIXEL_DENSITY, EXPORT_MAX_PIXELS / longestSide));

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = Math.round(view.cssWidth * view.dpr);
    exportCanvas.height = Math.round(view.cssHeight * view.dpr);
    renderCanvas(exportCanvas.getContext('2d'), view, lastGrid, lastInventory, state, currentWall(state));

    exportCanvas.toBlob((blob) => {
        if (!blob) {
            console.error('Error generating PNG: canvas could not be encoded');
            return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = exportFileName(state, currentWall(state));
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }, 'image/png');
}

// <wall name>_<W>x<H>_<overlay|mockup>.png. The name is the linked saved wall's (even with
// unsaved changes) or "unsaved-wall", with runs of anything but letters, digits, . _ - as "-".
function exportFileName(s, wall) {
    const name = (wall ? wall.name : 'unsaved-wall').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'wall';
    return `${name}_${s.wallWidthInches}x${s.wallTotalHeightInches}_${s.showSheetOverlay ? 'overlay' : 'mockup'}.png`;
}

// Re-render when the window moves to a screen with a different pixel density
export function watchPixelRatio() {
    const query = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    query.addEventListener('change', () => {
        scheduleRender();
        watchPixelRatio();
    }, { once: true });
}
