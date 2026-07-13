# Generate sky colors using skylight + CIE xyY with proper gamut clamping.
# Usage: python3 sky_gen.py > sky_colors.js

from skylight.sky import AnalyticalSky, Sun
import numpy as np

def direction(z, a):
    zr = np.radians(z); ar = np.radians(a)
    return np.array([np.sin(zr)*np.cos(ar), np.sin(zr)*np.sin(ar), np.cos(zr)])

# CIE 1931 2° 380-780nm 5nm (81 values)
cw = np.arange(380, 785, 5, dtype=float)
cx = np.array([0.001368,0.002236,0.004243,0.007650,0.014310,0.023190,0.043510,0.077630,0.134380,0.214770,0.283900,0.328500,0.348280,0.348060,0.336200,0.318700,0.290800,0.251100,0.195360,0.142100,0.095640,0.058010,0.032010,0.014700,0.004900,0.002400,0.009300,0.029100,0.063270,0.109600,0.165500,0.225750,0.290400,0.359700,0.433450,0.512050,0.594500,0.678400,0.762100,0.842500,0.916300,0.978600,1.026300,1.056700,1.062200,1.045600,1.002600,0.938400,0.854450,0.751400,0.642400,0.541900,0.447900,0.360800,0.283500,0.218700,0.164900,0.121200,0.087400,0.063600,0.046770,0.032900,0.022700,0.015840,0.011359,0.008111,0.005790,0.004109,0.002899,0.002049,0.001440,0.001000,0.000690,0.000476,0.000332,0.000235,0.000166,0.000117,0.000083,0.000059,0.000042])
cy = np.array([0.000039,0.000064,0.000120,0.000217,0.000396,0.000640,0.001210,0.002180,0.004000,0.007300,0.011600,0.016840,0.023000,0.029800,0.038000,0.048000,0.060000,0.073900,0.090980,0.112600,0.139020,0.169300,0.208020,0.258600,0.323000,0.407300,0.503000,0.608200,0.710000,0.793200,0.862000,0.914850,0.954000,0.980300,0.994950,1.000000,0.995000,0.978600,0.952000,0.915400,0.870000,0.816300,0.757000,0.694900,0.631000,0.566800,0.503000,0.441200,0.381000,0.321000,0.265000,0.217000,0.175000,0.138200,0.107000,0.081600,0.061000,0.044580,0.032000,0.023200,0.017000,0.011920,0.008210,0.005723,0.004102,0.002929,0.002091,0.001484,0.001047,0.000740,0.000520,0.000361,0.000249,0.000172,0.000120,0.000085,0.000060,0.000042,0.000030,0.000021,0.000015])
cz = np.array([0.006450,0.010550,0.020050,0.036210,0.067850,0.110200,0.207400,0.371300,0.645600,1.039050,1.385600,1.622960,1.747060,1.782600,1.772110,1.744100,1.669200,1.528100,1.287640,1.041900,0.812950,0.616200,0.465180,0.353300,0.272000,0.212300,0.158200,0.111700,0.078250,0.057250,0.042160,0.029840,0.020300,0.013400,0.008750,0.005750,0.003900,0.002750,0.002100,0.001800,0.001650,0.001400,0.001100,0.001000,0.000800,0.000600,0.000340,0.000240,0.000190,0.000100,0.000050,0.000030,0.000020,0.000010,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000])

from scipy.interpolate import interp1d

def spectrum_to_chromaticity(wls, rad):
    f = interp1d(wls, rad, kind='linear', bounds_error=False, fill_value=0)
    ri = f(cw); dw = 5
    X = np.sum(ri*cx*dw); Y = np.sum(ri*cy*dw); Z = np.sum(ri*cz*dw)
    t = X+Y+Z
    return (0.3127, 0.3290) if t <= 0 else (X/t, Y/t)

def xyY_to_srgb_clamped(x, y, Y):
    """xyY to sRGB with gamut clamping (linear RGB capped to 0-1)."""
    if Y <= 0 or y <= 0: return (0,0,0)
    X = x * Y / y
    Z = (1-x-y) * Y / y
    r = 3.2404542*X - 1.5371385*Y - 0.4985314*Z
    g = -0.9692660*X + 1.8760108*Y + 0.0415560*Z
    b = 0.0556434*X - 0.2040259*Y + 1.0572252*Z
    # gamut clamp: desaturate toward white if out of range
    mn = min(r, g, b)
    if mn < 0:
        # shift toward neutral until all channels >= 0
        # simpler: clamp and renormalize (lose saturation)
        r = max(0, r); g = max(0, g); b = max(0, b)
    mx = max(r, g, b)
    if mx > 1:
        scale = 0.85 / mx  # slightly reduce to avoid harsh clipping
        r *= scale; g *= scale; b *= scale
    def gam(c):
        if c <= 0.0031308: return 12.92*c
        return 1.055*c**(1/2.4)-0.055
    return (gam(r), gam(g), gam(b))

def sky_Y(elev):
    if elev >= 50: return 1.0
    if elev >= 10: return 0.5 + 0.5*(elev-10)/40
    if elev >= 0:  return 0.15 + 0.35*elev/10
    if elev >= -6: return 0.03 + 0.12*(elev+6)/6
    return 0.01

print("// Sky: Hos\u011bk-Wilkie (skylight) + CIE xyY, gamut-clamped")
print("// Boquete, Panama (8.84309, -82.42467), April 1 2014")
print("const skyColorTable = [")

for elev in range(-12, 51):
    z = max(0.1, min(90, 90 - elev))
    a = 180
    sun = Sun(); sun.theta = np.radians(z); sun.phi = np.radians(a)
    sky = AnalyticalSky(sun.theta, sun.phi, degrees=False)
    views = np.array([direction(0,0), direction(85,a)])
    result = sky(views)
    rad = result.sky_radiance; wls = result.wavelengths
    xt, yt = spectrum_to_chromaticity(wls, rad[:,0])
    xh, yh = spectrum_to_chromaticity(wls, rad[:,1])
    Y = sky_Y(elev)
    r1,g1,b1 = [int(c*255) for c in xyY_to_srgb_clamped(xt, yt, Y)]
    r2,g2,b2 = [int(c*255) for c in xyY_to_srgb_clamped(xh, yh, Y)]
    print(f"  {{ e: {elev}, t: [{r1},{g1},{b1}], h: [{r2},{g2},{b2}] }},")

print("];")