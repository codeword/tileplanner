// Takeoff bar and the saved-walls list.
import { lastInventory } from '../app.js';
import { configFromState, stateFromConfig } from '../config.js';
import { C1, C2, SHEETS_PER_BOX, WASTE_FACTOR } from '../constants.js';
import { setState, state } from '../state.js';

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

// Multi-Wall Takeoff
const savedWalls = [];

export function saveCurrentWallToTakeoff() {
    if (!lastInventory) return;
    const wallName = `Wall ${savedWalls.length + 1} (${state.wallWidthInches}″ × ${state.wallTotalHeightInches}″)`;
    const inv = lastInventory;

    // The config reproduces the wall exactly; the counts are kept for the totals
    savedWalls.push({
        name: wallName,
        config: configFromState(state),
        sheetsTotal: inv.totalSheets,
        c1Sheets: inv.c1Sheets,
        c2Sheets: inv.c2Sheets,
        handSwaps: inv.handSwaps,
        swapsC1: inv.swappedC1,
        swapsC2: inv.swappedC2,
        extraC1: inv.extraC1,
        extraC2: inv.extraC2,
        voidCount: state.voids.length
    });

    renderSavedWallsList();
}

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
        aggExtraC1 += w.extraC1;
        aggExtraC2 += w.extraC2;
        aggSheets += w.sheetsTotal;
        aggC1 += w.c1Sheets;
        aggC2 += w.c2Sheets;
        aggSwaps += w.handSwaps;
        aggSwapsC1 += (w.swapsC1 || 0);
        aggSwapsC2 += (w.swapsC2 || 0);

        html += `
            <div class="flex items-center justify-between bg-slate-950 p-2 rounded border border-slate-800 text-[11px]">
                <div>
                    <span class="font-medium text-slate-200">${w.name}</span>
                    <span class="text-slate-500 block font-mono">C1: ${w.c1Sheets}+${w.extraC1} | C2: ${w.c2Sheets}+${w.extraC2} (${w.sheetsTotal} sheets${w.voidCount ? `, ${w.voidCount} voids` : ''})</span>
                    <span class="text-amber-400 text-[10px] block font-mono">Swaps: ${w.handSwaps} (${w.swapsC1} C1, ${w.swapsC2} C2)</span>
                </div>
                <div class="flex items-center gap-2 ml-2">
                    <button data-action="load" data-index="${idx}" class="text-cyan-400 hover:text-cyan-300" title="Load this wall">Load</button>
                    <button data-action="remove" data-index="${idx}" class="text-rose-400 hover:text-rose-300" title="Remove from takeoff">✕</button>
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

export function bindSavedWallsList() {
    document.getElementById('savedWallsList').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const index = Number(btn.dataset.index);
        const wall = savedWalls[index];
        if (!wall) return;
        if (btn.dataset.action === 'remove') {
            savedWalls.splice(index, 1);
            renderSavedWallsList();
        } else if (btn.dataset.action === 'load') {
            // Saved by this version, so nothing is adjusted
            setState(stateFromConfig(wall.config, state).next);
        }
    });
}
