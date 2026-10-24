import fs from 'node:fs/promises';
import {buildEquestriaLocations} from '../desktop/equestria/locations.mjs';
const root='tmp/equestria/imported',catalog=JSON.parse(await fs.readFile('public/data/ponies.json','utf8'));
const result=buildEquestriaLocations(root,catalog);
await fs.writeFile(root+'/locations.json',JSON.stringify(result,null,2));
console.log('Validated',result.towns.length,'towns,',result.npcs.length,'NPCs,',result.chests.length,'chests and',result.teleports.length,'teleports against the actual source voxels.');
