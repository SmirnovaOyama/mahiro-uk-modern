# Makes public/favicon.png: the avatar cropped to a circle whose edge passes
# exactly through both cat-ear tips.
#
# Usage: python3 scripts/favicon_ears.py <original avatar> public/favicon.png <preview.png>
# Needs Pillow. The ear-tip seed points and boxes below are measured on the
# original 640 × 640 avatar, not the smaller public/avatar.jpg.
#
# For a centre (cx, cy), each ear's "tip" is its outline pixel farthest from
# the centre; cx is solved so both ears reach the same distance, which is the
# radius. The centre whose circle overflows the picture least is chosen; the
# sliver outside is filled with a mirror of the background beside it.
import sys, math
from PIL import Image, ImageDraw

SRC, OUT, PREVIEW = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(SRC).convert('RGB')
W, H = im.size
grey = im.convert('L')

def outline(seed, box, dark=140):
    # The ear's own outline only: the dark line grown outward from a point on
    # its tip, so stray strokes in the crayon background never count.
    seen, todo, out = set(), [seed], []
    while todo:
        x, y = todo.pop()
        if (x, y) in seen or not (box[0] <= x < box[2] and box[1] <= y < box[3]) or grey.getpixel((x, y)) >= dark:
            continue
        seen.add((x, y))
        out.append((x + 0.5, y + 0.5))
        todo += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1), (x + 1, y + 1), (x - 1, y - 1), (x + 1, y - 1), (x - 1, y + 1)]
    return out

def darkest_near(x0, y0):
    return min(((x, y) for x in range(x0 - 4, x0 + 5) for y in range(y0 - 2, y0 + 5)), key=lambda p: grey.getpixel(p))

# Each ear's outline joins the head's, so the trace is kept to a box around that ear.
left_ear = outline(darkest_near(131, 74), (95, 55, 205, 170))
right_ear = outline(darkest_near(537, 82), (465, 55, 580, 170))
print('ear outline pixels', len(left_ear), len(right_ear))

def reach(points, cx, cy):
    return max(math.hypot(x - cx, y - cy) for x, y in points)

def balance(cy):
    lo, hi = 250.0, 420.0
    for _ in range(60):
        mid = (lo + hi) / 2
        # The left ear reaching farther means the centre is too far right.
        if reach(left_ear, mid, cy) > reach(right_ear, mid, cy):
            hi = mid
        else:
            lo = mid
    cx = (lo + hi) / 2
    return cx, reach(left_ear, cx, cy)

# The two tips are so far apart that no circle through both fits wholly inside
# the picture; choose the centre that overflows it least, and fill the sliver
# outside with a mirror of the crayon background beside it.
best = None
cy = 200.0
while cy <= 420.0:
    cx, r = balance(cy)
    over = max(r - cx, r - cy, cx + r - W, cy + r - H, 0)
    if best is None or over < best[3]:
        best = (cx, cy, r, over)
    cy += 0.5
print(f'overflow past the picture: {best[3]:.1f}px')
cx, cy, r, _ = best
lt = max(left_ear, key=lambda p: math.hypot(p[0] - cx, p[1] - cy))
rt = max(right_ear, key=lambda p: math.hypot(p[0] - cx, p[1] - cy))
print(f'centre ({cx:.1f}, {cy:.1f}) radius {r:.1f}; left tip {lt}, right tip {rt}')

def crop(size):
    scale = 8
    box = (cx - r, cy - r, cx + r, cy + r)
    big = size * scale
    pad = 64
    framed = Image.new('RGB', (W + 2 * pad, H + 2 * pad))
    flip_h, flip_v = im.transpose(Image.FLIP_LEFT_RIGHT), im.transpose(Image.FLIP_TOP_BOTTOM)
    flip_both = flip_h.transpose(Image.FLIP_TOP_BOTTOM)
    for ox, oy, tile in [(0, 0, im), (-W, 0, flip_h), (W, 0, flip_h), (0, -H, flip_v), (0, H, flip_v),
                         (-W, -H, flip_both), (W, -H, flip_both), (-W, H, flip_both), (W, H, flip_both)]:
        framed.paste(tile, (pad + ox, pad + oy))
    shifted = tuple(round(v) + pad for v in box)
    img = framed.crop(shifted).resize((big, big), Image.LANCZOS).convert('RGBA')
    mask = Image.new('L', (big, big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big - 1, big - 1), fill=255)
    img.putalpha(mask)
    return img.resize((size, size), Image.LANCZOS)

crop(64).save(OUT, optimize=True)

# A large preview with the circle drawn and the two tips marked, for checking by eye.
pv = crop(512)
d = ImageDraw.Draw(pv)
d.ellipse((0, 0, 511, 511), outline=(0, 170, 0, 255), width=1)
for x, y in (lt, rt):
    px, py = (x - (cx - r)) / (2 * r) * 512, (y - (cy - r)) / (2 * r) * 512
    d.ellipse((px - 4, py - 4, px + 4, py + 4), outline=(255, 0, 0, 255), width=2)
pv.save(PREVIEW)
