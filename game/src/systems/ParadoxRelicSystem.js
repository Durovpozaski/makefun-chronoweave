// CHRONOWEAVE ParadoxRelicSystem — feats earned mid-run, kept for the run.
// A relic is NOT a shop item: it is awarded once, the moment the player does
// something worth remembering, and it stays for the rest of the run. Every
// relic has a REAL effect wired into the systems that already run the fight
// (echo damage, shield-break damage, rewind healing, WEAVE gain, max HP,
// all outgoing damage, crossfire damage, boss damage, surge healing) — a
// relic shown on screen always does what it says.
// Twelve relics, all themed on time, echoes, and paradox. Nothing here
// copies any other entry: the names, icons, and triggers are CHRONOWEAVE's
// own. The first six are the original feats; the second six are the
// endgame feats — the run has to go deep, fight well, and score high to
// earn them all, which is why the win screen showing 12/12 means something.
export const RELICS = [
  { id: 'lens', name: 'ECHO LENS', icon: '◎', desc: 'Echo damage +15%.', trigger: 'First crossfire' },
  { id: 'hourglass', name: 'SHATTERED HOURGLASS', icon: '⌛', desc: 'Shield-break bonus +20 damage.', trigger: 'First shield break' },
  { id: 'thread', name: 'FRAYED THREAD', icon: '∿', desc: 'Each rewind heals +10 HP.', trigger: 'First rewind' },
  { id: 'seal', name: "WARDEN'S SEAL", icon: '⬢', desc: 'Max HP +15, heal 15 on gain.', trigger: 'Beat THE WARDEN (Loop 5)' },
  { id: 'heart', name: 'ECHO HEART', icon: '♥', desc: 'WEAVE gain +25%.', trigger: '3 echoes alive at once' },
  { id: 'crown', name: "CHRONARCH'S CROWN", icon: '♕', desc: 'All damage +10%.', trigger: 'Beat THE CHRONARCH (Loop 10)' },
  { id: 'tide', name: 'TIDE OF ECHOES', icon: '≋', desc: 'Echo damage +15% more.', trigger: '4 echoes alive at once' },
  { id: 'conduit', name: 'SURGE CONDUIT', icon: '⚡', desc: 'Each Paradox Surge heals +15 HP.', trigger: 'First Paradox Surge' },
  { id: 'shieldreaper', name: 'SHIELDREAPER', icon: '✕', desc: 'Crossfire damage +15%.', trigger: '10 shield breaks' },
  { id: 'loopkeeper', name: "LOOPKEEPER'S SEAL", icon: '⬣', desc: 'Max HP +15, heal 15 on gain.', trigger: 'Survive Loop 8' },
  { id: 'ledger', name: "SCOREKEEPER'S LEDGER", icon: '✦', desc: 'All damage +5%.', trigger: 'Score reaches 12,000' },
  { id: 'slayer', name: "SLAYER'S MARK", icon: '☠', desc: 'Damage to bosses +10%.', trigger: '70 kills in one run' },
];

export function hasRelic(state, id) {
  return (state.relics || []).includes(id);
}

export function relicEchoDamageMult(state) {
  let m = 1;
  if (hasRelic(state, 'lens')) m *= 1.15;
  if (hasRelic(state, 'tide')) m *= 1.15;
  return m;
}

export function relicShieldBreakBonus(state) {
  return hasRelic(state, 'hourglass') ? 20 : 0;
}

export function relicWeaveMult(state) {
  return hasRelic(state, 'heart') ? 1.25 : 1;
}

export function relicAllDamageMult(state) {
  let m = 1;
  if (hasRelic(state, 'crown')) m *= 1.1;
  if (hasRelic(state, 'ledger')) m *= 1.05;
  return m;
}

export function relicCrossfireMult(state) {
  return hasRelic(state, 'shieldreaper') ? 1.15 : 1;
}

export function relicBossDamageMult(state) {
  return hasRelic(state, 'slayer') ? 1.1 : 1;
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
  if (id === 'seal' || id === 'loopkeeper') {
    // A seal hardens the timeline: a permanent +15 max HP for the rest of
    // the run, plus 15 HP back the moment it is earned.
    state.relicHpBonus = (state.relicHpBonus || 0) + 15;
    state.player.maxHp += 15;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 15);
  }
  state.banner = { txt: 'PARADOX RELIC — ' + def.name, sub: def.desc + '  ·  ' + state.relics.length + '/' + RELICS.length + ' relics', ttl: 2.8 };
  state.events.push({ type: 'relic', id, x: state.player.x, y: state.player.y });
  return true;
}

// Feat checks that can only be read from live counters. Called once per
// step from the engine while the fight runs, and once from toSummary after
// the win bonus lands — the summary call matters because the win bonus can
// push the score over a threshold after the last kill, and the counters
// cannot move on the summary screen, so granting there is safe (the
// summary draws its relic list from state.relics). Boss relics are NOT
// checked here: they are granted from the boss-down event, so the kill
// itself is the trigger and a boss can never be double-counted. The Loop 8
// seal is NOT checked here either: it is granted from finishRewind when
// Loop 8 ends, however the loop ends.
export function checkRelics(state) {
  if (state.screen !== 'play' && state.screen !== 'rewind' && state.screen !== 'summary') return;
  if ((state.crossfires || 0) >= 1) grantRelic(state, 'lens');
  if ((state.shieldBreaks || 0) >= 1) grantRelic(state, 'hourglass');
  if ((state.rewinds || 0) >= 1) grantRelic(state, 'thread');
  if ((state.maxEchoes || 0) >= 3) grantRelic(state, 'heart');
  if ((state.maxEchoes || 0) >= 4) grantRelic(state, 'tide');
  if ((state.surges || 0) >= 1) grantRelic(state, 'conduit');
  if ((state.shieldBreaks || 0) >= 10) grantRelic(state, 'shieldreaper');
  if ((state.score || 0) >= 12000) grantRelic(state, 'ledger');
  if ((state.kills || 0) >= 70) grantRelic(state, 'slayer');
}
