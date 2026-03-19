#!/usr/bin/env python3
"""
Extract all GunBound `.img` frames (unpacked from `graphics.xfs`) into PNG files.

This decoder fixes the common quality bug where pure black pixels were forced
to transparent. For ARGB4444 (format 2), alpha is now read from the source
pixel as intended.

Typical usage:
  python tools/extract_graphics_xfs.py --img-root C:/tools/xfs2 --output-root public/assets/shared/client_graphics

Optional unpack attempt:
  python tools/extract_graphics_xfs.py --graphics-xfs C:/Users/ldpeb/Downloads/GBClassic/graphics.xfs --try-unpack
"""

from __future__ import annotations

import argparse
import json
import re
import struct
import subprocess
import sys
from array import array
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image


HEADER_META_STRUCT = struct.Struct("<HHIIIIIIIII")
FRAME_META_SIZE = 40
MAX_DIMENSION = 8192
MAX_DATA_SIZE = 64 * 1024 * 1024


@dataclass
class FrameMeta:
    frame: int
    format: int
    width: int
    height: int
    center_x: int
    center_y: int
    data_size: int
    output: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Decode GunBound IMG frames to PNG with correct alpha handling."
    )
    parser.add_argument(
        "--graphics-xfs",
        default="C:/Users/ldpeb/Downloads/GBClassic/graphics.xfs",
        help="Path to graphics.xfs (used when --try-unpack is enabled).",
    )
    parser.add_argument(
        "--xfs-unpacker",
        default="C:/tools/XFS2_English.exe",
        help="Path to XFS unpacker executable (used when --try-unpack is enabled).",
    )
    parser.add_argument(
        "--img-root",
        default="C:/tools/xfs2",
        help="Directory containing unpacked .img files.",
    )
    parser.add_argument(
        "--output-root",
        default="public/assets/shared/client_graphics",
        help="Directory where decoded PNG frames are written.",
    )
    parser.add_argument(
        "--metadata-path",
        default="public/assets/shared/client_graphics/graphics_metadata.json",
        help="Path to metadata JSON output.",
    )
    parser.add_argument(
        "--match",
        default="",
        help="Optional regex applied to IMG stem (for targeted extraction).",
    )
    parser.add_argument(
        "--max-files",
        type=int,
        default=0,
        help="Optional max number of IMG files to process (0 = all).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing frame PNG files.",
    )
    parser.add_argument(
        "--try-unpack",
        action="store_true",
        help="Attempt to unpack graphics.xfs using the configured unpacker if img-root has no .img files.",
    )
    return parser.parse_args()


def rgb565_to_rgba(value: int) -> tuple[int, int, int, int]:
    b = (value & 0x1F) * 255 // 31
    g = ((value >> 5) & 0x3F) * 255 // 63
    r = ((value >> 11) & 0x1F) * 255 // 31
    return (r, g, b, 255)


def argb4444_to_rgba(value: int) -> tuple[int, int, int, int]:
    b = (value & 0x0F) * 17
    g = ((value >> 4) & 0x0F) * 17
    r = ((value >> 8) & 0x0F) * 17
    a = ((value >> 12) & 0x0F) * 17
    return (r, g, b, a)


def decode_format_0_rgb565(data_words: array, width: int, height: int) -> Image.Image:
    pixel_count = width * height
    pixels = [rgb565_to_rgba(data_words[i]) for i in range(min(pixel_count, len(data_words)))]
    if len(pixels) < pixel_count:
        pixels.extend([(0, 0, 0, 0)] * (pixel_count - len(pixels)))
    image = Image.new("RGBA", (width, height))
    image.putdata(pixels)
    return image


def decode_format_2_argb4444(data_words: array, width: int, height: int) -> Image.Image:
    pixel_count = width * height
    pixels = [argb4444_to_rgba(data_words[i]) for i in range(min(pixel_count, len(data_words)))]
    if len(pixels) < pixel_count:
        pixels.extend([(0, 0, 0, 0)] * (pixel_count - len(pixels)))
    image = Image.new("RGBA", (width, height))
    image.putdata(pixels)
    return image


def decode_format_1_rle_rgb565(data_words: array, width: int, height: int) -> Image.Image:
    pixels = [(0, 0, 0, 0)] * (width * height)
    idx = 0

    for y in range(height):
        if idx + 2 > len(data_words):
            break
        _row_marker = data_words[idx]
        idx += 1
        block_count = data_words[idx]
        idx += 1
        x = 0

        for _ in range(block_count):
            if idx + 2 > len(data_words):
                break
            offset_x = data_words[idx]
            idx += 1
            run_len = data_words[idx]
            idx += 1
            x = max(x, min(offset_x, width))

            for _ in range(run_len):
                if idx >= len(data_words):
                    break
                val = data_words[idx]
                idx += 1
                if x < width:
                    pixels[y * width + x] = rgb565_to_rgba(val)
                x += 1

    image = Image.new("RGBA", (width, height))
    image.putdata(pixels)
    return image


def decode_frame(fmt: int, payload: bytes, width: int, height: int) -> Image.Image | None:
    words = array("H")
    words.frombytes(payload[: len(payload) // 2 * 2])

    if fmt == 0:
        return decode_format_0_rgb565(words, width, height)
    if fmt == 1:
        return decode_format_1_rle_rgb565(words, width, height)
    if fmt == 2:
        return decode_format_2_argb4444(words, width, height)
    return None


def run_unpack_attempts(xfs_unpacker: Path, graphics_xfs: Path, img_root: Path) -> bool:
    if not xfs_unpacker.is_file():
        return False
    if not graphics_xfs.is_file():
        return False

    img_root.mkdir(parents=True, exist_ok=True)
    candidates = [
        [str(xfs_unpacker), "e", str(graphics_xfs), str(img_root)],
        [str(xfs_unpacker), "/e", str(graphics_xfs), str(img_root)],
        [str(xfs_unpacker), "-e", str(graphics_xfs), str(img_root)],
        [str(xfs_unpacker), str(graphics_xfs), str(img_root)],
    ]

    for cmd in candidates:
        try:
            subprocess.run(
                cmd,
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=20,
            )
        except Exception:
            continue
        if any(img_root.glob("*.img")):
            return True
    return False


def decode_img_file(
    img_path: Path,
    output_root: Path,
    overwrite: bool,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    issues: list[dict[str, Any]] = []
    file_id = img_path.stem
    file_output_dir = output_root / file_id
    file_output_dir.mkdir(parents=True, exist_ok=True)

    format_counts: Counter[int] = Counter()
    frame_rows: list[FrameMeta] = []

    with img_path.open("rb") as f:
        file_header = f.read(8)
        if len(file_header) < 8:
            raise RuntimeError(f"Invalid IMG header: {img_path}")
        frame_count = struct.unpack("<I", file_header[4:8])[0]
        if frame_count > 1_000_000:
            raise RuntimeError(f"Suspicious frame_count={frame_count} in {img_path}")

        for frame_index in range(frame_count):
            raw_meta = f.read(FRAME_META_SIZE)
            if len(raw_meta) < FRAME_META_SIZE:
                issues.append(
                    {
                        "type": "short_meta",
                        "frame": frame_index,
                        "message": "Frame metadata truncated.",
                    }
                )
                break

            (
                k1,
                _i2,
                width,
                height,
                center_x,
                center_y,
                _k3,
                _i4,
                _j4,
                _k4,
                data_size,
            ) = HEADER_META_STRUCT.unpack(raw_meta)

            fmt = k1 & 0xFF
            format_counts[fmt] += 1
            frame_name = f"{file_id}_frame_{frame_index}.png"
            output_rel = f"{file_id}/{frame_name}"
            output_abs = file_output_dir / frame_name

            if (
                width <= 0
                or height <= 0
                or width > MAX_DIMENSION
                or height > MAX_DIMENSION
                or data_size < 0
                or data_size > MAX_DATA_SIZE
            ):
                f.seek(max(0, data_size), 1)
                issues.append(
                    {
                        "type": "invalid_dimensions_or_size",
                        "frame": frame_index,
                        "format": fmt,
                        "width": width,
                        "height": height,
                        "data_size": data_size,
                    }
                )
                continue

            payload = f.read(data_size)
            if len(payload) < data_size:
                issues.append(
                    {
                        "type": "short_payload",
                        "frame": frame_index,
                        "format": fmt,
                        "expected": data_size,
                        "actual": len(payload),
                    }
                )
                break

            image = decode_frame(fmt, payload, width, height)
            if image is None:
                issues.append(
                    {
                        "type": "unsupported_format",
                        "frame": frame_index,
                        "format": fmt,
                        "k1": k1,
                    }
                )
                continue

            if overwrite or not output_abs.exists():
                image.save(output_abs, format="PNG")

            frame_rows.append(
                FrameMeta(
                    frame=frame_index,
                    format=fmt,
                    width=width,
                    height=height,
                    center_x=center_x,
                    center_y=center_y,
                    data_size=data_size,
                    output=output_rel.replace("\\", "/"),
                )
            )

    entry = {
        "id": file_id,
        "source": img_path.name,
        "frame_count": len(frame_rows),
        "format_counts": {str(k): v for k, v in sorted(format_counts.items())},
        "indexes": [row.frame for row in frame_rows],
        "anchors": [{"x": row.center_x, "y": row.center_y} for row in frame_rows],
        "frames": [
            {
                "frame": row.frame,
                "format": row.format,
                "w": row.width,
                "h": row.height,
                "file": row.output,
            }
            for row in frame_rows
        ],
    }
    return entry, issues


def write_metadata(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "{",
        f'  "format": {json.dumps(payload["format"])},',
        f'  "generated_at_utc": {json.dumps(payload["generated_at_utc"])},',
        f'  "source": {json.dumps(payload["source"], separators=(",", ":"))},',
        '  "files": [',
    ]
    files = payload.get("files", [])
    for i, row in enumerate(files):
        suffix = "," if i < len(files) - 1 else ""
        lines.append(f"    {json.dumps(row, separators=(',', ':'))}{suffix}")
    lines.extend(
        [
            "  ],",
            f'  "issues": {json.dumps(payload.get("issues", []), separators=(",", ":"))}',
            "}",
            "",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    args = parse_args()
    graphics_xfs = Path(args.graphics_xfs)
    xfs_unpacker = Path(args.xfs_unpacker)
    img_root = Path(args.img_root)
    output_root = Path(args.output_root)
    metadata_path = Path(args.metadata_path)

    if args.try_unpack and not any(img_root.glob("*.img")):
        run_unpack_attempts(xfs_unpacker, graphics_xfs, img_root)

    img_files = sorted(img_root.glob("*.img"))
    if not img_files:
        raise RuntimeError(
            f"No .img files found in: {img_root}\n"
            "Unpack graphics.xfs first (for example with XFS2_English.exe), or run with --try-unpack."
        )

    matcher = re.compile(args.match) if args.match else None
    filtered = []
    for img_path in img_files:
        if matcher and not matcher.search(img_path.stem):
            continue
        filtered.append(img_path)
    if args.max_files > 0:
        filtered = filtered[: args.max_files]

    if not filtered:
        raise RuntimeError("No IMG files matched current filters.")

    file_rows: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []

    output_root.mkdir(parents=True, exist_ok=True)

    for i, img_path in enumerate(filtered, 1):
        try:
            row, file_issues = decode_img_file(
                img_path=img_path,
                output_root=output_root,
                overwrite=args.overwrite,
            )
            file_rows.append(row)
            for issue in file_issues:
                issues.append({"file": img_path.name, **issue})
            print(f"[{i}/{len(filtered)}] decoded {img_path.name} -> {row['frame_count']} frames")
        except Exception as exc:
            issues.append(
                {
                    "file": img_path.name,
                    "type": "decode_error",
                    "message": str(exc),
                }
            )
            print(f"[{i}/{len(filtered)}] failed  {img_path.name}: {exc}")

    payload = {
        "format": "gb_graphics_frames_v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source": {
            "graphics_xfs": str(graphics_xfs).replace("\\", "/"),
            "img_root": str(img_root).replace("\\", "/"),
            "output_root": str(output_root).replace("\\", "/"),
            "total_img_files_in_root": len(img_files),
            "processed_img_files": len(filtered),
        },
        "files": sorted(file_rows, key=lambda row: row["id"]),
        "issues": issues,
    }
    write_metadata(metadata_path, payload)

    print(f"Decoded IMG files: {len(file_rows)}")
    print(f"Issues: {len(issues)}")
    print(f"Metadata: {metadata_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        raise SystemExit(130)
