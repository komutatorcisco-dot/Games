import sys,glob,os;from PIL import Image,ImageDraw,ImageFont
S=sys.argv[1];out=sys.argv[2];FE=sys.argv[3] if len(sys.argv)>3 else S+'/fe'
def src(name):
  fs=glob.glob(f'{FE}/assets/{name}/3D/*.png')+glob.glob(f'{FE}/assets/{name}/Default/3D/*.png')
  if not fs: raise SystemExit('miss '+name)
  return Image.open(fs[0]).convert('RGBA')
rows=[l.split(' ',2) for l in open(__file__.rsplit('/',1)[0]+'/map.txt').read().splitlines() if l.strip()]
os.makedirs(out+'/games',exist_ok=True);os.makedirs(out+'/ui2',exist_ok=True)
sw=src('Crossed swords')
for kind,key,spec in rows:
  name,*fl=spec.split('|')
  im=src(name).resize((192,192),Image.LANCZOS)
  c=Image.new('RGBA',(192,192));c.paste(im.resize((172,172),Image.LANCZOS),(10,10))
  if 'duel' in fl:
    c=Image.new('RGBA',(192,192));c.paste(im.resize((150,150),Image.LANCZOS),(4,4))
    b=sw.resize((86,86),Image.LANCZOS);c.alpha_composite(b,(104,104))
  c.save(f"{out}/{'games' if kind=='g' else 'ui2'}/{key}.webp",quality=90,method=6)
# лист-превью
c=110;n=12;f=ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-Bold.otf',11)
sheet=Image.new('RGB',(n*c,((len(rows)+n-1)//n)*(c+14)),(20,22,30));d=ImageDraw.Draw(sheet)
for i,(kind,key,_) in enumerate(rows):
  t=Image.open(f"{out}/{'games' if kind=='g' else 'ui2'}/{key}.webp").convert('RGBA').resize((c-16,c-16))
  x,y=i%n*c,i//n*(c+14);sheet.paste(t,(x+8,y+4),t);d.text((x+c/2,y+c+4),key,fill=(170,180,200),font=f,anchor='mm')
sheet.save(f'{S}/fluent_all.png')
