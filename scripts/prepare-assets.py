"""Extract motion-free sprite previews and an observed main palette color."""
import json, hashlib
from pathlib import Path
from urllib.parse import unquote
from collections import Counter
from PIL import Image
root = Path(__file__).resolve().parents[1]
ponies = json.loads((root/'public/data/ponies.json').read_text(encoding='utf-8'))
previews = root/'public/assets/previews'
previews.mkdir(exist_ok=True)
for pony in ponies:
    behavior = next(b for b in pony['behaviors'] if b['name'] == pony['idle'])
    with Image.open(root/'public'/unquote(behavior['right'])) as im:
        frame = im.convert('RGBA')
        frame.save(previews/(pony['id']+'.png'))
        pony['preview'] = 'assets/previews/'+pony['id']+'.png'
        if not pony['mane']:
            colors = Counter((r//16*16,g//16*16,b//16*16) for r,g,b,a in frame.getdata() if a>200 and max(r,g,b)>110 and min(r,g,b)<225 and max(r,g,b)-min(r,g,b)>25)
            if colors:
                rgb=colors.most_common(1)[0][0]
                pony['color']='#%02x%02x%02x'%rgb
    # Still counterparts retain sleep poses and outfits in Gentle motion mode.
    for b in pony['behaviors']:
        for side in ['right','left']:
            name=hashlib.sha1(b[side].encode()).hexdigest()[:16]+'.png'
            dest=previews/name
            if not dest.exists():
                with Image.open(root/'public'/unquote(b[side])) as im:
                    im.convert('RGBA').save(dest)
            b['preview'+side.title()]='assets/previews/'+name
(root/'public/data/ponies.json').write_text(json.dumps(ponies,separators=(',',':')),encoding='utf-8')
