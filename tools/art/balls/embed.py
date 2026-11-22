# Встраивает мячи пользователя (640×640, мяч r≈241 в центре, свечение вокруг) в прежний кадр паков img/packs/pk{lv}-{360,160}.webp:
# кадр 223×360, центр мяча (111.5, 210), радиус 102 — как у старых, чтобы все места игры, где мяч обрезается под квадрат, остались верными.
import sys, math
from PIL import Image, ImageChops
src, out = sys.argv[1], sys.argv[2]
names = ['ball_01_common', 'ball_02_rare', 'ball_03_epic', 'ball_04_legendary', 'ball_05_mythic']
for lv, n in enumerate(names):
    im = Image.open(f'{src}/{n}.png').convert('RGBA')
    # мягко гасим свечение к краю кадра по ширине (иначе обрежется ровной линией)
    W = 640; m = Image.new('L', (W, W)); px = m.load(); c = (W - 1) / 2
    for y in range(W):
        for x in range(W):
            r = math.hypot(x - c, y - c); t = (r - 245) / (262 - 245)
            px[x, y] = 255 if t <= 0 else 0 if t >= 1 else int(255 * (1 - t * t * (3 - 2 * t)))
    im.putalpha(ImageChops.multiply(im.split()[3], m))
    for H in (360, 160):
        k = H / 360; Wf = round(223 * k); s = 102 * k / 241
        b = im.resize((round(640 * s), round(640 * s)), Image.LANCZOS)
        fr = Image.new('RGBA', (Wf, H), (0, 0, 0, 0))
        fr.alpha_composite(b, (round(111.5 * k - b.width / 2), round(210 * k - b.height / 2)))
        fr.save(f'{out}/pk{lv}-{H}.webp', quality=92, method=6)
    print(lv, 'ok')
