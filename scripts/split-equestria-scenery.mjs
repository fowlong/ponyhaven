// Regroup bundled scenery meshes that exceed Luanti's 16-bit OBJ index range.
// Every existing line is kept in order; only "g" lines are inserted.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateSync,deflateSync} from 'node:zlib';
import {objFaceGrouper,OBJ_GROUP_VERTICES} from '../desktop/equestria/scenery-columns.mjs';
const mod='native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven';
const file=mod+'/horizon.json',h=JSON.parse(await fs.readFile(file,'utf8'));
let changed=0,maxGroups=1;
for(const tile of h.tiles)for(const model of [tile,tile.low]){
 const path=mod+'/scenery/'+model.mesh+'.deflate';
 const lines=inflateSync(await fs.readFile(path)).toString().split('\n');
 if(lines.some(l=>l.startsWith('g ')))throw Error('Already grouped: '+model.mesh);
 // One grouper per file: non-face lines pass through in place without
 // resetting the vertex count of the loader's current group.
 const group=objFaceGrouper(),out=lines.flatMap(l=>l.startsWith('f ')?group(l):[l]);
 const groups=1+out.filter(l=>l.startsWith('g ')).length;maxGroups=Math.max(maxGroups,groups);
 if(groups===1)continue;
 const data=Buffer.from(out.join('\n'));
 await fs.writeFile(path,deflateSync(data,{level:6}));
 model.sha1=createHash('sha1').update(data).digest('hex');model.bytes=data.length;changed++;
}
h.meshGroups=maxGroups;h.groupVertices=OBJ_GROUP_VERTICES;
await fs.writeFile(file,JSON.stringify(h));
console.log(`Regrouped ${changed} scenery meshes; at most ${maxGroups} mesh buffers per tile.`);
