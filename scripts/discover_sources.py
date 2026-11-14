import urllib.request
import concurrent.futures
urls=[
'https://asc-pds-services.s3.us-west-2.amazonaws.com/?list-type=2&prefix=mosaic/&delimiter=/',
'https://asc-pds-services.s3.us-west-2.amazonaws.com/?list-type=2&prefix=PDS_Derived/&delimiter=/',
'https://pubs.usgs.gov/sim/3464/sim3464_database.zip',
'https://planetarymaps.usgs.gov/gis/maps/mars_jezero_sim3464.zip',
'https://tiles.arcgis.com/tiles/v01gqwM5QqNysAAi/arcgis/rest/services?f=pjson',
]
def check(u):
 try:
  r=urllib.request.urlopen(u,timeout=25)
  print(u,r.status,r.headers.get('Content-Length'))
  if 'list-type' in u or 'pjson' in u: print(r.read(50000).decode())
 except Exception as e: print(u,str(e))
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor() as pool:list(pool.map(check,urls))
