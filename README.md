# Web app Game

the game has two modes

1) single player (local mode)
2) multiplayer battle royal (but teams are possible) - more of an online setup, which we will build after the first mode is developed and tested.

# Game Description

Game Concept Description — The Battles

The Battles is a top-down naval combat game designed to run as a web application. The game takes place on a large ocean map where players control and crew navy warships. The core experience combines exploration, ship combat, teamwork, and collecting rare weapons while competing against other players or computer-controlled ships.

Players interact with the game from a top-down perspective, looking down at ships sailing across a large ocean environment. The world consists of open water populated with islands and hazards that ships must navigate around. These elements shape the battlefield and influence navigation, positioning, and strategy during gameplay.

The core combat mechanic centers around ship cannons. Every ship begins with standard cannons, which act as the primary weapon. When fired, cannonballs travel visibly across the water, allowing players to observe projectile movement and maneuver their ship to avoid incoming fire. Ships can take structural damage during battle, and individual systems such as cannons may also become damaged or temporarily disabled, reducing combat effectiveness until repaired.

The game includes a system of loot and rare weapons. When ships are destroyed or when players explore islands, they may discover crates or equipment floating in the water or located at docking points. These items can provide repairs, upgrades, or rare weapons that significantly change combat behavior. One example is a gun weapon, considered a rare close-range weapon that fires rapidly compared to standard cannons. Multiple rare weapon types may exist in the world and can be collected and used during a match.

The game supports several gameplay modes.

One mode is a crew-based multiplayer mode, where several players work together to operate a single warship. Each player represents a crew member responsible for different ship functions such as steering, firing weapons, repairing damage, or operating special equipment. This structure encourages coordination between players and makes ship performance dependent on teamwork.

Another mode functions as a shared arena environment in which many players connect to the same server and compete within a large ocean battlefield. Ships controlled by players or teams move across the map, encounter each other, and engage in naval combat while searching for weapons and resources. Islands throughout the arena may contain docked empty ships, weapons, or supplies. Teams that reach these islands may be able to claim additional ships and expand their fleet during the match.

In addition to multiplayer gameplay, the game includes a single-player campaign mode focused on navigation and survival. In this mode the player must steer a ship through dangerous waters while avoiding environmental hazards. Maps contain obstacles that appear scattered throughout the ocean, such as rocks, reefs, or other hazards. These obstacles may be placed in ways that appear random across the map. Colliding with these hazards can cause severe damage or immediately sink the ship, requiring careful steering and attention to the environment. The campaign mode emphasizes navigation skill and obstacle avoidance rather than direct combat.

Across all modes, the world is designed as a large navigable ocean space populated with ships, islands, hazards, and collectible objects. Ships move continuously across the water, navigating around islands and obstacles while engaging enemies or searching for resources. Destroyed ships may drop loot that other players can collect by sailing over it.

Players can create a player profile with a chosen name and potentially visual customization such as ship colors or flags. The overarching goal of the game is to explore the ocean, collect stronger weapons, upgrade ship capabilities, expand fleets, and defeat enemy ships to become the most powerful force on the sea.

The first implementation should focus on establishing the foundational gameplay loop of ship movement, navigation, combat with visible projectiles, environmental hazards, exploration, and weapon collection, while leaving room for future expansion such as additional ship types, new weapons, deeper crew mechanics, and expanded multiplayer systems.

## Current prototypes

This repo now has two playable web modes built with plain HTML, CSS, JavaScript, and a small Node server for LAN play.

### 1. Single-player drill

The original test scene is still available at `index.html`.

Implemented:

- keyboard-only ship controls
- one stationary opponent ship as the target
- randomized drill layouts on each restart
- rocks and reefs that damage your ship on collision
- lane markers that show a safer route through hazards
- home island ammo reloads when touched
- upgrade island that unlocks triple-shot broadsides
- visible cannonballs and ship hull damage
- starting broadsides fire one shot instead of three
- minimap, captain log, and ship status HUD

Controls:

- `W` / `S` or `Up` / `Down`: throttle forward / reverse
- `A` / `D` or `Left` / `Right`: turn
- `Q` / `E`: fire port / starboard broadside
- `Enter`: start or restart

Quick run:

```bash
python3 -m http.server
```

Then open `http://localhost:8000/index.html`.

### 2. LAN multiplayer prototype

The main app is now a LAN multiplayer battle page served by `server.js`.

Implemented:

- host-created lobby with configurable max player count
- other devices on the same local network can join by IP and port
- larger multiplayer map named `Twin Relay`
- two community reload islands that instantly refill ammo for any ship
- faster ship movement than the single-player drill
- server-authoritative ship movement, cannon fire, collisions, and win state
- WebSocket transport for live multiplayer updates
- reconnect support if a player refreshes the browser during the same session
- keyboard-only controls, HUD, captain log, and minimap
- root URL `/` serves the multiplayer page
- single-player drill remains available at `/index.html`

### Hosting the LAN server

Requirements:

- Node.js installed on the host machine
- all players on the same local network

Start the server from the repo root:

```bash
npm start
```

Or without npm:

```bash
node server.js
```

Default address:

- local machine: `http://localhost:8080`
- other devices: use the `LAN URL` printed in the terminal, for example `http://192.168.1.181:8080`

If you want a different port:

```bash
node server.js 9000
```

Then other devices would join with `http://<host-lan-ip>:9000`.

If your OS asks whether Node is allowed to accept incoming network connections, allow it for your local network. Otherwise other devices will not be able to connect.

### Multiplayer flow

1. On the host machine, run `node server.js` or `npm start`.
2. Open the printed URL in a browser on the host machine.
3. Create the lobby and set the max number of players.
4. On other devices, open the same LAN URL shown in the host terminal.
5. Each player joins with a captain name.
6. The host starts the match once everyone is in.

### Multiplayer controls

- `W` / `S` or `Up` / `Down`: throttle forward / reverse
- `A` / `D` or `Left` / `Right`: turn
- `Q` / `E`: fire port / starboard broadside
- sail into either teal dock ring to reload ammunition instantly

### Notes

- gameplay state now streams over WebSockets on the same port as the HTTP server
- if a browser cannot get live WebSocket state yet, the client falls back to HTTP session/sync requests so the match still loads
- if a player refreshes the same browser on the same device, the client will try to reconnect to the same ship automatically while that session still exists
- it is intended for a local network, not internet deployment
- the server keeps one active session at a time
