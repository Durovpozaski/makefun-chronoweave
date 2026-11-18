// CHRONOWEAVE bootstrap: canvas, input, engine, renderer, audio, bot driver,
// debug handle, and ?shot= staging presets for screenshots.
// The frame loop re-registers requestAnimationFrame FIRST and wraps the rest
// in try/catch, so one error can never kill the game (DOCKMASTER lesson).
import { W, H, DT, ARENA, clamp, dist, segmentHitsRect } from './config.js';
import { createInput } from './input.js';
import { newRun, startRun, step, setBotDriver, goTitle, recordRun, SPAWN } from './core/GameLoopEngine.js';
import { render, winLoseBanner, achievementsFor } from './ui/DiegeticHUDRenderer.js';
import { SynthAudioEngine } from './audio/SynthAudioEngine.js';
import { rollOffers, applyUpgrade, upgradeValues } from './systems/ParadoxUpgradeSystem.js';
import { RELICS, grantRelic } from './systems/ParadoxRelicSystem.js';
import { loadWorkshop, buyWorkshop } from './systems/ChronoWorkshop.js';
import { createEcho } from './systems/TimelineRecorderSystem.js';
import { layoutPillars, spawnWave, makeEnemy } from './systems/ArenaDirector.js';

const canvas = document.getElementById('game');
canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const audio = new SynthAudioEngine();
const state = newRun('steady', 1);
state.demo = true;

// ---- Bot driver (attract mode + verification auto-play) ----
function lineClear(state, x1, y1, x2, y2) {
  for (const pil of state.pillars) if (segmentHitsRect(x1, y1, x2, y2, pil)) return false;
  return true;
}

function computeBotInput(state) {
  const p = state.player;
  const out = { mx: 0, my: 0, aim: p.angle, fire: false, dash: false, stasis: false, rewind: false };
  if (!p.alive) return out;
  // Danger checks first: dash out of trouble.
  let danger = false;
  for (const e of state.enemies) {
    if (e.type === 'bomber' && dist(p.x, p.y, e.x, e.y) < 140) danger = true;
    if (e.type === 'sniper' && e.teleState === 1) {
      const d = dist(p.x, p.y, e.x, e.y);
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      let diff = a - e.teleAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < 0.18 && d < 620) danger = true;
    }
  }
  for (const s of state.shockwaves) {
    const d = dist(p.x, p.y, s.x, s.y);
    if (Math.abs(d - s.r) < 70) danger = true;
  }
  if (danger && p.dashCd <= 0) out.dash = true;
  // Stasis when crowded.
  if (state.upgradeValues.stasis && state.stasisCd <= 0) {
    let near = 0;
    for (const e of state.enemies) if (dist(p.x, p.y, e.x, e.y) < 240) near++;
    if (near >= 2) out.stasis = true;
  }
  // Pick a target: nearest enemy, bombers first when close.
  let target = null, td = Infinity;
  for (const e of state.enemies) {
    let d = dist(p.x, p.y, e.x, e.y);
    if (e.type === 'bomber' && d < 220) d *= 0.5;
    if (e.type === 'chronarch' || e.type === 'warden') d *= 0.8;
    if (d < td) { td = d; target = e; }
  }
  if (!target) {
    // Nothing left: drift to centre, bank the echo early.
    out.mx = (640 - p.x) / 300; out.my = (360 - p.y) / 300;
    const m = Math.hypot(out.mx, out.my);
    if (m > 1) { out.mx /= m; out.my /= m; }
    if (state.loopTimeLeft < 5 && state.loopElapsed >= 2) out.rewind = true;
    return out;
  }
  const d = dist(p.x, p.y, target.x, target.y);
  out.aim = Math.atan2(target.y - p.y, target.x - p.x);
  // Flee when swarmed: never let a Guardian touch the player.
  if (d < 140) {
    const a = Math.atan2(p.y - target.y, p.x - target.x);
    out.mx = Math.cos(a); out.my = Math.sin(a);
    if (p.dashCd <= 0) out.dash = true;
    return out;
  }
  // Flank-dash: every ~2.5s, dash tangentially past a Guardian. Its shield
  // turns at only 1.2 rad/s, so the dash leaves its back exposed for ~1s.
  const mem = state.botMemory || (state.botMemory = { flankT: 1.5 });
  mem.flankT -= 1 / 60;
  if (target.type === 'guardian' && mem.flankT <= 0 && d < 340 && p.dashCd <= 0) {
    mem.flankT = 2.5;
    const side = Math.sin(state.time * 0.8) >= 0 ? 1 : -1;
    const ta = Math.atan2(target.y - p.y, target.x - p.x) + side * Math.PI / 2;
    out.mx = Math.cos(ta); out.my = Math.sin(ta);
    out.dash = true;
    return out;
  }
  // Desired position: ~280 from target, strafing side to side.
  const strafe = Math.sin(state.time * 0.8) * 130;
  const away = Math.atan2(p.y - target.y, p.x - target.x);
  const dx = target.x + Math.cos(away) * 280 + Math.cos(away + Math.PI / 2) * strafe - p.x;
  const dy = target.y + Math.sin(away) * 280 + Math.sin(away + Math.PI / 2) * strafe - p.y;
  // Flee close bombers.
  let fx = 0, fy = 0;
  for (const e of state.enemies) {
    if (e.type === 'bomber') {
      const bd = dist(p.x, p.y, e.x, e.y);
      if (bd < 170) { fx += (p.x - e.x) / bd * 2; fy += (p.y - e.y) / bd * 2; }
    }
  }
  let mx = dx / 160 + fx, my = dy / 160 + fy;
  const m = Math.hypot(mx, my);
  if (m > 1) { mx /= m; my /= m; }
  out.mx = clamp(mx, -1, 1); out.my = clamp(my, -1, 1);
  if (d < 580 && lineClear(state, p.x, p.y, target.x, target.y)) out.fire = true;
  // Bank the echo early when the loop is almost over: a manual rewind is
  // CLEAN, while letting the clock run out frays the timeline (+Chasers).
  // Rewinding with a full bench just retires the oldest echo — still worth it.
  if (state.loopTimeLeft < 3.5 && state.loopElapsed >= 2) out.rewind = true;
  return out;
}
setBotDriver(computeBotInput);

// ---- Debug handle (verification + screenshot staging) ----
window.__chronoweave = {
  state,
  version: 'chronoweave-1',
  startRun(diff, seed) { startRun(state, diff || 'steady', seed || 1); },
  step(n) { for (let i = 0; i < (n || 1); i++) step(state, input, audio, DT); },
  setBot(on) { state.bot = !!on; },
  setBotDriver(fn) { setBotDriver(fn); },
  // Freeze the live rAF stepping (rendering continues) so a staging script
  // can drive the sim deterministically via step(). Does NOT show PAUSED.
  setLivePaused(on) { state.livePaused = !!on; },
  applyUpgrade(id) { return applyUpgrade(state, id); },
  // PASS 7: relic staging / verification surface.
  grantRelic(id) { return grantRelic(state, id); },
  relics() { return (state.relics || []).slice(); },
  // PASS 8: workshop staging / verification surface. setWorkshop writes a
  // profile to localStorage; the next startRun loads it (newRun reads the
  // profile), so staging sets it BEFORE startRun.
  workshop() { return JSON.parse(JSON.stringify(state.workshop || loadWorkshop())); },
  setWorkshop(profile) {
    try { window.localStorage.setItem('chronoweave-workshop', JSON.stringify(profile)); } catch (e) { /* ignore */ }
    if (state.screen === 'title') state.workshop = loadWorkshop();
    return state.workshop;
  },
  buyWorkshop(id) { return buyWorkshop(state, id); },
  upgradeValues() { return { ...state.upgradeValues }; },
  forceLoop(i) {
    state.loop = i;
    state.loopElapsed = 0;
    state.loopTimeLeft = state.diff.loop;
    state.enemies = [];
    state.bolts = [];
    state.boss = null;
    state.bossDefeated = false;
    state.loopKills = 0;
    state.loopScore = 0;
    state.player.x = SPAWN.x; state.player.y = SPAWN.y;
    layoutPillars(state);
    spawnWave(state);
    state.screen = 'play';
  },
  spawnEcho() {
    if (state.recorder.frames.length >= 30) {
      state.echoes.push(createEcho(state.recorder.frames.slice(), SPAWN.x, SPAWN.y));
      state.maxEchoes = Math.max(state.maxEchoes || 0, state.echoes.length);
      return true;
    }
    return false;
  },
  // Pass 4 debug surface: the exact banner string the HUD draws, the
  // achievements list for the current run, and the title return path.
  bannerText() { return winLoseBanner(state); },
  achievements() { return achievementsFor(state); },
  toTitle() { goTitle(state); },
  setScore(n) { state.score = n; },
  setBest(n) {
    state.best = n;
    // PASS 6: the staged best is also the staged best for this difficulty,
    // so the title's per-difficulty BEST reads the same number.
    state.difficultyBest[state.difficulty] = Math.max(state.difficultyBest[state.difficulty] || 0, n);
    try {
      window.localStorage.setItem('chronoweave-best', String(n));
      window.localStorage.setItem('chronoweave-best-by-diff', JSON.stringify(state.difficultyBest));
    } catch (e) { /* ignore */ }
  },
  // PASS 6: cover staging — the screenshot script sets this after startRun
  // (startRun replaces the state object, so it must be set after).
  setCoverMode(on) { state.coverMode = !!on; },
  // PASS 6: add one live enemy of a type to the staged wave (a real
  // makeEnemy, so the cover HUD's FOES list counts it exactly).
  addEnemy(type, x, y) { const e = makeEnemy(state, type, x, y, false); state.enemies.push(e); state.waveTotal = state.enemies.length; return e; },
  forceDraft() {
    state.pendingOffers = rollOffers(state);
    state.draftKind = 'clear';
    state.screen = 'draft';
  },
  forceWin() {
    // PASS 8 staged win: the best real bot run OF THIS BUILD, seed 10,
    // measured live (step(60) batches, seed sweep 1-10, empty workshop):
    // score 34,454, 99 kills, 14 crossfires, 26 shield breaks, 9 rewinds,
    // 3 surges, 288 shots / 173 hits (60%), 73.6s, hp 205/205, 4 max
    // echoes, 12/12 relics, +43 shards. The per-loop rows are the run's
    // real rows, exactly as the live game records them: they are loop
    // kill-scores, so — as in any real win — they do not sum to the final
    // score (loop-clear and win bonuses land in the total, not in a row).
    // Loop 10's row is the run's live loop counters at the Chronarch kill
    // (11 kills, 1870, 5.6s) — perLoop itself never records loop 10,
    // because the win bypasses finishRewind. SAME BEST as every other
    // staged shot, so BEST is identical on all four screenshots. The
    // workshop profile is the staged profile shared with the cover (5
    // levels bought, 25 shards banked before this run): 25 + 43 earned =
    // 68 balance, which is what the summary header shows.
    state.loop = 10;
    state.score = 34454;
    state.best = 34454;
    state.perLoop = [
      { loop: 1, kills: 2, score: 210, time: 6.5 },
      { loop: 2, kills: 3, score: 330, time: 6.5 },
      { loop: 3, kills: 8, score: 1140, time: 6.5 },
      { loop: 4, kills: 9, score: 2320, time: 6.5 },
      { loop: 5, kills: 6, score: 2130, time: 5.7 },
      { loop: 6, kills: 9, score: 4190, time: 5.4 },
      { loop: 7, kills: 14, score: 7000, time: 4.6 },
      { loop: 8, kills: 19, score: 8710, time: 6.5 },
      { loop: 9, kills: 18, score: 4510, time: 6.5 },
      { loop: 10, kills: 11, score: 1870, time: 5.6 },
    ];
    state.kills = 99; state.crossfires = 14; state.shieldBreaks = 26; state.rewinds = 9; state.surges = 3;
    // PASS 8: a real winning run earns all twelve relics — the crown on
    // the Chronarch kill, the seal on the Warden, the rest on feats along
    // the way — so the staged win shows RELICS 12/12 and +43 SHARDS.
    state.relics = RELICS.map((r) => r.id);
    state.shardsEarned = 43;
    state.workshop = { shards: 68, levels: { hull: 2, coil: 1, conduit: 1, servos: 0, plating: 1, ledger: 0 } };
    state.shotsFired = 288; state.shotsHit = 173;
    state.runTime = 73.6;
    state.maxEchoes = 4;
    state.player.hp = 205; state.player.maxHp = 205;
    state.win = true; state.winGrade = 'S'; state.newBest = true;
    state.screen = 'summary';
    // The staged win bypasses toSummary, so record the run here — the
    // title screen's LAST RUNS must list it like a real win.
    recordRun(state);
  },
};

// ---- ?shot= staging presets (screenshots come from the real running game) ----
function applyShotPreset() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  if (!shot) return;
  state.bot = false;
  if (shot === 'cover') {
    window.__chronoweave.setBest(34454);
    startRun(state, 'steady', Number(q.get('seed') || 7));
    window.__chronoweave.forceLoop(10);
    state.score = 12400; state.combo = 24; state.comboT = 2;
    state.chainShown = 3; state.chainT = 0.9; // staged CHAIN x3 callout: combo 24 genuinely reaches x3
    state.bot = true;
  } else if (shot === 'upgrade') {
    window.__chronoweave.setBest(34454);
    startRun(state, 'steady', 7);
    // Stage a real Loop 6 draft: forceLoop spawns the Loop 6 wave first, so
    // the NEXT-LOOP preview on the draft screen counts the actual wave.
    window.__chronoweave.forceLoop(6);
    state.score = 8300;
    window.__chronoweave.forceDraft();
  } else if (shot === 'win') {
    window.__chronoweave.setBest(34454);
    startRun(state, 'steady', 7);
    window.__chronoweave.forceWin();
  }
}

// ---- Frame loop ----
let last = performance.now();
let acc = 0;
function frame(t) {
  requestAnimationFrame(frame); // re-register FIRST: an error can never kill the loop
  try {
    const dtMs = Math.min(100, t - last);
    last = t;
    if (!state.livePaused) {
      const scale = state.slowmoT > 0 ? 0.45 : 1;
      acc += (dtMs / 1000) * scale;
      let n = 0;
      while (acc >= DT && n < 4) { step(state, input, audio, DT); acc -= DT; n++; }
      if (n === 4) acc = 0;
    }
    render(ctx, state, input);
  } catch (err) {
    console.error('[chronoweave] frame error (loop kept alive):', err);
  }
}

window.addEventListener('pointerdown', () => { audio.ensure(); audio.startMusic(); }, { once: true });
window.addEventListener('keydown', () => { audio.ensure(); audio.startMusic(); }, { once: true });
applyShotPreset();
requestAnimationFrame(frame);
