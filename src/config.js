// Config JSON: saved walls to config, and config (any version) to colors + walls with warnings.
import { C1, C2, CONFIG_VERSION } from './constants.js';
import { clipVoidsToWall, floorRowIndex, overrideKey } from './geometry.js';
import { COLOR_KEYS, DEFAULTS, normalizeState, sanitizeOverrides, sanitizeVoids, wallSettings } from './state.js';

// --- Config JSON ---
// v6: { version, colors, walls: [...] }. Colors are shared; everything else is per wall.
// Only saved walls are stored: the wall being edited isn't part of the config.

const MAX_WALL_NAME_LENGTH = 60;

export function sanitizeWallName(name, fallback) {
    const trimmed = (typeof name === 'string') ? name.trim().slice(0, MAX_WALL_NAME_LENGTH) : '';
    return trimmed || fallback;
}

function wallConfigFromSettings(name, w) {
    return {
        name,
        invertColors: w.invertColors,
        physicalWallInches: {
            width: w.wallWidthInches,
            totalHeight: w.wallTotalHeightInches,
            tiledHeight: w.tiledHeightInches
        },
        // The top band gets 100 − bottomPercent − transitionPercent
        tiledSubZones: {
            bottomPercent: w.floorPercent,
            transitionPercent: w.transPercent
        },
        algorithm: {
            type: w.algorithm,
            outlierScatterPercent: w.outlierPct,
            seed: w.seed
        },
        // Keys are `${col}_f${tierAboveFloor}_${type}`, values the color shown: 0 (C1) or 1 (C2)
        manualOverrides: { ...w.manualOverrides },
        // Inches from the floor at the left wall edge; (x, y) is the bottom-left corner
        voids: w.voids.map(v => ({ x: v.x, y: v.y, width: v.w, height: v.h }))
    };
}

// `s` supplies the shared colors; `walls` = [{ name, settings }] in list order
export function configFromProject(s, walls) {
    return {
        version: CONFIG_VERSION,
        colors: {
            color1: s.colorTile1,
            color2: s.colorTile2,
            paintedWall: s.colorPaint,
            grout: s.colorGrout
        },
        walls: walls.map(w => wallConfigFromSettings(w.name, w.settings))
    };
}

// Before v3, color1 was the bottom color, so it maps to Color 2
function colorsToPatch(parsed, version) {
    const bottomFirst = version < 3;
    const patch = {};
    const colors = parsed.colors || {};
    const color1 = colors.color1 || colors.tile1FloorBase;
    const color2 = colors.color2 || colors.tile2WallBase;
    const top = bottomFirst ? color2 : color1;
    const bottom = bottomFirst ? color1 : color2;
    if (top) patch.colorTile1 = top;
    if (bottom) patch.colorTile2 = bottom;
    if (colors.paintedWall) patch.colorPaint = colors.paintedWall;
    if (colors.grout) patch.colorGrout = colors.grout;
    return patch;
}

// Maps the fields present in one wall's config onto a state patch. Absent fields keep
// their default; validation and clamping happen in normalizeState.
function wallToPatch(wall, version) {
    const patch = {};
    const dims = wall.physicalWallInches || {};
    if (dims.width !== undefined) patch.wallWidthInches = dims.width;
    if (dims.totalHeight !== undefined) patch.wallTotalHeightInches = dims.totalHeight;
    if (dims.tiledHeight !== undefined) patch.tiledHeightInches = dims.tiledHeight;
    if (wall.invertColors !== undefined) patch.invertColors = wall.invertColors;

    // The bottom band: bottomPercent (v6), color2Percent (v3–v5), color1Percent (v1–v2)
    const zones = wall.tiledSubZones || {};
    const bottomPercent = (version >= 6) ? zones.bottomPercent
        : (version >= 3) ? zones.color2Percent
        : (zones.color1Percent !== undefined ? zones.color1Percent : zones.floorPercent);
    if (bottomPercent !== undefined) patch.floorPercent = bottomPercent;
    if (zones.transitionPercent !== undefined) patch.transPercent = zones.transitionPercent;

    const algo = wall.algorithm || {};
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

// Lists the patch fields that normalizeState rejected or clamped
function patchWarnings(patch, next) {
    const warnings = [];
    for (const [key, value] of Object.entries(patch)) {
        const given = (typeof value === 'string') ? value.trim().toLowerCase() : value;
        if (String(next[key]) !== String(given)) {
            warnings.push(`${key}: ${JSON.stringify(value)} → ${JSON.stringify(next[key])}`);
        }
    }
    return warnings;
}

// One wall's config onto `base` (defaults plus the shared colors)
function wallFromConfig(wall, version, base) {
    const patch = wallToPatch(wall, version);
    const next = normalizeState({ ...base, ...patch }, base);
    const warnings = patchWarnings(patch, next);

    // Voids (v4+); older configs have none. Trimmed to the imported wall right away.
    const rawVoids = Array.isArray(wall.voids) ? wall.voids : [];
    const imported = sanitizeVoids(rawVoids.map(v => (v && typeof v === 'object') ? { x: v.x, y: v.y, w: v.width, h: v.height } : null));
    if (imported.length < rawVoids.length) warnings.push(`${rawVoids.length - imported.length} malformed void(s) dropped`);
    next.voids = clipVoidsToWall({ ...next, voids: imported });
    const keptById = new Map(next.voids.map(v => [v.id, v]));
    const trimmed = imported.filter(v => keptById.has(v.id) && (keptById.get(v.id).w !== v.w || keptById.get(v.id).h !== v.h)).length;
    if (next.voids.length < imported.length) warnings.push(`${imported.length - next.voids.length} void(s) outside the wall dropped`);
    if (trimmed) warnings.push(`${trimmed} void(s) trimmed to the wall`);

    const rawOverrides = wall.manualOverrides || {};
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
    return { settings: wallSettings(next), warnings };
}

// Turns a parsed config object into the shared colors and the saved walls, listing every
// field that was rejected, clamped, dropped or trimmed. Before v6 a config held one wall,
// which becomes the only saved wall.
export function projectFromConfig(parsed, base) {
    const warnings = [];
    const declared = (parsed.version === undefined) ? 1 : Number(parsed.version);
    let version = Math.floor(declared);
    if (!(declared >= 1 && declared <= CONFIG_VERSION)) {
        warnings.push(`unknown config version ${JSON.stringify(parsed.version)}, read as v${CONFIG_VERSION}`);
        version = CONFIG_VERSION;
    }

    const colorsPatch = colorsToPatch(parsed, version);
    const withColors = normalizeState({ ...base, ...colorsPatch }, base);
    warnings.push(...patchWarnings(colorsPatch, withColors));
    const colors = Object.fromEntries(COLOR_KEYS.map(key => [key, withColors[key]]));
    const wallBase = normalizeState({ ...DEFAULTS, ...colors });

    let rawWalls;
    if (version < 6) {
        rawWalls = [{ name: 'Imported wall', ...parsed }];
    } else if (Array.isArray(parsed.walls)) {
        rawWalls = parsed.walls;
    } else {
        rawWalls = [];
        if (parsed.walls !== undefined) warnings.push('walls must be a list; no walls imported');
    }

    const walls = [];
    rawWalls.forEach((raw, i) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            warnings.push(`walls[${i}] is not an object, skipped`);
            return;
        }
        const name = sanitizeWallName(raw.name, `Wall ${i + 1}`);
        const wall = wallFromConfig(raw, version, wallBase);
        warnings.push(...wall.warnings.map(w => `${name}: ${w}`));
        walls.push({ name, settings: wall.settings });
    });
    return { colors, walls, warnings };
}
