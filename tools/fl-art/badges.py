import math, os, sys
OUT=sys.argv[1] if len(sys.argv)>1 else os.path.dirname(os.path.abspath(__file__))
def hx(r, cx=270, cy=256):
    return ' '.join(f'{cx+r*math.cos(math.radians(-90+60*i)):.1f},{cy+r*math.sin(math.radians(-90+60*i)):.1f}' for i in range(6))
DEFS='''<defs>
<linearGradient id="brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3d58a"/><stop offset=".45" stop-color="#b8862f"/><stop offset=".55" stop-color="#8a5f1c"/><stop offset="1" stop-color="#e2b65a"/></linearGradient>
<radialGradient id="deep" cx=".62" cy=".3" r=".85"><stop offset="0" stop-color="#1f5560"/><stop offset=".55" stop-color="#0d2c35"/><stop offset="1" stop-color="#050f14"/></radialGradient>
<linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fc4ff"/><stop offset=".35" stop-color="#3f6fd0"/><stop offset=".75" stop-color="#1b3478"/><stop offset="1" stop-color="#4a7be0"/></linearGradient>
<linearGradient id="copper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc59a"/><stop offset=".5" stop-color="#e0703a"/><stop offset="1" stop-color="#9c3d18"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0c0"/><stop offset=".45" stop-color="#e3b14d"/><stop offset=".8" stop-color="#9a6a1f"/><stop offset="1" stop-color="#d9a648"/></linearGradient>
<linearGradient id="leather" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9b98a"/><stop offset=".5" stop-color="#b06a35"/><stop offset="1" stop-color="#5e3016"/></linearGradient>
<linearGradient id="streak" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7fe0ff" stop-opacity="0"/><stop offset=".5" stop-color="#7fe0ff" stop-opacity=".22"/><stop offset="1" stop-color="#7fe0ff" stop-opacity="0"/></linearGradient>
<filter id="bevel" x="-10%" y="-10%" width="120%" height="120%">
 <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b"/>
 <feSpecularLighting in="b" surfaceScale="4" specularConstant="1" specularExponent="18" lighting-color="#fff6e0" result="s"><feDistantLight azimuth="225" elevation="40"/></feSpecularLighting>
 <feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>
 <feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k2="1" k3=".75"/>
</filter>
<filter id="lift" x="-30%" y="-30%" width="160%" height="160%">
 <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" result="b"/>
 <feSpecularLighting in="b" surfaceScale="3" specularConstant=".9" specularExponent="24" lighting-color="#ffffff" result="s"><feDistantLight azimuth="235" elevation="50"/></feSpecularLighting>
 <feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>
 <feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k2="1" k3=".6" result="lit"/>
 <feGaussianBlur in="SourceAlpha" stdDeviation="7" result="sh0"/><feOffset dx="6" dy="10" result="sh1"/>
 <feFlood flood-color="#000" flood-opacity=".6"/><feComposite in2="sh1" operator="in" result="sh"/>
 <feMerge><feMergeNode in="sh"/><feMergeNode in="lit"/></feMerge>
</filter>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .07 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<clipPath id="in"><polygon points="''' + hx(170) + '''"/></clipPath>
</defs>'''
def frame(back=''):
    s=f'<polygon points="{hx(198)}" fill="url(#brass)" filter="url(#bevel)"/>'
    s+=f'<polygon points="{hx(186)}" fill="#07141a"/>'
    s+=f'<polygon points="{hx(178)}" fill="url(#copper)" filter="url(#bevel)"/>'
    s+=f'<polygon points="{hx(170)}" fill="url(#deep)"/>'
    s+=f'<g clip-path="url(#in)">'
    s+=''.join(f'<rect x="-40" y="{y}" width="640" height="{h}" fill="url(#streak)" transform="rotate(-62 270 256)"/>' for y,h in [(150,6),(210,22),(300,4),(340,12)])
    s+=back
    s+=f'<polygon points="{hx(170)}" fill="#fff" filter="url(#grain)"/>'
    s+=f'<polygon points="{hx(170)}" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="18" style="filter:blur(6px)"/>'
    s+='</g>'
    return s
def save(n, body):
    open(os.path.join(OUT,n+'.svg'),'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{DEFS}{body}</svg>')
def star(cx,cy,R,r,rot=-90): return ' '.join(f'{cx+(R if i%2==0 else r)*math.cos(math.radians(rot+36*i)):.1f},{cy+(R if i%2==0 else r)*math.sin(math.radians(rot+36*i)):.1f}' for i in range(10))

# 1. Бутса вырывается влево (как на референсе)
upper='M58 292 C36 288 30 266 52 254 C96 230 156 222 204 206 C236 198 256 190 276 184 C310 192 340 190 372 176 C390 200 398 240 392 280 L390 292 Z'
sole='M48 290 L392 288 L392 306 C300 318 140 318 62 312 C44 310 38 298 48 290 Z'
studs=''.join(f'<rect x="{x}" y="310" width="20" height="14" rx="3" fill="url(#copper)"/>' for x in (92,150,250,330))
laces=''.join(f'<path d="M{x} {y} l34 -6" stroke="#dce9ff" stroke-width="6" stroke-linecap="round" opacity=".85"/>' for x,y in [(190,214),(214,206),(238,198)])
swoosh='<path d="M120 270 C200 262 290 250 380 212 L384 236 C300 268 200 282 120 270 Z" fill="url(#copper)"/>'
boot=f'<g filter="url(#lift)"><path d="{upper}" fill="url(#steel)"/><path d="{sole}" fill="url(#copper)"/>{swoosh}{laces}{studs}<path d="M282 190 C316 198 344 196 370 184" stroke="#d6e6ff" stroke-width="5" opacity=".6" fill="none"/></g>'
save('A-boot', frame()+boot)

# 2. Старый кожаный мяч со шнуровкой, вылетает влево со шлейфом
trail=''.join(f'<path d="M300 {y-h} L{x} {y} L300 {y+h} Z" fill="url(#copper)" opacity="{o}"/>' for y,x,h,o in [(212,60,10,.75),(256,20,16,1),(300,64,10,.75)])
ball='<g filter="url(#lift)"><circle cx="316" cy="256" r="92" fill="url(#leather)"/>'
# классический мяч из панелей: кривые швы
ball+='<g stroke="#4a2410" stroke-width="5" fill="none" opacity=".8"><path d="M316 164 C290 210 290 300 316 348"/><path d="M316 164 C342 210 342 300 316 348"/><path d="M226 236 C262 222 370 222 406 236"/><path d="M226 278 C262 292 370 292 406 278"/></g>'
ball+=''.join(f'<path d="M{308} {220+k*12} l16 0" stroke="#f3dcc0" stroke-width="5" stroke-linecap="round"/>' for k in range(4))
ball+='<ellipse cx="282" cy="210" rx="30" ry="16" fill="#fff" opacity=".18" transform="rotate(-30 282 210)"/></g>'
save('B-ball', frame()+f'<g filter="url(#lift)">{trail}</g>'+ball)

# 3. Звезда с трещиной, залитой золотом (кинцуги: «забытые, но не сломанные»)
st=star(280,262,128,54,-90+8)
crack='M210 150 L246 206 L232 236 L276 270 L262 304 L300 350'
save('C-star', frame()+f'<g filter="url(#lift)"><polygon points="{st}" fill="url(#steel)"/><path d="{crack}" stroke="#0a1a3a" stroke-width="12" fill="none" stroke-linejoin="round"/><path d="{crack}" stroke="url(#gold)" stroke-width="6" fill="none" stroke-linejoin="round"/></g>')

# 4. Монограмма «ЗЛ» с засечками, гравировка
mono=('<text x="270" y="318" text-anchor="middle" font-family="Playfair Display, Georgia, serif" font-weight="900" font-size="190" letter-spacing="-6" fill="url(#gold)" filter="url(#lift)">ЗЛ</text>'
      '<path d="M150 344 L390 344" stroke="url(#copper)" stroke-width="5" filter="url(#lift)"/>'
      '<path d="M150 182 L390 182" stroke="url(#copper)" stroke-width="5" filter="url(#lift)"/>')
save('D-mono', frame()+mono)
print('ok')
