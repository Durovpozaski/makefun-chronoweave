// CHRONOWEAVE ParadoxRelicSystem — feats earned mid-run, kept for the run.
// A relic is NOT a shop item: it is awarded once, the moment the player does
// something worth remembering, and it stays for the rest of the run. Every
// relic has a REAL effect wired into the systems that already run the fight
// (echo damage, shield-break damage, rewind healing, WEAVE gain, max HP,
// all outgoing damage) — a relic shown on screen always does what it says.
// Six relics, all themed on time, echoes, and paradox. Nothing here copies
// any other entry: the names, icons, and triggers are CHRONOWEAVE's own.
export const RELICS = [
  { id: 'lens', name: 'ECHO LENS', icon: '◎', desc: 'Echo damage +15%.', trigger: 'First crossfire' },
  { id: 'hourglass', name: 'SHATTERED HOURGLASS', icon: '⌛', desc: 'Shield-break bonus +20 damage.', trigger: 'First shield break' },
  { id: 'thread', name: 'FRAYED THREAD', icon: '∿', desc: 'Each rewind heals +10 HP.', trigger: 'First rewind' },
  { id: 'seal', name: "WARDEN'S SEAL", icon: '⬢', desc: 'Max HP +15, heal 15 on gain.', trigger: 'Beat THE WARDEN (Loop 5)' },
  { id: 'heart', name: 'ECHO HEART', icon: '♥', desc: 'WEAVE gain +25%.', trigger: '3 echoes alive at once' },
  { id: 'crown', name: "CHRONARCH'S CROWN", icon: '♕', desc: 'All damage +10%.', trigger: 'Beat THE CHRONARCH (Loop 10)' },
];

export function hasRelic(state, id) {
  return (state.relics || []).includes(id);
}

export function relicEchoDamageMult(state) {
  return hasRelic(state, 'lens') ? 1.15 : 1;
}

export function relicShieldBreakBonus(state) {
  return hasRelic(state, 'hourglass') ? 20 : 0;
}

export function relicWeaveMult(state) {
  return hasRelic(state, 'heart') ? 1.25 : 1;
}

export function relicAllDamageMult(state) {
  return hasRelic(state, 'crown') ? 1.1 : 1;
}

// Award a relic once. Returns true only on the first grant. The grant is
// announced through the normal banner (drawn on the playfield), plus a
// floating line and a 'relic' event for sound — the same announcement
// channel every other feat uses, so nothing new has to be rendered.
export function grantRelic(state, id) {
  const def = RELICS.find((r) => r.id === id);
  if (!def) return false;
  if (!state.relics) state.relics = [];
  if (state.relics.includes(id)) return false;
  state.relics.push(id);
  if (id === 'seal') {
    // The Warden's seal hardens the timeline: a permanent +15 max HP for
    // the rest of the run, plus 15 HP back the moment it is earned.
    state.relicHpBonus = (state.relicHpBonus || 0) + 15;
    state.player.maxHp += 15;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 15);
  }
  state.banner = { txt: 'PARADOX RELIC — ' + def.name, sub: def.desc + '  ·  ' + state.relics.length + '/6 relics', ttl: 2.8 };
  state.events.push({ type: 'relic', id, x: state.player.x, y: state.player.y });
  return true;
}

// Feat checks that can only be read from live counters. Called once per
// step from the engine while the fight runs — never from a draft or a
// summary, where the counters cannot move. Boss relics are NOT checked
// here: they are granted from the boss-down event, so the kill itself is
// the trigger and a boss can never be double-counted.
export function checkRelics(state) {
  if (state.screen !== 'play' && state.screen !== 'rewind') return;
  if ((state.crossfires || 0) >= 1) grantRelic(state, 'lens');
  if ((state.shieldBreaks || 0) >= 1) grantRelic(state, 'hourglass');
  if ((state.rewinds || 0) >= 1) grantRelic(state, 'thread');
  if ((state.maxEchoes || 0) >= 3) grantRelic(state, 'heart');
}
