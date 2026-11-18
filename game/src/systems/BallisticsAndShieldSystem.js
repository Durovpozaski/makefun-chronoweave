// CHRONOWEAVE BallisticsAndShieldSystem — laser bolts, directional riot shields,
// ricochets, shockwaves, crossfire combos, and player damage.
// A Guardian's shield covers a ~120-degree frontal arc: shots arriving from the
// front spark off it for 0 damage. The counter-play is an echo drawing its
// attention from the front while the live player backstabs it — a backstab
// triggers SHIELD BREAK (stagger + 1.5x damage).
import { ARENA, PLAYER, WEAVE_PER_CROSSFIRE, WEAVE_MAX, angleDiff, clamp, dist, segmentHitsRect } from '../config.js';
import { relicShieldBreakBonus, relicWeaveMult, relicAllDamageMult } from './ParadoxRelicSystem.js';

export function fireBolt(state, shooter, angle, opts) {
  const o = opts || {};
  const speed = o.speed || PLAYER.boltSpeed;
  state.bolts.push({
    x: shooter.x + Math.cos(angle) * (shooter.radius + 6),
    y: shooter.y + Math.sin(angle) * (shooter.radius + 6),
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    from: o.from || 'player', fromEcho: o.echoIdx ?? -1, dmg: o.dmg || PLAYER.boltDamage,
    pierce: !!o.pierce, ricochet: !!o.ricochet, ricocheted: false,
    life: 1.6, trail: [],
  });
}

// Is the bolt arriving from the guardian's shielded front? angleFrom is the
// direction FROM the guardian TO the bolt's current position.
function isFrontal(enemy, bolt) {
  const a = Math.atan2(bolt.y - enemy.y, bolt.x - enemy.x);
  const shield = enemy.shieldAngle !== undefined ? enemy.shieldAngle : enemy.facing;
  return Math.abs(angleDiff(a, shield)) < Math.PI / 3;
}

export function damageEnemy(state, enemy, dmg, from, hitX, hitY, fromEchoIdx) {
  // An echo's shot distracts a Guardian: it turns its shield toward the echo.
  if (from === 'echo' && (enemy.type === 'guardian' || enemy.type === 'warden')) {
    enemy.distractT = 2.0;
    enemy.targetEcho = fromEchoIdx >= 0 ? fromEchoIdx : 0;
  }
  if (enemy.hp <= 0) return 'dead';
  // Directional shield: Guardians and the Warden block frontal shots.
  // The shield is a real state now: a backstab while it is up BREAKS it once
  // (juice + stagger + 1.5x) and it stays down ~3s. While down, backstabs keep
  // the 1.5x bonus but fire no juice — sustained fire no longer re-triggers
  // slow-mo/hitstop on every hit (that was the lag-on-hit bug).
  const shielded = enemy.type === 'guardian' || enemy.type === 'warden';
  if (shielded && enemy.shieldUp !== false) {
    const fakeBolt = { x: hitX, y: hitY };
    if (isFrontal(enemy, fakeBolt)) {
      state.events.push({ type: 'shieldBlock', x: hitX, y: hitY });
      addFloat(state, hitX, hitY - 14, 'BLOCKED', '#7DF3FF');
      return 'blocked';
    }
    // Backstab while the shield is up: break it — ONCE per down-cycle.
    state.events.push({ type: 'shieldBreak', x: enemy.x, y: enemy.y });
    addFloat(state, enemy.x, enemy.y - 30, 'SHIELD BREAK!', '#F5B81D');
    enemy.staggerT = 0.9;
    enemy.shieldUp = false;
    enemy.shieldDownT = 3.0;
    dmg *= 1.5;
    // PASS 7 — SHATTERED HOURGLASS: a broken shield shatters harder.
    dmg += relicShieldBreakBonus(state);
  } else if (shielded && !isFrontal(enemy, { x: hitX, y: hitY })) {
    // Shield already down and the shot came from behind: backstab bonus, no juice.
    dmg *= 1.5;
  }
  // Crossfire: hit by player AND an echo within 1.5s.
  const now = state.time;
  if (from === 'player') enemy.lastPlayerHit = now;
  if (from === 'echo') enemy.lastEchoHit = now;
  let cross = false;
  if (enemy.lastPlayerHit && enemy.lastEchoHit && Math.abs(enemy.lastPlayerHit - enemy.lastEchoHit) < 1.5) {
    if (!enemy.crossUsed || now - enemy.crossUsed > 1.5) {
      cross = true;
      enemy.crossUsed = now;
    }
  }
  if (cross) {
    dmg *= state.upgradeValues.crossfireMult;
    state.combo += 2; state.comboT = 2;
    state.crossfires++;
    // WEAVE: every crossfire charges the meter — 3 crossfires fill it, and
    // a rewind spent at full Weave becomes a PARADOX SURGE (+1 echo slot).
    state.weave = Math.min(WEAVE_MAX, (state.weave || 0) + WEAVE_PER_CROSSFIRE * relicWeaveMult(state));
    state.events.push({ type: 'crossfire', x: enemy.x, y: enemy.y });
    addFloat(state, enemy.x, enemy.y - 48, 'CROSSFIRE x' + state.upgradeValues.crossfireMult, '#00E5FF');
  }
  // PASS 7 — CHRONARCH'S CROWN: every hit lands 10% harder.
  dmg *= relicAllDamageMult(state);
  enemy.hp -= dmg;
  enemy.flashT = 0.12;
  addFloat(state, hitX, hitY - 10, '-' + Math.round(dmg), cross ? '#00E5FF' : '#FFFFFF');
  if (enemy.hp <= 0) { killEnemy(state, enemy, from); return 'killed'; }
  return 'hit';
}

export function killEnemy(state, enemy, from) {
  enemy.hp = 0;
  state.kills++;
  state.loopKills++;
  const gain = Math.round(100 * comboMult(state) * state.diff.scoreMul);
  state.score += gain;
  state.loopScore += gain;
  state.combo++; state.comboT = 2;
  state.events.push({ type: 'kill', x: enemy.x, y: enemy.y, kind: enemy.type });
  addFloat(state, enemy.x, enemy.y - 20, '+' + gain, '#F5B81D');
  spawnSparks(state, enemy.x, enemy.y, enemy.type === 'warden' ? 40 : 14, '#FF2E4D');
  // Only THE CHRONARCH ends the run; THE WARDEN (Loop 5) is a mid-boss.
  if (enemy.type === 'chronarch') {
    state.bossDefeated = true;
    state.events.push({ type: 'bossDown', kind: 'chronarch', x: enemy.x, y: enemy.y });
  }
  if (enemy.type === 'warden') {
    state.events.push({ type: 'bossDown', kind: 'warden', x: enemy.x, y: enemy.y });
  }
}

export function comboMult(state) {
  return Math.min(5, 1 + state.combo * 0.1);
}

export function addFloat(state, x, y, txt, color) {
  state.floats.push({ x, y, txt, color, ttl: 1.1 });
}

export function spawnSparks(state, x, y, n, color) {
  for (let i = 0; i < n; i++) {
    const a = state.rng() * Math.PI * 2, s = 60 + state.rng() * 260;
    state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, ttl: 0.4 + state.rng() * 0.4, color, size: 2 + state.rng() * 3 });
  }
}

export function updateBolts(state, dt) {
  const p = state.player;
  for (const b of state.bolts) {
    b.life -= dt;
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 5) b.trail.shift();
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
    let dead = b.life <= 0;
    // Pillar block.
    if (!dead) {
      for (const pil of state.pillars) {
        if (segmentHitsRect(b.x, b.y, nx, ny, pil)) { dead = true; spawnSparks(state, b.x, b.y, 4, '#C9C2B2'); break; }
      }
    }
    if (!dead && (nx < ARENA.x || nx > ARENA.x + ARENA.w || ny < ARENA.y || ny > ARENA.y + ARENA.h)) dead = true;
    if (!dead && (b.from === 'player' || b.from === 'echo')) {
      for (const e of state.enemies) {
        if (e.hp <= 0) continue;
        if (dist(nx, ny, e.x, e.y) < e.radius + 4) {
          const res = damageEnemy(state, e, b.dmg, b.from, nx, ny, b.fromEcho);
          if (b.from === 'player' && (res === 'hit' || res === 'killed')) state.shotsHit++;
          if (res === 'blocked') { dead = true; break; }
          // Ricochet: one bounce to the nearest other enemy.
          if (b.ricochet && !b.ricocheted && res !== 'dead') {
            let best = null, bd = 170;
            for (const o of state.enemies) {
              if (o === e || o.hp <= 0) continue;
              const d = dist(e.x, e.y, o.x, o.y);
              if (d < bd) { bd = d; best = o; }
            }
            if (best) {
              b.ricocheted = true;
              const a = Math.atan2(best.y - e.y, best.x - e.x);
              b.x = e.x; b.y = e.y;
              b.vx = Math.cos(a) * PLAYER.boltSpeed; b.vy = Math.sin(a) * PLAYER.boltSpeed;
              b.dmg = Math.round(b.dmg * 0.6);
              dead = false;
              state.events.push({ type: 'ricochet', x: e.x, y: e.y });
              break;
            }
          }
          dead = !b.pierce;
          break;
        }
      }
    }
    if (!dead && b.from === 'enemy') {
      if (p.alive && dist(nx, ny, p.x, p.y) < p.radius + 4) {
        damagePlayer(state, b.dmg, nx, ny, b.src || 'enemy');
        dead = true;
      }
      if (!dead) {
        for (const ec of state.echoes) {
          if (dist(nx, ny, ec.x, ec.y) < ec.radius + 4) { dead = true; spawnSparks(state, nx, ny, 3, '#00E5FF'); break; }
        }
      }
    }
    b.x = nx; b.y = ny;
    b.dead = dead;
  }
  state.bolts = state.bolts.filter((b) => !b.dead);
}

// srcType names the enemy that dealt the blow ('sniper', 'bomber', 'warden',
// ...). Every damaging hit records the most recent damager, and the blow
// that kills the player records the killer — the lose screen names it. A
// wrong killer is never shown: the line falls back to the last damager,
// then the loop's boss, then a nameless line.
export function damagePlayer(state, dmg, sx, sy, srcType) {
  const p = state.player;
  if (!p.alive || p.invulnT > 0 || p.dashT > 0) return;
  if (srcType) state.lastDamager = srcType;
  // LATE-GAME COUNTERWEIGHT (Pass 5): from loop 7 on, enemy hits bite 20%
  // harder. Loops 1-6 are untouched, so the early game and the hook play
  // exactly as before; only the endgame regains its teeth. Measured: the
  // bot takes exactly one hit per run, always a sniper bolt in loops 7-9.
  const final = dmg * state.diff.dmgMul * (state.loop >= 7 ? 1.2 : 1);
  p.hp -= final;
  p.invulnT = 0.5;
  state.combo = 0; state.comboT = 0;
  state.shake = Math.min(14, state.shake + 6);
  state.events.push({ type: 'playerHit', x: p.x, y: p.y });
  addFloat(state, p.x, p.y - 28, '-' + Math.round(final), '#FF2E4D');
  if (p.hp <= 0) { p.hp = 0; p.alive = false; state.killerType = srcType || state.lastDamager || null; }
}

export function spawnShockwave(state, x, y, owner) {
  state.shockwaves.push({ x, y, r: 30, speed: 320, maxR: 560, hit: false, owner: owner || 'warden' });
  state.events.push({ type: 'shockwave', x, y });
}

export function updateShockwaves(state, dt) {
  const p = state.player;
  for (const s of state.shockwaves) {
    s.r += s.speed * dt;
    if (!s.hit && p.alive && p.invulnT <= 0 && p.dashT <= 0) {
      const d = dist(p.x, p.y, s.x, s.y);
      if (Math.abs(d - s.r) < 16) {
        s.hit = true;
        damagePlayer(state, 15, p.x, p.y, s.owner || 'warden');
      }
    }
    if (s.r > s.maxR) s.dead = true;
  }
  state.shockwaves = state.shockwaves.filter((s) => !s.dead);
}

export function updateRifts(state, dt) {
  const p = state.player;
  for (const r of state.rifts) {
    r.ttl -= dt;
    if (r.ttl <= 0) r.dead = true;
  }
  state.rifts = state.rifts.filter((r) => !r.dead);
  p.inRift = false;
  for (const r of state.rifts) {
    if (dist(p.x, p.y, r.x, r.y) < r.r) { p.inRift = true; break; }
  }
}
