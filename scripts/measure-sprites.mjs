import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'public/data/ponies.json');
const ponies = JSON.parse(await fs.readFile(file, 'utf8'));
const sizes = new Map();
async function size(asset) {
  if (!sizes.has(asset)) {
    const buffer = await fs.readFile(path.join(root, 'public', decodeURIComponent(asset)));
    if (!/^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6))) throw new Error(`Expected a GIF: ${asset}`);
    const dimensions = [buffer.readUInt16LE(6), buffer.readUInt16LE(8)];
    if (dimensions.some(n => n < 1 || n > 8192)) throw new Error(`Invalid sprite dimensions: ${asset}`);
    sizes.set(asset, dimensions);
  }
  return sizes.get(asset);
}
for (const pony of ponies) {
  for (const behavior of pony.behaviors) {
    behavior.sizeRight = await size(behavior.right);
    behavior.sizeLeft = await size(behavior.left);
  }
  pony.spriteSize = (pony.behaviors.find(b => b.name === pony.idle) || pony.behaviors[0]).sizeRight;
}
await fs.writeFile(file, JSON.stringify(ponies));
console.log(`Measured ${sizes.size} animations for ${ponies.length} ponies.`);
