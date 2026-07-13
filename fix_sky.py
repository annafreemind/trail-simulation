# Fix daytime sky: add slight warmth to prevent unnatural blue
import re

with open('sky_colors.js', 'r') as f:
    content = f.read()

def fix_daytime(m):
    elev = int(m.group(1))
    t = [int(x) for x in m.group(2).split(',')]
    h = [int(x) for x in m.group(3).split(',')]
    
    if elev >= 15:
        # add slight red to top to prevent "deep blue void" look
        if t[2] > 200 and t[0] < 40:
            t[0] = min(int(t[2] * 0.12), t[0] + int((t[2]-t[0])*0.08))
        # ensure minimum warmth
        if t[0] < 15 and t[2] > 150:
            t[0] = 15
    
    return f"  {{ e: {elev}, t: [{t[0]},{t[1]},{t[2]}], h: [{h[0]},{h[1]},{h[2]}] }},"

content = re.sub(
    r'e:\s*(-?\d+),?\s*t:\s*\[(\d+),(\d+),(\d+)\],?\s*h:\s*\[(\d+),(\d+),(\d+)\]',
    fix_daytime,
    content
)

with open('sky_colors.js', 'w') as f:
    f.write(content)

print('Adjusted daytime sky colors')