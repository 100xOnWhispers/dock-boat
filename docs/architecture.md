# Architecture

This is the target design. None of it is built yet. Choices marked "recommended" are the planner's suggestion and can be revisited; the rest follow from `decisions.md`.

## Repo layout

```
dock-boat/
├── AGENTS.md  CLAUDE.md  README.md
├── docs/
├── prototype/web/          the JavaScript prototype, moved here in Phase 1, read-only
├── project.yml             Xcode project spec (recommended, see Tooling)
├── DockBoat/               one app target for macOS, iOS and iPadOS
│   ├── App/                SwiftUI entry point, menus, settings
│   ├── Scene/              SpriteKit scene and node builders
│   ├── Input/              keyboard, controller and touch
│   └── HUD/                status, loadout, log and sea chart overlays
└── Packages/
    └── DockBoatCore/       game rules and their tests, pure Swift
```

## Three layers

| Layer | Job | May import |
| --- | --- | --- |
| `DockBoatCore` | Owns all game state and rules | Foundation only |
| Scene and HUD | Draws a snapshot of the world each frame; plays effects and sound | SpriteKit, SwiftUI |
| Input | Turns keyboard, controller and touch into one `ShipInput` value | GameController, SwiftUI |

Data flows one way: input → `World.step` → snapshot and events → scene and HUD. Presentation never changes game state.

## DockBoatCore

Main types:

- `World`: map size, ships, projectiles, islands, hazards, buoys, clock
- `ShipInput`: throttle −1…1, turn −1…1, fire port, fire starboard
- `Tuning`: every number that differs between the prototype's two modes, with a `.drill` and an `.arena` preset
- `World.step(inputs:dt:)`: advances the world one tick and returns the events it produced
- `GameEvent`: shot fired, hit, collision, ship sunk, reloaded, upgrade claimed, log line

Rules for the package:

- **One implementation of the rules.** The prototype has two copies, in `game.js` and `server.js`, that have drifted apart. Their differences become `Tuning` values (see the table in `prototype-reference.md`).
- **Fixed timestep.** Step at 60 Hz from an accumulator in the scene's update loop. The prototype steps per frame in single-player and at 20 Hz on the server.
- **Injected randomness.** `step` takes a `RandomNumberGenerator`, so tests can seed it. The prototype calls `Math.random()` directly.
- **Fire is an input, not a side effect.** The prototype's single-player mode fires from the key handler. In the core, fire requests are latched in `ShipInput` and handled inside `step`, as `server.js` does.
- **Effects stay out.** Particles, camera shake and the damage flash are presentation. The core only emits the events that trigger them.
- **Value types, `Codable` and `Sendable`.** Snapshots will need to cross the network in Phase 4.

## Coordinates

Keep the prototype's convention inside the core so layouts and tuning port unchanged:

- origin at the top-left, y pointing down, units in prototype pixels
- angles in radians, 0 pointing along +x, increasing clockwise on screen
- port is heading − π/2, starboard is heading + π/2

SpriteKit's y axis points up. Convert in exactly one place in the scene layer: flip y against the world height and negate angles.

## Scene and HUD

- A SpriteKit `SKScene` hosted in SwiftUI with `SpriteView`, with an `SKCameraNode` following the player's ship.
- Start with shape nodes that match the prototype's drawing code, so the port needs no art. Real art replaces them in Phase 5.
- HUD panels and menus are SwiftUI overlays. The prototype's dashboard sits below the canvas as a web page and won't fit a phone, so the HUD needs a compact layout in Phase 3.

## Input

One protocol produces a `ShipInput` each tick. Recommended sources:

- **Keyboard and controllers**: the GameController framework (`GCKeyboard`, `GCController`). Both can be polled each tick on Mac and iPad, which matches how the prototype reads its set of held keys. Check `GCKeyboard` behaviour in the installed SDK before committing to it. The fallback is AppKit and UIKit key events.
- **Touch**: on-screen controls, designed in Phase 3.

Design every action so a controller can do it. That keeps Apple TV possible (O-5).

## Multiplayer

Outline only; detail comes in Phase 4.

- The host device runs `World.step` and is the authority. Other players send `ShipInput` and receive snapshots. This is the same shape as `server.js`: inputs up, full state down.
- The prototype client draws the latest snapshot with no interpolation. The native client should interpolate between snapshots.
- The lobby maps to Game Center matchmaking.

## Tooling

Recommended:

- **XcodeGen** to generate the Xcode project from `project.yml`, so targets and settings are plain text an agent can edit, and the `.xcodeproj` stays out of git. If it doesn't work with the installed Xcode, have the owner create the project in Xcode once and commit it.
- **Swift Testing** for the core's tests.
- No third-party runtime dependencies.

Commands:

```bash
swift build --package-path Packages/DockBoatCore
swift test  --package-path Packages/DockBoatCore
xcodebuild -scheme DockBoat -destination 'platform=macOS' build   # needs Xcode
```

The first two were checked on the owner's Mac with only the Command Line Tools installed, using a throwaway package: both work, with tests written in Swift Testing. XCTest was not checked.

## Testing

Every rule in `prototype-reference.md` gets a core test with a seeded generator. Presentation is checked by running the app.
