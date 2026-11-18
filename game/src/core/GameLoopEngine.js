// CHRONOWEAVE GameLoopEngine — fixed-timestep 60Hz sim, time-dilation juice,
// hit-stop, and the state machine:
// LIVE_DEMO_TITLE → ACTIVE_LOOP → REWIND_TRANSITION → MODIFIER_DRAFT → SUMMARY.
// One loop lasts 10 seconds (STEADY). Rewind fires automatically at 0, on wave
// clear, or EARLY when the player presses Q / R — the rewind is an active verb.
// The previous 10 seconds become a cyan Time Echo that replays the exact
// recorded inputs; you respawn as a new timeline instance.
import { ARENA, DT, MAX_LOOPS, PLAYER, SCORING, DIFFICULTIES, DIFFICULTY_ORDER, mulberry32, clamp, dist, circleRectResolve } from '../config.js';
import { createRecorder, recordFrame, createEcho, echoFrame } from '../systems/TimelineRecorderSystem.js';
import { fireBolt, updateBolts, updateShockwaves, updateRifts, addFloat, spawnSparks, comboMult } from '../systems/BallisticsAndShieldSystem.js';
import { layoutPillars, spawnWave, updateEnemies, waveCleared } from '../systems/ArenaDirector.js';
import { rollOffers, applyUpgrade, upgradeValues } from '../systems/ParadoxUpgradeSystem.js';

export const SPAWN = { x: 640, y: 600 };

// The bot driver is registered once by main.js and kept at module level:
// startRun() replaces the whole state object, so a driver stored ON the state
// would be wiped on the first run (the bot stood still and never fired).
let botDriver = null;
export function setBotDriver(fn) { botDriver = fn; }

export function newRun(difficulty, seed) {
  const diff = DIFFICULTIES[difficulty] || DIFFICULTIES.steady;
  const st = {
    screen: 'title', difficulty, diff, seed,
    rng: mulberry32(seed || 1),
    time: 0, loop: 1, loopTimeLeft: diff.loop, loopElapsed: 0,
    score: 0, best: 0, combo: 0, comboT: 0, crossfires: 0, kills: 0,
    shotsFired: 0, shotsHit: 0, shieldBreaks: 0, shieldBlocks: 0, rewinds: 0,
    player: {
      x: SPAWN.x, y: SPAWN.y, angle: -Math.PI / 2, radius: PLAYER.radius,
      hp: PLAYER.hp, maxHp: PLAYER.hp, fireCd: 0, dashCd: 0, dashT: 0,
      dashDirX: 0, dashDirY: -1, invulnT: 0, alive: true, inRift: false, trail: [],
    },
    echoes: [],
    enemies: [], bolts: [], particles: [], floats: [], rifts: [], shockwaves: [],
    pillars: [], upgradesOwned: [], upgradeLevels: {},
    upgradeValues: upgradeValues({}),
    pendingOffers: [], recording: [], recorder: createRecorder(),
    rewindT: 0, rewindKind: 'timeout', deathT: 0,
    boss: null, bossDefeated: false,
    perLoop: [], loopKills: 0, loopScore: 0, waveTotal: 0,
    bot: false, demo: true, paused: false,
    shake: 0, flash: 0, slowmoT: 0, hitstopT: 0, stasisT: 0, stasisCd: 0,
    win: false, loseReason: '', winGrade: null, newBest: false,
    banner: null, events: [],
  };
  try { st.best = Number(window.localStorage.getItem('chronoweave-best') || 0); } catch (e) { st.best = 0; }
  return st;
}

// Full reset into a fresh run, reusing the same state object (the debug handle
// and renderer keep their reference). NOTHING from the old run survives.
export function startRun(state, difficulty, seed) {
  const best = state.best;
  const fresh = newRun(difficulty, seed);
  fresh.best = best;
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, fresh);
  state.demo = false;
  state.screen = 'play';
  layoutPillars(state);
  spawnWave(state);
  state.banner = { txt: 'LOOP 1 — CLEAR THE ARENA', sub: 'Rewind is your weapon: Q / R', ttl: 2.6 };
}

function applyMove(state, ent, inp, dt) {
  const p = ent;
  const inRift = ent === state.player ? state.player.inRift : false;
  let speed = PLAYER.speed * (inRift ? 0.5 : 1);
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.x += p.dashDirX * PLAYER.dashSpeed * dt;
    p.y += p.dashDirY * PLAYER.dashSpeed * dt;
  } else {
    p.x += inp.mx * speed * dt;
    p.y += inp.my * speed * dt;
  }
  p.x = clamp(p.x, ARENA.x + p.radius, ARENA.x + ARENA.w - p.radius);
  p.y = clamp(p.y, ARENA.y + p.radius, ARENA.y + ARENA.h - p.radius);
  for (const pil of state.pillars) circleRectResolve(p, pil);
  p.angle = inp.aim;
  if (inp.dash && p.dashCd <= 0 && p.dashT <= 0) {
    const cd = state.upgradeValues.phaseDash ? 0.7 : PLAYER.dashCooldown;
    p.dashCd = cd;
    p.dashT = PLAYER.dashTime;
    p.invulnT = Math.max(p.invulnT, state.upgradeValues.phaseDash ? 0.4 : 0.24);
    const mag = Math.sqrt(inp.mx * inp.mx + inp.my * inp.my);
    if (mag > 0.1) { p.dashDirX = inp.mx / mag; p.dashDirY = inp.my / mag; }
    else { p.dashDirX = Math.cos(p.angle); p.dashDirY = Math.sin(p.angle); }
    state.events.push({ type: 'dash', x: p.x, y: p.y });
  }
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.invulnT = Math.max(0, p.invulnT - dt);
  p.trail.push({ x: p.x, y: p.y });
  if (p.trail.length > 14) p.trail.shift();
}

function tryFire(state, ent, inp, from, echoIdx) {
  ent.fireCd -= DT;
  if (!inp.fire || ent.fireCd > 0) return;
  ent.fireCd = state.upgradeValues.fireInterval;
  const isEcho = from === 'echo';
  fireBolt(state, ent, ent.angle, {
    from,
    echoIdx: isEcho ? echoIdx : -1,
    dmg: isEcho ? state.upgradeValues.echoDamage : PLAYER.boltDamage,
    ricochet: state.upgradeValues.ricochet && !isEcho,
    speed: PLAYER.boltSpeed,
  });
  if (!isEcho) state.shotsFired++;
  state.events.push({ type: isEcho ? 'echoShoot' : 'shoot', x: ent.x, y: ent.y });
}

function startRewind(state, kind) {
  state.screen = 'rewind';
  state.rewindKind = kind;
  state.rewindT = 1.25;
  state.rewinds++;
  state.slowmoT = 0.5;
  state.flash = 1;
  state.events.push({ type: 'rewind', x: 640, y: 360 });
}

function finishRewind(state) {
  // The last 10 seconds become a Time Echo.
  const frames = state.recorder.frames.slice();
  if (frames.length >= 30) {
    state.echoes.push(createEcho(frames, SPAWN.x, SPAWN.y));
    while (state.echoes.length > state.upgradeValues.maxEchoes) {
      const old = state.echoes.shift();
      spawnSparks(state, old.x, old.y, 16, '#00E5FF');
    }
  }
  state.perLoop.push({ loop: state.loop, kills: state.loopKills, score: state.loopScore, time: Math.round(state.loopElapsed * 10) / 10 });
  const cleared = state.rewindKind === 'clear';
  if (cleared) {
    const gain = Math.round(SCORING.loopClearBonus * state.diff.scoreMul);
    state.score += gain;
    state.loopScore += gain;
    addFloat(state, 640, 200, 'LOOP CLEAR  +' + gain, '#F5B81D');
  }
  state.loop++;
  state.loopElapsed = 0;
  state.loopTimeLeft = state.diff.loop;
  state.recorder = createRecorder();
  state.recording = [];
  const p = state.player;
  p.x = SPAWN.x; p.y = SPAWN.y; p.angle = -Math.PI / 2;
  p.dashT = 0; p.dashCd = 0; p.invulnT = 1.0; p.trail = [];
  layoutPillars(state);
  spawnWave(state, state.rewindKind !== 'clear');
  if (state.loop > MAX_LOOPS) { state.loop = MAX_LOOPS; }
  if (cleared && state.loop <= MAX_LOOPS) {
    state.pendingOffers = rollOffers(state);
    state.screen = 'draft';
    state.banner = { txt: 'LOOP ' + state.loop + ' INCOMING', sub: 'Choose a paradox upgrade', ttl: 2.2 };
  } else {
    state.screen = 'play';
    const name = state.loop === 5 ? ' — THE WARDEN' : state.loop === 10 ? ' — THE CHRONARCH' : '';
    state.banner = { txt: 'LOOP ' + state.loop + name, sub: cleared ? '' : 'The unfinished fight continues', ttl: 2.4 };
  }
}

function toSummary(state, win, reason) {
  state.win = win;
  state.loseReason = reason || '';
  state.screen = 'summary';
  if (win) {
    const gain = Math.round(state.loopTimeLeft * SCORING.winBonusPerSecond);
    state.score += gain;
    state.winGrade = state.score >= SCORING.gradeSMin ? 'S' : state.score >= SCORING.gradeAMin ? 'A' : 'B';
    state.newBest = state.score > state.best;
    if (state.newBest) {
      state.best = state.score;
      try { window.localStorage.setItem('chronoweave-best', String(state.best)); } catch (e) { /* no storage */ }
    }
    state.events.push({ type: 'win' });
  } else {
    state.events.push({ type: 'lose' });
  }
}

function stepPlay(state, inp, dt, audio, demo) {
  const p = state.player;
  state.loopElapsed += dt;
  state.loopTimeLeft -= dt;
  // Stasis grenade.
  if (inp.stasis && state.upgradeValues.stasis && state.stasisCd <= 0) {
    state.stasisT = 2.5; state.stasisCd = 12;
    state.events.push({ type: 'stasis', x: p.x, y: p.y });
  }
  state.stasisCd = Math.max(0, state.stasisCd - dt);
  state.stasisT = Math.max(0, state.stasisT - dt);
  // Live player.
  if (p.alive) {
    recordFrame(state.recorder, inp);
    applyMove(state, p, inp, dt);
    tryFire(state, p, inp, 'player', -1);
  }
  // Echoes replay their exact recorded inputs.
  state.echoes.forEach((ec, i) => {
    const f = echoFrame(ec);
    applyMove(state, ec, f, dt);
    tryFire(state, ec, f, 'echo', i);
    ec.age += dt;
  });
  updateEnemies(state, dt);
  updateBolts(state, dt);
  updateShockwaves(state, dt);
  updateRifts(state, dt);
  // Combo decay.
  if (state.comboT > 0) { state.comboT -= dt; if (state.comboT <= 0) state.combo = 0; }
  if (demo) {
    // Attract mode: the demo never ends — it rewinds and re-fights forever,
    // cycling loops 1-3 behind the title. Never leaves the title screen.
    const needRewind = !p.alive || waveCleared(state) || state.loopTimeLeft <= 0;
    if (needRewind) {
      const frames = state.recorder.frames.slice();
      if (frames.length >= 30 && state.echoes.length < 2) {
        state.echoes.push(createEcho(frames, SPAWN.x, SPAWN.y));
      }
      if (!p.alive) { p.hp = p.maxHp; p.alive = true; }
      state.recorder = createRecorder();
      state.loop = (state.loop % 3) + 1;
      state.loopElapsed = 0;
      state.loopTimeLeft = state.diff.loop;
      p.x = SPAWN.x; p.y = SPAWN.y; p.invulnT = 1;
      layoutPillars(state);
      spawnWave(state);
      state.events.push({ type: 'rewind', x: 640, y: 360 });
    }
    return;
  }
  if (state.bossDefeated) { toSummary(state, true, ''); return; }
  if (!p.alive) {
    state.deathT += dt;
    if (state.deathT > 1.0) { toSummary(state, false, 'Your timeline collapsed on Loop ' + state.loop + '.'); }
    return;
  }
  if (waveCleared(state)) { startRewind(state, 'clear'); return; }
  if (state.loopTimeLeft <= 0) { startRewind(state, 'timeout'); return; }
  if (inp.rewind && state.loopElapsed >= 2) { startRewind(state, 'manual'); }
}

function drainEvents(state, audio) {
  for (const ev of state.events) {
    if (!audio) continue;
    switch (ev.type) {
      case 'shoot': audio.sfx('shoot'); break;
      case 'echoShoot': audio.sfx('echoShoot'); break;
      case 'shieldBlock': state.shieldBlocks++; audio.sfx('block'); break;
      case 'shieldBreak': state.shieldBreaks++; state.slowmoT = Math.max(state.slowmoT, 0.18); state.hitstopT = Math.max(state.hitstopT, 0.045); audio.sfx('shieldBreak'); break;
      case 'crossfire': audio.sfx('crossfire'); break;
      case 'kill': state.slowmoT = Math.max(state.slowmoT, 0.12); audio.sfx('kill'); break;
      case 'dash': audio.sfx('dash'); break;
      case 'detonate': audio.sfx('explode'); break;
      case 'rewind': audio.sfx('rewind'); break;
      case 'upgrade': audio.sfx('upgrade'); break;
      case 'sniperTele': audio.sfx('sniperTele'); break;
      case 'sniperShot': audio.sfx('sniperShot'); break;
      case 'stasis': audio.sfx('stasis'); break;
      case 'playerHit': audio.sfx('playerHit'); break;
      case 'win': audio.sfx('win'); break;
      case 'lose': audio.sfx('lose'); break;
      default: break;
    }
  }
  state.events.length = 0;
}

function updateFx(state, dt) {
  for (const pt of state.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.ttl -= dt; }
  state.particles = state.particles.filter((pt) => pt.ttl > 0);
  for (const f of state.floats) { f.y -= 26 * dt; f.ttl -= dt; }
  state.floats = state.floats.filter((f) => f.ttl > 0);
  if (state.banner) { state.banner.ttl -= dt; if (state.banner.ttl <= 0) state.banner = null; }
  state.shake = Math.max(0, state.shake - 30 * dt);
  state.flash = Math.max(0, state.flash - dt * 1.4);
  state.slowmoT = Math.max(0, state.slowmoT - dt);
}

export function step(state, input, audio, dt) {
  state.time += dt;
  if (input.mutePressed) {
    state.muted = !state.muted;
    if (audio) audio.setMuted(state.muted);
    input.mutePressed = false;
  }
  // Hit-stop freezes the sim for a beat after a shield break.
  if (state.hitstopT > 0) { state.hitstopT -= dt; drainEvents(state, audio); return; }

  if (state.screen === 'title') {
    if (input.startPressed) { input.startPressed = false; startRun(state, state.difficulty, (state.seed + 1) >>> 0); drainEvents(state, audio); return; }
    for (const r of input.clickRects) {
      if (r.kind === 'difficulty' && input.consumeClick(r)) {
        state.difficulty = DIFFICULTY_ORDER[r.index] || state.difficulty;
        state.diff = DIFFICULTIES[state.difficulty];
        if (audio) audio.sfx('click');
      }
      if (r.kind === 'start' && input.consumeClick(r)) {
        startRun(state, state.difficulty, (state.seed + 1) >>> 0);
        drainEvents(state, audio);
        return;
      }
    }
    // Attract-mode battle runs behind the title.
    const demoInp = botDriver ? botDriver(state) : { mx: 0, my: 0, aim: -Math.PI / 2, fire: false, dash: false, stasis: false, rewind: false };
    stepPlay(state, demoInp, dt, audio, true);
    updateFx(state, dt);
    drainEvents(state, audio);
    input.clearEdges();
    return;
  }

  if (state.paused) {
    if (input.pausePressed) { state.paused = false; input.pausePressed = false; }
    input.clearEdges();
    return;
  }
  if (input.pausePressed) { state.paused = true; input.pausePressed = false; input.clearEdges(); return; }

  if (state.screen === 'play') {
    const inp = {
      mx: input.moveVector().mx, my: input.moveVector().my,
      aim: Math.atan2(input.mouseY - state.player.y, input.mouseX - state.player.x),
      fire: input.mouseDown, dash: input.dashPressed,
      stasis: input.stasisPressed, rewind: input.rewindPressed,
    };
    if (state.bot && botDriver) {
      const b = botDriver(state);
      inp.mx = b.mx; inp.my = b.my; inp.aim = b.aim; inp.fire = b.fire; inp.dash = b.dash;
      inp.stasis = b.stasis || false; inp.rewind = b.rewind || false;
    }
    stepPlay(state, inp, dt, audio, false);
    updateFx(state, dt);
    drainEvents(state, audio);
    input.clearEdges();
    return;
  }

  if (state.screen === 'rewind') {
    state.rewindT -= dt;
    updateFx(state, dt);
    drainEvents(state, audio);
    if (state.rewindT <= 0) finishRewind(state);
    input.clearEdges();
    return;
  }

  if (state.screen === 'draft') {
    let picked = input.choicePressed;
    for (const r of input.clickRects) {
      if (r.kind === 'choice' && input.consumeClick(r)) picked = r.index;
    }
    if (picked >= 0 && picked < state.pendingOffers.length) {
      const id = state.pendingOffers[picked].id;
      applyUpgrade(state, id);
      state.pendingOffers = [];
      state.screen = 'play';
      state.banner = { txt: 'LOOP ' + state.loop, sub: '', ttl: 1.6 };
    }
    updateFx(state, dt);
    drainEvents(state, audio);
    input.clearEdges();
    return;
  }

  if (state.screen === 'summary') {
    if (input.restartPressed) { input.restartPressed = false; startRun(state, state.difficulty, (state.seed + 1) >>> 0); drainEvents(state, audio); return; }
    for (const r of input.clickRects) {
      if (r.kind === 'restart' && input.consumeClick(r)) {
        startRun(state, state.difficulty, (state.seed + 1) >>> 0);
        drainEvents(state, audio);
        return;
      }
    }
    updateFx(state, dt);
    drainEvents(state, audio);
    input.clearEdges();
    return;
  }
  input.clearEdges();
}
