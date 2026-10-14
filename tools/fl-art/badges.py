# 10 значков серии «Забытые легенды»: один тип (шестиугольник + знак), разные стили.
# Запуск: python3 tools/fl-art/badges.py img/brand/fl-badges <путь к node_modules/@phosphor-icons/core/assets> (npm i @phosphor-icons/core@2.1.1)
# Знаки — из набора Phosphor Icons (MIT), чтобы линии были ровные; декор построен по геометрии.
import math, os, re, sys
OUT = sys.argv[1]; ICONS = sys.argv[2]
C = 256
FONT = "font-family=\"'Arial Black', Arial, sans-serif\" font-weight=\"900\""
def pt(r, a, cx=C, cy=C): return cx + r*math.cos(math.radians(a)), cy + r*math.sin(math.radians(a))
def hx(r, cx=C, cy=C, rot=-90):
    return ' '.join('%.2f,%.2f' % pt(r, rot+60*i, cx, cy) for i in range(6))
def icon(name, weight='fill'):
    fn = f'{name}-{weight}.svg' if weight != 'regular' else f'{name}.svg'
    s = open(os.path.join(ICONS, weight, fn)).read()
    return re.search(r'<svg[^>]*>(.*)</svg>', s, re.S).group(1)
def glyph(name, size, fill, weight='fill', cx=C, cy=C, extra=''):
    k = size / 256
    return f'<g transform="translate({cx-size/2:.1f} {cy-size/2:.1f}) scale({k:.4f})" fill="{fill}" {extra}>{icon(name, weight)}</g>'
def verts(r, f): return ''.join(f(*pt(r, -90+60*i)) for i in range(6))
def stars(n, y, size, fill, gap, cx=C):
    return ''.join(glyph('star', size, fill, cx=cx+(i-(n-1)/2)*gap, cy=y) for i in range(n))
def text(t, x, y, size, fill, extra=''):
    return ''
    return f'<text x="{x}" y="{y}" text-anchor="middle" {FONT} font-size="{size}" letter-spacing="{size*.12:.1f}" fill="{fill}" {extra}>{t}</text>'
def ribbon(y, w, h, fill, edge, label, tcol, size):
    x0, x1, n = C - w/2, C + w/2, 18
    tail = f'<path d="M{x0-30} {y+8} L{x0+6} {y+8} L{x0+6} {y+h+8} L{x0-30} {y+h+8} L{x0-16} {y+8+h/2} Z M{x1+30} {y+8} L{x1-6} {y+8} L{x1-6} {y+h+8} L{x1+30} {y+h+8} L{x1+16} {y+8+h/2} Z" fill="{edge}"/>'
    return tail + f'<rect x="{x0}" y="{y}" width="{w}" height="{h}" fill="{fill}"/>' + text(label, C, y+h*0.72, size, tcol)
def laurel(cx, cy, R, a0, a1, n, fill, side):
    # ветвь вдоль дуги окружности; side=1 справа, -1 слева (зеркально)
    s = ''
    for i in range(n):
        a = a0 + (a1-a0)*i/(n-1)
        x, y = pt(R, a, cx, cy)
        tang = a + 90*side
        for k, off in ((1, 28), (-1, -28)):
            rot = tang + off*side
            lx, ly = x + 14*math.cos(math.radians(rot)), y + 14*math.sin(math.radians(rot))
            sc = 1 - 0.35*i/(n-1)
            s += f'<ellipse cx="{lx:.1f}" cy="{ly:.1f}" rx="{15*sc:.1f}" ry="{6*sc:.1f}" transform="rotate({rot:.1f} {lx:.1f} {ly:.1f})" fill="{fill}"/>'
    pts = ' '.join('%.1f,%.1f' % pt(R, a0+(a1-a0)*i/20, cx, cy) for i in range(21))
    return f'<polyline points="{pts}" fill="none" stroke="{fill}" stroke-width="3" stroke-linecap="round"/>' + s
def save(n, defs, body):
    open(os.path.join(OUT, n + '.svg'), 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>{defs}<clipPath id="h"><polygon points="{hx(200)}"/></clipPath></defs>{body}</svg>')

# 1. Чёрное золото
G = '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7e3a3"/><stop offset=".5" stop-color="#c99a3e"/><stop offset="1" stop-color="#8f6420"/></linearGradient>'
hexgrid = '<pattern id="hg" width="24" height="41.57" patternUnits="userSpaceOnUse"><path d="M12 0 L24 6.93 L24 20.78 L12 27.71 L0 20.78 L0 6.93 Z M12 27.71 L12 41.57" fill="none" stroke="#c99a3e" stroke-width="1" opacity=".13"/></pattern>'
save('01-black-gold', G + hexgrid +
 '<radialGradient id="b" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#2a2a2e"/><stop offset="1" stop-color="#0b0b0d"/></radialGradient>'
 '<radialGradient id="gl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f6c94f" stop-opacity=".35"/><stop offset="1" stop-color="#f6c94f" stop-opacity="0"/></radialGradient>',
 f'<polygon points="{hx(222)}" fill="url(#g)"/><polygon points="{hx(214)}" fill="url(#b)"/><polygon points="{hx(214)}" fill="url(#hg)"/>'
 f'<polygon points="{hx(196)}" fill="none" stroke="url(#g)" stroke-width="3"/><polygon points="{hx(188)}" fill="none" stroke="url(#g)" stroke-width="1" opacity=".6"/>'
 + verts(196, lambda x, y: f'<circle cx="{x:.1f}" cy="{y:.1f}" r="7" fill="url(#g)" stroke="#0b0b0d" stroke-width="3"/>')
 + '<circle cx="256" cy="244" r="120" fill="url(#gl)"/>'
 + glyph('shooting-star', 200, 'url(#g)', cy=240)

 + text('ЛЕГЕНДЫ', C, 352, 26, 'url(#g)') + stars(3, 384, 18, 'url(#g)', 26))

# 2. Эмаль
SV = '<linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#a9b0bb"/><stop offset="1" stop-color="#e7eaee"/></linearGradient>'
save('02-enamel', SV + '<linearGradient id="glare" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>',
 f'<polygon points="{hx(224)}" fill="url(#s)"/><polygon points="{hx(212)}" fill="none" stroke="#7d8591" stroke-width="2"/><polygon points="{hx(200)}" fill="#1a2a6c"/>'
 f'<g clip-path="url(#h)"><rect x="0" y="300" width="512" height="212" fill="#c8102e"/>'
 + ''.join(f'<rect x="{x}" y="300" width="16" height="212" fill="#a90d26"/>' for x in range(40, 512, 40))
 + '<rect x="0" y="292" width="512" height="10" fill="url(#s)"/>'
 + ''.join(f'<circle cx="{x}" cy="{y}" r="2.5" fill="#fff" opacity=".22"/>' for x in range(80, 460, 28) for y in range(90, 290, 28))
 + f'<polygon points="{hx(200)}" fill="url(#glare)"/></g>'
 f'<polygon points="{hx(200)}" fill="none" stroke="#0c1440" stroke-opacity=".35" stroke-width="6"/>'
 + verts(212, lambda x, y: f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6" fill="#e7eaee" stroke="#7d8591" stroke-width="2"/>')
 + glyph('crown-simple', 170, '#0c1440', cy=206+4, cx=C+4) + glyph('crown-simple', 170, '#ffffff', cy=206)
 + stars(5, 120, 16, '#ffffff', 26)
 + text('ЛЕГЕНДЫ', C, 352, 30, '#ffffff'))

# 3. Неон
glow = '<filter id="n" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9" result="a"/><feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b"/><feMerge><feMergeNode in="a"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
grid = ''.join(f'<line x1="{C}" y1="300" x2="{C+(i-6)*90}" y2="520" stroke="#ff3ea5" stroke-width="2" opacity=".45"/>' for i in range(13))
grid += ''.join(f'<line x1="0" y1="{y}" x2="512" y2="{y}" stroke="#ff3ea5" stroke-width="2" opacity="{.15+.06*k}"/>' for k, y in enumerate([312, 326, 346, 374, 412]))
save('03-neon', glow + '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0716"/><stop offset=".6" stop-color="#2a0b3d"/><stop offset="1" stop-color="#0a0716"/></linearGradient>',
 f'<polygon points="{hx(222)}" fill="#0a0716"/><g clip-path="url(#h)"><rect width="512" height="512" fill="url(#sky)"/>{grid}'
 + ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff" opacity=".7"/>' for x, y, r in [(140,140,2),(372,128,2.5),(330,90,1.5),(180,96,1.5),(400,220,2),(110,230,1.5)])
 + '</g>'
 f'<polygon points="{hx(214)}" fill="none" stroke="#5ef2ff" stroke-width="2.5" filter="url(#n)" opacity=".8"/>'
 f'<polygon points="{hx(196)}" fill="none" stroke="#ff3ea5" stroke-width="7" stroke-linejoin="round" filter="url(#n)"/>'
 + ''.join(f'<path d="M{x1} {y} L{x2} {y}" stroke="#5ef2ff" stroke-width="5" stroke-linecap="round" filter="url(#n)" opacity="{o}"/>' for x1, x2, y, o in [(110,160,214,.8),(96,150,244,1),(116,162,274,.8)])
 + glyph('soccer-ball', 180, '#5ef2ff', 'regular', cy=244, extra='filter="url(#n)"')
 + text('ЛЕГЕНДЫ', C, 384, 26, '#ff9fd2', 'filter="url(#n)"'))

# 4. Винтажная печать
save('04-vintage',
 '<pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="6" cy="6" r="2.4" fill="#b3261e" opacity=".28"/></pattern>'
 '<filter id="p"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 .3  0 0 0 0 .2  0 0 0 0 .1  0 0 0 .12 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>'
 '<filter id="wear"><feTurbulence type="fractalNoise" baseFrequency=".04 .3" numOctaves="2" seed="3" result="t"/><feColorMatrix in="t" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.75" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>',
 f'<polygon points="{hx(224)}" fill="#efe3c8"/><polygon points="{hx(224)}" fill="#fff" filter="url(#p)"/>'
 f'<g filter="url(#wear)"><polygon points="{hx(208)}" fill="none" stroke="#b3261e" stroke-width="10"/><polygon points="{hx(190)}" fill="none" stroke="#b3261e" stroke-width="3"/>'
 f'<polygon points="{hx(176)}" fill="url(#dots)"/>'
 + glyph('hourglass-simple', 150, '#b3261e', cy=250)
 + text('ЗАБЫТЫЕ', C, 152, 28, '#b3261e') + text('ЛЕГЕНДЫ', C, 372, 28, '#b3261e')
 + glyph('star', 22, '#b3261e', cx=150, cy=250) + glyph('star', 22, '#b3261e', cx=362, cy=250)
 + '<path d="M170 168 L342 168 M170 336 L342 336" stroke="#b3261e" stroke-width="2"/>'
 + text('С 2026', C, 404, 15, '#b3261e') + '</g>')

# 5. Голограмма — несколько расцветок
HOLO = {
 '05-holo': (['#ff9ad5','#ffe29a','#9affc8','#8ad8ff','#c49aff','#ff9ad5'], ['#ffffff','#9ca3b0','#eef0f4'], '#1d1a3a'),
 '05a-holo-gold': (['#fff1b8','#f6c94f','#ffe6a0','#e0a33a','#fff4cc','#f2bd4f'], ['#fff6d6','#b8862f','#f3d58a'], '#3a2306'),
 '05b-holo-violet': (['#ff7ac8','#b07aff','#7a8cff','#c27aff','#ff8fd0','#9a6bff'], ['#f0e6ff','#7b62b8','#d9ccff'], '#ffffff'),
 '05c-holo-ice': (['#e6fbff','#9be7ff','#c9d8ff','#7fd3ff','#eaf6ff','#a8e9ff'], ['#ffffff','#8fa6c0','#e6eef7'], '#0d2a4a'),
 '05d-holo-emerald': (['#b8ffd9','#3ddc97','#9af0ff','#22b07d','#d4ffe9','#5be3b0'], ['#e8fff3','#4f8f74','#c9f2de'], '#06291c'),
 '05e-holo-ruby': (['#ffb3c1','#ff4d6d','#ffc38a','#d81b50','#ffd1dc','#ff6b8b'], ['#fff0f3','#a8475b','#f6c9d3'], '#3a0612'),
 '05f-holo-black': (['#3a3a48','#1c1c26','#5a4a7a','#20283a','#4a3a5a','#2a2a36'], ['#f7e3a3','#8f6420','#e9c46a'], '#f6c94f'),
}
for name, (hc, sc, star_c) in HOLO.items():
    stops = ''.join(f'<stop offset="{i/5:.2f}" stop-color="{c}"/>' for i, c in enumerate(hc))
    save(name,
     f'<linearGradient id="hl" x1="0" y1="0" x2="1" y2="1">{stops}</linearGradient>'
     f'<linearGradient id="sv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{sc[0]}"/><stop offset=".5" stop-color="{sc[1]}"/><stop offset="1" stop-color="{sc[2]}"/></linearGradient>'
     '<linearGradient id="sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
     '<pattern id="ln" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="10" height="2" fill="#fff" opacity=".22"/></pattern>',
     f'<polygon points="{hx(224)}" fill="url(#sv)"/><polygon points="{hx(206)}" fill="url(#hl)"/>'
     f'<g clip-path="url(#h)"><rect width="512" height="512" fill="url(#ln)"/>'
     + ''.join(f'<circle cx="{C}" cy="{C}" r="{r}" fill="none" stroke="#fff" stroke-width="1.5" opacity=".35"/>' for r in (150, 170, 190))
     + '<rect x="-100" y="150" width="700" height="60" fill="url(#sh)" transform="rotate(-35 256 256)"/><rect x="-100" y="250" width="700" height="20" fill="url(#sh)" transform="rotate(-35 256 256)"/></g>'
     f'<polygon points="{hx(194)}" fill="none" stroke="#ffffff" stroke-width="2" opacity=".8"/>'
     + glyph('star', 190, star_c)
     + ''.join(glyph('sparkle', sz, '#ffffff', cx=x, cy=y) for x, y, sz in [(150,140,40),(370,150,30),(380,340,44),(138,350,26)])
     + glyph('star', 60, 'url(#hl)', cy=262))

# 6. Баухаус
save('06-bauhaus', '',
 f'<polygon points="{hx(224)}" fill="#111"/><polygon points="{hx(210)}" fill="#f2ead8"/>'
 f'<g clip-path="url(#h)"><rect x="0" y="0" width="256" height="256" fill="#e63b2e"/><circle cx="352" cy="352" r="150" fill="#1f4bb5"/><rect x="256" y="40" width="200" height="40" fill="#f5c400"/>'
 '<path d="M100 400 A90 90 0 0 1 280 400 Z" fill="#f5c400"/><circle cx="180" cy="400" r="30" fill="#111"/>'
 + ''.join(f'<circle cx="{x}" cy="{y}" r="5" fill="#111"/>' for x in range(300, 420, 22) for y in range(110, 200, 22))
 + '<line x1="60" y1="300" x2="470" y2="300" stroke="#111" stroke-width="8"/><line x1="256" y1="30" x2="256" y2="480" stroke="#111" stroke-width="3"/>'
 '<path d="M100 120 A60 60 0 0 1 220 120" fill="none" stroke="#f2ead8" stroke-width="10"/></g>'
 f'<polygon points="{hx(210)}" fill="none" stroke="#111" stroke-width="4"/>'
 + '<circle cx="256" cy="256" r="74" fill="#f2ead8" stroke="#111" stroke-width="8"/>' + glyph('star-four', 120, '#111'))

# 7. Стекло
save('07-glass',
 '<filter id="bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="34"/></filter>'
 '<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>'
 '<linearGradient id="gw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".65"/><stop offset="1" stop-color="#fff" stop-opacity=".1"/></linearGradient>'
 '<linearGradient id="gh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>',
 f'<polygon points="{hx(222)}" fill="#1b1033"/>'
 f'<g clip-path="url(#h)"><g filter="url(#bl)"><circle cx="150" cy="170" r="120" fill="#ff5a8a"/><circle cx="370" cy="330" r="130" fill="#6b4dff"/><circle cx="330" cy="140" r="80" fill="#ffb347"/><circle cx="160" cy="390" r="70" fill="#29d3c4"/></g>'
 '<path d="M40 40 L480 40 L480 210 C380 240 140 240 40 200 Z" fill="url(#gh)"/>'
 + ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2"/><circle cx="{x-r*.35:.1f}" cy="{y-r*.35:.1f}" r="{r*.22:.1f}" fill="#fff" opacity=".6"/>' for x, y, r in [(370,150,14),(392,184,7),(150,330,10),(132,302,5),(360,360,9)])
 + '</g>'
 f'<polygon points="{hx(200)}" fill="none" stroke="url(#gw)" stroke-width="5"/><polygon points="{hx(186)}" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2"/>'
 + glyph('flame', 190, '#ffb0d0', cy=262, extra='filter="url(#soft)" opacity=".8"')
 + glyph('flame', 190, '#ffffff', cy=256, extra='fill-opacity=".94"')
 + text('ЛЕГЕНДЫ', C, 392, 22, '#ffffff', 'opacity=".85"'))

# 8. Сплит
split = 'M0 512 L512 0 L512 512 Z'
save('08-split',
 f'<clipPath id="lo"><path d="{split}"/></clipPath><clipPath id="up"><path d="M0 0 L512 0 L0 512 Z"/></clipPath>'
 '<pattern id="pd" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="2.6" fill="#f2b84b" opacity=".35"/></pattern>'
 '<pattern id="ps" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="3" fill="#2b1466" opacity=".2"/></pattern>',
 f'<polygon points="{hx(224)}" fill="#f2b84b"/><polygon points="{hx(224)}" fill="none" stroke="#2b1466" stroke-width="3"/>'
 f'<g clip-path="url(#h)"><rect width="512" height="512" fill="#2b1466"/><rect width="512" height="512" fill="url(#pd)"/><path d="{split}" fill="#f2b84b"/><path d="{split}" fill="url(#ps)"/>'
 '<path d="M0 520 L520 0" stroke="#fff" stroke-width="4" opacity=".8"/></g>'
 f'<g clip-path="url(#up)">{glyph("lightning", 220, "#f2b84b")}{stars(3, 128, 22, "#f2b84b", 32, cx=200)}{text("ЗАБЫТЫЕ", 196, 172, 20, "#f2b84b")}</g>'
 f'<g clip-path="url(#lo)">{glyph("lightning", 220, "#2b1466")}{stars(3, 392, 22, "#2b1466", 32, cx=312)}{text("ЛЕГЕНДЫ", 318, 360, 20, "#2b1466")}</g>'
 f'<polygon points="{hx(200)}" fill="none" stroke="#2b1466" stroke-width="6"/>'
 + verts(212, lambda x, y: f'<rect x="{x-5:.1f}" y="{y-5:.1f}" width="10" height="10" fill="#2b1466" transform="rotate(45 {x:.1f} {y:.1f})"/>'))

# 9. Нашивка
save('09-patch',
 '<pattern id="tw" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#14365a"/><rect width="4" height="8" fill="#183e66"/></pattern>'
 '<filter id="em" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="4" stdDeviation="2" flood-opacity=".5"/></filter>',
 f'<polygon points="{hx(226)}" fill="#e9c46a" filter="url(#em)"/><polygon points="{hx(212)}" fill="none" stroke="#9c7a2a" stroke-width="3" stroke-dasharray="10 7"/>'
 f'<polygon points="{hx(198)}" fill="url(#tw)"/><polygon points="{hx(186)}" fill="none" stroke="#e9c46a" stroke-width="3" stroke-dasharray="12 8" opacity=".8"/>'
 f'<g filter="url(#em)">'
 + laurel(C, 226, 112, 120, 215, 7, '#e9c46a', 1) + laurel(C, 226, 112, 60, -35, 7, '#e9c46a', -1)
 + glyph('trophy', 150, '#e9c46a', cy=216)
 + stars(3, 116, 18, '#e9c46a', 28)

 + '</g>')

# 10. Ар-деко
rays = ''.join(f'<line x1="256" y1="256" x2="{256+400*math.cos(math.radians(a)):.1f}" y2="{256+400*math.sin(math.radians(a)):.1f}" stroke="#d9b45a" stroke-width="{3 if i%2 else 1.5}" opacity="{.5 if i%2 else .3}"/>' for i, a in enumerate(range(0, 360, 10)))
dotring = ''.join('<circle cx="%.1f" cy="%.1f" r="2.6" fill="#d9b45a"/>' % pt(132, a) for a in range(0, 360, 12))
steps = ''.join(f'<polygon points="{hx(200-k*8)}" fill="none" stroke="url(#dg)" stroke-width="1" opacity="{.7-k*.2}"/>' for k in range(1, 3))
save('10-deco',
 '<linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e2a6"/><stop offset=".5" stop-color="#d1a548"/><stop offset="1" stop-color="#a77a26"/></linearGradient>',
 f'<polygon points="{hx(224)}" fill="url(#dg)"/><polygon points="{hx(216)}" fill="#0c1a33"/>'
 f'<g clip-path="url(#h)">{rays}<circle cx="256" cy="256" r="140" fill="#0c1a33"/></g>{steps}'
 f'<polygon points="{hx(200)}" fill="none" stroke="url(#dg)" stroke-width="2"/>'
 + verts(200, lambda x, y: f'<rect x="{x-9:.1f}" y="{y-9:.1f}" width="18" height="18" fill="#0c1a33" stroke="url(#dg)" stroke-width="2" transform="rotate(45 {x:.1f} {y:.1f})"/><circle cx="{x:.1f}" cy="{y:.1f}" r="3" fill="#d9b45a"/>')
 + dotring
 + f'<circle cx="256" cy="256" r="118" fill="none" stroke="url(#dg)" stroke-width="4"/><circle cx="256" cy="256" r="106" fill="none" stroke="url(#dg)" stroke-width="1.5"/>'
 + glyph('crown', 130, 'url(#dg)', cy=254)
 + text('ЛЕГЕНДЫ', C, 320, 18, 'url(#dg)')
 + glyph('diamond', 18, '#d9b45a', cx=C, cy=168) + glyph('diamond', 18, '#d9b45a', cx=C, cy=344))
print('ok')
