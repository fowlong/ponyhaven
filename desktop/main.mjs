import { app, BrowserWindow, ipcMain, protocol, shell, dialog } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Profiles } from './profiles.mjs';
import { LocalRelay } from './relay.mjs';
import { NativeGames } from './games.mjs';
import { EquestriaGame } from './equestria/runtime.mjs';
import { LevelLibrary } from './levels.mjs';
import { guardNavigation } from './navigation.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)), root=path.dirname(here);
// Separate test/dev storage is explicit and unavailable in distributed builds.
if (!app.isPackaged && process.env.PONYHAVEN_USER_DATA) app.setPath('userData',path.resolve(process.env.PONYHAVEN_USER_DATA));
app.setName('Ponyhaven');
protocol.registerSchemesAsPrivileged([{scheme:'ponyhaven',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
if (!app.requestSingleInstanceLock()) app.quit();
else void start().catch((error)=>{console.error(error);app.quit();});
async function start() {
  await app.whenReady();
  const profileRoot=path.join(app.getPath('userData'),'Ponyhaven');
  const profiles=new Profiles(profileRoot);
  await profiles.init();
  let win;
  const send=(topic,value)=>{ if(win && !win.isDestroyed()) win.webContents.send('ponyhaven:'+topic,value); };
  const levels=new LevelLibrary(profileRoot);
  const games=new NativeGames(path.join(root,'native'),profileRoot,(event)=>send('game',event),levels);
  const equestria=new EquestriaGame(path.join(root,'native','equestria'),profileRoot,(event)=>send('equestria',event));
  const relay=new LocalRelay((packet)=>send('packet',packet));
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.gif':'image/gif','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.ttf':'font/ttf','.txt':'text/plain'};
  protocol.handle('ponyhaven',async(request)=>{
    const url=new URL(request.url), base=path.join(root,'dist');
    if (url.host!=='app') return new Response('Not found',{status:404});
    let filename;
    try { filename=path.resolve(base,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname)); }
    catch { return new Response('Bad path',{status:400}); }
    if (!filename.startsWith(base+path.sep)) return new Response('Not found',{status:404});
    try {
      const data=await fs.readFile(filename);
      return new Response(data,{headers:{'Content-Type':types[path.extname(filename)]||'application/octet-stream',
        'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://*.peerjs.com wss://*.peerjs.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com; media-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'self'"}});
    } catch { return new Response('Not found',{status:404}); }
  });
  win=new BrowserWindow({width:1440,height:960,minWidth:760,minHeight:600,backgroundColor:'#f9f7ff',title:'Ponyhaven',autoHideMenuBar:true,
    webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,backgroundThrottling:false}});
  win.webContents.session.setPermissionRequestHandler((_web,permission,callback)=>callback(permission==='fullscreen'));
  win.webContents.on('will-navigate',guardNavigation);
  win.webContents.setWindowOpenHandler(({url})=>{
    try { const u=new URL(url); if (u.protocol==='https:' && ['github.com','mylittlecardcollection.com','creativecommons.org','www.planetminecraft.com','eaglecraft.fr','www.luanti.org'].includes(u.hostname)) void shell.openExternal(u.href); }
    catch {}
    return {action:'deny'};
  });
  const handle=(name,fn,active=true)=>ipcMain.handle('ponyhaven:'+name,async(event,...args)=>{
    if (event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame || new URL(event.senderFrame.url).protocol!=='ponyhaven:') throw new Error('Untrusted request.');
    if(active) profiles.requireActive();
    try { return await fn(...args); }
    catch(e) { throw new Error(e instanceof Error?e.message:'The action could not be completed.'); }
  });
  handle('status',()=>profiles.status(),false);
  handle('load',()=>profiles.read());
  handle('save',(save)=>profiles.write(save));
  handle('rename',(name)=>profiles.rename(name));
  handle('link-cloud',(uid)=>{if(games.running||equestria.running)throw new Error('Close your game before changing sync accounts.');return profiles.linkCloud(uid);});
  handle('create-profile',async(name)=>{ if(games.running||equestria.running) throw new Error('Close your game first.'); return profiles.create(name); },false);
  handle('select-profile',async(id)=>{ if(games.running||equestria.running) throw new Error('Close your game first.'); relay.close(); return profiles.select(id); },false);
  handle('backup',()=>profiles.backup('before-reset'));
  handle('export',async(save)=>{
    if(JSON.stringify(save).length>4_000_000) throw new Error('Save is too large.');
    const answer=await dialog.showSaveDialog(win,{title:'Back up your Ponyhaven profile',defaultPath:'Ponyhaven-'+profiles.requireActive().name.replace(/[^a-z0-9]/gi,'_')+'.json',filters:[{name:'Ponyhaven save',extensions:['json']}]});
    if(answer.canceled || !answer.filePath) return false;
    await fs.writeFile(answer.filePath,JSON.stringify(save,null,2)); return true;
  });
  handle('engines',()=>games.available());
  handle('levels',(game)=>levels.list(profiles.requireActive(),game));
  handle('import-level',async(game)=>{
    if(games.running)throw new Error('Close the game before importing a level.');
    if(!['adventure','ponykart'].includes(game))throw new Error('Choose a game first.');
    const answer=await dialog.showOpenDialog(win,{title:'Import a '+(game==='adventure'?'SRB2 2.2':'SRB2Kart 1.6')+' level pack',properties:['openFile'],filters:[{name:'Level packs',extensions:['wad','pk3']}]});
    if(answer.canceled)return levels.list(profiles.requireActive(),game);
    return levels.add(profiles.requireActive(),game,answer.filePaths[0]);
  });
  handle('remove-level',(game,id)=>{if(games.running)throw new Error('Close the game first.');return levels.remove(profiles.requireActive(),game,id);});
  handle('launch',(options)=>{if(equestria.running)throw new Error('Return from Equestria before starting another game.');return games.launch(options,profiles.requireActive());});
  handle('stop-game',async()=>{await equestria.stop();await games.stop();});
  handle('equestria-status',()=>equestria.status());
  handle('equestria-launch',(options)=>{if(games.running)throw new Error('Close your current game first.');return equestria.launch(options,profiles.requireActive());});
  handle('equestria-invite',(peer,identity)=>equestria.invite(peer,identity));
  handle('equestria-revoke',(peer)=>equestria.revoke(peer));
  handle('equestria-ack',(player,state)=>equestria.acknowledge(player,state));
  handle('equestria-input',(peer,book,session)=>equestria.input(peer,book,session));
  handle('relay-open',(options)=>{
    if(options?.role==='host' && games.running?.port!==options.port && equestria.running?.port!==options.port) throw new Error('Host a game first.');
    return relay.open(options);
  });
  handle('relay-send',(id,bytes)=>relay.send(id,bytes));
  handle('relay-close',(id)=>relay.close(id));
  handle('fullscreen',()=>{win.setFullScreen(!win.isFullScreen());return win.isFullScreen();});
  app.on('second-instance',()=>{if(win.isMinimized())win.restore();win.focus();});
  let closing=false;
  win.on('close',(event)=>{
    if(closing)return;
    event.preventDefault(); closing=true;
    void (async()=>{await equestria.stop();await games.stop();relay.close();await profiles.queue.catch(()=>{});win.destroy();app.quit();})();
  });
  await win.loadURL('ponyhaven://app/');
}
