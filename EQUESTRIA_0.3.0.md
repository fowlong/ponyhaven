# Ponyhaven 0.3.0 — Equestria Adventure

Equestria is the default Adventure screen. Bonus stages opens the original SRB2
courses. The bundled, unmodified Luanti 5.17.0 engine runs the converted Equestria
6 Update 8 map. Minecraft, Java, downloads and user conversion are unnecessary.
Cloud shaders and the complete world are included. Firebase invited accounts
provide access; Gumroad activation has been removed.

## Adventures and multiplayer

Choose a pony, then **New game** to name a fresh adventure or **Load game** to
select an existing one. Each pony can have multiple saves. Saves can be deleted
with an explicit confirmation; collected cards and virtual pets remain in the
shared collection. Previous progress is retained as **Original adventure**.
Continue adventure opens the selected save. Progress saves automatically.

Books, chest cooldowns and earned progress belong to the selected save. Local
quests and safe-stop checkpoints also use that save's identity. Terrain damage
is temporary: every new solo or hosted world restores the original map. Joining
an existing party keeps that live world's damage. Native quest/checkpoint state
stays on the machine hosting that adventure; collection and adventure reward
progress use Ponyhaven's existing profile/cloud storage.

Create or join the usual eight-character party code. The host chooses Host
Equestria; friends choose Join Equestria. Up to eight ponies can explore together,
with separate discoveries and rewards. Matching game files are required. The
host keeps both windows open. WebRTC uses loopback UDP relays and internet
signalling; no TURN service is bundled. Keep the extracted app folder writable
for Luanti's verified media cache.

## Controls

| Action | Keyboard / mouse | PS5 controller |
| --- | --- | --- |
| Move / camera | WASD / mouse | Left / right stick |
| Jump / pony ability | Space | Cross |
| Melee / primary spell | Left click | Square |
| Rainbow orb / secondary spell | Right click | Circle |
| Interact | E | Triangle or D-pad up |
| Equip / put away a book | 1–7 | L1 / R1 cycles unlocked books and unarmed |
| World map / minimap | I / V | D-pad left / right |
| Charge / release spin dash | Hold / release X | Hold / release D-pad down |
| Pause | Escape | Options |

Keyboard and mouse remain available for map menus. Controller mappings use
Luanti's SDL gamepad support; a physical DualSense has not been tested here.

Pony sprites use all eight original SRB2 directions, including diagonals and
available swimming animations. The camera can orbit a stationary pony and sits
half a node farther back. Attacks briefly use walking frames. Fluttershy, Derpy
and Luna have unlimited flight: jump, release, then jump again to start; hold
jump to climb. Landing or entering water ends flight. Spin/flight aura trails
are disabled in this revision.

## Exploration and combat

Town pets offer repeatable fetch-and-return quests worth 150 bits. Objectives
glow, use neon green map/overhead markers, and have persistent distance tracking.
Procedural rings give 10 bits each. Fifty chests each award one rare card or one
new virtual pet, with an individual 24-hour refill timer and replay protection.

Seven unique floating spellbooks occupy fixed, widely scattered locations.
Collected books disappear for their collector. The book bar shows locked,
unlocked and equipped states. Equipped books replace both basic attacks:

| Book | Primary | Secondary |
| --- | --- | --- |
| Risier | Upward burst | Directional dash |
| Fiera | Fire burst / burning area | Explosive fireball |
| Disperim | Repulsion | Swap with a targeted enemy |
| Sanium | Healing | Temporary shield |
| Expol | Explosive projectile | Pulling singularity / blast |
| Flurra | Slowing snowball | Icicle field |
| Fulst | Lightning bolt | Electric orb trap |

Basic melee is a larger, bright horizontal three-hit slash. Rainbow orbs travel
at medium speed and destroy a three-node-radius sphere. Destructive spells have
their own radii, up to six nodes. Blocks never become construction collectibles.

Changelings use the supplied front-facing animation and fire dark orbs. Players,
enemies and bosses have visible health bars. Enemies and bosses flash red and
change animation pace/pulse before attacking. Boss patterns include volleys,
expanding rings, marked meteors, spirals and crossfire; impacts have area effects
and synthesized sounds. Sixteen bosses are ten times normal NPC size, occupy
seeded arenas away from towns, and drop themselves as virtual pets. Bosses
respawn after 24 hours. Defeat returns the player to a safe stop.

An original offline composer generates changing chords, melody, bass and drums.
Approaching a living boss gradually brings faster, darker, Phrygian harmony;
leaving returns to gentle major harmony. Luanti's volume setting controls audio.
The musical approach was informed by [lofigen](https://github.com/vin-huynh/lofigen).
That repository has no redistribution licence, so its code and samples are not
included. All Equestria music instruments and combat sounds are synthesized here.

## Terrain and distance

**NoCube is disabled** for generation and destruction, including surface-node
registration. This removes the material-boundary flicker and geometry gaps.
The earlier independent NoCubes/SurfaceNets reference implementation remains in
source. Pastel blue atmospheric fog and a light, texture-space Kuwahara filter
soften terrain materials; sprite art and the scenery colour atlas stay sharp.

The draw setting controls destructible voxels, defaulting to 512 nodes. Each
client's live setting is observed without changing native packets. A bounded
scenery ring extends beyond it, reaching 768 nodes at the default setting and
never beyond 1024. Fog starts at the selected range and fills the ring's edge
(the 1024 cap reserves the final 128 nodes for the fade).

Nearby proxy geometry uses two-node horizontal footprints; farther geometry
uses four. Both retain exact source heights, overhangs and building colours.
Inside the selected range, proxies fill unloaded pixels beneath real geometry;
loaded voxels always have priority. Proxies are excluded within 32 nodes.
This avoids assuming every voxel in the selected radius has finished loading.

Network anchors follow each player while shaders keep geometry fixed in world
coordinates. Invisible zero-area bounds prevent incorrect frustum culling.
Teleports start destination loading immediately. Only nearby tiles are active;
media loads nearest-first with a bounded queue through each machine's own local
service. The default Ponyville selection is about 1.4 million proxy triangles,
versus the earlier 5.9 million. Tiny details and distant damage are approximate.

All 420,420 chunks, 494 regions and 2,482 source block states are retained,
including interiors and elevated buildings. Nine internal teleport routes are
adapted. Redstone automation, command-driven building swaps, sign text and
external dimensions are not simulated.

## Verification and sources

See QA.md for native gameplay, movement/teleport, save/reset, multiplayer, shader
and asset checks. Manual play feel, low-end hardware frame rates and physical
controller testing remain playtests. Virtual-pet frame audits cover all 311
ponies; 25 unsafe animations fall back to idle, and decoded image swaps preserve
pixel scale. Standard N/BASE and R rarities have no aura.

The map is Equestria 6 / EagleCraft.fr, with Brohoof.com builds and CaptainZepto's
landscape, under CC BY-NC-SA 4.0. Wyrda book/effect assets retain Samuel Sargent's
MIT notice. Five game-local shaders derive from Luanti under LGPL-2.1-or-later;
they preserve XY perspective and reserve a separate depth band for scenery.
Official engine shaders and executables remain unmodified. Credits, notices,
matching engine sources and generators accompany the release.

To rebuild scenery, run prepare-equestria-horizon.mjs, prepare-equestria-scenery-lod.mjs,
then prepare-equestria-scenery-anchors.mjs. The feedback generator uses the supplied
wasm-media-encoders-0.7.0.tgz as a build tool: extract it to tmp/equestria/encoder
before running prepare-equestria-feedback.mjs. Its upstream MIT notice remains
inside the source tarball; no encoder runs in the game.

Source world SHA-256: ba185c6e7e80d2258d3a57b1b49bfa76606837d58430fb496c3837e1872461a8

Converted world SHA-256: 9a160f17c19c45bda7a67c444c1ab0778e72e476efd3bb562842de8f95e6d869
