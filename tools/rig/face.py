# Фото → текстура лица и стрижки для общей модели.
# Соответствия: 478 точек лица (MediaPipe) + контур головы выше бровей (по прозрачности фото и снимка модели).
import numpy as np, sys
from PIL import Image, ImageFilter, ImageDraw
from skimage.transform import PiecewiseAffineTransform, warp
from lm import landmarks
OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
BROW=[70,63,105,66,107,336,296,334,293,300]
def head_contour(alpha, L, n=6):
  # выше линии бровей: края головы на нескольких высотах + макушка (доли между бровями и макушкой)
  yb = L[BROW][:,1].mean(); cols = np.where(alpha.max(0) > 128)[0]
  ys = np.where(alpha[:, :].max(1) > 128)[0]; top = ys.min()
  pts = [[(L[BROW][:,0].mean()), top]]
  for t in np.linspace(0.0, 0.92, n):
    y = int(yb + (top - yb) * t); row = np.where(alpha[y] > 128)[0]
    if len(row): pts += [[row.min(), y], [row.max(), y]]
  return np.array(pts, float), yb, top
photo, out = sys.argv[1], sys.argv[2]
Lm, _ = landmarks('model-front.png'); Lp, _ = landmarks(photo)
ma = np.array(Image.open('model-front.png').convert('RGBA'))[..., 3]
pa = np.array(Image.open(photo).convert('RGBA'))[..., 3]
Cm, ybm, tm = head_contour(ma, Lm); Cp, ybp, tp = head_contour(pa, Lp)
assert len(Cm) == len(Cp), (len(Cm), len(Cp))
Sm = np.vstack([Lm, Cm]); Sp = np.vstack([Lp, Cp])
pim = np.array(Image.open(photo).convert('RGBA')).astype(float) / 255
t = PiecewiseAffineTransform(); t.estimate(Sm, Sp)
W = ma.shape[0]
wp = warp(pim, t, output_shape=(W, W), order=3, mode='constant', cval=0)
# маска: овал лица ∪ голова выше бровей (силуэт модели), мягкий край, только где фото есть
m = Image.new('L', (W, W), 0); d = ImageDraw.Draw(m)
d.polygon([tuple(Lm[i]) for i in OVAL], fill=255)
hm = Image.fromarray(((ma > 128) * 255).astype(np.uint8)); hm = Image.fromarray((np.array(hm) * (np.arange(W)[:, None] < ybm + 0.02 * W)).astype(np.uint8))
m = Image.fromarray(np.maximum(np.array(m), np.array(hm))).filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(W * 0.012))
mask = np.array(m).astype(float) / 255 * np.clip(wp[..., 3] * 1.2, 0, 1)
rgb = Image.fromarray((wp[..., :3] * 255).astype(np.uint8)).filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
res = np.dstack([np.array(rgb), (mask * 255).astype(np.uint8)])
Image.fromarray(res, 'RGBA').save(out, quality=92)
prev = Image.open('model-front.png').convert('RGBA'); prev.alpha_composite(Image.fromarray(res, 'RGBA'))
bg = Image.new('RGBA', prev.size, (40, 30, 70, 255)); bg.alpha_composite(prev); bg.convert('RGB').save('preview2.png')
ch = [Lp[i] for i in (50, 280)]; c = np.mean([np.array(Image.open(photo).convert('RGB'))[int(y)-4:int(y)+4, int(x)-4:int(x)+4].reshape(-1, 3).mean(0) for x, y in ch], 0)
print('cheek', '%02x%02x%02x' % tuple(int(v) for v in c))
