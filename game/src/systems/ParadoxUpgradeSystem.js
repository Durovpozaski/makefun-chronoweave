// CHRONOWEAVE ParadoxUpgradeSystem — between-loop roguelite upgrades.
// Every upgrade has a VISIBLE, measurable effect: upgradeValues() derives the
// live tuning from levels, and the verification harness re-reads it after
// applying + stepping 90 frames (the silent-upgrade bug killed entries before).
export const UPGRADES = [
  { id: 'triple', name: 'TRIPLE ECHO', icon: '◐', max: 1, desc: 'Echo capacity 2 → 3. A third past self joins the fight.' },
  { id: 'ricochet', name: 'TEMPORAL RICOCHET', icon: '↯', max: 1, desc: 'Your shots bounce to 1 nearby enemy at 60% damage.' },
  { id: 'phase', name: 'PHASE DASH', icon: '≋', max: 1, desc: 'Dash passes through enemies and bullets unharmed.' },
  { id: 'stasis', name: 'STASIS GRENADE', icon: '❄', max: 1, desc: 'Press E: freeze all enemies for 2.5s. 12s cooldown.' },
  { id: 'rapid', name: 'RAPID COIL', icon: '≫', max: 3, desc: '+35% fire rate per level. Lasers hum faster.' },
  { id: 'vital', name: 'VITAL LOOP', icon: '♥', max: 3, desc: '+25 max HP and heal 25 per level.' },
  { id: 'echoDmg', name: 'ECHO DAMAGE', icon: '✦', max: 3, desc: '+50% echo damage per level. Your past selves hit harder.' },
  { id: 'crossfire', name: 'CROSSFIRE AMP', icon: '✕', max: 2, desc: 'Crossfire bonus ×2 → ×3, then ×4.' },
];

export function baseValues() {
  return {
    maxEchoes: 2, fireInterval: 0.16, echoDamage: 10, maxHp: 100,
    crossfireMult: 2, phaseDash: false, ricochet: false, stasis: false,
  };
}

// Derive live tuning from owned levels. Pure function of state.upgradeLevels.
export function upgradeValues(levels) {
  const v = baseValues();
  const lv = (id) => levels[id] || 0;
  if (lv('triple') > 0) v.maxEchoes = 3;
  if (lv('ricochet') > 0) v.ricochet = true;
  if (lv('phase') > 0) v.phaseDash = true;
  if (lv('stasis') > 0) v.stasis = true;
  v.fireInterval = 0.16 / (1 + 0.35 * lv('rapid'));
  v.echoDamage = 10 * (1 + 0.5 * lv('echoDmg'));
  v.maxHp = 100 + 25 * lv('vital');
  v.crossfireMult = 2 + lv('crossfire');
  return v;
}

export function availableUpgrades(levels) {
  return UPGRADES.filter((u) => (levels[u.id] || 0) < u.max);
}

// Roll 3 distinct offers from the pool.
export function rollOffers(state) {
  const pool = availableUpgrades(state.upgradeLevels).slice();
  const offers = [];
  while (offers.length < 3 && pool.length) {
    const i = Math.floor(state.rng() * pool.length);
    offers.push(pool.splice(i, 1)[0]);
  }
  return offers;
}

export function applyUpgrade(state, id) {
  const def = UPGRADES.find((u) => u.id === id);
  if (!def) return false;
  const cur = state.upgradeLevels[id] || 0;
  if (cur >= def.max) return false;
  state.upgradeLevels[id] = cur + 1;
  if (!state.upgradesOwned.includes(id)) state.upgradesOwned.push(id);
  state.upgradeValues = upgradeValues(state.upgradeLevels);
  if (id === 'vital') {
    // PASS 7 — a Warden's Seal bonus survives a later Vital Loop pick.
    state.player.maxHp = state.upgradeValues.maxHp + (state.relicHpBonus || 0);
    state.player.hp = Math.min(state.upgradeValues.maxHp, state.player.hp + 25);
  }
  state.events.push({ type: 'upgrade', x: state.player.x, y: state.player.y, id });
  return true;
}
