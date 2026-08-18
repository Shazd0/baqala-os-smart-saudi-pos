"""Write a 256x256 Windows ICO (Baqala green bag mark) with no extra deps."""
from __future__ import annotations

import struct
from pathlib import Path

SIZE = 256
# Colors: sage bg, green bag, gold stripe
BG = (243, 245, 242, 255)
GREEN = (30, 107, 72, 255)
GOLD = (196, 163, 90, 255)
WHITE = (255, 255, 255, 255)
PALE = (231, 238, 233, 255)


def rounded_rect(px, x0, y0, x1, y1, r, color):
    for y in range(max(0, y0), min(SIZE, y1)):
        for x in range(max(0, x0), min(SIZE, x1)):
            # distance to nearest inner corner
            cx = x0 + r if x < x0 + r else (x1 - r - 1 if x >= x1 - r else x)
            cy = y0 + r if y < y0 + r else (y1 - r - 1 if y >= y1 - r else y)
            if x < x0 + r or x >= x1 - r or y < y0 + r or y >= y1 - r:
                dx, dy = x - cx, y - cy
                if dx * dx + dy * dy > r * r:
                    continue
            px[y][x] = color


def build_pixels():
    px = [[BG for _ in range(SIZE)] for _ in range(SIZE)]
    rounded_rect(px, 0, 0, SIZE, SIZE, 58, BG)
    rounded_rect(px, 20, 20, 236, 236, 52, GREEN)
    rounded_rect(px, 59, 107, 197, 198, 20, WHITE)
    rounded_rect(px, 48, 88, 208, 123, 14, GOLD)
    rounded_rect(px, 118, 134, 138, 191, 5, GREEN)
    rounded_rect(px, 74, 124, 110, 152, 5, PALE)
    rounded_rect(px, 146, 124, 182, 152, 5, PALE)
    return px


def rgba_to_bgra_bmp(px):
    # 32-bit BMP, bottom-up, BI_BITFIELDS optional; ICO uses top-down XOR + AND mask
    row_bytes = SIZE * 4
    xor = bytearray()
    for y in range(SIZE - 1, -1, -1):  # bottom-up
        for x in range(SIZE):
            r, g, b, a = px[y][x]
            xor += struct.pack("<BBBB", b, g, r, a)
    # AND mask: 1-bit, padded to 32-bit rows
    and_row = ((SIZE + 31) // 32) * 4
    and_mask = bytes(and_row * SIZE)
    return bytes(xor), and_mask


def write_ico(path: Path):
    px = build_pixels()
    xor, and_mask = rgba_to_bgra_bmp(px)
    dib_header = struct.pack(
        "<IiiHHIIiiII",
        40,          # header size
        SIZE,        # width
        SIZE * 2,    # height includes AND mask
        1,           # planes
        32,          # bit count
        0,           # compression BI_RGB
        len(xor) + len(and_mask),
        0, 0, 0, 0,
    )
    image = dib_header + xor + and_mask
    offset = 6 + 16  # ICONDIR + one ICONDIRENTRY
    icondir = struct.pack("<HHH", 0, 1, 1)
    entry = struct.pack(
        "<BBBBHHII",
        0,  # 0 means 256
        0,
        0,
        0,
        1,
        32,
        len(image),
        offset,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(icondir + entry + image)
    print(f"Wrote {path} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    write_ico(root / "public" / "favicon.ico")
    write_ico(root / "build" / "icon.ico")
