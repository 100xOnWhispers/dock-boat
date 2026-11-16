# Decisions

Add new entries at the end of each section. Don't rewrite old ones: if a decision is reversed, add an entry that says so.

## Settled

### D-1 Native rewrite, not a web wrapper (2026-11-16)

Rewrite the game in Swift with SpriteKit. Don't wrap the web prototype in a web view.

Why:

- Apple Arcade is curated and pitched to Apple. A web view in an app shell is a weak candidate.
- An App Store app can't ship the Node LAN server, so multiplayer has to be rebuilt either way.
- The port is small: about 4,000 lines of JavaScript, with graphics drawn in code and no art assets to convert.

Rejected: wrapping the web game in `WKWebView`. It would reach a first Mac build sooner and keep the browser version alive, but it is a dead end for Arcade and leaves multiplayer unsolved.

### D-2 One multiplatform codebase, Mac first (2026-11-16)

A single Xcode project builds the Mac, iPhone and iPad apps. The Mac app comes first.

### D-3 The app is named "Dock Boat" (2026-11-16)

It replaces "The Battles".

### D-4 Game rules live in a shared Swift package (2026-11-16)

Rules are kept apart from rendering and input, so single-player, multiplayer and every platform run the same simulation.

### D-5 Multiplayer moves to Game Center (2026-11-16)

This sets the direction only. How matches are hosted is O-6.

## Open: the owner's call

Each has a default that the roadmap assumes. The owner was asked O-1 and O-2 on 2026-11-16 and has not answered yet.

### O-1 Does the browser version stay alive?

Default: no. It is frozen as a read-only reference in `prototype/web/`.

If it stays alive, it needs the rename applied and its rules kept in step with the Swift version by hand.

### O-2 Does the first release include online multiplayer?

No default. The roadmap lists multiplayer (Phase 4) before release (Phase 5), as shown to the owner. Nothing before Phase 4 depends on the answer, so ask when Phase 3 is nearly done.

### O-3 Arcade pitch before any public release, or App Store first?

Default: pitch Arcade first, while the game is unreleased. If Apple declines, release on the App Store.

Apple's Arcade page asks for unreleased games (see `apple-distribution.md`). The plan first shown to the owner had the App Store release before the pitch; that order was changed after reading Apple's page, and the owner has not yet confirmed the change.

### O-4 Bundle identifier, developer team and Apple ID

No default. Needed before the app target is created.

### O-5 Apple TV and Vision Pro

Default: out of scope. Input is designed controller-first so that adding tvOS later stays cheap.

The Arcade catalogue runs on both. Whether Apple requires them is not confirmed.

### O-6 How multiplayer matches are hosted

Default: one player's device runs the simulation and is the authority, over a Game Center real-time match. This mirrors what `server.js` does today.

The alternative is a dedicated server. Decide at the start of Phase 4.

### O-7 Minimum OS versions

Default: the current major release of each OS and the one before it.

### O-8 New features, art direction and audio

Not specified. The owner has said more features are coming.
