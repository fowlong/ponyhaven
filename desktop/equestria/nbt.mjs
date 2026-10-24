import { gunzipSync } from 'node:zlib';

const MAX_BYTES = 32 * 1024 * 1024;

/** Bounded big-endian Java Edition NBT reader. Longs remain exact BigInts. */
export function readNBT(input) {
  let data = Buffer.from(input);
  if (data[0] === 0x1f && data[1] === 0x8b) data = gunzipSync(data, { maxOutputLength: MAX_BYTES });
  if (data.length > MAX_BYTES) throw new Error('NBT data exceeds 32 MiB.');
  let offset = 0, tags = 0;
  const take = n => {
    if (!Number.isSafeInteger(n) || n < 0 || offset + n > data.length) throw new Error('Truncated or invalid NBT data.');
    const start = offset; offset += n; return start;
  };
  const u8 = () => data.readUInt8(take(1));
  const i32 = () => data.readInt32BE(take(4));
  const length = () => {
    const n = i32();
    if (n < 0 || n > 1_000_000) throw new Error('Invalid NBT array length.');
    return n;
  };
  const string = () => {
    const n = data.readUInt16BE(take(2));
    return data.toString('utf8', take(n), offset);
  };
  function value(type, depth) {
    if (++tags > 1_000_000 || depth > 64) throw new Error('NBT nesting or tag limit exceeded.');
    switch (type) {
      case 1: return data.readInt8(take(1));
      case 2: return data.readInt16BE(take(2));
      case 3: return i32();
      case 4: return data.readBigInt64BE(take(8));
      case 5: return data.readFloatBE(take(4));
      case 6: return data.readDoubleBE(take(8));
      case 7: { const n = length(); const p = take(n); return data.subarray(p, p + n); }
      case 8: return string();
      case 9: {
        const subtype = u8(), n = length();
        if (!subtype && n) throw new Error('Nonempty TAG_End list.');
        return Array.from({ length: n }, () => value(subtype, depth + 1));
      }
      case 10: {
        const out = Object.create(null);
        for (let type = u8(); type; type = u8()) {
          const name = string();
          if (Object.hasOwn(out, name)) throw new Error('Duplicate NBT tag name.');
          out[name] = value(type, depth + 1);
        }
        return out;
      }
      case 11: return Array.from({ length: length() }, () => i32());
      case 12: return Array.from({ length: length() }, () => data.readBigInt64BE(take(8)));
      default: throw new Error(`Unsupported NBT tag ${type}.`);
    }
  }
  if (u8() !== 10) throw new Error('Expected an NBT compound root.');
  string();
  return value(10, 0);
}
