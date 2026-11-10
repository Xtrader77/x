// planner-logic.js - xX Trading Journal
// The rules of the trade planner, written once and tested. Every rule here is a SuperNova v12.2 rule:
//   modes xY5 / xY7 / xY10 (stop loss 5 / 7 / 10 pips), three systems 1:2 / 1:3 / 1:5 with targets per mode,
//   win = level up, loss = one level back, breakeven or partial = repeat; 1:3 joins when 1:2 will trade at L3,
//   1:5 joins when 1:3 will trade at L3; a setup counts as a loss only if every scored system lost;
//   3 losing setups in a row lock the EA until next Monday 00:00 (broker time); one setup a day; window 06:00-19:00 broker time.
// No DOM and no network here, so it can be tested. Browser: window.XPlan. Node: require.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.XPlan = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SYSTEMS = ['1:2', '1:3', '1:5'];
  const MAX_LEVEL = { '1:2': 10, '1:3': 10, '1:5': 5 };
  const MODES = {
    xY5: { sl: 5, tp: { '1:2': 11, '1:3': 15, '1:5': 25 } },
    xY7: { sl: 7, tp: { '1:2': 15, '1:3': 21, '1:5': 35 } },
    xY10: { sl: 10, tp: { '1:2': 21, '1:3': 30, '1:5': 50 } }
  };
  const UNLOCK_AT = 3;          // level the system below must reach for the next one to join
  const LOCK_AFTER = 3;         // losing setups in a row
  const SESSION = { from: 6 * 60, to: 19 * 60 };   // minutes on the MetaTrader clock

  const isNum = (n) => typeof n === 'number' && isFinite(n);

  // 'WIN' / 'win' / 'Breakeven' / 'be' / 'partial' -> 'win' | 'loss' | 'be' | 'partial' | null
  function normOutcome(o) {
    const s = String(o == null ? '' : o).trim().toLowerCase();
    if (s === 'win' || s === 'w') return 'win';
    if (s === 'loss' || s === 'l' || s === 'lose') return 'loss';
    if (s === 'be' || s === 'breakeven' || s === 'break even') return 'be';
    if (s === 'partial') return 'partial';
    return null;
  }

  function targetsFor(mode) {
    const m = MODES[mode];
    return m ? { sl: m.sl, be: m.sl, tp: { ...m.tp } } : null;
  }

  // next level of one system after it traded at `level` and ended with `outcome`
  function nextLevel(sys, level, outcome) {
    const top = MAX_LEVEL[sys] || 10;
    const l = Math.min(Math.max(1, level | 0), top);
    const o = normOutcome(outcome);
    if (o === 'win') return Math.min(l + 1, top);
    if (o === 'loss') return Math.max(1, l - 1);
    return l;
  }

  // The systems of a closed trade: from the plan when it has one, else from an old-style record
  // (reward models in `rr`, one level, one outcome for all of them).
  function systemsOf(t) {
    const plan = t && t.mt4 && t.mt4.plan;
    if (plan && Array.isArray(plan.systems) && plan.systems.length) {
      return plan.systems.filter((s) => SYSTEMS.includes(s.sys)).map((s) => ({ sys: s.sys, level: s.level | 0 || null, outcome: normOutcome(s.outcome) }));
    }
    const list = String((t && t.rr) || '1:2').split(/[,+\s]+/).filter((x) => SYSTEMS.includes(x));
    const out = normOutcome(t && t.outcome);
    return (list.length ? list : ['1:2']).map((sys) => ({ sys, level: t && Number.isInteger(t.level) ? t.level : null, outcome: out }));
  }

  // win if any system won, loss only if every scored system lost, otherwise breakeven (SuperNova's own lock rule)
  function setupOutcome(systems) {
    const scored = (systems || []).filter((s) => normOutcome(s.outcome));
    if (!scored.length) return null;
    if (scored.every((s) => normOutcome(s.outcome) === 'loss')) return 'loss';
    if (scored.some((s) => normOutcome(s.outcome) === 'win')) return 'win';
    return 'be';
  }

  const stamp = (t) => `${t.tradeDate || String(t.timestamp || '').slice(0, 10)} ${t.tradeTime || '00:00'}`;
  const closedSorted = (history) => (history || []).filter((t) => t && normOutcome(t.outcome) && (t.tradeDate || t.timestamp)).slice().sort((a, b) => (stamp(a) < stamp(b) ? -1 : stamp(a) > stamp(b) ? 1 : 0));

  // Which systems are on and the level each will trade at next, replayed from the trade history.
  // A level written on a record wins over the replay (a manual retry, or repeating a level after a withdrawal).
  function ladder(history) {
    const lv = { '1:2': 1, '1:3': 1, '1:5': 1 };
    const open = () => { const a = true, b = lv['1:2'] >= UNLOCK_AT, c = b && lv['1:3'] >= UNLOCK_AT; return { '1:2': a, '1:3': b, '1:5': c }; };
    closedSorted(history).forEach((t) => {
      const on = open();
      systemsOf(t).forEach((s) => {
        if (!on[s.sys] && t.mt4 && t.mt4.plan) return;   // a planned system that was not on cannot have traded
        const from = s.level || lv[s.sys];
        lv[s.sys] = nextLevel(s.sys, from, s.outcome);
      });
      const g = open();                       // gated-off systems go back to L1 and start again when they unlock
      if (!g['1:3']) lv['1:3'] = 1;
      if (!g['1:5']) lv['1:5'] = 1;
    });
    return { levels: { ...lv }, on: open() };
  }

  // next Monday 00:00 after 'YYYY-MM-DD' (a Monday gives the Monday a week on). Returns 'YYYY-MM-DD'.
  function nextMonday(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const days = ((8 - d.getUTCDay()) % 7) || 7;
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // losing-setup streak and the lock, replayed. `now` is { date:'YYYY-MM-DD', time:'HH:MM' } on the MetaTrader clock.
  function weeklyLock(history, now) {
    let streak = 0, lockUntil = null, lastLossDate = null;
    closedSorted(history).forEach((t) => {
      const day = stamp(t).slice(0, 10);
      if (lockUntil && day >= lockUntil) { lockUntil = null; streak = 0; }
      if (lockUntil) return;                                   // traded during a lock: the EA would not have allowed it
      const o = setupOutcome(systemsOf(t));
      if (o === 'loss') { streak++; lastLossDate = day; if (streak >= LOCK_AFTER) lockUntil = nextMonday(day); }
      else if (o) streak = 0;
    });
    if (lockUntil && now && now.date >= lockUntil) { lockUntil = null; streak = 0; }
    return { streak, locked: !!lockUntil, until: lockUntil, limit: LOCK_AFTER, lastLossDate };
  }

  const minutes = (hhmm) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; };

  // The rules check of step 2. Warnings only: the journal cannot stop MetaTrader.
  // `drafts` are plans that are executed but not closed. Returns [{ id, ok, text }].
  function rulesCheck(history, opts) {
    const o = opts || {};
    const now = o.now || {};
    const out = [];
    const lock = weeklyLock(history, now);
    out.push(lock.locked
      ? { id: 'lock', ok: false, text: `Weekly lock: ${lock.limit} losing setups in a row. The EA takes no new setup until Monday ${lock.until} 00:00.` }
      : { id: 'lock', ok: true, text: `Losing setups in a row: ${lock.streak} / ${lock.limit}.` });
    const today = now.date ? (history || []).filter((t) => (t.tradeDate || String(t.timestamp || '').slice(0, 10)) === now.date && !(o.ignoreId && t.tradeId === o.ignoreId)).length : 0;
    out.push(today >= 1
      ? { id: 'daily', ok: false, text: 'You already took a setup today. SuperNova allows one setup a day.' }
      : { id: 'daily', ok: true, text: 'No setup taken yet today.' });
    const open = (o.openPlans || []).filter((p) => !(o.ignoreId && p.id === o.ignoreId)).length;
    out.push(open
      ? { id: 'open', ok: false, text: 'A setup is still open. The EA starts nothing new until every trade is closed.' }
      : { id: 'open', ok: true, text: 'No setup is open.' });
    const m = minutes(now.time);
    if (m == null) out.push({ id: 'window', ok: true, text: 'Add the time on your MetaTrader clock to check the 06:00 to 19:00 window.', unknown: true });
    else out.push(m >= SESSION.from && m < SESSION.to
      ? { id: 'window', ok: true, text: 'Inside the trading window (06:00 to 19:00 on your MetaTrader clock).' }
      : { id: 'window', ok: false, text: 'Outside the trading window. The EA opens setups only from 06:00 to 19:00 on your MetaTrader clock.' });
    return out;
  }

  // which targets fit the room a typical day has left (same arithmetic as the NOVA Command range card)
  function targetFit(roomUp, roomDown) {
    if (!isNum(roomUp) || !isNum(roomDown)) return null;
    const side = (room) => ({ room, rows: Object.keys(MODES).map((mode) => ({ mode, cells: SYSTEMS.map((sys) => ({ sys, tp: MODES[mode].tp[sys], fits: MODES[mode].tp[sys] <= room })) })) });
    return { up: side(roomUp), down: side(roomDown) };
  }
  // room left from the average daily range and the pips already travelled in each direction today
  function roomLeft(adrPips, upPips, downPips) {
    if (!isNum(adrPips) || adrPips <= 0) return null;
    return { up: Math.max(0, adrPips - Math.max(0, upPips || 0)), down: Math.max(0, adrPips - Math.max(0, downPips || 0)) };
  }

  // Good win / good loss / bad win / bad loss: did you follow the plan, and how did it end
  function planCheck(followedPlan, outcome) {
    const o = normOutcome(outcome);
    if (followedPlan == null || !o) return null;
    if (o === 'win') return followedPlan ? 'good_win' : 'bad_win';
    if (o === 'loss') return followedPlan ? 'good_loss' : 'bad_loss';
    return followedPlan ? 'good_be' : 'bad_be';
  }

  const STEPS = [
    { id: 'status', title: 'Status' },
    { id: 'rules', title: 'Rules check' },
    { id: 'setup', title: 'Pair and mode' },
    { id: 'systems', title: 'Systems and levels' },
    { id: 'read', title: 'Market read' },
    { id: 'mind', title: 'Mindset and notes' },
    { id: 'review', title: 'Review' }
  ];

  // what is still missing before the plan can be marked Planned
  function missing(plan) {
    const p = plan || {}, miss = [];
    if (!p.pair) miss.push({ step: 'setup', text: 'Choose the pair' });
    if (!p.direction) miss.push({ step: 'setup', text: 'Choose buy or sell' });
    if (!MODES[p.mode]) miss.push({ step: 'setup', text: 'Choose the mode (xY5, xY7 or xY10)' });
    if (!p.date) miss.push({ step: 'rules', text: 'Enter the date' });
    if (!p.time) miss.push({ step: 'rules', text: 'Enter the time on your MetaTrader clock' });
    const on = (p.systems || []).filter((s) => SYSTEMS.includes(s.sys));
    if (!on.length) miss.push({ step: 'systems', text: 'Switch on at least one system' });
    on.forEach((s) => { if (!(s.level >= 1 && s.level <= MAX_LEVEL[s.sys])) miss.push({ step: 'systems', text: `Set a level for ${s.sys}` }); });
    const r = p.read || {};
    const hasRead = ['long', 'mid', 'short'].some((k) => { const v = r[k]; return v && (typeof v === 'string' ? v.trim() : ((v.note || '').trim() || v.bias)); });
    if (!hasRead) miss.push({ step: 'read', text: 'Write your market read (bias or a note for long, mid or short term)' });
    if (!p.mindset) miss.push({ step: 'mind', text: 'Rate your mindset' });
    return miss;
  }

  // the plan -> the numbers the setup should show once it is taken
  function summary(plan) {
    const t = targetsFor(plan && plan.mode);
    if (!t) return null;
    return { sl: t.sl, be: t.be, systems: (plan.systems || []).filter((s) => SYSTEMS.includes(s.sys)).map((s) => ({ sys: s.sys, level: s.level, tp: t.tp[s.sys] })) };
  }

  return { SYSTEMS, MAX_LEVEL, MODES, UNLOCK_AT, LOCK_AFTER, SESSION, STEPS, normOutcome, targetsFor, nextLevel, systemsOf, setupOutcome, ladder, nextMonday, weeklyLock, rulesCheck, targetFit, roomLeft, planCheck, missing, summary };
});
