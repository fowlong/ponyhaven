# Ponyhaven verification

## Current 0.3.0 revision — adaptive scenery, saves and combat

This section supersedes earlier smoothing and scenery records below. NoCube is
disabled, terrain damage resets on each host/solo launch, and live draw distance
controls each player's bounded scenery selection. Two/four-node horizontal tiers
retain exact vertical intervals. Each of 13,720 compressed meshes has verified
bytes/SHA-1 and a non-rendering anchor bound. Shader pixel tests cover unloaded
terrain coverage, voxel priority in both draw orders, scenery depth, fog and
walking/orbit/altitude/teleport translations; maximum measured coordinate drift
was 0.000111 nodes. Source-versus-proxy geometry diagnostics were visually checked.

Native Luanti checks pass for all eight pony directions, swimming, unlimited
flight, book HUD/controller cycling, quest markers/tracking, disabled smoothing,
123-voxel basic destruction without drops, all fourteen spells, three-hit melee,
enemy/boss health bars, attack warnings and boss pet rewards. Three actual world
launches check Canterlot, walking and Cloudsdale scenery anchors, procedural
music events, retained quests/books, new-save isolation and restored terrain.

Pony-specific create/load/delete UI and legacy migration passed with actual
profile files. Two real clients tested invite codes, separate rewards, reconnect
and different live draw ranges (128/512). Eight-direction sprite pixel checks,
controller binding conflicts, local media and view-range packet tests pass.

The virtual-pet audit composited 43,969 GIF frames across 311 ponies, 1,991
behaviours and 2,617 unique assets. Twenty-five unsafe behaviours now use idle.
Browser checks passed at 1440/390/320 widths, including Rarity and unsafe
Twilight/Fluttershy/Silver Spoon cases. Sprite source and dimensions commit
together after decoding to prevent a temporary canvas-size mismatch.

Physical DualSense operation, subjective camera/combat feel, performance on
low-end hardware and cross-household network latency are not hardware-tested.
Terrain Kuwahara filtering is texture-space and does not filter sprites.
Procedural audio uses original synthesized samples and a native Lua composer;
lofigen code/samples are not redistributed because upstream has no licence.

Earlier records below describe previous revisions and their checks.

Final native OpenGL checks reached Cloudsdale after teleport at both 512 and
128 draw distance. The selections were 184 tiles / 1,017,284 triangles and
42 tiles / 308,602 triangles respectively. Both converged, with zero smoothing
calls, all shader overrides loaded and no renderer errors. Five-second profiler
windows recorded roughly 290–300 rendered frames on this machine. The 128 check
used the packaged runtime and a fresh media cache, reusing a verified local
service for the identical build. This is not a low-end hardware benchmark.
The final two-client save/menu, invite-code, rewards and reconnect run also passed.

## 0.3.0 Unlimited flight and spellbook bar — 23 October 2026

Seven targeted geometry/asset tests pass, including consistent texture projection
across coplanar bevel triangles. The real Luanti combat test exercises two minutes
of simulated movement time for each of Fluttershy, Derpy and Luna without flight
expiring, then verifies that water switches to swimming. It checks all seven HUD
slots through locked, collected, equipped, switched and put-away states, including
replayed key events. Existing quest, destruction, remeshing, spell and boss checks
also pass. The server exports the actual HUD definitions for layout inspection.
The book bar's exported layout and existing Wyrda icons were rendered, checked
for bounds and visually reviewed at 800px and 640px. This is a layout diagnostic,
not a native gameplay screenshot.

The earlier multiplayer and Firebase checks below cover unchanged systems and
were not repeated for this focused update.

## 0.3.0 SurfaceNets, camera and quest correction — 23 October 2026

Six targeted geometry/asset tests pass. They cover all 254 surface masks, the
actual Irrlicht OBJ X reflection and face winding, shared cell boundaries,
original pony pixels, building eligibility and terrain-cache preservation.
The supplied NoCubes 38904f7 SurfaceNets implementation is the algorithm reference;
the Luanti cell-tile adaptation and its limits are documented in EQUESTRIA_0.3.0.md.

The real Luanti combat test checks actual sprite columns for four stationary
camera angles, seven selected ponies and swim frames, complete quest acceptance /
collection / return with persistent HUD and overhead markers, mixed stone/brick
material ownership through repeated remeshing, and an in-place legacy-surface
upgrade that preserves holes. Three-block destruction, all fourteen spells,
horizontal melee ribbons and boss rewards also pass. Four real town areas load
with smoothed surfaces. A generated geometry diagnostic was visually inspected
from both sides of a test house; it is not an in-game screenshot.

The two-client PeerJS/Luanti test additionally checks that the owner and a viewer
in front receive separate, attached back/front sprite frames with exclusive
observers. Camera/combat feel and cross-household connections still require
manual playtesting; server-state assertions do not establish client visual feel.

## Version 0.3.0 — Equestria shader/default-map correction

The original package filter incorrectly removed Luanti’s client/shaders folder.
The corrected filter includes every official shader while excluding client user
data. verify-equestria-release.mjs compares every packaged shader byte-for-byte
with the verified official Luanti ZIP, checks the complete default-world hash and
confirms a fresh profile can find Equestria without an import. The converted map
is now fixed in the bundle; the renderer and IPC no longer expose map conversion.

## Version 0.3.0 — Equestria and virtual-pet corrections

The 34 TypeScript tests and 14 desktop/import tests pass. The real supplied
Equestria ZIP converted all 494 regions; direct-ZIP installation matches the
independent extracted-world conversion byte-for-byte by world/source hashes.
Four town areas emerged in Luanti with actual structures and terrain nodes.
All 50 chest locations, 16 NPC locations and their fetch targets have source-ground
and headroom checks. These do not prove all routes are walkable without abilities.

`qa-equestria-runtime.mjs` launches two real Luanti clients against an isolated
world, through the UDP bridge. It verifies separate authenticated ponies, forced
third-person camera, per-player chest claims, duplicate-open handling, complete
fetch quests, disk-before-ack behavior, mismatched-world rejection and disconnect.

`qa-equestria-party.mjs` uses three browser clients and real PeerJS/WebRTC. Invite
codes, compatibility checks, 8 KB datagrams, isolated guests, late join, reconnect,
stale sessions and host shutdown pass. The test caught and fixed JSON-array packet
inflation exceeding PeerJS's message limit; Equestria datagrams now use base64.
Its local signalling server is a disposable test process, not a shipped service.

`qa-equestria-desktop.mjs` passes through the actual app renderer, real local
profile files, PeerJS invite codes and two real Luanti clients. Each profile
receives exactly one chest item and its own quest payment. Disconnect/rejoin,
host shutdown and profile reload pass. Leaving a game now explicitly revokes
the guest's engine identity, avoiding a stale player during the UDP timeout.
Desktop and 390-pixel layouts were captured and inspected.

Rarity's stand/couch/walk/fly/sleep/dress animations preserve the idle pixel scale
at 1440, 390 and 320 pixels. Oversized scene animations fall back to idle on narrow
screens. Standard N/BASE and R auras/sparkles are absent in desktop and companion
views; tiers 2–7 retain theirs. Large-pet edge/floor/aspect checks also pass.
Equestria launcher screenshots are in `tmp/qa/equestria-{desktop,mobile}.png`.

Native simulation tests use its null renderer. Camera feel,
all seven abilities on complex terrain, long-distance exploration, every interior
and WAN traversal across different household networks still need manual playtesting.
The automated tests do not establish those visual or network conditions. Terrain
collision approximates its smooth meshes with quarter-block steps; Minecraft
redstone automation and external dimensions are not implemented.

The release retains unmodified Luanti with its matching source ZIP and notices.
The default converted world is included with its license; user saves and runtime caches are excluded from the app archive. ZIP packaging reads
back and SHA-256 checks every archived payload before replacing the current ZIP.

## Version 0.2.5 — Ponykart controls match the UI

Ponykart loads `kartexec.cfg`; the launcher previously wrote its mappings to
`autoexec.cfg`, which that engine ignores. The launcher now writes the correct
startup file on each launch so new and existing profiles use the advertised keys.

`node scripts/qa-native-controls.mjs` launches the real native engine with isolated
fresh, existing and relaunched profiles. A temporary diagnostic addon asks the
engine to save its effective bindings and quit normally. All six actions and
their keyboard alternatives match the UI: W/up accelerate, S/down brake,
A/D or left/right steer, Space drift, X item. The test reproduced the old
A-to-accelerate mapping before the fix and passes all three cases afterward.
This checks the engine's loaded bindings, rather than injected movement commands.
The diagnostic addon stays in tmp and is not distributed.

The production TypeScript/Vite build and all nine desktop-module tests pass.
Native executables and level data are unchanged; the Cloud Rock 2 fix is retained.

## Version 0.2.4 — Cloud Rock 2 camera correction

The Adventure launcher now enables the engine's gravity-following chase camera.
`node scripts/qa-native-gravity.mjs` runs the real launcher and native engine
against Cloud Rock 2 (map 23) and Greenflower 1 (map 1), with a temporary diagnostic
addon and isolated profiles seeded with the old disabled camera preference.
It verifies that the old preference is corrected, the actual reverse/normal
gravity states are preserved, both left and right inputs move in the expected
direction, screenshots are produced, and both sessions close cleanly.
The captures were reviewed: the pony is upright and the HUD remains readable.

The diagnostic addon stays in tmp and is not distributed. This is a launcher
configuration fix; native executables and level data are unchanged from 0.2.3.
TypeScript/production build and the nine desktop-module tests also pass.

## Version 0.2.3 — 21 October 2026

Targeted checks for this update:

- 26 game-rule tests and nine desktop-module tests pass.
- Both rebuilt engines keep their SDL startup window hidden, then report a visible
  game window and advancing progress. Windowed and fullscreen launches pass.
- Adventure's real engine capture shows only the small pink level name. Its
  original title-card timer is retained.
- `node scripts/qa-gifts-auras.mjs` checks unopened gifts, reload persistence,
  reveal-time grants and prevention of duplicate grants on desktop and companion.
  All eight aura styles match between the two, including gentle-motion mode.
- Scenery uses a separate, low-resolution canvas enlarged with nearest-neighbour
  rendering. It preserves the existing cover crop and floor placement.
- TypeScript and the production build pass. Native source/runtime provenance
  checks pass; see [the security review](NATIVE_SECURITY_REVIEW_2026-10-20.md).

Earlier checks below provide broader coverage. The full 79-course preview sweep
was not repeated for this small update. The sandboxed Electron-shell limitation
described below remains; the user also reported successful ordinary-user testing.

## Automated game rules

`npm test` — 26 passing tests covering:

- Catalog IDs, sprite/effect paths, card files, set pools and playable-card exclusions.
- Exactly one Mane 6 starter; preservation of early preview saves.
- Deterministic shared daily stock, all-series coverage, and no previous-day pack repeat across 366 days.
- Pack cards staying in their exact pool, duplicate handling, awards before reveals, and interruption recovery.
- Prices, insufficient funds, stale stock, single-card daily limits, caster unlocks and daily gifts.
- Unlimited pet switching, deduplicated rarity variants, and separate pony care/XP records.
- One reserved UR-or-higher gift per level, granted only when opened. Pending
  cards/pets survive reloads; previously granted legacy gifts are not duplicated.
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

`npm run test:desktop` passes nine tests: internal reloads versus blocked external navigation, Gumroad product/status checks using injected provider responses, persistent and isolated profile files, map import validation, imported-pack checksums, a real two-way loopback UDP exchange, and bounded native-progress parsing with malformed/session/size checks. These complement the three arcade reward tests in `npm test`.

Version 0.2.1 fixes an Electron navigation guard that blocked the renderer's own refresh after activation, profile changes and sync sign-in. `node scripts/qa-activation.mjs` checks empty-form validation, visible activation progress, a failed request and retry, successful activation using `charris`, starter selection and saved activation on reload. It uses a simulated provider and real profile files in a disposable folder; the actual Electron shell still needs an ordinary-user smoke check.

`node scripts/qa-mobile-blocks.mjs` verifies the companion's four tabs, touch movement/rotation/drop/hold, pony XP persistence, and board/control fit at 390 × 844, 320 × 740 and 844 × 390. The portrait and landscape screenshots were reviewed. This targeted check uses an isolated local save; the existing save/sync implementation is shared with desktop Magic Blocks.

`node scripts/qa-desktop-browser.mjs --network` exercises local profile screens, profile rename/reload/switching, native launch/progress/stop, and pastel preferences using the real desktop modules. Two Chrome clients use a local PeerServer and WebRTC to share a meadow, follow the host's background, and connect two actual native engines in both Adventure and Ponykart. `npm run test:native-network` separately verifies two players and advancing simulation time through the UDP bridge. Music decoders are enabled in these network tests, with SDL's dummy audio output.

`python scripts/qa-native-gameplay.py` uses a QA-only native addon to collect an actual fresh ring, recollect a dropped ring, and finish a course. It checks that only the fresh ring pays and completion reaches the launcher. The addon is not distributed.

`python scripts/qa-native.py --roster --courses` loads and captures native previews of the seven Adventure and six Ponykart characters, original/pastel scenery, and all 19 Adventure and 60 Ponykart courses in the launcher. This checks course loading and rendering, not full playthroughs. Screenshots and course-review contact sheets are under `tmp/native-qa`. Original course unlock requirements are removed for the explicit launcher list; music, sky, lap counts and gameplay headers are retained.

Playable default characters and title/pause/result screens are replaced. Named Sonic/Eggman branding textures are replaced with simple star artwork. The original level layouts and ordinary scenery remain. Start-area previews do not establish that every incidental branded detail in every part of every original level has been removed.

The actual Electron smoke test is `node scripts/qa-desktop.mjs`. This agent's restricted Windows token prevents Electron's sandbox children from reading its installed runtime (`icudtl.dat` access check), before the app UI opens. Renderer tests therefore used Chrome with the real desktop modules. Run the Electron check from an ordinary terminal, then test a real invited Firebase account before sharing. The production renderer sandbox remains enabled. No production-account or cross-home-network WebRTC connection was tested; restrictive networks may need a TURN relay, which is not included.

## Deployment boundary

The production build is checked locally, including serving under a `/ponyhaven/` subpath. Firebase's public `mlp4kt` configuration is present. The source publisher prepares an audited checkout and configures GitHub Pages through the owner's GitHub CLI sign-in; deployment is only complete when its Actions run succeeds. Follow [MOBILE_SYNC_SETUP.md](MOBILE_SYNC_SETUP.md) or [GITHUB_PUBLISHING.txt](GITHUB_PUBLISHING.txt), then repeat the real-account verification checklist. Emulator checks do not establish that live project settings are correct.

## 0.3.0 Equestria completion — 23 October 2026

The latest targeted real-engine checks pass: attached avatars with independent stationary heading, all seven pony atlases including swim frames, horizontal mesh melee combos, three-block spherical destruction (123 voxels) with no item drops, smoothed building crater edges, all fourteen spell casts, five boss attack types, giant boss scale and persisted book/pet rewards. All four sampled towns generate smoothed geometry; the expanded material set includes buildings. Terrain-cache migration preserves progress and backs up the earlier map.

Real OpenGL startup passes with all cloud shaders and the minimap enabled. This checks loading, not subjective camera or combat feel. Browser integration uses two real Luanti clients and PeerJS for invite codes, persistent Luna selection, independent chest/quest/book rewards, reconnect and host shutdown. Fresh-profile bundled-world checks require no import.

Firebase Auth/Firestore emulator checks pass for login without activation, new-profile cloud linking, saved-session reload, disabled/uninvited denial (including an existing local profile), and preservation of legacy unlinked progress. No activation receipt is created. Production Firebase configuration and cross-household multiplayer remain manual checks.

## 0.3.0 scenery correction — 24 October 2026

Seven focused scenery/media tests pass: all 6,860 compressed tile hashes and media sizes, exact source roof heights, thin walls, windows and underpasses, coordinate conversion, fixed unique books, and the loopback media service. The corrected two-by-one-by-two sampling replaces the previous eight/32-block cubes and the whole-map backdrop. Only a local ring is rendered, capped at 1024 nodes, with native depth and a shared transition fog.

The shipped GLSL passes pixel checks for native depth ordering in both draw orders, coincident face priority, bounded visibility and continuous fog. Transform-feedback comparisons cover walking, camera orbit, flight and origin rebases with stale entity translations; measured position error is below 0.0001 node. Source-resolution geometry and the bundled ring are rendered side by side at ground and flight heights in Ponyville and Canterlot. Reviewed diagnostic images are in `tmp/qa/equestria-ring-ground.png` and `tmp/qa/equestria-ring-flight.png`; they are not native gameplay screenshots.

Real Luanti combat checks cover bounded, non-colliding scenery entities, remote mapblocks still unloaded, the half-block camera offset, unique collectible book visibility, existing quest tracking, unlimited flight, swimming, destruction, all spells and bosses. The two-client invite-code test additionally requires both clients to receive identical nearby tile media before observing their entities. The packaged OpenGL check requires actual local scenery fetches, five shader overrides and all 51 unchanged official shaders. Manual movement/camera feel, frame rates on low-end hardware and cross-household latency remain outside these automated checks.
