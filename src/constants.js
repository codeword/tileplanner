// Sheet geometry, layout, navigation and takeoff constants.

// --- Manufacturer Constants (Merola Tile Metro Rhombus) ---
export const SHEET_WIDTH_INCHES = 10.5;   // 3 tumbling cubes wide
const SHEET_HEIGHT_INCHES = 12.13; // published size, 4 tiers; layout uses SHEET_DRAWN_HEIGHT_INCHES
export const TILES_PER_SHEET = 36;
const TILES_PER_BOX = 10 * TILES_PER_SHEET; // 10 sheets per box

// 4x4 Bayer Matrix
export const BAYER_4X4 = [
    [ 0/16,  8/16,  2/16, 10/16],
    [12/16,  4/16, 14/16,  6/16],
    [ 3/16, 11/16,  1/16,  9/16],
    [15/16,  7/16, 13/16,  5/16]
];

// Tumbling-block geometry in inches
export const CUBE_DX_INCHES = SHEET_WIDTH_INCHES / 3.0 / 2.0;
export const CUBE_DY_INCHES = CUBE_DX_INCHES / Math.sqrt(3.0);
export const TIER_STEP_INCHES = 3.0 * CUBE_DY_INCHES;
export const CUBE_STEP_X_INCHES = SHEET_WIDTH_INCHES / 3.0;             // 3.50″ per cube
// Height of a sheet from the tile geometry (~12.12″), used for both layout and row count
export const SHEET_DRAWN_HEIGHT_INCHES = 4 * TIER_STEP_INCHES;
export const TYPE_INDEX = { top: 1, left: 2, right: 3 };

// Color indices on tiles: C1 is the top band's color, C2 the bottom (floor) band's
export const C1 = 0;
export const C2 = 1;

// Layout
export const MARGIN_INCHES = 6.0;
export const LEFT_OFFSET_INCHES = 1.875; // 1 tile + grout offset to envelope left wall edge
export const MIN_PX_PER_INCH = 4.0;      // limits for the fitted (zoom 1) scale
export const MAX_PX_PER_INCH = 18.0;
export const FIT_PADDING_PX = 24;        // space around the wall when fitted
export const CANVAS_BG = '#0b1120';      // canvas area outside the wall + margins
export const OUTSIDE_WALL_WASH = 'rgba(100, 116, 139, 0.18)';
export const CUT_TILE_STROKE = 'rgba(51, 65, 85, 0.75)';
export const VOID_STROKE = '#d946ef';
export const VOID_BADGE_RADIUS_PX = 8;

// Spec card (CSS px). It sits in the painted area when that fits at the fitted scale,
// otherwise in a strip added below the bottom margin.
export const CARD_WIDTH_PX = 480;
export const CARD_HEIGHT_PX = 134;
export const CARD_MARGIN_PX = 16;

// Navigation (view only, not saved in config)
export const ZOOM_MIN = 0.5;             // relative to the fitted scale
export const ZOOM_MAX = 12;
export const ZOOM_STEP = 1.25;           // per +/− button press
export const DRAG_THRESHOLD_PX = 3;      // pointer movement below this is a click
export const EXPORT_PIXEL_DENSITY = 4;   // PNG export renders at 4× CSS pixels...
export const EXPORT_MAX_PIXELS = 8192;   // ...capped so the longest side stays within this

// Takeoff
export const SHEETS_PER_BOX = 10;
export const WASTE_FACTOR = 1.10;

// v3: color1/C1 is the top color (v1/v2 had color1 at the bottom). v4: adds voids.
// v5: same fields; the pattern math changed (integer hash, floor-based rows), so older
// configs load with their settings but render a different pattern.
// v6: shared colors plus a list of saved walls; tiledSubZones.color2Percent became
// bottomPercent, and each wall has invertColors.
export const CONFIG_VERSION = 6;
