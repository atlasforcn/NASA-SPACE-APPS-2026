"""Build a local Valles Marineris CTX DEM from a USGS STAC DTM."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path('.build/python').resolve()))
import hashlib, json, math, urllib.request
import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.warp import reproject
from rasterio.windows import from_bounds, Window
from rasterio.transform import from_origin

ITEM='P22_009684_1699_XN_10S069W__B02_010396_1699_XN_10S069W'
STAC=f'https://stac.astrogeology.usgs.gov/api/collections/mro_ctx_controlled_usgs_dtms/items/{ITEM}'
LAT,LON,R=-10.0,-69.3,3396190
HALF,STEP=10000,40
N=2*HALF//STEP+1
item=json.load(urllib.request.urlopen(STAC))
url=item['assets']['dtm']['href']
with urllib.request.urlopen(urllib.request.Request(url,method='HEAD')) as response:
    identity={'url':url,'etag':response.headers.get('ETag'),'content_length':response.headers.get('Content-Length')}
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',GDAL_HTTP_TIMEOUT='90'):
    with rasterio.open(url) as src:
        # The source is the Mars sphere / equirectangular projection with lat_ts=0.
        # The destination is the site's local Mars tangent equirectangular frame.
        xc=R*math.radians(LON); yc=R*math.radians(LAT)
        edge=HALF+STEP/2
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
        if valid.mean()<.4 or not valid[N//2,N//2]: raise ValueError('Insufficient Valles DTM coverage')
        identity.update(id='USGS_STAC_'+ITEM,title='USGS controlled MRO CTX DTM',stac_item=STAC,
            source_crs_wkt=src.crs.to_wkt(),source_transform=list(src.transform)[:6],
            source_window=[window.col_off,window.row_off,window.width,window.height],
            native_pixel_size_m=list(src.res),sample_step_m=STEP,vertical_units='m',valid_fraction=float(valid.mean()),
            sampled_window_sha256=hashlib.sha256(source.filled(0).astype('float32').tobytes()).hexdigest(),
            limitations='Single CTX stereo DTM sampled at 40 m; voids retained; no independent registration assessment.')
        grid={'schema':'mars-local-grid-v1','crs':'MARS_EQ_LOCAL_TANGENT','origin':{'lat':LAT,'lng':LON},
            'width':N,'height':N,'xMin':-HALF,'xMax':HALF,'yMin':-HALF,'yMax':HALF,
            'source':identity,'heights':[round(float(v),2) if ok else None for v,ok in zip(z.flat,valid.flat)]}
        out=Path('data/valles/dem.json');out.parent.mkdir(parents=True,exist_ok=True)
        out.write_text(json.dumps(grid,separators=(',',':'))+'\n',encoding='utf8')
        print('Valles:',N,'x',N,'valid fraction',valid.mean(),'range',np.nanmin(z),np.nanmax(z))
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',GDAL_HTTP_TIMEOUT='90'):
    with rasterio.open(item['assets']['orthoimage']['href']) as src:
        window=from_bounds(left,bottom,right,top,src.transform).round_offsets().round_lengths().intersection(Window(0,0,src.width,src.height))
        source=src.read(1,window=window,masked=True)
        image=np.full((N,N),np.nan,dtype='float32')
        reproject(source.filled(np.nan).astype('float32'),image,src_transform=src.window_transform(window),src_crs=src.crs,
            src_nodata=np.nan,dst_transform=target_transform,dst_crs=target_crs,dst_nodata=np.nan,resampling=Resampling.bilinear)
        mask=np.isfinite(image)
        low,high=np.nanpercentile(image,[1,99])
        gray=np.clip((np.nan_to_num(image,nan=low)-low)/(high-low)*255,0,255).astype('uint8')
        rgba=np.stack([gray,gray,gray,(mask*255).astype('uint8')],axis=-1)
        Image.fromarray(rgba).save('data/valles/optical.png')
        photo={'url':item['assets']['orthoimage']['href'],'stac_item':STAC,'source_crs_wkt':src.crs.to_wkt(),
            'native_pixel_size_m':list(src.res),'sample_step_m':STEP,'display_size':[N,N],
            'valid_fraction':float(mask.mean()),'contrast_percentiles':[1,99],
            'sampling':'bilinear reprojection; display only, not elevation'}
        Path('data/valles/optical-source.json').write_text(json.dumps(photo,indent=2)+'\n',encoding='utf8')
