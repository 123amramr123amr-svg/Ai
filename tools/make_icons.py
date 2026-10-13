#!/usr/bin/env python3
"""يولّد أيقونات التطبيق (192 و 512) بصيغة PNG باستخدام المكتبة القياسية فقط."""
import zlib, struct, math, os

def png(path, size):
    cx, cy = size / 2.0, size / 2.0
    r_outer = size * 0.46
    # رأس الروبوت
    hw, hh = size * 0.30, size * 0.26
    hx0, hx1 = cx - hw, cx + hw
    hy0, hy1 = cy - hh + size * 0.03, cy + hh + size * 0.03
    radius = size * 0.09

    rows = []
    for y in range(size):
        row = bytearray()
        row.append(0)
        for x in range(size):
            fx, fy = x + 0.5, y + 0.5
            dx, dy = fx - cx, fy - cy
            d = math.hypot(dx, dy)
            # خلفية: تدرّج قطري أزرق/بنفسجي
            t = (dx + dy) / (2.0 * size) + 0.5
            t = min(1.0, max(0.0, t))
            br = int(0x6c + (0x8b - 0x6c) * t * 1.4)
            bg = int(0x8c + (0x5c - 0x8c) * t * 1.4)
            bb = int(0xff + (0xf6 - 0xff) * t * 1.4)
            br, bg, bb = min(br, 255), min(bg, 255), min(bb, 255)

            # تدرّج داخل دائرة
            if d < r_outer:
                k = 1.0 - (d / r_outer) * 0.55
                r = int(0x14 + (br - 0x14) * k)
                g = int(0x1a + (bg - 0x1a) * k)
                b = int(0x36 + (bb - 0x36) * k)
            else:
                r, g, b = 0x0b, 0x10, 0x20

            # رأس الروبوت (مستطيل بزوايا دائرية)
            if hx0 <= fx <= hx1 and hy0 <= fy <= hy1:
                inside = True
                for px, py in ((hx0 + radius, hy0 + radius), (hx1 - radius, hy0 + radius),
                               (hx0 + radius, hy1 - radius), (hx1 - radius, hy1 - radius)):
                    if (fx < hx0 + radius and fy < hy0 + radius) or \
                       (fx > hx1 - radius and fy < hy0 + radius) or \
                       (fx < hx0 + radius and fy > hy1 - radius) or \
                       (fx > hx1 - radius and fy > hy1 - radius):
                        if math.hypot(fx - px, fy - py) > radius:
                            inside = False
                if inside:
                    r, g, b = 0xf2, 0xf5, 0xff

            # العينان
            eye_r = size * 0.045
            for ex in (cx - hw * 0.5, cx + hw * 0.5):
                if math.hypot(fx - ex, fy - (cy + size * 0.03)) < eye_r:
                    r, g, b = 0x2b, 0x36, 0x6b

            # الهوائي
            if math.hypot(fx - cx, fy - (hy0 - size * 0.05)) < size * 0.028:
                r, g, b = 0x6c, 0x8c, 0xff
            if abs(fx - cx) < size * 0.012 and hy0 - size * 0.05 < fy < hy0:
                r, g, b = 0x8b, 0x5c, 0xf6
            row += bytes((r, g, b))
        rows.append(bytes(row))

    raw = b''.join(rows)
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    out = b'\x89PNG\r\n\x1a\n'
    out += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    out += chunk(b'IDAT', zlib.compress(raw, 9))
    out += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(out)
    print('wrote', path, os.path.getsize(path), 'bytes')

if __name__ == '__main__':
    base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'icons')
    os.makedirs(base, exist_ok=True)
    png(os.path.join(base, 'icon-192.png'), 192)
    png(os.path.join(base, 'icon-512.png'), 512)
