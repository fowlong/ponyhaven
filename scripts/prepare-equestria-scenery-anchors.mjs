// Add invisible degenerate faces around the network anchor, so native frustum
// culling cannot discard an absolute-coordinate mesh before its shader runs.
import fs from 'node:fs/promises';
import {inflateSync,deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const mod='native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven';
const file=mod+'/horizon.json',h=JSON.parse(await fs.readFile(file,'utf8'));
let changed=0;
for(const tile of h.tiles.flatMap(t=>[t,t.low])){
 const filename=mod+'/scenery/'+tile.mesh+'.deflate';let obj=inflateSync(await fs.readFile(filename)).toString();
 if(obj.includes('# Network anchor bounds')){
  const data=Buffer.from(obj),hash=createHash('sha1').update(data).digest('hex');
  if(tile.sha1!==hash){tile.sha1=hash;tile.bytes=data.length;tile.triangles+=2;}
  continue;
 }
 const n=(obj.match(/^v /gm)||[]).length;
 obj+='\n# Network anchor bounds (zero-area triangles, never rasterized)\nv -160 -160 -160\nv 160 160 160\n'+`f ${n+1}/1/1 ${n+1}/1/1 ${n+1}/1/1\nf ${n+2}/1/1 ${n+2}/1/1 ${n+2}/1/1\n`;
 const data=Buffer.from(obj);tile.sha1=createHash('sha1').update(data).digest('hex');tile.bytes=data.length;tile.triangles+=2;
 await fs.writeFile(filename,deflateSync(data,{level:6}));changed++;
 if(changed%1000===0)console.log('Anchored',changed,'scenery meshes');
}
h.anchorGuard=true;await fs.writeFile(file,JSON.stringify(h));console.log('Scenery anchor bounds ready:',changed,'meshes updated.');
