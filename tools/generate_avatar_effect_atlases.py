#!/usr/bin/env python3
"""
Generate sprite atlases for EX background/foreground effect folders.

Input folders are expected to look like:
  C:/tools/client_graphics/b204850/b204850_frame_0.png
  C:/tools/client_graphics/f204851/f204851_frame_0.png

Outputs:
1) One atlas PNG per effect folder under output-root.
2) effect_metadata.json with DragonBound-style atlas entries.
"""

from __future__ import annotations

import argparse
import json
import re
import struct
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image


EFFECT_FOLDER_RE = re.compile(r"^[sS]?[bfBF]\d{6}$")
FRAME_FILE_RE = re.compile(r"^(?P<folder>[sS]?[bfBF]\d{6})_frame_(?P<index>\d+)\.png$")
FRAME_META_STRUCT = struct.Struct("<HHIIIIIIIII")
FRAME_META_STRUCT_SIGNED = struct.Struct("<HHIIiiIIIII")
FRAME_META_SIZE = 40


@dataclass(frozen=True)
class FrameInfo:
    index: int
    path: Path
    width: int
    height: int
    center_x: int
    center_y: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build sprite atlases for avatar effects.")
    parser.add_argument(
        "--input-root",
        default="C:/tools/client_graphics",
        help="Folder containing b*/f*/sb*/sf* effect folders.",
    )
    parser.add_argument(
        "--img-root",
        default="C:/tools/xfs2",
        help="Folder containing source .img files used to derive frame timing hints.",
    )
    parser.add_argument(
        "--output-root",
        default="public/assets/shared/avatar_effect_sheets",
        help="Destination directory for generated atlas PNG files.",
    )
    parser.add_argument(
        "--metadata-output",
        default="public/assets/shared/avatar_effect_sheets/effect_metadata.json",
        help="Output metadata JSON path.",
    )
    parser.add_argument(
        "--folders",
        nargs="+",
        default=[],
        help="Optional folder names to process. If omitted, all b*/f* effect folders are processed.",
    )
    parser.add_argument(
        "--graphics-metadata",
        default="",
        help="Optional graphics_metadata.json path with per-frame anchor metadata.",
    )
    return parser.parse_args()


def to_public_url(path: Path) -> str:
    normalized = str(path).replace("\\", "/")
    marker = "/public/"
    idx = normalized.lower().find(marker)
    if idx != -1:
        return normalized[idx + len(marker) - 1 :]
    marker2 = "public/"
    idx2 = normalized.lower().find(marker2)
    if idx2 != -1:
        return "/" + normalized[idx2 + len(marker2) :]
    return normalized


def compress_graphics(graphics: list[list[int]]) -> list[Any]:
    compressed: list[Any] = []
    previous: list[int] | None = None
    repeats = 0

    for frame in graphics:
        if previous is not None and frame == previous:
            repeats += 1
            continue

        if repeats > 0:
            compressed.append(repeats)
            repeats = 0

        compressed.append(frame)
        previous = frame

    if repeats > 0:
        compressed.append(repeats)

    return compressed


def normalize_signed_32(value: int) -> int:
    parsed = int(value)
    if parsed >= 0x80000000:
        parsed -= 0x100000000
    return parsed


def list_target_folders(input_root: Path, explicit: list[str]) -> list[str]:
    if explicit:
        out = []
        for folder in explicit:
            name = str(folder).strip()
            if not EFFECT_FOLDER_RE.match(name):
                continue
            out.append(name)
        return sorted(dict.fromkeys(out))

    out = []
    for child in input_root.iterdir():
        if not child.is_dir():
            continue
        if EFFECT_FOLDER_RE.match(child.name):
            out.append(child.name)
    return sorted(out)


def read_frames(
    folder_path: Path,
    frame_anchor_map: dict[int, tuple[int, int]],
) -> list[FrameInfo]:
    frames: list[FrameInfo] = []
    for image_path in folder_path.glob("*.png"):
        match = FRAME_FILE_RE.match(image_path.name)
        if not match:
            continue
        if match.group("folder").lower() != folder_path.name.lower():
            continue
        index = int(match.group("index"))
        with Image.open(image_path) as image:
            width, height = image.size
        center_x, center_y = frame_anchor_map.get(index, (0, 0))
        frames.append(
            FrameInfo(
                index=index,
                path=image_path,
                width=width,
                height=height,
                center_x=center_x,
                center_y=center_y,
            )
        )

    frames.sort(key=lambda frame: frame.index)
    return frames


def load_effect_anchor_maps(
    input_root: Path,
    graphics_metadata_path: Path | None,
) -> dict[str, dict[int, tuple[int, int]]]:
    candidates: list[Path] = []
    if graphics_metadata_path is not None:
        candidates.append(graphics_metadata_path)
    candidates.append(input_root / "graphics_metadata.json")
    selected_path = None
    for path in candidates:
        if path and path.is_file():
            selected_path = path
            break
    if selected_path is None:
        return {}

    try:
        payload = json.loads(selected_path.read_text(encoding="utf-8"))
    except Exception:
        return {}

    out: dict[str, dict[int, tuple[int, int]]] = {}
    for row in payload.get("files", []):
        file_id = str(row.get("id") or "").strip().lower()
        if not EFFECT_FOLDER_RE.match(file_id):
            continue
        anchors = list(row.get("anchors") or [])
        indexes = list(row.get("indexes") or [])
        if not indexes and anchors:
            indexes = list(range(len(anchors)))
        frame_map: dict[int, tuple[int, int]] = {}
        for idx_position, frame_index in enumerate(indexes):
            try:
                frame_key = int(frame_index)
            except Exception:
                continue
            anchor = anchors[idx_position] if idx_position < len(anchors) else {}
            try:
                raw_x = int(anchor.get("x", 0))
            except Exception:
                raw_x = 0
            try:
                raw_y = int(anchor.get("y", 0))
            except Exception:
                raw_y = 0
            frame_map[frame_key] = (normalize_signed_32(raw_x), normalize_signed_32(raw_y))
        out[file_id] = frame_map
    return out


def read_effect_first_frame_meta(effect_id: str, img_root: Path) -> dict[str, int] | None:
    img_path = img_root / f"{effect_id}.img"
    if not img_path.is_file():
        return None

    try:
        with img_path.open("rb") as f:
            header = f.read(8)
            if len(header) < 8:
                return None
            frame_count = struct.unpack("<I", header[4:8])[0]
            if frame_count <= 0:
                return None

            raw_meta = f.read(FRAME_META_SIZE)
            if len(raw_meta) < FRAME_META_SIZE:
                return None

            (_k1, i2, width, height, *_rest_u) = FRAME_META_STRUCT.unpack(raw_meta)
            (_k1s, _i2s, _ws, _hs, offset_x, offset_y, *_rest_s) = FRAME_META_STRUCT_SIGNED.unpack(raw_meta)
            # Reverse-engineered timing hint from IMG frame meta.
            # Low byte maps closely to EX effect pacing in the original client.
            delay_ms = int(i2) & 0xFF
            if delay_ms <= 0:
                delay_ms = 256

            if not (-1024 <= int(offset_x) <= 1024):
                offset_x = 0
            if not (-1024 <= int(offset_y) <= 1024):
                offset_y = 0

            return {
                "frame_duration_ms": int(delay_ms),
                "frame_width": int(width),
                "frame_height": int(height),
                "offset_x": int(offset_x),
                "offset_y": int(offset_y),
            }
    except Exception:
        return None


def build_folder_atlas(
    folder_path: Path,
    output_root: Path,
    img_root: Path,
    effect_anchor_maps: dict[str, dict[int, tuple[int, int]]],
) -> dict[str, Any]:
    frames = read_frames(folder_path, effect_anchor_maps.get(folder_path.name.lower(), {}))
    if not frames:
        raise RuntimeError(f"No frame PNGs found in folder: {folder_path}")

    total_width = 0
    max_height = 0
    graphics: list[list[int]] = []
    images: list[Image.Image] = []

    for i, frame in enumerate(frames):
        image = Image.open(frame.path).convert("RGBA")
        images.append(image)
        total_width += frame.width
        if i > 0:
            total_width += 1
        max_height = max(max_height, frame.height)
        graphics.append([frame.width, frame.height, frame.center_x, frame.center_y, 0, 0])

    atlas = Image.new("RGBA", (total_width, max_height), (0, 0, 0, 0))
    x_cursor = 0
    for image in images:
        atlas.alpha_composite(image, (x_cursor, 0))
        x_cursor += image.width + 1
        image.close()

    output_root.mkdir(parents=True, exist_ok=True)
    atlas_path = output_root / f"{folder_path.name.lower()}.png"
    atlas.save(atlas_path, format="PNG")

    first_meta = read_effect_first_frame_meta(folder_path.name.lower(), img_root) or {}

    return {
        "id": folder_path.name.lower(),
        "image": to_public_url(atlas_path),
        "g": compress_graphics(graphics),
        "frame_count": len(frames),
        "atlas_size": {"w": total_width, "h": max_height},
        "frame_duration_ms": first_meta.get("frame_duration_ms"),
        "offset_x": int(first_meta.get("offset_x", 0)),
        "offset_y": int(first_meta.get("offset_y", 0)),
    }


def main() -> int:
    args = parse_args()
    input_root = Path(args.input_root)
    img_root = Path(args.img_root)
    output_root = Path(args.output_root)
    metadata_output = Path(args.metadata_output)
    graphics_metadata_path = Path(args.graphics_metadata) if str(args.graphics_metadata or "").strip() else None

    if not input_root.is_dir():
        raise RuntimeError(f"Input root not found: {input_root}")

    effect_anchor_maps = load_effect_anchor_maps(input_root, graphics_metadata_path)

    folders = list_target_folders(input_root, list(args.folders or []))
    if not folders:
        raise RuntimeError("No effect folders selected.")

    generated: list[dict[str, Any]] = []
    for folder in folders:
        folder_path = input_root / folder
        if not folder_path.is_dir():
            continue
        entry = build_folder_atlas(folder_path, output_root, img_root, effect_anchor_maps)
        generated.append(entry)
        print(f"Generated atlas: {entry['image']} ({entry['frame_count']} frames)")

    generated.sort(key=lambda row: row["id"])
    metadata = {
        "version": 1,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_root": str(input_root).replace("\\", "/"),
        "atlases": {
            row["id"]: {
                "image": row["image"],
                "x": 0,
                "y": 0,
                "g": row["g"],
                "atlas_size": row["atlas_size"],
                "frame_duration_ms": row.get("frame_duration_ms"),
                "offset_x": int(row.get("offset_x", 0)),
                "offset_y": int(row.get("offset_y", 0)),
            }
            for row in generated
        },
    }

    metadata_output.parent.mkdir(parents=True, exist_ok=True)
    metadata_output.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print(f"Metadata updated: {metadata_output}")
    print(f"Atlas count: {len(generated)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
