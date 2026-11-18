// CHRONOWEAVE ArenaDirector — wave orchestration, enemy archetypes, cover pillars.
// 10 LOOPS. Bosses: Loop 5 THE WARDEN (rotating shield, shockwaves, summons) and
// Loop 10 THE CHRONARCH (3 phases; phase 3 steals your echoes and turns them
// against you). Enemy types: Guardian (shielded), Sniper, Bomber, Chaser, Splitter.
import { ARENA, clamp, dist, angleDiff, circleRectResolve } from '../config.js';
import { damagePlayer, spawnShockwave } from './BallisticsAndShieldSystem.js';

const SPAWNS = [
  { x: 640, y: 110 }, { x: 200, y: 130 }, { x: 1080, y: 130 },
  { x: 140, y: 380 }, { x: 1140, y: 380 }, { x: 640, y: 640 },
  { x: 320, y: 620 }, { x: 960, y: 620 },
];

export function makeEnemy(state, type, x, y, elite) {
  const hpMul = state.diff.hpMul * (elite ? 1.5 : 1);
  const base = {
    guardian: { hp: 36, speed: 72, radius: 22 },
    sniper: { hp: 20, speed: 62, radius: 16 },
    bomber: { hp: 24, speed: 205, radius: 18 },
    chaser: { hp: 18, speed: 175, radius: 14 },
    splitter: { hp: 30, speed: 82, radius: 20 },
    phantom: { hp: 25, speed: 150, radius: 15 },
    warden: { hp: 240, speed: 55, radius: 40 },
    chronarch: { hp: 520, speed: 52, radius: 52 },
  }[type];
  return {
    type, x, y, radius: base.radius,
    hp: Math.round(base.hp * hpMul), maxHp: Math.round(base.hp * hpMul),
    speed: base.speed * (elite ? 1.25 : 1),
    facing: Math.PI / 2, angle: Math.PI / 2,
    elite: !!elite, staggerT: 0, flashT: 0, shieldAngle: Math.PI / 2,
    shieldUp: true, shieldDownT: 0,
    contactCd: 0, teleT: 0, teleState: 0, teleAngle: 0, fireCd: 1 + state.rng() * 1.5,
    waveT: 0, summoned: false, summonWarned: false, summonWarnT: 0, phase: 1, stoleEchoes: false, splitSpawned: false,
    lastPlayerHit: 0, lastEchoHit: 0, crossUsed: 0,
    targetEcho: null, distractT: 0, isMini: false,
  };
}

// Pillar layouts shift every loop so cover is never the same twice.
export function layoutPillars(state) {
  const layouts = [
    [{ x: 300, y: 260, w: 70, h: 70 }, { x: 910, y: 260, w: 70, h: 70 }, { x: 605, y: 430, w: 70, h: 70 }],
    [{ x: 220, y: 340, w: 70, h: 70 }, { x: 990, y: 340, w: 70, h: 70 }, { x: 605, y: 180, w: 70, h: 70 }],
    [{ x: 420, y: 200, w: 70, h: 70 }, { x: 790, y: 200, w: 70, h: 70 }, { x: 420, y: 470, w: 70, h: 70 }, { x: 790, y: 470, w: 70, h: 70 }],
  ];
  const pick = layouts[Math.floor(state.rng() * layouts.length)];
  state.pillars = pick.map((p) => ({ ...p }));
}

// PASS 5 COUNTERWEIGHT: loops 8-10 spawn one extra Sniper each. Snipers are
// the only damage source that ever lands on a strong player (measured: the
// bot takes exactly one hit per run, always a sniper bolt, loops 7-9) — one
// more bolt-stream per late wave is pressure the player must actually dodge,
// not a number tweak on hits that never land.
export function spawnWave(state, keep) {
  const L = state.loop;
  const elite = L >= 6;
  const list = [];
  const add = (type, n, isElite) => {
    for (let i = 0; i < n; i++) {
      const s = SPAWNS[Math.floor(state.rng() * SPAWNS.length)];
      list.push(makeEnemy(state, type, s.x + (state.rng() - 0.5) * 60, s.y + (state.rng() - 0.5) * 40, isElite));
    }
  };
  if (L === 1) { add('guardian', 3, false); }
  else if (L === 2) { add('guardian', 3, false); add('sniper', 2, false); }
  else if (L === 3) { add('guardian', 2, false); add('sniper', 2, false); add('bomber', 2, false); }
  else if (L === 4) { add('guardian', 3, false); add('sniper', 2, false); add('bomber', 2, false); add('chaser', 2, false); }
  else if (L === 5) {
    const w = makeEnemy(state, 'warden', 640, 150, false);
    list.push(w); state.boss = w;
    add('sniper', 2, false);
  }
  else if (L === 6) { add('guardian', 3, true); add('sniper', 2, false); add('bomber', 2, false); add('chaser', 2, false); }
  else if (L === 7) { add('guardian', 3, true); add('sniper', 3, false); add('bomber', 2, false); add('splitter', 2, false); }
  else if (L === 8) { add('guardian', 4, true); add('sniper', 4, true); add('bomber', 3, false); add('chaser', 2, false); add('splitter', 2, false); }
  else if (L === 9) { add('guardian', 4, true); add('sniper', 4, true); add('bomber', 3, false); add('chaser', 4, false); add('splitter', 2, true); }
  else if (L === 10) {
    const c = makeEnemy(state, 'chronarch', 640, 150, false);
    list.push(c); state.boss = c;
    add('sniper', 3, false); add('chaser', 2, false);
  }
  // FRAY: a frayed timeline spawns extra Chasers — one per fray (cap 3).
  // The timeout rewind's price, paid at the start of the next loop.
  if (state.fray > 0) add('chaser', Math.min(3, state.fray), false);
  if (keep) {
    // Timeout / manual rewind: the unfinished fight continues — leftovers stay,
    // capped at 12 live enemies so the arena never floods.
    state.enemies = state.enemies.concat(list).slice(0, 12);
  } else {
    state.enemies = list;
  }
  state.waveTotal = state.enemies.length;
  state.loopKills = 0;
  state.loopScore = 0;
}

function moveWithCollisions(state, e, vx, vy, dt) {
  e.x += vx * dt; e.y += vy * dt;
  e.x = clamp(e.x, ARENA.x + e.radius, ARENA.x + ARENA.w - e.radius);
  e.y = clamp(e.y, ARENA.y + e.radius, ARENA.y + ARENA.h - e.radius);
  for (const pil of state.pillars) circleRectResolve(e, pil);
}

// Guardians face their current threat. An echo that shot them recently distracts
// them: they turn their shield toward the echo and expose their back to the player.
function guardianTarget(state, e) {
  const p = state.player;
  let tx = p.x, ty = p.y, d = dist(e.x, e.y, p.x, p.y);
  if (e.distractT > 0) {
    const ec = state.echoes[e.targetEcho];
    if (ec) { tx = ec.x; ty = ec.y; d = dist(e.x, e.y, ec.x, ec.y); }
  }
  return { tx, ty, d };
}

function contactHit(state, e, p, dmg) {
  if (e.contactCd <= 0 && p.alive) {
    e.contactCd = 0.9;
    damagePlayer(state, dmg, e.x, e.y, e.type);
  }
}

export function updateEnemies(state, dt) {
  const p = state.player;
  const frozen = state.stasisT > 0;
  for (const e of state.enemies) {
    if (e.hp <= 0) {
      // Splitter bursts into 2 fast minis on death.
      if (e.type === 'splitter' && !e.splitSpawned && !e.isMini) {
        e.splitSpawned = true;
        for (let i = 0; i < 2; i++) {
          const m = makeEnemy(state, 'chaser', e.x + (i ? 24 : -24), e.y, false);
          m.hp = 10; m.maxHp = 10; m.speed = 195; m.radius = 10; m.isMini = true;
          state.enemies.push(m);
        }
        state.events.push({ type: 'split', x: e.x, y: e.y });
      }
      continue;
    }
    e.flashT = Math.max(0, e.flashT - dt);
    e.contactCd = Math.max(0, e.contactCd - dt);
    // A broken shield re-raises after ~3s. Ticks even while staggered so the
    // down-window is real wall-clock time, not stretched by the stagger.
    if (e.shieldDownT > 0) {
      e.shieldDownT -= dt;
      if (e.shieldDownT <= 0) { e.shieldUp = true; e.shieldDownT = 0; }
    }
    if (e.staggerT > 0) { e.staggerT -= dt; continue; }
    if (frozen) continue;
    e.distractT = Math.max(0, e.distractT - dt);
    if (e.type === 'guardian' || e.type === 'warden' || e.type === 'chronarch') {
      const t = guardianTarget(state, e);
      // Facing turns toward the threat at a LIMITED rate (1.2 rad/s): a player
      // who strafes or dashes past gets behind the shield. Without this the
      // guardian would track instantly and no frontal shot could ever land.
      const want = Math.atan2(t.ty - e.y, t.tx - e.x);
      const turnRate = e.type === 'guardian' ? 1.2 : 2.0;
      e.facing += clamp(angleDiff(want, e.facing), -turnRate * dt, turnRate * dt);
      e.shieldAngle = e.facing;
      if (e.type === 'warden' || e.type === 'chronarch') {
        // Boss shield ROTATES independently of the body: the safe window moves.
        e.shieldAngle += dt * 1.1;
        e.waveT += dt;
        const cadence = e.type === 'chronarch' ? (e.phase >= 3 ? 4 : e.phase === 2 ? 4.5 : 6) : 6;
        if (e.waveT > cadence) {
          e.waveT = 0;
          spawnShockwave(state, e.x, e.y, e.type);
        }
        // WARDEN PHASE II — telegraphed summon: at 55% HP the Warden starts
        // summoning (1s of gold warning markers + callout) and the snipers
        // arrive when the warning ends. The phase flips when they land.
        if (e.type === 'warden' && !e.summoned) {
          if (!e.summonWarned && e.hp < e.maxHp * 0.55) {
            e.summonWarned = true;
            e.summonWarnT = 1.0;
            state.events.push({ type: 'summonWarn', x: e.x, y: e.y });
          }
          if (e.summonWarned && e.summonWarnT > 0) {
            e.summonWarnT -= dt;
            if (e.summonWarnT <= 0) {
              e.summoned = true;
              e.phase = 2;
              state.enemies.push(makeEnemy(state, 'sniper', e.x - 120, e.y + 60, false));
              state.enemies.push(makeEnemy(state, 'sniper', e.x + 120, e.y + 60, false));
              state.events.push({ type: 'summon', x: e.x, y: e.y });
              state.waveTotal += 2;
              state.banner = { txt: 'THE WARDEN — PHASE II — SNIPER SUMMON', sub: 'Two Chrono Snipers join the fight', ttl: 2.4 };
            }
          }
        }
        if (e.type === 'chronarch') {
          const frac = e.hp / e.maxHp;
          const newPhase = frac <= 0.33 ? 3 : frac <= 0.66 ? 2 : 1;
          if (newPhase !== e.phase) {
            e.phase = newPhase;
            state.events.push({ type: 'bossPhase', x: e.x, y: e.y, phase: newPhase });
            // Phase banner names the ability, so the phase change reads at a
            // glance: Phase II calls snipers, Phase III steals your echoes.
            state.banner = {
              txt: 'THE CHRONARCH — PHASE ' + (newPhase === 2 ? 'II — SNIPER CALL' : 'III — ECHO THEFT'),
              sub: newPhase === 2 ? 'It summons two Chrono Snipers' : 'Your echoes turn against you!',
              ttl: 2.4,
            };
            if (newPhase === 2 && !e.summoned) {
              e.summoned = true;
              state.enemies.push(makeEnemy(state, 'sniper', e.x - 140, e.y + 70, false));
              state.enemies.push(makeEnemy(state, 'sniper', e.x + 140, e.y + 70, false));
              state.waveTotal += 2;
            }
            if (newPhase === 3 && !e.stoleEchoes) {
              e.stoleEchoes = true;
              stealEchoes(state);
            }
          }
          e.speed = e.phase === 3 ? 78 : e.phase === 2 ? 66 : 52;
        }
      }
      const sp = e.speed;
      const vx = Math.cos(e.facing) * sp, vy = Math.sin(e.facing) * sp;
      if (t.d > e.radius + p.radius + 6) moveWithCollisions(state, e, vx, vy, dt);
      const dd = dist(e.x, e.y, p.x, p.y);
      if (dd < e.radius + p.radius + 4) contactHit(state, e, p, e.type === 'guardian' ? 8 : 15);
    } else if (e.type === 'sniper') {
      const d = dist(e.x, e.y, p.x, p.y);
      const want = 400;
      const dir = d < want - 30 ? -1 : d > want + 30 ? 1 : 0;
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      e.facing = a;
      if (dir !== 0) moveWithCollisions(state, e, Math.cos(a) * e.speed * dir, Math.sin(a) * e.speed * dir, dt);
      e.fireCd -= dt;
      if (e.teleState === 1) {
        e.teleT -= dt;
        e.teleAngle += angleDiff(Math.atan2(p.y - e.y, p.x - e.x), e.teleAngle) * dt * 1.5;
        if (e.teleT <= 0) {
          e.teleState = 0; e.fireCd = 2.5;
          state.bolts.push({
            x: e.x + Math.cos(e.teleAngle) * 20, y: e.y + Math.sin(e.teleAngle) * 20,
            vx: Math.cos(e.teleAngle) * 760, vy: Math.sin(e.teleAngle) * 760,
            from: 'enemy', src: 'sniper', dmg: 15, pierce: true, ricochet: false, ricocheted: false, life: 2.2, trail: [],
          });
          state.events.push({ type: 'sniperShot', x: e.x, y: e.y });
        }
      } else if (e.fireCd <= 0 && p.alive && d < 620) {
        e.teleState = 1; e.teleT = 1.0;
        e.teleAngle = Math.atan2(p.y - e.y, p.x - e.x);
        state.events.push({ type: 'sniperTele', x: e.x, y: e.y });
      }
    } else if (e.type === 'bomber') {
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      e.facing = a;
      moveWithCollisions(state, e, Math.cos(a) * e.speed, Math.sin(a) * e.speed, dt);
      const d = dist(e.x, e.y, p.x, p.y);
      if (d < 70 && p.alive) {
        e.hp = 0;
        state.events.push({ type: 'detonate', x: e.x, y: e.y });
        spawnSparks(state, e.x, e.y, 26, '#E4572E');
        state.shake = Math.min(16, state.shake + 8);
        if (d < 120) damagePlayer(state, 20, e.x, e.y, 'bomber');
        state.rifts.push({ x: e.x, y: e.y, r: 85, ttl: 6 });
        state.kills++; state.loopKills++;
      }
    } else if (e.type === 'chaser') {
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      e.facing = a;
      moveWithCollisions(state, e, Math.cos(a) * e.speed, Math.sin(a) * e.speed, dt);
      const d = dist(e.x, e.y, p.x, p.y);
      if (d < e.radius + p.radius + 4) contactHit(state, e, p, 6);
    } else if (e.type === 'splitter') {
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      e.facing = a;
      moveWithCollisions(state, e, Math.cos(a) * e.speed, Math.sin(a) * e.speed, dt);
      const d = dist(e.x, e.y, p.x, p.y);
      if (d < e.radius + p.radius + 4) contactHit(state, e, p, 8);
    } else if (e.type === 'phantom') {
      // A stolen echo, turned crimson: hunts the player and shoots.
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      e.facing = a;
      const d = dist(e.x, e.y, p.x, p.y);
      const dir = d < 260 ? -1 : 1;
      moveWithCollisions(state, e, Math.cos(a) * e.speed * dir, Math.sin(a) * e.speed * dir, dt);
      e.fireCd -= dt;
      if (e.fireCd <= 0 && p.alive && d < 520) {
        e.fireCd = 1.8;
        state.bolts.push({
          x: e.x + Math.cos(a) * 18, y: e.y + Math.sin(a) * 18,
          vx: Math.cos(a) * 640, vy: Math.sin(a) * 640,
          from: 'enemy', dmg: 10, pierce: false, ricochet: false, ricocheted: false, life: 2.0, trail: [],
        });
      }
      if (d < e.radius + p.radius + 4) contactHit(state, e, p, 8);
    }
  }
  state.enemies = state.enemies.filter((e) => e.hp > 0);
}

// THE CHRONARCH's signature attack: every live echo is ripped out of the
// timeline and turned into a hostile crimson phantom.
export function stealEchoes(state) {
  const stolen = state.echoes.splice(0, state.echoes.length);
  for (const ec of stolen) {
    const ph = makeEnemy(state, 'phantom', ec.x, ec.y, false);
    state.enemies.push(ph);
    state.waveTotal += 1;
  }
  state.events.push({ type: 'echoTheft', x: 640, y: 360, count: stolen.length });
  state.shake = 16;
}

function spawnSparks(state, x, y, n, color) {
  for (let i = 0; i < n; i++) {
    const a = state.rng() * Math.PI * 2, s = 60 + state.rng() * 260;
    state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, ttl: 0.4 + state.rng() * 0.4, color, size: 2 + state.rng() * 3 });
  }
}

export function waveCleared(state) {
  return state.enemies.length === 0 && !state.bossDefeated;
}
