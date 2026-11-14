"""Build an offline Gale science pack from USGS remote rasters (HTTP range reads).
Requires rasterio, numpy, pillow, pyproj. Run from repository root.
No terrestrial CRS is used. Outputs share the Mars local equirectangular frame.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path('.build/python').resolve()))
import json, math, hashlib, urllib.request
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling, transform_bounds
from rasterio.windows import from_bounds, Window
from rasterio.transform import from_origin
from PIL import Image

ROOT='https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/'
LAT,LON,R=-4.59,137.44,3396190
HALF=5000
out=Path('data/gale'); out.mkdir(parents=True,exist_ok=True)
crs=rasterio.crs.CRS.from_proj4(f'+proj=eqc +lat_ts={LAT} +lon_0={LON} +y_0={-R*math.radians(LAT)} +R={R} +units=m +no_defs')

def read(name,n,step,centres=False):
    url=ROOT+name
    with urllib.request.urlopen(urllib.request.Request(url,method='HEAD')) as r:
        identity={'url':url,'etag':r.headers.get('ETag'),'content_length':r.headers.get('Content-Length')}
    # Disable directory scans/sidecar requests. Explicit bounded reads avoid downloading whole products.
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif,.ovr',GDAL_HTTP_TIMEOUT='90',GDAL_HTTP_MULTIRANGE='YES'):
        with rasterio.open(url) as original:
            # Explicit external overview: original is a 3.9 GB strip TIFF. The USGS
            # overview is tiled; inherit its georeferencing from the parent TIFF.
            overview = name.endswith('DEM_Mosaic_1m_v3.tif') or name.endswith('Orthophoto_Mosaic_25cm_v3.tif')
            src = rasterio.open(url+'.ovr') if overview else original
            src_crs=original.crs
            src_transform=original.transform*rasterio.Affine.scale(original.width/src.width,original.height/src.height)
            print(name, src.shape,src.res,src.crs,flush=True)
            edge=HALF+step/2 if centres else HALF
            target=from_origin(-edge,edge,step,step)
            b=transform_bounds(crs,src_crs,-edge,-edge,edge,edge,densify_pts=21)
            w=from_bounds(*b,src_transform).round_offsets().round_lengths().intersection(Window(0,0,src.width,src.height))
            # Use source overviews for the display; retain source resolution before DEM resampling.
            scale=max(1,int(step/min(abs(src_transform.a),abs(src_transform.e))))
            shape=(max(1,int(w.height/scale)),max(1,int(w.width/scale)))
            arr=src.read(window=w,out_shape=(src.count,*shape),masked=True,resampling=Resampling.bilinear)
            st=src_transform*rasterio.Affine.translation(w.col_off,w.row_off)*rasterio.Affine.scale(w.width/shape[1],w.height/shape[0])
            dest=np.full((src.count,n,n),np.nan,dtype='float32')
            for band in range(src.count):
                reproject(arr[band].astype('float32').filled(np.nan),dest[band],src_transform=st,src_crs=src_crs,
                    dst_transform=target,dst_crs=crs,src_nodata=np.nan,dst_nodata=np.nan,resampling=Resampling.bilinear)
            identity.update(source_crs_wkt=original.crs.to_wkt(),native_pixel_size_m=list(original.res),
                source_transform=list(original.transform)[:6],source_window=[w.col_off,w.row_off,w.width,w.height],
                overview_url=url+'.ovr' if overview else None,
                overview_base_step_m=abs(src_transform.a),
                sampling='bilinear reprojection of source raster window; no colour-to-height conversion',
                sampled_window_sha256=hashlib.sha256(arr.filled(0).tobytes()).hexdigest())
            if overview: src.close()
            return dest,identity

dem,source=read('MSL_Gale_DEM_Mosaic_1m_v3.tif',501,20,True)
z=dem[0]; valid=np.isfinite(z)
if not valid[250,250] or valid.mean()<.4: raise ValueError('Gale DEM coverage insufficient')
source.update(id='USGS_MSL_Gale_DEM_1m_v3',title='USGS MSL Gale merged DEM v3',sample_step_m=20,
    pixel_size_source_m=1,vertical_units='m',vertical_reference='MOLA-controlled merged DEM; see USGS source documentation',
    valid_fraction=float(valid.mean()),citation='Calef and Parker; NASA/JPL-Caltech/USGS/UArizona',
    limitations='Merged multi-resolution source: 1 m pixel spacing is not uniform 1 m terrain accuracy; resampled to 20 m. No independent registration assessment.')
grid=dict(schema='mars-local-grid-v1',crs='MARS_EQ_LOCAL_TANGENT',origin=dict(lat=LAT,lng=LON),
    width=501,height=501,xMin=-HALF,xMax=HALF,yMin=-HALF,yMax=HALF,source=source,
    heights=[round(float(v),2) if np.isfinite(v) else None for v in z.flat])
(out/'dem.json').write_text(json.dumps(grid,separators=(',',':'))+'\n',encoding='utf-8')
rgb,photo=read('MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif',1500,2*HALF/1500)
mask=np.all(np.isfinite(rgb[:3]),axis=0)
gray,gray_source=read('MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif',1500,2*HALF/1500)
gray_valid=np.isfinite(gray[0]); color_fraction=float(mask.mean())
for band in range(3): rgb[band]=np.where(mask,rgb[band],gray[0])
mask=mask|gray_valid
rgba=np.concatenate([np.clip(np.nan_to_num(rgb[:3]),0,255).astype('uint8'),(mask*255)[None].astype('uint8')])
Image.fromarray(rgba.transpose(1,2,0)).save(out/'optical.png')
photo.update(display_size=[1500,1500],display_step_m=2*HALF/1500,bounds=[-HALF,-HALF,HALF,HALF],valid_fraction=float(mask.mean()),color_valid_fraction=color_fraction,gray_fallback=gray_source,
    credit='NASA/JPL-Caltech/MSSS/USGS/UArizona; color mosaic Timothy Parker and Fred Calef',
    limitations='Sharpened and blended colour mosaic, display only; no independent registration assessment.')
(out/'optical-source.json').write_text(json.dumps(photo,indent=2)+'\n',encoding='utf-8')
print('Gale prepared:',int(valid.sum()),'valid DEM cells; optical coverage',mask.mean(),flush=True)
