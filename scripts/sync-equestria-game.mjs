import fs from 'node:fs/promises';
await fs.cp('equestria/game','native/equestria/luanti-5.17.0-win64/games/ponyhaven',{recursive:true});
console.log('Equestria game source synchronized with the local Luanti runtime.');
