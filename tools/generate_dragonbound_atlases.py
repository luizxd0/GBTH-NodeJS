#!/usr/bin/env python3
"""
Generate DragonBound-style avatar atlases from either:
1) avatar manifest format: {"folders": {...}}
2) client graphics metadata format: {"files": [...]}

Outputs:
1) One atlas PNG per avatar folder in the requested output directory.
2) Updated main metadata file (avatar_metadata.json) under the "atlases" section.

Example (all client avatars):
python tools/generate_dragonbound_atlases.py --input-root C:/tools/client_graphics --all-avatars --atlas-prefix gbth --output-image-dir public/assets/shared/avatar_sheets/gbth
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image

AVATAR_ID_RE = re.compile(r"^[sS]?[mMfF][hbgfHBGF]\d{5}[lL]?$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build DragonBound-format avatar atlases and update avatar metadata.")
    parser.add_argument(
        "--folders",
        nargs="+",
        default=[],
        help="Avatar folders to convert (for example: mb00000 mh00000). If omitted with --all-avatars, all avatar ids from metadata are processed.",
    )
    parser.add_argument(
        "--all-avatars",
        action="store_true",
        help="Generate atlases for every avatar id found in source metadata.",
    )
    parser.add_argument(
        "--input-root",
        default="public/assets/shared/avatars",
        help="Root folder containing avatar frame folders.",
    )
    parser.add_argument(
        "--metadata",
        default="",
        help="Path to source metadata JSON. Auto-detects <input-root>/manifest.json or <input-root>/graphics_metadata.json if omitted.",
    )
    parser.add_argument(
        "--output-image-dir",
        default="public/assets/shared/avatar_sheets/gbth",
        help="Output directory for atlas PNG files.",
    )
    parser.add_argument(
        "--main-metadata",
        default="public/assets/shared/avatar_sheets/avatar_metadata.json",
        help="Main avatar metadata JSON file to update.",
    )
    parser.add_argument(
        "--atlas-prefix",
        default="gbth",
        help="Key prefix used in main metadata atlases map (for example: gbth, db).",
    )
    parser.add_argument(
        "--replace-prefix",
        action="store_true",
        help="Remove existing atlas entries with this prefix before adding generated entries.",
    )
    return parser.parse_args()


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


def normalize_signed_32(value: Any) -> int:
    ivalue = int(value or 0)
    if ivalue >= 0x80000000:
        ivalue -= 0x100000000
    return ivalue


def detect_metadata_path(input_root: Path, explicit_metadata: str) -> Path:
    if explicit_metadata:
        return Path(explicit_metadata)
    manifest_path = input_root / "manifest.json"
    if manifest_path.is_file():
        return manifest_path
    graphics_meta = input_root / "graphics_metadata.json"
    if graphics_meta.is_file():
        return graphics_meta
    raise FileNotFoundError(
        f"Could not auto-detect metadata under {input_root}. "
        "Expected manifest.json or graphics_metadata.json."
    )


def load_avatar_rows_from_metadata(metadata: dict[str, Any]) -> dict[str, dict[str, Any]]:
    # Format A: {"folders": { "mb00000": {indexes, anchors, ...} }}
    folders = metadata.get("folders")
    if isinstance(folders, dict):
        return {str(k): v for k, v in folders.items() if isinstance(v, dict)}

    # Format B: {"files": [ {"id":"mb00000","indexes":[...],"anchors":[...]} ]}
    files = metadata.get("files")
    if isinstance(files, list):
        out: dict[str, dict[str, Any]] = {}
        for row in files:
            if not isinstance(row, dict):
                continue
            folder_id = str(row.get("id", "")).strip()
            if not folder_id:
                continue
            out[folder_id] = row
        return out

    raise ValueError("Unsupported metadata format: expected 'folders' map or 'files' list.")


def is_avatar_id(folder_id: str) -> bool:
    return bool(AVATAR_ID_RE.match(folder_id))


def to_public_image_url(path: Path) -> str:
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


def build_atlas_for_folder(
    folder: str,
    input_root: Path,
    output_image_dir: Path,
    avatar_rows: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    folder_path = input_root / folder
    if not folder_path.is_dir():
        raise FileNotFoundError(f"Missing avatar folder: {folder_path}")

    folder_info = avatar_rows.get(folder)
    if not folder_info:
        raise KeyError(f"Folder not found in metadata: {folder}")

    indexes = folder_info.get("indexes") or []
    anchors = folder_info.get("anchors") or []
    if not indexes:
        raise ValueError(f"No indexes in metadata for folder: {folder}")

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
        center_x = -normalize_signed_32(anchor.get("x", 0))
        center_y = -normalize_signed_32(anchor.get("y", 0))
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
    return {
        "filename": folder,
        "graphics": graphics_compressed,
        "frame_count": len(frame_graphics),
        "image": to_public_image_url(atlas_path),
        "atlas_size": {"w": total_width, "h": max_height},
    }


def load_main_metadata(main_metadata_path: Path) -> dict[str, Any]:
    if not main_metadata_path.is_file():
        return {"version": 1, "spritesheets": {}, "atlases": {}, "tests": {}}
    data = json.loads(main_metadata_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Invalid main metadata object: {main_metadata_path}")
    data.setdefault("version", 1)
    data.setdefault("spritesheets", {})
    data.setdefault("atlases", {})
    data.setdefault("tests", {})
    if not isinstance(data["atlases"], dict):
        raise ValueError(f"Invalid 'atlases' in main metadata: {main_metadata_path}")
    return data


def update_main_metadata(
    main_metadata_path: Path,
    atlas_prefix: str,
    generated_rows: list[dict[str, Any]],
    source_metadata_path: Path,
    replace_prefix: bool,
) -> None:
    data = load_main_metadata(main_metadata_path)
    atlases = data["atlases"]

    prefix_key = f"{atlas_prefix}_"
    if replace_prefix:
        remove_keys = [key for key in atlases.keys() if key.startswith(prefix_key)]
        for key in remove_keys:
            del atlases[key]

    for row in generated_rows:
        atlas_key = f"{atlas_prefix}_{row['id']}"
        atlases[atlas_key] = {
            "image": row["image"],
            "x": 0,
            "y": 0,
            "g": row["graphics"],
        }

    data["generated_at_utc"] = datetime.now(timezone.utc).isoformat()
    data["source_metadata"] = str(source_metadata_path).replace("\\", "/")

    main_metadata_path.parent.mkdir(parents=True, exist_ok=True)
    main_metadata_path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main() -> int:
    args = parse_args()
    input_root = Path(args.input_root)
    metadata_path = detect_metadata_path(input_root, args.metadata)
    output_image_dir = Path(args.output_image_dir)
    main_metadata = Path(args.main_metadata)

    if not metadata_path.is_file():
        raise FileNotFoundError(f"Metadata not found: {metadata_path}")

    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    avatar_rows = load_avatar_rows_from_metadata(metadata)
    all_avatar_ids = sorted([folder_id for folder_id in avatar_rows.keys() if is_avatar_id(folder_id)])

    requested_folders = list(args.folders)
    if args.all_avatars:
        requested_folders = all_avatar_ids
    if not requested_folders:
        raise ValueError("No folders selected. Use --folders ... or --all-avatars.")

    generated_rows: list[dict[str, Any]] = []
    skipped_missing = 0
    for folder in sorted(dict.fromkeys(requested_folders)):
        if not is_avatar_id(folder):
            continue
        folder_path = input_root / folder
        if not folder_path.is_dir():
            skipped_missing += 1
            continue
        entry = build_atlas_for_folder(folder, input_root, output_image_dir, avatar_rows)
        generated_rows.append({"id": folder, **entry})
        print(f"Generated atlas: {entry['image']} ({entry['frame_count']} frames)")

    generated_rows.sort(key=lambda row: row["id"])
    update_main_metadata(
        main_metadata_path=main_metadata,
        atlas_prefix=args.atlas_prefix,
        generated_rows=generated_rows,
        source_metadata_path=metadata_path,
        replace_prefix=args.replace_prefix,
    )
    print(f"Updated main metadata: {main_metadata}")
    print(f"Atlas prefix: {args.atlas_prefix}")
    print(f"Generated rows: {len(generated_rows)}")
    if args.all_avatars:
        print(f"All avatar ids in source metadata: {len(all_avatar_ids)}")
    if skipped_missing:
        print(f"Skipped missing folders: {skipped_missing}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
