#!/usr/bin/env python3
# Parse SRTM1 HGT file and extract 30×30 km grid around Boquete, Panama
import struct, base64, sys

HGT_FILE = "/tmp/N08W083.hgt"
HGT_SIZE = 3601  # SRTM1: 3601×3601 pixels

CENTER_LAT, CENTER_LNG = 8.84, -82.42
HALF_KM = 15.0

with open(HGT_FILE, "rb") as f:
    raw = f.read()

# HGT file: 3601×3601 int16 big-endian, row 0 = north (9°N), col 0 = west (83°W)
# Each pixel is 1/3600 degrees ≈ 30m

# Convert to a 2D list for easier slicing
def get_elev(row, col):
    idx = (row * HGT_SIZE + col) * 2
    val = struct.unpack(">h", raw[idx:idx+2])[0]
    return val if val > -32768 else 0  # nodata → 0

# Grid bounds
center_row = int((9.0 - CENTER_LAT) * 3600)   # north edge is row 0
center_col = int((CENTER_LNG - (-83.0)) * 3600)  # west edge is col 0

# 30 km in pixels
pix_lat = int(HALF_KM / 30.0 * 3600 / 3600 * 111.0)  # ≈ 500 pixels per 15km
# Actually, 1 pixel ≈ 1/3600° ≈ 111.111/3600 ≈ 0.03086 km ≈ 30.86m
# 15 km / 0.03086 = 486 pixels
pix_half = int(HALF_KM / (111.0 / 3600))  # 15 / 0.03083 = 487

print(f"Center pixel: row={center_row}, col={center_col}", file=sys.stderr)
print(f"Half-size: {pix_half} pixels", file=sys.stderr)

r0 = max(0, center_row - pix_half)
r1 = min(HGT_SIZE - 1, center_row + pix_half)
c0 = max(0, center_col - pix_half)
c1 = min(HGT_SIZE - 1, center_col + pix_half)
rows_out = r1 - r0 + 1
cols_out = c1 - c0 + 1

print(f"Grid: rows {r0}-{r1} ({rows_out}), cols {c0}-{c1} ({cols_out})", file=sys.stderr)
print(f"Area: {rows_out * cols_out} points", file=sys.stderr)

# Extract grid
grid = []
for r in range(r0, r1 + 1):
    for c in range(c0, c1 + 1):
        idx = (r * HGT_SIZE + c) * 2
        val = struct.unpack(">h", raw[idx:idx+2])[0]
        grid.append(val if val > -32768 else 0)

# Verify: get elevation at center
center_val = get_elev(center_row, center_col)
print(f"Elevation at center ({CENTER_LAT}°N, {CENTER_LNG}°W): {center_val}m", file=sys.stderr)

# Encode as Int16Array (little-endian for JS)
binary = struct.pack(f"<{len(grid)}h", *grid)
b64 = base64.b64encode(binary).decode("ascii")

# Grid geo-reference
lat0 = 9.0 - r0 / 3600.0   # latitude of first row (north edge)
lng0 = -83.0 + c0 / 3600.0  # longitude of first column (west edge)
step_deg = 1.0 / 3600.0    # ~30m

js = f"""// Pre-computed elevation grid for Boquete, Panama ({CENTER_LAT}°N, {CENTER_LNG}°W)
// Area: {2*HALF_KM}×{2*HALF_KM} km, {rows_out}×{cols_out} pixels at ~30m resolution
// Source: SRTM1 (NASA), tile N08W083
const ELEV_GRID = (() => {{
    const raw = atob('{b64}');
    const buf = new ArrayBuffer(raw.length);
    const arr = new Uint8Array(buf);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return new Int16Array(buf);
}})();
const ELEV_GRID_COLS = {cols_out};
const ELEV_GRID_ROWS = {rows_out};
const ELEV_GRID_LAT0 = {lat0:.8f};   // north edge
const ELEV_GRID_LNG0 = {lng0:.8f};   // west edge
const ELEV_GRID_STEP = {step_deg:.10f};  // degrees per pixel (~30m)

function getElevationFromGrid(lat, lng) {{
    const r = (ELEV_GRID_LAT0 - lat) / ELEV_GRID_STEP;  // row increases southward
    const c = (lng - ELEV_GRID_LNG0) / ELEV_GRID_STEP;
    if (r < 0 || r >= ELEV_GRID_ROWS - 1 || c < 0 || c >= ELEV_GRID_COLS - 1) return null;
    const r0 = Math.floor(r), r1 = r0 + 1;
    const c0 = Math.floor(c), c1 = c0 + 1;
    const fr = r - r0, fc = c - c0;
    const v00 = ELEV_GRID[r0 * ELEV_GRID_COLS + c0];
    const v10 = ELEV_GRID[r1 * ELEV_GRID_COLS + c0];
    const v01 = ELEV_GRID[r0 * ELEV_GRID_COLS + c1];
    const v11 = ELEV_GRID[r1 * ELEV_GRID_COLS + c1];
    if (v00 <= -32768 || v10 <= -32768 || v01 <= -32768 || v11 <= -32768) return null;
    return (v00 * (1 - fr) + v10 * fr) * (1 - fc) + (v01 * (1 - fr) + v11 * fr) * fc;
}}
"""

with open("elevation_grid.js", "w") as f:
    f.write(js)

size_kb = len(binary) / 1024
print(f"Written elevation_grid.js ({size_kb:.0f} KB, {len(grid)} pixels)", file=sys.stderr)
print(f"Bounding box: {lat0:.5f}°N to {9.0 - r1/3600:.5f}°N, {lng0:.5f}°W to {-83.0 + c1/3600:.5f}°W", file=sys.stderr)
