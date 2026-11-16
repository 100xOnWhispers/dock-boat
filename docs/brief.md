# Brief

## Goal

Ship Dock Boat as a native game on Mac, iPhone and iPad, offer it on the App Store, and put it forward for Apple Arcade.

## The game

Top-down naval combat on an open ocean. You steer a warship, fire broadsides from either side, watch the cannonballs fly, steer clear of rocks and reefs, and visit islands to reload and upgrade.

The full design vision is in the "Game Description" section of the root `README.md`: crews, loot, rare weapons, fleets, a navigation campaign and arena multiplayer. Treat it as direction, not as a spec. Only what the prototype actually implements is in scope until the owner schedules more.

## What exists

A web prototype in plain HTML, CSS and JavaScript, with two modes:

- a single-player gunnery drill
- a LAN battle for up to 8 players, run by a small Node server

`prototype-reference.md` documents both.

## Name

The app is **Dock Boat**. "The Battles" is the prototype's old name and survives only inside the prototype files. Use `DockBoat` in code and `dock-boat` for the repo.

## Order of work

1. Setup
2. Mac app, single-player
3. iPhone and iPad on the same codebase
4. Multiplayer on Apple's networking
5. Release

`roadmap.md` has the detail.

## Not yet specified

The owner has said more features are coming but has not listed them. Don't guess at them. Ask.
