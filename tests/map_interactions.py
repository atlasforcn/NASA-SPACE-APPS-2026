from pathlib import Path
import os,functools,http.server,threading,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH',str(ROOT/'.cache/playwright'))
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=os.environ.get('BROWSER_EXECUTABLE',r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'))
  page=browser.new_page(viewport={'width':1600,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('https://**/*',lambda r:r.abort());page.goto(f'http://127.0.0.1:{server.server_port}');page.wait_for_function('window.demoReady')
  assert page.locator('#poi-list button').count()>=3
  page.locator('#poi-list button').filter(has_text='科學觀測站 A').click();assert '目前狀態' in page.locator('.leaflet-popup-content').inner_text();assert '模擬科學觀測站' in page.locator('.leaflet-popup-content').inner_text();page.locator('.leaflet-popup-close-button').click();page.wait_for_timeout(400)
  def click_local(x,y):
   q=page.evaluate('p=>{const v=app.map.latLngToContainerPoint(ll(p)),b=app.map.getContainer().getBoundingClientRect();return {x:b.left+v.x,y:b.top+v.y}}',{'x':x,'y':y});page.mouse.click(q['x'],q['y'])
  page.click('#draw-points');pose=page.evaluate('({...app.estimate})');click_local(pose['x']+250,pose['y']);click_local(pose['x']+450,pose['y']+30);page.click('#route-finish')
  assert page.evaluate('app.route.custom && app.route.reachable');assert not page.locator('#simulate').is_disabled();assert page.evaluate('app.route.path.length')==3
  page.click('#route-undo');assert page.locator('#simulate').is_disabled();page.click('#route-finish');assert page.evaluate('app.route.path.length')==2
  page.click('#route-clear');assert page.evaluate('app.route') is None
  page.click('#draw-points');click_local(0,3600);page.click('#route-finish');assert not page.evaluate('app.route.reachable');assert page.locator('#simulate').is_disabled();assert '紅色' in page.locator('#route-status').inner_text()
  page.click('#route-clear');page.click('#draw-freehand')
  q=page.evaluate('()=>{const b=app.map.getContainer().getBoundingClientRect(),v=app.map.latLngToContainerPoint(ll(app.estimate));return {x:b.left+v.x,y:b.top+v.y}}');page.mouse.move(q['x'],q['y']);page.mouse.down();page.mouse.move(q['x']+35,q['y']-10,steps=10);page.mouse.up();page.click('#route-finish');assert page.evaluate('app.route.custom && app.route.reachable');assert page.evaluate('app.map.dragging.enabled()')
  page.locator('#route-status').scroll_into_view_if_needed();page.screenshot(path=str(ROOT/'artifacts/custom-route.png'),full_page=True)
  page.click('#reset');assert page.evaluate('app.route') is None;assert page.evaluate('mapTools.points.length')==0
  page.wait_for_function('namedPlaces.ready');assert page.evaluate('namedPlaces.entries.length')==2055
  page.fill('#named-search','Olympus Mons');assert page.locator('#named-list button').count()==1;page.locator('#named-list button').click()
  assert 'IAU 正式地名' in page.locator('.leaflet-popup-content').inner_text();assert '超出目前任務' in page.locator('.leaflet-popup-content').inner_text();assert page.evaluate('app.map.getCenter().lng')<0
  page.click('#mars-overview');assert page.locator('#named-list button').count()==12;assert not page.evaluate('app.map.hasLayer(mapTools.poiMarkers.get("base"))');assert '火星地理導覽' in page.locator('#map-title').inner_text();page.screenshot(path=str(ROOT/'artifacts/mars-overview.png'),full_page=True)
  page.fill('#named-search','');page.select_option('#named-type','FO');assert page.locator('#named-list button').count()>0;page.select_option('#named-type','');page.click('#jezero-home');assert 'Jezero /' in page.locator('#map-title').inner_text()
  page.locator('#poi-list button').filter(has_text='Octavia').click();assert '非 IAU' in page.locator('.leaflet-popup-content').inner_text()
  assert page.evaluate('mapTools.poiMarkers.size')>=4
  assert not errors,errors;browser.close()
  (ROOT/'artifacts/map-interactions.json').write_text(json.dumps({'namedPoiPopup':'passed','waypoints':'passed','undo':'passed','outOfBoundsRefused':'passed','freehand':'passed','reset':'passed','officialCatalogueCount':2055,'officialNameSearch':'passed','globalOverviewAndReturn':'passed','typeFilter':'passed','missionVsIAULabels':'passed','pageErrors':errors},indent=2),encoding='utf-8')
  print('Named POI, point drawing, freehand, undo, invalid route and reset passed')
finally:server.shutdown()
