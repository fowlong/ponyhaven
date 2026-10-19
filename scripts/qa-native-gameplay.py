"""Verify actual engine pickups/finish, without fabricating progress JSON."""
import zipfile,pathlib,subprocess,os,json
ROOT=pathlib.Path(__file__).resolve().parents[1]
folder=ROOT/'tmp/native-qa/gameplay';(folder/'srb2/screenshots').mkdir(parents=True,exist_ok=True)
lua='''addHook("ThinkFrame", function()
 local p=consoleplayer
 if not (p and p.mo and p.mo.valid) then return end
 if leveltime == 10 then P_SpawnMobj(p.mo.x + 4*FRACUNIT,p.mo.y,p.mo.z,MT_RING) end
 if leveltime == 11 then P_TryMove(p.mo,p.mo.x + 4*FRACUNIT,p.mo.y,true) end
 if leveltime == 20 then P_SpawnMobj(p.mo.x + 4*FRACUNIT,p.mo.y,p.mo.z,MT_FLINGRING) end
 if leveltime == 21 then P_TryMove(p.mo,p.mo.x + 4*FRACUNIT,p.mo.y,true) end
 if leveltime == 70 then P_DoPlayerExit(p) end
end)
'''
addon=folder/'qa-pickup.pk3'
with zipfile.ZipFile(addon,'w') as z:z.writestr('Lua/qa.lua',lua)
args=[str(ROOT/'native/adventure/adventure.exe'),'-home',str(folder),'-skipintro','-nosound','-nomusic','-win','-ph-progress',str(folder/'progress.json'),'-ph-session','00000000-0000-0000-0000-000000000099','-warp','1','+skin','twilight','-file',str(ROOT/'native/adventure/ponyhaven.pk3'),str(addon)]
with (folder/'process.log').open('w') as log:
    p=subprocess.run(args,cwd=ROOT/'native/adventure',env={**os.environ,'SDL_VIDEODRIVER':'dummy','SDL_RENDER_DRIVER':'software'},stdout=log,stderr=log,timeout=35)
d=json.loads((folder/'progress.json').read_text());print('Actual fresh-ring pickup, dropped ring excluded, and finish:',p.returncode,d)
assert p.returncode==0 and d['rings']==1 and d['finished']
