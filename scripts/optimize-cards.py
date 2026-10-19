"""Encode cached source card images as actual WebP; preserve composition/watermarks."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

root=Path(__file__).resolve().parents[1]/'public/assets/cards'
files=list(root.glob('*.webp'))
before=sum(p.stat().st_size for p in files)
def optimize(path):
    with Image.open(path) as image:
        if image.format=='WEBP': return
        frame=image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
        temp=path.with_suffix('.optimized.webp')
        frame.save(temp,'WEBP',quality=92,method=4)
        temp.replace(path)
with ThreadPoolExecutor(max_workers=6) as pool:
    list(pool.map(optimize,files))
after=sum(p.stat().st_size for p in files)
print({'cards':len(files),'before_mb':round(before/1048576,1),'after_mb':round(after/1048576,1)})
