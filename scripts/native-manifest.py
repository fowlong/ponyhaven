import pathlib,json,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
manifest={game:{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted((ROOT/'native'/game).iterdir()) if p.is_file() and p.name!='latest-log.txt' and p.suffix!='.log'} for game in ['adventure','ponykart']}
(ROOT/'native/manifest.json').write_text(json.dumps(manifest,indent=2))
print('Updated native runtime SHA-256 manifest.')
