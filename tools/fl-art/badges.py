import math, os, re
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','img','brand','fl-badges')
def hx(r, cx=276, cy=256):
    return ' '.join(f'{cx+r*math.cos(math.radians(-90+60*i)):.1f},{cy+r*math.sin(math.radians(-90+60*i)):.1f}' for i in range(6))
DEFS='''<defs>
<linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff4c6"/><stop offset=".35" stop-color="#f6c94f"/><stop offset=".7" stop-color="#e08a2a"/><stop offset="1" stop-color="#ffd27a"/></linearGradient>
<linearGradient id="fr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset=".5" stop-color="#d79a2c"/><stop offset="1" stop-color="#f6c94f"/></linearGradient>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a1a8c"/><stop offset=".6" stop-color="#1d0e4a"/><stop offset="1" stop-color="#120830"/></linearGradient>
<linearGradient id="tr" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#ffe08a"/><stop offset=".6" stop-color="#e08a2a"/><stop offset="1" stop-color="#e08a2a" stop-opacity="0"/></linearGradient>
<linearGradient id="tl" gradientUnits="userSpaceOnUse" x1="260" y1="0" x2="30" y2="0"><stop offset="0" stop-color="#ffe08a"/><stop offset=".6" stop-color="#e08a2a"/><stop offset="1" stop-color="#e08a2a" stop-opacity=".15"/></linearGradient>
<clipPath id="in"><polygon points="''' + hx(176) + '''"/></clipPath>
</defs>'''
def badge(glyph, back=''):
    s=f'<polygon points="{hx(196)}" fill="url(#fr)"/><polygon points="{hx(186)}" fill="#0c0620"/><polygon points="{hx(176)}" fill="url(#bg)"/>'
    s+=f'<g clip-path="url(#in)">{back}<rect x="60" y="330" width="440" height="16" fill="#ff4f8a" opacity=".85"/><rect x="60" y="352" width="440" height="6" fill="#ff4f8a" opacity=".5"/>'
    s+=''.join(f'<line x1="{120+i*70}" y1="40" x2="{40+i*70}" y2="480" stroke="#8a5cff" stroke-opacity=".18" stroke-width="10"/>' for i in range(7))+'</g>'
    s+=f'<polygon points="{hx(176)}" fill="none" stroke="#f6c94f" stroke-opacity=".5" stroke-width="3"/>'
    return s+glyph
def out(d, w=18): return f'<path d="{d}" fill="#0c0620" stroke="#0c0620" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"/>'
def save(n, body): open(os.path.join(OUT,n+'.svg'),'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{DEFS}{body}</svg>')
def star(cx,cy,R,r): return ' '.join(f'{cx+(R if i%2==0 else r)*math.cos(math.radians(-90+36*i)):.1f},{cy+(R if i%2==0 else r)*math.sin(math.radians(-90+36*i)):.1f}' for i in range(10))

# 1 Крыло вырывается из рамки
wing='M352 214 C300 150 170 132 28 178 C92 190 128 200 150 214 C92 218 58 236 30 262 C96 256 140 260 168 270 C120 284 92 302 70 328 C150 310 232 308 314 304 C362 292 378 250 352 214 Z'
feath=''.join(f'<path d="{d}" fill="none" stroke="#a8561a" stroke-width="5" stroke-linecap="round" opacity=".7"/>' for d in ['M150 214 C210 210 270 214 330 226','M168 270 C220 262 280 262 336 268','M70 328 C120 312 200 304 300 300'])
save('1-wing', badge(out(wing,22)+f'<path d="{wing}" fill="url(#gl)"/>'+feath+'<path d="M200 170 C250 168 300 180 340 205" stroke="#fff6d6" stroke-width="6" fill="none" stroke-linecap="round" opacity=".8"/>'))
# 2 Комета-звезда
trail='M300 196 L30 150 L44 186 L300 232 Z M300 236 L18 236 L34 262 L300 276 Z M300 280 L44 330 L64 352 L300 312 Z'
st=star(322,256,86,36)
save('2-comet', badge(out(trail,14)+f'<path d="{trail}" fill="url(#tr)"/>'+f'<polygon points="{st}" fill="#0c0620" stroke="#0c0620" stroke-width="22" stroke-linejoin="round"/><polygon points="{st}" fill="url(#gl)"/><polygon points="{star(322,256,40,17)}" fill="#fff6d6" opacity=".55"/>'))
# 3 Мяч со шлейфом
def pent(cx,cy,r,rot): return ' '.join(f'{cx+r*math.cos(math.radians(rot+72*i)):.1f},{cy+r*math.sin(math.radians(rot+72*i)):.1f}' for i in range(5))
lines=''.join(f'<path d="M{250-k*4} {y} L{40+k*30} {y}" stroke="url(#tl)" stroke-width="{w}" stroke-linecap="round"/>' for k,(y,w) in enumerate([(200,16),(240,22),(282,18),(318,12)]))
ballg=f'<circle cx="324" cy="258" r="88" fill="#0c0620"/><circle cx="324" cy="258" r="76" fill="url(#gl)"/><polygon points="{pent(324,258,26,-90)}" fill="#2a1466"/>'
for i in range(5):
    a=math.radians(-90+36+i*72); ballg+=f'<polygon points="{pent(324+62*math.cos(a),258+62*math.sin(a),20,math.degrees(a)+180)}" fill="#2a1466"/>'
ballg+='<path d="M282 216 C300 196 330 190 350 196" stroke="#fff6d6" stroke-width="8" fill="none" stroke-linecap="round" opacity=".7"/>'
save('3-ball', badge(re.sub(r'stroke-width="(\d+)"', lambda m: 'stroke-width="%d"' % (int(m.group(1))+14), lines.replace('url(#tl)','#0c0620'))+lines+ballg))
# 4 Лавровая ветвь: дуга из правого низа, вырывается влево-вверх
def bez(t,p0,p1,p2):
    return ((1-t)**2*p0[0]+2*(1-t)*t*p1[0]+t*t*p2[0], (1-t)**2*p0[1]+2*(1-t)*t*p1[1]+t*t*p2[1])
P0,P1,P2=(372,368),(300,150),(36,128)
stem=f'M{P0[0]} {P0[1]} Q{P1[0]} {P1[1]} {P2[0]} {P2[1]}'
dark=''; gold=''
N=7
for k in range(N):
    t=0.08+k*0.86/(N-1)
    x,y=bez(t,P0,P1,P2); x2,y2=bez(t+0.01,P0,P1,P2)
    ang=math.degrees(math.atan2(y2-y,x2-x)); sz=1.0-0.35*t
    for sgn in (-1,1):
        a2=ang+sgn*42
        rx,ry=46*sz,17*sz
        cx=x+math.cos(math.radians(a2))*rx; cy=y+math.sin(math.radians(a2))*rx
        leaf=f'cx="{cx:.0f}" cy="{cy:.0f}" rx="{rx:.0f}" ry="{ry:.0f}" transform="rotate({a2:.0f} {cx:.0f} {cy:.0f})"'
        dark+=f'<ellipse {leaf} fill="#0c0620" stroke="#0c0620" stroke-width="14"/>'
        gold+=f'<ellipse {leaf} fill="url(#gl)"/>'
tip=bez(1,P0,P1,P2)
save('4-laurel', badge(f'<path d="{stem}" stroke="#0c0620" stroke-width="24" fill="none" stroke-linecap="round"/>'+dark+f'<path d="{stem}" stroke="#d79a2c" stroke-width="10" fill="none" stroke-linecap="round"/>'+gold))
# 5 Корона с искрой, слегка наклонена и выходит за рамку
crown='M120 330 L96 190 L176 250 L230 140 L284 250 L364 190 L340 330 Z'
save('5-crown', badge(f'<g transform="rotate(-14 230 250) translate(-20 0)">{out(crown,24)}<path d="{crown}" fill="url(#gl)"/><rect x="118" y="300" width="224" height="30" fill="#e08a2a" stroke="#0c0620" stroke-width="8"/>'
  + ''.join(f'<circle cx="{x}" cy="{y}" r="16" fill="url(#gl)" stroke="#0c0620" stroke-width="7"/>' for x,y in [(96,184),(230,132),(364,184)])
  + '<polygon points="230,210 244,240 230,270 216,240" fill="#ff4f8a" stroke="#0c0620" stroke-width="6"/></g>'
  + f'<polygon points="{star(420,150,30,10)}" fill="#fff6d6"/>'))
print('ok')
