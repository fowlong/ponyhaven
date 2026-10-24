import { deflateSync, inflateSync } from 'node:zlib';

export const EQR_HEADER = 32;
export function packRegion(chunks, stateIds, minY = -4, maxY = 19) {
  const height = maxY - minY + 1, table = Buffer.alloc(EQR_HEADER + 1024 * height * 8), parts = [table];
  table.write('EQR1'); table.writeInt16LE(minY, 4); table.writeInt16LE(maxY, 6);
  let offset = table.length;
  for (const { slot, chunk } of chunks) for (const section of chunk.sections) {
    if (section.y < minY || section.y > maxY) throw Error('Section outside region store height.');
    const ids = section.names.map(name => { const id=stateIds.get(name); if(id===undefined)throw Error('Unmapped source state: '+name);return id; });
    const at = EQR_HEADER + (slot * height + section.y - minY) * 8;
    if (ids.every(id => id === ids[0])) { table.writeUInt32LE(ids[0], at); continue; }
    const raw = Buffer.allocUnsafe(8192);
    for (let i = 0; i < 4096; i++) raw.writeUInt16LE(ids[section.indices[i]], i * 2);
    const compressed = deflateSync(raw, { level: 6 });
    table.writeUInt32LE(offset, at); table.writeUInt32LE(compressed.length, at + 4);
    parts.push(compressed); offset += compressed.length;
  }
  return Buffer.concat(parts);
}

export function unpackSection(region, slot, sectionY) {
  if(region.toString('ascii',0,4)!=='EQR1' || region.length<EQR_HEADER)throw Error('Invalid Equestria region.');
  const minY=region.readInt16LE(4),maxY=region.readInt16LE(6),height=maxY-minY+1;
  if(height<1 || height>256 || !Number.isInteger(slot) || slot<0 || slot>1023)throw Error('Invalid Equestria region bounds.');
  const result=new Uint16Array(4096);
  if(sectionY<minY || sectionY>maxY)return result;
  const tableEnd=EQR_HEADER+1024*height*8,at=EQR_HEADER+(slot*height+sectionY-minY)*8;
  if(region.length<tableEnd)throw Error('Truncated Equestria region index.');
  const offset=region.readUInt32LE(at),length=region.readUInt32LE(at+4);
  if(!length) {if(offset>65535)throw Error('Invalid uniform state.');return result.fill(offset);}
  if(offset<tableEnd || length>16384 || offset+length>region.length)throw Error('Invalid Equestria region entry.');
  const raw=inflateSync(region.subarray(offset,offset+length),{maxOutputLength:8192});
  if(raw.length!==8192)throw Error('Invalid Equestria section size.');
  for(let i=0;i<4096;i++)result[i]=raw.readUInt16LE(i*2);
  return result;
}
