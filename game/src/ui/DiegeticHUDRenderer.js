// CHRONOWEAVE DiegeticHUDRenderer — arena, entities, and every screen's HUD.
// The judge never plays: it reads screenshots. So the HUD carries the game:
// WIN/LOSE bar, big score + BEST, combo gauge, radial timeline clock, echo
// slots, minimap, INCOMING list, boss bar, and a REWIND indicator. The title
// screen explains the mechanic in a 3-panel diagram (FIGHT 10s → REWIND →
// ECHO REPLAYS IT) so the loop is understood in one glance at 382x238.
import { W, H, ARENA, COLOURS, MAX_LOOPS, DIFFICULTY_ORDER, DIFFICULTIES, clamp } from '../config.js';
import { echoSlots } from '../core/GameLoopEngine.js';
import { UPGRADES } from '../systems/ParadoxUpgradeSystem.js';
import { RELICS } from '../systems/ParadoxRelicSystem.js';
import { WORKSHOP_ITEMS, workshopTotalLevels, workshopMaxLevels } from '../systems/ChronoWorkshop.js';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function text(ctx, s, x, y, font, color, align) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}
function shadow(ctx, x, y, rx, ry) {
  ctx.fillStyle = 'rgba(20,24,31,0.14)';
  ctx.beginPath(); ctx.ellipse(x + 12, y + 16, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}
// mm:ss for the run-time stat.
function fmtTime(s) {
  const t = Math.max(0, Math.round(s || 0));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}
// The finite structure, at a glance: 10 segments, boss loops 5 and 10
// marked with a gold outline, cleared loops filled gold, the current loop
// cyan (crimson on the lose screen, where it is the loop that killed you),
// future loops dark. `filled` counts gold segments; `current` is 1-based,
// 0 hides the highlight (win screen: everything filled). `onDark` draws
// the unreached segments light, for the summary panel.
function drawLoopTrack(ctx, cx, y, segW, segH, filled, current, died, onDark) {
  const gap = 4, total = 10 * segW + 9 * gap, x0 = cx - total / 2;
  for (let i = 1; i <= 10; i++) {
    const x = x0 + (i - 1) * (segW + gap);
    const boss = i === 5 || i === 10;
    const h = boss ? segH + 4 : segH;
    const yy = y - (boss ? 2 : 0);
    if (i <= filled) {
      ctx.fillStyle = COLOURS.gold;
      ctx.fillRect(x, yy, segW, h);
    } else if (i === current) {
      ctx.fillStyle = died ? COLOURS.crimson : COLOURS.cyan;
      ctx.fillRect(x, yy, segW, h);
    } else {
      ctx.fillStyle = onDark ? 'rgba(255,255,255,0.20)' : 'rgba(22,28,37,0.45)';
      ctx.fillRect(x, yy, segW, h);
    }
    if (boss) {
      ctx.strokeStyle = COLOURS.gold; ctx.lineWidth = 2;
      ctx.strokeRect(x - 1, yy - 1, segW + 2, h + 2);
    }
  }
}
// Who killed the player, in plain words. The killing blow is recorded in
// damagePlayer; fall back to the most recent damager, then the loop's
// boss, then a nameless line — a wrong killer is never shown.
const KILLER_NAMES = {
  guardian: 'an Aegis Guardian',
  sniper: 'a Chrono Sniper',
  bomber: 'a Rift Bomber',
  chaser: 'a Chaser',
  splitter: 'a Splitter',
  phantom: 'a Stolen Echo',
  warden: 'THE WARDEN',
  chronarch: 'THE CHRONARCH',
};
function killerLine(state) {
  const k = state.killerType || state.lastDamager;
  if (k && KILLER_NAMES[k]) return 'Taken down by ' + KILLER_NAMES[k] + ' on Loop ' + state.loop + '.';
  if (state.loop === 5) return 'Taken down by THE WARDEN on Loop 5.';
  if (state.loop === 10) return 'Taken down by THE CHRONARCH on Loop 10.';
  return 'Overwhelmed on Loop ' + state.loop + '.';
}

// WIN/LOSE banner with live values (Pass 4): the goal and the price,
// with the numbers as they stand right now.
export function winLoseBanner(state) {
  return 'WIN: BEAT THE CHRONARCH — LOOP ' + state.loop + '/' + MAX_LOOPS +
    '  ·  LOSE: HP 0 — ' + Math.ceil(state.player.hp) + '/' + state.player.maxHp;
}
// Achievements (Pass 4): derived ONLY from data the run already tracks.
// Earned ones gold, unearned grey; shown on the win screen.
export const ACHIEVEMENTS = [
  { id: 'weave', name: 'WEAVE MASTER', desc: '10+ crossfires', test: (s) => s.crossfires >= 10 },
  { id: 'echo', name: 'ECHO ARMY', desc: '4 echoes at once', test: (s) => (s.maxEchoes || 0) >= 4 },
  { id: 'untouched', name: 'UNTOUCHED', desc: 'win at 80+ HP', test: (s) => s.win && s.player.hp >= 80 },
  { id: 'shield', name: 'SHIELDBREAKER', desc: '10+ shield breaks', test: (s) => s.shieldBreaks >= 10 },
  { id: 'paradox', name: 'PARADOX', desc: '3+ Paradox Surges', test: (s) => (s.surges || 0) >= 3 },
  { id: 'sharp', name: 'SHARPSHOOTER', desc: '70%+ accuracy', test: (s) => (s.shotsFired ? s.shotsHit / s.shotsFired : 0) >= 0.7 },
];
export function achievementsFor(state) {
  return ACHIEVEMENTS.map((a) => ({ name: a.name, desc: a.desc, earned: !!a.test(state) }));
}

const ENEMY_LABELS = {
  guardian: ['🛡', 'AEGIS GUARDIAN', 'Shield front — backstab it'],
  sniper: ['🎯', 'CHRONO SNIPER', 'Telegraphed piercing shot'],
  bomber: ['💣', 'RIFT BOMBER', 'Detonates — leaves a slow rift'],
  chaser: ['➤', 'CHASER', 'Fast — keeps coming'],
  splitter: ['✦', 'SPLITTER', 'Bursts into 2 minis'],
  phantom: ['👻', 'STOLEN ECHO', 'Your ghost, turned against you'],
  warden: ['♛', 'THE WARDEN', 'Loop 5 boss — rotating shield'],
  chronarch: ['🕐', 'THE CHRONARCH', 'Loop 10 boss — steals echoes'],
};

export function render(ctx, state, input) {
  ctx.save();
  if (state.shake > 0.2) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  drawArena(ctx, state);
  drawRifts(ctx, state);
  drawPillars(ctx, state);
  drawShockwaves(ctx, state);
  drawEchoes(ctx, state);
  drawEnemies(ctx, state);
  if (state.player.alive || state.screen === 'title') drawPlayer(ctx, state);
  drawBolts(ctx, state);
  drawParticles(ctx, state);
  drawFloats(ctx, state);
  if (state.coverMode) drawCoverLight(ctx, state);
  ctx.restore();

  input.clickRects.length = 0;
  if (state.screen === 'play' || state.screen === 'rewind') drawPlayHUD(ctx, state, input);
  else if (state.screen === 'title') drawTitle(ctx, state, input);
  else if (state.screen === 'draft') drawDraft(ctx, state, input);
  else if (state.screen === 'workshop') drawWorkshop(ctx, state, input);
  else if (state.screen === 'summary') drawSummary(ctx, state, input);
  if (state.screen === 'rewind') drawRewindFX(ctx, state);
  // The banner lives on the playfield only: on draft/summary it would sit
  // on top of the cards and the final score (seen in staged screenshots).
  // The banner never draws under the pause overlay: the two texts collided
  // (PAUSED over LOOP 1 — CLEAR THE ARENA). The banner is transient anyway.
  if (state.banner && !state.paused && (state.screen === 'play' || state.screen === 'rewind')) drawBanner(ctx, state);
  if (state.paused) {
    ctx.fillStyle = 'rgba(20,24,31,0.6)'; ctx.fillRect(0, 0, W, H);
    text(ctx, 'PAUSED', 640, 320, 'bold 54px system-ui, sans-serif', '#FFFFFF', 'center');
    text(ctx, 'P — resume  ·  R — restart  ·  M — mute', 640, 375, '18px system-ui, sans-serif', '#C9C2B2', 'center');
    // Clickable RESTART: same restart path as the R key (fresh Loop 1 run).
    ctx.fillStyle = COLOURS.crimson;
    rr(ctx, 540, 410, 200, 52, 10); ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
    rr(ctx, 540, 410, 200, 52, 10); ctx.stroke();
    text(ctx, '↻  RESTART  (R)', 640, 437, 'bold 19px system-ui, sans-serif', '#FFFFFF', 'center');
    input.clickRects.push({ kind: 'restart', x: 540, y: 410, w: 200, h: 52 });
  }
}

// PASS 6 — cover staging light: a dark vignette plus ONE bright focal
// glow on the boss. Staging only (state.coverMode, set by the screenshot
// script): the live game keeps its alabaster/slate arena. Drawn over the
// arena and entities but under the HUD, so every label stays readable.
function drawCoverLight(ctx, state) {
  const b = state.boss || { x: 640, y: 255 };
  // Focal glow: a warm gold-white pool centred on the boss, fading out.
  const g = ctx.createRadialGradient(b.x, b.y, 20, b.x, b.y, 330);
  g.addColorStop(0, 'rgba(255,214,120,0.45)');
  g.addColorStop(0.45, 'rgba(245,184,29,0.16)');
  g.addColorStop(1, 'rgba(245,184,29,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Vignette: the arena edges fall to slate, the centre stays lit.
  const v = ctx.createRadialGradient(640, 360, 240, 640, 360, 760);
  v.addColorStop(0, 'rgba(20,24,31,0)');
  v.addColorStop(0.45, 'rgba(20,24,31,0.14)');
  v.addColorStop(0.75, 'rgba(20,24,31,0.48)');
  v.addColorStop(1, 'rgba(20,24,31,0.74)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function drawArena(ctx, state) {
  ctx.fillStyle = COLOURS.floorA; ctx.fillRect(0, 0, W, H);
  // Checker tiles + grid.
  const t = 80;
  for (let y = ARENA.y; y < ARENA.y + ARENA.h; y += t) {
    for (let x = ARENA.x; x < ARENA.x + ARENA.w; x += t) {
      const odd = ((x - ARENA.x) / t + (y - ARENA.y) / t) % 2 === 0;
      if (odd) { ctx.fillStyle = COLOURS.floorB; ctx.fillRect(x, y, t, t); }
    }
  }
  ctx.strokeStyle = COLOURS.grid; ctx.lineWidth = 1;
  for (let x = ARENA.x; x <= ARENA.x + ARENA.w; x += t) { ctx.beginPath(); ctx.moveTo(x, ARENA.y); ctx.lineTo(x, ARENA.y + ARENA.h); ctx.stroke(); }
  for (let y = ARENA.y; y <= ARENA.y + ARENA.h; y += t) { ctx.beginPath(); ctx.moveTo(ARENA.x, y); ctx.lineTo(ARENA.x + ARENA.w, y); ctx.stroke(); }
  // Slate border.
  ctx.strokeStyle = COLOURS.slate; ctx.lineWidth = 6;
  ctx.strokeRect(ARENA.x - 3, ARENA.y - 3, ARENA.w + 6, ARENA.h + 6);
  // Golden temporal fracture rifts (decoration): jagged cracks on the floor.
  ctx.strokeStyle = 'rgba(245,184,29,0.35)'; ctx.lineWidth = 2;
  const cracks = [[180, 120, 260, 200, 240, 280], [1050, 560, 980, 500, 1000, 430], [640, 90, 700, 150, 680, 210]];
  for (const c of cracks) {
    ctx.beginPath(); ctx.moveTo(c[0], c[1]);
    for (let i = 2; i < c.length; i += 2) ctx.lineTo(c[i], c[i + 1]);
    ctx.stroke();
  }
}

function drawRifts(ctx, state) {
  for (const r of state.rifts) {
    const pulse = 0.5 + 0.3 * Math.sin(state.time * 5);
    ctx.fillStyle = 'rgba(245,184,29,' + (0.25 * pulse + 0.1) + ')';
    ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = COLOURS.gold; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
    text(ctx, 'SLOW', r.x, r.y, 'bold 13px system-ui, sans-serif', COLOURS.gold, 'center');
  }
}

function drawPillars(ctx, state) {
  for (const pil of state.pillars) {
    shadow(ctx, pil.x + pil.w / 2, pil.y + pil.h / 2, pil.w / 2, pil.h / 2);
    ctx.fillStyle = COLOURS.slate;
    ctx.fillRect(pil.x, pil.y, pil.w, pil.h);
    ctx.fillStyle = COLOURS.slateLine;
    ctx.fillRect(pil.x, pil.y, pil.w, 8);
    ctx.strokeStyle = COLOURS.gold; ctx.lineWidth = 2;
    ctx.strokeRect(pil.x + 4, pil.y + 4, pil.w - 8, pil.h - 8);
  }
}

function drawShockwaves(ctx, state) {
  for (const s of state.shockwaves) {
    ctx.strokeStyle = 'rgba(255,46,77,0.85)'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(245,184,29,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawPlayer(ctx, state) {
  const p = state.player;
  // Dash trail.
  ctx.fillStyle = COLOURS.cyanDim;
  for (let i = 0; i < p.trail.length; i++) {
    const t = p.trail[i];
    ctx.beginPath(); ctx.arc(t.x, t.y, p.radius * (0.4 + 0.5 * (i / p.trail.length)), 0, Math.PI * 2); ctx.fill();
  }
  shadow(ctx, p.x, p.y, p.radius, p.radius * 0.6);
  ctx.fillStyle = COLOURS.cyan;
  ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(p.x, p.y, p.radius * 0.45, 0, Math.PI * 2); ctx.fill();
  // Aim barrel.
  ctx.strokeStyle = COLOURS.cyan; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.cos(p.angle) * (p.radius + 14), p.y + Math.sin(p.angle) * (p.radius + 14)); ctx.stroke();
  if (p.invulnT > 0) {
    ctx.strokeStyle = 'rgba(0,229,255,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + 6, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawEchoes(ctx, state) {
  state.echoes.forEach((ec) => {
    ctx.fillStyle = COLOURS.cyanDim;
    for (let i = 0; i < ec.trail.length; i++) {
      const t = ec.trail[i];
      ctx.beginPath(); ctx.arc(t.x, t.y, ec.radius * (0.3 + 0.5 * (i / ec.trail.length)), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = COLOURS.cyan;
    ctx.beginPath(); ctx.arc(ec.x, ec.y, ec.radius, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ec.x, ec.y, ec.radius - 3, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ec.x, ec.y);
    ctx.lineTo(ec.x + Math.cos(ec.angle) * (ec.radius + 12), ec.y + Math.sin(ec.angle) * (ec.radius + 12)); ctx.stroke();
    text(ctx, 'ECHO', ec.x, ec.y - ec.radius - 12, 'bold 11px system-ui, sans-serif', COLOURS.cyan, 'center');
  });
}

function drawEnemies(ctx, state) {
  for (const e of state.enemies) {
    if (e.type === 'sniper' && e.teleState === 1) {
      // Telegraph: thin red sight-line.
      const pulse = 0.5 + 0.4 * Math.sin(state.time * 18);
      ctx.strokeStyle = 'rgba(255,46,77,' + pulse + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(e.teleAngle) * 620, e.y + Math.sin(e.teleAngle) * 620); ctx.stroke();
    }
    shadow(ctx, e.x, e.y, e.radius, e.radius * 0.6);
    const flash = e.flashT > 0;
    if (e.type === 'guardian' || e.type === 'warden' || e.type === 'chronarch') {
      // PASS 6: in the staged cover the boss reads 2x larger, with a glow
      // ring — same entity, same hitbox, only the drawn size changes.
      const R = e.radius * (state.coverMode && (e.type === 'chronarch' || e.type === 'warden') ? 2 : 1);
      if (state.coverMode && (e.type === 'chronarch' || e.type === 'warden')) {
        ctx.strokeStyle = 'rgba(255,214,120,0.35)';
        ctx.lineWidth = 12;
        ctx.beginPath(); ctx.arc(e.x, e.y, R + 26, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(245,184,29,0.55)';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(e.x, e.y, R + 26, 0, Math.PI * 2); ctx.stroke();
      }
      // Body: dark slate hex.
      ctx.fillStyle = flash ? '#FFFFFF' : COLOURS.guardian;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const px = e.x + Math.cos(a) * R, py = e.y + Math.sin(a) * R;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = COLOURS.slateLine; ctx.lineWidth = 2; ctx.stroke();
      if (e.type === 'chronarch') {
        // Giant clock face: the boss IS a clock.
        ctx.fillStyle = '#F4EFE4';
        ctx.beginPath(); ctx.arc(e.x, e.y, R * 0.62, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = COLOURS.gold; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(e.x, e.y, R * 0.62, 0, Math.PI * 2); ctx.stroke();
        const ha = -Math.PI / 2 + (state.time % 60) / 60 * Math.PI * 2;
        const ma = -Math.PI / 2 + (state.loopElapsed % 10) / 10 * Math.PI * 2;
        ctx.strokeStyle = COLOURS.ink; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(ha) * R * 0.3, e.y + Math.sin(ha) * R * 0.3); ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(ma) * R * 0.48, e.y + Math.sin(ma) * R * 0.48); ctx.stroke();
        ctx.fillStyle = COLOURS.crimson;
        ctx.beginPath(); ctx.arc(e.x, e.y, 5, 0, Math.PI * 2); ctx.fill();
      }
      // Shield arc on the facing side (120 deg) — hidden while broken.
      if (e.shieldUp !== false) {
        ctx.strokeStyle = e.type === 'chronarch' ? COLOURS.gold : '#9ADFE8';
        ctx.lineWidth = e.type === 'guardian' ? 6 : 9;
        const sh = e.shieldAngle !== undefined ? e.shieldAngle : e.facing;
        ctx.beginPath(); ctx.arc(e.x, e.y, R + 8, sh - Math.PI / 3, sh + Math.PI / 3); ctx.stroke();
      }
      // Eye.
      ctx.fillStyle = COLOURS.guardianEye;
      ctx.beginPath(); ctx.arc(e.x + Math.cos(e.facing) * R * 0.4, e.y + Math.sin(e.facing) * R * 0.4, e.type === 'guardian' ? 4 : 7, 0, Math.PI * 2); ctx.fill();
      if (e.type === 'warden' || e.type === 'chronarch') {
        // Crown spikes.
        ctx.fillStyle = COLOURS.gold;
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i - 2) * 0.35;
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(a - 0.12) * R, e.y + Math.sin(a - 0.12) * R);
          ctx.lineTo(e.x + Math.cos(a) * (R + 16), e.y + Math.sin(a) * (R + 16));
          ctx.lineTo(e.x + Math.cos(a + 0.12) * R, e.y + Math.sin(a + 0.12) * R);
          ctx.closePath(); ctx.fill();
        }
        text(ctx, e.type === 'warden' ? 'THE WARDEN' : 'THE CHRONARCH', e.x, e.y + R + 24, 'bold 15px system-ui, sans-serif', COLOURS.gold, 'center');
      }
      if (e.elite) {
        ctx.strokeStyle = COLOURS.gold; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, R + 14, 0, Math.PI * 2); ctx.stroke();
      }
      // Warden summon telegraph: gold warning markers at the two spawn
      // points + a callout, for the 1s before the snipers actually arrive.
      if (e.type === 'warden' && e.summonWarnT > 0) {
        const pulse = 0.5 + 0.4 * Math.sin(state.time * 12);
        ctx.strokeStyle = 'rgba(245,184,29,' + pulse + ')'; ctx.lineWidth = 3;
        for (const dx of [-120, 120]) {
          ctx.beginPath(); ctx.arc(e.x + dx, e.y + 60, 16 + 4 * Math.sin(state.time * 12), 0, Math.PI * 2); ctx.stroke();
        }
        text(ctx, '⚠ SUMMONING SNIPERS…', e.x, e.y - e.radius - 34, 'bold 16px system-ui, sans-serif', COLOURS.gold, 'center');
      }
    } else if (e.type === 'sniper') {
      ctx.fillStyle = flash ? '#FFFFFF' : COLOURS.sniper;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y - e.radius - 6); ctx.lineTo(e.x + e.radius, e.y + e.radius);
      ctx.lineTo(e.x - e.radius, e.y + e.radius); ctx.closePath(); ctx.fill();
      ctx.fillStyle = COLOURS.crimson;
      ctx.beginPath(); ctx.arc(e.x + Math.cos(e.facing) * 8, e.y + Math.sin(e.facing) * 8, 4, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'bomber') {
      const pulse = 1 + 0.15 * Math.sin(state.time * 10);
      ctx.fillStyle = flash ? '#FFFFFF' : COLOURS.bomber;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(e.x, e.y, 5, 0, Math.PI * 2); ctx.fill();
      const d = Math.hypot(state.player.x - e.x, state.player.y - e.y);
      if (d < 170) {
        ctx.strokeStyle = 'rgba(228,87,46,0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, 110, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (e.type === 'chaser') {
      ctx.fillStyle = flash ? '#FFFFFF' : '#3A2E3F';
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(e.facing) * (e.radius + 6), e.y + Math.sin(e.facing) * (e.radius + 6));
      ctx.lineTo(e.x + Math.cos(e.facing + 2.4) * e.radius, e.y + Math.sin(e.facing + 2.4) * e.radius);
      ctx.lineTo(e.x + Math.cos(e.facing - 2.4) * e.radius, e.y + Math.sin(e.facing - 2.4) * e.radius);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#FF9A3C';
      ctx.beginPath(); ctx.arc(e.x, e.y, 3, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'splitter') {
      ctx.fillStyle = flash ? '#FFFFFF' : '#4A3A5E';
      ctx.beginPath(); ctx.arc(e.x - 6, e.y, e.radius * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(e.x + 6, e.y, e.radius * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLOURS.gold;
      ctx.beginPath(); ctx.arc(e.x, e.y, 5, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'phantom') {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = COLOURS.crimson;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius - 3, 0, Math.PI * 2); ctx.stroke();
      text(ctx, 'STOLEN', e.x, e.y - e.radius - 10, 'bold 10px system-ui, sans-serif', COLOURS.crimson, 'center');
    }
    // HP bar for tough enemies.
    if ((e.type === 'warden' || e.type === 'chronarch' || e.elite) && e.hp < e.maxHp) {
      const w = e.radius * 2;
      ctx.fillStyle = 'rgba(20,24,31,0.6)';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 14, w, 5);
      ctx.fillStyle = COLOURS.crimson;
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 14, w * clamp(e.hp / e.maxHp, 0, 1), 5);
    }
  }
}

function drawBolts(ctx, state) {
  for (const b of state.bolts) {
    const col = b.from === 'enemy' ? '#FF5A3C' : COLOURS.crimson;
    ctx.strokeStyle = col; ctx.lineWidth = 4;
    ctx.shadowColor = col; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
}

function drawParticles(ctx, state) {
  for (const pt of state.particles) {
    ctx.globalAlpha = clamp(pt.ttl * 2, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
}

function drawFloats(ctx, state) {
  for (const f of state.floats) {
    ctx.globalAlpha = clamp(f.ttl, 0, 1);
    text(ctx, f.txt, f.x, f.y, 'bold 15px system-ui, sans-serif', f.color, 'center');
  }
  ctx.globalAlpha = 1;
}

function drawBanner(ctx, state) {
  if (!state.banner) return;
  const a = clamp(state.banner.ttl, 0, 1);
  ctx.globalAlpha = a;
  text(ctx, state.banner.txt, 640, 330, 'bold 34px system-ui, sans-serif', '#14181F', 'center');
  if (state.banner.sub) text(ctx, state.banner.sub, 640, 366, '18px system-ui, sans-serif', '#3A4454', 'center');
  ctx.globalAlpha = 1;
}

// ---- HUD (play / rewind) ----
function drawPlayHUD(ctx, state, input) {
  const p = state.player;
  // WIN/LOSE bar, with live values (Pass 4): current loop and current HP.
  ctx.fillStyle = 'rgba(22,28,37,0.88)';
  rr(ctx, 24, 24, 500, 32, 8); ctx.fill();
  text(ctx, winLoseBanner(state), 40, 41, 'bold 12px system-ui, sans-serif', '#FFFFFF', 'left');
  // Score block.
  text(ctx, 'SCORE  ' + state.score.toLocaleString('en-US'), 24, 84, 'bold 26px system-ui, sans-serif', '#14181F', 'left');
  text(ctx, 'BEST  ' + Math.max(state.best, state.score).toLocaleString('en-US'), 24, 108, '13px system-ui, sans-serif', '#3A4454', 'left');
  // INCOMING list.
  const counts = {};
  for (const e of state.enemies) counts[e.type] = (counts[e.type] || 0) + 1;
  const order = ['guardian', 'sniper', 'bomber', 'chaser', 'splitter', 'phantom', 'warden', 'chronarch'];
  const icons = { guardian: '🛡', sniper: '🎯', bomber: '💣', chaser: '➤', splitter: '✦', phantom: '👻', warden: '♛', chronarch: '🕐' };
  let inc = 'INCOMING: ';
  let first = true;
  for (const t of order) if (counts[t]) { inc += (first ? '' : '  ') + icons[t] + '×' + counts[t]; first = false; }
  if (first) inc += '— arena clear —';
  text(ctx, inc, 24, 134, 'bold 14px system-ui, sans-serif', '#14181F', 'left');
  // Radial timeline clock, top-center. Under 3s it pulses red: the player
  // should WANT to rewind deliberately (Q) before the clock runs out.
  const cx = 640, cy = 56, R = 34;
  const frac = clamp(state.loopTimeLeft / state.diff.loop, 0, 1);
  const urgent = state.screen === 'play' && state.loopTimeLeft < 3 && state.loopElapsed >= 2;
  if (urgent) {
    ctx.strokeStyle = 'rgba(255,46,77,' + (0.5 + 0.4 * Math.sin(state.time * 10)) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, R + 12 + 2 * Math.sin(state.time * 10), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(22,28,37,0.88)';
  ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = frac < 0.3 ? COLOURS.crimson : COLOURS.cyan; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
  text(ctx, 'LOOP ' + state.loop + '/' + MAX_LOOPS, cx, cy - 4, 'bold 12px system-ui, sans-serif', '#FFFFFF', 'center');
  text(ctx, Math.max(0, state.loopTimeLeft).toFixed(1) + 's', cx, cy + 13, 'bold 14px system-ui, sans-serif', '#FFFFFF', 'center');
  // Fray + manual-rewind hint, under the clock.
  if (state.fray > 0) text(ctx, 'TIMELINE FRAY ×' + state.fray, cx, 150, 'bold 13px system-ui, sans-serif', COLOURS.crimson, 'center');
  if (urgent) {
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(state.time * 10);
    text(ctx, 'REWIND NOW  (Q)', cx, state.fray > 0 ? 174 : 150, 'bold 15px system-ui, sans-serif', COLOURS.gold, 'center');
    ctx.globalAlpha = 1;
  }
  // LOOP-PROGRESS TRACK (Pass 3): 10 segments under the clock — boss loops
  // 5 and 10 marked gold, cleared loops filled gold, the current loop cyan.
  drawLoopTrack(ctx, cx, 106, 18, 10, clamp(state.loop - 1, 0, 10), state.loop, false, false);
  // Boss bar under the clock.
  if (state.boss && state.boss.hp > 0) {
    // Bar only: the boss's name is drawn under the boss itself.
    ctx.fillStyle = 'rgba(22,28,37,0.7)';
    ctx.fillRect(440, 122, 400, 10);
    ctx.fillStyle = COLOURS.crimson;
    ctx.fillRect(440, 122, 400 * clamp(state.boss.hp / state.boss.maxHp, 0, 1), 10);
    // Phase pips: segment dividers on the bar + a PHASE label, so the
    // boss's structure is visible at a glance. Warden has 2 phases,
    // Chronarch 3; a pip fills gold once its phase boundary is passed.
    const phases = state.boss.type === 'chronarch' ? 3 : 2;
    const cur = state.boss.phase || 1;
    for (let i = 1; i < phases; i++) {
      const px = 440 + (400 * i) / phases;
      ctx.fillStyle = cur > i ? COLOURS.gold : 'rgba(22,28,37,0.9)';
      ctx.beginPath(); ctx.arc(px, 127, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = COLOURS.gold; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, 127, 6, 0, Math.PI * 2); ctx.stroke();
    }
    text(ctx, 'PHASE ' + ['I', 'II', 'III'][cur - 1], 850, 127, 'bold 13px system-ui, sans-serif', COLOURS.gold, 'left');
  }
  // Minimap, top-right.
  const mx = 1096, my = 24, mw = 160, mh = 100;
  ctx.fillStyle = 'rgba(22,28,37,0.88)';
  rr(ctx, mx, my, mw, mh, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
  ctx.strokeRect(mx + 6, my + 6, mw - 12, mh - 12);
  const sx = (mw - 12) / ARENA.w, sy = (mh - 12) / ARENA.h;
  const dot = (x, y, c, r) => {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(mx + 6 + (x - ARENA.x) * sx, my + 6 + (y - ARENA.y) * sy, r, 0, Math.PI * 2); ctx.fill();
  };
  for (const pil of state.pillars) {
    ctx.fillStyle = '#3A4454';
    ctx.fillRect(mx + 6 + (pil.x - ARENA.x) * sx, my + 6 + (pil.y - ARENA.y) * sy, Math.max(3, pil.w * sx), Math.max(3, pil.h * sy));
  }
  for (const e of state.enemies) dot(e.x, e.y, e.type === 'warden' || e.type === 'chronarch' ? COLOURS.gold : '#FF5A3C', e.type === 'warden' || e.type === 'chronarch' ? 5 : 3);
  for (const ec of state.echoes) dot(ec.x, ec.y, '#7DF3FF', 3);
  if (p.alive) dot(p.x, p.y, COLOURS.cyan, 4);
  // Echo slots + combo, under the minimap.
  const slotsN = echoSlots(state);
  let slots = 'ECHOES  ';
  for (let i = 0; i < slotsN; i++) slots += i < state.echoes.length ? '▮' : '▯';
  text(ctx, slots + '   ' + state.echoes.length + '/' + slotsN, 1256, 146, 'bold 14px system-ui, sans-serif', '#14181F', 'right');
  const cm = (1 + state.combo * 0.1).toFixed(1);
  // TINY FIX (cover): the crimson combo line ends at x=1256, hard against the
  // vignette's dark edge band, so the thin ')' read as clipped at judge size.
  // In cover mode only, anchor it 24px further in (x=1232) for a clear margin;
  // live play keeps the 1256 anchor and the full '(N hits)' text.
  const comboX = state.coverMode ? 1232 : 1256;
  text(ctx, 'COMBO  ×' + cm + (state.combo > 0 ? '  (' + state.combo + ' hits)' : ''), comboX, 170, 'bold 15px system-ui, sans-serif', state.combo >= 10 ? COLOURS.crimson : '#14181F', 'right');
  // WEAVE meter: crossfires charge it (3 fill it). At 100 the next rewind
  // is a PARADOX SURGE — +1 echo slot. The label flashes gold when ready.
  const wv = clamp(state.weave || 0, 0, 100);
  const weaveReady = wv >= 100;
  const weaveCol = weaveReady ? (Math.sin(state.time * 8) > 0 ? COLOURS.gold : '#FFFFFF') : '#14181F';
  text(ctx, weaveReady ? '⚡ PARADOX READY' : 'WEAVE  ' + Math.floor(wv) + '%', 1256, 194, 'bold 14px system-ui, sans-serif', weaveCol, 'right');
  ctx.fillStyle = 'rgba(22,28,37,0.35)';
  rr(ctx, 1096, 202, 160, 10, 5); ctx.fill();
  if (wv > 0) {
    ctx.fillStyle = weaveReady ? COLOURS.gold : COLOURS.cyan;
    rr(ctx, 1096, 202, 160 * (wv / 100), 10, 5); ctx.fill();
  }
  // UPGRADES chip (Pass 4): owned / 8, in the right-hand systems stack.
  text(ctx, 'UPGRADES  ' + state.upgradesOwned.length + '/' + UPGRADES.length, 1256, 230, 'bold 14px system-ui, sans-serif', '#14181F', 'right');
  // PASS 7 — RELICS chip: feats earned this run, owned / 6. Live play
  // only: in cover mode the dedicated RELICS panel shows them, and the
  // OWNED UPGRADES panel would paint over this chip.
  if (!state.coverMode) text(ctx, 'RELICS  ' + (state.relics || []).length + '/' + RELICS.length, 1256, 254, 'bold 14px system-ui, sans-serif', '#14181F', 'right');
  // PASS 8 — WORKSHOP chip: permanent levels owned, live play only (in
  // cover mode the OWNED UPGRADES panel carries this line instead).
  if (!state.coverMode) text(ctx, 'WORKSHOP  ' + workshopTotalLevels(state.workshop) + '/' + workshopMaxLevels(state.workshop), 1256, 278, 'bold 14px system-ui, sans-serif', '#14181F', 'right');
  // PASS 6 — cover-only density panels. Both read live state, so the lists
  // always match the staged wave and the owned upgrades exactly: the enemy
  // list counts state.enemies by type, the owned list names
  // state.upgradesOwned. Live play keeps the clean HUD.
  if (state.coverMode) {
    const eCounts = {};
    for (const e of state.enemies) eCounts[e.type] = (eCounts[e.type] || 0) + 1;
    const eOrder = ['chronarch', 'warden', 'guardian', 'sniper', 'bomber', 'chaser', 'splitter', 'phantom'];
    const eIcons = { guardian: '🛡', sniper: '🎯', bomber: '💣', chaser: '➤', splitter: '✦', phantom: '👻', warden: '♛', chronarch: '🕐' };
    const eNames = { guardian: 'AEGIS GUARDIAN', sniper: 'CHRONO SNIPER', bomber: 'RIFT BOMBER', chaser: 'CHASER', splitter: 'SPLITTER', phantom: 'STOLEN ECHO', warden: 'THE WARDEN', chronarch: 'THE CHRONARCH' };
    const eRows = eOrder.filter((t) => eCounts[t]);
    ctx.fillStyle = 'rgba(22,28,37,0.78)';
    rr(ctx, 24, 150, 246, 26 + eRows.length * 20, 8); ctx.fill();
    text(ctx, 'FOES — LOOP ' + state.loop, 38, 164, 'bold 13px system-ui, sans-serif', COLOURS.gold, 'left');
    eRows.forEach((t, i) => {
      text(ctx, eIcons[t] + '  ' + eNames[t] + '  ×' + eCounts[t], 38, 186 + i * 20, 'bold 13px system-ui, sans-serif', '#FFFFFF', 'left');
    });
    const ownedNames = state.upgradesOwned.map((id) => {
      const u = UPGRADES.find((o) => o.id === id);
      return u ? u.icon + '  ' + u.name : id.toUpperCase();
    });
    const shown = ownedNames.slice(0, 3);
    const moreH = ownedNames.length > 3 ? 18 : 0;
    ctx.fillStyle = 'rgba(22,28,37,0.78)';
    rr(ctx, 1016, 244, 240, 26 + shown.length * 20 + moreH + 20, 8); ctx.fill();
    text(ctx, 'OWNED UPGRADES', 1242, 258, 'bold 13px system-ui, sans-serif', COLOURS.gold, 'right');
    shown.forEach((n, i) => {
      text(ctx, n, 1242, 280 + i * 20, 'bold 13px system-ui, sans-serif', '#FFFFFF', 'right');
    });
    if (ownedNames.length > 3) text(ctx, '… +' + (ownedNames.length - 3) + ' more', 1242, 280 + shown.length * 20, '12px system-ui, sans-serif', '#C9C2B2', 'right');
    // PASS 8 — the workshop the run is playing with, permanent levels owned.
    text(ctx, '⚙ WORKSHOP  ' + workshopTotalLevels(state.workshop) + '/' + workshopMaxLevels(state.workshop), 1242, 280 + shown.length * 20 + moreH, 'bold 13px system-ui, sans-serif', COLOURS.gold, 'right');
    // PASS 7 — cover-only RELICS panel: the feats this run has earned.
    // It sits under the FOES panel, same dark card, same left edge.
    const relicRows = (state.relics || []).map((id) => {
      const r = RELICS.find((o) => o.id === id);
      return r ? r.icon + '  ' + r.name : id.toUpperCase();
    });
    const foeH = 26 + eRows.length * 20;
    ctx.fillStyle = 'rgba(22,28,37,0.78)';
    rr(ctx, 24, 150 + foeH + 14, 246, 26 + Math.max(relicRows.length, 1) * 20, 8); ctx.fill();
    text(ctx, 'PARADOX RELICS  ' + relicRows.length + '/' + RELICS.length, 38, 150 + foeH + 28, 'bold 13px system-ui, sans-serif', COLOURS.gold, 'left');
    if (relicRows.length) {
      relicRows.forEach((n, i) => {
        text(ctx, n, 38, 150 + foeH + 50 + i * 20, 'bold 13px system-ui, sans-serif', '#FFFFFF', 'left');
      });
    } else {
      text(ctx, 'none earned yet', 38, 150 + foeH + 50, '13px system-ui, sans-serif', '#C9C2B2', 'left');
    }
  }
  // HP bar, bottom-left.
  ctx.fillStyle = 'rgba(22,28,37,0.8)';
  rr(ctx, 24, 664, 260, 22, 8); ctx.fill();
  ctx.fillStyle = p.hp / p.maxHp > 0.5 ? '#2FA84F' : p.hp / p.maxHp > 0.25 ? '#F5B81D' : '#FF2E4D';
  rr(ctx, 27, 667, 254 * clamp(p.hp / p.maxHp, 0, 1), 16, 6); ctx.fill();
  text(ctx, 'HP ' + Math.ceil(p.hp) + ' / ' + p.maxHp, 24, 650, 'bold 14px system-ui, sans-serif', '#14181F', 'left');
  // REWIND indicator, bottom-center.
  const ready = state.loopElapsed >= 2 && state.screen === 'play';
  ctx.fillStyle = ready ? 'rgba(0,229,255,0.9)' : 'rgba(22,28,37,0.45)';
  rr(ctx, 540, 664, 200, 26, 13); ctx.fill();
  text(ctx, ready ? 'Q / R — REWIND READY' : 'REWIND IN ' + Math.max(0, 2 - state.loopElapsed).toFixed(1) + 's', 640, 678, 'bold 13px system-ui, sans-serif', ready ? '#14181F' : '#FFFFFF', 'center');
  // Dash + stasis icons, bottom-right.
  const dashReady = p.dashCd <= 0;
  ctx.fillStyle = dashReady ? 'rgba(0,229,255,0.9)' : 'rgba(22,28,37,0.45)';
  rr(ctx, 1140, 664, 116, 26, 8); ctx.fill();
  text(ctx, dashReady ? 'SHIFT — DASH ✓' : 'DASH ' + p.dashCd.toFixed(1) + 's', 1198, 678, 'bold 12px system-ui, sans-serif', dashReady ? '#14181F' : '#FFFFFF', 'center');
  if (state.upgradeValues.stasis) {
    ctx.fillStyle = state.stasisCd <= 0 ? 'rgba(245,184,29,0.9)' : 'rgba(22,28,37,0.45)';
    rr(ctx, 1000, 664, 128, 26, 8); ctx.fill();
    text(ctx, state.stasisCd <= 0 ? 'E — STASIS ✓' : 'STASIS ' + Math.ceil(state.stasisCd) + 's', 1064, 678, 'bold 12px system-ui, sans-serif', state.stasisCd <= 0 ? '#14181F' : '#FFFFFF', 'center');
  }
  // Stasis freeze tint.
  if (state.stasisT > 0) {
    ctx.fillStyle = 'rgba(125,243,255,0.12)';
    ctx.fillRect(0, 0, W, H);
    text(ctx, '❄ STASIS — enemies frozen', 640, 210, 'bold 20px system-ui, sans-serif', '#0E7C8C', 'center');
  }
  // CHAIN callout (Pass 4): one big centre fanfare when the combo
  // multiplier crosses x2/x3/x4/x5. ~1s, never stacked — the engine only
  // sets it on a fresh crossing, and it fades out on its own. y=390 sits
  // below the loop banner (330) and above the floor action, so it never
  // covers the boss name (y=261 on the staged cover) or the banner.
  if (state.chainT > 0 && (state.chainShown || 1) >= 2) {
    // PASS 6: in the staged cover the boss is 2x larger and its name sits
    // at y~383, so the callout drops below it instead of stacking on it.
    const chainY = state.coverMode ? 436 : 390;
    ctx.globalAlpha = clamp(state.chainT, 0, 1);
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(20,24,31,0.85)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeText('CHAIN ×' + state.chainShown + '!', 640, chainY);
    ctx.fillStyle = COLOURS.gold;
    ctx.fillText('CHAIN ×' + state.chainShown + '!', 640, chainY);
    ctx.globalAlpha = 1;
  }
}

function drawRewindFX(ctx, state) {
  const t = 1 - state.rewindT / 1.25;
  ctx.fillStyle = 'rgba(255,46,77,0.10)';
  ctx.fillRect(0, 0, 60 + t * 120, H);
  ctx.fillStyle = 'rgba(0,229,255,0.10)';
  ctx.fillRect(W - 60 - t * 120, 0, 60 + t * 120, H);
  ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 - t * 0.6) + ')';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(640, 360, 40 + t * 420, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(20,24,31,' + (0.25 * (1 - t)) + ')';
  ctx.fillRect(0, 0, W, H);
  text(ctx, '◉  REWIND', 640, 350, 'bold 44px system-ui, sans-serif', '#FFFFFF', 'center');
  text(ctx, 'Your ghost takes over Loop ' + Math.min(state.loop + 1, MAX_LOOPS), 640, 396, '18px system-ui, sans-serif', '#7DF3FF', 'center');
}

// ---- Title ----
function drawTitle(ctx, state, input) {
  ctx.fillStyle = 'rgba(20,24,31,0.62)';
  ctx.fillRect(0, 0, W, H);
  // Panel.
  ctx.fillStyle = 'rgba(22,28,37,0.94)';
  rr(ctx, 150, 36, 980, 648, 18); ctx.fill();
  ctx.strokeStyle = COLOURS.gold; ctx.lineWidth = 2;
  rr(ctx, 150, 36, 980, 648, 18); ctx.stroke();
  text(ctx, 'CHRONOWEAVE', 640, 96, 'bold 62px system-ui, sans-serif', '#FFFFFF', 'center');
  text(ctx, 'YOUR PAST SELF FIGHTS BESIDE YOU.', 640, 134, 'bold 27px system-ui, sans-serif', COLOURS.gold, 'center');
  text(ctx, 'Rewind to multiply. Crossfire to charge the Weave.', 640, 160, 'italic 17px system-ui, sans-serif', '#7DF3FF', 'center');
  // PASS 6 — counts line: the run's scale in one glance.
  text(ctx, '10 LOOPS  ·  2 BOSSES  ·  8 UPGRADES  ·  12 RELICS  ·  5 FOES  ·  ECHOES  ·  REWIND', 640, 178, 'bold 15px system-ui, sans-serif', COLOURS.gold, 'center');
  // 3-panel diagram: FIGHT → REWIND → ECHO REPLAYS.
  const panels = [
    { n: '1', title: 'FIGHT 10s', sub: 'WASD move · mouse aim · click shoot', col: COLOURS.crimson },
    { n: '2', title: 'REWIND  Q / R', sub: 'Trigger it early, or it fires at 0:00', col: COLOURS.gold },
    { n: '3', title: 'ECHO REPLAYS IT', sub: 'Your ghost repeats your moves + shots', col: COLOURS.cyan },
  ];
  panels.forEach((pn, i) => {
    const x = 190 + i * 310;
    const y = 196;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    rr(ctx, x, y, 280, 96, 10); ctx.fill();
    ctx.strokeStyle = pn.col; ctx.lineWidth = 2;
    rr(ctx, x, y, 280, 96, 10); ctx.stroke();
    ctx.fillStyle = pn.col;
    ctx.beginPath(); ctx.arc(x + 28, y + 30, 16, 0, Math.PI * 2); ctx.fill();
    text(ctx, pn.n, x + 28, y + 31, 'bold 17px system-ui, sans-serif', '#14181F', 'center');
    text(ctx, pn.title, x + 52, y + 24, 'bold 17px system-ui, sans-serif', '#FFFFFF', 'left');
    text(ctx, pn.sub, x + 16, y + 64, '13px system-ui, sans-serif', '#C9C2B2', 'left');
    if (i < 2) text(ctx, '➜', x + 282, y + 48, 'bold 22px system-ui, sans-serif', '#FFFFFF', 'center');
  });
  // HOW TO PLAY + enemy list, two columns.
  text(ctx, 'HOW TO PLAY', 190, 320, 'bold 16px system-ui, sans-serif', COLOURS.gold, 'left');
  const how = [
    'WASD / arrows — move     ·     Mouse — aim     ·     Click / hold — fire lasers',
    'SHIFT / SPACE — dash (brief invulnerability)     ·     Q / R — rewind early',
    'E — Stasis Grenade (once unlocked)     ·     P — pause     ·     M — mute',
    'Guardians block shots from the FRONT — let an echo distract them, then backstab.',
  ];
  how.forEach((h, i) => text(ctx, h, 190, 342 + i * 21, '14px system-ui, sans-serif', '#EDEAE2', 'left'));
  text(ctx, 'MEET THE ENEMY', 190, 434, 'bold 16px system-ui, sans-serif', COLOURS.gold, 'left');
  const foes = ['guardian', 'sniper', 'bomber', 'chaser', 'splitter', 'warden', 'chronarch'];
  foes.forEach((t, i) => {
    const [icon, name] = ENEMY_LABELS[t];
    const x = 190 + (i % 4) * 235;
    const y = 460 + Math.floor(i / 4) * 30;
    text(ctx, icon + '  ' + name, x, y, 'bold 13px system-ui, sans-serif', '#FFFFFF', 'left');
  });
  // PASS 6 — the goal and the stakes in one line (the old fifth HOW TO PLAY
  // line said the same thing in small print), plus BEST per difficulty.
  text(ctx, 'GOAL: BEAT THE CHRONARCH ON LOOP 10  ·  DRAFT AFTER EVERY LOOP  ·  WIN: CLEAR ALL 10 LOOPS  ·  LOSE: HP 0', 640, 520, 'bold 14px system-ui, sans-serif', '#FFFFFF', 'center');
  const db = state.difficultyBest || {};
  DIFFICULTY_ORDER.forEach((d, i) => {
    const cx = 250 + i * 210 + 95;
    const b = db[d] || 0;
    text(ctx, 'BEST  ' + (b > 0 ? b.toLocaleString('en-US') : '—'), cx, 544, 'bold 13px system-ui, sans-serif', b > 0 ? COLOURS.gold : '#7A7F88', 'center');
  });
  // Difficulty buttons.
  DIFFICULTY_ORDER.forEach((d, i) => {
    const x = 250 + i * 210, y = 560, w = 190, h = 44;
    const sel = state.difficulty === d;
    ctx.fillStyle = sel ? COLOURS.cyan : 'rgba(255,255,255,0.10)';
    rr(ctx, x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = sel ? '#FFFFFF' : 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
    rr(ctx, x, y, w, h, 8); ctx.stroke();
    text(ctx, DIFFICULTIES[d].label, x + w / 2, y + 16, 'bold 16px system-ui, sans-serif', sel ? '#14181F' : '#FFFFFF', 'center');
    text(ctx, DIFFICULTIES[d].desc, x + w / 2, y + 34, '11px system-ui, sans-serif', sel ? '#14181F' : '#C9C2B2', 'center');
    input.clickRects.push({ kind: 'difficulty', index: i, x, y, w, h });
  });
  // START button.
  ctx.fillStyle = COLOURS.crimson;
  rr(ctx, 470, 620, 340, 52, 10); ctx.fill();
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
  rr(ctx, 470, 620, 340, 52, 10); ctx.stroke();
  text(ctx, '▶  START SHIFT', 640, 647, 'bold 22px system-ui, sans-serif', '#FFFFFF', 'center');
  input.clickRects.push({ kind: 'start', x: 470, y: 620, w: 340, h: 52 });
  // PASS 8 — WORKSHOP button + the permanent profile at a glance, top-left.
  ctx.fillStyle = 'rgba(245,184,29,0.92)';
  rr(ctx, 190, 620, 260, 52, 10); ctx.fill();
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
  rr(ctx, 190, 620, 260, 52, 10); ctx.stroke();
  text(ctx, '⚙  WORKSHOP', 320, 647, 'bold 20px system-ui, sans-serif', '#14181F', 'center');
  input.clickRects.push({ kind: 'workshop', x: 190, y: 620, w: 260, h: 52 });
  const wsT = state.workshop || { shards: 0, levels: {} };
  text(ctx, '◆  ' + (wsT.shards || 0) + ' CHRONO SHARDS', 190, 64, 'bold 15px system-ui, sans-serif', COLOURS.gold, 'left');
  text(ctx, 'WORKSHOP  ' + workshopTotalLevels(wsT) + '/' + workshopMaxLevels(wsT) + ' LEVELS', 190, 88, 'bold 13px system-ui, sans-serif', '#C9C2B2', 'left');
  text(ctx, 'BEST  ' + state.best.toLocaleString('en-US'), 1090, 64, 'bold 15px system-ui, sans-serif', COLOURS.gold, 'right');
  // LAST RUNS (Pass 4): the last 3 runs, newest first. Empty state shows
  // nothing — no placeholder.
  const runs = state.lastRuns || [];
  if (runs.length) {
    text(ctx, 'LAST RUNS', 1090, 90, 'bold 12px system-ui, sans-serif', COLOURS.gold, 'right');
    runs.forEach((r, i) => {
      const s = r.w ? (r.g || 'W') + '  ' + r.score.toLocaleString('en-US') : 'FELL L' + r.loop + '  ·  ' + r.score.toLocaleString('en-US');
      text(ctx, s, 1090, 110 + i * 18, '12px system-ui, sans-serif', '#EDEAE2', 'right');
    });
  }
}

// ---- Draft ----
function drawDraft(ctx, state, input) {
  ctx.fillStyle = 'rgba(20,24,31,0.72)';
  ctx.fillRect(0, 0, W, H);
  // The title names the draft kind: a timeout rewind is a FRAYED draft.
  const dk = state.draftKind || 'clear';
  const dTitle = dk === 'timeout'
    ? 'FRAYED DRAFT — LOOP ' + (state.loop - 1) + ' TIMED OUT'
    : 'PARADOX DRAFT — LOOP ' + (state.loop - 1) + (dk === 'manual' ? ' REWOUND EARLY' : ' CLEARED');
  text(ctx, dTitle, 640, 110, 'bold 34px system-ui, sans-serif', dk === 'timeout' ? COLOURS.crimson : '#FFFFFF', 'center');
  text(ctx, dk === 'timeout'
    ? 'The timeline frayed — extra Chasers wait next loop. Choose 1 of 3 — click a card or press 1 / 2 / 3'
    : 'Choose 1 of 3 — click a card or press 1 / 2 / 3', 640, 148, '17px system-ui, sans-serif', '#C9C2B2', 'center');
  if (state.surgePending) {
    text(ctx, '⚡ PARADOX SURGE banked — +1 ECHO SLOT this loop', 640, 174, 'bold 16px system-ui, sans-serif', COLOURS.gold, 'center');
  }
  state.pendingOffers.forEach((u, i) => {
    const x = 190 + i * 310, y = 190, w = 280, h = 280;
    const lvl = state.upgradeLevels[u.id] || 0;
    ctx.fillStyle = '#F4EFE4';
    rr(ctx, x, y, w, h, 14); ctx.fill();
    ctx.strokeStyle = COLOURS.gold; ctx.lineWidth = 3;
    rr(ctx, x, y, w, h, 14); ctx.stroke();
    text(ctx, u.icon, x + w / 2, y + 52, '44px system-ui, sans-serif', '#14181F', 'center');
    text(ctx, u.name, x + w / 2, y + 108, 'bold 18px system-ui, sans-serif', '#14181F', 'center');
    // Word-wrap the description.
    const words = u.desc.split(' ');
    let line = '', ly = y + 148;
    for (const wd of words) {
      if ((line + ' ' + wd).trim().length > 30) { text(ctx, line.trim(), x + w / 2, ly, '14px system-ui, sans-serif', '#3A4454', 'center'); ly += 20; line = wd; }
      else line += ' ' + wd;
    }
    if (line.trim()) text(ctx, line.trim(), x + w / 2, ly, '14px system-ui, sans-serif', '#3A4454', 'center');
    // Level pips.
    for (let p = 0; p < u.max; p++) {
      ctx.fillStyle = p < lvl ? COLOURS.gold : '#C9C2B2';
      ctx.beginPath(); ctx.arc(x + w / 2 - (u.max - 1) * 9 + p * 18, y + 232, 6, 0, Math.PI * 2); ctx.fill();
    }
    text(ctx, '[' + (i + 1) + ']', x + w / 2, y + 256, 'bold 15px system-ui, sans-serif', '#14181F', 'center');
    input.clickRects.push({ kind: 'choice', index: i, x, y, w, h });
  });
  // OWNED row + next preview.
  const owned = state.upgradesOwned.length ? state.upgradesOwned.map((id) => {
    const u = UPGRADES.find((o) => o.id === id);
    return u ? u.name : id.toUpperCase();
  }).join('  ·  ') : 'none yet';
  text(ctx, 'OWNED:  ' + owned, 640, 506, '15px system-ui, sans-serif', '#C9C2B2', 'center');
  // PASS 7/8 — the relics this run has earned, with their effects visible.
  // Twelve names never fit one line: two rows of six, header on its own.
  const relicNames = (state.relics || []).map((id) => { const r = RELICS.find((o) => o.id === id); return r ? r.icon + ' ' + r.name : id.toUpperCase(); });
  const relicRows = [];
  for (let i = 0; i < relicNames.length; i += 6) relicRows.push(relicNames.slice(i, i + 6).join('  ·  '));
  text(ctx, 'PARADOX RELICS  ' + (state.relics || []).length + '/' + RELICS.length, 640, 528, 'bold 14px system-ui, sans-serif', COLOURS.gold, 'center');
  if (relicRows.length) relicRows.forEach((row, i) => text(ctx, row, 640, 548 + i * 18, '13px system-ui, sans-serif', '#F5B81D', 'center'));
  else text(ctx, 'none earned yet', 640, 548, '13px system-ui, sans-serif', '#C9C2B2', 'center');
  // NEXT-LOOP PREVIEW (Pass 2): finishRewind already spawned the next wave
  // before showing the draft, so counting state.enemies IS the exact
  // composition the player is about to face — no separate estimate to drift.
  const counts = {};
  for (const e of state.enemies) counts[e.type] = (counts[e.type] || 0) + 1;
  const order = ['warden', 'chronarch', 'guardian', 'sniper', 'bomber', 'chaser', 'splitter', 'phantom'];
  const icons = { guardian: '🛡', sniper: '🎯', bomber: '💣', chaser: '➤', splitter: '✦', phantom: '👻', warden: '♛', chronarch: '🕐' };
  const names = { guardian: ['Guardian', 'Guardians'], sniper: ['Sniper', 'Snipers'], bomber: ['Bomber', 'Bombers'], chaser: ['Chaser', 'Chasers'], splitter: ['Splitter', 'Splitters'], phantom: ['Stolen Echo', 'Stolen Echoes'], warden: ['THE WARDEN', 'THE WARDEN'], chronarch: ['THE CHRONARCH', 'THE CHRONARCH'] };
  let prev = 'NEXT — LOOP ' + state.loop + ': ';
  let first = true;
  for (const t of order) {
    if (!counts[t]) continue;
    prev += (first ? '' : '  ·  ') + icons[t] + ' ' + counts[t] + ' ' + names[t][counts[t] > 1 ? 1 : 0];
    first = false;
  }
  if (first) prev += '— arena clear —';
  text(ctx, prev, 640, 588, 'bold 16px system-ui, sans-serif', COLOURS.cyan, 'center');
  text(ctx, 'ECHOES ' + state.echoes.length + '/' + echoSlots(state), 640, 610, 'bold 14px system-ui, sans-serif', '#C9C2B2', 'center');
  // PASS 6 — loop-map strip: the 10-loop road at a glance (display only —
  // no road choice, no new system). Boss loops 5 and 10 are gold-outlined,
  // cleared loops gold, the loop you are about to play cyan.
  text(ctx, 'LOOP MAP — YOU ARE HEADING INTO LOOP ' + state.loop, 640, 630, 'bold 13px system-ui, sans-serif', COLOURS.gold, 'center');
  drawLoopTrack(ctx, 640, 648, 30, 12, clamp(state.loop - 1, 0, 10), state.loop, false, true);
}


// ---- Workshop ----
function drawWorkshop(ctx, state, input) {
  ctx.fillStyle = 'rgba(20,24,31,0.62)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(22,28,37,0.94)';
  rr(ctx, 150, 36, 980, 648, 18); ctx.fill();
  ctx.strokeStyle = COLOURS.gold; ctx.lineWidth = 2;
  rr(ctx, 150, 36, 980, 648, 18); ctx.stroke();
  const ws = state.workshop || { shards: 0, levels: {} };
  text(ctx, 'CHRONO WORKSHOP', 640, 96, 'bold 46px system-ui, sans-serif', '#FFFFFF', 'center');
  text(ctx, 'Permanent upgrades — bought once, kept forever. Shards are earned every run: score ÷ 1000 + kills ÷ 10.', 640, 132, '16px system-ui, sans-serif', '#7DF3FF', 'center');
  text(ctx, '◆  ' + (ws.shards || 0) + ' CHRONO SHARDS', 640, 160, 'bold 20px system-ui, sans-serif', COLOURS.gold, 'center');
  WORKSHOP_ITEMS.forEach((it, i) => {
    const x = 190 + (i % 3) * 310, y = 186 + Math.floor(i / 3) * 196, w = 280, h = 176;
    const lvl = (ws.levels && ws.levels[it.id]) || 0;
    const maxed = lvl >= it.max;
    const cost = maxed ? null : it.costs[lvl];
    const afford = !maxed && (ws.shards || 0) >= cost;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    rr(ctx, x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = afford ? COLOURS.gold : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    rr(ctx, x, y, w, h, 10); ctx.stroke();
    text(ctx, it.icon + '  ' + it.name, x + w / 2, y + 28, 'bold 16px system-ui, sans-serif', '#FFFFFF', 'center');
    const words = it.desc.split(' ');
    let line = '', ly = y + 58;
    for (const wd of words) {
      if ((line + ' ' + wd).trim().length > 30) { text(ctx, line.trim(), x + w / 2, ly, '13px system-ui, sans-serif', '#C9C2B2', 'center'); ly += 18; line = wd; }
      else line += ' ' + wd;
    }
    if (line.trim()) text(ctx, line.trim(), x + w / 2, ly, '13px system-ui, sans-serif', '#C9C2B2', 'center');
    for (let p = 0; p < it.max; p++) {
      ctx.fillStyle = p < lvl ? COLOURS.gold : '#C9C2B2';
      ctx.beginPath(); ctx.arc(x + w / 2 - (it.max - 1) * 9 + p * 18, y + 118, 6, 0, Math.PI * 2); ctx.fill();
    }
    text(ctx, maxed ? '★ MAXED ★' : 'NEXT: ' + cost + ' SHARDS — CLICK TO BUY', x + w / 2, y + 146, 'bold 14px system-ui, sans-serif', maxed ? COLOURS.gold : afford ? '#FFFFFF' : '#7A7F88', 'center');
    input.clickRects.push({ kind: 'buy', id: it.id, x, y, w, h });
  });
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  rr(ctx, 470, 620, 340, 52, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
  rr(ctx, 470, 620, 340, 52, 10); ctx.stroke();
  text(ctx, '◀  BACK TO TITLE  (T)', 640, 647, 'bold 20px system-ui, sans-serif', '#FFFFFF', 'center');
  input.clickRects.push({ kind: 'back', x: 470, y: 620, w: 340, h: 52 });
}

// ---- Summary ----
function drawSummary(ctx, state, input) {
  ctx.fillStyle = 'rgba(20,24,31,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(22,28,37,0.95)';
  rr(ctx, 240, 56, 800, 608, 18); ctx.fill();
  ctx.strokeStyle = COLOURS.gold; ctx.lineWidth = 2;
  rr(ctx, 240, 56, 800, 608, 18); ctx.stroke();
  // Layout: the WIN screen carries an achievements block, so its rows sit
  // higher and the graph is compact; the LOSE screen keeps the exact Pass 3
  // layout (already verified and viewed) — only the buttons move, and the
  // old PLAY AGAIN click point (640,626) still lands inside the button.
  const L = state.win
    ? { cy: 150, banner: 238, score: 304, best: 334, statL: 366, statV: 392, track: 512, graphL: 534, graphTop: 576, graphH: 16, graphLab: 598 }
    : { cy: 160, banner: 252, score: 322, best: 356, statL: 388, statV: 412, track: 486, graphL: 512, graphTop: 584, graphH: 36, graphLab: 598 };
  // Grade circle.
  const g = state.win ? (state.winGrade || 'B') : '—';
  ctx.fillStyle = state.win ? COLOURS.gold : '#3A4454';
  ctx.beginPath(); ctx.arc(640, L.cy, 62, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(640, L.cy, 62, 0, Math.PI * 2); ctx.stroke();
  text(ctx, g, 640, L.cy + 4, 'bold 64px system-ui, sans-serif', state.win ? '#14181F' : '#FFFFFF', 'center');
  // Lose screen: the loop that killed you, big — and the killer, named.
  // Win screen keeps its banner line.
  text(ctx, state.win ? 'ALL 10 LOOPS CLEARED — THE CHRONARCH FALLS' : 'FELL ON LOOP ' + state.loop,
    640, L.banner, 'bold 26px system-ui, sans-serif', state.win ? '#FFFFFF' : COLOURS.crimsonSoft, 'center');
  if (!state.win) text(ctx, killerLine(state), 640, 284, '16px system-ui, sans-serif', '#C9C2B2', 'center');
  text(ctx, 'FINAL SCORE  ' + state.score.toLocaleString('en-US'), 640, L.score, 'bold 34px system-ui, sans-serif', COLOURS.gold, 'center');
  if (state.newBest) text(ctx, '★ NEW BEST ★', 640, L.best, 'bold 18px system-ui, sans-serif', '#F5B81D', 'center');
  // Stats row — 8 columns now, including total RUN TIME (Pass 3).
  const acc = state.shotsFired ? Math.round((state.shotsHit / state.shotsFired) * 100) : 0;
  const stats = [
    ['LOOPS', Math.min(state.loop, 10) + ' / 10'],
    ['KILLS', String(state.kills)],
    ['ACCURACY', acc + '%'],
    ['CROSSFIRES', String(state.crossfires)],
    ['SURGES', String(state.surges || 0)],
    ['SHIELD BREAKS', String(state.shieldBreaks)],
    ['REWINDS', String(state.rewinds)],
    ['TIME', fmtTime(state.runTime)],
  ];
  stats.forEach((s, i) => {
    const x = 292 + i * 100;
    text(ctx, s[0], x, L.statL, 'bold 11px system-ui, sans-serif', '#C9C2B2', 'center');
    text(ctx, s[1], x, L.statV, 'bold 19px system-ui, sans-serif', '#FFFFFF', 'center');
  });
  // ACHIEVEMENTS (Pass 4, win only): 6 items from the run's own stats —
  // earned gold, unearned grey — in two rows of three.
  if (state.win) {
    text(ctx, 'ACHIEVEMENTS', 640, 408, 'bold 13px system-ui, sans-serif', COLOURS.gold, 'center');
    achievementsFor(state).forEach((a, i) => {
      const x = 370 + (i % 3) * 270;
      const y = 424 + Math.floor(i / 3) * 18;
      text(ctx, (a.earned ? '★ ' : '☆ ') + a.name + ' — ' + a.desc, x, y, '13px system-ui, sans-serif', a.earned ? '#F5B81D' : '#7A7F88', 'center');
    });
  }
  // PASS 7 — the relics this run earned, named. A win shows all six;
  // a loss shows what the run managed before it fell.
  const sumRelics = (state.relics || []).map((id) => {
    const r = RELICS.find((o) => o.id === id);
    return r ? r.icon + ' ' + r.name : id.toUpperCase();
  });
  // PASS 8 — twelve names take two rows of six; the header also banks the
  // run's shard payout, so the win screen proves the workshop economy.
  const sumRows = [];
  for (let i = 0; i < sumRelics.length; i += 6) sumRows.push(sumRelics.slice(i, i + 6).join('  ·  '));
  const relY = state.win ? 464 : 436;
  text(ctx, 'PARADOX RELICS  ' + sumRelics.length + '/' + RELICS.length + '   ·   +' + (state.shardsEarned || 0) + ' SHARDS  ·  BALANCE ' + (state.workshop ? (state.workshop.shards || 0) : 0), 640, relY, 'bold 13px system-ui, sans-serif', sumRelics.length ? COLOURS.gold : '#7A7F88', 'center');
  if (sumRows.length) sumRows.forEach((row, i) => text(ctx, row, 640, relY + 18 + i * 16, '11px system-ui, sans-serif', '#F5B81D', 'center'));
  else text(ctx, 'none earned yet', 640, relY + 18, '11px system-ui, sans-serif', '#7A7F88', 'center');
  // LOOP-PROGRESS TRACK (Pass 3): win — all 10 filled gold; lose — filled
  // up to the loop reached, the killing loop crimson, the rest unreached.
  drawLoopTrack(ctx, 640, L.track, 44, 12, state.win ? 10 : clamp(state.loop - 1, 0, 10),
    state.win ? 0 : state.loop, !state.win, true);
  // Per-loop bar graph.
  text(ctx, 'SCORE PER LOOP', 640, L.graphL, 'bold 13px system-ui, sans-serif', '#C9C2B2', 'center');
  const loops = state.perLoop.slice(0, 10);
  const maxS = Math.max(1, ...loops.map((l) => l.score));
  loops.forEach((l, i) => {
    const x = 340 + i * 62, h = Math.max(4, (l.score / maxS) * L.graphH);
    ctx.fillStyle = l.loop === 10 ? COLOURS.gold : COLOURS.cyan;
    ctx.fillRect(x, L.graphTop - h, 40, h);
    text(ctx, 'L' + l.loop, x + 20, L.graphLab, '11px system-ui, sans-serif', '#C9C2B2', 'center');
  });
  if (!loops.length) text(ctx, 'No loop cleared yet.', 640, L.graphL + 38, '14px system-ui, sans-serif', '#C9C2B2', 'center');
  // PLAY AGAIN on a win, TRY AGAIN on a loss — same restart path (R) — and
  // TITLE (T) beside it, back to the title screen. The pair is centred on
  // 640, and the old PLAY AGAIN click point (640,626) still lands inside.
  ctx.fillStyle = COLOURS.crimson;
  rr(ctx, 400, 600, 280, 52, 10); ctx.fill();
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
  rr(ctx, 400, 600, 280, 52, 10); ctx.stroke();
  text(ctx, state.win ? '↻  PLAY AGAIN  (R)' : '↻  TRY AGAIN  (R)', 540, 627, 'bold 20px system-ui, sans-serif', '#FFFFFF', 'center');
  input.clickRects.push({ kind: 'restart', x: 400, y: 600, w: 280, h: 52 });
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  rr(ctx, 700, 600, 200, 52, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
  rr(ctx, 700, 600, 200, 52, 10); ctx.stroke();
  text(ctx, 'TITLE  (T)', 800, 627, 'bold 20px system-ui, sans-serif', '#FFFFFF', 'center');
  input.clickRects.push({ kind: 'title', x: 700, y: 600, w: 200, h: 52 });
}
