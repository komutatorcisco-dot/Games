# 10 значков серии «Забытые легенды»: один тип (шестиугольник + знак), разные стили.
# Запуск: python3 tools/fl-art/badges.py img/brand/fl-badges <путь к node_modules/@phosphor-icons/core/assets> (npm i @phosphor-icons/core@2.1.1)
# Знаки — из набора Phosphor Icons (MIT), чтобы линии были ровные.
import math, os, re, sys
OUT = sys.argv[1]; ICONS = sys.argv[2]
C = 256
def hx(r, cx=C, cy=C, rot=-90):
    return ' '.join(f'{cx+r*math.cos(math.radians(rot+60*i)):.2f},{cy+r*math.sin(math.radians(rot+60*i)):.2f}' for i in range(6))
def icon(name, weight='fill'):
    fn = f'{name}-{weight}.svg' if weight != 'regular' else f'{name}.svg'
    s = open(os.path.join(ICONS, weight, fn)).read()
    return re.search(r'<svg[^>]*>(.*)</svg>', s, re.S).group(1)
def glyph(name, size, fill, weight='fill', cx=C, cy=C, extra=''):
    k = size / 256
    return f'<g transform="translate({cx-size/2:.1f} {cy-size/2:.1f}) scale({k:.4f})" fill="{fill}" {extra}>{icon(name, weight)}</g>'
def save(n, defs, body, bg=None):
    open(os.path.join(OUT, n + '.svg'), 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>{defs}<clipPath id="h"><polygon points="{hx(200)}"/></clipPath></defs>{body}</svg>')

# 1. Чёрное золото: матовый чёрный, тонкая двойная золотая линия
save('01-black-gold',
 '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7e3a3"/><stop offset=".5" stop-color="#c99a3e"/><stop offset="1" stop-color="#8f6420"/></linearGradient>'
 '<radialGradient id="b" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#2a2a2e"/><stop offset="1" stop-color="#0b0b0d"/></radialGradient>',
 f'<polygon points="{hx(222)}" fill="url(#g)"/><polygon points="{hx(214)}" fill="url(#b)"/>'
 f'<polygon points="{hx(196)}" fill="none" stroke="url(#g)" stroke-width="3"/>'
 + glyph('shooting-star', 230, 'url(#g)'))

# 2. Эмалевый значок: серебряный кант, эмаль двух цветов, белый знак
save('02-enamel',
 '<linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#a9b0bb"/><stop offset="1" stop-color="#e7eaee"/></linearGradient>',
 f'<polygon points="{hx(224)}" fill="url(#s)"/><polygon points="{hx(200)}" fill="#1a2a6c"/>'
 f'<g clip-path="url(#h)"><rect x="0" y="300" width="512" height="212" fill="#c8102e"/><rect x="0" y="292" width="512" height="10" fill="url(#s)"/></g>'
 f'<polygon points="{hx(200)}" fill="none" stroke="#0c1440" stroke-opacity=".35" stroke-width="6"/>'
 + glyph('crown-simple', 200, '#0c1440', cy=212+4, cx=C+4) + glyph('crown-simple', 200, '#ffffff', cy=212)
 + '<rect x="196" y="350" width="120" height="10" rx="5" fill="#fff"/><rect x="226" y="372" width="60" height="10" rx="5" fill="#fff" opacity=".7"/>')

# 3. Неон: тёмный фон, светящийся контур и знак
glow = '<filter id="n" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9" result="a"/><feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b"/><feMerge><feMergeNode in="a"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
save('03-neon', glow,
 f'<polygon points="{hx(222)}" fill="#0a0716"/>'
 f'<polygon points="{hx(196)}" fill="none" stroke="#ff3ea5" stroke-width="7" stroke-linejoin="round" filter="url(#n)"/>'
 + glyph('soccer-ball', 210, '#5ef2ff', 'regular', extra='filter="url(#n)"'))

# 4. Винтажная печать: бумага, красные чернила, растровые точки
save('04-vintage',
 '<pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="6" cy="6" r="2.4" fill="#b3261e" opacity=".28"/></pattern>'
 '<filter id="p"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 .3  0 0 0 0 .2  0 0 0 0 .1  0 0 0 .12 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>',
 f'<polygon points="{hx(224)}" fill="#efe3c8"/><polygon points="{hx(224)}" fill="#fff" filter="url(#p)"/>'
 f'<polygon points="{hx(208)}" fill="none" stroke="#b3261e" stroke-width="10"/><polygon points="{hx(190)}" fill="none" stroke="#b3261e" stroke-width="3"/>'
 f'<polygon points="{hx(176)}" fill="url(#dots)"/>'
 + glyph('hourglass-simple', 200, '#b3261e', cy=C))

# 5. Голографическая фольга
save('05-holo',
 '<linearGradient id="hl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9ad5"/><stop offset=".2" stop-color="#ffe29a"/><stop offset=".4" stop-color="#9affc8"/><stop offset=".6" stop-color="#8ad8ff"/><stop offset=".8" stop-color="#c49aff"/><stop offset="1" stop-color="#ff9ad5"/></linearGradient>'
 '<linearGradient id="sv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#9ca3b0"/><stop offset="1" stop-color="#eef0f4"/></linearGradient>'
 '<linearGradient id="sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>',
 f'<polygon points="{hx(224)}" fill="url(#sv)"/><polygon points="{hx(206)}" fill="url(#hl)"/>'
 f'<g clip-path="url(#h)"><rect x="-100" y="150" width="700" height="60" fill="url(#sh)" transform="rotate(-35 256 256)"/></g>'
 + glyph('star', 220, '#1d1a3a'))

# 6. Баухаус: цветные геометрические блоки
save('06-bauhaus', '',
 f'<polygon points="{hx(224)}" fill="#111"/><polygon points="{hx(210)}" fill="#f2ead8"/>'
 f'<g clip-path="url(#h)"><rect x="0" y="0" width="256" height="256" fill="#e63b2e"/><circle cx="352" cy="352" r="150" fill="#1f4bb5"/><rect x="256" y="40" width="200" height="40" fill="#f5c400"/></g>'
 + glyph('star-four', 200, '#111'))

# 7. Матовое стекло на цветном фоне
save('07-glass',
 '<filter id="bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="34"/></filter>'
 '<linearGradient id="gw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity=".15"/></linearGradient>',
 f'<polygon points="{hx(222)}" fill="#1b1033"/>'
 f'<g clip-path="url(#h)"><g filter="url(#bl)"><circle cx="150" cy="170" r="120" fill="#ff5a8a"/><circle cx="370" cy="330" r="130" fill="#6b4dff"/><circle cx="330" cy="140" r="80" fill="#ffb347"/></g></g>'
 f'<polygon points="{hx(200)}" fill="none" stroke="url(#gw)" stroke-width="5"/>'
 + glyph('flame', 210, '#ffffff', extra='fill-opacity=".92"'))

# 8. Диагональный сплит: цвета меняются местами по линии
split = 'M0 512 L512 0 L512 512 Z'
save('08-split',
 f'<clipPath id="lo"><path d="{split}"/></clipPath><clipPath id="up"><path d="M0 0 L512 0 L0 512 Z"/></clipPath>',
 f'<polygon points="{hx(224)}" fill="#f2b84b"/>'
 f'<g clip-path="url(#h)"><rect width="512" height="512" fill="#2b1466"/><path d="{split}" fill="#f2b84b"/></g>'
 f'<g clip-path="url(#up)">{glyph("lightning", 230, "#f2b84b")}</g><g clip-path="url(#lo)">{glyph("lightning", 230, "#2b1466")}</g>'
 f'<polygon points="{hx(200)}" fill="none" stroke="#2b1466" stroke-width="6"/>')

# 9. Вышитая нашивка: ткань, строчка по краю
save('09-patch',
 '<pattern id="tw" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#14365a"/><rect width="4" height="8" fill="#183e66"/></pattern>'
 '<filter id="em" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="4" stdDeviation="2" flood-opacity=".5"/></filter>',
 f'<polygon points="{hx(226)}" fill="#e9c46a" filter="url(#em)"/><polygon points="{hx(212)}" fill="none" stroke="#9c7a2a" stroke-width="3" stroke-dasharray="10 7"/>'
 f'<polygon points="{hx(198)}" fill="url(#tw)"/><polygon points="{hx(186)}" fill="none" stroke="#e9c46a" stroke-width="3" stroke-dasharray="12 8" opacity=".8"/>'
 + glyph('trophy', 200, '#e9c46a', extra='filter="url(#em)"'))

# 10. Ар-деко: тёмно-синий, золотые лучи, корона
rays = ''.join(f'<line x1="256" y1="256" x2="{256+400*math.cos(math.radians(a)):.1f}" y2="{256+400*math.sin(math.radians(a)):.1f}" stroke="#d9b45a" stroke-width="{3 if i%2 else 1.5}" opacity="{.5 if i%2 else .3}"/>' for i,a in enumerate(range(0,360,10)))
save('10-deco',
 '<linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e2a6"/><stop offset=".5" stop-color="#d1a548"/><stop offset="1" stop-color="#a77a26"/></linearGradient>',
 f'<polygon points="{hx(224)}" fill="url(#dg)"/><polygon points="{hx(216)}" fill="#0c1a33"/>'
 f'<g clip-path="url(#h)">{rays}<circle cx="256" cy="256" r="118" fill="#0c1a33"/></g>'
 f'<polygon points="{hx(200)}" fill="none" stroke="url(#dg)" stroke-width="2"/>'
 f'<circle cx="256" cy="256" r="118" fill="none" stroke="url(#dg)" stroke-width="4"/><circle cx="256" cy="256" r="106" fill="none" stroke="url(#dg)" stroke-width="1.5"/>'
 + glyph('crown', 150, 'url(#dg)'))
print('ok')
