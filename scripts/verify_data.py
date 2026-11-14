from pathlib import Path
import sys,json,hashlib,urllib.request,math
import numpy as np,rasterio
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from prepare_jezero_dem import geo_to_dataset,R,LAT0,LON0
root=Path(__file__).resolve().parents[1];data=root/'data'
dem=json.loads((data/'jezero_dem.json').read_text('utf-8'))
source=dem['source'];local_hash=hashlib.file_digest((data/'M20_JezeroCrater_CTXDEM_20m.tif').open('rb'),'sha256').hexdigest()
assert local_hash==source['original_sha256']
url='https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif'
digest=hashlib.sha256()
with urllib.request.urlopen(url,timeout=120) as response:
 for chunk in iter(lambda:response.read(1024*1024),b''):digest.update(chunk)
assert digest.hexdigest()==local_hash,'Official mirror does not match local DEM'
with rasterio.open(data/'M20_JezeroCrater_CTXDEM_20m.tif') as ds:
 x,y=geo_to_dataset(ds.crs,np.array([LON0]),np.array([LAT0]));assert np.isfinite(x).all()
 source_info={'width':ds.width,'height':ds.height,'resolution':ds.res,'marsRadius':ds.crs.to_dict().get('R'),'bounds':list(ds.bounds)}
values=np.array([np.nan if v is None else v for v in dem['heights']]);valid=np.isfinite(values)
report={'officialMirrorVerified':url,'sha256':local_hash,'source':source_info,'grid':{'width':dem['width'],'height':dem['height'],'pitchEast':(dem['xMax']-dem['xMin'])/(dem['width']-1),'pitchNorth':(dem['yMax']-dem['yMin'])/(dem['height']-1),'validFraction':float(valid.mean()),'min':float(np.nanmin(values)),'max':float(np.nanmax(values))},'geologyFeatureCount':len(json.loads((data/'geology.json').read_text('utf-8'))['features']),'registration':'Common Mars sphere and coordinate transforms; no independently measured image registration accuracy'}
(root/'artifacts'/'data-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
