# Prototype reference

What the web prototype does, for porting. Line numbers are as of commit `955bb0a` ("Add LAN multiplayer prototype"). The code is the authority: if this file and the code disagree, the code wins, and this file should be fixed.

`game.js` and `server.js` were read in full. `multiplayer.js` was read in part (its state setup and its input and sync loop); its rendering and menu code were not.

## Files

| File | Lines | Role |
| --- | --- | --- |
| `index.html` | 89 | Single-player page |
| `game.js` | 1,692 | Single-player: rules, drawing, HUD and input in one closure |
| `multiplayer.html` | 63 | LAN page |
| `multiplayer.js` | 1,249 | LAN client: lobby, networking, drawing. Holds no rules |
| `server.js` | 1,128 | LAN server: the rules, the lobby API and a hand-written WebSocket |
| `styles.css` | 566 | Page styling for both modes |
| `package.json` | 9 | `npm start` runs `node server.js`. No dependencies |

## Running it

```bash
python3 -m http.server      # then open http://localhost:8000/index.html
node server.js [port]       # LAN mode, default port 8080
```

The server serves the LAN page at `/` and the drill at `/index.html`.

## Shared conventions

- Canvas coordinates: origin top-left, y down, units in pixels.
- Angles in radians, 0 along +x, increasing clockwise on screen.
- Port is heading − π/2. Starboard is heading + π/2.
- Every collision shape is a circle. Ships have radius 28.
- Keys: `W`/`S` or up/down for throttle, `A`/`D` or left/right to turn, `Q` fires port, `E` fires starboard. `Enter` starts or restarts the drill.

## Tuning: the two modes side by side

"Drill" is single-player (`game.js`). "Arena" is LAN multiplayer (`server.js`).

| Value | Drill | Arena |
| --- | --- | --- |
| World size | 1800 × 1200 | 3400 × 2200 |
| Time step | per frame, capped at 0.033 s | fixed 0.05 s |
| Hull | 180 (target ship 120) | 100 |
| Max speed | 205 | 248 |
| Reverse speed | 0.32 × max | 86 |
| Acceleration | 160 | 185 |
| Drag | speed × (1 − 0.58·dt) each step | speed × (1 − 0.48·dt) |
| Turn rate | 1.8 rad/s | 1.95 rad/s |
| Steering scale | 0.28 + min(1, \|speed\| / max) | 0.30 + min(1, \|speed\| / max) |
| Ammo | 12 | 12 |
| Shots per broadside | 1, or 3 after the upgrade | 1 |
| Broadside cooldown | 1.2 s plus a damage penalty | 0.9 s |
| Cooldown at start | port 0.2 s, starboard 0.8 s | 0 |
| Shot speed | 420 to 500 | 450 to 520 |
| Shot damage | 16 to 22 | 22 |
| Shot lifetime | 2.6 s | 2.7 s |
| Shot radius | 6 | 6 |
| Shot spread | ±0.03 rad, plus 0.1 rad per fan step | ±0.025 rad |
| Speed kept after a collision | 12% | 16% |
| Impact damage per unit speed | island 0.14, rock 0.18, reef 0.24 | same |
| Reef is fatal above speed | 150 | 165 |
| Collision damage ignored at or below | 4 | 4 |
| Collision damage lockout | 0.25 s | 0.25 s |
| Dock point distance from island centre | radius + 52 | radius + 54 |
| Dock ring radius | 58 | 62 |
| Reload retrigger | 0.75 s per island | 0.85 s per player |
| Subsystem damage | yes | no |
| Shots removed beyond the world edge by | 40 | 50 |
| Camera chase speed | 640 per second | 720 per second |

## Drill rules

Source: `game.js`.

**Setup** (`resetWorld`, line 294; layouts at line 30)

- One player ship against one anchored target, the "Training Hulk".
- Three fixed layouts: Needle Run, Split Channel, Broken Arc. Each sets the player start, the target, a home island, an upgrade island, three or four hazards and six buoys.
- A restart picks at random but never repeats the previous layout.
- Win when the target sinks. Lose when the player's hull reaches 0.

**Movement** (`controlShip`, line 758)

- Target speed is throttle × max speed going forward, or throttle × reverse speed going back.
- Speed moves toward the target at the acceleration rate, then drag is applied.
- Heading changes by turn × turn rate × steering scale × dt, so a slow ship turns slowly.
- The ship is clamped inside the world.
- With the engine subsystem at 0, max speed is × 0.42 and acceleration is × 0.56.

**Broadsides** (`fireBroadside`, line 550)

- A side fires only if its cooldown is 0, its subsystem is above 0, and there is ammo.
- Shots fired = the smaller of volley size and ammo left. Each shot costs one ammo.
- Shots leave from radius + 10 out the firing side. Fan positions are 0 for one shot, ±0.5 for two, and −1, 0, +1 for three. Each fan step shifts the muzzle 12 along the hull and the aim by 0.1 rad.
- The cooldown penalty is (100 − subsystem health) / 150, capped at 0.55 s.

**Projectiles** (`updateProjectiles`, line 969)

- They fly straight, and hit a ship of the other team when the circles overlap.
- Islands and hazards absorb them.

**Collisions** (`pushFromObstacle`, line 913)

- The ship is pushed out along the line between centres and keeps 12% of its speed.
- Damage is impact speed × the obstacle's scale, applied only if above 4.
- Hitting a reef above speed 150 deals 3 × max hull, which sinks the ship.
- After a collision, no further collision damage for 0.25 s.

**Damage** (`applyDamage`, line 652)

- Hull drops by the amount.
- 58% of the time one random subsystem (engine, port, starboard) also loses the amount × 0.7 to 1.15.
- Nothing in the reachable game repairs a subsystem, so that damage lasts the run.

**Islands** (`handleIslandInteractions`, line 524)

- A ship is "at the dock" when it is within dock ring radius + ship radius of the dock point.
- Home island: refills ammo if it is below full.
- Upgrade island: the first visit sets volley size to 3. One time only.

**Buoys** are visual only. Red is port, green is starboard, and they mark the safer lane.

**HUD** (`updateUI`, line 1064; `drawCompassAndHints`, line 1482; `drawMinimap`, line 1530)

- Captain card: a captain name picked from six, the layout name, target status, reload count
- Hull bar, and engine, port and starboard percentages
- Loadout: each side shows Ready, a cooldown in seconds, or Disabled; ammo; volley size; reload island; range to target
- Captain's log: the six latest messages, each shown for 6 s
- Sea chart: islands, hazards, buoys, target, player, and the camera's rectangle
- On the canvas: a compass with the ship's heading and a dot for the target's bearing
- A red flash and camera shake when the player takes damage

## Arena rules

Source: `server.js`. The server is the authority; the client only draws.

**Match**

- 2 to 8 players, every ship for itself. There are no teams.
- The last ship afloat wins (`checkWinner`, line 742). A match with one player never ends.
- The map is "Twin Relay" (`createMap`, line 97): two reload islands, eight hazards, eight spawn points handed out in join order.
- Either island reloads any ship.
- A shot hits any living ship except the one that fired it.
- There are no subsystems and no upgrade, so a broadside is always one shot.

**Each tick** (the interval at line 1090), every 50 ms

1. Each player in join order: cooldowns, movement, collisions, reload, then fire.
2. Projectiles.
3. Winner check.
4. Every client is sent the full state.

**Lobby** (`handleApi`, line 814)

- The host creates a lobby and sets the size; others join with a captain name of up to 18 characters.
- Only the host can start or close a match. Nobody can leave mid-match.
- The server holds one session at a time.

**Networking**

- The client sends its input 20 times a second over a WebSocket at `/ws`. Fire requests are latched until the next tick.
- State goes down as the full world in JSON every tick. There are no deltas.
- The client draws the latest snapshot with no interpolation or prediction.
- If the socket is down, the client falls back to polling `POST /api/sync` every 90 ms.
- A disconnected ship stays in the world with its input zeroed. The browser stores its player id and token, so a refresh rejoins the same ship.

## Unreachable code in `game.js`

This code is present but can't run in the drill. It is reference for later features, and matches the README's vision.

| Feature | Functions | Why it can't run |
| --- | --- | --- |
| Roaming enemies that turn to bring a broadside to bear and steer around hazards | `updateEnemies` (the non-stationary branch), `steerAroundThreats` | The only enemy created is stationary |
| Loot crates: repair, repair kit, powder, gun | `dropLoot`, `makeCrate`, `collectCrate`, `collectNearbyCrates`, `drawCrates` | Only non-stationary enemies drop crates |
| Rapid-fire deck gun on `Space` | `fireGun` | The gun only comes from a crate |
| Repair kits | `spendRepairKit` | Never called; no key is bound |
| Harbor docking: full repair at low speed | `dockAtHarbor`, `findNearbyHarbor` | Never called |
| Random hazard rings around islands | `addHazardRing` | Never called |

## Quirks not to copy

- `game.world` starts at 4600 × 3200 and is overwritten with 1800 × 1200 before play.
- `server.js` draws two separate random spreads for a shot's x and y velocity. Use one spread angle.
- The single-player win check runs in two places (`sinkShip` and `update`).
- The hand-written WebSocket framing and the HTTP fallback exist because the server has no dependencies. Nothing there needs porting.

## Look

Colours are set in the drawing functions in `game.js` (from line 1208).

| Element | Colour |
| --- | --- |
| Ocean gradient | `#0c3648` → `#0e465a` → `#0a2635` |
| Player ship | `#f4edd4` |
| Target ship | `#c95c3b` |
| Home and reload docks | `#7fd7d9` |
| Upgrade dock | `#f3d6a0` |
| Island sand | `#d8bb7d` → `#b48a52` → `#77512b` |
| Rock | `#5f6a74` with a `#7f8a91` highlight |
| Reef | `rgba(188, 87, 63, 0.82)` |
| Buoys | port `#d96a52`, starboard `#7ccf96` |
| Arena player colours | the `COLORS` list, `server.js` line 13 |

The ship is a six-point hull polygon with a deck rectangle and a diamond marker (`drawShip`, line 1420).
