import fs from 'node:fs/promises';
import {EquestriaWorldReader} from '../desktop/equestria/world-reader.mjs';
import {scatteredBooks} from '../desktop/equestria/book-locations.mjs';
const file='native/equestria/luanti-5.17.0-win64/games/ponyhaven/mods/ponyhaven/encounters.json';
const encounters=JSON.parse(await fs.readFile(file,'utf8')),locations=JSON.parse(await fs.readFile('native/equestria/world/locations.json','utf8'));
encounters.books=scatteredBooks(new EquestriaWorldReader('native/equestria/world'),locations.towns,encounters.bosses);
await fs.writeFile(file,JSON.stringify(encounters,null,2));console.log(encounters.books);
