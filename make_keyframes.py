# Generates pre-graded lighting keyframes using YCbCr luminance channel,
# proper Kelvin-based color temperature tint, and realistic grain at night.
# Usage: python3 make_keyframes.py

from PIL import Image, ImageFilter
import numpy as np

SRC = 'images/trail.jpg'
MAX_W = 800

# (name, kelvin, brightness, gamma, blur, grain_strength)
KEYFRAMES = [
    ('kf_day',    6500,  1.000,  1.00, 0,   0),
    ('kf_low',    5500,  0.80,   1.05, 0,   0),
    ('kf_golden', 3800,  0.55,   1.15, 0,   0),
    ('kf_sunset', 2800,  0.34,   1.30, 0,   0),
    ('kf_civil',  7500,  0.16,   1.50, 1,   5),
    ('kf_dusk',   9000,  0.07,   1.70, 2,  12),
    ('kf_night', 12000,  0.028,  2.00, 3,  25),
]


def kelvin_to_rgb(temp):
    """Approximate Planckian blackbody curve → RGB multipliers (0..1)."""
    temp = max(1000, min(40000, temp))
    if temp <= 6600:
        r = 255.0
        g = 99.4708025861 * np.log(temp / 100 - 2) - 161.1195681661
    else:
        r = 329.698727446 * ((temp / 100 - 60) ** -0.1332047592)
        g = 288.1221695283 * ((temp / 100 - 60) ** -0.0755148492)
    if temp >= 6600:
        b = 255.0
    elif temp <= 1900:
        b = 0.0
    else:
        b = 138.5177312231 * np.log(temp / 100 - 10) - 305.0447927307
    return np.clip(np.array([r, g, b]) / 255.0, 0, 1)


NEUTRAL_RGB = kelvin_to_rgb(6500)


def apply_tint(rgb_arr, kelvin):
    """Multiply RGB by the tint ratio relative to D65 neutral."""
    tint = kelvin_to_rgb(kelvin) / NEUTRAL_RGB
    out = rgb_arr.astype(np.float32) * tint.reshape(1, 1, 3)
    return np.clip(out, 0, 255).astype(np.uint8)


def add_luma_grain(y_arr, strength):
    """Random noise on luma channel only."""
    noise = np.random.randint(-strength, strength + 1, y_arr.shape, dtype=np.int16)
    return np.clip(y_arr.astype(np.int16) + noise, 0, 255).astype(np.uint8)


img = Image.open(SRC).convert('RGB')
if img.width > MAX_W:
    img = img.resize((MAX_W, round(img.height * MAX_W / img.width)), Image.LANCZOS)

img_ycc = img.convert('YCbCr')
ycc_arr = np.array(img_ycc, dtype=np.float32)

for name, kelvin, brightness, gamma, blur, grain in KEYFRAMES:
    out_ycc = ycc_arr.copy()

    # Gamma + brightness on Y (luma) channel only — shadows die first
    y = out_ycc[:, :, 0] / 255.0
    y = (y ** gamma) * brightness
    y = (y / y.max()) * 255.0 if y.max() > 0 else y * 255.0
    out_ycc[:, :, 0] = np.clip(y, 0, 255)

    # Back to RGB
    out = Image.fromarray(out_ycc.astype(np.uint8), 'YCbCr').convert('RGB')

    # Kelvin-based tint on RGB
    rgb_arr = np.array(out, dtype=np.uint8)
    rgb_arr = apply_tint(rgb_arr, kelvin)

    # Blur
    if blur > 0:
        rgb_arr = np.array(Image.fromarray(rgb_arr).filter(ImageFilter.GaussianBlur(blur)))

    # Grain on luma only (extract Y, add noise, put back)
    if grain > 0:
        y_grain = np.array(Image.fromarray(rgb_arr).convert('YCbCr'), dtype=np.uint8)[:, :, 0]
        y_grain = add_luma_grain(y_grain, grain)
        rgb_ycc = np.array(Image.fromarray(rgb_arr).convert('YCbCr'))
        rgb_ycc[:, :, 0] = y_grain
        rgb_arr = np.array(Image.fromarray(rgb_ycc, 'YCbCr').convert('RGB'))

    Image.fromarray(rgb_arr).save(f'images/{name}.jpg', quality=85)
    print(f'images/{name}.jpg')