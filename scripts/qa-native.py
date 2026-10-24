"""Run the real native engines using SDL's headless driver and engine screenshots."""
import pathlib,subprocess,os,json,concurrent.futures,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
COLOURS={'twilight':'Dusk','applejack':'Tangerine','fluttershy':'Lemonade','rarity':'White','rainbowdash':'Cerulean','pinkiepie':'Pink'}
def run(game,pony='twilight',strength=55,map_id=1,title=False):
    folder=ROOT/'tmp/native-qa'/f'{game}-{pony}-{strength}-map{map_id}-{time.time_ns()}'
    user=folder/('srb2' if game=='adventure' else 'srb2kart')
    (user/'screenshots').mkdir(parents=True,exist_ok=True)
    args=[str(ROOT/'native'/game/(game+'.exe')),'-home',str(folder),'-skipintro','-nosound','-nomusic','-ph-test','-ph-pastel',str(strength),'-ph-progress-stdio','-ph-session','00000000-0000-0000-0000-000000000001','-width','640','-height','400','-win','-warp',str(map_id),'+skin',pony,'-file',str(ROOT/'native'/game/'ponyhaven.pk3')]
    if title:args+=['-ph-title-test']
    if game=='ponykart':args+=['+color',COLOURS[pony]]
    with (folder/'process.log').open('w') as log:
        p=subprocess.run(args,cwd=ROOT/'native'/game,env={**os.environ,'SDL_VIDEODRIVER':'dummy','SDL_RENDER_DRIVER':'software'},stdout=log,stderr=log,timeout=45)
    if p.returncode:raise RuntimeError(f'{game}/{pony}: exit {p.returncode}. See {folder}')
    records=[json.loads(line.removeprefix('PONYHAVEN_PROGRESS ')) for line in (folder/'process.log').read_text().splitlines() if line.startswith('PONYHAVEN_PROGRESS ')]
    assert records,(game,pony,'no progress message')
    d=records[-1]
    assert d['map']==map_id,(game,pony,'wrong course',d)
    shots=sorted(user.rglob('*.png'),key=lambda p:p.stat().st_mtime);assert shots,(game,pony,'no engine screenshot')
    print(game,pony,strength,'rendered',d,flush=True)
    return str(shots[-1])
if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--roster',action='store_true')
    parser.add_argument('--courses',action='store_true')
    parser.add_argument('--game',choices=['adventure','ponykart'])
    parser.add_argument('--min-map',type=int,default=1)
    parser.add_argument('--title',action='store_true')
    options=parser.parse_args()
    jobs=[(game,'twilight',strength) for game in ['adventure','ponykart'] for strength in [0,55]]
    if options.roster:
        jobs += [('adventure',p,55) for p in ['applejack','fluttershy','rarity','derpy','luna','trixie']]
        jobs += [('ponykart',p,55) for p in ['applejack','fluttershy','rarity','rainbowdash','pinkiepie']]
    if options.courses:
        courses=json.loads((ROOT/'desktop/courses.json').read_text())
        jobs += [(game,'twilight',55,map_id) for game,rows in courses.items() for map_id,_ in rows if map_id!=1]
    jobs=[job for job in jobs if (not options.game or job[0]==options.game) and (job[3] if len(job)>3 else 1)>=options.min_map]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        shots=list(pool.map(lambda a:run(*a,title=options.title),jobs))
    (ROOT/'tmp/native-qa/screenshots.json').write_text(json.dumps(shots,indent=2))
