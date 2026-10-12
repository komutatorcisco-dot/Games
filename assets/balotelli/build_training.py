from pathlib import Path
import base64,json,re
p=Path(__file__).resolve().parent
def module(text):return 'data:text/javascript;base64,'+base64.b64encode(text.encode()).decode()
imports={
 'three':module((p/'three.module.js').read_text(encoding='utf-8')),
 'three-utils':module((p/'BufferGeometryUtils.js').read_text(encoding='utf-8')),
 'gltf-loader':module((p/'GLTFLoader.js').read_text(encoding='utf-8').replace('../utils/BufferGeometryUtils.js','three-utils')),
 'training-physics':module((p/'training-physics.mjs').read_text(encoding='utf-8'))}
html=(p/'training.html').read_text(encoding='utf-8')
html=html.replace('<!-- IMPORTMAP -->','<script type="importmap">'+json.dumps({'imports':imports})+'</script>')
html=html.replace('MODEL_BASE64',json.dumps(base64.b64encode((p/'balotelli-imported-motion.glb').read_bytes()).decode()))
(p/'Jackson-Training.html').write_text(html,encoding='utf-8')
code=re.search(r'<script type="module">([\s\S]*?)</script>',(p/'training.html').read_text(encoding='utf-8')).group(1)
(p/'training-syntax-check.mjs').write_text(code,encoding='utf-8')
print('Standalone training bytes:',(p/'Jackson-Training.html').stat().st_size)
