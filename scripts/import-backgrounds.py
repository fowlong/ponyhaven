"""Inventory only location background art; character assets are never traversed."""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
import json, hashlib, sys
root=Path(sys.argv[1] if len(sys.argv)>1 else r'C:\Users\calla\Downloads\forens\PonyPonyParadise')
files=sorted((root/'data/locations').rglob('background.*'))
entries=[]
for p in files:
    try:
        im=Image.open(p)
        if im.width<500 or im.height<280: continue
        digest=hashlib.sha256(p.read_bytes()).hexdigest()
        if any(e['hash']==digest for e in entries): continue
        entries.append({'source':str(p.relative_to(root)).replace('\\','/'),'hash':digest,'name':p.parent.name.replace('_',' ').title(),'width':im.width,'height':im.height})
    except Exception as e: print(p.name,str(e))
Path('tmp/backgrounds').mkdir(parents=True,exist_ok=True)
Path('tmp/backgrounds/inventory.json').write_text(json.dumps(entries,indent=2),encoding='utf8')
for start in range(0,len(entries),24):
    sheet=Image.new('RGB',(1200,4*185),'#fff9f1');draw=ImageDraw.Draw(sheet)
    for j,e in enumerate(entries[start:start+24]):
        x=(j%6)*200;y=(j//6)*185
        im=Image.open(root/e['source']).convert('RGB');im.thumbnail((196,145))
        sheet.paste(im,(x,y));draw.text((x+3,y+147),f'{start+j}: {e["name"][:28]}',fill='#201e25')
    sheet.save(f'tmp/backgrounds/sheet-{start//24+1}.jpg')
print(json.dumps({'backgrounds':len(entries),'sheets':(len(entries)+23)//24}))
if '--copy' in sys.argv:
    out=Path('public/assets/backgrounds');out.mkdir(parents=True,exist_ok=True)
    reviews=json.loads(Path(__file__).with_name('background-curation.json').read_text(encoding='utf8'))['backgrounds']
    catalog=[{'id':'ponyville-meadow','name':'Ponyville Meadow','file':'assets/meadow.svg','source':'Original Ponyhaven illustration','stage':reviews['ponyville-meadow']['stage']}]
    for e in entries:
        p=root/e['source'];ident=p.parent.name+'-'+e['hash'][:6]
        review=reviews.get(ident)
        # New art needs a pet-in-scene desktop/phone review before entering the rotation.
        if not review or not review['include']: continue
        im=Image.open(p).convert('RGB');im.thumbnail((1600,900),Image.Resampling.LANCZOS);im.save(out/(ident+'.webp'),'WEBP',quality=86,method=6)
        metadata=p.parent/'location.json'
        name=json.loads(metadata.read_text(encoding='utf-8-sig')).get('name',e['name']) if metadata.exists() else e['name']
        catalog.append({'id':ident,'name':name,'file':'assets/backgrounds/'+ident+'.webp','source':'PonyPonyParadise/'+e['source'],'stage':review['stage']})
    Path('public/data/backgrounds.json').write_text(json.dumps(catalog,indent=2),encoding='utf8')
    print('Copied',len(catalog)-1,'background-only images.')
