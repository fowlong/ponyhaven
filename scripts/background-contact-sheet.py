from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont
import json, sys
folder=Path(sys.argv[1] if len(sys.argv)>1 else 'tmp/background-review-before')
data=json.loads((folder/'measurements.json').read_text(encoding='utf8'))
entries=[v for v in data if v['device']=='desktop']
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',18)
for start in range(0,len(entries),12):
    sheet=Image.new('RGB',(1420,1140),'#fff9f1'); draw=ImageDraw.Draw(sheet)
    for j,e in enumerate(entries[start:start+12]):
        x=(j%2)*710;y=(j//2)*190
        for device,offset,maxsize in [('desktop',0,(514,155)),('mobile',520,(184,155))]:
            im=Image.open(folder/f'{e["index"]:03}-{device}.png').convert('RGB'); im.thumbnail(maxsize)
            sheet.paste(im,(x+offset,y))
        draw.text((x+3,y+160),f'{e["index"]}: {e["name"][:44]}',font=font,fill='#201e25')
    sheet.save(folder/f'sheet-{start//12+1}.jpg',quality=92)
print(f'{len(entries)} scenes, {(len(entries)+11)//12} sheets')
