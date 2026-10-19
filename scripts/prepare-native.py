"""Download verified upstream releases, curate pony assets and build both engines."""
import pathlib,json,hashlib,subprocess,zipfile,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
folder=ROOT/'tmp/arcade';folder.mkdir(parents=True,exist_ok=True)
for item in json.loads((ROOT/'engines/downloads.json').read_text()):
    archive=folder/item['file']
    if not archive.exists():subprocess.run(['curl.exe','-L','--fail',item['url'],'-o',str(archive)],check=True)
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=item['sha256']:raise RuntimeError('Download checksum mismatch: '+str(archive))
    dest=folder/item['directory'];dest.mkdir(exist_ok=True)
    if archive.suffix=='.zip':
        with zipfile.ZipFile(archive) as z:
            for name in z.namelist():
                if not (dest/name).resolve().is_relative_to(dest.resolve()):raise RuntimeError('Unsafe archive member')
            z.extractall(dest)
    else:
        subprocess.run([r'C:\Program Files\7-Zip\7z.exe','x',str(archive),'-o'+str(dest),'-y'],check=True)
for script in ['prepare-native-assets.py','patch-native.py']:
    subprocess.run([sys.executable,str(ROOT/'scripts'/script)],cwd=ROOT,check=True)
for game in ['adventure','ponykart']:
    subprocess.run([sys.executable,str(ROOT/'scripts/build-native.py'),game],cwd=ROOT,check=True)
subprocess.run([sys.executable,str(ROOT/'scripts/native-manifest.py')],cwd=ROOT,check=True)
