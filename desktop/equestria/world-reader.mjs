import fs from 'node:fs';
import path from 'node:path';
import {unpackSection} from './region-store.mjs';
import {materialDefinition} from './materials.mjs';

export class EquestriaWorldReader {
  constructor(root){this.root=root;this.states=JSON.parse(fs.readFileSync(path.join(root,'states.json'),'utf8'));this.materials=this.states.map(materialDefinition);this.info=JSON.parse(fs.readFileSync(path.join(root,'world.json'),'utf8'));this.regions=new Map();this.sections=new Map();}
  state(x,y,z){
    x=Math.round(x);y=Math.round(y);z=-Math.round(z);
    const cx=Math.floor(x/16),cy=Math.floor(y/16),cz=Math.floor(z/16),rx=Math.floor(cx/32),rz=Math.floor(cz/32),key=`${cx},${cy},${cz}`;
    let section=this.sections.get(key);
    if(!section){
      const regionKey=`${rx},${rz}`;let region=this.regions.get(regionKey);
      if(region===undefined){try{region=fs.readFileSync(path.join(this.root,`regions/r.${rx}.${rz}.eqr`));}catch(e){if(e.code!=='ENOENT')throw e;region=null;}this.regions.set(regionKey,region);if(this.regions.size>12)this.regions.delete(this.regions.keys().next().value);}
      section=region?unpackSection(region,((cz%32+32)%32)*32+(cx%32+32)%32,cy):new Uint16Array(4096);
      this.sections.set(key,section);if(this.sections.size>2048)this.sections.delete(this.sections.keys().next().value);
    }
    return section[((y%16+16)%16)*256+((z%16+16)%16)*16+(x%16+16)%16];
  }
  material(x,y,z){return this.materials[this.state(x,y,z)];}
  surface(x,z,nearY,onlyNatural=false){
    const upper=nearY===undefined?this.info.max.y:Math.min(this.info.max.y,Math.floor(nearY)+14),lower=nearY===undefined?this.info.min.y:Math.max(this.info.min.y,Math.floor(nearY)-25);
    const levels=Array.from({length:upper-lower+1},(_,i)=>upper-i);
    if(nearY!==undefined)levels.sort((a,b)=>Math.abs(a+.5-nearY)-Math.abs(b+.5-nearY));
    for(const y of levels){
      const m=this.material(x,y,z);
      if(!m.solid)continue;
      if(onlyNatural&&!m.terrain){if(nearY===undefined)return null;continue;}
      if(['air','glassbox','leaves','plant'].includes(m.shape)||/fence|wall|chest|door|cactus|slab|stairs|snow$|bed|bars|head|skull/.test(m.base)){if(nearY===undefined)return null;continue;}
      if(this.material(x,y+1,z).solid||this.material(x,y+2,z).solid)continue;
      return {x,y:y+.5,z};
    }
    return null;
  }
  nearby(x,z,y,radius=40,onlyNatural=false){
    for(let r=0;r<=radius;r+=2)for(let angle=0;angle<(r?32:1);angle++){
      const px=Math.round(x+Math.cos(angle*Math.PI/16)*r),pz=Math.round(z+Math.sin(angle*Math.PI/16)*r),p=this.surface(px,pz,y,onlyNatural);
      if(p&&!this.material(px-1,p.y+1,pz).solid&&!this.material(px+1,p.y+1,pz).solid&&!this.material(px,p.y+1,pz-1).solid&&!this.material(px,p.y+1,pz+1).solid)return p;
    }
    return null;
  }
}
