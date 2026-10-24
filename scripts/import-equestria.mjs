/** Inspect a modern Java world, or export explicitly mapped Luanti MTS sections.
 * This is an offline importer: no Minecraft installation/account is required.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { regionChunks, chunkSections } from '../desktop/equestria/anvil.mjs';
import { readNBT } from '../desktop/equestria/nbt.mjs';
import { sectionSchematic, sectionOrigin } from '../desktop/equestria/schematic.mjs';

const [sourceArg, ...args] = process.argv.slice(2);
const option = name => { const at = args.indexOf(name); return at < 0 ? null : args[at + 1]; };
if (!sourceArg) throw new Error('Usage: node scripts/import-equestria.mjs <extracted-world> [--output <new-directory> --mapping <block-mapping.json>]');
const source = await fs.realpath(path.resolve(sourceArg));
const outputArg = option('--output'), mappingArg = option('--mapping');
if (!!outputArg !== !!mappingArg) throw new Error('Export requires both --output and --mapping. Omit both to inspect the world.');
const output = outputArg ? path.resolve(outputArg) : null;
if (output && (output.toLowerCase() === source.toLowerCase() || output.toLowerCase().startsWith(source.toLowerCase() + path.sep)))
  throw new Error('Export to a new directory outside the source world.');
if (output && await fs.stat(output).then(() => true, () => false)) throw new Error('The output already exists; choose a new directory.');
const mapping = mappingArg ? JSON.parse(await fs.readFile(mappingArg, 'utf8')) : {};
for (const name of ['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']) mapping[name] = { name: 'air' };
const level = readNBT(await fs.readFile(path.join(source, 'level.dat'))).Data;
if (!level) throw new Error('No level metadata found.');
const regionDirectory = path.join(source, 'region');
const files = (await fs.readdir(regionDirectory)).filter(n => /^r\.-?\d+\.-?\d+\.mca$/.test(n)).sort();
if (!files.length) throw new Error('The extracted world has no Overworld .mca files.');
const staging = output ? output + '.partial-' + randomUUID() : null;
if (staging) await fs.mkdir(path.join(staging, 'sections'), { recursive: true });
const counts = new Map(), versions = new Set(), blockEntities = new Map(), digest = createHash('sha256');
const index = [], missing = new Set(), commands = [];
let chunks = 0, sections = 0;
const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
for (const file of files) {
  const buffer = await fs.readFile(path.join(regionDirectory, file));
  digest.update(file); digest.update(buffer);
  const [, rx, rz] = /^r\.(-?\d+)\.(-?\d+)\.mca$/.exec(file);
  for (const { slot, chunk: raw } of regionChunks(buffer)) {
    const chunk = chunkSections(raw);
    if (chunk.x !== Number(rx) * 32 + slot % 32 || chunk.z !== Number(rz) * 32 + Math.floor(slot / 32))
      throw new Error(`Mismatched chunk coordinates in ${file} slot ${slot}.`);
    chunks++; versions.add(chunk.version);
    for (const entity of chunk.blockEntities) {
      blockEntities.set(entity.id || 'unknown', (blockEntities.get(entity.id || 'unknown') || 0) + 1);
      if(entity.id==='minecraft:command_block')commands.push({x:entity.x,y:entity.y,z:-entity.z,command:entity.Command});
    }
    for (const section of chunk.sections) {
      sections++;
      const origin = sectionOrigin(chunk.x, section.y, chunk.z);
      for (const axis of ['x', 'y', 'z']) {
        min[axis] = Math.min(min[axis], origin[axis]); max[axis] = Math.max(max[axis], origin[axis] + 15);
        if (Math.abs(origin[axis]) > 30900) throw new Error('World exceeds the supported Luanti coordinate range.');
      }
      const histogram = new Uint32Array(section.names.length);
      if(section.names.length===1)histogram[0]=4096;
      else for (const id of section.indices) histogram[id]++;
      for(let id=0;id<histogram.length;id++)counts.set(section.names[id],(counts.get(section.names[id])||0)+histogram[id]);
      if (!output) continue;
      const unresolved = section.names.filter(name => !Object.hasOwn(mapping, name));
      if (unresolved.length) { unresolved.forEach(name => missing.add(name)); continue; }
      const filename = `${chunk.x}_${section.y}_${chunk.z}.mts`;
      const mts = sectionSchematic(section, (_state, i) => mapping[section.names[i]]);
      await fs.writeFile(path.join(staging, 'sections', filename), mts);
      index.push({ file: filename, ...origin });
    }
  }
  console.log(`${file}: ${chunks} chunks inspected`);
}
const report = { format: 1, engine: 'luanti', source: 'https://www.planetminecraft.com/project/equestria-6/',
  sourceHash: digest.digest('hex'), levelName: level.LevelName, dataVersions: [...versions],
  spawn: { x: level.SpawnX, y: level.SpawnY, z: -level.SpawnZ },
  regions: files.length, chunks, sections, min, max, blockEntities: Object.fromEntries(blockEntities), commands,
  blockStates: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))),
  unmapped: [...missing].sort(), gameplayReady: false,
  note: 'Schematic export only. Block entity behavior, terrain smoothing, gameplay and Luanti validation remain required.' };
if (staging) {
  await fs.writeFile(path.join(staging, 'import-report.json'), JSON.stringify(report, null, 2));
  if (missing.size) throw new Error(`${missing.size} block states need mappings. Report retained in ${staging}; no completed world was published.`);
  await fs.writeFile(path.join(staging, 'sections.json'), JSON.stringify(index));
  await fs.rename(staging, output);
  console.log(`Exported ${sections} sections to ${output}. This is map data, not yet a playable game.`);
} else {
  const reportFile = path.resolve('tmp/equestria-world-report.json');
  await fs.mkdir(path.dirname(reportFile), { recursive: true });
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
  console.log(`Inspection report: ${reportFile}`);
}
