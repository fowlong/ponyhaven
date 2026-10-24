import { deflateSync } from 'node:zlib';

/** Luanti MTS v4. Map coordinates preserve X/Y and reverse Minecraft's Z axis. */
export function sectionSchematic(section, mapState) {
  const mapped = section.palette.map(mapState);
  if (mapped.some(n => !n || !/^[a-z0-9_]+:[a-z0-9_]+$|^air$/.test(n.name) || !Number.isInteger(n.param2 ?? 0) || (n.param2 ?? 0) < 0 || (n.param2 ?? 0) > 255))
    throw new Error('Every source block state needs an explicit Luanti mapping.');
  const names = [...new Set(mapped.map(n => n.name))], ids = new Map(names.map((n, i) => [n, i]));
  const header = Buffer.alloc(12 + 16 + 2);
  header.write('MTSM'); header.writeUInt16BE(4, 4);
  for (const at of [6, 8, 10]) header.writeUInt16BE(16, at);
  header.fill(127, 12, 28); header.writeUInt16BE(names.length, 28);
  const table = names.map(name => {
    const text = Buffer.from(name), size = Buffer.alloc(2);
    size.writeUInt16BE(text.length); return Buffer.concat([size, text]);
  });
  const data = Buffer.alloc(4096 * 4);
  data.fill(127, 4096 * 2, 4096 * 3);
  for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const source = y * 256 + z * 16 + x;
    const target = (15 - z) * 256 + y * 16 + x;
    const node = mapped[section.indices[source]];
    data.writeUInt16BE(ids.get(node.name), target * 2);
    data[4096 * 3 + target] = node.param2 || 0;
  }
  return Buffer.concat([header, ...table, deflateSync(data)]);
}

export const sectionOrigin = (x, sectionY, z) => ({ x: x * 16, y: sectionY * 16, z: -z * 16 - 15 });
