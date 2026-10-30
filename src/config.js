// Config JSON: state to config, and config (any version) to state with warnings.
import { C1, C2, CONFIG_VERSION } from './constants.js';
import { clipVoidsToWall, floorRowIndex, overrideKey } from './geometry.js';
import { normalizeState, sanitizeOverrides, sanitizeVoids } from './state.js';

// --- Config JSON ---

export function configFromState(s) {
    return {
        version: CONFIG_VERSION,
        physicalWallInches: {
            width: s.wallWidthInches,
            totalHeight: s.wallTotalHeightInches,
            tiledHeight: s.tiledHeightInches
        },
        colors: {
            color1: s.colorTile1, // top
            color2: s.colorTile2, // bottom
            paintedWall: s.colorPaint,
            grout: s.colorGrout
        },
        // Color 1 (top) gets 100 − color2Percent − transitionPercent
        tiledSubZones: {
            color2Percent: s.floorPercent,
            transitionPercent: s.transPercent
        },
        algorithm: {
            type: s.algorithm,
            outlierScatterPercent: s.outlierPct,
            seed: s.seed
        },
        // Keys are `${col}_f${tierAboveFloor}_${type}`, values 0 (C1, top) or 1 (C2, bottom)
        manualOverrides: { ...s.manualOverrides },
        // Inches from the floor at the left wall edge; (x, y) is the bottom-left corner
        voids: s.voids.map(v => ({ x: v.x, y: v.y, width: v.w, height: v.h }))
    };
}

// Maps the fields present in a parsed config onto a state patch. Absent fields keep
// their current value; validation and clamping happen in normalizeState.
// Before v3, color1 and its percent were the bottom color, so they map to Color 2.
function configToPatch(parsed, version) {
    const bottomFirst = version < 3;
    const patch = {};
    const wall = parsed.physicalWallInches || {};
    if (wall.width !== undefined) patch.wallWidthInches = wall.width;
    if (wall.totalHeight !== undefined) patch.wallTotalHeightInches = wall.totalHeight;
    if (wall.tiledHeight !== undefined) patch.tiledHeightInches = wall.tiledHeight;

    const colors = parsed.colors || {};
    const color1 = colors.color1 || colors.tile1FloorBase;
    const color2 = colors.color2 || colors.tile2WallBase;
    const top = bottomFirst ? color2 : color1;
    const bottom = bottomFirst ? color1 : color2;
    if (top) patch.colorTile1 = top;
    if (bottom) patch.colorTile2 = bottom;
    if (colors.paintedWall) patch.colorPaint = colors.paintedWall;
    if (colors.grout) patch.colorGrout = colors.grout;

    const zones = parsed.tiledSubZones || {};
    const bottomPercent = bottomFirst
        ? (zones.color1Percent !== undefined ? zones.color1Percent : zones.floorPercent)
        : zones.color2Percent;
    if (bottomPercent !== undefined) patch.floorPercent = bottomPercent;
    if (zones.transitionPercent !== undefined) patch.transPercent = zones.transitionPercent;

    const algo = parsed.algorithm || {};
    if (algo.type !== undefined) patch.algorithm = algo.type;
    if (algo.outlierScatterPercent !== undefined) patch.outlierPct = algo.outlierScatterPercent;
    if (algo.seed !== undefined) patch.seed = algo.seed;

    return patch;
}

// v1 configs stored hex strings keyed by `${col}_${rowFromTop}_${type}`.
function convertLegacyOverrides(raw, s) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [key, hex] of Object.entries(raw)) {
        const m = /^(-?\d+)_(-?\d+)_(top|left|right)$/.exec(key);
        if (!m || typeof hex !== 'string') continue;
        const c = hex.toLowerCase();
        const idx = (c === s.colorTile1) ? C1 : (c === s.colorTile2) ? C2 : -1;
        if (idx < 0) continue;
        out[overrideKey(Number(m[1]), floorRowIndex(Number(m[2]), s.tiledHeightInches), m[3])] = idx;
    }
    return out;
}

// Turns a parsed config object into the next state, listing every field that was
// rejected, clamped, dropped or trimmed.
export function stateFromConfig(parsed, base) {
    const warnings = [];
    const declared = (parsed.version === undefined) ? 1 : Number(parsed.version);
    let version = Math.floor(declared);
    if (!(declared >= 1 && declared <= CONFIG_VERSION)) {
        warnings.push(`unknown config version ${JSON.stringify(parsed.version)}, read as v${CONFIG_VERSION}`);
        version = CONFIG_VERSION;
    }

    // Report every field that was rejected or clamped
    const patch = configToPatch(parsed, version);
    const next = normalizeState({ ...base, ...patch }, base);
    for (const [key, value] of Object.entries(patch)) {
        const given = (typeof value === 'string') ? value.trim().toLowerCase() : value;
        if (String(next[key]) !== String(given)) {
            warnings.push(`${key}: ${JSON.stringify(value)} → ${JSON.stringify(next[key])}`);
        }
    }

    // Voids (v4+); older configs have none. Trimmed to the imported wall right away.
    const rawVoids = Array.isArray(parsed.voids) ? parsed.voids : [];
    const imported = sanitizeVoids(rawVoids.map(v => (v && typeof v === 'object') ? { x: v.x, y: v.y, w: v.width, h: v.height } : null));
    if (imported.length < rawVoids.length) warnings.push(`${rawVoids.length - imported.length} malformed void(s) dropped`);
    next.voids = clipVoidsToWall({ ...next, voids: imported });
    const keptById = new Map(next.voids.map(v => [v.id, v]));
    const trimmed = imported.filter(v => keptById.has(v.id) && (keptById.get(v.id).w !== v.w || keptById.get(v.id).h !== v.h)).length;
    if (next.voids.length < imported.length) warnings.push(`${imported.length - next.voids.length} void(s) outside the wall dropped`);
    if (trimmed) warnings.push(`${trimmed} void(s) trimmed to the wall`);

    const rawOverrides = parsed.manualOverrides || {};
    if (version === 1) {
        next.manualOverrides = convertLegacyOverrides(rawOverrides, next);
    } else {
        next.manualOverrides = sanitizeOverrides(rawOverrides);
        // v2 indices had 0 = bottom color; flip them to C1 = top
        if (version === 2) {
            for (const key of Object.keys(next.manualOverrides)) next.manualOverrides[key] = 1 - next.manualOverrides[key];
        }
    }
    const dropped = Object.keys(rawOverrides).length - Object.keys(next.manualOverrides).length;
    if (dropped > 0) warnings.push(`${dropped} manual override(s) dropped`);
    return { next, warnings };
}
