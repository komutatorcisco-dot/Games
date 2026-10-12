from pathlib import Path
import base64
import json
import sys

p=Path(__file__).resolve().parent
source=sys.argv[1] if len(sys.argv)>1 else 'index.html'
destination=sys.argv[2] if len(sys.argv)>2 else 'Show-Balotelli.html'
html=(p/source).read_text(encoding='utf-8')
library=(p/'model-viewer.min.js').read_text(encoding='utf-8').replace('</script',r'<\/script')
html=html.replace('<script type="module" src="./model-viewer.min.js"></script>', '<script type="module">'+library+'</script>')
html=html.replace('src="./balotelli-imported-motion.glb"','')
encoded=base64.b64encode((p/'balotelli-imported-motion.glb').read_bytes()).decode('ascii')
init='const bytes=Uint8Array.from(atob('+json.dumps(encoded)+'),c=>c.charCodeAt(0));v.src=URL.createObjectURL(new Blob([bytes],{type:"model/gltf-binary"}));'
html=html.replace('</body>', '<script>'+init.replace('v.src=',"document.querySelector('#viewer').src=")+'</script></body>') if source!='index.html' else html.replace('function tick(){',init+'\nfunction tick(){')
(p/destination).write_text(html,encoding='utf-8')
assert 'src="./' not in html
print('Standalone preview bytes:',(p/destination).stat().st_size)
