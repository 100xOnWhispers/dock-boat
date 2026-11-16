# Apple distribution notes

## Checked against Apple's site on 2026-11-16

Source: `developer.apple.com/apple-arcade`. Re-check before acting on any of it.

- Apple invites developers to put forward **unreleased** games for Arcade. The route is a contact form that needs an Apple ID sign-in, so its contents have not been read.
- Arcade games reach subscribers with no ads and no in-app purchases.
- The Arcade catalogue is playable on iPhone, iPad, Mac, Apple TV and Apple Vision Pro.
- The page lists no technical requirements for developers.

What follows for this project:

- The Arcade pitch has to come before a public release. See O-3 in `decisions.md`.
- Don't build ads or in-app purchases while Arcade is the goal.

## Assumed, not confirmed

These are commonly said about Arcade but are not on the public page. Confirm them with Apple before relying on them.

- The game must run on several Apple platforms, possibly including Apple TV.
- Game Center integration is expected.
- Game controller support is expected.
- Apple asks for some form of exclusivity.

The plan hedges against all four: controller-first input, rules in a platform-neutral package, Game Center for multiplayer, and no third-party SDKs.

Whether a public TestFlight link counts as "released" is also unknown. Keep testing to invited testers until Apple says.

## Owner tasks

Only the owner can do these.

1. Install Xcode from the Mac App Store, then run `sudo xcode-select -s /Applications/Xcode.app` and accept the licence.
2. Enrol in the Apple Developer Program (US$99 a year at the time of writing).
3. Choose the bundle identifier and team (O-4).
4. Check that "Dock Boat" is available as an app name in App Store Connect, and do a trademark search. App names must be unique on the App Store.
5. Sign in to the Arcade contact form and record what it asks for in this file.

## For the release phase

Each of these needs work before submission:

- app icon and screenshots for each device class
- privacy details and age rating in App Store Connect
- TestFlight builds for testers
- a Game Center configuration, if multiplayer ships
