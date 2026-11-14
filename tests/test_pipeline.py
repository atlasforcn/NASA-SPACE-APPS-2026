"""Synthetic projected Mars GeoTIFF fixture verifies the *converter*, not real DEM accuracy."""
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_origin

ROOT=Path(__file__).resolve().parent.parent
R=3396190
LAT,LON=18.44,77.42

def main():
    with tempfile.TemporaryDirectory() as td:
        t=Path(td);tif=t/'test_synthetic_mars.tif';out=t/'jezero_dem.json'
        res=40.;w,h=350,265
        x0=R*math.radians(LON)-7000
        y0=R*math.radians(LAT)+5200
        transform=from_origin(x0,y0,res,res)
        y,x=np.mgrid[0:h,0:w]
        xx=x0+(x+.5)*res-R*math.radians(LON)
        yy=y0-(y+.5)*res-R*math.radians(LAT)
        data=(-2500 + .006*xx+.007*yy + 140*np.exp(-((xx+1700)**2+(yy-1800)**2)/(2*330**2))
              +165*np.exp(-((xx-2600)**2+(yy+1000)**2)/(2*430**2))
              +110*np.exp(-((xx+3600)**2+(yy+1900)**2)/(2*350**2))).astype('float32')
        data[3:13,4:15]=-32768
        with rasterio.open(tif,'w',driver='GTiff',width=w,height=h,count=1,dtype='float32',transform=transform,
                 crs=f'+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +a={R} +b={R} +units=m +no_defs +type=crs',nodata=-32768) as ds:
            ds.write(data,1)
        subprocess.run([sys.executable,str(ROOT/'prepare_jezero_dem.py'),'--input',str(tif),'--output',str(out),'--step','40'],check=True)
        o=json.loads(out.read_text())
        assert o['schema']=='jezero-dem-grid-v1'
        assert o['width']==243 and o['height']==176, (o['width'],o['height'])
        assert o['source']['original_sha256'] and o['source']['planetocentric']
        r=o['heights']
        # Rover coordinate and synthetic terrain is close to analytic ground truth; no Earth WGS84 mismatch.
        ri=round((3500-(-820))/(7000)*(o['height']-1));ci=round((-1400+4850)/9700*(o['width']-1))
        v=r[ri*o['width']+ci]
        expected=-2500+.006*(-1400)+.007*(-820)
        assert abs(v-expected)<3,(v,expected)
        assert sum(z is None for z in r)==0 # nodata fixture outside the requested window
        # DOM test data at a fixture path; never auto load in shipped demo.
        fixture=ROOT/'tests'/'synthetic_test_grid.json'
        fixture.write_text(json.dumps(o,separators=(',',':')))
        print('Converter PASS. Test-only fixture:',fixture)
if __name__=='__main__':main()
