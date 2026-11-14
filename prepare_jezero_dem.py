#!/usr/bin/env python3
"""Convert the public USGS Jezero CTX stereo DEM GeoTIFF into a browser-ready local Mars grid.

Usage:
  python prepare_jezero_dem.py --download
  python prepare_jezero_dem.py --input /path/to/M20_JezeroCrater_CTXDEM_20m.tif

Output: data/jezero_dem.json (approx. 40 m grid, measured elevations, null for nodata).

No orbital photo/shaded-relief is used as elevation.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
from urllib.request import Request, urlopen

import numpy as np
import rasterio
from pyproj import CRS, Transformer

R = 3396190.0
LAT0, LON0 = 18.44, 77.42
XMIN, XMAX, YMIN, YMAX = -4850.0, 4850.0, -3500.0, 3500.0
SOURCE_URL = 'https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif'
ALTERNATE_URL = 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif'
SOURCE_ID = 'USGS_M20_JezeroCrater_CTXDEM_20m'


def download(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size > 10_000_000:
        print('Reuse existing TIFF:', path)
        return path
    for url in (SOURCE_URL, ALTERNATE_URL):
        print('Downloading authoritative source (may be ~87 MB):', url)
        tmp = path.with_suffix('.part')
        try:
            with urlopen(Request(url, headers={'User-Agent':'MartianNavigatorDemo/0.3 (USGS data)'}), timeout=80) as r, open(tmp, 'wb') as f:
                while True:
                    chunk = r.read(1024*1024)
                    if not chunk:
                        break
                    f.write(chunk)
            os.replace(tmp, path)
            return path
        except Exception as exc:
            print('Could not download from this mirror:', exc)
            tmp.unlink(missing_ok=True)
    raise SystemExit('官方 GeoTIFF 下載失敗：請自行由 README 的 USGS 連結下載，然後加 --input 指定檔案。')


def geo_to_dataset(crs, lon, lat):
    """Transform Mars planetocentric/east-positive geodetic coords, NEVER Earth EPSG:4326."""
    target = CRS.from_user_input(crs)
    if target.is_geographic:
        # Some older PDS GeoTIFFs carry a custom Mars lat/lon CRS.
        return lon, lat
    try:
        # Use the source's *own Mars geodetic sphere* for the degree→metre map projection.
        # Some Jezero mosaics use a=3,396,160m, others 3,396,190m.
        # Never transform between two incompatible Mars datums or Earth EPSG:4326.
        native_geo = target.geodetic_crs
        if native_geo is None:
            raise ValueError('Source projected Mars CRS lacks geodetic component')
        transformer = Transformer.from_crs(native_geo, target, always_xy=True, allow_ballpark=False)
        X, Y = transformer.transform(lon, lat)
    except Exception as exc:
        raise ValueError('Mars CRS 轉換失敗，請檢查 GeoTIFF WKT。' + str(exc)) from exc
    if not np.isfinite(X).all() or not np.isfinite(Y).all():
        raise ValueError('Mars CRS 轉換產生非有限值。')
    return X, Y


def convert(source, target, step=40.0, source_url=SOURCE_URL):
    source, target = Path(source), Path(target)
    nx = round((XMAX-XMIN)/step)+1
    ny = round((YMAX-YMIN)/step)+1
    xs = np.linspace(XMIN, XMAX, nx, dtype='float64')
    ys = np.linspace(YMAX, YMIN, ny, dtype='float64')
    X, Y = np.meshgrid(xs, ys)
    # EXACT SAME local coordinate convention as core.js (east m cos(lat0), north m).
    lon = LON0 + np.rad2deg(X/(R*math.cos(math.radians(LAT0))))
    lat = LAT0 + np.rad2deg(Y/R)
    with rasterio.open(source) as ds:
        if not ds.crs:
            raise ValueError('GeoTIFF 未宣告 CRS，拒絕猜測地理定位。')
        print('Source CRS:', str(ds.crs)[:240])
        if ds.count!=1:
            raise ValueError('需要單波段浮點 DEM，不可匯入 RGB 軌道影像。')
        if 'EQ' not in ds.crs.to_wkt().upper() and 'EQUIRECTANGULAR' not in ds.crs.to_wkt().upper() and 'EQC' not in ds.crs.to_wkt().upper():
            if not ds.crs.is_geographic:
                raise ValueError('此工具限定 Jezero 等距圓柱 DEM；其他投影請先正確重投影。')
        destx, desty=geo_to_dataset(ds.crs, lon, lat)
        # Pixel-center values: rasterio Affine maps outer corner; subtract 0.5.
        colrow=~ds.transform
        col = colrow.a*destx+colrow.b*desty+colrow.c-.5
        row = colrow.d*destx+colrow.e*desty+colrow.f-.5
        if (np.isfinite(col)&np.isfinite(row)).mean()<.99:
            raise ValueError('投影值無效')
        c0 = np.floor(col).astype('int64')
        r0 = np.floor(row).astype('int64')
        inside = (c0>=0)&(r0>=0)&(c0<ds.width-1)&(r0<ds.height-1)
        if inside.mean()<.25:
            raise ValueError(f'中心區域不在 DEM 範圍（inside={inside.mean():.1%}），請確認火星座標或來源 TIFF。')
        arr = ds.read(1, masked=True)
        heights = np.asarray(arr.filled(np.nan), dtype='float64')
        if ds.nodata is not None:
            heights[heights==ds.nodata]=np.nan
        heights[np.abs(heights)>12000]=np.nan
        result = np.full((ny,nx), np.nan, dtype='float64')
        idx = np.nonzero(inside)
        i,j=c0[idx],r0[idx]
        a,b=col[idx]-i,row[idx]-j
        v00=heights[j,i];v10=heights[j,i+1];v01=heights[j+1,i];v11=heights[j+1,i+1]
        valid = np.isfinite(v00)&np.isfinite(v10)&np.isfinite(v01)&np.isfinite(v11)
        z=v00*(1-a)*(1-b)+v10*a*(1-b)+v01*(1-a)*b+v11*a*b
        result[idx]=np.where(valid,z,np.nan)
        coverage = np.isfinite(result).mean()
        rover_idx = (int(round((-820-YMAX)/(YMIN-YMAX)*(ny-1))),int(round((-1400-XMIN)/(XMAX-XMIN)*(nx-1))))
        print(f'Output grid {nx}×{ny}; valid coverage {coverage:.1%}, rover DEM elevation {result[rover_idx]:.2f} m')
        if coverage<.4 or not np.isfinite(result[rover_idx]):
            raise ValueError('高程無效格過多或探測車起點缺 DEM；拒絕輸出不可信的表面。')
        digest=hashlib.sha256()
        with open(source,'rb') as f:
            for chunk in iter(lambda:f.read(2*1024*1024),b''):
                digest.update(chunk)
        metadata={'id':SOURCE_ID,'title':'Mars 2020 Science Investigation CTX DEM Mosaic, Jezero crater',
            'url':source_url,'citation':'Fred Calef et al.; USGS Astrogeology Science Center (2021)',
            'original_sha256':digest.hexdigest(),'pixel_size_source_m':20,'sample_step_m':step,
            'actual_grid_pitch_east_m':(XMAX-XMIN)/(nx-1),'actual_grid_pitch_north_m':(YMAX-YMIN)/(ny-1),
            'vertical_units':'m','vertical_reference':'MOLA controlled as described by USGS; not Earth sea level',
            'planetocentric':True,'positive_longitude':'E','source_crs_wkt':ds.crs.to_wkt()[:6000],
            'source_transform':list(ds.transform)[:6], 'valid_fraction':round(float(coverage),6)}
    # 0.01 m quantization, do not convert to 8-bit grayscale.
    flat=[None if not np.isfinite(v) else round(float(v),2) for v in result.ravel()]
    payload={'schema':'jezero-dem-grid-v1','crs':'MARS_EQ_LOCAL_TANGENT', 'width':nx, 'height':ny,
        'xMin':XMIN,'xMax':XMAX,'yMin':YMIN,'yMax':YMAX,'source':metadata, 'heights':flat}
    target.parent.mkdir(parents=True,exist_ok=True)
    with target.open('w',encoding='utf-8') as f:
        json.dump(payload,f,ensure_ascii=False,separators=(',',':'),allow_nan=False)
    print('Saved', target, f'({target.stat().st_size/1024/1024:.2f} MiB)')
    return payload


def main():
    p=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    g=p.add_mutually_exclusive_group(required=True)
    g.add_argument('--input',type=Path,help='Original USGS GeoTIFF file, local')
    g.add_argument('--download',action='store_true',help='Download original USGS GeoTIFF before converting')
    p.add_argument('--output',type=Path,default=Path(__file__).parent/'data'/'jezero_dem.json')
    p.add_argument('--step',type=float,default=40.0,help='Output sample pitch in metres (20~120)')
    args=p.parse_args()
    if not 20<=args.step<=120:
        p.error('--step must be 20..120 metres')
    path=download(Path(__file__).parent/'data'/'M20_JezeroCrater_CTXDEM_20m.tif') if args.download else args.input
    convert(path,args.output,args.step)

if __name__=='__main__':
    main()
