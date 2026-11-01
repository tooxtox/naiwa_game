"""Pack the AI sheet with frame metadata only; never modify the source PNG pixels.
Run manually after replacing artwork; the game ships the resulting JSON and needs no Python.
"""
from pathlib import Path
import json
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = root / 'public/assets/hero/hero-atlas-v1.png'
image = Image.open(source).convert('RGBA')
alpha = image.getchannel('A')
width, height = image.size
# Generation has generous, slightly irregular row gutters; split through the empty gaps.
row_cuts = [0, 305, 608, 910, height]
frames = {}
for row in range(4):
    for col in range(4):
        left, right = col * width // 4, (col + 1) * width // 4
        top, bottom = row_cuts[row], row_cuts[row + 1]
        core = alpha.crop((left, top, right, bottom)).point(lambda value: 255 if value >= 128 else 0).getbbox()
        if not core:
            raise ValueError(f'Empty character cell {row}:{col}')
        x = max(left, left + core[0] - 4)
        y = max(top, top + core[1] - 4)
        x2 = min(right, left + core[2] + 4)
        y2 = min(bottom, top + core[3] + 4)
        w, h = x2 - x, y2 - y
        source_x = round(160 - ((left + right) / 2 - x))
        source_y = 304 - h
        if source_x < 0 or source_x + w > 320 or source_y < 0:
            raise ValueError(f'Frame {row}:{col} exceeds the virtual canvas')
        frames[str(row * 4 + col)] = {
            'frame': {'x': x, 'y': y, 'w': w, 'h': h},
            'rotated': False, 'trimmed': True,
            'spriteSourceSize': {'x': source_x, 'y': source_y, 'w': w, 'h': h},
            'sourceSize': {'w': 320, 'h': 320},
        }
output = source.with_suffix('.json')
output.write_text(json.dumps({'frames': frames, 'meta': {
    'app': 'LUMENFALL metadata packer', 'image': source.name,
    'format': 'RGBA8888', 'size': {'w': width, 'h': height}, 'scale': '1',
    'directions': ['south', 'east (west is mirrored)', 'north', 'windup / strike / dash / hurt'],
}}, ensure_ascii=False, indent=2) + '\n')
print(f'Wrote {len(frames)} aligned frames to {output.relative_to(root)}; source PNG unchanged.')
