import csv,json,xml.etree.ElementTree as ET
from pathlib import Path
base='https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_sample_depot_three_forks/'
files={'locations':'miscellaneous/sample_metadata/sample_tube_locations','events':'data/sample_drop_events/sample_drop_timestamps'}
versions={k:ET.parse('data/pds/'+v.split('/')[-1]+'.xml').findtext('.//{*}version_id') for k,v in files.items()}
events={r['Sample Designation']:r for r in csv.DictReader(open('data/pds/sample_drop_timestamps.csv'))}
features=[]
for r in csv.DictReader(open('data/pds/sample_tube_locations.csv')):
 e=events[r['Sample Designation']]
 features.append({'type':'Feature','geometry':{'type':'Point','coordinates':[float(r['Rover Longitude']),float(r['Rover Latitude'])]},'properties':{**r,'LMST':e['MARS_SURFACE Timestamp (LMST)'],'name':r['Sample Name']+' 投放時的車體位置','positionMeaning':'Rover position at dropoff; not either endpoint of the sample tube.','sources':{k:base+v+'.csv' for k,v in files.items()},'versions':versions}})
Path('data/three-forks.geojson').write_text(json.dumps({'type':'FeatureCollection','coordinateSystem':'Mars planetocentric latitude / east longitude degrees; coordinates [longitude, latitude]. Not Earth WGS84.','features':features},ensure_ascii=False,indent=2),encoding='utf-8')
