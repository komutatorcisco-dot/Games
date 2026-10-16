import numpy as np, glob, os, json
from PIL import Image
from scipy import ndimage as ndi
D='../dz/img/'
MAP={'Аукцион_ золотой молоток и мяч':'auction','15_49_00':'ng-connect','15_49_07':'pick','15_49_14':'transfer','15_49_21':'ng-timemachine','15_49_50':'ng-context',
'15_49_56':'fc','15_50_35':'ng-lineup','15_50_48':'sort','15_50_55':'ng-treble','15_51_01':'club','15_51_08':'ng-whoami','15_51_15':'hl','15_51_21':'ng-numhist','15_51_27':'pipes',
'Угадай сборную по клубам':'nation','Футбольный WORDLE — игровая кнопка':'ng-wordle','Этого или того_ против бота':'pick-duo'}
os.makedirs('out',exist_ok=True); cols={}
for f in sorted(glob.glob(D+'*.png')):
    key=next(v for k,v in MAP.items() if k in f)
    im=np.asarray(Image.open(f).convert('RGBA')).astype(np.float32)
    rgb=im[...,:3]; H,W=rgb.shape[:2]
    a=im[...,3]
    # границы плитки по альфе
    ys,xs=np.where(a>200); y0,y1,x0,x1=ys.min(),ys.max(),xs.min(),xs.max()
    # разделитель: светлая горизонтальная линия в нижней половине
    cx0,cx1=x0+int((x1-x0)*.3),x0+int((x1-x0)*.7)
    lum=rgb[...,:3].mean(2)
    rowl=lum[:,cx0:cx1].mean(1)
    # фон: строки по краям плитки
    lx=slice(x0+60,x0+110); rx=slice(x1-110,x1-60)
    bgrow=np.median(np.concatenate([rgb[:,lx],rgb[:,rx]],1),1)  # H x 3
    dist=np.sqrt(((rgb-bgrow[:,None,:])**2).sum(2))
    # найдём разделитель: строка в диапазоне 55%-72% высоты, где dist по центру стабильно ~ серый
    ry=range(y0+int((y1-y0)*.45),y0+int((y1-y0)*.8))
    sp=slice(x0+int((x1-x0)*.25),x1-int((x1-x0)*.25))
    ydiv=None
    for y in ry:
        d=dist[y,sp]
        if ((d>12)&(d<110)).mean()>0.92 and d.std()<18: ydiv=y; break
    assert ydiv, key
    top=y0+72; bot=ydiv-14; L=x0+72; R=x1-72
    core=np.zeros((H,W),bool); core[top:bot,L:R]=dist[top:bot,L:R]>40
    core=ndi.binary_opening(core,iterations=1)
    lab,n=ndi.label(core); sizes=ndi.sum(core,lab,range(1,n+1))
    sl=ndi.find_objects(lab)
    good=[i+1 for i,(sz,b) in enumerate(zip(sizes,sl)) if sz>150 and not ((b[0].start<=top+45 or b[1].start<=L+45 or b[1].stop>=R-45) and min(b[0].stop-b[0].start,b[1].stop-b[1].start)<60)]
    keep=np.isin(lab,good)
    keep=ndi.binary_fill_holes(ndi.binary_closing(keep,iterations=3))
    band=ndi.binary_dilation(keep,iterations=11)
    out=np.zeros((H,W,4),np.float32)
    o=rgb.copy()
    ring=band&~keep
    o[ring]=np.minimum(o[ring],[14,18,30])  # обводка
    out[...,:3]=o; out[...,3]=band*255
    # мягкий край
    al=ndi.gaussian_filter(band.astype(np.float32),1.2)*255
    out[...,3]=al
    ys2,xs2=np.where(band); by0,by1,bx0,bx1=ys2.min(),ys2.max(),xs2.min(),xs2.max()
    crop=out[by0:by1+1,bx0:bx1+1]
    s=max(crop.shape[:2])+20; can=np.zeros((s,s,4),np.float32)
    oy=(s-crop.shape[0])//2; ox=(s-crop.shape[1])//2; can[oy:oy+crop.shape[0],ox:ox+crop.shape[1]]=crop
    img=Image.fromarray(can.clip(0,255).astype(np.uint8),'RGBA').resize((256,256),Image.LANCZOS)
    img.save(f'out/{key}.png')
    c1=bgrow[y0+150].tolist(); c2=bgrow[ydiv+60].tolist()
    cols[key]=['#%02x%02x%02x'%tuple(int(v) for v in c1),'#%02x%02x%02x'%tuple(int(v) for v in c2)]
    print(key,ydiv,cols[key])
json.dump(cols,open('cols.json','w'),ensure_ascii=False,indent=0)
