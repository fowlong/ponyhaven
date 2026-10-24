# Ponyhaven desktop setup

Ponyhaven is a free personal fan game. Electron provides the meadow, cards, shop
and Magic Blocks; Equestria, Bonus stages and Ponykart open native game windows.
Firebase invited accounts provide access and optional progress sync. Gumroad
licence-key activation has been removed.

## For friends

1. Extract the whole Ponyhaven-0.3.0-win32-x64 folder somewhere writable.
2. Run Ponyhaven.exe and sign in with the Firebase account your host supplied.
3. Choose your first pony. Existing local profiles and saves are preserved.
4. Use Settings → Export save regularly. Import save restores the current profile.

The configured app validates account access online at startup. Progress is kept
locally if a connection drops during play; wait for Cloud saved before switching
devices. A developer build without Firebase can create local profiles directly.

Saves are under %APPDATA%/Ponyhaven/Ponyhaven/profiles/<profile-id>/.
Manage local profiles creates or selects independent saves. Reset requires RESET
and makes a recovery backup. Close native games before switching/resetting.
Existing unlinked saves remain local until Connect mobile sync is chosen.

## Owner: invite friends

Create an Email/Password account in Firebase Authentication, then enable its UID
in allowedUsers with enabled=true and a name. See FIREBASE_SETUP.md and
MOBILE_SYNC_SETUP.md. No public registration, paid activation or Gumroad key is used.

## Native games and controls

Version 0.3.0 also includes **Adventure → Equestria**, powered by Luanti. The converted
Equestria 6 Update 8 world is included. Choose a pony and use New game / Load game
to manage its adventures. Damage resets when a world opens; progress persists.
NoCube is currently disabled. Minecraft and map conversion are unnecessary.
See [EQUESTRIA_0.3.0.md](EQUESTRIA_0.3.0.md) for controls, invite-code multiplayer,
controller bindings, local storage and map limitations.

Bonus stages uses SRB2 2.2.15 with the supplied older pony artwork converted to the
current sprite format and palette. Ponykart uses SRB2Kart 1.6 and the supplied
Mane Six pack. Character choices are available in the launcher. Native menus use
Ponyhaven's simple pause/return screen. Source credits remain in the distribution.

| Game | Controls | Rewards |
| --- | --- | --- |
| Bonus stages | WASD move, left/right arrows turn, Space jump/ability, X spin | 10 bits per newly collected ring; 100 on finishing |
| Ponykart | W/up accelerate, S/down brake, A/D or arrows steer, Space drift, X item | 50 bits per lap, up to 3; 200 on finishing |
| Both | Esc opens the pause menu; Enter/Esc resumes; Q exits from that menu; Alt+Enter toggles fullscreen | Progress is saved as it arrives |

SRB2Kart 1.6 has no collectible rings, so races reward laps and completion instead.
Ponykart's controls are applied at every launch, including existing profiles,
so the in-game bindings match the keys shown in Ponyhaven.
Adventure's camera follows the pony's gravity direction, keeping the pony upright
in Cloud Rock's reverse-gravity sections. The course's gravity switches still
work, and left/right movement is unchanged. Existing profiles receive this camera
setting automatically at launch.
Dropped Adventure rings do not pay again when picked up. Rewards use cumulative
session counters so reading the same update twice does not pay twice. Individual
course runs return to the launcher; hosted games let friends finish before the
host closes the game. Best scores and race times appear in Leaderboard.

The native engines are Windows desktop games. Their mobile touchscreen ports are
not included. The meadow, collection, shop and Magic Blocks retain their responsive
browser layout. Fullscreen is available for the app and each native game.

## Pastel scenery and custom levels

Each game has an **A softer world** setting: original, gentle, pastel or extra soft.
It transforms the private wall, floor and sky texture caches when loaded, rather
than modifying the shared palette. Pony sprites, object sprites and HUD artwork
are excluded. This also means scenery made from decorative object sprites keeps
its original colours. Lighting and normal gameplay effects remain active.

Adventure's old pony sprites use a different palette from SRB2 2.2. They are
converted once using the legacy RGB values, preserving their character colours
within the new engine's available palette. This conversion is separate from the
optional scenery treatment. Ponykart uses each supplied skin's preferred colour.

Use **Import a level pack** on the appropriate game tab. Supported inputs are
standalone SRB2 2.2 Adventure or SRB2Kart 1.6 map packs, `.wad` or `.pk3`, up to
128 MB. The importer reads map identifiers and level titles, then copies the pack
into the current profile. The original file is untouched. Imported packs can be
removed from the expandable list on the same screen.

Maps with textures and ordinary level headers are supported. Scripted mods, Lua,
replacement characters, palette replacements and total conversions are rejected;
they require a separate compatibility review. An importer cannot make a level
from another engine/version compatible. Scenery treatment automatically covers
new compatible maps. An imported pack's checksum separates its race records from
built-in courses with the same map number.

For a custom multiplayer map, each friend imports the identical file into the
same game first. The invite checks its checksum. Packs are not downloaded from
other players automatically.

## Shared meadow and game invites

Open the friends button and host a meadow, then share the eight-character code
with your friends. They choose Join and enter the code. The host chooses the
shared background. Connected friends and their current ponies appear in the
party list. The app does not maintain an always-online directory of all licensed
users; an offline installation cannot discover those users without a central
account/presence service.

The same party can host Adventure or Ponykart from its game tab. Guests select
Join when the host starts. Keep Ponyhaven open behind the game: it carries the
native game packets over the party's WebRTC connection. Native game sockets bind
to loopback and do not advertise a public server. Leave the native game before
changing party hosts. The code closes when the host leaves or closes the app.

PeerJS's public signaling service introduces peers; WebRTC carries their data.
There is no paid service or account setup for the owner. Signaling requires an
internet connection and that public service's availability. Some restrictive
routers/firewalls block direct WebRTC connections; no TURN relay is bundled.
This means invite play cannot yet be promised across every pair of home networks.
The native engines themselves are not run inside the web page.

Leaderboards store personal records locally. Party members exchange their latest
records and remember them on that computer. These are friendly shared records,
not a centrally verified global leaderboard.

## Build from this workspace

Requires Node.js 22+, Python with Pillow, CMake, Visual Studio 2022's C++ tools
and ClangCL for native builds. The existing `native` directory already contains
locally prepared engines. Do not commit the large runtime files to the source repo.

```powershell
npm install
npm run desktop
```

For a fresh native build, set `PONYHAVEN_MODS` to the folder containing `pony wads`
and `ponykart mod`, then run the preparation script. Source/release downloads are
pinned in `engines/downloads.json` and checked against SHA-256 hashes.

```powershell
$env:PONYHAVEN_MODS = 'C:\path\to\your\pony-assets'
python scripts/prepare-native.py
npm run desktop:package
```

The portable folder is `release/Ponyhaven-0.3.0-win32-x64`. Keep its accompanying
`engine-sources.zip`, licenses and attribution files when sharing it. That source
archive includes the upstream source archives and the exact modification/build
scripts for the native engines. `engines/README.md` describes their changes.

Useful checks:

```powershell
npm test
node --test tests/desktop.test.mjs
python scripts/qa-native.py --roster
node scripts/qa-desktop.mjs
```

`qa-desktop.mjs` uses an isolated workspace profile. For configured builds, supply
an invited test account through QA_ACCOUNT and QA_PASSWORD. It does not use the
real local profile. If an agent/sandbox environment prevents
Electron's child processes from reading the installed runtime, run this check from
an ordinary local terminal. Keep the production Electron renderer sandbox enabled.

The browser desktop integration harness also exercises the real filesystem and
native-process modules. Its `--network` mode runs a local PeerServer for repeatable
WebRTC tests; this is a test dependency, not a required production service.
