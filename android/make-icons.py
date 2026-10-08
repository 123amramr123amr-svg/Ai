import zlib, struct, math, os

def png(path, size):
    W=H=size
    px=[[(0,0,0,0) for _ in range(W)] for _ in range(H)]
    def rr(x,y,w,h,r):
        return (x>=r and x<=w-r and 0<=y<=h) or (y>=r and y<=h-r and 0<=x<=w) or \
               ((x-r)**2+(y-r)**2<=r*r) or ((x-(w-r))**2+(y-r)**2<=r*r) or \
               ((x-r)**2+(y-(h-r))**2<=r*r) or ((x-(w-r))**2+(y-(h-r))**2<=r*r)
    R=int(W*0.22)
    for y in range(H):
        for x in range(W):
            if rr(x,y,W-1,H-1,R): px[y][x]=(11,16,32,255)
    m=int(W*0.10); iw=W-2*m; ih=H-2*m; R2=int(iw*0.24)
    for y in range(m,H-m):
        for x in range(m,W-m):
            if not rr(x-m,y-m,iw-1,ih-1,R2): continue
            t=(x-m+y-m)/float(iw+ih)
            if t<0.5: u=t/0.5; a=(91,140,255); b=(138,91,255)
            else: u=(t-0.5)/0.5; a=(138,91,255); b=(34,211,166)
            px[y][x]=tuple(int(a[i]+(b[i]-a[i])*u) for i in range(3))+(255,)
    cy=int(H*0.46); cx=W//2; r=max(1,int(W*0.045)); gap=int(W*0.145)
    for k in (-1,0,1):
        for y in range(cy-r-1, cy+r+2):
            for x in range(cx+k*gap-r-1, cx+k*gap+r+2):
                if 0<=x<W and 0<=y<H and (x-cx-k*gap)**2+(y-cy)**2<=r*r:
                    px[y][x]=(11,16,32,255)
    acx, acy = W//2, int(H*0.52); ar=int(W*0.20); th=max(1,int(W*0.022))
    for ang in range(25,156):
        a=math.radians(ang)
        for d in range(-th, th+1):
            x=int(acx+math.cos(a)*(ar+d)); y=int(acy+math.sin(a)*(ar+d))
            if 0<=x<W and 0<=y<H: px[y][x]=(11,16,32,255)
    raw=b''.join(b'\x00'+b''.join(struct.pack('4B',*px[y][x]) for x in range(W)) for y in range(H))
    def chunk(t,d):
        c=struct.pack('>I',len(d))+t+d
        return c+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    out=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',W,H,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path,'wb').write(out)
    print('wrote', path)

base = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'res')
for dens, size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    png(os.path.join(base, 'mipmap-'+dens, 'ic_launcher.png'), size)
