import numpy as np, sys
from PIL import Image, ImageFilter, ImageDraw
from skimage.transform import PiecewiseAffineTransform, warp
from lm import landmarks
import mediapipe as mp
OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
photo, out = sys.argv[1], sys.argv[2]
Lm, model = landmarks('model-front.png')
Lp, prgb = landmarks(photo)
assert Lm is not None and Lp is not None
# фото с прозрачностью: берём RGBA
pim = np.array(Image.open(photo).convert('RGBA')).astype(float)/255
t = PiecewiseAffineTransform(); t.estimate(Lm, Lp)
W = model.shape[0]
wp = warp(pim, t, output_shape=(W, W), order=1, mode='constant', cval=0)
# маска: овал лица модели, мягкий край
m = Image.new('L', (W, W), 0); ImageDraw.Draw(m).polygon([tuple(Lm[i]) for i in OVAL], fill=255)
m = m.filter(ImageFilter.GaussianBlur(W*0.02))
mask = np.array(m).astype(float)/255 * wp[...,3]
res = np.dstack([wp[...,:3], mask])
img = Image.fromarray((res*255).astype(np.uint8), 'RGBA').resize((512,512), Image.LANCZOS)
img.save(out, quality=90)
# превью: поверх снимка модели
prev = Image.fromarray(model).convert('RGBA'); prev.alpha_composite(Image.fromarray((res*255).astype(np.uint8),'RGBA')); prev.convert('RGB').save('preview-'+out.split('/')[-1].replace('.webp','.png'))
# цвет щёк для кожи
ch = [Lp[i] for i in (50, 280)]; c = np.mean([np.array(Image.open(photo).convert('RGB'))[int(y)-4:int(y)+4, int(x)-4:int(x)+4].reshape(-1,3).mean(0) for x,y in ch],0)
print('cheek', '%02x%02x%02x' % tuple(int(v) for v in c))
