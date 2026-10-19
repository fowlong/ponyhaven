"""Convert the owner's SRB2 2.0 ponies and curate the two native game bundles.
Source mods are read-only. Run after downloading/extracting the pinned releases.
"""
import pathlib,struct,zipfile,shutil,io,re,json,hashlib,os
from PIL import Image,ImageDraw
ROOT=pathlib.Path(__file__).resolve().parents[1]
MODS=pathlib.Path(os.environ.get('PONYHAVEN_MODS',r'C:\Users\calla\Downloads\forens'))

def wadread(data):
    magic,count,offset=struct.unpack('<4sii',data[:12]);assert magic in (b'PWAD',b'IWAD')
    result=[]
    for i in range(count):
        start,size,name=struct.unpack('<ii8s',data[offset+i*16:offset+(i+1)*16]);result.append((name.rstrip(b'\0').decode('ascii'),data[start:start+size]))
    return result
def wadwrite(lumps):
    body=bytearray();directory=bytearray()
    for name,data in lumps:
        directory+=struct.pack('<ii8s',len(body)+12,len(data),name.encode('ascii'));body+=data
    return struct.pack('<4sii',b'PWAD',len(lumps),len(body)+12)+body+directory
def patch(image,left=0,top=0):
    # Classic Doom column format, preserving transparent edges and sprite anchors.
    w,h=image.size;columns=[]
    for x in range(w):
        data=bytearray();y=0;previous=-1
        while y<h:
            if image.getpixel((x,y))<0:y+=1;continue
            start=y;pixels=[]
            while y<h and image.getpixel((x,y))>=0 and len(pixels)<250:
                pixels.append(image.getpixel((x,y)));y+=1
            if start>254 and previous<254:
                data+=bytes([254,0,0,0]);previous=254
            while start>254 and start-previous>254:
                data+=bytes([254,0,0,0]);previous+=254
            delta=start if start<=254 and start>previous else start-previous
            data+=bytes([delta,len(pixels),0,*pixels,0]);previous=start
        data.append(255);columns.append(data)
    offset=8+w*4;header=struct.pack('<hhhh',w,h,left,top);body=bytearray()
    for col in columns:header+=struct.pack('<i',offset+len(body));body+=col
    return header+body
def starpatch():
    im=Image.new('I',(48,72),-1);d=ImageDraw.Draw(im)
    d.rectangle((22,35,26,71),fill=153);d.ellipse((4,2,44,42),fill=126)
    d.polygon([(24,6),(28,17),(39,21),(28,25),(24,37),(20,25),(9,21),(20,17)],fill=73)
    return patch(im,24,72)
BLANK=patch(Image.new('I',(1,1),-1))

def friendship_billboard(raw,palette):
    # Retain the patch's dimensions/anchor so existing course geometry aligns.
    if len(raw)<8:return raw
    w,h,left,top=struct.unpack_from('<hhhh',raw)
    if not(0<w<=2048 and 0<h<=2048):return raw
    colors=[tuple(palette[i:i+3]) for i in range(0,768,3)]
    nearest=lambda rgb:min(range(256),key=lambda i:sum((a-b)**2 for a,b in zip(rgb,colors[i])))
    bg=nearest((188,178,225));edge=nearest((113,91,154));pink=nearest((245,202,221));white=nearest((255,249,219))
    im=Image.new('I',(w,h),bg);d=ImageDraw.Draw(im)
    d.rectangle((0,0,w-1,h-1),outline=edge,width=max(1,min(w,h)//18))
    cx,cy=w/2,h/2;r=min(w,h)*.34
    import math
    points=[(cx+math.cos(i*math.pi/5-math.pi/2)*r*(1 if i%2==0 else .43),cy+math.sin(i*math.pi/5-math.pi/2)*r*(1 if i%2==0 else .43)) for i in range(10)]
    d.polygon(points,fill=white)
    for x in [w*.18,w*.82]:d.ellipse((x-r*.22,cy-r*.22,x+r*.22,cy+r*.22),fill=pink)
    return patch(im,left,top)
SPR2={'STND':'A','WAIT':'BC','WALK':'DEFGHIJK','RUN_':'QRST','ROLL':'LMNO','SPNG':'P','JUMP':'P','FALL':'`a','FLY_':'UV','TIRE':'WX','SWIM':'UV','GLID':'WXYZ','CLNG':'W','CLMB':'WXYZ','GASP':'[','PAIN':'\\','DEAD':']','EDGE':'^_','RIDE':'b'}
adventure_ponies=[('twilightsparkle','twilight','Twilight_Sparkle','CA_THOK','Lavender'),('Applejack','applejack','Applejack','CA_DOUBLEJUMP','Orange'),('fluttershy','fluttershy','Fluttershy','CA_FLY','Yellow'),('rarity','rarity','Rarity','CA_GLIDEANDCLIMB','White'),('derpy','derpy','Derpy','CA_FLY','Grey'),('luna','luna','Princess_Luna','CA_FLY','Blue'),('trixie','trixie','Trixie','CA_THOK','Cyan')]

def legacy_mapping():
    # SRB2 2.2 rearranged its palette. Translating the old indices directly
    # without this step turns Applejack green and Luna magenta.
    old=(ROOT/'engines/srb2-legacy.pal').read_bytes()
    with zipfile.ZipFile(ROOT/'tmp/arcade/srb2-windows/srb2.pk3') as z:
        new=z.read(next(n for n in z.namelist() if n.rsplit('/',1)[-1]=='PLAYPAL'))[:768]
    triples=lambda b:[tuple(b[i:i+3]) for i in range(0,768,3)]
    current=triples(new)
    return bytes(min(range(256),key=lambda j:sum((a-b)**2 for a,b in zip(rgb,current[j]))) for rgb in triples(old))

def remap_patch(raw,mapping):
    data=bytearray(raw);width=struct.unpack_from('<H',data)[0];seen=set()
    for x in range(width):
        offset=struct.unpack_from('<I',data,8+x*4)[0]
        while data[offset]!=255 and offset not in seen:
            seen.add(offset);length=data[offset+1]
            for i in range(offset+3,offset+3+length):data[i]=mapping[data[i]]
            offset+=length+4
    return bytes(data)

def converted_characters():
    mapping=legacy_mapping()
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,9) as z:
        for index,(file,name,realname,ability,color) in enumerate(adventure_ponies):
            lumps=wadread((MODS/'pony wads'/(file+'.wad')).read_bytes());old=dict(lumps)
            skin=next(data.decode('utf8') for key,data in lumps if key.startswith('S_SKIN'))
            prefix=next(key[:4] for key,_ in lumps if len(key)==6 and key.endswith('A1'))
            settings={k.lower():v for k,v in re.findall(r'(?m)^([\w]+)\s*=\s*([^\r\n]+)',skin)}
            base=f'{index+1}_{name}/'
            params=f'name = {name}\nrealname = {realname}\nhudname = {name.upper()}\nability = {ability}\nability2 = CA2_SPINDASH\nstartcolor = {settings.get("startcolor","96")}\nprefcolor = {color}\nnormalspeed = {settings.get("normalspeed","33")}\nthrustfactor = 5\naccelstart = 96\nacceleration = 40\nactionspd = 30\n'
            for key,data in lumps:
                if key.startswith('DS'):z.writestr('Sounds/'+key,data)
            z.writestr(base+'S_SKIN',params)
            for animation,frames in SPR2.items():
                for i,frame in enumerate(frames):
                    for key,data in lumps:
                        if not key.startswith(prefix+frame) or len(key) not in (6,8) or key[5] not in '012345678':continue
                        rest=chr(65+i)+key[5]
                        if len(key)==8:rest+=chr(65+i)+key[7]
                        z.writestr(base+animation+rest,remap_patch(data,mapping))
            life=remap_patch(old[settings['face']],mapping)
            for animation in ['LIFE','SIGN','XTRA']:z.writestr(base+animation+'A0',life)
    return out.getvalue()

def copy_files(source,target,names):
    target.mkdir(parents=True,exist_ok=True)
    for name in names:
        if (source/name).exists():shutil.copy2(source/name,target/name)

def course_headers():
    with zipfile.ZipFile(ROOT/'tmp/arcade/srb2-windows/zones.pk3') as z:adventure=z.read('SOC/SOC_HEAD.txt').decode().replace('\r','')
    kart=next(b.decode().replace('\r','') for n,b in wadread((ROOT/'tmp/arcade/kart-windows/maps.kart').read_bytes()) if n=='SOC_MAIN')
    return {'adventure':adventure,'ponykart':kart}

def level_overrides(game):
    # Replacing a SOC LEVEL section resets its header. Retain original music,
    # race flags, lap counts, skies and other gameplay properties explicitly.
    headers={int(m[1]):{k:v.strip() for k,v in re.findall(r'^([\w]+)\s*=\s*(.+)$',m[2].split('\n\n')[0],re.M)} for m in re.finditer(r'^LEVEL (\d+)\s*\n([\s\S]*?)(?=^LEVEL |\Z)',course_headers()[game],re.M|re.I)}
    text=''
    for number,title in course_catalog()[game]:
        fields=headers[number]
        fields.update(LEVELNAME=title,NOZONE='1',UNLOCKABLE='0')
        if game=='adventure':fields.update(ACT='0',PRECUTSCENENUM='0',CUTSCENENUM='0')
        else:fields.update(SUBTITLE='Friendship circuit')
        text+=f'LEVEL {number}\n'+''.join(f'{key} = {value}\n' for key,value in fields.items())+'\n'
    return text

def course_catalog():
    result={'adventure':[],'ponykart':[]}
    for game,text in course_headers().items():
        for m in re.finditer(r'^LEVEL (\d+)\s*\n([\s\S]*?)(?=^LEVEL |\Z)',text,re.M|re.I):
            number=int(m[1]);fields={k.lower():v.strip() for k,v in re.findall(r'^([\w]+)\s*=\s*(.+)$',m[2],re.M)}
            if game=='adventure' and number not in [1,2,4,5,7,8,10,11,13,14,16,22,23,30,32,33,40,41,42]:continue
            if game=='ponykart' and 'race' not in fields.get('typeoflevel','').lower():continue
            name=fields.get('levelname',f'Trail {number}')
            name=re.sub(r'(?i)metal sonic','Silver Hoof',name)
            name=re.sub(r'(?i)sonic','Rainbow',name)
            name=re.sub(r'(?i)eggman','Everfree',name)
            name=re.sub(r'(?i)egg','Cloud',name)
            if game=='adventure' and fields.get('act','0')!='0':name+=' - '+fields['act']
            result[game].append([number,name])
    (ROOT/'desktop').mkdir(exist_ok=True)
    (ROOT/'desktop/courses.json').write_text(json.dumps(result,indent=2))
    return result

def prepare_adventure():
    src=ROOT/'tmp/arcade/srb2-windows';dest=ROOT/'native/adventure'
    copy_files(src,dest,['zones.pk3','music.pk3','LICENSE.txt','LICENSE-3RD-PARTY.txt','README.txt','libcurl.dll','exchndl.dll','mgwhelp.dll'])
    (dest/'characters.pk3').write_bytes(converted_characters())
    replaced=[]
    with zipfile.ZipFile(src/'srb2.pk3') as source,zipfile.ZipFile(dest/'srb2.pk3','w',zipfile.ZIP_DEFLATED,6) as z:
        for name in source.namelist():
            if name.endswith('/'):continue
            data=source.read(name)
            if name.startswith(('Graphics/Titlescreen/','Graphics/Story/','Graphics/STJr Intro/')):
                data=BLANK;replaced.append(name)
            if name.rsplit('/',1)[-1].startswith('SIGN') and name.startswith('Sprites/'):
                data=starpatch();replaced.append(name)
            z.writestr(name,data)
    # Defaults are written per profile by the launcher, outside the readonly bundle.
    with zipfile.ZipFile(dest/'ponyhaven.pk3','w',zipfile.ZIP_DEFLATED) as z:
        soc='MAINCFG\nGAMEDATA = ponyhaven.dat\n\n'
        soc+=level_overrides('adventure')
        z.writestr('SOC/ponyhaven.txt',soc)
    return replaced

def prepare_kart():
    src=ROOT/'tmp/arcade/kart-windows';dest=ROOT/'native/ponykart'
    copy_files(src,dest,['srb2.srb','gfx.kart','textures.kart','maps.kart','sounds.kart','music.kart','LICENSE.txt','LICENSE-3RD-PARTY.txt','README.txt','libcurl.dll','exchndl.dll','mgwhelp.dll'])
    with zipfile.ZipFile(MODS/'ponykart mod/KC_MLP_Pack_v1a.pk3') as z:
        files=[n for n in z.namelist() if not n.endswith('/')]
        lumps=[(n.rsplit('/',1)[-1],z.read(n)) for n in files if not n.startswith('skins/')]
        for pony in ['twilight','applejack','fluttershy','rarity','rainbowdash','pinkiepie']:
            base='skins/'+pony+'/'
            lumps.append(('S_SKIN',z.read(base+'S_SKIN')))
            lumps.extend((n.rsplit('/',1)[-1],z.read(n)) for n in files if n.startswith(base) and not n.endswith('S_SKIN'))
            lumps.append(('S_END',b''))
    (dest/'chars.kart').write_bytes(wadwrite(lumps))
    # Keep the level data and game systems; replace launcher/title branding.
    changes=[]
    palette=dict(wadread((src/'srb2.srb').read_bytes()))['PLAYPAL'][:768]
    branded={'BIGSONIC','SONBILBD','BILSONIC','SONIC_C','SONIC_I','SONIC_N','SONIC_O','SONIC_S','BLIMPEGG','AOSTHEGG','SCDS8EGG','K_ITEGGM','K_ISEGGM','K_EGGN3','K_EGGN2','K_EGGN1','K_EGGN0'}
    # Shared starting-line banners repeat the old logo across many tracks.
    branded.update(f'FINISH{i:02}' for i in range(1,31))
    branded.update({'BILSRBTD','COLOSSRB'})
    for file in ['gfx.kart','srb2.srb','textures.kart']:
        lumps=wadread((src/file).read_bytes());edited=[]
        for name,data in lumps:
            if re.match(r'^(M_TITLE|KARTLOGO|KARTLOG|TTSONIC|TTLSONIC|STJRI|INTRO\d|SONICDO|TTKART|TTBANNER)',name):data=BLANK;changes.append(file+':'+name)
            if name in branded:data=friendship_billboard(data,palette);changes.append(file+':'+name)
            edited.append((name,data))
        (dest/file).write_bytes(wadwrite(edited))
    with zipfile.ZipFile(dest/'ponyhaven.pk3','w',zipfile.ZIP_DEFLATED) as z:
        soc='MAINCFG\nGAMEDATA = ponykart.dat\n\n'
        soc+=level_overrides('ponykart')
        z.writestr('SOC/ponyhaven.txt',soc)
    return changes

if __name__=='__main__':
    replaced={'adventure':prepare_adventure(),'ponykart':prepare_kart()}
    manifest={}
    for game in replaced:
        folder=ROOT/'native'/game
        manifest[game]={p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in folder.iterdir() if p.is_file()}
    (ROOT/'native/manifest.json').write_text(json.dumps(manifest,indent=2))
    (ROOT/'tmp/arcade/asset-changes.json').write_text(json.dumps(replaced,indent=2))
    print('Prepared Adventure (7 ponies) and Ponykart (Mane 6). Original mods are unchanged.')
