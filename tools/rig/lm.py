import mediapipe as mp, numpy as np, sys
from PIL import Image, ImageDraw
def landmarks(path):
  im=Image.open(path).convert('RGBA'); bg=Image.new('RGBA',im.size,(255,255,255,255)); bg.alpha_composite(im); rgb=np.array(bg.convert('RGB'))
  with mp.solutions.face_mesh.FaceMesh(static_image_mode=True,max_num_faces=1,refine_landmarks=True,min_detection_confidence=0.3) as fm:
    r=fm.process(rgb)
  if not r.multi_face_landmarks: return None, rgb
  h,w=rgb.shape[:2]; return np.array([[p.x*w,p.y*h] for p in r.multi_face_landmarks[0].landmark]), rgb
if __name__=='__main__':
  for f in sys.argv[1:]:
    L,rgb=landmarks(f); print(f, None if L is None else L.shape)
    if L is not None:
      im=Image.fromarray(rgb); d=ImageDraw.Draw(im)
      for x,y in L: d.ellipse((x-1,y-1,x+1,y+1),fill=(255,0,0))
      im.save(f.split('/')[-1].split('.')[0]+'-lm.png')
