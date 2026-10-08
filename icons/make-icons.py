import zlib, struct, math, os

W_BG=(11,10,22)

def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))

def png(path, size):
    W=H=size
    px=[[(0,0,0,0) for _ in range(W)] for _ in range(H)]
    R=int(W*0.227)
    def in_rr(x,y):
        w=h=W-1; r=R
        return (r<=x<=w-r) or (r<=y<=h-r) or \
               ((x-r)**2+(y-r)**2<=r*r) or ((x-(w-r))**2+(y-r)**2<=r*r) or \
               ((x-r)**2+(y-(h-r))**2<=r*r) or ((x-(w-r))**2+(y-(h-r))**2<=r*r)
    # الخلفية
    for y in range(H):
        for x in range(W):
            if in_rr(x,y): px[y][x]=W_BG+(255,)
    # القوس الذهبي
    cx=W/2.0
    aw=W*0.552; ah_top=H*0.145; ah_bot=H*0.82
    ar=aw/2.0; acy=ah_top+ar
    for y in range(int(ah_top)-1, int(ah_bot)+2):
        for x in range(int(cx-ar)-1, int(cx+ar)+2):
            inside = (y>=acy and abs(x-cx)<=ar and y<=ah_bot) or ((x-cx)**2+(y-acy)**2<=ar*ar)
            if not inside: continue
            t=(y-ah_top)/(ah_bot-ah_top)
            if t<0.55: col=lerp((255,215,106),(240,180,41),t/0.55)
            else: col=lerp((240,180,41),(224,99,47),(t-0.55)/0.45)
            if 0<=x<W and 0<=y<H: px[y][x]=col+(255,)
    # التجويف الداخلي
    iw=aw*0.845; ir=iw/2.0; itop=ah_top+H*0.058; icy=itop+ir
    for y in range(int(itop)-1, int(ah_bot)):
        for x in range(int(cx-ir)-1, int(cx+ir)+2):
            inside = (y>=icy and abs(x-cx)<=ir) or ((x-cx)**2+(y-icy)**2<=ir*ir)
            if inside and 0<=x<W and 0<=y<H: px[y][x]=W_BG+(255,)
    # النور في القلب
    ccx, ccy = cx, H*0.485
    glow_r = W*0.235; core_r = W*0.098
    for y in range(H):
        for x in range(W):
            d=math.hypot(x-ccx,y-ccy)
            if d<=core_r: px[y][x]=(255,253,245,255)
            elif d<=glow_r:
                t=(d-core_r)/(glow_r-core_r)
                col=lerp((255,240,190),(240,180,41),t)
                base=px[y][x][:3]
                a=max(0.0,1.0-t*t)
                px[y][x]=lerp(base,col,a)+(255,)
    # أشعة
    ray_len=W*0.30; ray_w=max(1,int(W*0.030))
    for ang in range(0,360,45):
        a=math.radians(ang)
        for d in range(int(W*0.145), int(W*0.145+ray_len)):
            for off in range(-ray_w, ray_w+1):
                x=int(ccx+math.cos(a)*d - math.sin(a)*off)
                y=int(ccy+math.sin(a)*d + math.cos(a)*off)
                if 0<=x<W and 0<=y<H and px[y][x][:3]==W_BG:
                    tt=(d-W*0.145)/ray_len
                    col=lerp((255,215,106),(240,180,41),tt)
                    px[y][x]=col+(255,)
    raw=b''.join(b'\x00'+b''.join(struct.pack('4B',*px[y][x]) for x in range(W)) for y in range(H))
    def chunk(t,d):
        c=struct.pack('>I',len(d))+t+d
        return c+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    out=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',W,H,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path,'wb').write(out)
    print('wrote', path, len(out), 'bytes')

base=os.path.join(os.path.dirname(os.path.abspath(__file__)))
png(os.path.join(base,'icon-192.png'),192)
png(os.path.join(base,'icon-512.png'),512)

# أيقونات تطبيق أندرويد
ANDROID = os.path.join(os.path.dirname(base), 'android', 'res')
for dens, size in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
    png(os.path.join(ANDROID, 'mipmap-' + dens, 'ic_launcher.png'), size)
