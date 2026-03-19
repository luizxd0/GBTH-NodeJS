#!/usr/bin/env python3
"""
Generate DragonBound-style avatar atlases.

Outputs:
1) One atlas PNG per avatar folder.
2) One shared metadata JSON with DragonBound-like avatar entries:
   { filename, type, graphics }

Example:
python tools/generate_dragonbound_atlases.py --folders mb00000 mh00000 mg00001 mf00001
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build DragonBound-format avatar atlases and metadata.")
    parser.add_argument(
        "--folders",
        nargs="+",
        required=True,
        help="Avatar folders to convert (for example: mb00000 mh00000).",
    )
    parser.add_argument(
        "--input-root",
        default="public/assets/shared/avatars",
        help="Root folder containing extracted avatar folders and manifest.json.",
    )
    parser.add_argument(
        "--manifest",
        default="",
        help="Path to manifest JSON (default: <input-root>/manifest.json).",
    )
    parser.add_argument(
        "--output-image-dir",
        default="public/assets/shared/avatar_sheets/dragonbound_gen",
        help="Output directory for atlas PNG files.",
    )
    parser.add_argument(
        "--output-metadata",
        default="public/assets/shared/avatar_sheets/avatar_atlas_registry.json",
        help="Output JSON metadata file path.",
    )
    return parser.parse_args()


def infer_avatar_type(folder: str) -> str:
    # DragonBound avatar types: h, b, g, f, 1, 2, x
    if len(folder) >= 2:
        t = folder[1].lower()
        if t in {"h", "b", "g", "f"}:
            return t
    return "x"


def compress_graphics(graphics: list[list[int]]) -> list[Any]:
    # DragonBound compression: when a frame repeats consecutively, append a number N
    # meaning "repeat previous frame N times".
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


def build_atlas_for_folder(
    folder: str,
    input_root: Path,
    output_image_dir: Path,
    manifest_folders: dict[str, Any],
) -> dict[str, Any]:
    folder_path = input_root / folder
    if not folder_path.is_dir():
        raise FileNotFoundError(f"Missing avatar folder: {folder_path}")

    folder_info = manifest_folders.get(folder)
    if not folder_info:
        raise KeyError(f"Folder not found in manifest: {folder}")

    indexes = folder_info.get("indexes") or []
    anchors = folder_info.get("anchors") or []
    if not indexes:
        raise ValueError(f"No indexes in manifest for folder: {folder}")

    frame_images: list[Image.Image] = []
    frame_graphics: list[list[int]] = []
    total_width = 0
    max_height = 0

    for i, frame_index in enumerate(indexes):
        frame_path = folder_path / f"{folder}_frame_{frame_index}.png"
        if not frame_path.is_file():
            raise FileNotFoundError(f"Missing frame PNG: {frame_path}")

        image = Image.open(frame_path).convert("RGBA")
        frame_images.append(image)

        width, height = image.size
        total_width += width
        if i > 0:
            total_width += 1  # DragonBound-style implicit +1 x-advance between frames.
        max_height = max(max_height, height)

        anchor = anchors[frame_index] if frame_index < len(anchors) else {"x": 0, "y": 0}
        center_x = -int(anchor.get("x", 0))
        center_y = -int(anchor.get("y", 0))
        frame_graphics.append([width, height, center_x, center_y])

    atlas = Image.new("RGBA", (total_width, max_height), (0, 0, 0, 0))
    x_cursor = 0
    for image in frame_images:
        atlas.alpha_composite(image, (x_cursor, 0))
        x_cursor += image.width + 1
        image.close()

    output_image_dir.mkdir(parents=True, exist_ok=True)
    atlas_path = output_image_dir / f"{folder}.png"
    atlas.save(atlas_path, format="PNG")

    graphics_compressed = compress_graphics(frame_graphics)
    avatar_type = infer_avatar_type(folder)
    return {
        "filename": folder,
        "type": avatar_type,
        "graphics": graphics_compressed,
        "frame_count": len(frame_graphics),
        "image": f"/assets/shared/avatar_sheets/dragonbound_gen/{folder}.png",
        "atlas_size": {"w": total_width, "h": max_height},
    }


def write_registry_json(
    output_metadata: Path,
    fmt: str,
    generated_at_utc: str,
    source_manifest: str,
    avatars: list[dict[str, Any]],
) -> None:
    # Keep one avatar JSON object per line inside the avatars array.
    lines = [
        "{",
        f'  "format": {json.dumps(fmt)},',
        f'  "generated_at_utc": {json.dumps(generated_at_utc)},',
        f'  "source_manifest": {json.dumps(source_manifest)},',
        '  "avatars": [',
    ]
    for i, avatar in enumerate(avatars):
        suffix = "," if i < len(avatars) - 1 else ""
        lines.append(f"    {json.dumps(avatar, separators=(',', ':'))}{suffix}")
    lines.extend([
        "  ]",
        "}",
        "",
    ])
    output_metadata.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    args = parse_args()
    input_root = Path(args.input_root)
    manifest_path = Path(args.manifest) if args.manifest else (input_root / "manifest.json")
    output_image_dir = Path(args.output_image_dir)
    output_metadata = Path(args.output_metadata)

    if not manifest_path.is_file():
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest_folders = manifest.get("folders", {})
    if not isinstance(manifest_folders, dict):
        raise ValueError("Invalid manifest format: missing folders object.")

    avatar_rows: list[dict[str, Any]] = []
    for folder in args.folders:
        entry = build_atlas_for_folder(folder, input_root, output_image_dir, manifest_folders)
        avatar_rows.append({"id": folder, **entry})
        print(f"Generated atlas: {entry['image']} ({entry['frame_count']} frames)")

    avatar_rows.sort(key=lambda row: row["id"])
    output_metadata.parent.mkdir(parents=True, exist_ok=True)
    write_registry_json(
        output_metadata=output_metadata,
        fmt="dragonbound_avatar_atlas_v1",
        generated_at_utc=datetime.now(timezone.utc).isoformat(),
        source_manifest=str(manifest_path).replace("\\", "/"),
        avatars=avatar_rows,
    )
    print(f"Generated metadata: {output_metadata}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
