// plans-db.js - xX Trading Journal
// Trade plans that are not logged yet (drafts, ready, taken). They live on this device and in the cloud table `trade_plans`,
// so a draft started on the phone can be finished on the laptop. Screenshots stay on the device until the trade is logged.
import { supabase, getCurrentUser } from './db.js';

const KEY = 'xX_plans';
export function readLocalPlans() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
export function writeLocalPlans(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* storage full: the cloud copy still has it */ } }
const strip = (p) => { const { screenshots, ...rest } = p; return rest; };

export async function savePlanCloud(plan) {
    try {
        const u = await getCurrentUser(); if (!u) return false;
        const { error } = await supabase.from('trade_plans').upsert({ id: plan.id, user_id: u.id, status: plan.status, plan: strip(plan), updated_at: new Date(plan.updatedAt || Date.now()).toISOString() });
        return !error;
    } catch (e) { return false; }
}
export async function deletePlanCloud(id) {
    try { const u = await getCurrentUser(); if (!u) return false; const { error } = await supabase.from('trade_plans').delete().eq('id', id).eq('user_id', u.id); return !error; } catch (e) { return false; }
}
// local + cloud, newest copy of each plan wins; the local copy keeps its screenshots
export async function loadPlans() {
    const local = readLocalPlans();
    let rows = [];
    try {
        const u = await getCurrentUser();
        if (u) { const r = await Promise.race([supabase.from('trade_plans').select('id,plan,updated_at').eq('user_id', u.id), new Promise((res) => setTimeout(() => res({ data: null }), 5000))]); rows = (r && r.data) || []; }
    } catch (e) { rows = []; }
    const out = { ...local };
    rows.forEach((r) => {
        const cp = r.plan || {}; cp.id = cp.id || r.id;
        const lp = local[r.id];
        if (!lp || (cp.updatedAt || 0) > (lp.updatedAt || 0)) out[r.id] = { ...cp, screenshots: (lp && lp.screenshots) || [] };
    });
    writeLocalPlans(out);
    return out;
}
