# Native engine provenance and changes

Adventure: [STJr/SRB2](https://github.com/STJr/SRB2), tag `SRB2_release_2.2.15`.
Ponykart: [STJr/Kart-Public](https://github.com/STJr/Kart-Public), tag `v1.6`.
Both engines retain their upstream GNU GPL notices. The older
`STJr/SRB2-Public` repository targets SRB2 2.0; the supplied Adventure character
WADs are converted for the current maintained engine instead.

`scripts/patch-native.py` applies reproducible changes from pristine source:

- `ponyhaven_bridge.h`: cumulative ring, lap, score and finish snapshots, plus a
  native screenshot smoke-test flag. Dropped rings do not count as new pickups.
- `ponyhaven_pastel.h`: adjustable, world-texture-only palette translation. It
  operates on private texture caches, excluding source sprite lumps and the HUD.
- Ponyhaven window titles, pause screen and shared-game finish screen.
- Disable Adventure's normal player recolour pass for the converted pony art.
- Replace stock base-file MD5 checks for the curated local data; native network
  addon consistency checks remain in place. Distribution files have SHA-256 hashes.
- ClangCL compatibility changes for Windows headers and old GNU helper macros.
- Safe software drawer initialization, a simple pony-independent multiplayer
  waiting screen, and no automatic multiplayer replay recording in launcher runs.
- The same 2 MiB process stack reserve as the upstream Windows releases. Native
  launch uses a supported 1280 × 800 video mode, and party availability waits for
  the engine's first valid progress snapshot.

`scripts/prepare-native-assets.py` preserves originals and produces derived files:
seven converted Adventure characters, six Kart characters, replacement title/story
graphics and level naming, and a simple star finish marker. It retains base maps,
gameplay, music and ordinary environmental objects. Every shipped character is a
pony; engine console/source attribution is retained.

Level-name overrides retain the original complete SOC level header, including
music, sky, lap and gameplay flags. Adventure story cutscenes are omitted. Named
Sonic/Eggman billboards and Kart item icons are replaced with simple star art.
Adventure uses its release's SDL Mixer X runtime; Kart includes its music decoder
DLLs and Game Music Emu support. Original dependency notices accompany both.

`srb2-legacy.pal` is the 768-byte SRB2 legacy palette distributed in
[SLADE's palette resources](https://github.com/sirjuddington/SLADE/blob/master/dist/res/palettes/Sonic%20Robo%20Blast%202%20(legacy).pal).
It is used only to convert the old sprite indices to the new engine palette, not
to pastelise characters. Legacy mod metadata is retained in the supplied original
WADs; Twilight credits akb778 with CoatRack feedback. No blanket ownership or new
redistribution license is claimed over user-supplied character art or voices.

The portable distribution includes upstream runtime license files. The accompanying
`engine-sources.zip` contains both pinned source archives, build/conversion scripts,
these headers, palette, dependency/download manifest and the original supplied mods.
Extract its project files, set `PONYHAVEN_MODS` as described in `DESKTOP_SETUP.md`,
and run `python scripts/prepare-native.py` to reproduce the native build. The build
uses the upstream source lists and bundled library headers/import libraries.
