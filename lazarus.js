// lazarus.js — shared level-ladder logic ("Project Lazarus") for the xX Trading Journal.
// One copy used by the home page chart AND the Cycles page, so both always show the same level.
// (NOVA Command has an identical port in its lazarus.js; its test compares the two on random cycles.)

export const MAX_LEVEL = 10;
export const DEFAULT_MODEL = 'xY10';
export const LEVEL_TIERS = [
    { max: 3,  name: 'REBUILDING',  color: '#E22134' },
    { max: 6,  name: 'IN CONTROL',  color: '#4A90E2' },
    { max: 9,  name: 'DIALED IN',   color: '#1DB954' },
    { max: 10, name: 'PEAK STATE',  color: '#FFD600' }
];
export function tierFor(level) {
    return LEVEL_TIERS.find(t => level <= t.max) || LEVEL_TIERS[LEVEL_TIERS.length - 1];
}

// Lot tables per model, mirroring the EA's lotSizes_XY5/XY7/XY10 arrays —
// used only to size the legacy cushion (a lot-size ratio between levels).
export const LOT_TABLES = {
    xY5:  [0.07, 0.20, 0.56, 1.54, 4.34, 12.26, 33.60, 94.50, 269.50, 350.00],
    xY7:  [0.05, 0.14, 0.40, 1.13, 3.14, 8.76,  24.00, 67.50, 192.50, 250.00],
    xY10: [0.03, 0.10, 0.28, 0.79, 2.20, 6.13,  16.80, 47.25, 134.75, 175.00]
};

export function computeLegacyCushion(model, clearedIdx, newIdx, lossesAbsorbed, maxBuffer) {
    const table = LOT_TABLES[model] || LOT_TABLES[DEFAULT_MODEL];
    const lotCleared = table[clearedIdx], lotNew = table[newIdx];
    if (!lotNew) return 0;
    const netProfitInRiskUnits = 6.0 - lossesAbsorbed; // 2 wins * 3R, minus losses spent
    const cushion = Math.floor(netProfitInRiskUnits * lotCleared / lotNew);
    return Math.max(0, Math.min(maxBuffer, cushion));
}

// Walks one cycle's trades (oldest first) through the buffered-progression rules.
// Returns per-trade level points (1-indexed, starting with level 1 before any trade) plus the final state.
export function simulateLazarus(cycleTrades, maxBuffer) {
    let levelIdx = 0;
    let state = 'QUALIFICATION';
    let buffer = 0;
    let legacyBuffer = 0, legacyBufferCap = 0;
    let lastModel = DEFAULT_MODEL;
    const points = [levelIdx + 1];
    const moves = [];

    cycleTrades.forEach(t => {
        const model = t.model || t.mt4?.mode || lastModel;
        lastModel = model;

        // A trade tagged with the EA's own STATE (Qualifying / Legacy / Buffer) is trusted over the simulation,
        // so one missed or out-of-order trade can never make the ladder drift for good.
        if (t.phase === 'QUALIFYING' || t.phase === 'LEGACY') {
            state = 'QUALIFICATION';
            if (t.phase === 'LEGACY' && legacyBuffer === 0) {
                legacyBuffer = 1;
                legacyBufferCap = Math.max(legacyBufferCap, 1);
            }
        } else if (t.phase === 'BUFFER') {
            state = 'BUFFERED';
        }

        if (t.outcome === 'BREAKEVEN') { points.push(levelIdx + 1); moves.push(null); return; }

        let move = null;
        if (t.outcome === 'WIN') {
            move = 'WIN';
            if (state === 'QUALIFICATION') {
                buffer = maxBuffer;                      // qualifying win: arm the buffer, repeat the level
                state = 'BUFFERED';
                legacyBuffer = 0; legacyBufferCap = 0;
            } else {                                      // confirmation win: advance, carry a legacy cushion
                const lossesAbsorbed = maxBuffer - buffer;
                const clearedIdx = levelIdx;
                const newIdx = Math.min(levelIdx + 1, MAX_LEVEL - 1);
                legacyBufferCap = computeLegacyCushion(model, clearedIdx, newIdx, lossesAbsorbed, maxBuffer);
                legacyBuffer = legacyBufferCap;
                levelIdx = newIdx;
                state = 'QUALIFICATION';
                buffer = 0;
            }
        } else if (t.outcome === 'LOSS') {
            move = 'LOSS';
            if (state === 'QUALIFICATION') {
                if (legacyBuffer > 0) {
                    legacyBuffer--;
                    if (legacyBuffer === 0) { levelIdx = Math.max(levelIdx - 1, 0); legacyBufferCap = 0; }
                }
            } else {
                buffer--;
                if (buffer <= 0) {
                    levelIdx = Math.max(levelIdx - 1, 0);
                    state = 'QUALIFICATION';
                    buffer = 0; legacyBuffer = 0; legacyBufferCap = 0;
                }
            }
        }
        points.push(levelIdx + 1);
        moves.push(move);
    });

    return { points, level: levelIdx + 1, state, buffer, legacyBuffer, legacyBufferCap, maxBuffer, moves };
}
