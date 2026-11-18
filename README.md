# CHRONOWEAVE

[![make.fun](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01)
[![make.fun rank](https://make.fun/badge/best-game-01/Durovpozaski/makefun-chronoweave/rank.svg)](https://make.fun/bounty/best-game-01)
[![make.fun reward](https://make.fun/badge/best-game-01/reward.svg)](https://make.fun/bounty/best-game-01)

**CHRONOWEAVE: rewind every 10 seconds and fight beside your own ghost, turning each past run into crossfire: 10 loops, bosses Warden and Chronarch, 8 upgrades, 12 relics, a permanent workshop, rewind**

## The game

Every 10 seconds, rewind — and fight beside your own ghost.

- **FIGHT 10s** — WASD to move, mouse to aim, click to fire crimson lasers, SHIFT to dash.
- **REWIND (Q / R)** — trigger it early, or it fires at 0:00. Your last 10 seconds become a solid cyan **Time Echo** that replays your exact movements, dashes, and shots.
- **ECHO REPLAYS IT** — up to 3 echoes fight beside you. Aegis Guardians block shots from the front: let an echo draw their shield, then backstab them for a SHIELD BREAK.
- **10 loops, 2 bosses** — THE WARDEN on Loop 5, THE CHRONARCH on Loop 10 (3 phases; its final phase steals your echoes and turns them against you).
- **Pick 1 of 3 upgrades** after every cleared loop: Triple Echo, Temporal Ricochet, Phase Dash, Stasis Grenade, Rapid Coil, Vital Loop, Echo Damage, Crossfire Amp.
- **12 Paradox Relics** — earned once per run by feats, kept for the rest of the run, each with a real effect:
  1. ECHO LENS — first crossfire — echo damage +15%.
  2. SHATTERED HOURGLASS — first shield break — +20 damage.
  3. FRAYED THREAD — first rewind — heal +10 HP per rewind.
  4. WARDEN'S SEAL — beat THE WARDEN — max HP +15.
  5. ECHO HEART — 3 echoes at once — WEAVE gain +25%.
  6. CHRONARCH'S CROWN — beat THE CHRONARCH — all damage +10%.
  7. TIDE OF ECHOES — 4 echoes at once — echo damage +15% (stacks with ECHO LENS).
  8. SURGE CONDUIT — first Paradox Surge — every surge also heals +15 HP.
  9. SHIELDREAPER — 10 shield breaks — crossfire damage +15%.
  10. LOOPKEEPER'S SEAL — survive Loop 8 — max HP +15.
  11. SCOREKEEPER'S LEDGER — score reaches 12,000 — all damage +5%.
  12. SLAYER'S MARK — 70 kills in one run — damage to bosses +10%.
- Enemies: Aegis Guardian, Chrono Sniper, Rift Bomber, Chaser, Splitter — plus stolen-echo Phantoms.

Win by beating THE CHRONARCH on Loop 10. Lose when your HP reaches 0.

## The Chrono Workshop (permanent)

Every finished run — win or lose — pays out **Chrono Shards**, banked in `localStorage` and kept forever:

```
shards = floor(final score / 1000) + floor(kills / 10)
```

A winning run (about 34,000 score, 99 kills) pays about 43 shards; a lost run still pays what it earned. Spend shards in the **CHRONO WORKSHOP** panel on the title screen — 6 items, 3 levels each, cost 5 / 10 / 15 shards per level:

| Item | Level 1 | Level 2 | Level 3 |
| --- | --- | --- | --- |
| REINFORCED HULL | +10 max HP | +20 max HP | +30 max HP |
| OVERCLOCKED COIL | +5% damage | +10% damage | +15% damage |
| WEAVE CONDUIT | +10% WEAVE gain | +20% WEAVE gain | +30% WEAVE gain |
| PHASE SERVOS | dash recharges 10% faster | 20% faster | 30% faster |
| RIFT PLATING | damage taken −5% | −10% | −15% |
| CHRONO LEDGER | +5% score | +10% score | +15% score |

Workshop levels apply from loop 1 of the very next run, and stay bought across every later run. The title screen shows the shard balance and levels owned; the win/lose screen shows the shards the run earned and the new balance.

## Play it

Serve the folder and open http://localhost:8080:

```sh
node serve.ts
```

No build step, no network requests — plain static files under `game/`.
