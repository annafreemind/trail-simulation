# Generates pre-graded lighting keyframes of the trail photo for the sun view widget.
# Realistic dusk/night: tone curve (shadows die first, sky holes persist),
# Purkinje shift (blue-gray night vision), desaturation, slight blur at night.
# Usage: python3 make_keyframes.py

from PIL import Image, ImageEnhance, ImageFilter

SRC = 'images/trail.jpg'
MAX_W = 800

# name, brightness, gamma, saturation, white-balance (r,g,b), blur radius
KEYFRAMES = [
    # bright day — original look
    ('kf_day',    1.00, 1.00, 1.00, (1.00, 1.00, 1.00), 0),
    # sun low (~20 deg) — softer, slightly warm
    ('kf_low',    0.80, 1.05, 1.00, (1.04, 1.00, 0.94), 0),
    # golden hour (~8 deg) — warm gold, shadows deepen
    ('kf_golden', 0.55, 1.18, 0.95, (1.12, 1.00, 0.80), 0),
    # sunset (~0 deg) — orange, dark, crushed shadows
    ('kf_sunset', 0.34, 1.38, 0.85, (1.18, 0.95, 0.72), 0),
    # civil twilight (~-4 deg) — blue-gray, highlights only
    ('kf_civil',  0.16, 1.60, 0.45, (0.80, 0.90, 1.20), 1),
    # nautical dusk (~-8 deg) — dark blue, sky holes still visible
    ('kf_dusk',   0.07, 1.85, 0.30, (0.65, 0.80, 1.30), 2),
    # night (~-14 deg) — near black, faint blue glimmers
    ('kf_night',  0.028, 2.10, 0.15, (0.55, 0.75, 1.40), 3),
]


def grade(img, brightness, gamma, saturation, wb, blur):
    out = ImageEnhance.Color(img).enhance(saturation)

    luts = []
    for c in range(3):
        lut = []
        for v in range(256):
            x = v / 255.0
            y = (x ** gamma) * brightness * wb[c]
            lut.append(max(0, min(255, round(y * 255))))
        luts.append(lut)
    out = out.point(luts[0] + luts[1] + luts[2])

    if blur > 0:
        out = out.filter(ImageFilter.GaussianBlur(blur))
    return out


img = Image.open(SRC).convert('RGB')
if img.width > MAX_W:
    img = img.resize((MAX_W, round(img.height * MAX_W / img.width)), Image.LANCZOS)

for name, brightness, gamma, saturation, wb, blur in KEYFRAMES:
    graded = grade(img, brightness, gamma, saturation, wb, blur)
    graded.save(f'images/{name}.jpg', quality=82)
    print(f'{name}.jpg')
