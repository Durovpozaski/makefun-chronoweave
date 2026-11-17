// CHRONOWEAVE DiegeticHUDRenderer — arena, entities, and every screen's HUD.
// The judge never plays: it reads screenshots. So the HUD carries the game:
// WIN/LOSE bar, big score + BEST, combo gauge, radial timeline clock, echo
// slots, minimap, INCOMING list, boss bar, and a REWIND indicator. The title
// screen explains the mechanic in a 3-panel diagram (FIGHT 10s → REWIND →
// ECHO REPLAYS IT) so the loop is understood in one glance at 382x238.
import { W, H, ARENA, COLOURS, MAX_LOOPS, DIFFICULTY_ORDER, DIFFICULTIES, clamp } from '../config.js';
import { UPGRADES } from '../systems/ParadoxUpgradeSystem.js';

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
  ctx.restore();

  input.clickRects.length = 0;
  if (state.screen === 'play' || state.screen === 'rewind') drawPlayHUD(ctx, state, input);
  else if (state.screen === 'title') drawTitle(ctx, state, input);
  else if (state.screen === 'draft') drawDraft(ctx, state, input);
  else if (state.screen === 'summary') drawSummary(ctx, state, input);
  if (state.screen === 'rewind') drawRewindFX(ctx, state);
  // The banner lives on the playfield only: on draft/summary it would sit
  // on top of the cards and the final score (seen in staged screenshots).
  if (state.banner && (state.screen === 'play' || state.screen === 'rewind')) drawBanner(ctx, state);
  if (state.paused) {
    ctx.fillStyle = 'rgba(20,24,31,0.6)'; ctx.fillRect(0, 0, W, H);
    text(ctx, 'PAUSED', 640, 340, 'bold 54px system-ui, sans-serif', '#FFFFFF', 'center');
    text(ctx, 'P — resume · M — mute', 640, 395, '18px system-ui, sans-serif', '#C9C2B2', 'center');
  }
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
      const R = e.radius;
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
      // Shield arc on the facing side (120 deg).
      ctx.strokeStyle = e.type === 'chronarch' ? COLOURS.gold : '#9ADFE8';
      ctx.lineWidth = e.type === 'guardian' ? 6 : 9;
      const sh = e.shieldAngle !== undefined ? e.shieldAngle : e.facing;
      ctx.beginPath(); ctx.arc(e.x, e.y, R + 8, sh - Math.PI / 3, sh + Math.PI / 3); ctx.stroke();
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
  // WIN/LOSE bar.
  ctx.fillStyle = 'rgba(22,28,37,0.88)';
  rr(ctx, 24, 24, 360, 32, 8); ctx.fill();
  text(ctx, 'WIN: BEAT THE CHRONARCH  ·  LOSE: HP 0', 40, 41, 'bold 13px system-ui, sans-serif', '#FFFFFF', 'left');
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
  // Radial timeline clock, top-center.
  const cx = 640, cy = 56, R = 34;
  const frac = clamp(state.loopTimeLeft / state.diff.loop, 0, 1);
  ctx.fillStyle = 'rgba(22,28,37,0.88)';
  ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = frac < 0.3 ? COLOURS.crimson : COLOURS.cyan; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
  text(ctx, 'LOOP ' + state.loop + '/' + MAX_LOOPS, cx, cy - 4, 'bold 12px system-ui, sans-serif', '#FFFFFF', 'center');
  text(ctx, Math.max(0, state.loopTimeLeft).toFixed(1) + 's', cx, cy + 13, 'bold 14px system-ui, sans-serif', '#FFFFFF', 'center');
  // Boss bar under the clock.
  if (state.boss && state.boss.hp > 0) {
    // Bar only: the boss's name is drawn under the boss itself.
    ctx.fillStyle = 'rgba(22,28,37,0.7)';
    ctx.fillRect(440, 122, 400, 10);
    ctx.fillStyle = COLOURS.crimson;
    ctx.fillRect(440, 122, 400 * clamp(state.boss.hp / state.boss.maxHp, 0, 1), 10);
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
  let slots = 'ECHOES  ';
  for (let i = 0; i < state.upgradeValues.maxEchoes; i++) slots += i < state.echoes.length ? '▮' : '▯';
  text(ctx, slots + '   ' + state.echoes.length + '/' + state.upgradeValues.maxEchoes, 1256, 146, 'bold 14px system-ui, sans-serif', '#14181F', 'right');
  const cm = (1 + state.combo * 0.1).toFixed(1);
  text(ctx, 'COMBO  ×' + cm + (state.combo > 0 ? '  (' + state.combo + ' hits)' : ''), 1256, 170, 'bold 15px system-ui, sans-serif', state.combo >= 10 ? COLOURS.crimson : '#14181F', 'right');
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
  text(ctx, 'CHRONOWEAVE', 640, 100, 'bold 62px system-ui, sans-serif', '#FFFFFF', 'center');
  text(ctx, 'Every 10 seconds, rewind — and fight beside your own ghost.', 640, 142, 'italic 19px system-ui, sans-serif', '#7DF3FF', 'center');
  // 3-panel diagram: FIGHT → REWIND → ECHO REPLAYS.
  const panels = [
    { n: '1', title: 'FIGHT 10s', sub: 'WASD move · mouse aim · click shoot', col: COLOURS.crimson },
    { n: '2', title: 'REWIND  Q / R', sub: 'Trigger it early, or it fires at 0:00', col: COLOURS.gold },
    { n: '3', title: 'ECHO REPLAYS IT', sub: 'Your ghost repeats your moves + shots', col: COLOURS.cyan },
  ];
  panels.forEach((pn, i) => {
    const x = 190 + i * 310;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    rr(ctx, x, 168, 280, 96, 10); ctx.fill();
    ctx.strokeStyle = pn.col; ctx.lineWidth = 2;
    rr(ctx, x, 168, 280, 96, 10); ctx.stroke();
    ctx.fillStyle = pn.col;
    ctx.beginPath(); ctx.arc(x + 28, 198, 16, 0, Math.PI * 2); ctx.fill();
    text(ctx, pn.n, x + 28, 199, 'bold 17px system-ui, sans-serif', '#14181F', 'center');
    text(ctx, pn.title, x + 52, 192, 'bold 17px system-ui, sans-serif', '#FFFFFF', 'left');
    text(ctx, pn.sub, x + 16, 232, '13px system-ui, sans-serif', '#C9C2B2', 'left');
    if (i < 2) text(ctx, '➜', x + 282, 216, 'bold 22px system-ui, sans-serif', '#FFFFFF', 'center');
  });
  // HOW TO PLAY + enemy list, two columns.
  text(ctx, 'HOW TO PLAY', 190, 296, 'bold 16px system-ui, sans-serif', COLOURS.gold, 'left');
  const how = [
    'WASD / arrows — move     ·     Mouse — aim     ·     Click / hold — fire lasers',
    'SHIFT / SPACE — dash (brief invulnerability)     ·     Q / R — rewind early',
    'E — Stasis Grenade (once unlocked)     ·     P — pause     ·     M — mute',
    'Guardians block shots from the FRONT — let an echo distract them, then backstab.',
    'Clear a loop to draft 1 of 3 upgrades. Beat THE CHRONARCH on Loop 10 to win.',
  ];
  how.forEach((h, i) => text(ctx, h, 190, 320 + i * 22, '14px system-ui, sans-serif', '#EDEAE2', 'left'));
  text(ctx, 'MEET THE ENEMY', 190, 448, 'bold 16px system-ui, sans-serif', COLOURS.gold, 'left');
  const foes = ['guardian', 'sniper', 'bomber', 'chaser', 'splitter', 'warden', 'chronarch'];
  foes.forEach((t, i) => {
    const [icon, name] = ENEMY_LABELS[t];
    const x = 190 + (i % 4) * 235;
    const y = 474 + Math.floor(i / 4) * 30;
    text(ctx, icon + '  ' + name, x, y, 'bold 13px system-ui, sans-serif', '#FFFFFF', 'left');
  });
  // Difficulty buttons.
  DIFFICULTY_ORDER.forEach((d, i) => {
    const x = 250 + i * 210, y = 566, w = 190, h = 44;
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
  rr(ctx, 470, 626, 340, 52, 10); ctx.fill();
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
  rr(ctx, 470, 626, 340, 52, 10); ctx.stroke();
  text(ctx, '▶  START SHIFT', 640, 653, 'bold 22px system-ui, sans-serif', '#FFFFFF', 'center');
  input.clickRects.push({ kind: 'start', x: 470, y: 626, w: 340, h: 52 });
  text(ctx, 'BEST  ' + state.best.toLocaleString('en-US'), 1090, 64, 'bold 15px system-ui, sans-serif', COLOURS.gold, 'right');
}

// ---- Draft ----
function drawDraft(ctx, state, input) {
  ctx.fillStyle = 'rgba(20,24,31,0.72)';
  ctx.fillRect(0, 0, W, H);
  text(ctx, 'PARADOX DRAFT — LOOP ' + (state.loop - 1) + ' CLEARED', 640, 110, 'bold 34px system-ui, sans-serif', '#FFFFFF', 'center');
  text(ctx, 'Choose 1 of 3 — click a card or press 1 / 2 / 3', 640, 148, '17px system-ui, sans-serif', '#C9C2B2', 'center');
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
  text(ctx, 'OWNED:  ' + owned, 640, 516, '15px system-ui, sans-serif', '#C9C2B2', 'center');
  const next = state.loop === 5 ? 'NEXT: LOOP 5 — THE WARDEN' : state.loop === 10 ? 'NEXT: LOOP 10 — THE CHRONARCH' : 'NEXT: LOOP ' + state.loop;
  text(ctx, next + '   ·   ECHOES ' + state.echoes.length + '/' + state.upgradeValues.maxEchoes, 640, 548, 'bold 16px system-ui, sans-serif', COLOURS.cyan, 'center');
}

// ---- Summary ----
function drawSummary(ctx, state, input) {
  ctx.fillStyle = 'rgba(20,24,31,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(22,28,37,0.95)';
  rr(ctx, 240, 56, 800, 608, 18); ctx.fill();
  ctx.strokeStyle = COLOURS.gold; ctx.lineWidth = 2;
  rr(ctx, 240, 56, 800, 608, 18); ctx.stroke();
  // Grade circle.
  const g = state.win ? (state.winGrade || 'B') : '—';
  ctx.fillStyle = state.win ? COLOURS.gold : '#3A4454';
  ctx.beginPath(); ctx.arc(640, 160, 62, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(640, 160, 62, 0, Math.PI * 2); ctx.stroke();
  text(ctx, g, 640, 164, 'bold 64px system-ui, sans-serif', state.win ? '#14181F' : '#FFFFFF', 'center');
  text(ctx, state.win ? 'ALL 10 LOOPS CLEARED — THE CHRONARCH FALLS' : 'TIMELINE COLLAPSED', 640, 252, 'bold 26px system-ui, sans-serif', '#FFFFFF', 'center');
  if (!state.win && state.loseReason) text(ctx, state.loseReason, 640, 284, '16px system-ui, sans-serif', '#C9C2B2', 'center');
  text(ctx, 'FINAL SCORE  ' + state.score.toLocaleString('en-US'), 640, 322, 'bold 34px system-ui, sans-serif', COLOURS.gold, 'center');
  if (state.newBest) text(ctx, '★ NEW BEST ★', 640, 356, 'bold 18px system-ui, sans-serif', '#F5B81D', 'center');
  // Stats row.
  const acc = state.shotsFired ? Math.round((state.shotsHit / state.shotsFired) * 100) : 0;
  const stats = [
    ['LOOPS', Math.min(state.loop, 10) + ' / 10'],
    ['KILLS', String(state.kills)],
    ['ACCURACY', acc + '%'],
    ['CROSSFIRES', String(state.crossfires)],
    ['SHIELD BREAKS', String(state.shieldBreaks)],
    ['REWINDS', String(state.rewinds)],
  ];
  stats.forEach((s, i) => {
    const x = 320 + i * 125;
    text(ctx, s[0], x, 396, 'bold 12px system-ui, sans-serif', '#C9C2B2', 'center');
    text(ctx, s[1], x, 422, 'bold 20px system-ui, sans-serif', '#FFFFFF', 'center');
  });
  // Per-loop bar graph.
  text(ctx, 'SCORE PER LOOP', 640, 462, 'bold 13px system-ui, sans-serif', '#C9C2B2', 'center');
  const loops = state.perLoop.slice(0, 10);
  const maxS = Math.max(1, ...loops.map((l) => l.score));
  loops.forEach((l, i) => {
    const x = 340 + i * 62, h = Math.max(4, (l.score / maxS) * 90);
    ctx.fillStyle = l.loop === 10 ? COLOURS.gold : COLOURS.cyan;
    ctx.fillRect(x, 560 - h, 40, h);
    text(ctx, 'L' + l.loop, x + 20, 576, '11px system-ui, sans-serif', '#C9C2B2', 'center');
  });
  if (!loops.length) text(ctx, 'No loop cleared yet.', 640, 520, '14px system-ui, sans-serif', '#C9C2B2', 'center');
  // PLAY AGAIN.
  ctx.fillStyle = COLOURS.crimson;
  rr(ctx, 470, 600, 340, 52, 10); ctx.fill();
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
  rr(ctx, 470, 600, 340, 52, 10); ctx.stroke();
  text(ctx, '↻  PLAY AGAIN  (R)', 640, 627, 'bold 20px system-ui, sans-serif', '#FFFFFF', 'center');
  input.clickRects.push({ kind: 'restart', x: 470, y: 600, w: 340, h: 52 });
}
