import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const cached = process.argv.includes('--cached');
const cache = path.join(root, 'tmp');
await fs.mkdir(cache, { recursive: true });
async function download(url, dest) {
  const res = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
}
if (!cached) {
  await download(
    'https://api.github.com/repos/RoosterDragon/Desktop-Ponies/git/trees/master?recursive=1',
    path.join(cache, 'pony-tree.json'),
  );
  const { sha } = JSON.parse(await fs.readFile(path.join(cache, 'pony-tree.json'), 'utf8'));
  await download(
    `https://codeload.github.com/RoosterDragon/Desktop-Ponies/zip/${sha}`,
    path.join(cache, 'desktop-ponies.zip'),
  );
  execFileSync('python', [
    '-m',
    'zipfile',
    '-e',
    path.join(cache, 'desktop-ponies.zip'),
    path.join(cache, 'upstream'),
  ]);
  for (let page = 1; page <= 100; page++) {
    const dest = path.join(cache, `products-${page}.json`);
    await download(
      `https://mylittlecardcollection.com/collections/all-singles/products.json?limit=250&page=${page}`,
      dest,
    );
    const { products } = JSON.parse(await fs.readFile(dest, 'utf8'));
    console.log(`Catalog page ${page}: ${products.length} listings`);
    if (!products.length) break;
    if (page === 100) throw new Error('Pagination safety limit reached; refusing an incomplete import.');
    await new Promise((r) => setTimeout(r, 400));
  }
}
const tree = JSON.parse(await fs.readFile(path.join(cache, 'pony-tree.json'), 'utf8'));
if (tree.truncated) throw new Error('Incomplete source tree');
const upstream = path.join(cache, 'upstream', `Desktop-Ponies-${tree.sha}`, 'Content');
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const normalize = (s) =>
  s
    .toLowerCase()
    .replace(/princess |queen |king |lord |miss |the great and powerful /g, '')
    .replace(/[^a-z0-9]/g, '');
const maneNames = ['Twilight Sparkle', 'Pinkie Pie', 'Rainbow Dash', 'Fluttershy', 'Rarity', 'Applejack'];
const palettes = {
  'twilight-sparkle': '#b788cc',
  'pinkie-pie': '#ed8fbb',
  'rainbow-dash': '#77c8e3',
  fluttershy: '#e6cf79',
  rarity: '#ae9cd6',
  applejack: '#e9ae63',
  trixie: '#7ab4de',
  'starlight-glimmer': '#c49bce',
  lyra: '#7eceba',
  'princess-luna': '#7772c7',
  'princess-celestia': '#b5dcd9',
  'princess-cadance': '#e8a6d0',
  'sweetie-belle': '#d5b1e3',
  'sunset-shimmer': '#e0ac60',
};
function csv(line) {
  const fields = [];
  let field = '',
    quote = false,
    braces = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quote && line[i + 1] === '"') {
        field += '"';
        i++;
      } else quote = !quote;
    } else if (c === '{' && !quote) {
      braces++;
      field += c;
    } else if (c === '}' && !quote) {
      braces--;
      field += c;
    } else if (c === ',' && !quote && braces === 0) {
      fields.push(field.trim());
      field = '';
    } else field += c;
  }
  fields.push(field.trim());
  return fields;
}
const ponies = [];
const artPaths = new Map(
  tree.tree.filter((f) => f.path.startsWith('Content/Ponies/')).map((f) => [f.path.toLowerCase(), f.path]),
);
const usedArt = new Set();
for (const file of tree.tree.filter((f) => /Content\/Ponies\/[^/]+\/pony.ini$/i.test(f.path))) {
  const folder = file.path.split('/')[2];
  const lines = (await fs.readFile(path.join(upstream, 'Ponies', folder, 'pony.ini'), 'utf8'))
    .split(/\r?\n/)
    .map(csv);
  const name = lines.find((l) => l[0].toLowerCase() === 'name')?.[1] || folder;
  const id = slug(folder);
  const categories = lines.filter((l) => l[0].toLowerCase() === 'categories').flatMap((l) => l.slice(1));
  function asset(fileName) {
    const actual = artPaths.get(`Content/Ponies/${folder}/${fileName}`.toLowerCase());
    if (!actual) return null;
    usedArt.add(actual);
    return `assets/ponies/${actual.split('/').slice(2).map(encodeURIComponent).join('/')}`;
  }
  const behaviors = lines
    .filter((l) => l[0].toLowerCase() === 'behavior')
    .map((l) => ({
      name: l[1],
      chance: Number(l[2]) || 0,
      max: Number(l[3]) || 6,
      min: Number(l[4]) || 3,
      speed: Number(l[5]) || 0,
      right: asset(l[6]),
      left: asset(l[7]),
      movement: l[8],
      next: l[9] || null,
      skip: String(l[12]).toLowerCase() === 'true',
      followTarget: l[15] || null,
      targetX: Number(l[13]) || 0,
      targetY: Number(l[14]) || 0,
    }))
    .filter((b) => b.right && b.left);
  if (!behaviors.length) throw new Error(`No working behavior for ${name}`);
  const idle =
    behaviors.find((b) => /^(stand|idle|stand1)$/i.test(b.name)) ||
    behaviors.find((b) => !b.speed && b.chance > 0) ||
    behaviors[0];
  const walk =
    behaviors.find((b) => /^(walk|trot|walking)$/i.test(b.name)) ||
    behaviors.find((b) => b.speed > 0 && b.chance > 0) ||
    idle;
  const speech = lines
    .filter((l) => l[0].toLowerCase() === 'speak' && l[2])
    .map((l) => l[2])
    .slice(0, 12);
  const list = (s) =>
    (s || '')
      .replace(/[{}\"]/g, '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  const effects = lines
    .filter((l) => l[0].toLowerCase() === 'effect')
    .map((l) => ({
      name: l[1],
      behavior: l[2],
      right: asset(l[3]),
      left: asset(l[4]),
      duration: Number(l[5]) || 0,
      repeat: Number(l[6]) || 0,
      placementRight: l[7] || 'Center',
      centeringRight: l[8] || 'Center',
      placementLeft: l[9] || 'Center',
      centeringLeft: l[10] || 'Center',
      follow: l[11] === 'True',
    }))
    .filter((e) => e.left && e.right);
  const interactions = lines
    .filter((l) => l[0].toLowerCase() === 'interaction')
    .map((l) => ({
      name: l[1],
      chance: Number(l[2]) || 0,
      proximity: Number(l[3]) || 100,
      targets: list(l[4]),
      activation: l[5],
      behaviors: list(l[6]),
      cooldown: Number(l[7]) || 60,
    }));
  const color = palettes[id] || ['#b8a1d3', '#94c5ba', '#e4b58e', '#b1bde3', '#dfa6c6'][ponies.length % 5];
  ponies.push({
    id,
    name,
    folder,
    categories,
    unicorn: categories.some((c) => /unicorn|alicorn/i.test(c)),
    color,
    mane: maneNames.includes(folder),
    idle: idle.name,
    walk: walk.name,
    behaviors,
    speech,
    effects,
    interactions,
  });
}
await fs.mkdir('public/data', { recursive: true });
for (const rel of usedArt) {
  const dest = path.join(root, 'public/assets/ponies', ...rel.split('/').slice(2));
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(path.join(upstream, ...rel.split('/').slice(1)), dest);
}
await fs.copyFile(path.join(upstream, 'credits.txt'), 'public/data/desktop-ponies-credits.txt');
const ponyNames = new Map(ponies.map((p) => [normalize(p.folder), p.id]));
for (const p of ponies) if (!ponyNames.has(normalize(p.name))) ponyNames.set(normalize(p.name), p.id);
for (const [alias, match] of Object.entries({
  'apple jack': 'Applejack',
  'derpy hooves': 'Derpy Hooves',
  muffins: 'Derpy Hooves',
  'dj pon 3': 'Vinyl Scratch',
  'dj pon3': 'Vinyl Scratch',
  vinyl: 'Vinyl Scratch',
  'lyra heartstrings': 'Lyra',
  'bon bon': 'Bon Bon',
  'sweetie drops': 'Bon Bon',
  cherrilee: 'Cheerilee',
  cheerilee: 'Cheerilee',
  'star swirl': 'Starswirl the Bearded',
  starswirl: 'Starswirl the Bearded',
  'rock hoof': 'Rockhoof',
  cadence: 'Princess Cadance',
})) {
  const target =
    ponies.find((p) => normalize(p.folder) === normalize(match)) ||
    ponies.find((p) => normalize(p.name) === normalize(match));
  if (target) ponyNames.set(normalize(alias), target.id);
}
const products = [];
let complete = false;
for (let n = 1; n <= 100; n++) {
  const filename = path.join(cache, `products-${n}.json`);
  if (!existsSync(filename)) break;
  const batch = JSON.parse(await fs.readFile(filename, 'utf8')).products;
  if (!batch.length) {
    complete = true;
    break;
  }
  products.push(...batch);
}
if (!complete)
  throw new Error('Missing empty final catalog page. Refusing to publish an incomplete catalog.');
const sets = new Map();
const cards = new Map();
const skipped = [];
const inferred = [];
const levels = {
  N: 0,
  'N*': 1,
  BASE: 0,
  R: 1,
  SR: 2,
  SSR: 3,
  HR: 3,
  TR: 3,
  FR: 3,
  UR: 4,
  USR: 5,
  LSR: 5,
  SGR: 6,
  CR: 6,
  TGR: 4,
  MTR: 4,
  SCR: 5,
  SC: 5,
  PR: 5,
  PTR: 5,
  AR: 6,
  OR: 6,
  SP: 5,
  XR: 6,
  ZR: 6,
  '*ZR': 7,
  '*AR': 7,
  BP: 6,
  HN01: 4,
  UGR: 5,
  ST: 4,
};
function addSet(key, family, edition, region = 'Chinese', custom = false) {
  key = key.toLowerCase();
  if (!sets.has(key))
    sets.set(key, {
      id: key,
      name: `${family}${edition ? ' ' + edition : ''}`,
      family,
      edition,
      region,
      custom,
      price: custom ? 75 : 60,
      color:
        family === 'Moon'
          ? '#8470b2'
          : family === 'Rainbow'
            ? '#d68ca7'
            : family === 'Adventure'
              ? '#7ca994'
              : '#cfab70',
    });
  return key;
}
for (const product of products) {
  const tags = product.tags.map((t) => t.toUpperCase());
  if (
    /^\*|mini.binder|booster|sealed|deck|\bbox\b/i.test(product.title) ||
    tags.some((t) => /SEALED/.test(t))
  ) {
    skipped.push({ id: product.id, reason: 'accessory or sealed product' });
    continue;
  }
  const rarity = [...product.title.matchAll(/\(([A-Z*][A-Z0-9*]{0,7})\)/g)]
    .map((m) => m[1])
    .find(
      (r) =>
        r in levels || ['RR', 'ER', 'GR', 'SPR', 'C', 'U', '*RR', '*CR', '*GR', '*ER', '*SPR'].includes(r),
    );
  const code = product.title
    .match(/\b(?:[A-Z]{1,8}\d{0,3}-)+(?:\*?[A-Z]{1,5}\d{0,3}-)?\d{1,4}\b/i)?.[0]
    ?.toUpperCase();
  if (
    tags.some((t) => /^GAME/.test(t)) ||
    /\b(?:BP|BPE|MLPCCG|CCG|GD|SD)0?\d-/i.test(product.title) ||
    /\b(?:phantom fiction|discord moment|card game)\b/i.test(product.title)
  ) {
    skipped.push({ id: product.id, reason: 'playable card game' });
    continue;
  }
  if (!rarity || !code || !product.images.length) {
    skipped.push({ id: product.id, title: product.title, reason: 'unrecognized card metadata' });
    continue;
  }
  let memberships = tags
    .map((tag) => tag.match(/^(MOON|RAINBOW|ADVENTURE|FUNMOMENTS)(\d+)(NA|SEA|C)?(?:-|$)/))
    .filter(Boolean)
    .map((m) =>
      addSet(
        `${m[1]}${m[2]}${m[3] || 'C'}`,
        { MOON: 'Moon', RAINBOW: 'Rainbow', ADVENTURE: 'Adventure', FUNMOMENTS: 'Fun Moments' }[m[1]],
        Number(m[2]),
        { NA: 'North American English', SEA: 'Overseas English', C: 'Chinese' }[m[3] || 'C'],
      ),
    );
  let membershipSource = memberships.length ? 'source tags' : 'code inference';
  if (!memberships.length) {
    const rules = [
      [/^FX(\d+)/, 'Adventure', 'C'],
      [/^QY(\d+)/, 'Fun Moments', 'C'],
      [/^FME(\d+)/, 'Fun Moments', 'NA'],
      [/^RBE(\d+)/, 'Rainbow', 'NA'],
      [/^MLPME(\d+)/, 'Moon', 'SEA'],
      [/^HY(\d+)/, 'Moon', 'C'],
    ];
    const rule = rules.find(([re]) => re.test(code));
    if (rule) {
      const edition = Number(code.match(rule[0])[1]);
      memberships = [
        addSet(
          `${rule[1].replaceAll(' ', '').toUpperCase()}${edition}${rule[2]}`,
          rule[1],
          edition,
          { NA: 'North American English', SEA: 'Overseas English', C: 'Chinese' }[rule[2]],
        ),
      ];
    } else {
      memberships = [addSet('friendship-specials', 'Friendship Specials', null, 'Fan-made assortment', true)];
      membershipSource = 'fan-made fallback';
    }
    inferred.push({ code, sets: memberships, source: membershipSource });
  }
  const rawName = product.title
    .split('(')[0]
    .replace(/\s*-\s*$/, '')
    .trim();
  const names = /mane (6|six)/i.test(rawName) ? maneNames : rawName.split(/\s*(?:&|\band\b|,|\/)\s*/i);
  const ponyIds = [...new Set(names.map((n) => ponyNames.get(normalize(n))).filter(Boolean))];
  const region = sets.get(memberships[0]).region;
  const id = `${slug(code)}-${slug(region)}`;
  const existing = cards.get(id);
  if (existing) {
    existing.sets = [...new Set([...existing.sets, ...memberships])];
    if (!/damaged|played/i.test(product.title) && existing.conditionListing) {
      existing.image = product.images[0].src;
      existing.source = `https://mylittlecardcollection.com/products/${product.handle}`;
      existing.conditionListing = false;
    }
    continue;
  }
  cards.set(id, {
    id,
    name: rawName,
    code,
    rarity,
    tier: levels[rarity] ?? 3,
    sets: memberships,
    membershipSource,
    ponyIds,
    image: product.images[0].src,
    source: `https://mylittlecardcollection.com/products/${product.handle}`,
    conditionListing: /damaged|played/i.test(product.title),
  });
}
const cardList = [...cards.values()].sort((a, b) => a.code.localeCompare(b.code));
for (const p of ponies.filter((p) => p.mane)) {
  const choices = cardList.filter(
    (c) => c.ponyIds.length === 1 && c.ponyIds[0] === p.id && !c.conditionListing,
  );
  p.starterCard =
    choices.find((c) => c.code.startsWith('YH-F01') && c.rarity === 'SR')?.id ||
    choices.find((c) => c.rarity === 'SR')?.id ||
    choices[0]?.id;
  if (!p.starterCard) throw new Error(`No starter card for ${p.name}`);
}
const setList = [...sets.values()]
  .filter((s) => cardList.some((c) => c.sets.includes(s.id)))
  .sort((a, b) => a.id.localeCompare(b.id));
const report = {
  importedAt: new Date().toISOString(),
  sourceListings: products.length,
  uniqueCards: cardList.length,
  excluded: skipped.length,
  playableExcluded: skipped.filter((s) => s.reason === 'playable card game').length,
  ponies: ponies.length,
  behaviors: ponies.reduce((n, p) => n + p.behaviors.length, 0),
  sets: setList.length,
  matchedCards: cardList.filter((c) => c.ponyIds.length).length,
  spriteCommit: tree.sha,
  inferredMemberships: inferred,
  unrecognized: skipped.filter((s) => s.reason === 'unrecognized card metadata'),
};
await fs.writeFile('public/data/ponies.json', JSON.stringify(ponies));
await fs.writeFile('public/data/cards.json', JSON.stringify(cardList));
await fs.writeFile('public/data/sets.json', JSON.stringify(setList));
await fs.writeFile('public/data/catalog-report.json', JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      ...report,
      inferredMemberships: report.inferredMemberships.length,
      unrecognized: report.unrecognized.length,
    },
    null,
    2,
  ),
);
