// Saved-walls export: a zip of every wall's overlay and mockup PNGs plus the inventory
// image, and the inventory image on its own.
import { canvasToBlob, computeWall, downloadBlob, exportFileName, renderExportCanvas } from '../app.js';
import { drawInventoryImage, inventoryImageSize } from '../inventory-image.js';
import { normalizeState, state } from '../state.js';
import { makeZip } from '../zip.js';
import { pooledTakeoff } from './takeoff.js';

const INVENTORY_DPR = 2;

function localDate(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function blobBytes(blob) {
    return new Uint8Array(await blob.arrayBuffer());
}

function inventoryCanvas(total, date) {
    const { width, height } = inventoryImageSize(total);
    const c = document.createElement('canvas');
    c.width = width * INVENTORY_DPR;
    c.height = height * INVENTORY_DPR;
    drawInventoryImage(c.getContext('2d'), total, { c1: state.colorTile1, c2: state.colorTile2 }, date, INVENTORY_DPR);
    return c;
}

// Runs an export with the button disabled and relabelled, restoring it afterwards
async function withBusyButton(button, label, work) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = label;
    try {
        await work();
    } catch (err) {
        console.error('Export failed:', err);
        alert(`Export failed: ${err.message}`);
    } finally {
        button.disabled = false;
        button.textContent = original;
    }
}

// Each saved wall is rendered in the current shared colors, once with the sheet overlay and
// once as the clean mockup. Names that collide (same wall name and size) get -2, -3, ….
export function exportSavedWallsZip(button) {
    const total = pooledTakeoff();
    if (!total.walls.length) return;
    return withBusyButton(button, 'Exporting…', async () => {
        const date = new Date();
        const files = [];
        const used = new Set();
        const unique = (name) => {
            let candidate = name;
            for (let n = 2; used.has(candidate); n++) candidate = name.replace(/\.png$/, `-${n}.png`);
            used.add(candidate);
            return candidate;
        };
        for (const w of total.walls) {
            for (const overlay of [true, false]) {
                const s = normalizeState({ ...state, ...w.settings, showSheetOverlay: overlay });
                const { grid, inventory } = computeWall(s);
                const wall = { name: w.name, unsaved: false };
                const blob = await canvasToBlob(renderExportCanvas(s, grid, inventory, wall));
                files.push({ name: unique(exportFileName(s, wall)), data: await blobBytes(blob) });
            }
        }
        files.push({ name: unique('inventory.png'), data: await blobBytes(await canvasToBlob(inventoryCanvas(total, date))) });
        downloadBlob(makeZip(files, date), `saved-walls_${localDate(date)}.zip`);
    });
}

export function downloadInventoryImage(button) {
    const total = pooledTakeoff();
    if (!total.walls.length) return;
    return withBusyButton(button, 'Rendering…', async () => {
        const date = new Date();
        downloadBlob(await canvasToBlob(inventoryCanvas(total, date)), `inventory_${localDate(date)}.png`);
    });
}
