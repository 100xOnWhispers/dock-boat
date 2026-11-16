# Status

Last updated: 2026-11-16

## Where we are

Planning is complete. Phase 1 (Setup) has not started, and no native code exists.

## Next actions

None of these need the owner:

1. Phase 1, tasks 1 to 5 in `roadmap.md`: move the prototype into `prototype/web/`, add a `.gitignore`, rewrite the README, scaffold `DockBoatCore`.
2. Phase 2, tasks 1 to 7: port the rules into `DockBoatCore` with tests. This needs only `swift build` and `swift test`, which work today.

The app target and everything visual wait for Xcode.

## Waiting on the owner

| Item | What it blocks |
| --- | --- |
| Install Xcode | Building or running the app. Only the Command Line Tools are installed |
| Enrol in the Apple Developer Program | TestFlight, Game Center, App Store submission |
| Bundle identifier and team (O-4) | Creating the app target |
| Confirm "Dock Boat" is available as an app name | Committing to the name in the store |
| O-1 and O-3 in `decisions.md` | Nothing yet; the plan runs on their defaults |
| Whether `codexcheckpoint.txt` can be deleted | Nothing; it is clutter |

## The owner's Mac, as of 2026-11-16

- macOS 26.6.2 on Apple Silicon
- Swift 6.4 from the Command Line Tools. Xcode is not installed
- Node 26.10.0, which runs the prototype's LAN server

## Log

Add a line per working session, newest first.

- 2026-11-16: Plan agreed with the owner and written up in `docs/`. The prototype's uncommitted LAN multiplayer work was committed as a snapshot. Remote set to `100xOnWhispers/dock-boat`.
