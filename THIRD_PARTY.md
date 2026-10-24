# Artwork, source data and fonts

Ponyhaven is an unofficial, noncommercial personal fan project. My Little Pony characters and related artwork belong to their respective rights holders. There is no affiliation with Hasbro, Kayou, My Little Card Collection, Desktop Ponies, or PonyPonyParadise. Noncommercial intent does not transfer ownership of third-party art.

## Desktop Ponies

Source: [RoosterDragon/Desktop-Ponies](https://github.com/RoosterDragon/Desktop-Ponies), pinned revision `3dbfd54cdcabdebabc61df995c9f84b60d1735c4`.

The project's code and artwork are distributed under [Creative Commons Attribution–NonCommercial–ShareAlike 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/). Original animation GIFs are preserved. Static previews and palette colors are derived from those GIFs. All contributing artist credits are retained in [`public/data/desktop-ponies-credits.txt`](public/data/desktop-ponies-credits.txt). This game adapts the behavior metadata for a browser meadow; it is not a complete reimplementation of the desktop behavior engine.

## Kayou card imagery and catalog

Source: [My Little Card Collection all-singles catalog](https://mylittlecardcollection.com/collections/all-singles) and [Kayou guide/checklists](https://mylittlecardcollection.com/pages/free-downloadable-kayou-mlp-guide-checklist).

Source image URLs and original product links remain in each card record. Local WebP copies use source-provided resized images; no watermark removal is performed. Card imagery is not covered by the Desktop Ponies license. Per-card listings can be opened from the in-game details view.

The catalog excludes playable card-game series. Some product metadata supplies several compatible collections; uncertain membership is labelled. Fictional Friendship Specials are explicitly identified as a fan assortment. Pack odds and rewards are custom to this free game.

## PonyPonyParadise backgrounds

51 location backgrounds were selected from 124 distinct images in the user-provided `PonyPonyParadise/data/locations` folder, after reviewing floor alignment and pony scale in desktop and phone game views. Individual source paths are retained in [`public/data/backgrounds.json`](public/data/backgrounds.json); review decisions are in [`scripts/background-curation.json`](scripts/background-curation.json). Images were resized and encoded as WebP for the web. No character sprites, foreground character overlays, or music from that project are included. No redistribution license was present at the supplied project's root; this attribution does not claim ownership or a new license over its scenery.

## Fonts and original assets

DM Sans and Nunito are self-hosted under the SIL Open Font License. Their license texts are in `public/assets/fonts`. The default `meadow.svg`, interface icons, pack illustrations, CSS rarity effects and web-interface sound effects were made for Ponyhaven. The web interface synthesizes its sounds; native games use their upstream audio and the supplied pony voices.

## Adventure and Ponykart

Adventure uses [Sonic Team Junior's SRB2](https://github.com/STJr/SRB2/tree/SRB2_release_2.2.15), version 2.2.15. Ponykart uses [Kart Krew's SRB2Kart](https://github.com/STJr/Kart-Public/tree/v1.6), version 1.6. Engine code retains its GNU GPL notices. Runtime `LICENSE.txt` and `LICENSE-3RD-PARTY.txt` accompany each engine, including dependency notices. The portable build includes `engine-sources.zip` with the pinned upstream sources and exact modification/build scripts. See [engines/README.md](engines/README.md).

The owner supplied the character WADs in `pony wads` and `KC_MLP_Pack_v1a.pk3` from `ponykart mod`. Original archives and embedded metadata are included in the corresponding-source bundle. Twilight's legacy WAD credits akb778 and CoatRack feedback; no blanket redistribution license is claimed over the supplied mods or voices. Adventure sprite indices are converted using the [SLADE legacy SRB2 palette](https://github.com/sirjuddington/SLADE/blob/master/dist/res/palettes/Sonic%20Robo%20Blast%202%20(legacy).pal). Pastel scenery and replacement star signs are derived for this fan project. Base maps, ordinary scenery and music remain upstream assets.

The Electron runtime retains its bundled license and Chromium notices. Firebase provides invited account authentication and private progress storage. PeerJS is used for desktop party signalling. These services are not sponsors or licensors of the fan artwork.

## Equestria Adventure (0.3.0)

[Luanti 5.17.0](https://github.com/luanti-org/luanti/tree/5.17.0) is included unmodified under LGPL-2.1-or-later, with upstream media/dependency notices in the runtime's `LICENSE.txt` and `SOURCE_LICENSES.txt`. Its matching source ZIP and Ponyhaven's Lua game source/generators accompany the release in `engine-sources.zip`.

The converted [Equestria 6 Update 8](https://www.planetminecraft.com/project/equestria-6/) world is included as Equestria Adventure’s default map. The world is by EagleCraft.fr / Baroriam, incorporating [Brohoof.com](https://kilorat.com/brohoof.com/) builds and [CaptainZepto's landscape](https://www.planetminecraft.com/project/equestria-geographical-minecraft-map/), under CC BY-NC-SA 4.0. Original map notices are preserved. The bundled map contains the original README and LICENSE and a PONYHAVEN_ADAPTATION.txt change notice. Adaptations include Luanti materials, coordinate conversion, terrain meshes, travel locations and gameplay placements; the world adaptation retains CC BY-NC-SA 4.0.

Pony avatars reuse the supplied Adventure WAD sprites described above. Town NPCs and bosses adapt Desktop Ponies GIFs to PNG atlases without changing the art license; artist credits remain in `dist/data/desktop-ponies-credits.txt`. Terrain, ring, chest and parcel textures are original procedural artwork. No Minecraft textures or NoCubes code are included.

The supplied NoCubes Forge `1.20.1-0.5.2-dev-38904f7` JAR and [Cadiboo/NoCubes revision 38904f7](https://github.com/Cadiboo/NoCubes/tree/38904f7) were used as references. NoCubes carries LGPLv3; its SurfaceNets source credits Mikola Lysenko's original algorithm. Ponyhaven's independently written generator uses twelve-edge crossing averages and material sampling behind the surface, adapted into fixed Luanti cell tiles. It does not run or bundle the Java mod and is not an exact renderer port. Source and adaptation details are in `desktop/equestria/surface-nets.mjs` and `EQUESTRIA_0.3.0.md`.

Changelings use the front-facing row of the owner-supplied sprite sheet dbj4but-11ce86bb-08c9-40ca-a316-dc57815e0cc9.png, preserved in the source archive. No new ownership or redistribution licence is claimed over that supplied artwork.

The seven-book system adapts ideas and book/effect textures from [Wyrda](https://github.com/Python-Sargent/Wyrda), copyright 2025 Samuel Sargent, MIT. Its complete supplied source ZIP and MIT text are included; the game also carries WYRDA_LICENSE.txt. Combat, boss patterns and the horizontal melee ribbon are implemented for Ponyhaven.

Distant scenery is a 3D adaptation of the included Equestria world and retains its CC BY-NC-SA 4.0 attribution. Its bounded ring uses two/four-node horizontal footprints and exact source vertical intervals. Five game-local shader overrides derive from Luanti 5.17.0's node, object and cloud shaders under LGPL-2.1-or-later. They preserve XY perspective, reserve a depth band for scenery beneath real geometry, add shared pastel fog and apply a light texture-space Kuwahara filter to terrain. The original runtime shaders and executable remain unchanged. Exact override sources and generators are included in `engine-sources.zip`. NoCube surface generation is disabled in the current release.

Equestria's procedural composer and synthesized instrument/combat samples are original Ponyhaven work. [Vincent Huynh's lofigen](https://github.com/vin-huynh/lofigen) informed the general approach of changing chords, diatonic melodies and drum patterns. No licence was present in that repository at inspection, so none of its source or recordings are redistributed. The build-only [wasm-media-encoders 0.7.0](https://github.com/arseneyr/wasm-media-encoders) tool encodes original PCM as Ogg Vorbis; its official source/package tarball, with its notices, accompanies the generators. The game does not run that encoder or contact a music service.
