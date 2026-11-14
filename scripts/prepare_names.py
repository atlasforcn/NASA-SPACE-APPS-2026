"""Official IAU/USGS Mars centre points, preserved as an offline searchable catalogue."""
from pathlib import Path
import urllib.request,zipfile,xml.etree.ElementTree as ET,json,hashlib
root=Path(__file__).resolve().parents[1];url='https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.kmz'
path=root/'data/mars-names.kmz'
if not path.exists():path.write_bytes(urllib.request.urlopen(url,timeout=90).read())
with zipfile.ZipFile(path) as z:
 r=ET.fromstring(z.read('MARS_nomenclature_center_pts.kml'));ns={'k':'http://www.opengis.net/kml/2.2'}
 entries=[]
 for p in r.findall('.//k:Placemark',ns):
  fields={e.attrib['name']:e.text for e in p.findall('.//k:SimpleData',ns)}
  if fields.get('approval')!='Adopted by IAU':continue
  entries.append({'name':p.findtext('k:name',namespaces=ns),'lat':float(fields['center_lat']),'lng':(float(fields['center_lon'])+180)%360-180,'eastLongitude':float(fields['center_lon']),'type':fields['type'],'code':fields['code'],'diameterKm':float(fields['diameter']),'approval':fields['approval'],'approvedAt':fields['approvaldt'].split(' ')[0],'origin':fields.get('origin'),'url':fields['link'].replace('http:','https:'),'bounds':{k:float(fields[k]) for k in ['min_lat','max_lat','min_lon','max_lon']}})
 curated={
 'Olympus Mons':('奧林帕斯山','大型火山地形；探索火山山體與山頂地形。'),
 'Valles Marineris':('水手號谷','大型峽谷系統；觀察斷崖與谷地地形。'),
 'Hellas Planitia':('希臘平原','大型撞擊盆地內的低地平原。'),
 'Gale':('蓋爾撞擊坑','好奇號探索的撞擊坑；可比較坑內山體與沉積地形。'),
 'Aeolis Mons':('伊奧利斯山（夏普山）','蓋爾撞擊坑內的層狀山體；NASA 任務亦稱 Mount Sharp。'),
 'Jezero':('傑澤羅撞擊坑','毅力號探索區域；包含古湖泊與三角洲地質線索。'),
 'Neretva Vallis':('內雷特瓦谷','Jezero 周邊的古河谷地形。'),
 'Nili Fossae':('尼利槽溝','Jezero 周邊區域的大型槽溝地形。'),
 'Elysium Mons':('埃律西昂山','火山山體，適合與其他火星火山比較。'),
 'Pavonis Mons':('帕沃尼斯山','塔爾西斯區域的火山山體。'),
 'Arsia Mons':('阿爾西亞山','塔爾西斯區域的火山山體。'),
 'Ascraeus Mons':('阿斯克雷山','塔爾西斯區域的火山山體。'),
 }
 for e in entries:
  if e['name'] in curated:e['zh'],e['description']=curated[e['name']];e['featured']=True
 payload={'source':url,'catalogue':'USGS Gazetteer of Planetary Nomenclature / IAU WGPSN','source_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'coordinateSystem':'Planetocentric, positive East; display longitude normalized to -180..180. Catalogue centres represent extended features, not traversable destinations.','contextSource':'https://science.nasa.gov/mars/facts/','entries':entries}
 (root/'data/mars-names.json').write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf-8');print(len(entries),'adopted IAU names;',sum(e.get('featured',False) for e in entries),'featured landscapes')
 print(json.dumps([e for e in entries if e.get('featured')],ensure_ascii=True)[:4000])
