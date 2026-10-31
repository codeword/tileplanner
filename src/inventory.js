// Takeoff stage: majority colors, hand-swaps, spares and sheets to order.
import { C1, C2, TILES_PER_SHEET } from './constants.js';

// Settles one color: its tile balance (spares + tiles pulled out of its sheets for the
// other color's swaps − swaps needing this color) against its majority sheets. A shortfall
// buys extra sheets; whole sheets' worth of surplus come off the order. Leftover is
// always 0–35 tiles. Used per wall and, with summed sheets and balances, for the
// pooled saved-walls total.
export function settleColor(sheets, balance) {
    const extra = balance < 0 ? Math.ceil(-balance / TILES_PER_SHEET) : 0;
    const fromSpares = balance > 0 ? Math.floor(balance / TILES_PER_SHEET) : 0;
    return {
        extra,
        fromSpares,
        buy: sheets + extra - fromSpares,
        leftover: balance + (extra - fromSpares) * TILES_PER_SHEET
    };
}

// --- Pipeline stage 3: inventory (majority rule, hand-swaps, spares, order) ---
// Majority color and hand-swaps count usable tiles only. Cut tiles on a kept sheet are
// spares of that sheet's majority color. Each color is then settled (settleColor).
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

    // C2 tiles placed on C1 sheets free the C1 tiles they replace, and vice versa
    const balanceC1 = spareC1 + swappedC2 - swappedC1;
    const balanceC2 = spareC2 + swappedC1 - swappedC2;
    const c1 = settleColor(c1Sheets, balanceC1);
    const c2 = settleColor(c2Sheets, balanceC2);

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
        balanceC1,
        balanceC2,
        extraC1: c1.extra,
        extraC2: c2.extra,
        fromSparesC1: c1.fromSpares,
        fromSparesC2: c2.fromSpares,
        buyC1: c1.buy,
        buyC2: c2.buy,
        buy: c1.buy + c2.buy,
        leftoverC1: c1.leftover,
        leftoverC2: c2.leftover
    };
}
