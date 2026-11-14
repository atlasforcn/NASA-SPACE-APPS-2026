"""Download official 16 ppd MOLA MEGDR numeric topography; preserve PDS label."""
from pathlib import Path
import urllib.request,ssl,certifi,hashlib,json,numpy as np
root=Path(__file__).resolve().parents[1];data=root/'data'
base='https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb'
context=ssl.create_default_context(cafile=certifi.where())
for suffix in ['lbl','img']:
 target=data/('mola16.'+suffix)
 if not target.exists():
  temp=target.with_suffix('.part')
  with urllib.request.urlopen(base+'.'+suffix,context=context,timeout=120) as r,temp.open('wb') as f:
   while chunk:=r.read(1024*1024):f.write(chunk)
  temp.replace(target)
label=(data/'mola16.lbl').read_text()
assert 'MSB_INTEGER' in label and 'LINE_SAMPLES                 = 5760' in label and 'LINES                        = 2880' in label
raw=(data/'mola16.img').read_bytes();assert len(raw)==5760*2880*2
a=np.frombuffer(raw,dtype='>i2');assert -10000<int(a.min())<0 and 20000<int(a.max())<30000
# Little-endian browser binary; source centres: lon=(col+.5)/16, lat=90-(row+.5)/16.
a.astype('<i2').tofile(data/'mola16.bin')
meta={'schema':'mars-global-mola-v1','source':base+'.img','label':base+'.lbl','source_sha256':hashlib.sha256(raw).hexdigest(),'binary_sha256':hashlib.sha256((data/'mola16.bin').read_bytes()).hexdigest(),'width':5760,'height':2880,'pixelsPerDegree':16,'sampleType':'int16-little-endian','pixelCentre':'lon=(column+0.5)/16; lat=90-(row+0.5)/16','longitude':'positive East 0..360; cyclic','latitude':'planetocentric','verticalReference':'topography = planetary radius minus GMM3 areoid radius; metres','nativeEquatorialCellMeters':3705,'minimum':int(a.min()),'maximum':int(a.max()),'limitations':'Median binned topography with interpolated cells supplied by source. Not 20m terrain, not obstacle-scale navigation. Polar longitudes converge.'}
(data/'mola16.json').write_text(json.dumps(meta,indent=2),encoding='utf-8');print(json.dumps(meta))
