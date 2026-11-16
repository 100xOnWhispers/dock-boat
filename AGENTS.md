# Dock Boat — start here

Dock Boat is a top-down naval combat game. Today it exists as a web prototype, built under the name "The Battles". It is being rewritten as a native Apple app: macOS first, then iPhone and iPad, then the App Store and an Apple Arcade pitch.

No native code exists yet. This repo holds the web prototype and the plan.

## Read in this order

1. `docs/STATUS.md` — where the work stands and what to do next. Read it first and update it before you stop.
2. `docs/brief.md` — what we are building.
3. `docs/decisions.md` — what is settled and what is still the owner's call.
4. `docs/architecture.md` — the target design and repo layout.
5. `docs/roadmap.md` — the phases, their tasks, and how to tell each one is done.
6. `docs/prototype-reference.md` — the prototype's rules and tuning values. Read when porting.
7. `docs/apple-distribution.md` — App Store and Arcade notes. Read when working on signing or release.

## Working rules

- **The prototype is a reference, not the product.** Don't add features to the JavaScript files.
- **Port the feel before changing it.** Copy tuning values from the prototype as they are. Change them only when the owner asks.
- **Game rules live in `DockBoatCore`.** That package must not import SpriteKit, SwiftUI, AppKit, UIKit or GameKit.
- **Open decisions belong to the owner.** `docs/decisions.md` gives each a default that the plan assumes. Work to the default, and ask before doing anything that would be costly to undo if the owner chooses otherwise.
- **Keep the docs true.** Add new decisions to `docs/decisions.md`. If a doc is wrong, fix the doc.
- **Commit as `100xOnWhispers` with no email.** The repo is public and the owner doesn't want an email address in its history. In a fresh clone, run `git config user.name 100xOnWhispers` and `git config user.email ""` before the first commit.
- **Never commit** signing certificates, provisioning profiles, private keys or API keys.
- Some steps need the owner's Apple ID and can't be done by an agent. `docs/STATUS.md` lists them.
