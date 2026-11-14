"""Fetch official GIS/CTX and build a fully local display package. Run from repo root."""
from pathlib import Path
import sys, json, math, hashlib, urllib.request, urllib.parse
import concurrent.futures
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from prepare_jezero_dem import geo_to_dataset, R, LAT0, LON0, XMIN, XMAX, YMIN, YMAX
import numpy as np
import rasterio
from pyproj import CRS, Transformer
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'
SERVICE='https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Jezero_FeatureServiceFromPro/FeatureServer/8'
S3='https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/'
def fetch(url,path):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
 if not path.exists():
  tmp=path.with_suffix(path.suffix+'.part')
  with urllib.request.urlopen(url,timeout=120) as r,tmp.open('wb') as f:
   while chunk:=r.read(1024*1024):f.write(chunk)
  tmp.replace(path)
 return path
def read_json(url):
 with urllib.request.urlopen(url,timeout=120) as r:return json.load(r)
def save(path,data):path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
def sha(path):return hashlib.file_digest(path.open('rb'),'sha256').hexdigest()
def geology():
 meta=read_json(SERVICE+'?f=json');save(DATA/'geology-service.json',meta)
 native=CRS.from_wkt(meta['extent']['spatialReference']['wkt']);forward=Transformer.from_crs(native.geodetic_crs,native,always_xy=True);inverse=Transformer.from_crs(native,native.geodetic_crs,always_xy=True)
 corners=[forward.transform(LON0+math.degrees(x/(R*math.cos(math.radians(LAT0)))),LAT0+math.degrees(y/R)) for x in [XMIN,XMAX] for y in [YMIN,YMAX]]
 params={'f':'json','where':'1=1','outFields':'*','geometry':','.join(map(str,[min(p[0] for p in corners),min(p[1] for p in corners),max(p[0] for p in corners),max(p[1] for p in corners)])),'geometryType':'esriGeometryEnvelope','spatialRel':'esriSpatialRelIntersects','returnGeometry':'true','resultRecordCount':2000}
 url=SERVICE+'/query?'+urllib.parse.urlencode(params);raw=read_json(url)
 if raw.get('error') or raw.get('exceededTransferLimit'):raise RuntimeError(raw)
 save(DATA/'geology-raw.json',raw)
 features=[]
 for f in raw['features']:
  rings=[]
  for ring in f['geometry']['rings']:
   lon,lat=inverse.transform(*zip(*ring));rings.append([[round(math.radians(lo-LON0)*R*math.cos(math.radians(LAT0)),3),round(math.radians(la-LAT0)*R,3)] for lo,la in zip(lon,lat)])
  features.append({'properties':f['attributes'],'rings':rings})
 payload={'schema':'jezero-geology-local-v1','source':SERVICE,'citation':'Sun, V.Z. and Stack, K.M. (2020), USGS SIM 3464, 1:75,000','crs':'MARS_EQ_LOCAL_TANGENT','source_crs_wkt':native.to_wkt(),'query_url':url,'raw_sha256':sha(DATA/'geology-raw.json'),'fields':meta['fields'],'renderer':meta['drawingInfo']['renderer'],'features':features}
 save(DATA/'geology.json',payload)
 print('geology polygons:',len(features),'fields:',[f['name'] for f in meta['fields']])
def optical():
 url=S3+'M20_JezeroCrater_CTXortho_mosaic_5m.tif';path=fetch(url,DATA/'M20_JezeroCrater_CTXortho_mosaic_5m.tif')
 w,h=1200,866;x=np.linspace(XMIN,XMAX,w);y=np.linspace(YMAX,YMIN,h);X,Y=np.meshgrid(x,y);lon=LON0+np.rad2deg(X/(R*math.cos(math.radians(LAT0))));lat=LAT0+np.rad2deg(Y/R)
 with rasterio.open(path) as ds:
  dx,dy=geo_to_dataset(ds.crs,lon,lat);aff=~ds.transform;col=np.floor(aff.a*dx+aff.b*dy+aff.c).astype(int);row=np.floor(aff.d*dx+aff.e*dy+aff.f).astype(int)
  inside=(col>=0)&(col<ds.width)&(row>=0)&(row<ds.height);a=ds.read(1,masked=True);image=np.zeros((h,w),dtype='float32');image[inside]=a.filled(0)[row[inside],col[inside]];valid=inside.copy();valid[inside]&=~np.ma.getmaskarray(a)[row[inside],col[inside]]
  low,high=np.percentile(image[valid],[1,99]);gray=np.uint8(np.clip((image-low)/(high-low)*255,0,255));rgba=np.dstack([gray,gray,gray,valid.astype('uint8')*255]);Image.fromarray(rgba).save(DATA/'ctx.png')
  save(DATA/'ctx-source.json',{'url':url,'original_sha256':sha(path),'source_crs_wkt':ds.crs.to_wkt(),'native_pixel_size_m':list(ds.res),'display_size':[w,h],'display_step_m':[(XMAX-XMIN)/(w-1),(YMAX-YMIN)/(h-1)],'bounds':[XMIN,YMIN,XMAX,YMAX],'valid_fraction':float(valid.mean()),'contrast_percentiles':[1,99],'sampling':'nearest pixel, display only; not elevation'})
 print('CTX optical crop ready')
def vendor():
 for name in ['leaflet.js','leaflet.css','images/marker-icon.png','images/marker-icon-2x.png','images/marker-shadow.png','images/layers.png','images/layers-2x.png']:
  fetch('https://unpkg.com/leaflet@1.9.4/dist/'+name,ROOT/'vendor'/name)
 fetch('https://unpkg.com/leaflet@1.9.4/LICENSE',ROOT/'vendor'/'Leaflet-LICENSE.txt')
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  for f in [pool.submit(geology),pool.submit(optical),pool.submit(vendor)]:f.result()
