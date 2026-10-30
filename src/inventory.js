// Takeoff stage: majority colors, hand-swaps, spares, extra sheets and boxes.
import { C1, C2, SHEETS_PER_BOX, TILES_PER_SHEET, WASTE_FACTOR } from './constants.js';

// --- Pipeline stage 3: inventory (majority rule, hand-swaps, spares, order) ---
// Majority color and hand-swaps count usable tiles only. Cut tiles on a kept sheet are
// spares of that sheet's majority color. Hand-swaps are supplied first by the tiles pulled
// out of the other color's sheets, then by spares; any shortfall is bought as extra
// sheets. Boxes are counted per color with standard waste.
// Also labels each sheet with majorityIdx / minorityIdx / minorityCount / cutCount / isMixed.
export function computeInventory(grid) {
    let c1Sheets = 0;
    let c2Sheets = 0;
    let swappedC1 = 0; // C1 tiles placed on C2 majority sheets (= C2 tiles pulled out)
    let swappedC2 = 0; // C2 tiles placed on C1 majority sheets (= C1 tiles pulled out)
    let spareC1 = 0;   // cut tiles on C1 majority sheets
    let spareC2 = 0;   // cut tiles on C2 majority sheets

    for (const sheet of grid.sheets) {
        let c1Count = 0;
        let c2Count = 0;
        let cutCount = 0;
        for (const t of sheet.tiles) {
            if (t.cut) cutCount++;
            else if (t.colorIdx === C1) c1Count++;
            else c2Count++;
        }

        // Ties (e.g. 18/18) go to the bottom color, C2
        if (c2Count >= c1Count) {
            c2Sheets++;
            swappedC1 += c1Count;
            spareC2 += cutCount;
            sheet.majorityIdx = C2;
            sheet.minorityIdx = C1;
            sheet.minorityCount = c1Count;
        } else {
            c1Sheets++;
            swappedC2 += c2Count;
            spareC1 += cutCount;
            sheet.majorityIdx = C1;
            sheet.minorityIdx = C2;
            sheet.minorityCount = c2Count;
        }
        sheet.cutCount = cutCount;
        sheet.isMixed = (c1Count > 0 && c2Count > 0);
    }

    const extraC1 = Math.ceil(Math.max(0, swappedC1 - swappedC2 - spareC1) / TILES_PER_SHEET);
    const extraC2 = Math.ceil(Math.max(0, swappedC2 - swappedC1 - spareC2) / TILES_PER_SHEET);
    const boxesFor = (sheets) => Math.ceil((sheets * WASTE_FACTOR) / SHEETS_PER_BOX);
    const boxesC1 = boxesFor(c1Sheets + extraC1);
    const boxesC2 = boxesFor(c2Sheets + extraC2);

    return {
        totalSheets: grid.sheets.length,
        gridCols: grid.cols,
        gridRows: grid.rows,
        c1Sheets,
        c2Sheets,
        handSwaps: swappedC1 + swappedC2,
        swappedC1,
        swappedC2,
        spareC1,
        spareC2,
        extraC1,
        extraC2,
        boxesC1,
        boxesC2,
        boxes: boxesC1 + boxesC2
    };
}
