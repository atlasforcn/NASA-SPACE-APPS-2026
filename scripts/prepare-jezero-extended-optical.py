"""Publish the full official Jezero CTX ortho mosaic at display resolution."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path('.build/python').resolve()))
import json
import math
import urllib.request

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling

URL = 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXortho_mosaic_5m.tif'
R, LAT, LON, DOWNSAMPLE = 3396190, 18.44, 77.42, 4
with urllib.request.urlopen(urllib.request.Request(URL, method='HEAD')) as response:
    identity = {'url': URL, 'etag': response.headers.get('ETag'), 'content_length': response.headers.get('Content-Length')}
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', GDAL_HTTP_TIMEOUT='90'):
    with rasterio.open(URL) as src:
        x = R * math.cos(math.radians(18.4663)) * math.radians(LON)
        y = R * math.radians(LAT)
        width = math.ceil(src.width / DOWNSAMPLE)
        height = math.ceil(src.height / DOWNSAMPLE)
        pixels = src.read(1, out_shape=(height, width), masked=True, resampling=Resampling.bilinear)
        valid = ~np.ma.getmaskarray(pixels)
        if valid.mean() < .4:
            raise ValueError(f'CTX ortho coverage insufficient: {valid.mean():.1%}')
        low, high = np.percentile(pixels.data[valid], [1, 99])
        gray = np.clip((pixels.data.astype('float32')-low)/(high-low)*255, 0, 255).astype('uint8')
        rgba = np.stack([gray, gray, gray, valid.astype('uint8')*255], axis=-1)
        out = Path('data/jezero-extended')
        out.mkdir(parents=True, exist_ok=True)
        Image.fromarray(rgba).save(out/'optical.png', optimize=True)
        identity.update(source_crs_wkt=src.crs.to_wkt(), source_transform=list(src.transform)[:6],
            source_window=[0, 0, src.width, src.height],
            native_pixel_size_m=list(src.res), display_size=[width, height],
            display_step_m=[(src.bounds.right-src.bounds.left)/width, (src.bounds.top-src.bounds.bottom)/height],
            bounds=[src.bounds.left-x, src.bounds.bottom-y, src.bounds.right-x, src.bounds.top-y],
            valid_fraction=float(valid.mean()),
            contrast_percentiles=[1, 99], sampling='bilinear; display only, not elevation')
        (out/'optical-source.json').write_text(json.dumps(identity, indent=2)+'\n', encoding='utf-8')
        print('Full Jezero CTX ortho:', width, 'x', height, 'coverage', valid.mean())
