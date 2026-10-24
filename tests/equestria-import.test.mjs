import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, inflateSync, gzipSync } from 'node:zlib';
import { readNBT } from '../desktop/equestria/nbt.mjs';
import { regionChunks, decodeSection, chunkSections } from '../desktop/equestria/anvil.mjs';
import { sectionSchematic, sectionOrigin } from '../desktop/equestria/schematic.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const short = n => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const int = n => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const string = s => Buffer.concat([short(Buffer.byteLength(s)), Buffer.from(s)]);
const tag = (type, name, bytes) => Buffer.concat([Buffer.from([type]), string(name), bytes]);
const compound = tags => Buffer.concat([...tags, Buffer.from([0])]);
const root = tags => Buffer.concat([Buffer.from([10, 0, 0]), compound(tags)]);

function packed(indices, bits, padded) {
  const count = Math.floor(64 / bits);
  const words = Array.from({ length: padded ? Math.ceil(indices.length / count) : Math.ceil(indices.length * bits / 64) }, () => 0n);
  indices.forEach((v, i) => {
    const pos = padded ? Math.floor(i / count) : Math.floor(i * bits / 64);
    const bit = padded ? i % count * bits : i * bits % 64;
    words[pos] |= BigInt(v) << BigInt(bit);
    if (!padded && bit + bits > 64) words[pos + 1] |= BigInt(v) >> BigInt(64 - bit);
  });
  return words.map(n => BigInt.asIntN(64, n));
}

test('NBT keeps signed heights, exact 64-bit states and safe compound keys', () => {
  const long = Buffer.alloc(8); long.writeBigInt64BE(-1n);
  const data = root([tag(1, 'Y', Buffer.from([252])), tag(12, 'data', Buffer.concat([int(1), long])),
    tag(8, '__proto__', string('inert source data'))]);
  for (const source of [data, gzipSync(data)]) {
    const nbt = readNBT(source);
    assert.equal(nbt.Y, -4);
    assert.deepEqual(nbt.data, [-1n]);
    assert.equal(Object.getPrototypeOf(nbt), null);
    assert.equal(nbt.__proto__, 'inert source data');
  }
  assert.throws(() => readNBT(data.subarray(0, data.length - 1)), /Truncated/);
  assert.throws(() => readNBT(root([tag(12, 'bad', int(-1))])), /array length/);
});

test('Anvil parses a modern negative-height chunk without Minecraft installed', () => {
  const palette = compound([tag(8, 'Name', string('minecraft:stone'))]);
  const states = compound([tag(9, 'palette', Buffer.concat([Buffer.from([10]), int(1), palette]))]);
  const section = compound([tag(1, 'Y', Buffer.from([252])), tag(10, 'block_states', states)]);
  const nbt = root([tag(3, 'DataVersion', int(2975)), tag(3, 'xPos', int(-2)), tag(3, 'zPos', int(3)),
    tag(9, 'sections', Buffer.concat([Buffer.from([10]), int(1), section]))]);
  const compressed = deflateSync(nbt), region = Buffer.alloc(12288);
  region.writeUIntBE(2, 0, 3); region[3] = 1;
  region.writeUInt32BE(compressed.length + 1, 8192); region[8196] = 2; compressed.copy(region, 8197);
  const [{ chunk }] = [...regionChunks(region)];
  const decoded = chunkSections(chunk);
  assert.equal(decoded.x, -2); assert.equal(decoded.z, 3);
  assert.equal(decoded.sections[0].y, -4);
  assert.equal(decoded.sections[0].indices.length, 4096);
  assert.deepEqual(sectionOrigin(-2, -4, 3), { x: -32, y: -64, z: -63 });
  region.writeUIntBE(2, 4, 3); region[7] = 1;
  assert.throws(() => [...regionChunks(region)], /Overlapping/);
  region.fill(0, 4, 8); region[8196] = 130;
  assert.throws(() => [...regionChunks(region)], /External/);
});

test('both packed layouts preserve all 4096 block indices across long boundaries', () => {
  const palette = Array.from({ length: 17 }, (_, i) => ({ Name: `minecraft:block_${i}` }));
  const expected = Array.from({ length: 4096 }, (_, i) => i % 17);
  for (const padded of [false, true]) {
    const section = decodeSection({ Y: 0, Palette: palette, BlockStates: packed(expected, 5, padded) }, padded ? 2975 : 1976);
    assert.deepEqual([...section.indices], expected);
  }
  assert.throws(() => decodeSection({ Y: 0, Palette: palette, BlockStates: [] }, 2975), /packed/);
});

test('MTS v4 preserves air, node identity, orientation and the X/Y/-Z transform', () => {
  const indices = new Uint16Array(4096); indices[2 * 256 + 3 * 16 + 4] = 1;
  const section = { y: 0, palette: [{ Name: 'minecraft:air' }, { Name: 'minecraft:oak_stairs' }], indices };
  const mts = sectionSchematic(section, s => s.Name === 'minecraft:air' ? { name: 'air' } : { name: 'ponyhaven:stairs', param2: 3 });
  assert.equal(mts.toString('ascii', 0, 4), 'MTSM');
  assert.equal(mts.readUInt16BE(4), 4);
  assert.deepEqual([6, 8, 10].map(at => mts.readUInt16BE(at)), [16, 16, 16]);
  assert.ok([...mts.subarray(12, 28)].every(n => n === 127));
  let offset = 30;
  const names = [];
  for (let i = 0; i < mts.readUInt16BE(28); i++) {
    const n = mts.readUInt16BE(offset); offset += 2;
    names.push(mts.toString('utf8', offset, offset + n)); offset += n;
  }
  const data = inflateSync(mts.subarray(offset)), target = (15 - 3) * 256 + 2 * 16 + 4;
  assert.equal(data.length, 4096 * 4);
  assert.equal(names[data.readUInt16BE(target * 2)], 'ponyhaven:stairs');
  assert.equal(data[4096 * 3 + target], 3);
  assert.equal(names[data.readUInt16BE(0)], 'air');
  assert.throws(() => sectionSchematic(section, () => null), /explicit Luanti mapping/);
});

test('offline export completes only with explicit mappings and preserves the source world', async () => {
  await fs.mkdir('tmp', { recursive: true });
  const folder = await fs.mkdtemp(path.resolve('tmp/equestria-import-'));
  const source = path.join(folder, 'source');
  await fs.mkdir(path.join(source, 'region'), { recursive: true });
  const level = root([tag(10, 'Data', compound([tag(8, 'LevelName', string('Importer fixture')),
    tag(3, 'SpawnX', int(0)), tag(3, 'SpawnY', int(-48)), tag(3, 'SpawnZ', int(0))]))]);
  await fs.writeFile(path.join(source, 'level.dat'), gzipSync(level));
  const palette = compound([tag(8, 'Name', string('minecraft:stone'))]);
  const states = compound([tag(9, 'palette', Buffer.concat([Buffer.from([10]), int(1), palette]))]);
  const section = compound([tag(1, 'Y', Buffer.from([252])), tag(10, 'block_states', states)]);
  const compressed = deflateSync(root([tag(3, 'DataVersion', int(2975)), tag(3, 'xPos', int(0)), tag(3, 'zPos', int(0)),
    tag(9, 'sections', Buffer.concat([Buffer.from([10]), int(1), section]))]));
  const region = Buffer.alloc(12288);
  region.writeUIntBE(2, 0, 3); region[3] = 1;
  region.writeUInt32BE(compressed.length + 1, 8192); region[8196] = 2; compressed.copy(region, 8197);
  await fs.writeFile(path.join(source, 'region/r.0.0.mca'), region);
  const mapping = path.join(folder, 'mapping.json'), output = path.join(folder, 'export');
  await fs.writeFile(mapping, JSON.stringify({ 'minecraft:stone': { name: 'fixture:stone' } }));
  const command = ['scripts/import-equestria.mjs', source, '--output', output, '--mapping', mapping];
  execFileSync(process.execPath, command, { stdio: 'pipe' });
  const report = JSON.parse(await fs.readFile(path.join(output, 'import-report.json'), 'utf8'));
  assert.equal(report.chunks, 1); assert.equal(report.sections, 1);
  assert.equal(report.blockStates['minecraft:stone'], 4096);
  assert.equal(report.gameplayReady, false);
  assert.equal((await fs.readFile(path.join(output, 'sections/0_-4_0.mts'))).toString('ascii', 0, 4), 'MTSM');
  assert.deepEqual(await fs.readFile(path.join(source, 'region/r.0.0.mca')), region);
  assert.throws(() => execFileSync(process.execPath, command, { stdio: 'pipe' }), /output already exists/);
  await fs.writeFile(mapping, '{}');
  assert.throws(() => execFileSync(process.execPath, ['scripts/import-equestria.mjs', source, '--output', path.join(folder, 'unmapped'), '--mapping', mapping], { stdio: 'pipe' }), /block states need mappings/);
  assert.equal(await fs.stat(path.join(folder, 'unmapped')).then(() => true, () => false), false);
});
