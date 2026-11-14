"""Package only runtime assets, documentation and final artifacts; no raw TIFF or virtualenv."""
from pathlib import Path
import zipfile,hashlib,json
root=Path(__file__).resolve().parents[1]
files=[root/name for name in ['index.html','styles.css','app.css','app.js','map-tools.js','named-places.js','regional-mission.js','planet.js','core.js','skyline.js','skyline-worker.js','server.js','start-demo.cmd','slides.html','README.md','package.json','requirements.txt','prepare_jezero_dem.py','test_core.js','test_dem.js']]
for directory in ['vendor','docs','scripts','tests','deliverables/slides']:
 files.extend(p for p in (root/directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
files.extend(root/'data'/name for name in ['jezero_dem.json','geology.json','geology-service.json','geology-raw.json','ctx.png','ctx-source.json','mission.json','localization-thresholds.json','mars-names.json','mars-names.kmz','mars-global.jpg','mars-global-source.json','mola-wmts.xml','mola16.bin','mola16.json','mola16.lbl','mars-global-dem.jpg'])
files.extend(root/'artifacts'/name for name in ['demo.webm','desktop.png','occluded.png','mobile.png','evaluation.json','browser-results.json','data-validation.json','map-interactions.json','custom-route.png','mars-overview.png','global-region.png','global-region-results.json'])
files.append(root/'deliverables/Martian-Navigator.pptx')
missing=[str(p) for p in files if not p.exists()]
if missing:raise RuntimeError(missing)
manifest={str(p.relative_to(root)).replace('\\','/'):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in files}
(root/'deliverables/manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
target=root/'deliverables/Martian-Navigator-offline.zip'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
 for p in files:z.write(p,p.relative_to(root))
 z.write(root/'deliverables/manifest.json','deliverables/manifest.json')
with zipfile.ZipFile(target) as z:assert z.testzip() is None
print(target,round(target.stat().st_size/1024/1024,2),'MiB',len(files),'files')
