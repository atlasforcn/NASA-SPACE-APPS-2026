"""Download real JMARS numerical rasters and PDS station observations.
Run from repo root. Uses the same .build/python dependencies as prepare-gale.py.
No Earth CRS conversion; WMS JMARS:4 is checked against the existing Mars MOLA.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path('.build/python').resolve()))
import concurrent.futures, csv, hashlib, io, json, math, re
import requests
import numpy as np
from PIL import Image
import xml.etree.ElementTree as ET

OUT = Path('data/science')
CACHE = Path('.cache/science')
OUT.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)

def download(url, name):
    path = CACHE / name
    if not path.exists():
        r = requests.get(url, timeout=90)
        r.raise_for_status()
        if b'ServiceException' in r.content[:500]:
            raise ValueError(r.text)
        path.write_bytes(r.content)
    return path.read_bytes()

def vicar(layer, width, height):
    # This service's legacy parser needs literal '/', ':' and ',' in the query.
    url = f'https://ms-mars.mars.asu.edu/{layer}?SERVICE=WMS&REQUEST=GetMap&FORMAT=image/vicar&WIDTH={width}&HEIGHT={height}&SRS=JMARS:4&BBOX=0,-90,360,90&STYLES=&VERSION=1.1.1&LAYERS={layer}'
    raw = download(url, f'{layer}-{width}.vic')
    header_size = int(re.search(rb'LBLSIZE=\s*(\d+)', raw[:100])[1])
    header = raw[:header_size].decode('ascii')
    def field(key): return re.search(rf'\b{key}=\s*(\S+)', header)[1].strip("'")
    assert int(field('NS')) == width and int(field('NL')) == height
    assert field('NB') == '1' and field('ORG') == 'BSQ'
    dtype = {'REAL': '<f4' if field('REALFMT') == 'RIEEE' else '>f4',
             'HALF': '<i2' if field('INTFMT') == 'LOW' else '>i2',
             'FULL': '<i4' if field('INTFMT') == 'LOW' else '>i4',
             'DOUB': '<f8' if field('REALFMT') == 'RIEEE' else '>f8'}[field('FORMAT')]
    expected=header_size + width*height*np.dtype(dtype).itemsize
    if len(raw) != expected:
        raise ValueError(f'Truncated VICAR {layer}: expected {expected} bytes, got {len(raw)}')
    a = np.frombuffer(raw, dtype=dtype, offset=header_size).reshape(height, width).astype('<f4')
    return a, {'url': url, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'vicar_header': header.strip()}

def check_coordinates():
    a, _ = vicar('MOLA_128ppd_topo', 720, 360)
    row, col = np.unravel_index(np.argmax(a), a.shape)
    assert 215 < (col+.5)/2 < 235 and 10 < 90-(row+.5)/2 < 25, 'WMS longitude/latitude orientation mismatch at Olympus Mons'
    # Independently compare the downloaded map to the already-verified PDS MOLA16.
    local = np.fromfile('data/mola16.bin', dtype='<i2').reshape(2880, 5760)
    errors = []
    for lat, lon in [(lat+.25,lon+.25) for lat in range(-60,61,15) for lon in range(0,360,30)]:
        val = a[int((90-lat)*2), int(lon*2)]
        ref = local[int((90-lat)*16), int(lon*16)]
        errors.append(abs(float(val)-float(ref)))
    assert np.mean(errors) < 600 and np.median(errors) < 300, errors
    print('Mars axis check passed; mean/median MOLA differences (coarse samples):',float(np.mean(errors)),float(np.median(errors)), flush=True)

PALETTE = np.array([[35,70,150],[42,180,180],[235,220,100],[210,65,50]], dtype=float)
SPECS = [
    ('thermal','TES_Thermal_Inertia_numeric',2880,1440,[0,1000], 'J m⁻² K⁻¹ s⁻½', [0,5000],8),
    ('spectral','TES_Olivine_numeric',1440,720,[0,0.25], 'abundance', [0,1],4),
    ('geophysical','grav_ggmro_120_anom_100',720,360,[-500,500], 'mGal', [-5000,5000],16),
    ('chemical','GRS_Fe_conc_numeric',72,36,[10,20], 'wt % Fe', [0.01,100],0.2),
]

def build_raster(spec):
    key, layer, w, h, scale, unit, valid_range, native_ppd = spec
    a, source = vicar(layer,w,h)
    # Rotate 0..360 E to -180..180 E; preserve pixel-centre registration.
    a = np.roll(a, w//2, axis=1)
    valid = np.isfinite(a) & (a >= valid_range[0]) & (a <= valid_range[1])
    a[~valid] = np.nan
    assert np.any(valid), key
    a.astype('<f4').tofile(OUT / f'{key}.bin')
    t = np.clip((np.nan_to_num(a,nan=scale[0])-scale[0])/(scale[1]-scale[0]),0,1)*3
    low = np.minimum(t.astype(int),2); f = t-low
    rgb = (PALETTE[low]*(1-f[...,None])+PALETTE[low+1]*f[...,None]).astype('uint8')
    Image.fromarray(np.dstack([rgb,np.where(valid,255,0).astype('uint8')])).save(OUT/f'{key}.png')
    cap = ET.parse(CACHE/'capabilities.xml').getroot()
    meta = next(l for l in cap.findall('.//Layer') if l.findtext('Name') == layer)
    result = dict(id=key, kind='raster', layer=layer, width=w, height=h, bounds=[-180,-90,180,90],
        crs='Mars planetocentric, positive-East; simple cylindrical', dtype='float32 little-endian',
        pixel_registration='area; centres: lon=-180+(col+0.5)*360/width, lat=90-(row+0.5)*180/height',
        native_ppd=native_ppd, display_ppd=w/360, unit=unit, scale=scale,
        valid_range=valid_range, nodata='NaN; transparent', valid_fraction=float(valid.mean()),
        min=float(a[valid].min()), max=float(a[valid].max()), source=source,
        title=meta.findtext('Title'), citation=meta.findtext('Abstract'),
        keywords=[x.text for x in meta.findall('./KeywordList/Keyword')],
        processing='WMS numerical VICAR; rotate longitude columns; source null/invalid values to NaN; nearest-cell display; fixed colour ramp, clipped at legend limits.',
        retrieved='2026-11-14')
    print(key,w,h,result['min'],result['max'],result['valid_fraction'],flush=True)
    return key,result

def pds_source(url,name):
    raw=download(url,name)
    rawdir=OUT/'raw';rawdir.mkdir(exist_ok=True)
    (rawdir/name).write_bytes(raw)
    return raw,dict(url=url,sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),local=f'data/science/raw/{name}')

def build_stations():
    base='https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/sol_0000_0089/sol_0001/'
    name='WE__0001___________DER_PS__________________P02'
    raw,source=pds_source(base+name+'.CSV',name+'.csv')
    label,label_source=pds_source(base+name+'.xml',name+'.xml')
    rows=list(csv.DictReader(io.StringIO(raw.decode('utf-8'))))
    values=[float(r['PRESSURE']) for r in rows if r['PRESSURE'] and math.isfinite(float(r['PRESSURE'])) and float(r['PRESSURE'])>0]
    ns={'p':'http://pds.nasa.gov/pds4/pds/v1'};root=ET.fromstring(label)
    fields=root.findall('.//p:Field_Delimited',ns)
    assert next(f.findtext('p:unit',namespaces=ns) for f in fields if f.findtext('p:name',namespaces=ns)=='PRESSURE')=='pascal'
    pressure=dict(id='atmospheric',kind='station',name='Perseverance MEDA · Sol 1',lat=18.4446,lng=77.4509,
        value=sum(values)/len(values),min=min(values),max=max(values),count=len(values),unit='Pa',
        start=root.findtext('.//p:start_date_time',namespaces=ns),stop=root.findtext('.//p:stop_date_time',namespaces=ns),
        source=source,label_source=label_source,
        coordinate_source='https://ntrs.nasa.gov/api/citations/20230016428/downloads/Bell%20et%20al%202022sciadv.pdf',
        note='Sol 1 observations at the historical landing coordinates. The value is the mean of valid samples in this file.')
    base='https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/DATA/SOL_00000_00089/'
    name='RAD_RDR_2012_220_02_25_0001_V00'
    raw,source=pds_source(base+name+'.TXT',name+'.txt')
    label,label_source=pds_source(base+name+'.LBL',name+'.lbl')
    # Use label byte pointers, not guessed text offsets. B is silicon absorbed dose.
    text=label.decode('ascii')
    pointers=re.findall(r'\^OBS\d+_TOT_DOSE_B_ELEMENT\s*=\s*\("[^"]+",\s*(\d+)\s*<BYTES>\)',text)
    assert pointers and 'microGray / Hour' in text
    values=[float(raw[int(p)-1:int(p)-1+7]) for p in pointers]
    values=[v for v in values if math.isfinite(v) and v>=0]
    assert values
    radiation=dict(id='radiation',kind='station',name='Curiosity RAD · Sol 1',lat=-4.5895,lng=137.4417,
        value=sum(values)/len(values),min=min(values),max=max(values),count=len(values),unit='µGy/h (Si)',
        start='2012-08-07T02:25:43Z',stop=None,source=source,label_source=label_source,
        coordinate_source='https://doi.org/10.1002/2014JE004622',
        note='Sol 1 observations near Bradbury Landing. The source uses zero as a latitude and longitude placeholder. The value is the mean valid absorbed dose rate in detector B, measured in silicon.')
    return {'atmospheric':pressure,'radiation':radiation}

if __name__=='__main__':
    if not (CACHE/'capabilities.xml').exists():
        download('https://ms-mars.mars.asu.edu/?SERVICE=WMS&REQUEST=GetCapabilities','capabilities.xml')
    check_coordinates()
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        datasets=dict(pool.map(build_raster,SPECS))
    datasets.update(build_stations())
    (OUT/'manifest.json').write_text(json.dumps(dict(schema='mars-science-v1',datasets=datasets),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Downloaded and prepared six science overlays.',flush=True)
