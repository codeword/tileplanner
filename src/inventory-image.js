// Inventory image for the saved walls: one row per wall, the pooled total, and the
// minimum / +5% / +10% sheet reserves per color. Drawn in CSS px; the caller sizes the
// canvas from inventoryImageSize() × dpr.

const IMG_WIDTH = 760;
const PAD = 24;
const ROW_H = 20;
const HEADER_H = 92;      // title, date, color legend
const TABLE_HEAD_H = 26;
const RESERVE_TOP_GAP = 34;
const RESERVE_ROWS = 3;
const FOOTER_H = 56;

export const RESERVE_LEVELS = [0, 0.05, 0.10];

// Sheets with a reserve, rounded up to whole sheets
export function withReserve(sheets, level) {
    return Math.ceil(sheets * (1 + level) - 1e-9);
}

export function inventoryImageSize(total) {
    const rows = total.walls.length + 1; // + pooled total
    const height = PAD + HEADER_H + TABLE_HEAD_H + rows * ROW_H + RESERVE_TOP_GAP + TABLE_HEAD_H + RESERVE_ROWS * ROW_H + FOOTER_H + PAD;
    return { width: IMG_WIDTH, height };
}

// total: pooledTakeoff() from ui/takeoff.js; colors: { c1, c2 } hex; date: Date
export function drawInventoryImage(ctx, total, colors, date, dpr) {
    const { width, height } = inventoryImageSize(total);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = 'middle';

    const text = (str, x, y, { font = '11px JetBrains Mono, monospace', color = '#cbd5e1', align = 'left', maxWidth } = {}) => {
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textAlign = align;
        if (maxWidth) {
            let s = str;
            while (s.length > 1 && ctx.measureText(s).width > maxWidth) s = s.slice(0, -2) + '…';
            ctx.fillText(s, x, y);
        }
        else ctx.fillText(str, x, y);
    };
    const swatch = (x, y, hex) => {
        ctx.fillStyle = hex;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
    };

    // Header
    let y = PAD + 10;
    text('TILE INVENTORY · SAVED WALLS', PAD, y, { font: 'bold 16px Inter, sans-serif', color: '#ffffff' });
    y += 22;
    text(`${date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}  ·  Merola Metro Rhombus, 36 tiles per sheet  ·  ${total.walls.length} walls`, PAD, y, { color: '#94a3b8' });
    y += 26;
    swatch(PAD + 6, y, colors.c1);
    text(`Color 1 ${colors.c1.toUpperCase()}`, PAD + 18, y, { font: 'bold 11px JetBrains Mono, monospace', color: '#f59e0b' });
    swatch(PAD + 186, y, colors.c2);
    text(`Color 2 ${colors.c2.toUpperCase()}`, PAD + 198, y, { font: 'bold 11px JetBrains Mono, monospace', color: '#38bdf8' });

    // Per-wall table. Columns: name, size, sheets on wall, then sheets/left per color.
    const right = width - PAD;
    const cols = [
        { label: 'Wall', x: PAD, align: 'left' },
        { label: 'Size (tiled)', x: PAD + 220, align: 'left' },
        { label: 'On wall', x: PAD + 428, align: 'right' },
        { label: 'C1 sheets', x: PAD + 508, align: 'right' },
        { label: 'C1 left', x: PAD + 568, align: 'right' },
        { label: 'C2 sheets', x: PAD + 648, align: 'right' },
        { label: 'C2 left', x: right, align: 'right' }
    ];
    const headerRow = (yy, labels) => {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(PAD - 8, yy - TABLE_HEAD_H / 2, width - 2 * PAD + 16, TABLE_HEAD_H);
        labels.forEach(([label, x, align]) => text(label, x, yy, { font: 'bold 10px Inter, sans-serif', color: '#94a3b8', align }));
    };
    const rowBand = (yy, i) => {
        if (i % 2 === 1) {
            ctx.fillStyle = 'rgba(30, 41, 59, 0.45)';
            ctx.fillRect(PAD - 8, yy - ROW_H / 2, width - 2 * PAD + 16, ROW_H);
        }
    };

    y = PAD + HEADER_H + TABLE_HEAD_H / 2;
    headerRow(y, cols.map(c => [c.label, c.x, c.align]));
    y += TABLE_HEAD_H / 2 + ROW_H / 2;

    total.walls.forEach((w, i) => {
        const s = w.settings;
        rowBand(y, i);
        const cells = [
            w.name,
            `${s.wallWidthInches}″ × ${s.wallTotalHeightInches}″ (${s.tiledHeightInches}″)`,
            String(w.inv.totalSheets),
            String(w.inv.buyC1),
            String(w.inv.leftoverC1),
            String(w.inv.buyC2),
            String(w.inv.leftoverC2)
        ];
        cells.forEach((c, j) => text(c, cols[j].x, y, {
            align: cols[j].align,
            color: j === 3 ? '#fbbf24' : j === 5 ? '#7dd3fc' : '#cbd5e1',
            maxWidth: j === 0 ? 210 : undefined
        }));
        y += ROW_H;
    });

    // Pooled total
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD - 8, y - ROW_H / 2 + 0.5);
    ctx.lineTo(width - PAD + 8, y - ROW_H / 2 + 0.5);
    ctx.stroke();
    const bold = 'bold 11px JetBrains Mono, monospace';
    text('Total (pooled)', cols[0].x, y, { font: bold, color: '#ffffff' });
    text(String(total.sheetsOnWalls), cols[2].x, y, { font: bold, color: '#ffffff', align: 'right' });
    text(String(total.c1.buy), cols[3].x, y, { font: bold, color: '#fbbf24', align: 'right' });
    text(String(total.c1.leftover), cols[4].x, y, { font: bold, color: '#ffffff', align: 'right' });
    text(String(total.c2.buy), cols[5].x, y, { font: bold, color: '#7dd3fc', align: 'right' });
    text(String(total.c2.leftover), cols[6].x, y, { font: bold, color: '#ffffff', align: 'right' });
    y += ROW_H / 2;

    // Reserves on the pooled minimum, rounded up per color
    y += RESERVE_TOP_GAP - 8;
    text('SHEETS TO HAVE ON HAND', PAD, y - 12, { font: 'bold 11px Inter, sans-serif', color: '#ffffff' });
    y += TABLE_HEAD_H / 2;
    const rcols = [
        ['', PAD, 'left'],
        ['Color 1', PAD + 300, 'right'],
        ['Color 2', PAD + 440, 'right'],
        ['Total', PAD + 580, 'right']
    ];
    headerRow(y, rcols);
    y += TABLE_HEAD_H / 2 + ROW_H / 2;
    RESERVE_LEVELS.forEach((level, i) => {
        rowBand(y, i);
        const c1 = withReserve(total.c1.buy, level);
        const c2 = withReserve(total.c2.buy, level);
        const extra = (n, base) => level ? `${n} (+${n - base})` : String(n);
        text(level ? `+${Math.round(level * 100)}% reserve` : 'Minimum', rcols[0][1], y, { font: level ? undefined : bold, color: '#ffffff' });
        text(extra(c1, total.c1.buy), rcols[1][1], y, { color: '#fbbf24', align: 'right' });
        text(extra(c2, total.c2.buy), rcols[2][1], y, { color: '#7dd3fc', align: 'right' });
        text(extra(c1 + c2, total.c1.buy + total.c2.buy), rcols[3][1], y, { color: '#ffffff', align: 'right' });
        y += ROW_H;
    });

    // Footer: how the numbers are made
    y += 12;
    const note = { font: '10px Inter, sans-serif', color: '#64748b' };
    text('Sheets per color = majority sheets + extra sheets for hand-swaps − whole sheets\' worth of spare tiles (0–35 tiles left).', PAD, y, note);
    text('The total is pooled: one wall\'s spares cover another\'s swaps, so it can be less than the sum of the walls.', PAD, y + 15, note);
    text('Reserves are added to the pooled minimum and rounded up to whole sheets per color.', PAD, y + 30, note);
}
