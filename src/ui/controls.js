// Sidebar controls: state to inputs (syncControls), input bindings, void list.
import { downloadCanvasPNG, nav, scheduleRender } from '../app.js';
import { ZOOM_STEP } from '../constants.js';
import { FADES, getNormalizedZones } from '../fades.js';
import { DEFAULTS, VOID_SNAP_INCHES, commitVoidClip, setState, snapInches, state } from '../state.js';
import { applyConfigJson, closeConfigModal, copyConfigJson, openConfigModal } from './config-modal.js';
import { bindCanvasPointer, canvasCenter, deleteVoid, zoomAt } from './pointer.js';
import { bindSavedWallsList, saveCurrentWallToTakeoff } from './takeoff.js';

const inputWidth = document.getElementById('wallWidthInches');
const inputTotalHeight = document.getElementById('wallTotalHeightInches');
const sliderTiledHeight = document.getElementById('tiledHeightInches');
const tiledHeightVal = document.getElementById('tiledHeightVal');
const paintSpanLabel = document.getElementById('paintSpanLabel');

const sliderC2 = document.getElementById('sliderC2');
const sliderTrans = document.getElementById('sliderTrans');
const c2PctVal = document.getElementById('c2PctVal');
const transPctVal = document.getElementById('transPctVal');
const c1PctVal = document.getElementById('c1PctVal');

const barC2 = document.getElementById('barC2');
const barTrans = document.getElementById('barTrans');
const barC1 = document.getElementById('barC1');

const sliderOutlier = document.getElementById('sliderOutlier');
const outlierVal = document.getElementById('outlierVal');
const algorithmSelect = document.getElementById('algorithmSelect');

const inputTile1 = document.getElementById('colorTile1');
const inputTile2 = document.getElementById('colorTile2');
const inputPaint = document.getElementById('colorPaint');
const inputGrout = document.getElementById('colorGrout');

const hexTile1 = document.getElementById('hexTile1');
const hexTile2 = document.getElementById('hexTile2');
const hexPaint = document.getElementById('hexPaint');
const hexGrout = document.getElementById('hexGrout');

const showSheetOverlayCheck = document.getElementById('showSheetOverlayCheck');
const voidList = document.getElementById('voidList');
// Push state into every control and readout. A number input that has focus is left alone
// so typing isn't overwritten mid-edit; its 'change' event re-syncs it once editing ends.
export function syncControls() {
    const s = state;
    const setValue = (el, v) => {
        if (el === document.activeElement && el.type === 'number') return;
        el.value = v;
    };

    setValue(inputWidth, s.wallWidthInches);
    setValue(inputTotalHeight, s.wallTotalHeightInches);
    sliderTiledHeight.max = s.wallTotalHeightInches;
    setValue(sliderTiledHeight, s.tiledHeightInches);

    setValue(sliderC2, s.floorPercent);
    setValue(sliderTrans, s.transPercent);
    setValue(sliderOutlier, s.outlierPct);
    outlierVal.textContent = s.outlierPct.toFixed(1) + '%';
    algorithmSelect.value = s.algorithm;

    setValue(inputTile1, s.colorTile1);
    setValue(inputTile2, s.colorTile2);
    setValue(inputPaint, s.colorPaint);
    setValue(inputGrout, s.colorGrout);
    hexTile1.textContent = s.colorTile1.toUpperCase();
    hexTile2.textContent = s.colorTile2.toUpperCase();
    hexPaint.textContent = s.colorPaint.toUpperCase();
    hexGrout.textContent = s.colorGrout.toUpperCase();

    showSheetOverlayCheck.checked = s.showSheetOverlay;
    syncVoidList(s, setValue);

    const zones = getNormalizedZones(s);
    c2PctVal.textContent = Math.round(zones.floorPct) + '%';
    transPctVal.textContent = Math.round(zones.transPct) + '%';
    c1PctVal.textContent = Math.round(zones.wallPct) + '%';

    barC2.style.width = zones.floorPct + '%';
    barTrans.style.width = zones.transPct + '%';
    barC1.style.width = zones.wallPct + '%';

    tiledHeightVal.textContent = s.tiledHeightInches + '″';
    const paintH = Math.max(0, s.wallTotalHeightInches - s.tiledHeightInches);
    paintSpanLabel.textContent = `Paint above ${s.tiledHeightInches}″ (${paintH.toFixed(1)}″ un-tiled)`;
}

// --- Event Listeners & Interactive Handlers ---

export function bindInputs() {
    algorithmSelect.replaceChildren(...Object.entries(FADES).map(([id, f]) => new Option(f.label, id)));

    // Numeric fields: ignore unparseable text (e.g. an empty field mid-edit) instead of
    // snapping to a default; re-sync the clamped value when editing ends.
    const bindNumber = (el, key) => {
        el.addEventListener('input', () => {
            const v = parseFloat(el.value);
            if (Number.isFinite(v)) setState({ [key]: v });
        });
        el.addEventListener('change', syncControls);
    };

    // Wall Dimensions
    bindNumber(inputWidth, 'wallWidthInches');
    bindNumber(inputTotalHeight, 'wallTotalHeightInches');
    // Voids are trimmed to a smaller wall only once the edit is committed
    inputWidth.addEventListener('change', commitVoidClip);
    inputTotalHeight.addEventListener('change', commitVoidClip);
    bindVoidList();
    bindNumber(sliderTiledHeight, 'tiledHeightInches');

    // Sub-Zones
    bindNumber(sliderC2, 'floorPercent');
    bindNumber(sliderTrans, 'transPercent');
    bindNumber(sliderOutlier, 'outlierPct');

    algorithmSelect.addEventListener('change', (e) => setState({ algorithm: e.target.value }));

    // Color Pickers
    inputTile1.addEventListener('input', (e) => setState({ colorTile1: e.target.value }));
    inputTile2.addEventListener('input', (e) => setState({ colorTile2: e.target.value }));
    inputPaint.addEventListener('input', (e) => setState({ colorPaint: e.target.value }));
    inputGrout.addEventListener('input', (e) => setState({ colorGrout: e.target.value }));

    // Sheet Overlay Toggle
    showSheetOverlayCheck.addEventListener('change', (e) => setState({ showSheetOverlay: e.target.checked }));

    // Re-Seed
    document.getElementById('randomizeSeedBtn').addEventListener('click', () => {
        setState({ seed: Math.floor(Math.random() * 1000000), manualOverrides: {} });
    });

    // Reset Defaults
    document.getElementById('resetDefaultsBtn').addEventListener('click', resetDefaults);

    // Download PNG
    document.getElementById('downloadPngBtn').addEventListener('click', downloadCanvasPNG);

    // Canvas pointer: click flips a tile, Shift+drag pans, wheel/pinch zooms
    bindCanvasPointer();
    document.getElementById('zoomInBtn').addEventListener('click', () => zoomAt(canvasCenter(), nav.zoom * ZOOM_STEP));
    document.getElementById('zoomOutBtn').addEventListener('click', () => zoomAt(canvasCenter(), nav.zoom / ZOOM_STEP));
    document.getElementById('zoomFitBtn').addEventListener('click', () => {
        Object.assign(nav, { zoom: 1, panX: 0, panY: 0 });
        scheduleRender();
    });

    // Multi-Wall Takeoff
    document.getElementById('addWallToTakeoffBtn').addEventListener('click', saveCurrentWallToTakeoff);
    bindSavedWallsList();

    // Config Modal
    document.getElementById('openConfigModalBtn').addEventListener('click', openConfigModal);
    document.getElementById('closeConfigModalBtn').addEventListener('click', closeConfigModal);
    document.getElementById('cancelModalBtn').addEventListener('click', closeConfigModal);
    document.getElementById('copyJsonBtn').addEventListener('click', copyConfigJson);
    document.getElementById('applyJsonBtn').addEventListener('click', applyConfigJson);
}

function resetDefaults() {
    setState({ ...DEFAULTS, manualOverrides: {} });
}

// --- Void list (sidebar) ---
// Rows are rebuilt only when the set of voids changes, so typing in a field keeps focus.
// Typing updates the void live; leaving the field (change) snaps to 1/16″ and clips to the wall.
const VOID_FIELDS = [['w', 'W'], ['h', 'H'], ['x', 'X'], ['y', 'Y']];

function syncVoidList(s, setValue) {
    const ids = s.voids.map(v => v.id).join(',');
    if (voidList.dataset.ids !== ids) {
        voidList.dataset.ids = ids;
        if (!s.voids.length) {
            voidList.innerHTML = '<div class="text-[11px] text-slate-500 italic p-1">No voids. Drag on the wall to mark a window, niche or outlet box.</div>';
        }
        else {
            voidList.innerHTML = s.voids.map((v, i) => `
                <div class="bg-slate-950 p-2 rounded border border-slate-800" data-void-id="${v.id}">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-[11px] font-mono text-fuchsia-400">Void ${i + 1}</span>
                        <button type="button" data-action="delete" class="text-rose-400 hover:text-rose-300" title="Delete void">✕</button>
                    </div>
                    <div class="grid grid-cols-4 gap-1.5">
                        ${VOID_FIELDS.map(([field, label]) => `
                            <label class="block text-[10px] text-slate-500">${label}
                                <input type="number" step="0.0625" data-field="${field}" class="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[11px] font-mono text-cyan-300 focus:outline-none focus:border-cyan-500">
                            </label>`).join('')}
                    </div>
                </div>`).join('');
        }
    }
    for (const v of s.voids) {
        const row = voidList.querySelector(`[data-void-id="${v.id}"]`);
        for (const [field] of VOID_FIELDS) setValue(row.querySelector(`[data-field="${field}"]`), +v[field].toFixed(4));
    }
}

function bindVoidList() {
    const target = (e) => {
        const row = e.target.closest('[data-void-id]');
        return row ? { id: Number(row.dataset.voidId), field: e.target.dataset.field } : null;
    };
    voidList.addEventListener('input', (e) => {
        const t = target(e);
        if (!t || !t.field) return;
        const value = parseFloat(e.target.value);
        if (!Number.isFinite(value) || ((t.field === 'w' || t.field === 'h') && value <= 0)) return;
        setState({ voids: state.voids.map(v => v.id === t.id ? { ...v, [t.field]: value } : v) });
    });
    voidList.addEventListener('change', (e) => {
        const t = target(e);
        if (!t || !t.field) return;
        const snap = (field, value) => (field === 'w' || field === 'h')
            ? Math.max(VOID_SNAP_INCHES, snapInches(value))
            : snapInches(value);
        setState({ voids: state.voids.map(v => v.id === t.id ? { ...v, [t.field]: snap(t.field, v[t.field]) } : v) });
        commitVoidClip();
        syncControls();
    });
    voidList.addEventListener('click', (e) => {
        const t = target(e);
        if (t && e.target.closest('[data-action="delete"]')) deleteVoid(t.id);
    });
}
