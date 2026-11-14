"""Build a low-resolution offline MGS/MOLA overview from NASA Mars Trek WMTS."""
from pathlib import Path
import urllib.request,io,hashlib,json,concurrent.futures
from PIL import Image
root=Path(__file__).resolve().parents[1];base='https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/2'
def tile(rc):
 y,x=rc;url=f'{base}/{y}/{x}.jpg';raw=urllib.request.urlopen(url,timeout=60).read();return x,y,Image.open(io.BytesIO(raw)).convert('RGB'),{'url':url,'sha256':hashlib.sha256(raw).hexdigest()}
image=Image.new('RGB',(2048,1024));sources=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for x,y,im,source in pool.map(tile,[(y,x) for y in range(4) for x in range(8)]):image.paste(im,(x*256,y*256));sources.append(source)
image.save(root/'data/mars-global.jpg',quality=88)
(root/'data/mars-global-source.json').write_text(json.dumps({'title':'NASA Mars Trek MGS MOLA color shaded relief overview','capabilities':'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/WMTSCapabilities.xml','bounds':[-180,-90,180,90],'size':[2048,1024],'displayDegreesPerPixel':360/2048,'nativeLayerTitle':'Mars_MGS_MOLA_ClrShade_merge_global_463m','limitations':'Overview display only; neither a numerical DEM nor an extension of the Jezero navigation model.','tiles':sources},indent=2),encoding='utf-8');print('Global MOLA overview ready')
