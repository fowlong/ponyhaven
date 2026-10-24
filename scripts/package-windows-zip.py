"""Create a portable ZIP and verify its CRCs before replacing the published file."""
import hashlib
import pathlib
import sys
import zipfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
folder=pathlib.Path(sys.argv[1]).resolve()
release=(ROOT/'release').resolve()
if not folder.is_relative_to(release) or folder == release:
    raise ValueError('Package folder must be inside release')
files=sorted(p for p in folder.rglob('*') if p.is_file() and p.name!='FILES.sha256')
for file in files:
    if file.is_symlink() or not file.resolve().is_relative_to(folder):
        raise ValueError('Unexpected package link: '+str(file))
    if file.name.startswith('.env') or file.suffix == '.log' or file.name in ('save.json','profiles.json','activation.bin'):
        raise ValueError('Unexpected private/runtime data: '+str(file))
with (folder/'FILES.sha256').open('w',encoding='utf8') as manifest:
    for file in files:
        with file.open('rb') as handle:
            digest=hashlib.file_digest(handle,'sha256').hexdigest()
        manifest.write(digest+'  '+file.relative_to(folder).as_posix()+'\n')
files.append(folder/'FILES.sha256')
temporary=release/'Ponyhaven-Windows.zip.partial'
with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED,compresslevel=5,allowZip64=True) as z:
    for file in files:
        z.write(file,folder.name+'/'+file.relative_to(folder).as_posix())
with zipfile.ZipFile(temporary) as z:
    bad=z.testzip()
    if bad:raise RuntimeError('ZIP integrity failure: '+bad)
destination=release/'Ponyhaven-Windows.zip'
temporary.replace(destination)
with destination.open('rb') as handle:
    digest=hashlib.file_digest(handle,'sha256').hexdigest()
(release/'Ponyhaven-Windows.zip.sha256').write_text(digest+'  Ponyhaven-Windows.zip\n',encoding='ascii')
print('Verified portable ZIP:',destination)
print('Files:',len(files),'Bytes:',destination.stat().st_size,'SHA-256:',digest)
