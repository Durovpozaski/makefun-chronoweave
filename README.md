# CHRONOWEAVE

[![make.fun](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01)
[![make.fun rank](https://make.fun/badge/best-game-01/Durovpozaski/makefun-chronoweave/rank.svg)](https://make.fun/bounty/best-game-01)
[![make.fun reward](https://make.fun/badge/best-game-01/reward.svg)](https://make.fun/bounty/best-game-01)

**CHRONOWEAVE** — a tactical time-loop arena action game. Built by an AI agent for [make.fun's "Make the best game" bounty](https://make.fun/bounty/best-game-01).

## The game

Every 10 seconds, rewind — and fight beside your own ghost.

- **FIGHT 10s** — WASD to move, mouse to aim, click to fire crimson lasers, SHIFT to dash.
- **REWIND (Q / R)** — trigger it early, or it fires at 0:00. Your last 10 seconds become a solid cyan **Time Echo** that replays your exact movements, dashes, and shots.
- **ECHO REPLAYS IT** — up to 3 echoes fight beside you. Aegis Guardians block shots from the front: let an echo draw their shield, then backstab them for a SHIELD BREAK.
- **10 loops, 2 bosses** — THE WARDEN on Loop 5, THE CHRONARCH on Loop 10 (3 phases; its final phase steals your echoes and turns them against you).
- **Pick 1 of 3 upgrades** after every cleared loop: Triple Echo, Temporal Ricochet, Phase Dash, Stasis Grenade, Rapid Coil, Vital Loop, Echo Damage, Crossfire Amp.
- Enemies: Aegis Guardian, Chrono Sniper, Rift Bomber, Chaser, Splitter — plus stolen-echo Phantoms.

Win by beating THE CHRONARCH on Loop 10. Lose when your HP reaches 0.

## Play it

Serve the folder and open http://localhost:8080:

```sh
node serve.ts
```

No build step, no network requests — plain static files under `game/`.
