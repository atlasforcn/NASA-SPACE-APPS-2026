from pathlib import Path
import os,functools,http.server,threading,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH',str(ROOT/'.cache/playwright'))
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')
  page=browser.new_page(viewport={'width':1600,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/*',lambda r:r.continue_() if r.request.url.startswith('http://127.0.0.1:') else r.abort())
  page.goto(f'http://127.0.0.1:{server.server_port}');page.wait_for_function('window.demoReady===true')
  page.click('#expedition-plan');assert page.evaluate('threeForks.legs.length===3 && threeForks.legs.every(l=>l.reachable)')
  a=page.evaluate('threeForks.lastProfile');page.uncheck('#optical');page.select_option('#expedition-leg','1');page.select_option('#expedition-leg','0');assert a==page.evaluate('threeForks.lastProfile')
  page.click('#malay-card');popup=page.locator('.leaflet-popup-content').inner_text();assert all(s in popup for s in ['M2020-00337-08','653','18.45262651','77.40775601','SOL-0653M13:38:22.157'])
  page.evaluate('app.map.closePopup()');page.click('#checkpoint-clear');page.click('#scan');page.wait_for_function('app.result!==null',timeout=60000)
  good=page.evaluate('({status:app.result.status,error:C.distance(app.truth,app.estimate)})');print('clear',good);assert good['status']=='good' and good['error']<100
  assert 'fix' in page.locator('#checkpoint-decision').inner_text()
  page.screenshot(path=str(ROOT/'artifacts/three-forks-clear.png'))
  page.click('#checkpoint-poor');before=page.evaluate('({...app.estimate})');page.click('#scan');page.wait_for_function('app.result!==null',timeout=60000);assert page.evaluate('app.result.status')!='good';assert before==page.evaluate('({...app.estimate})')
  page.screenshot(path=str(ROOT/'artifacts/three-forks-poor.png'));assert not errors,errors
  page.click('#reset');assert page.evaluate('app.checkpointBounds===null')
  page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  print('Three Forks route, offline PDS card, DEM profile, clear fix, refusal, reset and mobile passed')
  browser.close()
finally:server.shutdown()
