// Maps wall inches to CSS px for a canvas size, zoom and pan.
import { CARD_HEIGHT_PX, CARD_MARGIN_PX, CARD_WIDTH_PX, FIT_PADDING_PX, LEFT_OFFSET_INCHES, MARGIN_INCHES, MAX_PX_PER_INCH, MIN_PX_PER_INCH } from './constants.js';

// --- Pipeline stage 4: view (inches → CSS px) ---
// The fitted scale fits the wall plus margins (the "content") into `area`. With `nav`, the
// canvas is the whole area and the content is centered, then zoomed and panned. Without
// `nav` (PNG export), the canvas is exactly the content at the fitted scale.
// The wall rectangle is snapped to whole CSS pixels so its edges stay crisp; the wall
// origin sits on the snapped floor/left corner.
export function computeView(s, area, dpr, nav = null) {
    const boundingWidthInches = s.wallWidthInches + LEFT_OFFSET_INCHES + (MARGIN_INCHES * 2);
    const boundingHeightInches = s.wallTotalHeightInches + (MARGIN_INCHES * 2);

    const fitFor = (extraHeightPx) => Math.max(MIN_PX_PER_INCH, Math.min(MAX_PX_PER_INCH, Math.min(
        (area.width - FIT_PADDING_PX * 2) / boundingWidthInches,
        (area.height - FIT_PADDING_PX * 2 - extraHeightPx) / boundingHeightInches
    )));

    // The card always sits in a strip below the bottom margin, never on the wall. Its size
    // is in CSS px, so zooming doesn't change it.
    const cardSpacePx = CARD_HEIGHT_PX + CARD_MARGIN_PX * 2;
    const fitScale = fitFor(cardSpacePx);
    const scale = fitScale * (nav ? nav.zoom : 1);

    const planHeight = Math.round(boundingHeightInches * scale);
    const contentWidth = Math.round(boundingWidthInches * scale);
    const contentHeight = planHeight + cardSpacePx;
    const cssWidth = nav ? area.width : contentWidth;
    const cssHeight = nav ? area.height : contentHeight;
    const contentX = nav ? Math.round((cssWidth - contentWidth) / 2 + nav.panX) : 0;
    const contentY = nav ? Math.round((cssHeight - contentHeight) / 2 + nav.panY) : 0;

    const wallLeftX = contentX + Math.round((MARGIN_INCHES + LEFT_OFFSET_INCHES) * scale);
    const wallFloorY = contentY + Math.round((MARGIN_INCHES + s.wallTotalHeightInches) * scale);
    const wallRightX = Math.round(wallLeftX + (s.wallWidthInches * scale));
    const wallCeilingY = contentY + Math.round(MARGIN_INCHES * scale);

    const card = {
        x: contentX + CARD_MARGIN_PX,
        y: contentY + planHeight + CARD_MARGIN_PX,
        width: Math.min(CARD_WIDTH_PX, contentWidth - CARD_MARGIN_PX * 2),
        height: CARD_HEIGHT_PX
    };

    return {
        scale,      // CSS px per inch
        fitScale,
        onScreen: Boolean(nav),
        dpr,        // device px per CSS px
        cssWidth,
        cssHeight,
        content: { x: contentX, y: contentY, width: contentWidth, height: contentHeight },
        originX: wallLeftX,
        originY: wallFloorY,
        wallLeftX,
        wallRightX,
        wallFloorY,
        wallCeilingY,
        tiledTopY: wallFloorY - (s.tiledHeightInches * scale),
        card,
        voidBadges: [] // filled by renderCanvas on screen: { id, x, y } for hit-testing
    };
}

export function toScreen(view, x, y) {
    return { x: view.originX + x * view.scale, y: view.originY - y * view.scale };
}

export function toWall(view, screenX, screenY) {
    return { x: (screenX - view.originX) / view.scale, y: (view.originY - screenY) / view.scale };
}
