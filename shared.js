// shared.js — xX Trading Journal PWA utilities
import { supabase, getCurrentUser, hashPin } from './db.js';

// ── Service Worker ────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}

// ── Auth guard ────────────────────────────────────────────────────────────────
export async function requireAuth(redirectTo) {
    const user = await getCurrentUser();
    if (!user) {
        sessionStorage.setItem('xX_redirect', redirectTo || location.pathname);
        location.href = '/login.html';
        return null;
    }
    return user;
}

// ── Fast auth — render from cache instantly, sync DB in background ────────────
export async function requireAuthFast(redirectTo) {
    const user = await getCurrentUser();
    if (!user) {
        sessionStorage.setItem('xX_redirect', redirectTo || location.pathname);
        location.href = '/login.html';
        return null;
    }

    // Detect account switch — if stored user ID doesn't match current session, clear data
    const storedUserId = localStorage.getItem('xX_current_user_id');
    if (storedUserId && storedUserId !== user.id) {
        const keysToRemove = [
            'xX_journal_data', 'xX_cycle_data', 'xX_improvement_engine',
            'xX_lab_data', 'xX_app_pin', 'xX_recovery', 'xX_trader_profile'
        ];
        keysToRemove.forEach(k => localStorage.removeItem(k));
        sessionStorage.clear();
    }
    localStorage.setItem('xX_current_user_id', user.id);

    // Fire background sync — never awaited, never blocks render
    _bgSync();
    return user;
}

// ── PIN guard ─────────────────────────────────────────────────────────────────
export async function requirePin() {
    const pin      = localStorage.getItem('xX_app_pin');
    const unlocked = sessionStorage.getItem('xX_unlocked');
    if (pin && unlocked !== '1') {
        sessionStorage.setItem('xX_redirect', location.pathname);
        location.href = '/lock.html';
        return false;
    }
    return true;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
export function showToast(msg, type = 'info', duration = 3000) {
    let t = document.getElementById('__toast');
    if (!t) {
        t = document.createElement('div');
        t.id = '__toast';
        t.style.cssText = [
            'position:fixed;bottom:90px;left:50%;transform:translateX(-50%) translateY(6px)',
            'padding:11px 20px;border-radius:50px;font-weight:600;font-size:13px',
            'font-family:Inter,sans-serif;opacity:0;pointer-events:none;z-index:99999',
            'white-space:nowrap;transition:all 0.25s ease;border:1px solid'
        ].join(';');
        document.body.appendChild(t);
    }
    const cfg = {
        success: ['rgba(29,185,84,0.15)',  'rgba(29,185,84,0.4)'],
        error:   ['rgba(226,33,52,0.15)',  'rgba(226,33,52,0.4)'],
        info:    ['rgba(74,144,226,0.15)', 'rgba(74,144,226,0.4)']
    };
    const [bg, bd] = cfg[type] || cfg.info;
    t.textContent = msg;
    t.style.background   = bg;
    t.style.borderColor  = bd;
    t.style.color        = '#fff';
    t.style.opacity      = '1';
    t.style.transform    = 'translateX(-50%) translateY(0)';
    clearTimeout(t._tid);
    t._tid = setTimeout(() => {
        t.style.opacity   = '0';
        t.style.transform = 'translateX(-50%) translateY(6px)';
    }, duration);
}

// ── Bottom nav ────────────────────────────────────────────────────────────────
export function injectBottomNav(activePage) {
    if (document.getElementById('__bnav')) return;
    const inject = () => {
        if (document.getElementById('__bnav')) return;
        const nav = document.createElement('nav');
        nav.id = '__bnav';
        nav.style.cssText = [
            'position:fixed;bottom:0;left:0;right:0;background:#0a0a0a',
            'border-top:1px solid rgba(255,255,255,0.07)',
            'display:flex;justify-content:space-around;align-items:center',
            'padding:8px 0 max(8px,env(safe-area-inset-bottom));z-index:9000'
        ].join(';');

        [
            ['/', '🏠', 'HOME', 'home'],
            ['/journal.html', '📝', 'TRADE', 'journal'],
            ['/dashboard.html', '📊', 'DASH', 'dashboard'],
            ['/lab.html', '🧪', 'LAB', 'lab'],
            ['/improvement.html', '🔧', 'IMPROVE', 'improvement'],
        ].forEach(([href, icon, label, key]) => {
            const a = document.createElement('a');
            a.href = href;
            const active = key === activePage;
            a.style.cssText = [
                'display:flex;flex-direction:column;align-items:center;gap:2px',
                'text-decoration:none;padding:4px 10px;border-radius:8px',
                `color:${active ? '#fff' : 'rgba(255,255,255,0.32)'}`
            ].join(';');
            a.innerHTML = `<span style="font-size:19px;line-height:1">${icon}</span>`
                + `<span style="font-size:9px;font-weight:${active?700:500};letter-spacing:0.7px">${label}</span>`;
            nav.appendChild(a);
        });

        document.body.style.paddingBottom = '68px';
        document.body.appendChild(nav);
    };

    if (document.body) inject();
    else document.addEventListener('DOMContentLoaded', inject);
}



// ── NOVA touches ──────────────────────────────────────────────────────────────
// A small, shared layer of polish so every page feels like part of the NOVA family:
// the NOVA star, the motto, a cyan accent on what is selected, soft entrances and clear keyboard focus.
export function novaStarSvg(size = 22) {
    let rays = '';
    for (let i = 0; i < 12; i++) {
        const a = (i * 30 - 90) * Math.PI / 180, long = i % 3 === 0;
        const r1 = 41, r2 = long ? 49 : 45;
        rays += `<line x1="${50 + r1 * Math.cos(a)}" y1="${50 + r1 * Math.sin(a)}" x2="${50 + r2 * Math.cos(a)}" y2="${50 + r2 * Math.sin(a)}" stroke="#33e6d3" stroke-width="${long ? 3.4 : 2.2}" stroke-linecap="round"/>`;
    }
    return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true" style="filter:drop-shadow(0 0 5px rgba(51,230,211,0.55));flex-shrink:0">
        <circle cx="50" cy="50" r="33" fill="none" stroke="#33e6d3" stroke-width="5" opacity="0.9"/>${rays}
        <circle cx="50" cy="50" r="9" fill="#bffaf2"/></svg>`;
}

const NOVA_MOTTOS = ['Discipline • Leverage', 'Execute. Journal. Review.', 'Process over outcome.', 'One good trade is enough.', 'Respect the level you are on.'];

function injectNovaTouches() {
    if (typeof document === 'undefined' || document.getElementById('__nova_touches')) return;
    const go = () => {
        if (document.getElementById('__nova_touches')) return;
        const st = document.createElement('style');
        st.id = '__nova_touches';
        st.textContent = `
            :root { --nova:#33e6d3; --nova-soft:rgba(51,230,211,0.14); --nova-line:rgba(51,230,211,0.45); }
            ::selection { background:rgba(51,230,211,0.28); }
            .pill.selected, .rule-tag.selected { border-color:var(--nova-line) !important; background:var(--nova-soft) !important; box-shadow:0 0 0 1px rgba(51,230,211,0.12), 0 0 14px rgba(51,230,211,0.12); }
            a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, .pill:focus-visible { outline:2px solid var(--nova); outline-offset:2px; }
            input:focus, select:focus, textarea:focus { border-color:var(--nova-line) !important; }
            @keyframes novaRise { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
            .card, .stat-card, .cycle-card-item { animation:novaRise .38s ease both; }
            .nova-foot { display:flex; align-items:center; justify-content:center; gap:10px; margin:34px auto 10px; font-size:11px; letter-spacing:1.6px; text-transform:uppercase; color:rgba(255,255,255,0.32); }
            .nova-foot b { color:rgba(51,230,211,0.8); font-weight:700; }
            .nova-sidefoot { display:flex; align-items:center; gap:8px; }
            @media (prefers-reduced-motion: reduce) { .card, .stat-card, .cycle-card-item { animation:none; } }
        `;
        document.head.appendChild(st);

        // the star beside the xX logo on Home, and in the sidebar footer elsewhere
        const logoRow = document.querySelector('.logo-row');
        if (logoRow && !logoRow.querySelector('.nova-mark')) {
            const w = document.createElement('span'); w.className = 'nova-mark'; w.style.display = 'inline-flex'; w.title = 'NOVA'; w.innerHTML = novaStarSvg(30);
            logoRow.appendChild(w);
        }
        const sf = document.querySelector('.sidebar-foot');
        if (sf && !sf.querySelector('svg')) sf.innerHTML = `<span class="nova-sidefoot">${novaStarSvg(16)}<span>Where discipline<br>becomes leverage.</span></span>`;

        // a quiet line at the foot of the page, different each day
        const main = document.querySelector('main');
        if (main && !document.querySelector('.nova-foot')) {
            const day = Math.floor(Date.now() / 86400000);
            const f = document.createElement('div'); f.className = 'nova-foot';
            f.innerHTML = `${novaStarSvg(14)}<span><b>NOVA</b> · ${NOVA_MOTTOS[day % NOVA_MOTTOS.length]}</span>`;
            main.appendChild(f);
        }
    };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
}
injectNovaTouches();

// ── Cycles: shared rules ──────────────────────────────────────────────────────
// A cycle is a trading period the trader starts and closes. New trades always go into the CURRENT cycle.
export function readCycleLocal() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem('xX_cycle_data') || '{}') || {}; } catch (e) { c = {}; }
    return {
        currentCycle: c.currentCycle >= 1 ? c.currentCycle : 1,
        tradesInCurrentCycle: c.tradesInCurrentCycle || 0,
        completedCycles: Array.isArray(c.completedCycles) ? c.completedCycles : [],
        allTrades: Array.isArray(c.allTrades) ? c.allTrades : [],
        manualCycles: Array.isArray(c.manualCycles) ? c.manualCycles : [],
        updatedAt: c.updatedAt || null,
        extras: c.extras && typeof c.extras === 'object' ? c.extras : {}
    };
}
export function writeCycleLocal(c) { try { localStorage.setItem('xX_cycle_data', JSON.stringify(c)); } catch (e) {} }
export function cycleOf(t) { return (t && t.cycleNumber >= 1) ? t.cycleNumber : 1; }
export function countInCycle(trades, n) { return (trades || []).filter(t => cycleOf(t) === n).length; }

// Merge this device's cycle data with the cloud's. The newest saved choice wins; data from before this
// rule existed (no timestamp) keeps the highest cycle number seen. Every cycle that has trades, and the
// current one, always has a record.
export function reconcileCycles(local, cloud, trades) {
    local = local || readCycleLocal();
    const list = Array.isArray(trades) ? trades : Object.values(trades || {});
    const maxTrade = list.reduce((m, t) => Math.max(m, cycleOf(t)), 1);
    const la = local.updatedAt, ca = cloud && cloud.updatedAt;
    let base;
    if (la && ca) base = la >= ca ? local : cloud;
    else if (la) base = local;
    else if (ca) base = cloud;
    else base = { currentCycle: Math.max(local.currentCycle || 1, (cloud && cloud.currentCycle) || 1, maxTrade), updatedAt: null };
    const current = base.currentCycle >= 1 ? base.currentCycle : 1;

    const byNum = new Map();
    const take = (r) => {
        if (!r || !(r.cycleNumber >= 1)) return;
        const o = byNum.get(r.cycleNumber) || { cycleNumber: r.cycleNumber };
        for (const k of ['name', 'startedAt', 'endedAs', 'endedAt']) if (r[k] && !o[k]) o[k] = r[k];
        if (!o.startedAt && r.createdAt) o.startedAt = r.createdAt;
        byNum.set(r.cycleNumber, o);
    };
    const order = base === local ? [local, cloud] : [cloud, local];
    order.forEach(src => (src && src.completedCycles || []).forEach(take));
    (local.manualCycles || []).forEach(take);
    list.forEach(t => take({ cycleNumber: cycleOf(t) }));
    take({ cycleNumber: current });
    const records = [...byNum.values()].sort((a, b) => a.cycleNumber - b.cycleNumber);
    return {
        currentCycle: current,
        tradesInCurrentCycle: countInCycle(list, current),
        completedCycles: records,
        allTrades: list.map(t => t.tradeId).filter(Boolean),
        updatedAt: base.updatedAt || null,
        extras: { ...((cloud && cloud.extras) || {}), ...(local.extras || {}) }
    };
}

// ── Background sync ───────────────────────────────────────────────────────────
// Throttle: only sync once per 3 minutes per session
const THROTTLE = 3 * 60 * 1000;

function _bgSync() {
    if (sessionStorage.getItem('xX_skip_sync') === '1') {
        sessionStorage.removeItem('xX_skip_sync');
        return;
    }
    // Always sync if no local data exists (first visit / cleared data)
    const hasLocalData = !!localStorage.getItem('xX_journal_data');
    const last = parseInt(sessionStorage.getItem('xX_last_sync') || '0');
    const throttled = (Date.now() - last < THROTTLE) && hasLocalData;
    if (throttled) return;
    sessionStorage.setItem('xX_last_sync', String(Date.now()));

    // Run async without blocking anything
    setTimeout(async () => {
        try {
            const { loadAllTrades, saveCycles, loadCycles } = await import('./db.js');
            // includeScreenshots=true: the merge logic below is written to prefer
            // cloud data over local cache, but that only means anything if we
            // actually fetch it — previously this called loadAllTrades() with no
            // argument, so cloud screenshots were always empty and the "prefer
            // cloud" branch never ran, silently trusting local cache forever
            // even when it was missing screenshots (e.g. localStorage quota
            // limits, a different device, a partial write). This is what let
            // trades stay stuck showing fewer screenshots than were actually
            // uploaded — now the cloud can genuinely fill those gaps back in.
            const result = await loadAllTrades(true);
            if (!result?.journals) return;

            // Merge screenshots: prefer cloud data, fallback to local base64
            const local = JSON.parse(localStorage.getItem('xX_journal_data') || '{}');
            const localJ = local.journals || {};
            const merged = result.journals;

            for (const id of Object.keys(merged)) {
                const ct = merged[id], lt = localJ[id];
                if (!ct.screenshots?.length && lt?.screenshots?.length) {
                    ct.screenshots = lt.screenshots;
                } else if (ct.screenshots?.length && lt?.screenshots?.length) {
                    ct.screenshots = ct.screenshots.map((ss, i) =>
                        ss.data ? ss : (lt.screenshots[i]?.data ? { ...ss, data: lt.screenshots[i].data } : ss)
                    );
                }
            }

            localStorage.setItem('xX_journal_data', JSON.stringify({
                journals: merged,
                tradeCounter: result.tradeCounter || 1,
                userName: local.userName || 'Trader'
            }));

            // Cycles are trading periods the trader starts and closes themselves, so the current cycle is
            // NEVER worked out from how many trades there are. Take the newest saved choice (this device or
            // the cloud) and only add what the trades themselves prove.
            const sorted = Object.values(merged).sort((a,b) => +new Date(a.timestamp) - +new Date(b.timestamp));
            let cloudCycles = null;
            try { cloudCycles = await loadCycles(); } catch (e) { cloudCycles = null; }
            const cycles = reconcileCycles(readCycleLocal(), cloudCycles, sorted);
            localStorage.setItem('xX_cycle_data', JSON.stringify(cycles));
            const cloudNum = cloudCycles ? cloudCycles.currentCycle : null;
            const cloudRecs = cloudCycles ? (cloudCycles.completedCycles || []).length : -1;
            if (cloudNum !== cycles.currentCycle || cloudRecs !== cycles.completedCycles.length) saveCycles(cycles).catch(() => {});
        } catch(e) {
            console.warn('[bgSync]', e);
        }
    }, 100); // tiny delay so page renders first
}

// ── Manual sync (for sync buttons) ───────────────────────────────────────────
export async function syncToLocalStorage() {
    sessionStorage.removeItem('xX_last_sync'); // force even if throttled
    _bgSync();
}

// ── Download helper ───────────────────────────────────────────────────────────
export function downloadFile(content, filename, mimeType) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mimeType }));
    a.download = filename;
    a.click();
}
