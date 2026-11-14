"""Sample a wider Jezero CTX DEM window from the official numeric mosaic."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path('.build/python').resolve()))
import hashlib, json, math, urllib.request
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import Window

URL='https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif'
R=3396190
LAT,LON=18.44,77.42
HALF,STEP=15000,40
N=2*HALF//STEP+1
with urllib.request.urlopen(urllib.request.Request(URL,method='HEAD')) as response:
    identity={'url':URL,'etag':response.headers.get('ETag'),'content_length':response.headers.get('Content-Length')}
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',GDAL_HTTP_TIMEOUT='90'):
    with rasterio.open(URL) as src:
        x=R*math.cos(math.radians(18.4663))*math.radians(LON)
        y=R*math.radians(LAT)
        col=(x-src.transform.c)/src.transform.a
        row=(src.transform.f-y)/abs(src.transform.e)
        window=Window(col-(HALF+STEP/2)/20,row-(HALF+STEP/2)/20,(2*HALF+STEP)/20,(2*HALF+STEP)/20)
        z=src.read(1,window=window,out_shape=(N,N),masked=True,resampling=Resampling.bilinear)
        valid=~np.ma.getmaskarray(z)
        if valid.mean()<.4 or not valid[N//2,N//2]: raise ValueError('Insufficient Jezero coverage')
        identity.update(id='USGS_M20_Jezero_CTXDEM_20m_extended',title='Mars 2020 Science Investigation CTX DEM Mosaic',
            citation='Fred Calef et al.; USGS Astrogeology Science Center',source_crs_wkt=src.crs.to_wkt(),
            source_transform=list(src.transform)[:6],source_window=[window.col_off,window.row_off,window.width,window.height],
            native_pixel_size_m=list(src.res),sample_step_m=STEP,vertical_units='m',
            valid_fraction=float(valid.mean()),sampled_window_sha256=hashlib.sha256(z.filled(0).astype('float32').tobytes()).hexdigest(),
            limitations='40 m display sampling from 20 m CTX DEM; voids retained; no independent registration assessment.')
        grid={'schema':'mars-local-grid-v1','crs':'MARS_EQ_LOCAL_TANGENT','origin':{'lat':LAT,'lng':LON},
            'width':N,'height':N,'xMin':-HALF,'xMax':HALF,'yMin':-HALF,'yMax':HALF,
            'source':identity,'heights':[round(float(v),2) if ok else None for v,ok in zip(z.data.flat,valid.flat)]}
        out=Path('data/jezero-extended/dem.json'); out.parent.mkdir(parents=True,exist_ok=True)
        out.write_text(json.dumps(grid,separators=(',',':'))+'\n',encoding='utf-8')
        print('Jezero extended:',N,'x',N,'valid fraction',valid.mean())
