from pathlib import Path
import hashlib,json,struct
from PIL import Image
root=Path(__file__).resolve().parents[1];meta=json.loads((root/'data/mola16.json').read_text());raw=(root/'data/mola16.bin').read_bytes()
assert len(raw)==5760*2880*2
assert hashlib.sha256(raw).hexdigest()==meta['binary_sha256']
original=root/'data/mola16.img'
if original.exists():
 source=original.read_bytes();assert hashlib.sha256(source).hexdigest()==meta['source_sha256']
 for pixel in [0,5759,5760,123456,5760*2880-1]:assert struct.unpack_from('<h',raw,pixel*2)==struct.unpack_from('>h',source,pixel*2)
image=Image.open(root/'data/mars-global-dem.jpg');assert image.size==(5760,2880)
def color(lat,lng):return image.getpixel((int((lng+180)*16)%5760,min(2879,int((90-lat)*16))))
high=color(18.6528,-133.8025);low=color(-42.6,70.5)
assert high[0]>high[2] and high[0]>180,high
assert low[2]>low[0],low
print('Global binary hash, byte order, image dimensions and longitude orientation passed')
