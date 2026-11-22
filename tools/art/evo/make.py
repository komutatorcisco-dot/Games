# Рамка «Эволюция» для прокачанных карточек (22.11): из золотой рамки img/cards2/{back,front}-gold.webp берётся рельеф (яркость),
# и он раскрашивается градиентом: графит → тёмно-зелёный → лайм → почти белый. Форма, соты и блики — те же, цвет — свой.
# Запуск: python3 tools/art/evo/make.py  →  img/cards2/{back,front}-evo.webp
from PIL import Image, ImageOps, ImageEnhance
def gmap(img, stops):
    a = img.split()[3]; g = ImageOps.grayscale(img.convert('RGB'))
    g = ImageOps.autocontrast(g, cutoff=1)
    lut = []
    for ch in range(3):
        for v in range(256):
            t = v / 255
            for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
                if t0 <= t <= t1:
                    k = (t - t0) / (t1 - t0 or 1); lut.append(round(c0[ch] + (c1[ch] - c0[ch]) * k)); break
    rgb = Image.merge('RGB', [g, g, g]).point(lut)
    out = rgb.convert('RGBA'); out.putalpha(a); return out
H = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
back = gmap(Image.open('img/cards2/back-gold.webp').convert('RGBA'),
            [(0, H('#020302')), (.5, H('#0a100b')), (.72, H('#152212')), (.88, H('#3f7a10')), (1, H('#d8ff6a'))])
front = gmap(Image.open('img/cards2/front-gold.webp').convert('RGBA'),
             [(0, H('#020403')), (.45, H('#0a1109')), (.7, H('#16260e')), (.88, H('#8fd61e')), (1, H('#f4ffc4'))])
back.save('img/cards2/back-evo.webp', quality=92, method=6); front.save('img/cards2/front-evo.webp', quality=92, method=6)
print('ok')
