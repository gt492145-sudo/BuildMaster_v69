#!/usr/bin/env python3
"""Emit favicon-32.png and test-blueprint-1..15.png (simple contrast for edge detection).

Run from repo root: python3 scripts/generate-test-blueprint-pngs.py
"""
from __future__ import annotations

import os
import struct
import zlib

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))


def _png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    chunk = struct.pack("!I", len(data)) + chunk_type + data
    crc = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
    return chunk + struct.pack("!I", crc)


def write_png_rgb(path: str, width: int, height: int, rgb_at) -> None:
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            r, g, b = rgb_at(x, y)
            raw.extend((r, g, b))
    compressed = zlib.compress(bytes(raw), 9)
    out = bytearray(b"\x89PNG\r\n\x1a\n")
    out.extend(_png_chunk(b"IHDR", struct.pack("!IIBBBBB", width, height, 8, 2, 0, 0, 0)))
    out.extend(_png_chunk(b"IDAT", compressed))
    out.extend(_png_chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(out)


def main() -> None:
    # Favicon: simple "B" tone blocks
    def fav_px(x: int, y: int) -> tuple[int, int, int]:
        if 6 <= x <= 25 and 6 <= y <= 25:
            return (120, 200, 255)
        return (15, 28, 48)

    fav_path = os.path.join(ROOT, "favicon-32.png")
    if not os.path.isfile(fav_path):
        write_png_rgb(fav_path, 32, 32, fav_px)
        print("wrote", fav_path)

    for n in range(1, 16):
        out = os.path.join(ROOT, f"test-blueprint-{n}.png")
        if os.path.isfile(out):
            continue
        pad = 32 + (n % 5) * 14
        bg = (40 + (n % 7) * 4, 48 + (n % 3) * 5, 52 + (n % 5) * 3)

        def make_rgb(index: int, pad_px: int, background: tuple[int, int, int]):
            def rgb_at(x: int, y: int) -> tuple[int, int, int]:
                if pad_px <= x < 640 - pad_px and pad_px <= y < 480 - pad_px:
                    c = 230 - (index % 6) * 6
                    return (c, max(0, c - 15), max(0, c - 8))
                return background

            return rgb_at

        write_png_rgb(out, 640, 480, make_rgb(n, pad, bg))
        print("wrote", out)

    fixdir = os.path.join(ROOT, "server", "fixtures")
    os.makedirs(fixdir, exist_ok=True)
    fix_path = os.path.join(fixdir, "test-blueprint-placeholder.png")
    pad_f = 40
    bg_f = (50, 55, 60)

    def rgb_fix(x: int, y: int) -> tuple[int, int, int]:
        if pad_f <= x < 640 - pad_f and pad_f <= y < 480 - pad_f:
            return (228, 218, 220)
        return bg_f

    write_png_rgb(fix_path, 640, 480, rgb_fix)
    print("wrote", fix_path)


if __name__ == "__main__":
    main()
