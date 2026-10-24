import fs from 'node:fs/promises';
import path from 'node:path';
import {surfaceTile,surfaceOBJ} from '../desktop/equestria/surface-nets.mjs';
const mod=path.resolve('native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven');
await fs.mkdir(path.join(mod,'models'),{recursive:true});
const variants=[];
for(let mask=1;mask<255;mask++){
 const tile=surfaceTile(mask),mesh='eq_surface_'+mask+'.obj';
 await fs.writeFile(path.join(mod,'models',mesh),surfaceOBJ(tile));
 variants.push({mask,mesh,boxes:tile.boxes,materialCandidates:tile.materialCandidates,center:tile.center});
}
await fs.writeFile(path.join(mod,'surfaces.json'),JSON.stringify(variants));
console.log('Prepared 254 SurfaceNets-style tiles with compensated OBJ axes and matching collision columns.');
