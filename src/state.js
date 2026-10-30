// The single app state: defaults, limits, validation, voids, and setState with change listeners.
import { ALGORITHMS } from './fades.js';
import { clipVoidsToWall } from './geometry.js';

// --- Core Application State ---
// Single source of truth for defaults. Controls are filled from state by syncControls().
export const DEFAULTS = Object.freeze({
    wallWidthInches: 81,
    wallTotalHeightInches: 108,
    tiledHeightInches: 66,

    floorPercent: 83,   // bottom band (Color 2); Color 1's top band is derived
    transPercent: 6,

    outlierPct: 6.5,
    algorithm: 'lightning',
    seed: 42891,

    colorTile1: '#ffffff', // top
    colorTile2: '#121316', // bottom
    colorPaint: '#b3faff',
    colorGrout: '#333333',

    // Paints Color 2 in the top band and Color 1 in the bottom one; the pattern is unchanged
    invertColors: false,

    showSheetOverlay: true,
    // Keyed by overrideKey() (`${sRow}_${sCol}_t${n}`); value is the color shown (C1 = 0, C2 = 1)
    manualOverrides: Object.freeze({}),
    // Cutouts in wall inches: { id, x, y, w, h }, (x, y) = bottom-left corner
    voids: Object.freeze([])
});

// [min, max] for numeric state. tiledHeightInches is further capped at wallTotalHeightInches.
const LIMITS = {
    wallWidthInches: [12, 240],
    wallTotalHeightInches: [24, 240],
    tiledHeightInches: [12, 240],
    floorPercent: [0, 95],
    transPercent: [2, 60],
    outlierPct: [0, 25]
};

export const COLOR_KEYS = ['colorTile1', 'colorTile2', 'colorPaint', 'colorGrout'];
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
const OVERRIDE_KEY_RE = /^\d+_\d+_t([0-9]|[12]\d|3[0-5])$/;

export const VOID_SNAP_INCHES = 1 / 16;

export function snapInches(v) {
    return Math.round(v / VOID_SNAP_INCHES) * VOID_SNAP_INCHES;
}

// Keeps well-formed voids (finite numbers, positive size) and gives each a unique id.
// Voids are not clipped to the wall here: that happens when an edit is committed
// (clipVoidsToWall), so typing a smaller width doesn't destroy them mid-edit.
export function sanitizeVoids(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    const used = new Set();
    for (const v of raw) {
        if (!v || typeof v !== 'object') continue;
        const [x, y, w, h] = [v.x, v.y, v.w, v.h].map(Number);
        if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;
        const id = (Number.isInteger(v.id) && v.id > 0 && !used.has(v.id)) ? v.id : null;
        if (id) used.add(id);
        out.push({ id, x, y, w, h });
    }
    let nextId = Math.max(0, ...used) + 1;
    for (const v of out) if (v.id === null) v.id = nextId++;
    return out;
}

// Trims stored voids to the current wall; voids left with no area are deleted.
// Called when a wall-size or void edit is committed, and on config import.
export function commitVoidClip() {
    const clipped = clipVoidsToWall(state);
    const changed = clipped.length !== state.voids.length ||
        clipped.some((v, i) => v.x !== state.voids[i].x || v.y !== state.voids[i].y || v.w !== state.voids[i].w || v.h !== state.voids[i].h);
    if (changed) setState({ voids: clipped });
}

export function sanitizeOverrides(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [key, idx] of Object.entries(raw)) {
        if (OVERRIDE_KEY_RE.test(key) && (idx === 0 || idx === 1)) out[key] = idx;
    }
    return out;
}

// Returns a fully valid state. Invalid fields fall back to `prev`; numbers are clamped.
export function normalizeState(s, prev = DEFAULTS) {
    const out = {};
    for (const [key, range] of Object.entries(LIMITS)) {
        const n = typeof s[key] === 'number' ? s[key] : parseFloat(s[key]);
        out[key] = Number.isFinite(n) ? Math.min(range[1], Math.max(range[0], n)) : prev[key];
    }
    out.tiledHeightInches = Math.min(out.tiledHeightInches, out.wallTotalHeightInches);

    out.algorithm = ALGORITHMS.includes(s.algorithm) ? s.algorithm : prev.algorithm;

    const seed = parseInt(s.seed, 10);
    out.seed = Number.isFinite(seed) ? seed : prev.seed;

    for (const key of COLOR_KEYS) {
        out[key] = HEX_COLOR_RE.test(s[key]) ? s[key].toLowerCase() : prev[key];
    }

    out.invertColors = Boolean(s.invertColors);
    out.showSheetOverlay = Boolean(s.showSheetOverlay);
    out.manualOverrides = sanitizeOverrides(s.manualOverrides);
    out.voids = sanitizeVoids(s.voids);
    return out;
}

// Settings that belong to one wall. The tile/paint/grout colors and the sheet overlay are
// shared by all walls.
export const WALL_KEYS = Object.freeze([
    'wallWidthInches', 'wallTotalHeightInches', 'tiledHeightInches',
    'floorPercent', 'transPercent', 'outlierPct', 'algorithm', 'seed',
    'invertColors', 'manualOverrides', 'voids'
]);

export function wallSettings(s) {
    return Object.fromEntries(WALL_KEYS.map(key => [key, s[key]]));
}

export let state = normalizeState(DEFAULTS);

// Called after every state change, in registration order (controls, then render)
const stateListeners = [];
export function onStateChange(fn) {
    stateListeners.push(fn);
}

export function setState(patch) {
    state = normalizeState({ ...state, ...patch }, state);
    for (const fn of stateListeners) fn(state);
}
