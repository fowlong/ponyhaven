import { gunzipSync, inflateSync } from 'node:zlib';
import { readNBT } from './nbt.mjs';

const MAX_CHUNK = 32 * 1024 * 1024;

/** Read allocated chunks only; never execute command blocks or source-world scripts. */
export function* regionChunks(data) {
  if (data.length < 8192 || data.length % 4096 !== 0) throw new Error('Invalid Anvil region length.');
  const used = new Set([0, 1]);
  for (let slot = 0; slot < 1024; slot++) {
    const sector = data.readUIntBE(slot * 4, 3), count = data[slot * 4 + 3];
    if (!sector && !count) continue;
    if (sector < 2 || !count || (sector + count) * 4096 > data.length) throw new Error(`Invalid Anvil chunk location at ${slot}.`);
    for (let s = sector; s < sector + count; s++) {
      if (used.has(s)) throw new Error('Overlapping Anvil chunks.');
      used.add(s);
    }
    const start = sector * 4096, length = data.readUInt32BE(start), compression = data[start + 4];
    if (compression & 128) throw new Error('External .mcc chunks require a separate importer; no chunks have been skipped.');
    if (length < 2 || length + 4 > count * 4096) throw new Error('Invalid Anvil compressed length.');
    const bytes = data.subarray(start + 5, start + 4 + length);
    let raw;
    if (compression === 1) raw = gunzipSync(bytes, { maxOutputLength: MAX_CHUNK });
    else if (compression === 2) raw = inflateSync(bytes, { maxOutputLength: MAX_CHUNK });
    else if (compression === 3) raw = bytes;
    else throw new Error(`Unsupported Anvil compression ${compression}; no chunks have been skipped.`);
    yield { slot, chunk: readNBT(raw) };
  }
}

export function stateKey(state) {
  if (!state || !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(state.Name)) throw new Error('Invalid block-state name.');
  const properties = Object.entries(state.Properties || {}).sort(([a], [b]) => a.localeCompare(b));
  if (properties.some(([k, v]) => !/^[a-z0-9_]+$/.test(k) || typeof v !== 'string' || !/^[a-z0-9_-]+$/.test(v)))
    throw new Error('Invalid block-state properties.');
  return state.Name + (properties.length ? '[' + properties.map(([k, v]) => `${k}=${v}`).join(',') + ']' : '');
}

/** Minecraft 1.13+ palette decoding, including the post-1.16 padded long layout. */
export function decodeSection(section, dataVersion) {
  const modern = section.block_states;
  const palette = modern?.palette || section.Palette;
  if (!palette) return null; // biome/light-only sections contain no block data.
  if (!Array.isArray(palette) || !palette.length || palette.length > 4096 || !Number.isInteger(section.Y))
    throw new Error('Invalid Anvil section palette.');
  const names = palette.map(stateKey), indices = new Uint16Array(4096);
  if (palette.length === 1) return { y: section.Y, palette, names, indices };
  const longs = modern?.data || section.BlockStates;
  const bits = Math.max(4, Math.ceil(Math.log2(palette.length)));
  const perLong = Math.floor(64 / bits), padded = dataVersion >= 2529;
  const expected = padded ? Math.ceil(4096 / perLong) : Math.ceil(4096 * bits / 64);
  if (!Array.isArray(longs) || longs.length !== expected || longs.some(n => typeof n !== 'bigint'))
    throw new Error('Invalid packed block-state data.');
  // Decode with 32-bit halves. BigInt shifts for every block are prohibitively
  // expensive on full-world imports; only convert each packed long once.
  const words = new Uint32Array(longs.length * 2);
  for (let i = 0; i < longs.length; i++) {
    words[i * 2] = Number(BigInt.asUintN(32, longs[i]));
    words[i * 2 + 1] = Number(BigInt.asUintN(32, longs[i] >> 32n));
  }
  const mask = (1 << bits) - 1;
  for (let i = 0; i < 4096; i++) {
    const bit = padded ? (i % perLong) * bits : (i * bits) % 64;
    const word = padded ? Math.floor(i / perLong) : Math.floor(i * bits / 64);
    const half = word * 2 + (bit >= 32 ? 1 : 0), shift = bit % 32;
    let n = words[half] >>> shift;
    if (shift + bits > 32) n |= words[half + 1] << (32 - shift);
    const index = n & mask;
    if (index >= palette.length) throw new Error('Block palette index out of range.');
    indices[i] = index;
  }
  return { y: section.Y, palette, names, indices };
}

export function chunkSections(root) {
  const chunk = root.Level || root;
  const version = root.DataVersion ?? chunk.DataVersion;
  if (!Number.isInteger(version) || version < 1451) throw new Error('This importer requires Minecraft 1.13+ palette worlds.');
  if (!Number.isInteger(chunk.xPos) || !Number.isInteger(chunk.zPos)) throw new Error('Missing Anvil chunk coordinates.');
  const sections = chunk.sections || chunk.Sections;
  if (!Array.isArray(sections)) throw new Error('Missing Anvil sections.');
  const decoded = sections.map(s => decodeSection(s, version)).filter(Boolean);
  if (new Set(decoded.map(s => s.y)).size !== decoded.length) throw new Error('Duplicate Anvil section heights.');
  return { x: chunk.xPos, z: chunk.zPos, version, sections: decoded,
    blockEntities: chunk.block_entities || chunk.TileEntities || [] };
}
