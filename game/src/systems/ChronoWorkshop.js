// CHRONOWEAVE ChronoWorkshop — permanent meta-progression between runs.
// Shards are earned by every finished run (win or lose) and never expire;
// workshop levels are bought once and apply to EVERY future run, including
// the run that starts right after the purchase. Everything is stored in
// localStorage under one key, so a profile survives reloads, restarts, and
// new sessions — the workshop is permanent, the run is not.
//
// Six items, three levels each, rising cost (5 / 10 / 15 shards). Every
// effect is REAL and wired into the systems that already run the fight:
// max HP at run start, outgoing damage in damageEnemy, WEAVE gain on
// crossfire, dash cooldown in applyMove, incoming damage in damagePlayer,
// score gains in killEnemy / loop-clear / win bonus. A level shown on
// screen always does what it says — the verification harness re-reads the
// live values after buying, exactly like it does for upgrades.
export const WORKSHOP_KEY = 'chronoweave-workshop';

export const WORKSHOP_ITEMS = [
  { id: 'hull', name: 'REINFORCED HULL', icon: '⬢', max: 3, costs: [5, 10, 15], desc: '+10 max HP per level. Start every run tougher.' },
  { id: 'coil', name: 'OVERCLOCKED COIL', icon: '≫', max: 3, costs: [5, 10, 15], desc: '+5% damage per level. Every bolt hits harder.' },
  { id: 'conduit', name: 'WEAVE CONDUIT', icon: '⚡', max: 3, costs: [5, 10, 15], desc: '+10% WEAVE gain per level. Surges come sooner.' },
  { id: 'servos', name: 'PHASE SERVOS', icon: '≋', max: 3, costs: [5, 10, 15], desc: 'Dash recharges 10% faster per level.' },
  { id: 'plating', name: 'RIFT PLATING', icon: '🛡', max: 3, costs: [5, 10, 15], desc: 'Damage taken -5% per level. Hits sting less.' },
  { id: 'ledger', name: 'CHRONO LEDGER', icon: '✦', max: 3, costs: [5, 10, 15], desc: '+5% score per level. Every run pays more.' },
];

export function emptyWorkshop() {
  const levels = {};
  for (const it of WORKSHOP_ITEMS) levels[it.id] = 0;
  return { shards: 0, levels };
}

export function loadWorkshop() {
  try {
    const raw = window.localStorage.getItem(WORKSHOP_KEY);
    if (!raw) return emptyWorkshop();
    const parsed = JSON.parse(raw);
    const ws = emptyWorkshop();
    if (typeof parsed.shards === 'number' && parsed.shards >= 0) ws.shards = Math.floor(parsed.shards);
    if (parsed.levels && typeof parsed.levels === 'object') {
      for (const it of WORKSHOP_ITEMS) {
        const lv = parsed.levels[it.id];
        if (typeof lv === 'number') ws.levels[it.id] = Math.max(0, Math.min(it.max, Math.floor(lv)));
      }
    }
    return ws;
  } catch (e) { return emptyWorkshop(); }
}

export function saveWorkshop(ws) {
  try { window.localStorage.setItem(WORKSHOP_KEY, JSON.stringify(ws)); } catch (e) { /* no storage */ }
}

export function workshopTotalLevels(ws) {
  if (!ws || !ws.levels) return 0;
  return WORKSHOP_ITEMS.reduce((n, it) => n + (ws.levels[it.id] || 0), 0);
}

export function workshopMaxLevels(ws) {
  return WORKSHOP_ITEMS.reduce((n, it) => n + it.max, 0);
}

// Shards for a finished run: score pays, kills pay. A winning bot run
// (~31,000 score, ~99 kills) earns ~40 shards — enough for two level-1
// items, or one item to level 2 (5 + 10). A careless loss earns ~0.
export function shardsForRun(state) {
  return Math.floor((state.score || 0) / 1000) + Math.floor((state.kills || 0) / 10);
}

// Bank the run's shards into the profile and persist. Called once, from
// toSummary — the single place a run ends — so a run can never pay twice.
export function awardShards(state) {
  const earned = shardsForRun(state);
  if (!state.workshop) state.workshop = loadWorkshop();
  state.workshop.shards = (state.workshop.shards || 0) + earned;
  saveWorkshop(state.workshop);
  return earned;
}

// Buy one level. Returns true only on a real purchase: level below max,
// shards cover the next level's cost. The profile is saved immediately,
// so a reload right after buying keeps the level and the new balance.
export function buyWorkshop(state, id) {
  const def = WORKSHOP_ITEMS.find((it) => it.id === id);
  if (!def) return false;
  if (!state.workshop) state.workshop = loadWorkshop();
  const cur = state.workshop.levels[id] || 0;
  if (cur >= def.max) return false;
  const cost = def.costs[cur];
  if ((state.workshop.shards || 0) < cost) return false;
  state.workshop.shards -= cost;
  state.workshop.levels[id] = cur + 1;
  saveWorkshop(state.workshop);
  state.events.push({ type: 'upgrade', x: 640, y: 360, id });
  return true;
}

// ---- Live effect multipliers (all read state.workshop.levels) ----
export function workshopLevel(state, id) {
  return (state.workshop && state.workshop.levels && state.workshop.levels[id]) || 0;
}

export function workshopMaxHpBonus(state) {
  return workshopLevel(state, 'hull') * 10;
}

export function workshopDamageMult(state) {
  return 1 + 0.05 * workshopLevel(state, 'coil');
}

export function workshopWeaveMult(state) {
  return 1 + 0.10 * workshopLevel(state, 'conduit');
}

export function workshopDashMult(state) {
  return 1 - 0.10 * workshopLevel(state, 'servos');
}

export function workshopTakenMult(state) {
  return 1 - 0.05 * workshopLevel(state, 'plating');
}

export function workshopScoreMult(state) {
  return 1 + 0.05 * workshopLevel(state, 'ledger');
}
