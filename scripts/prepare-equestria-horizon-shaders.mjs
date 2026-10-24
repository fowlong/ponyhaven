// Native XY perspective, live-range fog, and a background pass for unloaded voxels.
import fs from 'node:fs/promises';
import path from 'node:path';
const engine='native/equestria/luanti-5.17.0-win64',out='equestria/game/mods/ponyhaven/shaders';
const fog=`
float ponyhavenSceneryEnd() {
 return min(fogDistance + max(1280.0, min(2560.0, fogDistance * 0.5)), 10240.0);
}
float ponyhavenFog(float distanceToEye) {
 float begin = min(fogDistance, 8960.0);
 float end = ponyhavenSceneryEnd();
 return smoothstep(begin, end, distanceToEye);
}
`;
for(const kind of ['nodes_shader','object_shader','cloud_shader']){
 const dir=path.join(out,kind);await fs.mkdir(dir,{recursive:true});
 let vertex=(await fs.readFile(path.join(engine,'client/shaders',kind,'opengl_vertex.glsl'),'utf8')).replaceAll('\r\n','\n');
 if(kind==='object_shader'){
  vertex='// Ponyhaven: scenery is fixed to source world coordinates, including origin rebases.\nVARYING_ float ponyhavenHorizon;\nuniform highp vec3 cameraOffset;\n'+vertex;
  vertex=vertex.replace('void main(void)\n{','void main(void)\n{\n ponyhavenHorizon = dot(inVertexNormal, inVertexNormal) > 8.5 ? 1.0 : 0.0;');
  vertex=vertex.replace('\tgl_Position = mWorldViewProj * skinPos;',`
 // These meshes contain absolute map positions and have no parent/rotation.
 // Cancel the entity translation explicitly and use the current render origin,
 // so server interpolation or a camera rebase cannot slide the background.
 if (ponyhavenHorizon > 0.5) skinPos.xyz -= mWorld[3].xyz + cameraOffset;
 gl_Position = mWorldViewProj * skinPos;
 // Reserve the last tenth of depth for the scenery underlay. XY/perspective
 // stay native; partly loaded tiles show scenery only through missing voxels.
 // The fragment shader writes the real scenery depth; this z only clips. The
 // offset puts the near clip one node ahead of the eye (fragments nearer than
 // 4.8 nodes are discarded anyway). Clipping at w = 0 instead projected
 // vertices to infinity, smearing tall buildings into streaks across the sky.
 if (ponyhavenHorizon > 0.5) gl_Position.z = gl_Position.w * 0.9 - 19.0;
 else gl_Position.z = gl_Position.z * 0.9 - gl_Position.w * 0.1;`);
 }else if(kind==='cloud_shader'){
  // Push clouds behind scenery: scenery lives at depth [0.9, 0.99], so clouds
  // need depth >= 0.99 to never cut through distant buildings. Depth still
  // grows with distance inside that band (NDC 0.998 - 1.6/w); a single flat
  // depth let cloud faces overwrite each other in draw order and flicker.
  vertex=vertex.replace(/(gl_Position = mWorldViewProj \* [^;]+;)/,'$1\n gl_Position.z = gl_Position.w * 0.998 - 1.6;');
 }else{
  vertex=vertex.replace(/(gl_Position = mWorldViewProj \* [^;]+;)/,'$1\n gl_Position.z = gl_Position.z * 0.9 - gl_Position.w * 0.1;');
 }
 await fs.writeFile(path.join(dir,'opengl_vertex.glsl'),vertex);
 if(kind==='cloud_shader'){
  // Cloud fragment shader: only apply atmospheric fog tint, no depth logic needed
  // since the vertex shader already places clouds behind all scenery.
  let cfrag=(await fs.readFile(path.join(engine,'client/shaders',kind,'opengl_fragment.glsl'),'utf8')).replaceAll('\r\n','\n');
  await fs.writeFile(path.join(dir,'opengl_fragment.glsl'),cfrag);
  continue;
 }
 let fragment=(await fs.readFile(path.join(engine,'client/shaders',kind,'opengl_fragment.glsl'),'utf8')).replaceAll('\r\n','\n');
 if(kind==='nodes_shader'){
  // Small texture-space Kuwahara filter. Only terrain materials use this
  // shader; sprite/object art and the packed scenery colour atlas stay sharp.
  const filter=`
vec3 ponyhavenTerrainSample(vec2 uv) {
#ifdef USE_ARRAY_TEXTURE
 return texture(baseTexture, vec3(uv, float(varTexLayer))).rgb;
#else
 return texture2D(baseTexture, uv).rgb;
#endif
}
vec3 ponyhavenKuwahara(vec2 uv, vec3 original) {
 vec2 px = 1.0 / vec2(textureSize(baseTexture, 0).xy);
 vec3 samples[9];
 for (int y=0; y<3; y++) for (int x=0; x<3; x++)
  samples[y*3+x] = ponyhavenTerrainSample(uv + vec2(float(x-1),float(y-1))*px);
 float best = 1e9; vec3 selected = original;
 for (int y=0; y<2; y++) for (int x=0; x<2; x++) {
  int i=y*3+x;
  vec3 a=samples[i], b=samples[i+1], c=samples[i+3], d=samples[i+4];
  vec3 mean=(a+b+c+d)*0.25;
  vec3 variance=(a*a+b*b+c*c+d*d)*0.25-mean*mean;
  float v=dot(variance,vec3(0.299,0.587,0.114));
  if(v<best){best=v;selected=mean;}
 }
 return mix(original,selected,0.32);
}
`;
  fragment=fragment.replace('void main(void)',filter+'\nvoid main(void)');
  const sample='#endif\n';
  const at=fragment.indexOf(sample,fragment.indexOf('vec4 base ='));
  if(at<0)throw Error('Terrain texture sampling changed');
  fragment=fragment.slice(0,at+sample.length)+' base.rgb = ponyhavenKuwahara(uv,base.rgb);\n'+fragment.slice(at+sample.length);
 }
 fragment='// Ponyhaven: the same transition fog on real geometry and medium-detail scenery.\n'+fragment;
 fragment=fragment.replace('void main(void)',fog+'\nvoid main(void)');
 if(kind==='object_shader'){
  fragment='VARYING_ float ponyhavenHorizon;\n'+fragment;
  fragment=fragment.replace('void main(void)\n{','void main(void)\n{\n gl_FragDepth = gl_FragCoord.z;');
  fragment=fragment.replace('\t// Handle transparency by discarding pixel as appropriate.',`
 if (ponyhavenHorizon > 0.5) {
  float distanceToEye = length(eyeVec);
  // The ring starts at the actual detailed terrain. Inside the selected draw
  // range it is a fallback for unloaded pixels, always underneath real voxels.
  if (base.a < 0.5 || distanceToEye < 48.0 || distanceToEye > ponyhavenSceneryEnd()) discard;
  vec3 colour = base.rgb * clamp(dayLight + vec3(0.25), vec3(0.22), vec3(1.0));
  gl_FragColor = vec4(mix(colour, fogColor.rgb, ponyhavenFog(distanceToEye)), 1.0);
  gl_FragDepth = 0.9 + 0.09 * distanceToEye / (distanceToEye + 10000.0);
  return;
 }
 if (length(eyeVec) > fogDistance) discard;
\t// Handle transparency by discarding pixel as appropriate.`);
 }else fragment=fragment.replace('void main(void)\n{','void main(void)\n{\n if (length(eyeVec) > fogDistance) discard;');
 // Replace the original sharp fog-at-voxel-limit with one shared fade across
 // the voxel/scenery handoff, using the live client draw range.
 const begin=fragment.indexOf('\t// Due to a bug in some (older ?)',fragment.indexOf('void main(void)'));
 if(begin<0)throw Error('Upstream fog section changed');
 fragment=fragment.slice(0,begin)+`\n col = vec4(mix(col.rgb, fogColor.rgb, ponyhavenFog(length(eyeVec))), base.a);\n gl_FragColor = col;\n}\n`;
 await fs.writeFile(path.join(dir,'opengl_fragment.glsl'),fragment);
}
console.log('Prepared live-range scenery underlay: native perspective, shared fog, no unloaded band.');
