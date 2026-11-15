"""Rebuild the candidate catalogue using the ASU HTML and PDS CSV (see docs/PHOTO-VALIDATION.md)."""
import csv
import json
import re
import sys
from pathlib import Path

catalogue = Path(sys.argv[1]).read_text()
with open(sys.argv[2], newline='') as stream:
    records = sorted((r for r in csv.DictReader(stream) if r['frame'] == 'ROVER'), key=lambda r: int(r['sclk']))
places = 'https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_rover_places/data_localizations/best_interp.csv'
entries = []
single = 'ZL0_0114_0677061671_832ECM_N0041062ZCAM08094_0630LMJ'
for sequence, station, sols, split in [('01','Butler Landing',[3,11],'development'),
                                      ('03','Van Zyl',[53,63],'development'),
                                      ('05','Horizon 2',[114,114],'holdout'),
                                      (None,'Horizon 2',[114,114],'holdout')]:
    if sequence:
        section = catalogue.split(sequence+'.02)',1)[1].split('</p>',1)[0]
        url = re.search(r'href="([^"]+\.png)"',section).group(1)
        product = url.rsplit('/',1)[1]
    else:
        product = single
        url = 'https://mars.nasa.gov/mars2020/multimedia/raw-images/'+single
    # No pose changes within these acquisition intervals. Keep bracketing
    # records rather than claiming a particular exposure time for a mosaic.
    before = max((r for r in records if int(r['sol']) <= sols[0]),key=lambda r:int(r['sclk']))
    after = next(r for r in records if int(r['sclk']) > int(before['sclk']))
    keys = ['sol','site','drive','sclk','planetocentric_latitude','longitude']
    entries.append(dict(product=product,url=url,station=station,sols=sols,split=split,
        kind='panorama' if sequence else 'single-frame',projection='cylindrical' if sequence else None,
        cropFovDegrees=360 if sequence else None,placesSource=places,
        placesBracket=[{k:r[k] for k in keys} for r in [before,after]],
        exactSiteDrive=None if sequence else [4,1062],positionUncertaintyMeters=None,
        cameraHeightMeters=None,cameraAttitude=None,reviewedSkyline=None,mask=None,
        status='excluded',result=None,reason='缺少經複核的相機幾何、輪廓、遮罩及逐方位 DEM 覆蓋。'))
print(json.dumps(entries,indent=2,ensure_ascii=False))
