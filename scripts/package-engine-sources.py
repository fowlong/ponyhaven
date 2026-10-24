"""Bundle the corresponding upstream sources and exact Ponyhaven changes."""
import pathlib,zipfile,os,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
dest=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else ROOT/'release/Ponyhaven-win32-x64'
if not dest.is_relative_to((ROOT/'release').resolve()):raise ValueError('Source archive must stay in release')
dest.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(dest/'engine-sources.zip','w',zipfile.ZIP_DEFLATED,6) as z:
    for name in ['srb2-native-source.zip','kart-native-source.zip']:
        z.write(ROOT/'tmp/arcade'/name,'tmp/arcade/'+name)
    for folder in ['engines']:
        for p in (ROOT/folder).rglob('*'):
            if p.is_file():z.write(p,p.relative_to(ROOT).as_posix())
    for name in ['prepare-native.py','prepare-native-assets.py','patch-native.py','build-native.py','native-manifest.py','audit-native.py']:
        z.write(ROOT/'scripts'/name,'scripts/'+name)
    z.write(ROOT/'DESKTOP_SETUP.md','DESKTOP_SETUP.md')
    mods=pathlib.Path(os.environ.get('PONYHAVEN_MODS',r'C:\Users\calla\Downloads\forens'))
    for folder in ['pony wads','ponykart mod']:
        for p in (mods/folder).iterdir():
            if p.suffix.lower() in ['.wad','.pk3','.txt','.md']:z.write(p,'original-pony-assets/'+folder+'/'+p.name)
print('Bundled engine source, build scripts, palette and original supplied mods.')
