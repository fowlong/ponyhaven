# Ponyhaven verification

## Automated game rules

`npm test` — 24 passing tests covering:

- Catalog IDs, sprite/effect paths, card files, set pools and playable-card exclusions.
- Exactly one Mane 6 starter; preservation of early preview saves.
- Deterministic shared daily stock, all-series coverage, and no previous-day pack repeat across 366 days.
- Pack cards staying in their exact pool, duplicate handling, awards before reveals, and interruption recovery.
- Prices, insufficient funds, stale stock, single-card daily limits, caster unlocks and daily gifts.
- Unlimited pet switching, deduplicated rarity variants, and separate pony care/XP records.
- One saved UR-or-higher gift per level, without awarding a milestone twice after reload.
- A 10,000-pack seeded distribution check for the 20% ordinary pet roll; guaranteed matching tier 6/7 pets.
- Food, energy, wellbeing, dirt, brushing, bath ticks, happiness contributions and care cooldowns.
- Twenty-minute NPC visits and one-hour invitation cooldowns across reloads.
- Tetris bags, collision, rotation, hold, pause, ghost landing, top-out, multi-line clears, combos and rewards.
- Background curation completeness, permitted assets, and source-floor/scale projection across desktop, tablet and narrow phone crops, including body clearance at walking limits.

## Browser checks

`npm run test:browser` and `npm run test:care` use separate headless Chrome profiles. They do not alter the user's normal browser save.

Main flows include starter selection, feeding, daily gifts, reload persistence, interrupted packs, shop purchases, card search/filters/details, keyboard/touch block controls, uploaded background persistence, preferences and motion settings.

Expanded flows include pixel dirt, alpha-based pointer collision while bathing, brushing, sleep poses, ten-second transformations, removal of cameos, NPC friendship and XP, background arrows, level gift reveals, unrestricted pony switching, card tier effects, block-play XP, sound settings, and account reset with a local backup.

Layout assertions cover 390 × 844, 320 × 740 and 844 × 390. The block board and touch controls fit above navigation; landscape pause controls are checked visually. Gentle motion retains static rarity cues and still versions of animation poses. Native iPhone/Safari and Android hardware have not been tested.

Screenshots from the current checks are kept locally in `tmp/qa` (excluded from Git). Catalog image validation decoded all 3,197 card images and 124 imported backgrounds without errors.

All 125 original background choices were captured with a standing Rarity pet at 1440 × 1000 and 390 × 844 and visually reviewed. After adjusting image anchoring, source floor positions, pony scales, camera focus and walking lanes, a second complete pass reviewed 56 candidates. Four more scenes were removed for foreground obstacles or unsuitable scale, leaving 52 defaults (the original meadow plus 51 imported scenes). Contact sheets and individual captures are in `tmp/background-review-before` and `tmp/background-review-after`. The permanent review manifest prevents excluded or unreviewed images from re-entering on import. The original default meadow's walking lane also stops before its river. Uploaded custom art uses a generic foreground placement because its contents have not been reviewed.

A third pass put the actual pet and an NPC at opposite walking endpoints in all 52 retained scenes. Browser assertions verify matching scales, both sets of feet on the projected floor, and no clipped sprites. Visual endpoint review tightened 17 lanes to avoid rocks, barrels, bushes and furniture at their edges. These captures are in `tmp/background-review-limits` and the corrected subset in `tmp/background-review-refined`.

`npm run test:backgrounds` captures the current scenery list; `BACKGROUND_EDGES=true` adds endpoint probes with an NPC. `npm run test:walking` drives real left/right exploration and play laps at desktop, 390px and 320px, checking direction, floor contact and lane limits. `node scripts/qa-large-pets.mjs` checks Celestia and Steven Magnet for clipping and aspect-ratio preservation at the same screen sizes. Scene margins account for the widest visiting sprite as well as the current pet.

## Local Firebase integration

`npm run test:cloud` connects **only** to the local demo project `demo-ponyhaven`, Auth port 19099 and Firestore port 18080. It never targets a real project. It expects the game running in emulator mode on port 5175 (or `QA_URL`).

Verified with Firebase emulators:

- Owner-created password accounts can sign in; an uninvited account is refused.
- Each account has a separate cloud save and wallet that persist after reload.
- Clients cannot edit the allowlist, read/write another account's save, skip save revisions, enumerate room codes, or change another host's room background.
- Anonymous and uninvited clients cannot read online presence.
- Two browser contexts see online friends, send and accept invitations, join by code, and appear together.
- Host-selected built-in and uploaded backgrounds propagate to the visitor.
- Closing a room removes the visitor from it and restores their own background controls.

To repeat these checks, install Firebase CLI locally, provide Java 21+, start `firebase emulators:start --project demo-ponyhaven --only auth,firestore --config firebase.test.json`, and run `node scripts/qa-sync-server.mjs`. The test-only `.env.emulator.local` uses dummy public identifiers and `VITE_USE_EMULATORS=true`; the emulator connection is additionally guarded by Vite's development flag. The file is ignored by Git. Example values are described in the test script and can be recreated for another checkout.

The local account manager's help and official Admin SDK integration paths have been checked. Its password prompts and mutations against the owner's real project require that project's private local Admin key.

## Desktop and phone progress sync

`npm run test:sync` passed against the real local Auth and Firestore emulators, two isolated Chrome contexts, and the real desktop `Profiles` file implementation. The narrow browser IPC adapter substitutes for Electron; it does not substitute the save logic or Firestore rules.

- An existing desktop starter uploads on first link to an invited account.
- The phone signs in and exposes Meadow, Magic Blocks, Little shop and Collection.
- Purchases clear stale collection preview filters; new cards appear in the phone binder and in an already-open desktop binder, with matching quantities on disk.
- The phone keeps playing while the desktop window is closed; reopening desktop loads the latest save.
- Competing offline desktop and online phone changes preserve a recovery copy, show the conflict controls, and never roll back the newer cloud revision.
- Account reset propagates across devices while preserving the invitation, sync link and desktop activation; reloading keeps authentication.

The Firebase rules in `FIREBASE_CONSOLE_SETUP.txt` are generated directly from the tested `firestore.rules` file. The owner has configured project `mlp4kt` and supplied its four public Web app values in the ignored `.env.local`. Production account sign-in still needs the real-account acceptance check; no password or Admin key was provided to the development agent.

## Desktop profiles and native games

`npm run test:desktop` passes six tests: internal reloads versus blocked external navigation, Gumroad product/status checks using injected provider responses, persistent and isolated profile files, map import validation, imported-pack checksums, and a real two-way loopback UDP exchange. These complement the three arcade reward tests in `npm test`.

Version 0.2.1 fixes an Electron navigation guard that blocked the renderer's own refresh after activation, profile changes and sync sign-in. `node scripts/qa-activation.mjs` checks empty-form validation, visible activation progress, a failed request and retry, successful activation using `charris`, starter selection and saved activation on reload. It uses a simulated provider and real profile files in a disposable folder; the actual Electron shell still needs an ordinary-user smoke check.

`node scripts/qa-mobile-blocks.mjs` verifies the companion's four tabs, touch movement/rotation/drop/hold, pony XP persistence, and board/control fit at 390 × 844, 320 × 740 and 844 × 390. The portrait and landscape screenshots were reviewed. This targeted check uses an isolated local save; the existing save/sync implementation is shared with desktop Magic Blocks.

`node scripts/qa-desktop-browser.mjs --network` exercises activation screens, profile rename/reload/switching, native launch/progress/stop, and pastel preferences using the real desktop modules. Two Chrome clients use a local PeerServer and WebRTC to share a meadow, follow the host's background, and connect two actual native engines in both Adventure and Ponykart. `npm run test:native-network` separately verifies two players and advancing simulation time through the UDP bridge. Music decoders are enabled in these network tests, with SDL's dummy audio output.

`python scripts/qa-native-gameplay.py` uses a QA-only native addon to collect an actual fresh ring, recollect a dropped ring, and finish a course. It checks that only the fresh ring pays and completion reaches the launcher. The addon is not distributed.

`python scripts/qa-native.py --roster --courses` loads and captures native previews of the seven Adventure and six Ponykart characters, original/pastel scenery, and all 19 Adventure and 60 Ponykart courses in the launcher. This checks course loading and rendering, not full playthroughs. Screenshots and course-review contact sheets are under `tmp/native-qa`. Original course unlock requirements are removed for the explicit launcher list; music, sky, lap counts and gameplay headers are retained.

Playable default characters and title/pause/result screens are replaced. Named Sonic/Eggman branding textures are replaced with simple star artwork. The original level layouts and ordinary scenery remain. Start-area previews do not establish that every incidental branded detail in every part of every original level has been removed.

The actual Electron smoke test is `node scripts/qa-desktop.mjs`. This agent's restricted Windows token prevents Electron's sandbox children from reading its installed runtime (`icudtl.dat` access check), before the app UI opens. Renderer tests therefore used Chrome with the real desktop modules. Run the Electron check from an ordinary terminal, then test a real invitation key before sharing. The production renderer sandbox remains enabled. No real Gumroad key or cross-home-network WebRTC connection was tested; restrictive networks may need a TURN relay, which is not included.

## Deployment boundary

The production build is checked locally, including serving under a `/ponyhaven/` subpath. Firebase's public `mlp4kt` configuration is present. The source publisher prepares an audited checkout and configures GitHub Pages through the owner's GitHub CLI sign-in; deployment is only complete when its Actions run succeeds. Follow [MOBILE_SYNC_SETUP.md](MOBILE_SYNC_SETUP.md) or [GITHUB_PUBLISHING.txt](GITHUB_PUBLISHING.txt), then repeat the real-account verification checklist. Emulator checks do not establish that live project settings are correct.
