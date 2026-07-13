# Ensure minimum 30 in R channel for natural-looking sky
import re

with open('sky_colors.js', 'r') as f:
    content = f.read()

def fix(m):
    elev = int(m.group(1))
    t = [int(m.group(2)), int(m.group(3)), int(m.group(4))]
    h = [int(m.group(5)), int(m.group(6)), int(m.group(7))]
    # set minimum R to 30 for elev > 25 (daytime)
    if elev >= 25:
        t[0] = max(t[0], 30)
        h[0] = max(h[0], 30)
    return f"  {{ e: {elev}, t: [{t[0]},{t[1]},{t[2]}], h: [{h[0]},{h[1]},{h[2]}] }},"

content = re.sub(
    r'e:\s*(-?\d+),?\s*t:\s*\[(\d+),(\d+),(\d+)\],?\s*h:\s*\[(\d+),(\d+),(\d+)\]',
    fix,
    content
)

with open('sky_colors.js', 'w') as f:
    f.write(content)

print('R channel minimum 30 applied')