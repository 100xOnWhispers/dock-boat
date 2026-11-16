# Roadmap

Five phases, in order. Phases 1 and 2 are detailed because they are next. Later phases are outlines: write their detail when the phase before is nearly done.

## Phase 1: Setup

Owner tasks are in `apple-distribution.md`. Tasks 1 to 5 below don't need them.

1. Move the web prototype into `prototype/web/` with `git mv`: `index.html`, `game.js`, `styles.css`, `multiplayer.html`, `multiplayer.js`, `server.js`, `package.json`. Then run `node server.js` from there and check both pages load. `server.js` serves files relative to its own folder, so no code change is expected.
2. Add a `.gitignore` covering `.DS_Store`, `.build/`, `DerivedData/`, `xcuserdata/`, `node_modules/`, and `*.xcodeproj` if the project is generated.
3. Ask the owner whether `codexcheckpoint.txt` can go. It is a leftover session pointer from another tool.
4. Rewrite the root `README.md` for Dock Boat. Keep the "Game Description" text; move the prototype's run instructions to `prototype/web/README.md`.
5. Create `Packages/DockBoatCore` with an empty library and one passing test.
6. Once Xcode is installed and O-4 is answered: create the app target for macOS and iOS, showing an empty ocean scene.

Done when:

- the prototype runs from `prototype/web/`
- `swift build` and `swift test` pass for `DockBoatCore`
- `xcodebuild` builds the app with no warnings and it opens a window on the Mac

## Phase 2: Mac single-player

Port the gunnery drill to match the prototype. Rules and numbers are in `prototype-reference.md`.

Core, in this order, each with tests:

1. Math helpers and model types
2. Ship movement
3. Collisions with islands, rocks and reefs
4. Broadsides and projectiles
5. Hull damage and subsystem damage
6. Islands: reload at home, one-time upgrade
7. Win and lose, the three layouts, and a restart that never repeats the last layout

App:

8. Scene: ocean, islands and docks, hazards, buoys, ships, projectiles, camera, hit and wake effects
9. HUD: hull and systems, loadout, captain's log, sea chart, compass with target bearing
10. Keyboard input, and the start and restart flow

Leave out the prototype's unreachable code: roaming enemies, loot crates, the deck gun, repair kits and harbor docking. It is listed in `prototype-reference.md` as material for later features.

Done when:

- all three layouts can be played to a win and to a loss on the Mac with the keyboard
- every rule under "Drill rules" in `prototype-reference.md` has a passing core test
- the owner has played it beside the prototype and agrees the handling matches
- it holds 60 fps on the owner's Mac
- no game rule lives outside `DockBoatCore`

## Phase 3: iPhone and iPad

- Build and run the same target on iOS and iPadOS.
- Design and build touch controls. The prototype is keyboard-only, so this is new design work: propose it to the owner before building.
- Add game controller support on all three platforms.
- Lay out the HUD for small screens, safe areas and landscape.
- Pause when the app goes to the background.

Done when the drill can be completed on an iPhone and an iPad by touch alone, and on every platform with a controller.

## Phase 4: Multiplayer

- Settle O-6 first.
- Add the arena rules as a `Tuning` preset, the "Twin Relay" map, and last-ship-afloat scoring.
- Game Center sign-in, matchmaking and a real-time match.
- Send inputs to the host and snapshots back; interpolate on the clients.
- Handle a player dropping out and coming back. In the prototype a disconnected ship stays in the world with its input zeroed, and a returning player gets the same ship.

Done when several devices can play a full match found through Game Center, from lobby to winner.

## Phase 5: Release

- Settle O-2 and O-3 first.
- Art, sound and polish. The prototype's visuals are placeholders, and Arcade is selective.
- TestFlight builds for invited testers.
- By default (O-3): pitch Apple Arcade while the game is unreleased. If Apple declines, submit to the App Store.

## Unscheduled

These have no phase yet. The owner decides where they go.

- Features the owner has mentioned but not specified (O-8)
- The rest of the README vision: a navigation campaign, crews, fleets, loot and rare weapons
