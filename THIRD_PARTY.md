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

The Electron runtime retains its bundled license and Chromium notices. Gumroad provides invitation-key validation; Firebase optionally provides invited account authentication and private progress storage. PeerJS is used for desktop party signalling. These services are not sponsors or licensors of the fan artwork.
