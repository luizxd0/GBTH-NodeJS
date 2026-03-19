#!/usr/bin/env python3
"""
Build spritesheets from extracted avatar frame folders.

Example:
python tools/avatar_spritesheet.py --folders mb00000 mh00000
"""

from __future__ import annotations

import argparse
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


FRAME_RE = re.compile(r"^(?P<prefix>.+)_frame_(?P<index>\d+)\.png$", re.IGNORECASE)


@dataclass(frozen=True)
class FrameInfo:
    path: Path
    index: int
    width: int
    height: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pack avatar PNG frames into spritesheets.")
    parser.add_argument(
        "--folders",
        nargs="+",
        required=True,
        help="Folder names under input-root (or absolute folder paths).",
    )
    parser.add_argument(
        "--input-root",
        default="public/assets/shared/avatars",
        help="Root path containing avatar frame folders.",
    )
    parser.add_argument(
        "--output-root",
        default="public/assets/shared/avatar_sheets",
        help="Root output path for generated sheet files.",
    )
    parser.add_argument(
        "--columns",
        type=int,
        default=0,
        help="Fixed column count. 0 = auto (square-ish).",
    )
    parser.add_argument(
        "--padding",
        type=int,
        default=0,
        help="Padding in pixels between cells.",
    )
    parser.add_argument(
        "--align",
        choices=["topleft", "center"],
        default="topleft",
        help="How each frame is placed in its cell.",
    )
    return parser.parse_args()


def resolve_folder(folder_arg: str, input_root: Path) -> Path:
    candidate = Path(folder_arg)
    if candidate.is_dir():
        return candidate
    return input_root / folder_arg


def read_frames(folder: Path) -> list[FrameInfo]:
    frame_infos: list[FrameInfo] = []

    for path in sorted(folder.glob("*.png")):
        match = FRAME_RE.match(path.name)
        if not match:
            continue

        with Image.open(path) as image:
            width, height = image.size

        frame_infos.append(
            FrameInfo(
                path=path,
                index=int(match.group("index")),
                width=width,
                height=height,
            )
        )

    frame_infos.sort(key=lambda info: info.index)
    return frame_infos


def compute_grid(frame_count: int, columns: int) -> tuple[int, int]:
    if frame_count <= 0:
        return 0, 0
    if columns and columns > 0:
        cols = columns
    else:
        cols = math.ceil(math.sqrt(frame_count))
    rows = math.ceil(frame_count / cols)
    return cols, rows


def pack_folder(
    folder: Path,
    output_root: Path,
    columns: int,
    padding: int,
    align: str,
) -> tuple[Path, Path]:
    frames = read_frames(folder)
    if not frames:
        raise RuntimeError(f"No frame PNGs found in {folder}")

    cols, rows = compute_grid(len(frames), columns)
    max_w = max(frame.width for frame in frames)
    max_h = max(frame.height for frame in frames)

    sheet_w = cols * max_w + max(0, cols - 1) * padding
    sheet_h = rows * max_h + max(0, rows - 1) * padding

    sheet = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))
    metadata_frames = []

    for i, frame in enumerate(frames):
        col = i % cols
        row = i // cols
        cell_x = col * (max_w + padding)
        cell_y = row * (max_h + padding)

        if align == "center":
            draw_x = cell_x + (max_w - frame.width) // 2
            draw_y = cell_y + (max_h - frame.height) // 2
        else:
            draw_x = cell_x
            draw_y = cell_y

        with Image.open(frame.path).convert("RGBA") as image:
            sheet.alpha_composite(image, (draw_x, draw_y))

        metadata_frames.append(
            {
                "frame": frame.index,
                "x": draw_x,
                "y": draw_y,
                "w": frame.width,
                "h": frame.height,
                "source": frame.path.name,
            }
        )

    folder_name = folder.name
    out_dir = output_root / folder_name
    out_dir.mkdir(parents=True, exist_ok=True)

    sheet_path = out_dir / f"{folder_name}_sheet.png"
    meta_path = out_dir / f"{folder_name}_sheet.json"
    sheet.save(sheet_path, format="PNG")

    metadata = {
        "folder": folder_name,
        "sheet": sheet_path.name,
        "frame_count": len(frames),
        "columns": cols,
        "rows": rows,
        "cell": {"width": max_w, "height": max_h, "padding": padding, "align": align},
        "sheet_size": {"width": sheet_w, "height": sheet_h},
        "frames": metadata_frames,
    }
    meta_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    return sheet_path, meta_path


def main() -> int:
    args = parse_args()
    input_root = Path(args.input_root)
    output_root = Path(args.output_root)

    generated = []
    for folder_arg in args.folders:
        folder = resolve_folder(folder_arg, input_root)
        if not folder.is_dir():
            raise RuntimeError(f"Folder not found: {folder}")
        sheet_path, meta_path = pack_folder(
            folder=folder,
            output_root=output_root,
            columns=args.columns,
            padding=args.padding,
            align=args.align,
        )
        generated.append((sheet_path, meta_path))

    for sheet_path, meta_path in generated:
        print(f"Generated: {sheet_path}")
        print(f"Generated: {meta_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
