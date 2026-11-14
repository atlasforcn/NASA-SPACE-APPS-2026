from pathlib import Path
import os,functools,http.server,threading,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH',str(ROOT/'.cache/playwright'))
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=os.environ.get('BROWSER_EXECUTABLE',r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'))
  page=browser.new_page(viewport={'width':1600,'height':1000});errors=[];external=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   if r.request.url.startswith('http://127.0.0.1:'):r.continue_()
   else:external.append(r.request.url);r.abort()
  page.route('**/*',route);page.goto(f'http://127.0.0.1:{server.server_port}');page.wait_for_function('window.demoReady && namedPlaces.ready')
  rows=[]
  for lat,lng in [(18.6528,-133.8025),(0,179.9),(90,0),(-90,170)]:
   page.fill('#region-lat',str(lat));page.fill('#region-lng',str(lng));page.click('#region-start');page.wait_for_function('app.regional && !document.getElementById("region-start").disabled',timeout=60000)
   assert page.evaluate('app.dem.origin.lat')==lat and page.evaluate('app.dem.origin.lng')==lng
   assert page.evaluate('app.map.hasLayer(app.estimatedMarker)');assert page.evaluate('app.dem.schema')=='mars-region-grid-v1';assert page.locator('#optical').is_disabled();assert page.evaluate('app.dem.heights.every(Number.isFinite)')
   page.select_option('#analysis-layer','terrain');page.select_option('#analysis-layer','slope');page.select_option('#analysis-layer','geology');assert '尚無' in page.locator('#layer-legend').inner_text();page.select_option('#analysis-layer','none')
   rows.append(page.evaluate('({origin:app.dem.origin,elevation:MarsCore.elevation(0,0),targets:app.targets.length})'))
   if lat==18.6528:
    page.click('#draw-points')
    for point in [{'x':8000,'y':8000},{'x':16000,'y':8000}]:
     q=page.evaluate('p=>{const v=app.map.latLngToContainerPoint(ll(p)),b=app.map.getContainer().getBoundingClientRect();return {x:b.left+v.x,y:b.top+v.y}}',point);page.mouse.click(q['x'],q['y'])
    page.click('#route-finish');assert page.evaluate('app.route.custom && app.route.reachable')
    page.click('#plan');assert page.evaluate('app.route.reachable');page.click('#simulate');page.wait_for_function('!app.running',timeout=15000)
    page.click('#reset');page.click('#scan');page.wait_for_function('app.result!==null',timeout=60000);assert page.evaluate('app.result.status')!='good';assert '未校準' in page.locator('#match-msg').inner_text()
    page.locator('#region-start').scroll_into_view_if_needed();page.screenshot(path=str(ROOT/'artifacts/global-region.png'),full_page=True)
  page.click('#restore-jezero');assert page.evaluate('!app.regional && MarsCore.LAT0===18.44 && app.dem.schema==="jezero-dem-grid-v1"');assert not page.locator('#optical').is_disabled();page.click('#scan');page.wait_for_function('app.result!==null',timeout=60000);assert page.evaluate('app.result.status')=='good'
  page.fill('#region-lat','91');page.click('#region-start');assert '緯度須' in page.locator('#region-status').inner_text();assert not page.evaluate('app.regional')
  page.fill('#named-search','Olympus Mons');page.locator('#named-list button').click();page.locator('.leaflet-popup-content [data-region-lat]').click();page.wait_for_function('app.regional && !document.getElementById("region-start").disabled');assert abs(page.evaluate('app.dem.origin.lat')-18.6528)<.001;page.click('#restore-jezero')
  assert not errors,errors;assert not external,external;browser.close()
  (ROOT/'artifacts/global-region-results.json').write_text(json.dumps({'regions':rows,'offline':'passed','globalLocalization':'experimental candidates; never auto-applied','jezeroRestore':'passed','invalidInput':'passed','pageErrors':errors,'externalRequests':external},indent=2),encoding='utf-8');print('Global regions, dateline, both poles, terrain, route, localization and restore passed')
finally:server.shutdown()
