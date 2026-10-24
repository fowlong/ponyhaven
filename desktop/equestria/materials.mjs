// Original rendering materials for the imported block shapes. No Minecraft textures are used.
const dyes={white:[239,235,229],orange:[222,141,72],magenta:[191,112,197],light_blue:[139,199,221],yellow:[234,210,106],lime:[158,197,106],pink:[230,158,192],gray:[110,116,128],light_gray:[180,188,195],cyan:[91,176,187],purple:[153,113,183],blue:[102,130,193],brown:[143,111,88],green:[109,153,101],red:[196,102,107],black:[62,65,80]};
const wood={oak:[177,148,103],birch:[215,204,159],spruce:[136,107,79],dark_oak:[111,84,72],acacia:[192,126,97],jungle:[177,133,106],crimson:[145,83,105],warped:[85,152,145]};
const natural=new Set(['grass_block','dirt','coarse_dirt','rooted_dirt','podzol','mycelium','sand','red_sand','gravel','snow_block','stone','granite','diorite','andesite','deepslate','tuff','calcite','clay','mud','terracotta','packed_ice','blue_ice','netherrack','soul_sand','coal_ore','iron_ore','copper_ore','gold_ore','redstone_ore','lapis_ore','diamond_ore','emerald_ore']);
const solids=new Set(('andesite bedrock beacon bookshelves bookshelf bricks brown_mushroom_block carved_pumpkin chain_command_block chiseled_quartz_block chiseled_red_sandstone chiseled_sandstone chiseled_stone_bricks clay coal_block coal_ore cobblestone command_block cracked_stone_bricks crafting_table cut_red_sandstone cut_sandstone dark_prismarine diamond_block diamond_ore diorite dirt dispenser dropper emerald_block emerald_ore end_stone furnace glowstone gold_block gold_ore granite grass_block gravel hay_block infested_chiseled_stone_bricks infested_stone infested_stone_bricks iron_block iron_ore jack_o_lantern jukebox lapis_block lapis_ore melon mossy_cobblestone mossy_stone_bricks mycelium nether_bricks nether_quartz_ore netherrack note_block obsidian packed_ice piston piston_head podzol polished_andesite polished_diorite polished_granite prismarine pumpkin quartz_block quartz_pillar red_mushroom_block red_sand redstone_block redstone_lamp redstone_ore repeating_command_block sand sandstone sea_lantern slime_block smooth_quartz smooth_sandstone smooth_stone snow_block soul_sand sponge sticky_piston stone stone_bricks terracotta tnt waxed_oxidized_copper coarse_dirt').split(' '));
const plants=new Set(('allium azure_bluet beetroots blue_orchid brown_mushroom carrots cobweb cocoa dandelion dead_bush fern fire grass kelp kelp_plant large_fern lilac lily_pad nether_wart orange_tulip oxeye_daisy peony pink_tulip poppy potatoes red_mushroom red_tulip rose_bush seagrass sugar_cane sunflower tall_grass tall_seagrass vine wheat white_tulip').split(' '));
const full=[-.5,-.5,-.5,.5,.5,.5];
const directions={north:[0,1],south:[0,-1],east:[1,0],west:[-1,0]};
export function sourceState(key){const match=/^minecraft:([a-z0-9_]+)(?:\[(.*)\])?$/.exec(key);if(!match)throw Error('Unsupported namespace: '+key);return {base:match[1],props:Object.fromEntries((match[2]||'').split(',').filter(Boolean).map(p=>p.split('=')))};}
export function materialColour(base){
 const dye=Object.keys(dyes).sort((a,b)=>b.length-a.length).find(n=>base.startsWith(n+'_'));
 if(dye){const c=dyes[dye];return base.includes('terracotta')?c.map((n,i)=>Math.round(n*.7+[174,133,108][i]*.3)):c;}
 const timber=Object.keys(wood).sort((a,b)=>b.length-a.length).find(n=>base.startsWith(n+'_'));
 if(timber&&!base.includes('leaves'))return wood[timber];
 if(/grass_block|leaves|sapling|cactus|vine|fern/.test(base))return [128,172,104];
 if(/dirt|farmland|path|podzol/.test(base))return [158,129,102];
 if(/snow|quartz|diorite/.test(base))return [235,231,218];
 if(/sandstone|end_stone|sand/.test(base))return base.includes('red')?[198,137,101]:[219,206,160];
 if(/water|bubble/.test(base))return [89,162,194];
 if(/glass|ice/.test(base))return [182,221,230];
 if(/lava|fire/.test(base))return [246,147,74];
 if(/gold|glowstone/.test(base))return [228,200,110];
 if(/emerald/.test(base))return [96,179,143];
 if(/diamond|sea_lantern|prismarine/.test(base))return [126,203,200];
 if(/lapis/.test(base))return [90,129,189];
 if(/nether|obsidian|coal|bedrock/.test(base))return [83,76,91];
 if(/brick/.test(base)&&!base.includes('stone'))return [179,127,117];
 if(/mossy/.test(base))return [139,154,125];
 if(/clay/.test(base))return [168,179,195];
 if(/pumpkin|melon/.test(base))return base==='melon'?[156,179,100]:[218,159,81];
 if(/wood|log|chest|bookshelf|jukebox|crafting|note/.test(base))return [173,139,97];
 if(/flower|tulip|poppy|rose|peony|allium|orchid|lilac/.test(base))return [220,151,192];
 return [170,172,177];
}
export function materialDefinition(key,id){
 const {base,props:p}=sourceState(key),def={id,name:id===0?'air':`ponyhaven:m${id}`,source:key,base,colour:materialColour(base),shape:'cube',boxes:[full],solid:true,terrain:natural.has(base),texture:`eq_block_${base}.png`,light:0};
 const box=(...boxes)=>{def.shape='box';def.boxes=boxes;};
 const flat=(height)=>box([-.5,-.5,-.5,.5,-.5+height,.5]);
 const plant=()=>{def.shape='plant';def.solid=false;def.boxes=[];};
 const facing=directions[p.facing]||directions.north;
 if(base==='air'||base==='cave_air'||base==='void_air'){def.shape='air';def.solid=false;}
 else if(base==='barrier'){def.shape='air';}
 else if(base==='light'){def.shape='air';def.solid=false;def.light=Math.min(14,Number(p.level)||0);}
 else if(base==='water'||base==='bubble_column'||base==='lava'){def.shape='liquid';def.solid=false;def.light=base==='lava'?12:0;}
 else if(base.includes('glass')||base==='ice'||base==='packed_ice'){
  def.shape='glass';if(base.includes('pane')){const boxes=[[-.063,-.5,-.063,.063,.5,.063]];for(const [side,[x,z]]of Object.entries(directions))if(p[side]==='true')boxes.push(x?[Math.min(0,x*.5),-.5,-.063,Math.max(0,x*.5),.5,.063]:[-.063,-.5,Math.min(0,z*.5),.063,.5,Math.max(0,z*.5)]);def.boxes=boxes;def.shape='glassbox';}
 }
 else if(base.endsWith('_stairs')){
  const inverted=p.half==='top',boxes=[[-.5,-.5,-.5,.5,0,.5]],left=[-facing[1],facing[0]];
  for(const x of [-.25,.25])for(const z of [-.25,.25]){
   const forward=x*facing[0]+z*facing[1]>0,toLeft=x*left[0]+z*left[1]>0;
   let high=forward;if(p.shape==='inner_left')high=forward||toLeft;if(p.shape==='inner_right')high=forward||!toLeft;if(p.shape==='outer_left')high=forward&&toLeft;if(p.shape==='outer_right')high=forward&&!toLeft;
   if(high)boxes.push([x-.25,0,z-.25,x+.25,.5,z+.25]);
  }
  box(...boxes.map(b=>inverted?[b[0],-b[4],b[2],b[3],-b[1],b[5]]:b));
 }
 else if(base.endsWith('_slab')){if(p.type!=='double')box([-.5,p.type==='top'?0:-.5,-.5,.5,p.type==='top'?.5:0,.5]);}
 else if(base.endsWith('_trapdoor')){
  if(p.open==='true')box(facing[0]?[facing[0]>0?.3125:-.5,-.5,-.5,facing[0]>0?.5:-.3125,.5,.5]:[-.5,-.5,facing[1]>0?.3125:-.5,.5,.5,facing[1]>0?.5:-.3125]);
  else box([-.5,p.half==='top'?.3125:-.5,-.5,.5,p.half==='top'?.5:-.3125,.5]);def.door=true;
 }
 else if(base.endsWith('_door')){
  let [x,z]=facing;if(p.open==='true')[x,z]=p.hinge==='right'?[z,-x]:[-z,x];
  box(x?[x>0?.3125:-.5,-.5,-.5,x>0?.5:-.3125,.5,.5]:[-.5,-.5,z>0?.3125:-.5,.5,.5,z>0?.5:-.3125]);def.door=true;
 }
 else if(base.endsWith('_fence_gate')){def.solid=p.open!=='true';box(facing[0]?[-.125,-.5,-.5,.125,1,.5]:[-.5,-.5,-.125,.5,1,.125]);def.door=true;}
 else if(base.endsWith('_fence')||base.endsWith('_wall')||base==='iron_bars'){
  const wall=base.endsWith('_wall'),thick=wall?.22:.09,boxes=[[-thick,-.5,-thick,thick,wall?1:.75,thick]];
  for(const [side,[x,z]]of Object.entries(directions))if(p[side]&&p[side]!=='false'&&p[side]!=='none')for(const y of wall?[.1]:[-.1,.4])boxes.push(x?[Math.min(0,x*.5),y,-thick,Math.max(0,x*.5),y+(wall?.7:.12),thick]:[-thick,y,Math.min(0,z*.5),thick,y+(wall?.7:.12),Math.max(0,z*.5)]);box(...boxes);
 }
 else if(base==='snow')flat(Math.max(1,Number(p.layers)||1)/8);
 else if(base.endsWith('_carpet'))flat(.0625);
 else if(base==='dirt_path'||base==='farmland')flat(.9375);
 else if(base.endsWith('_bed'))flat(.5625);
 else if(base==='chest'||base==='trapped_chest'||base==='ender_chest')box([-.4375,-.5,-.4375,.4375,.375,.4375]);
 else if(base.includes('cauldron'))box([-.5,-.5,-.5,.5,-.25,.5],[-.5,-.25,-.5,-.3,.5,.5],[.3,-.25,-.5,.5,.5,.5],[-.3,-.25,-.5,.3,.5,-.3],[-.3,-.25,.3,.3,.5,.5]);
 else if(base==='cake')box([-.4375,-.5,-.4375,.4375,0,.4375]);
 else if(base==='enchanting_table'||base==='lectern'||base==='end_portal_frame')flat(.75);
 else if(base.includes('anvil'))box([-.35,-.5,-.35,.35,-.3,.35],[-.2,-.3,-.2,.2,.2,.2],[-.5,.2,-.3,.5,.5,.3]);
 else if(base.includes('head')||base.includes('skull'))box([-.25,-.5,-.25,.25,0,.25]);
 else if(base==='ladder'){box([-.5,-.5,.42,.5,.5,.5]);def.solid=false;def.climbable=true;}
 else if(base.endsWith('_sign')||base.includes('banner')){plant();}
 else if(base.includes('rail')||base.includes('pressure_plate')||base==='redstone_wire'||base==='tripwire'||base==='daylight_detector'||base==='repeater'||base==='comparator'){flat(.0625);def.solid=false;}
 else if(base.includes('torch')||base==='end_rod'){box([-.05,-.5,-.05,.05,.22,.05]);def.solid=false;def.light=base.includes('redstone')?6:13;}
 else if(base.includes('button')||base==='lever'||base==='tripwire_hook'){box([-.125,-.5,-.125,.125,-.3,.125]);def.solid=false;}
 else if(base.startsWith('potted_')||base==='flower_pot'||base==='brewing_stand'){plant();}
 else if(base==='hopper')box([-.5,.1,-.5,.5,.5,.5],[-.2,-.5,-.2,.2,.1,.2]);
 else if(base==='chain'){box([-.035,-.5,-.035,.035,.5,.035]);def.solid=false;}
 else if(base==='cactus')box([-.4375,-.5,-.4375,.4375,.5,.4375]);
 else if(base==='moving_piston'){def.shape='air';def.solid=false;}
 else if(plants.has(base)||base.endsWith('_sapling'))plant();
 else if(base.endsWith('_leaves'))def.shape='leaves';
 else if(solids.has(base)||/_wool$|_terracotta$|_concrete$|_planks$|_log$|_wood$/.test(base)){}
 else throw Error('A material shape must be defined for '+key);
 if(/glowstone|sea_lantern|beacon|jack_o_lantern/.test(base)||(base==='redstone_lamp'&&p.lit==='true'))def.light=14;
 // Smooth the architecture too. Keep natural terrain identification separate:
 // encounter placement must continue to avoid building roofs.
 def.smooth=def.solid&&['cube','glass','leaves'].includes(def.shape);
 return def;
}
