// Takeoff bar and the saved-walls list.
import { computeWall, lastInventory, lastState, scheduleRender } from '../app.js';
import { sanitizeWallName } from '../config.js';
import { settleColor } from '../inventory.js';
import { WALL_KEYS, normalizeState, setState, state, wallSettings } from '../state.js';

const statTotalSheets = document.getElementById('statTotalSheets');
const statC1Sheets = document.getElementById('statC1Sheets');
const statC2Sheets = document.getElementById('statC2Sheets');
const statHandSwaps = document.getElementById('statHandSwaps');
const statSwappedC1 = document.getElementById('statSwappedC1');
const statSwappedC2 = document.getElementById('statSwappedC2');
const statCartons = document.getElementById('statCartons');
const statGridDims = document.getElementById('statGridDims');
const statC1Detail = document.getElementById('statC1Detail');
const statC2Detail = document.getElementById('statC2Detail');
const statSpares = document.getElementById('statSpares');

// --- Pipeline stage 6: takeoff dashboard bar ---
export function renderDashboard(inv) {
    statTotalSheets.textContent = inv.totalSheets;
    statGridDims.textContent = `(${inv.gridCols} cols × ${inv.gridRows} rows)`;
    statC1Sheets.textContent = `${inv.buyC1} sheets`;
    statC1Detail.textContent = `${inv.leftoverC1} tiles left`;
    statC2Sheets.textContent = `${inv.buyC2} sheets`;
    statC2Detail.textContent = `${inv.leftoverC2} tiles left`;
    statHandSwaps.textContent = `${inv.handSwaps} tiles`;
    statSwappedC1.textContent = inv.swappedC1;
    statSwappedC2.textContent = inv.swappedC2;
    statSpares.textContent = `${inv.spareC1} C1, ${inv.spareC2} C2`;
    statCartons.textContent = `${inv.buy} sheets (${inv.buyC1} C1 + ${inv.buyC2} C2)`;
}

// --- Multi-wall takeoff ---
// Each saved wall is { name, settings }: its WALL_KEYS values. Colors are shared, so a saved
// wall shows in the current colors. Counts are recomputed from the settings (they don't
// depend on colors) and cached per settings object.
let savedWalls = [];
const wallCounts = new WeakMap();

// The saved wall last saved, loaded or updated. The card shows its name, marked
// "(unsaved)" once the wall being edited differs from it; its list entry gets Update.
// Reset, removing it and applying a config unlink it.
let linkedWall = null;
let linkedShownUnsaved = false; // what the list last rendered, to re-render on a flip

function isUnsaved(s) {
    return !WALL_KEYS.every(key => JSON.stringify(s[key]) === JSON.stringify(linkedWall.settings[key]));
}

export function currentWall(s) {
    if (!linkedWall || !savedWalls.includes(linkedWall)) return null;
    return { name: linkedWall.name, unsaved: isUnsaved(s) };
}

export function unlinkWall() {
    linkedWall = null;
    renderSavedWallsList();
}

// State listener: re-renders the list only when the linked entry's unsaved mark flips
export function syncSavedWallsList() {
    if (linkedWall && isUnsaved(state) !== linkedShownUnsaved) renderSavedWallsList();
}

export function getSavedWalls() {
    return savedWalls;
}

export function setSavedWalls(walls) {
    savedWalls = walls.slice();
    linkedWall = null;
    renderSavedWallsList();
    scheduleRender();
}

// Every saved wall's counts, and the total pooled across them: sheets and tile balances are
// summed and settled once, so one wall's spares and pulled-out tiles cover another's swaps.
export function pooledTakeoff() {
    const walls = savedWalls.map(w => ({ name: w.name, settings: w.settings, inv: countsFor(w.settings) }));
    const sum = (key) => walls.reduce((n, w) => n + w.inv[key], 0);
    return {
        walls,
        sheetsOnWalls: sum('totalSheets'),
        swappedC1: sum('swappedC1'),
        swappedC2: sum('swappedC2'),
        c1: settleColor(sum('c1Sheets'), sum('balanceC1')),
        c2: settleColor(sum('c2Sheets'), sum('balanceC2'))
    };
}

function countsFor(settings) {
    if (!wallCounts.has(settings)) {
        wallCounts.set(settings, computeWall(normalizeState({ ...state, ...settings })).inventory);
    }
    return wallCounts.get(settings);
}

export function saveCurrentWallToTakeoff() {
    const name = `Wall ${savedWalls.length + 1}`;
    const settings = wallSettings(state);
    if (lastInventory && lastState === state) wallCounts.set(settings, lastInventory);
    linkedWall = { name, settings };
    savedWalls.push(linkedWall);
    renderSavedWallsList();
    scheduleRender();
}

// Overwrites the linked entry with the current wall, keeping its name and place
function updateLinkedWall() {
    const settings = wallSettings(state);
    if (lastInventory && lastState === state) wallCounts.set(settings, lastInventory);
    linkedWall.settings = settings;
    renderSavedWallsList();
    scheduleRender();
}

const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function renderSavedWallsList() {
    const list = document.getElementById('savedWallsList');
    linkedShownUnsaved = Boolean(linkedWall) && isUnsaved(state);
    for (const id of ['exportWallsZipBtn', 'exportInventoryBtn']) {
        const btn = document.getElementById(id);
        if (btn.textContent.trim().endsWith('…')) continue; // an export is running
        btn.disabled = savedWalls.length === 0;
    }
    if (savedWalls.length === 0) {
        list.innerHTML = `<div class="text-[11px] text-slate-500 italic p-1">No additional walls saved.</div>`;
        return;
    }

    let html = '';
    const total = pooledTakeoff();

    savedWalls.forEach((w, idx) => {
        const inv = total.walls[idx].inv;
        const voidCount = w.settings.voids.filter(v => !v.measureOnly).length;

        const linked = (w === linkedWall);
        const unsaved = linked && linkedShownUnsaved;
        html += `
            <div data-wall-index="${idx}" class="flex items-center justify-between bg-slate-950 p-2 rounded border ${linked ? 'border-cyan-600' : 'border-slate-800'} text-[11px]">
                <div class="flex items-start gap-2 min-w-0">
                    <span data-drag-handle class="text-slate-600 hover:text-slate-400 cursor-grab select-none leading-4 touch-none" title="Drag to reorder">⋮⋮</span>
                    <div class="min-w-0">
                        <button type="button" data-action="rename" class="font-medium text-slate-200 hover:text-cyan-300 text-left truncate max-w-full" title="Click to rename">${escapeHtml(w.name)}</button>${unsaved ? '<span class="text-amber-400 text-[10px] font-mono ml-1">(unsaved)</span>' : ''}
                        <span class="text-slate-300 block font-mono">C1: ${inv.buyC1} sheets, ${inv.leftoverC1} left | C2: ${inv.buyC2} sheets, ${inv.leftoverC2} left</span>
                        <span class="text-slate-500 block font-mono">${inv.totalSheets} sheets on wall${voidCount ? `, ${voidCount} voids` : ''}${w.settings.invertColors ? ', inverted' : ''}</span>
                        <span class="text-amber-400 text-[10px] block font-mono">Swaps: ${inv.handSwaps} (${inv.swappedC1} C1, ${inv.swappedC2} C2)</span>
                    </div>
                </div>
                <div class="flex items-center gap-2 ml-2">
                    ${linked ? `<button type="button" data-action="update" class="text-amber-400 hover:text-amber-300 disabled:text-slate-600 disabled:cursor-default" title="${unsaved ? 'Save the current changes into this wall' : 'No changes to save'}" ${unsaved ? '' : 'disabled'}>Update</button>` : ''}
                    <button type="button" data-action="load" class="text-cyan-400 hover:text-cyan-300" title="Load this wall">Load</button>
                    <button type="button" data-action="remove" class="text-rose-400 hover:text-rose-300" title="Remove from takeoff">✕</button>
                </div>
            </div>
        `;
    });

    const { c1, c2 } = total;
    html += `
        <div class="pt-2 border-t border-slate-800 font-mono text-[11px] text-cyan-300">
            <div>Total Takeoff: ${c1.buy + c2.buy} sheets (${c1.buy} C1 + ${c2.buy} C2)</div>
            <div class="text-slate-400">Leftover: ${c1.leftover} C1, ${c2.leftover} C2 tiles | ${total.sheetsOnWalls} sheets on walls</div>
            <div class="text-amber-400 text-[10px]">Total Swaps: ${total.swappedC1 + total.swappedC2} (${total.swappedC1} C1, ${total.swappedC2} C2)</div>
        </div>
    `;

    list.innerHTML = html;
}

// Replaces the name button with an input. Enter or leaving the field saves; Escape cancels.
function startRename(row, index) {
    const nameBtn = row.querySelector('[data-action="rename"]');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = savedWalls[index].name;
    input.maxLength = 60;
    input.className = 'w-full bg-slate-900 border border-cyan-600 rounded px-1.5 py-0.5 text-[11px] text-slate-100 focus:outline-none';
    nameBtn.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const finish = (save) => {
        if (done) return;
        done = true;
        if (save) savedWalls[index].name = sanitizeWallName(input.value, savedWalls[index].name);
        renderSavedWallsList();
        scheduleRender();
    };
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
}

// Drag a row by its handle; the row moves in the DOM while dragging and the new order is
// applied on release. Pointer events, so it also works with touch.
function bindDragReorder(list) {
    let drag = null;
    list.addEventListener('pointerdown', (e) => {
        const handle = e.target.closest('[data-drag-handle]');
        if (!handle || e.button !== 0) return;
        e.preventDefault();
        const row = handle.closest('[data-wall-index]');
        try {
            list.setPointerCapture(e.pointerId);
        } catch {
            // no active pointer with this id (synthetic event); moves still reach the list
        }
        row.classList.add('opacity-60', 'border-cyan-600');
        drag = { row, pointerId: e.pointerId };
    });
    list.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.pointerId) return;
        const rows = [...list.querySelectorAll('[data-wall-index]')].filter(r => r !== drag.row);
        const before = rows.find(r => {
            const rect = r.getBoundingClientRect();
            return e.clientY < rect.top + rect.height / 2;
        });
        if (before) list.insertBefore(drag.row, before);
        else rows.length && rows[rows.length - 1].after(drag.row);
    });
    const end = (e, apply) => {
        if (!drag || e.pointerId !== drag.pointerId) return;
        drag = null;
        if (apply) {
            const order = [...list.querySelectorAll('[data-wall-index]')].map(r => Number(r.dataset.wallIndex));
            savedWalls = order.map(i => savedWalls[i]);
        }
        renderSavedWallsList();
    };
    list.addEventListener('pointerup', (e) => end(e, true));
    list.addEventListener('pointercancel', (e) => end(e, false));
}

export function bindSavedWallsList() {
    const list = document.getElementById('savedWallsList');
    list.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        const row = e.target.closest('[data-wall-index]');
        if (!btn || !row) return;
        const index = Number(row.dataset.wallIndex);
        const wall = savedWalls[index];
        if (!wall) return;
        if (btn.dataset.action === 'remove') {
            savedWalls.splice(index, 1);
            if (wall === linkedWall) linkedWall = null;
            renderSavedWallsList();
            scheduleRender();
        } else if (btn.dataset.action === 'load') {
            // Only the wall's own settings; the shared colors stay
            linkedWall = wall;
            setState(wall.settings);
            renderSavedWallsList(); // highlight, even when the settings didn't change
        } else if (btn.dataset.action === 'update') {
            updateLinkedWall();
        } else if (btn.dataset.action === 'rename') {
            startRename(row, index);
        }
    });
    bindDragReorder(list);
}
