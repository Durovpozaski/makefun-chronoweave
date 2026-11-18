// CHRONOWEAVE — shared tuning constants and deterministic helpers.
// Stark alabaster/slate arena, electric cyan echoes, crimson lasers, golden rifts.
export const W = 1280;
export const H = 720;
export const ARENA = { x: 24, y: 24, w: 1232, h: 672 };
export const LOOP_BASE = 10; // seconds per loop (STEADY)
export const MAX_LOOPS = 10; // Loops 1-10: THE WARDEN at 5, THE CHRONARCH at 10
export const DT = 1 / 60;

export const COLOURS = {
  floorA: '#EDEAE2', floorB: '#E2DED4', grid: '#D5D0C2',
  slate: '#232B36', slateDark: '#161C25', slateLine: '#3A4454',
  cyan: '#00E5FF', cyanSoft: '#7DF3FF', cyanDim: 'rgba(0,229,255,0.35)',
  crimson: '#FF2E4D', crimsonSoft: '#FF7A8A',
  gold: '#F5B81D', goldSoft: '#FFD968',
  red: '#E4572E', white: '#FFFFFF', ink: '#14181F',
  guardian: '#2B3542', guardianEye: '#FF5A3C',
  sniper: '#33272E', bomber: '#E4572E',
};

export const DIFFICULTIES = {
  slow:  { label: 'SLOW',    desc: 'Long loops, gentle foes',   loop: 14, dmgMul: 0.7, hpMul: 0.8, scoreMul: 0.8 },
  steady:{ label: 'STEADY',  desc: 'The intended timeline',     loop: 10, dmgMul: 1.0, hpMul: 1.0, scoreMul: 1.0 },
  storm: { label: 'STORM',   desc: 'Short loops, brutal foes',  loop: 8,  dmgMul: 1.3, hpMul: 1.2, scoreMul: 1.3 },
};
export const DIFFICULTY_ORDER = ['slow', 'steady', 'storm'];

export const PLAYER = {
  radius: 16, speed: 265, hp: 100, fireInterval: 0.16, boltSpeed: 920,
  boltDamage: 14, dashSpeed: 920, dashTime: 0.18, dashCooldown: 1.15,
  echoBoltDamage: 10, echoRadius: 15,
};
export const SCORING = {
  killBase: 100, loopClearBonus: 500, winBonusPerSecond: 10,
  gradeSMin: 9000, gradeAMin: 5500,
};
// WEAVE — the hook's meter. A crossfire (player + echo hit the same enemy
// within 1.5s) charges it; 3 crossfires fill it. A rewind spent at full
// Weave becomes a PARADOX SURGE (+1 echo slot, hard cap 4 total slots).
// A timeout rewind frays the timeline: +1 fray (cap 3), and the next loop
// spawns one extra Chaser per fray.
export const WEAVE_PER_CROSSFIRE = 34;
export const WEAVE_MAX = 100;
export const MAX_ECHO_SLOTS = 4;
export const FRAY_CAP = 3;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function dist(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function lerp(a, b, t) { return a + (b - a) * t; }
// Segment (x1,y1)-(x2,y2) vs rect {x,y,w,h}: true if the segment hits the rect.
export function segmentHitsRect(x1, y1, x2, y2, r) {
  const dx = x2 - x1, dy = y2 - y1;
  let tmin = 0, tmax = 1;
  if (dx === 0) { if (x1 < r.x || x1 > r.x + r.w) return false; }
  else {
    let t1 = (r.x - x1) / dx, t2 = (r.x + r.w - x1) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (dy === 0) { if (y1 < r.y || y1 > r.y + r.h) return false; }
  else {
    let t1 = (r.y - y1) / dy, t2 = (r.y + r.h - y1) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}
// Push a circle out of a rect; returns true if a collision happened.
export function circleRectResolve(c, r) {
  const nx = clamp(c.x, r.x, r.x + r.w), ny = clamp(c.y, r.y, r.y + r.h);
  const dx = c.x - nx, dy = c.y - ny, d2 = dx * dx + dy * dy;
  if (d2 >= c.radius * c.radius) return false;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    c.x = nx + (dx / d) * c.radius; c.y = ny + (dy / d) * c.radius;
  } else {
    // Centre inside the rect: push out along the smallest penetration axis.
    const left = c.x - r.x, right = r.x + r.w - c.x, top = c.y - r.y, bot = r.y + r.h - c.y;
    const m = Math.min(left, right, top, bot);
    if (m === left) c.x = r.x - c.radius; else if (m === right) c.x = r.x + r.w + c.radius;
    else if (m === top) c.y = r.y - c.radius; else c.y = r.y + r.h + c.radius;
  }
  return true;
}
