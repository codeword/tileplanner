// Fade algorithm registry and the color assignment stage (boundary, fade, rogue noise, overrides).
import { BAYER_4X4, C1, C2, CUBE_DY_INCHES, TYPE_INDEX } from './constants.js';
import { hash2D, hashScatter, mod, smoothNoise } from './noise.js';

// --- Fade algorithms ---
// Each fade picks a tile's base color in the tiled area from its signed distance to the
// wandering boundary (positive = above). `ctx` holds { dist, transSpan, typeIdx, seed }.
// `params` are the tuning knobs; the hash salts only decorrelate the noise streams.
export const FADES = {
    lightning: {
        label: 'Jagged Teeth / Lightning (High Contrast)',
        // Tiles within reach of the boundary jump to the other color with this chance
        params: { toothReach: 0.48, toothChance: 0.25 },
        assign(tile, ctx, p) {
            const toothSeed = hashScatter(tile.col, tile.floorRow, ctx.typeIdx + 11, ctx.seed);
            const toothReach = ctx.transSpan * p.toothReach;
            if (ctx.dist < 0) {
                return (ctx.dist > -toothReach && toothSeed < p.toothChance) ? C1 : C2;
            }
            return (ctx.dist < toothReach && toothSeed < p.toothChance) ? C2 : C1;
        }
    },
    bayer: {
        label: 'Ordered Matrix Dither (Bayer 4×4)',
        // Gradient spans this many transition heights, thresholded by the matrix
        params: { gradientSpan: 1.05 },
        assign(tile, ctx, p) {
            const bayerVal = BAYER_4X4[mod(tile.floorRow, 4)][mod(tile.col, 4)];
            const rawGradient = Math.max(0, Math.min(1, 0.5 + ctx.dist / (ctx.transSpan * p.gradientSpan)));
            return (rawGradient > bayerVal) ? C1 : C2;
        }
    },
    cellular: {
        label: 'Organic Cellular Clusters',
        // 2D value noise (per inch) pushes the boundary up or down by up to strength/2
        params: { frequency: 0.18, strength: 0.85 },
        assign(tile, ctx, p) {
            const clusterNoise = smoothNoise(tile.x * p.frequency, tile.y * p.frequency, ctx.seed + 42);
            const effectiveDist = ctx.dist + (clusterNoise - 0.5) * ctx.transSpan * p.strength;
            return (effectiveDist > 0) ? C1 : C2;
        }
    },
    glitch: {
        label: 'Glitch Displacement Scanlines',
        // Rows whose hash exceeds rowThreshold shift the boundary by up to shift/2
        params: { rowThreshold: 0.76, shift: 0.55 },
        assign(tile, ctx, p) {
            const rowGlitch = hash2D(tile.floorRow * 97, 13, ctx.seed);
            const isGlitchRow = rowGlitch > p.rowThreshold;
            const shiftOffset = isGlitchRow ? (hash2D(tile.floorRow, 71, ctx.seed) - 0.5) * p.shift * ctx.transSpan : 0;
            return (ctx.dist + shiftOffset > 0) ? C1 : C2;
        }
    },
    blueNoise: {
        label: 'High-Frequency Blue Noise Dissolve',
        // Linear gradient plus per-tile white noise of the given amplitude
        params: { gradientSpan: 1.05, noiseAmount: 0.35 },
        assign(tile, ctx, p) {
            const staticNoise = hashScatter(tile.col, tile.floorRow, ctx.typeIdx + 37, ctx.seed);
            const t = Math.max(0, Math.min(1, 0.5 + ctx.dist / (ctx.transSpan * p.gradientSpan)));
            return (t + (staticNoise - 0.5) * p.noiseAmount > 0.5) ? C1 : C2;
        }
    }
};
export const ALGORITHMS = Object.keys(FADES);

// Boundary between the bands: octaves of 1D value noise along x (frequency per inch),
// each sampled on its own row/seed offset and weighted; the sum is scaled by transSpan.
const BOUNDARY_OCTAVES = [
    { frequency: 0.055, row: 1.3, seedOffset: 0, weight: 0.50 },
    { frequency: 0.125, row: 4.7, seedOffset: 101, weight: 0.28 },
    { frequency: 0.280, row: 8.2, seedOffset: 503, weight: 0.15 },
    { frequency: 0.650, row: 13.9, seedOffset: 919, weight: 0.07 }
];
const ROGUE_SALT = 79;
const ROGUE_SEED_OFFSET = 9973;

export function getNormalizedZones(s) {
    let f = s.floorPercent;
    let t = s.transPercent;
    if (f + t > 98) {
        t = 98 - f;
    }
    let w = Math.max(0, 100 - f - t);
    return {
        floorPct: f,
        transPct: t,
        wallPct: w
    };
}

// --- Pipeline stage 2: color assignment ---
// Sets tile.baseColorIdx (procedural) and tile.colorIdx (after manual overrides).
export function assignColors(grid, s) {
    const zones = getNormalizedZones(s);
    const seed = s.seed;
    const tiledHeight = s.tiledHeightInches;

    // Transition vertical ranges
    const floorSpan = (zones.floorPct / 100) * tiledHeight;
    const transSpan = Math.max(CUBE_DY_INCHES * 2, (zones.transPct / 100) * tiledHeight);
    const transCenterAboveFloor = floorSpan + (transSpan * 0.5);
    const halfZone = transSpan * 0.5;

    const fade = FADES[s.algorithm];

    for (const tile of grid.tiles) {
        // Wandering boundary from world-space noise octaves
        let displacement = 0;
        for (const o of BOUNDARY_OCTAVES) {
            displacement += (smoothNoise(tile.x * o.frequency, o.row, seed + o.seedOffset) - 0.5) * o.weight;
        }
        const boundaryAboveFloor = transCenterAboveFloor + displacement * transSpan;

        const distToBoundary = tile.y - boundaryAboveFloor;
        const isOutsideZone = Math.abs(distToBoundary) > halfZone;
        tile.distToBoundary = distToBoundary;

        const typeIdx = TYPE_INDEX[tile.type];

        // Base color index: C1 above the boundary, C2 below, as shaped by the fade
        tile.baseColorIdx = fade.assign(tile, { dist: distToBoundary, transSpan, typeIdx, seed }, fade.params);

        // Rogue noise strictly swaps random tiles outside the transition zone
        if (isOutsideZone && s.outlierPct > 0) {
            const rogueRand = hashScatter(tile.col, tile.floorRow, typeIdx + ROGUE_SALT, seed + ROGUE_SEED_OFFSET);
            const rogueThreshold = s.outlierPct / 100.0;
            if (rogueRand < rogueThreshold) {
                tile.baseColorIdx = (tile.y < boundaryAboveFloor) ? C1 : C2;
            }
        }

        // Apply manual override if set
        const override = s.manualOverrides[tile.overrideKey];
        tile.colorIdx = (override !== undefined) ? override : tile.baseColorIdx;
    }
}
