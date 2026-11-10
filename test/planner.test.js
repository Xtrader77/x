const assert = require('assert');
const P = require('../planner-logic.js');
let n = 0; const ok = (m) => { n++; console.log('ok ' + m); };
const T = (date, time, sys) => ({ tradeDate: date, tradeTime: time, outcome: P.setupOutcome(sys), mt4: { plan: { systems: sys } } });
const S = (a, b, c) => [{ sys: '1:2', level: a[0], outcome: a[1] }, ...(b ? [{ sys: '1:3', level: b[0], outcome: b[1] }] : []), ...(c ? [{ sys: '1:5', level: c[0], outcome: c[1] }] : [])];

// modes and targets
assert.deepStrictEqual(P.targetsFor('xY7'), { sl: 7, be: 7, tp: { '1:2': 15, '1:3': 21, '1:5': 35 } });
assert.strictEqual(P.targetsFor('xY5').tp['1:5'], 25); assert.strictEqual(P.targetsFor('xY10').tp['1:2'], 21); assert.strictEqual(P.targetsFor('x'), null); ok('modes give the SuperNova stop loss and the three targets');

// level moves
assert.strictEqual(P.nextLevel('1:2', 3, 'win'), 4); assert.strictEqual(P.nextLevel('1:2', 10, 'win'), 10);
assert.strictEqual(P.nextLevel('1:5', 5, 'win'), 5); assert.strictEqual(P.nextLevel('1:2', 1, 'loss'), 1);
assert.strictEqual(P.nextLevel('1:3', 4, 'loss'), 3); assert.strictEqual(P.nextLevel('1:3', 4, 'BREAKEVEN'), 4); assert.strictEqual(P.nextLevel('1:3', 4, 'partial'), 4); ok('win up, loss back, breakeven and partial repeat, top levels hold (1:5 tops at 5)');

// setup outcome
assert.strictEqual(P.setupOutcome(S([1, 'loss'], [1, 'loss'])), 'loss'); assert.strictEqual(P.setupOutcome(S([1, 'loss'], [1, 'win'])), 'win');
assert.strictEqual(P.setupOutcome(S([1, 'be'], [1, 'loss'])), 'be'); assert.strictEqual(P.setupOutcome([]), null); ok('a setup is a loss only if every scored system lost');

// ladder
assert.deepStrictEqual(P.ladder([]), { levels: { '1:2': 1, '1:3': 1, '1:5': 1 }, on: { '1:2': true, '1:3': false, '1:5': false } }); ok('empty history: only 1:2 on, all at L1');
let h = [T('2026-11-02', '08:00', S([1, 'win'])), T('2026-11-03', '08:00', S([2, 'win']))];
let L = P.ladder(h); assert.strictEqual(L.levels['1:2'], 3); assert.strictEqual(L.on['1:3'], true); assert.strictEqual(L.levels['1:3'], 1); ok('1:2 reaching L3 switches 1:3 on at L1');
h.push(T('2026-11-04', '08:00', S([3, 'win'], [1, 'win'])), T('2026-11-05', '08:00', S([4, 'win'], [2, 'win'])));
L = P.ladder(h); assert.deepStrictEqual([L.levels['1:2'], L.levels['1:3'], L.on['1:5'], L.levels['1:5']], [5, 3, true, 1]); ok('1:3 reaching L3 switches 1:5 on at L1');
h.push(T('2026-11-09', '08:00', S([5, 'loss'], [3, 'loss'], [1, 'loss'])));
L = P.ladder(h); assert.deepStrictEqual([L.levels['1:2'], L.levels['1:3'], L.on['1:5'], L.levels['1:5']], [4, 2, false, 1]); ok('a loss steps every system back, and 1:5 switches off when 1:3 falls under L3');
h.push(T('2026-11-10', '08:00', S([2, 'be'])));
L = P.ladder(h); assert.deepStrictEqual([L.levels['1:2'], L.on['1:3'], L.levels['1:3']], [2, false, 1]); ok('1:2 under L3 switches 1:3 off and it returns to L1');
const legacy = [{ tradeDate: '2026-10-01', tradeTime: '09:00', outcome: 'win', rr: '1:2,1:3', level: 4 }];
L = P.ladder(legacy); assert.strictEqual(L.levels['1:2'], 5); assert.strictEqual(L.on['1:3'], true); ok('old records (rr list, one level, one outcome) still count');
const manual = [T('2026-11-02', '08:00', S([1, 'win'])), { ...T('2026-11-03', '08:00', S([1, 'be'])) }];
assert.strictEqual(P.ladder(manual).levels['1:2'], 1); ok('a level written on the record wins over the replay (repeat a level after a withdrawal)');

// weekly lock
const loss = (d) => T(d, '09:00', S([1, 'loss']));
let lk = P.weeklyLock([loss('2026-11-02'), loss('2026-11-03')], { date: '2026-11-04' });
assert.strictEqual(lk.streak, 2); assert.strictEqual(lk.locked, false);
lk = P.weeklyLock([loss('2026-11-02'), loss('2026-11-03'), loss('2026-11-04')], { date: '2026-11-05' });
assert.deepStrictEqual([lk.streak, lk.locked, lk.until], [3, true, '2026-11-09']); ok('3 losing setups in a row lock until the next Monday');
lk = P.weeklyLock([loss('2026-11-02'), loss('2026-11-03'), loss('2026-11-04')], { date: '2026-11-09' }); assert.strictEqual(lk.locked, false); assert.strictEqual(lk.streak, 0); ok('the lock ends on Monday and the count restarts');
lk = P.weeklyLock([loss('2026-11-02'), T('2026-11-03', '09:00', S([1, 'win'])), loss('2026-11-04'), loss('2026-11-05')], { date: '2026-11-06' }); assert.strictEqual(lk.streak, 2); ok('a win ends the streak');
lk = P.weeklyLock([loss('2026-11-02'), T('2026-11-03', '09:00', S([1, 'loss'], [1, 'be'])), loss('2026-11-04')], { date: '2026-11-05' }); assert.strictEqual(lk.streak, 1); ok('a setup with a breakeven in it is not a loss');
assert.strictEqual(P.nextMonday('2026-11-09'), '2026-11-16'); assert.strictEqual(P.nextMonday('2026-11-08'), '2026-11-09'); assert.strictEqual(P.nextMonday('2026-11-04'), '2026-11-09'); ok('next Monday (a Monday gives the one a week on)');

// rules check
let rc = P.rulesCheck([T('2026-11-09', '08:00', S([1, 'win']))], { now: { date: '2026-11-09', time: '10:30' } });
assert.strictEqual(rc.find((r) => r.id === 'daily').ok, false); assert.strictEqual(rc.find((r) => r.id === 'window').ok, true); assert.strictEqual(rc.find((r) => r.id === 'lock').ok, true);
rc = P.rulesCheck([], { now: { date: '2026-11-09', time: '19:00' }, openPlans: [{ id: 'a' }] });
assert.strictEqual(rc.find((r) => r.id === 'window').ok, false); assert.strictEqual(rc.find((r) => r.id === 'open').ok, false); assert.strictEqual(rc.find((r) => r.id === 'daily').ok, true);
assert.strictEqual(P.rulesCheck([], { now: { date: '2026-11-09', time: '06:00' } }).find((r) => r.id === 'window').ok, true);
assert.strictEqual(P.rulesCheck([], { now: { date: '2026-11-09' } }).find((r) => r.id === 'window').unknown, true); ok('rules check: one a day, window 06:00 to 19:00, open setup, lock');

// room and fit
assert.deepStrictEqual(P.roomLeft(60, 25, 0), { up: 35, down: 60 }); assert.strictEqual(P.roomLeft(null, 1, 1), null); assert.deepStrictEqual(P.roomLeft(60, 80, 0), { up: 0, down: 60 });
const f = P.targetFit(35, 12); assert.deepStrictEqual(f.up.rows[1].cells.map((c) => c.fits), [true, true, true]); assert.deepStrictEqual(f.down.rows[0].cells.map((c) => c.fits), [true, false, false]); ok('room left and which targets fit');

// plan check and completeness
assert.strictEqual(P.planCheck(true, 'win'), 'good_win'); assert.strictEqual(P.planCheck(false, 'loss'), 'bad_loss'); assert.strictEqual(P.planCheck(true, 'loss'), 'good_loss'); assert.strictEqual(P.planCheck(null, 'win'), null); ok('good and bad wins and losses');
const full = { pair: 'AUDUSD', direction: 'sell', mode: 'xY7', date: '2026-11-09', time: '08:10', systems: [{ sys: '1:2', level: 2 }], read: { long: 'down' }, mindset: 4 };
assert.strictEqual(P.missing(full).length, 0); assert.strictEqual(P.missing({}).length >= 6, true);
assert.deepStrictEqual(P.missing({ ...full, systems: [{ sys: '1:5', level: 6 }] }).map((m) => m.text), ['Set a level for 1:5']); ok('a plan is complete only when every needed piece is there');
assert.deepStrictEqual(P.summary(full), { sl: 7, be: 7, systems: [{ sys: '1:2', level: 2, tp: 15 }] }); ok('summary shows stop loss, breakeven and each target');
console.log('\n' + n + ' planner checks passed');
