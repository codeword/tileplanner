// Seeded integer hashes and 2D value noise. All randomness in the pattern comes from here.

// High-entropy 64-bit Murmur-style integer bit mixer for non-repeating noise
export function hashScatter(col, row, typeIdx, seed) {
    let h = (seed ^ Math.imul(col, 0x9e3779b9) ^ Math.imul(row, 0x85ebca6b) ^ Math.imul(typeIdx, 0xc2b2ae35)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
}

// Non-negative remainder, so periodic patterns continue across negative indices
export function mod(n, m) {
    return ((n % m) + m) % m;
}

export function hash2D(x, y, seed) {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 3628273133);
    n = Math.imul(n ^ (n >> 13), 1274126177);
    return ((n ^ (n >> 16)) >>> 0) / 4294967296;
}

export function smoothNoise(x, y, seed) {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);

    const a = hash2D(i, j, seed);
    const b = hash2D(i + 1, j, seed);
    const c = hash2D(i, j + 1, seed);
    const d = hash2D(i + 1, j + 1, seed);

    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
