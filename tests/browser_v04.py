"""Integration, offline test, screenshots and actual browser recording."""
from pathlib import Path
import os
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH',str(Path(__file__).resolve().parents[1]/'.cache'/'playwright'))
import functools,http.server,threading,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=os.environ.get('BROWSER_EXECUTABLE',r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'))
  context=browser.new_context(viewport={'width':1600,'height':1000},record_video_dir=str(ROOT/'artifacts'/'video'),record_video_size={'width':1600,'height':1000})
  page=context.new_page();errors=[];external=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def intercept(route):
   if not route.request.url.startswith('http://127.0.0.1:'):external.append(route.request.url);route.abort()
   else:route.continue_()
  page.route('**/*',intercept)
  page.goto(f'http://127.0.0.1:{server.server_port}/');page.wait_for_function('window.demoReady===true')
  assert page.locator('#destination option').count()==2
  for layer in ['geology','terrain','slope','none']:page.select_option('#analysis-layer',layer);page.wait_for_timeout(250)
  page.check('#evaluation');page.click('#plan');assert page.evaluate('app.route.reachable')
  page.click('#simulate');page.wait_for_timeout(700);page.click('#simulate');assert page.evaluate('app.travelled>0')
  page.click('#scenario-good');page.click('#scan');page.wait_for_function('app.result!==null',timeout=60000)
  good=page.evaluate('({status:app.result.status,error:MarsCore.distance(app.truth,app.estimate),candidates:app.result.candidates.length})');print('good:',good)
  assert good['status']=='good' and good['error']<=100 and good['candidates']==3
  page.screenshot(path=str(ROOT/'artifacts'/'desktop.png'),full_page=True)
  page.click('#plan');assert page.evaluate('app.route.reachable');page.click('#simulate');page.wait_for_function('!app.running',timeout=15000);assert page.evaluate('app.waypoint===app.route.path.length-1')
  page.click('#scenario-poor');before=page.evaluate('({...app.estimate})');page.click('#scan');page.wait_for_function('app.result!==null',timeout=60000)
  assert page.evaluate('app.result.status')!='good';assert page.evaluate('({...app.estimate})')==before
  page.screenshot(path=str(ROOT/'artifacts'/'occluded.png'),full_page=True)
  page.select_option('#observe-mode','good');assert page.evaluate('({...app.estimate})')==before;page.click('#scan');page.wait_for_function('app.result!==null',timeout=60000);assert page.evaluate('app.result.status')=='good'
  page.click('#scenario-good');page.click('#scan');page.click('#cancel');page.wait_for_timeout(1000);assert page.evaluate('app.result') is None
  page.click('#scan');page.click('#reset');page.wait_for_timeout(1000);assert page.evaluate('app.result') is None
  # Offline means all remote hosts blocked, local HTTP still permitted (as on a laptop without internet).
  page.reload();page.wait_for_function('window.demoReady===true');page.click('#scan');page.wait_for_function('app.result!==null',timeout=60000);assert page.evaluate('app.result.status')=='good'
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(ROOT/'artifacts'/'mobile.png'),full_page=True)
  assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
  assert not external,external;assert not errors,errors
  video=page.video;context.close();video.save_as(str(ROOT/'artifacts'/'demo.webm'));browser.close()
  (ROOT/'artifacts'/'browser-results.json').write_text(json.dumps({'good':good,'offline':'passed; external hosts blocked','externalRequests':external,'pageErrors':errors,'cancellation':'passed','resetDuringSearch':'passed','occluded':'refused; estimate unchanged'},indent=2),encoding='utf-8')
finally:server.shutdown()
