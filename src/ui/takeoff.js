// Takeoff bar and the saved-walls list.
import { computeWall, lastInventory, lastState, scheduleRender } from '../app.js';
import { sanitizeWallName } from '../config.js';
import { SHEETS_PER_BOX, WASTE_FACTOR } from '../constants.js';
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
    const boxes = (n) => `${n} ${n === 1 ? 'box' : 'boxes'}`;
    statTotalSheets.textContent = inv.totalSheets;
    statGridDims.textContent = `(${inv.gridCols} cols × ${inv.gridRows} rows)`;
    statC1Sheets.textContent = `${inv.c1Sheets} sheets`;
    statC1Detail.textContent = `+${inv.extraC1} extra · ${boxes(inv.boxesC1)}`;
    statC2Sheets.textContent = `${inv.c2Sheets} sheets`;
    statC2Detail.textContent = `+${inv.extraC2} extra · ${boxes(inv.boxesC2)}`;
    statHandSwaps.textContent = `${inv.handSwaps} tiles`;
    statSwappedC1.textContent = inv.swappedC1;
    statSwappedC2.textContent = inv.swappedC2;
    statSpares.textContent = `${inv.spareC1} C1, ${inv.spareC2} C2`;
    statCartons.textContent = `${boxes(inv.boxes)} (${inv.boxesC1} C1 + ${inv.boxesC2} C2)`;
}

// --- Multi-wall takeoff ---
// Each saved wall is { name, settings }: its WALL_KEYS values. Colors are shared, so a saved
// wall shows in the current colors. Counts are recomputed from the settings (they don't
// depend on colors) and cached per settings object.
let savedWalls = [];
const wallCounts = new WeakMap();

// The saved wall last saved or loaded. The card shows its name while the wall being
// edited still has exactly its settings.
let linkedWall = null;

export function currentWallName(s) {
    if (!linkedWall || !savedWalls.includes(linkedWall)) return '';
    const same = WALL_KEYS.every(key => JSON.stringify(s[key]) === JSON.stringify(linkedWall.settings[key]));
    return same ? linkedWall.name : '';
}

export function getSavedWalls() {
    return savedWalls;
}

export function setSavedWalls(walls) {
    savedWalls = walls.slice();
    renderSavedWallsList();
    scheduleRender();
}

function countsFor(settings) {
    if (!wallCounts.has(settings)) {
        wallCounts.set(settings, computeWall(normalizeState({ ...state, ...settings })).inventory);
    }
    return wallCounts.get(settings);
}

export function saveCurrentWallToTakeoff() {
    const name = `Wall ${savedWalls.length + 1} (${state.wallWidthInches}″ × ${state.wallTotalHeightInches}″)`;
    const settings = wallSettings(state);
    if (lastInventory && lastState === state) wallCounts.set(settings, lastInventory);
    linkedWall = { name, settings };
    savedWalls.push(linkedWall);
    renderSavedWallsList();
    scheduleRender();
}

const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function renderSavedWallsList() {
    const list = document.getElementById('savedWallsList');
    if (savedWalls.length === 0) {
        list.innerHTML = `<div class="text-[11px] text-slate-500 italic p-1">No additional walls saved.</div>`;
        return;
    }

    let html = '';
    let aggSheets = 0;
    let aggC1 = 0;
    let aggC2 = 0;
    let aggSwaps = 0;
    let aggSwapsC1 = 0;
    let aggSwapsC2 = 0;
    let aggExtraC1 = 0;
    let aggExtraC2 = 0;

    savedWalls.forEach((w, idx) => {
        const inv = countsFor(w.settings);
        const voidCount = w.settings.voids.filter(v => !v.measureOnly).length;
        aggExtraC1 += inv.extraC1;
        aggExtraC2 += inv.extraC2;
        aggSheets += inv.totalSheets;
        aggC1 += inv.c1Sheets;
        aggC2 += inv.c2Sheets;
        aggSwaps += inv.handSwaps;
        aggSwapsC1 += inv.swappedC1;
        aggSwapsC2 += inv.swappedC2;

        html += `
            <div data-wall-index="${idx}" class="flex items-center justify-between bg-slate-950 p-2 rounded border border-slate-800 text-[11px]">
                <div class="flex items-start gap-2 min-w-0">
                    <span data-drag-handle class="text-slate-600 hover:text-slate-400 cursor-grab select-none leading-4 touch-none" title="Drag to reorder">⋮⋮</span>
                    <div class="min-w-0">
                        <button type="button" data-action="rename" class="font-medium text-slate-200 hover:text-cyan-300 text-left truncate max-w-full" title="Click to rename">${escapeHtml(w.name)}</button>
                        <span class="text-slate-500 block font-mono">C1: ${inv.c1Sheets}+${inv.extraC1} | C2: ${inv.c2Sheets}+${inv.extraC2} (${inv.totalSheets} sheets${voidCount ? `, ${voidCount} voids` : ''}${w.settings.invertColors ? ', inverted' : ''})</span>
                        <span class="text-amber-400 text-[10px] block font-mono">Swaps: ${inv.handSwaps} (${inv.swappedC1} C1, ${inv.swappedC2} C2)</span>
                    </div>
                </div>
                <div class="flex items-center gap-2 ml-2">
                    <button type="button" data-action="load" class="text-cyan-400 hover:text-cyan-300" title="Load this wall">Load</button>
                    <button type="button" data-action="remove" class="text-rose-400 hover:text-rose-300" title="Remove from takeoff">✕</button>
                </div>
            </div>
        `;
    });

    // Boxes per color across all walls, with standard waste
    const boxesC1 = Math.ceil(((aggC1 + aggExtraC1) * WASTE_FACTOR) / SHEETS_PER_BOX);
    const boxesC2 = Math.ceil(((aggC2 + aggExtraC2) * WASTE_FACTOR) / SHEETS_PER_BOX);
    html += `
        <div class="pt-2 border-t border-slate-800 font-mono text-[11px] text-cyan-300">
            <div>Total Takeoff: ${aggSheets} sheets (${boxesC1 + boxesC2} boxes: ${boxesC1} C1 + ${boxesC2} C2)</div>
            <div class="text-slate-400">Total C1: ${aggC1}+${aggExtraC1} extra | Total C2: ${aggC2}+${aggExtraC2} extra</div>
            <div class="text-amber-400 text-[10px]">Total Swaps: ${aggSwaps} (${aggSwapsC1} C1, ${aggSwapsC2} C2)</div>
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
            renderSavedWallsList();
            scheduleRender();
        } else if (btn.dataset.action === 'load') {
            // Only the wall's own settings; the shared colors stay
            linkedWall = wall;
            setState(wall.settings);
        } else if (btn.dataset.action === 'rename') {
            startRename(row, index);
        }
    });
    bindDragReorder(list);
}
