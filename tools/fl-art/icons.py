import math, os, random
OUT='/tmp/claude-0/-home-user-Games/07b8704d-3bea-5671-acce-cbd54c1cd4d8/scratchpad/ico'
def hexpts(r, cx=256, cy=256, rot=90):
    return ' '.join(f'{cx+r*math.cos(math.radians(rot+60*i)):.1f},{cy+r*math.sin(math.radians(rot+60*i)):.1f}' for i in range(6))
DEFS='''<defs>
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3bf"/><stop offset=".4" stop-color="#f6c94f"/><stop offset=".75" stop-color="#d0901f"/><stop offset="1" stop-color="#ffe08a"/></linearGradient>
<linearGradient id="frame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe7a0"/><stop offset=".5" stop-color="#e09a24"/><stop offset="1" stop-color="#ff7ad9"/></linearGradient>
<radialGradient id="fill" cx=".5" cy=".35" r=".75"><stop offset="0" stop-color="#7b3cff"/><stop offset=".6" stop-color="#3a1a8c"/><stop offset="1" stop-color="#170a3d"/></radialGradient>
<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>'''
def frame(fill=True, r=200):
    s=f'<polygon points="{hexpts(r)}" fill="url(#fill)"/>' if fill else ''
    return s+f'<polygon points="{hexpts(r)}" fill="none" stroke="#120826" stroke-width="34" stroke-linejoin="round"/><polygon points="{hexpts(r)}" fill="none" stroke="url(#frame)" stroke-width="20" stroke-linejoin="round"/>'
def figure(bones, head, w=38, hr=30, col='url(#gold)', out='#120826', ow=16):
    d=''.join(f'M{a[0]} {a[1]} ' + ' '.join(f'L{p[0]} {p[1]}' for p in rest) for a,*rest in bones)
    s=f'<path d="{d}" fill="none" stroke="{out}" stroke-width="{w+ow}" stroke-linecap="round" stroke-linejoin="round"/>'
    s+=f'<circle cx="{head[0]}" cy="{head[1]}" r="{hr+ow/2}" fill="{out}"/>'
    s+=f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>'
    s+=f'<circle cx="{head[0]}" cy="{head[1]}" r="{hr}" fill="{col}"/>'
    return s
def ball(cx,cy,r,col='#fff3bf'):
    p=' '.join(f'{cx+r*.42*math.cos(math.radians(-90+72*i)):.1f},{cy+r*.42*math.sin(math.radians(-90+72*i)):.1f}' for i in range(5))
    return f'<circle cx="{cx}" cy="{cy}" r="{r+8}" fill="#120826"/><circle cx="{cx}" cy="{cy}" r="{r}" fill="{col}"/><polygon points="{p}" fill="#2a1466"/>'
def seam(d, w=10):
    return f'<path d="{d}" fill="none" stroke="#ffe7a0" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/><path d="{d}" fill="none" stroke="#fff" stroke-width="{w/3}" stroke-linecap="round" stroke-linejoin="round"/>'
def star(cx,cy,R,r,rot=-90):
    return ' '.join(f'{cx+(R if i%2==0 else r)*math.cos(math.radians(rot+36*i)):.1f},{cy+(R if i%2==0 else r)*math.sin(math.radians(rot+36*i)):.1f}' for i in range(10))
def save(name, body):
    open(os.path.join(OUT, name+'.svg'),'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{DEFS}{body}</svg>')

# A. Бисиклета — фигура вылетает за рамку
bic=[[(214,300),(318,326)], [(312,324),(342,392),(392,414)], [(306,322),(268,390),(226,408)], [(214,300),(244,206),(318,134)], [(214,300),(150,322),(124,386)]]
save('A-bicycle', frame()+figure(bic,(370,340))+ball(366,104,30)+'<path d="M396 84 C420 70 436 74 446 86" stroke="#ffe7a0" stroke-width="7" fill="none" stroke-linecap="round"/>')
# B. Руки в стороны (празднование) с трещиной-кинцуги
cel=[[(256,206),(256,318)], [(256,214),(186,244),(132,300)], [(256,214),(326,244),(380,300)], [(256,318),(222,392),(214,452)], [(256,318),(290,392),(298,452)]]
save('B-celebrate', frame()+figure(cel,(256,150),w=44,hr=34)+seam('M268 112 L246 160 L270 214 L240 268 L266 330 L238 402 L252 470',8))
# C. Звезда-кинцуги: две половины, склеенные золотом
sp=star(256,262,150,62)
save('C-kintsugi-star', frame()+f'<clipPath id="lh"><path d="M0 0 L262 0 L240 120 L272 200 L236 290 L268 360 L246 512 L0 512 Z"/></clipPath><clipPath id="rh"><path d="M512 0 L262 0 L240 120 L272 200 L236 290 L268 360 L246 512 L512 512 Z"/></clipPath>'
     f'<polygon points="{sp}" fill="#120826" stroke="#120826" stroke-width="22" stroke-linejoin="round"/>'
     f'<g clip-path="url(#lh)"><polygon points="{sp}" fill="url(#gold)" stroke="#120826" stroke-width="10" transform="translate(-12 5) rotate(-4 256 262)"/></g>'
     f'<g clip-path="url(#rh)"><polygon points="{sp}" fill="url(#gold)" stroke="#120826" stroke-width="10" transform="translate(12 -5) rotate(4 256 262)"/></g>'
     + seam('M262 104 L240 166 L270 220 L238 288 L266 352 L248 420',7))
# D. Призрак: бегущий пиктограммой, растворяется в пиксели
run=[[(296,196),(266,300)], [(292,204),(336,248),(368,222)], [(290,206),(240,236),(212,280)], [(266,300),(324,352),(312,436)], [(266,300),(208,360),(158,352)]]
random.seed(5); px=''
for i in range(70):
    x=60+random.random()*150; y=150+random.random()*260; s=6+random.random()*16
    px+=f'<rect x="{x:.0f}" y="{y:.0f}" width="{s:.0f}" height="{s:.0f}" fill="#f6c94f" opacity="{0.25+random.random()*0.7:.2f}"/>'
save('D-ghost', frame()+'<clipPath id="fade"><rect x="190" y="0" width="330" height="512"/></clipPath>'+px+f'<g clip-path="url(#fade)">{figure(run,(312,146))}</g>'
     + ''.join(f'<rect x="{180+random.random()*30:.0f}" y="{150+random.random()*300:.0f}" width="14" height="14" fill="#f6c94f"/>' for i in range(14)))
# E. Удар через себя силуэтом + звезда, без фона: только контур шестигранника (как на скриншоте)
save('E-bicycle-open', frame(fill=False)+figure(bic,(370,340),w=40)+ball(366,104,30)+f'<polygon points="{star(140,150,30,12)}" fill="url(#gold)" stroke="#120826" stroke-width="8" stroke-linejoin="round"/>')
# F. Мяч-кинцуги
p5=lambda cx,cy,r,rot: ' '.join(f'{cx+r*math.cos(math.radians(rot+72*i)):.1f},{cy+r*math.sin(math.radians(rot+72*i)):.1f}' for i in range(5))
bl=f'<circle cx="256" cy="262" r="140" fill="#120826"/><circle cx="256" cy="262" r="126" fill="url(#gold)"/><polygon points="{p5(256,262,44,-90)}" fill="#2a1466"/>'
for i in range(5):
    a=math.radians(-90+36+i*72); bl+=f'<polygon points="{p5(256+108*math.cos(a),262+108*math.sin(a),38,math.degrees(a)+180)}" fill="#2a1466"/>'
save('F-kintsugi-ball', frame()+bl+seam('M170 160 L214 214 L196 262 L244 300 L230 352 L262 396',11).replace('#ffe7a0','#ff8ae0')+seam('M244 300 L310 288 L352 326',6)+seam('M214 214 L268 196 L300 150',5))
print('ok')
