"""Sample the official Jezero HiRISE DTM into a small local Mars grid."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path('.build/python').resolve()))
import hashlib, json, math, urllib.request
import numpy as np
import rasterio
from rasterio.warp import reproject
from rasterio.enums import Resampling
from rasterio.windows import from_bounds, Window
from rasterio.transform import from_origin

URL='https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/DTM_MOLAtopography_DeltaGeoid_Jezero_C_Edited_affine_1m_Eqc_latTs0_lon0.tif'
R,LAT,LON=3396190,18.44,77.425
HALF,STEP=2000,5
N=2*HALF//STEP+1
with urllib.request.urlopen(urllib.request.Request(URL,method='HEAD')) as response:
    identity={'url':URL,'etag':response.headers.get('ETag'),'content_length':response.headers.get('Content-Length')}
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',GDAL_HTTP_TIMEOUT='90'):
    with rasterio.open(URL) as src:
        xc=R*math.radians(LON);yc=R*math.radians(LAT);edge=HALF+STEP/2
        left,right=xc-edge/math.cos(math.radians(LAT)),xc+edge/math.cos(math.radians(LAT))
        bottom,top=yc-edge,yc+edge
        window=from_bounds(left,bottom,right,top,src.transform).round_offsets().round_lengths().intersection(Window(0,0,src.width,src.height))
        source=src.read(1,window=window,masked=True)
        source_transform=src.window_transform(window)
        target_crs=rasterio.crs.CRS.from_proj4(f'+proj=eqc +lat_ts={LAT} +lon_0={LON} +y_0={-yc} +R={R} +units=m +no_defs')
        target_transform=from_origin(-edge,edge,STEP,STEP)
        z=np.full((N,N),np.nan,dtype='float32')
        reproject(source.filled(np.nan).astype('float32'),z,src_transform=source_transform,src_crs=src.crs,
            src_nodata=np.nan,dst_transform=target_transform,dst_crs=target_crs,dst_nodata=np.nan,resampling=Resampling.bilinear)
        valid=np.isfinite(z)
        if valid.mean()<.4 or not valid[N//2,N//2]: raise ValueError('Insufficient HiRISE DTM coverage')
        identity.update(id='USGS_Jezero_C_HiRISE_DTM_1m',title='Jezero C HiRISE DTM',
            source_crs_wkt=src.crs.to_wkt(),source_transform=list(src.transform)[:6],
            source_window=[window.col_off,window.row_off,window.width,window.height],native_pixel_size_m=list(src.res),
            sample_step_m=STEP,vertical_units='m',valid_fraction=float(valid.mean()),
            sampled_window_sha256=hashlib.sha256(source.filled(0).astype('float32').tobytes()).hexdigest(),
            limitations='Single HiRISE DTM tile sampled at 5 m; voids retained; pixel spacing is not vertical accuracy.')
        grid={'schema':'mars-local-grid-v1','crs':'MARS_EQ_LOCAL_TANGENT','origin':{'lat':LAT,'lng':LON},
            'width':N,'height':N,'xMin':-HALF,'xMax':HALF,'yMin':-HALF,'yMax':HALF,
            'source':identity,'heights':[round(float(v),2) if ok else None for v,ok in zip(z.flat,valid.flat)]}
        out=Path('data/jezero-hirise/dem.json');out.parent.mkdir(parents=True,exist_ok=True)
        out.write_text(json.dumps(grid,separators=(',',':'))+'\n',encoding='utf8')
        print('Jezero HiRISE:',N,'x',N,'valid fraction',valid.mean(),'range',np.nanmin(z),np.nanmax(z))
