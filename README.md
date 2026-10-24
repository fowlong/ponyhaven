# Ponyhaven

A free personal My Little Pony fan game for friends. The Electron desktop app includes the meadow, Kayou collection, Magic Blocks, native Adventure, Equestria and Ponykart. A small GitHub Pages companion shares pet care, the shop and collection through optional Firebase sync.

Version 0.3.0 adds [Equestria Adventure](EQUESTRIA_0.3.0.md) using the included open-source Luanti engine and the included, converted Equestria 6 world. It supports the existing invite-code parties, pony abilities, town quests and 50 daily treasure chests. Minecraft is not required.

Start with [DESKTOP_SETUP.md](DESKTOP_SETUP.md) for account login, local profiles, native games and packaging. Follow [MOBILE_SYNC_SETUP.md](MOBILE_SYNC_SETUP.md) to connect a phone. No private GitHub repository is needed for credentials or saves.

## Run locally

Requires Node.js 22 or newer.

```powershell
npm install
npm run dev
```

Open the address printed by Vite, normally `http://127.0.0.1:5173/`. Without Firebase configuration, the preview saves on this browser. Use Settings → Export save to keep a portable backup.

```powershell
npm test
npm run build
npm run preview
```

`npm run test:browser` checks the main flows; `npm run test:care` checks the expanded pet systems and mobile layout. They use an installed Chrome browser. Set `CHROME_PATH` if needed, and `QA_URL` to test a production preview instead of the dev server. Test runs use separate browser profiles and do not change your game.

## Accounts and hosting

Follow [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for free Firebase setup, owner-created password accounts, local account management, GitHub Pages deployment, and shared meadow codes. No Google sign-in is required. A static GitHub site cannot itself securely store passwords or synchronize private accounts, so Firebase handles those small backend tasks.

The desktop signs in with an invited Firebase account and keeps local profile saves. New installs link progress automatically; existing unlinked profiles can connect through settings. Gumroad activation is removed. The mobile companion requires that account and the same public Firebase configuration. Saves update live; competing offline changes keep a recovery copy instead of overwriting cloud progress. “Into the binder” opens the refreshed collection, ordinary binder navigation clears old preview filters, and recently acquired cards appear first.

The website and game remain free. There are no payments, ads, analytics, or paid currency. The included workflow publishes only built website files. Personal account allowlists and Admin credentials are never included in the site.

## What is included

- **311 Desktop Ponies characters** with local GIF animations, native temporary props, a slower varied ambient cycle, and optional ten-second transformations/outfits. No temporary pony cameos.
- **3,197 collectible cards across 31 pack pools**, excluding the playable card-game series. Card art is cached locally. Pack membership uses source tags and marked code-based inferences; unclassified specials use a labelled fan assortment.
- **52 curated backgrounds:** the original Ponyhaven meadow plus 51 scenery images from your PonyPonyParadise copy. Each has a reviewed floor, pony scale and walking lane that follow the image crop on desktop and phones. Left/right arrows, day/night, uploadable local backgrounds, and host-selected shared views.
- Food, energy, wellbeing, friendship, and happiness. Play consumes food/energy and adds pixel dirt; brushing and pointer/touch bathing clean it. All needs contribute to happiness.
- Unlimited switching among unlocked pets. Each pony keeps their care, dirt and XP across rarity variants. Every level-up reserves one random tier 4–7 card; the card and any pet unlock enter your collection when you open the gift. Reopening cannot grant it twice.
- NPC playdates last 20 minutes with a one-hour invitation cooldown. Nearby NPCs and room friends award friendship and XP at most once per minute.
- Two pack choices each UTC day, drawn from shuffled series bags without repeating yesterday’s choices. Buy as many as you can afford, opening each before buying the next. Five rare singles and three unicorn casters also rotate daily.
- Packs contain five weighted random cards from that exact pool. One bonus pet roll per pack has a 20% chance when eligible ordinary cards appear. Tier 6/7 cards guarantee a matching pet when a sprite exists. Duplicate variants stay unlocked, without duplicate sprite files.
- Eight consistent card finishes and pony rarity accents, reused across the binder, shop, details and reveals. Gentle motion preserves static rarity cues. Contextual synthesized sounds have a settings toggle.
- Magic Blocks supports keyboard, touch, hold, ghost pieces, combos, pause and generous rewards. The mobile board fits around its controls and navigation. Pony and piece auras share the caster's palette color.
- Native Adventure (seven supplied ponies) and Ponykart (Mane 6), per-profile rewards and records, fullscreen, party codes and level-pack import. Adjustable pastel scenery applies to world textures in built-in and imported levels, preserving character palettes and HUD graphics.

## Progress and game rules

Starter accounts receive 600 bits; daily gifts give 150. Packs cost 60–90 bits. Single-line clears give 40 bits, doubles 100, triples 180, and four lines 300. Combos add 30 per step, with 100 extra for consecutive four-line clears. Care, purchases and block play all add small amounts of XP to the selected pony.

Level thresholds grow by 100 XP each level (100, then 200, then 300, etc.). A level gift chooses uniformly among available tiers 4–7, then a random card in that tier. These are friendly game rules, not claims about official Kayou physical pack odds. Pack card weights by tier 0–7 are 40, 35, 23, 14, 8, 5, 3, 1; the final draw uses tier 3+ if the pool contains one.

Resetting an account starts a new game with 0 bits and a fresh starter choice. It keeps the login and a local pre-reset backup. Early preview saves migrate their already-earned pets and XP instead of taking them away.

## Catalog maintenance

The catalog is a dated source snapshot, not a promise that every card ever released is present. See `public/data/catalog-report.json` for source counts, exclusions, inferences and the pinned Desktop Ponies revision.

```powershell
npm run catalog:import
python scripts/prepare-assets.py
npm run sprites:measure
npm run cards:cache
python scripts/optimize-cards.py
```

`catalog:compile` reuses cached source files under `tmp`. Pillow is required for the Python asset preparation. `scripts/import-backgrounds.py` inventories only `data/locations/**/background.*`; with `--copy` it prepares only the approved scenery in `scripts/background-curation.json`. That manifest records all 125 reviews, exclusion reasons and source-image floor geometry. New backgrounds must be reviewed with a pet at desktop and phone sizes before inclusion. Character assets from PonyPonyParadise are not used.

The game does not crop or remove watermarks from source card images. Card-to-pony matches are metadata, separate from whether a particular pack actually grants that pet.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/game.ts` | Save migration, care, progression, economy, shop and pet-drop rules |
| `src/pet.ts` | Sprite behavior, props, dirt, bathing, transformation and visitors |
| `src/backgrounds.ts`, `scripts/background-curation.json` | Responsive floor projection and the reviewed scenery rotation |
| `src/tetris.ts` | Magic Blocks engine and canvas rendering |
| `src/main.ts` | Screens, controls and interaction feedback |
| `src/save-store.ts`, `src/cloud.ts`, `src/storage.ts` | Revisioned local/cloud saves, invited accounts and device preferences |
| `src/social.ts`, `src/peer-party.ts` | Firebase browser rooms and desktop peer parties |
| `desktop/`, `engines/` | Account access, profile files, native game launch/import and engine modifications |
| `src/finishes.css`, `src/expansion.css` | Rarity finishes and extended game visuals |
| `public/data`, `public/assets` | Catalog metadata and local artwork |
| `scripts/accounts.mjs` | Owner-only terminal account administration |
| `firestore.rules` | Backend access rules |

Read [THIRD_PARTY.md](THIRD_PARTY.md) for artwork attribution and [QA.md](QA.md) for verification scope and external checks that need a configured Firebase project.
