#!/usr/bin/env python3
"""
Sync decoded client graphics frames into project asset folders.

What it does:
1) Replaces frame PNGs in existing `public/assets/screens/**/<asset_id>/` folders.
2) Replaces frame PNGs in existing `public/assets/shared/**/<asset_id>/` folders
   (excluding avatar_sheets, client_graphics, avatars, and avatar ids like mh/mb/...).
3) Rebuilds avatar assets into a separate folder.
4) Writes avatar manifest into that separate folder.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path
from typing import Any


FRAME_GLOB = "*_frame_*.png"
AVATAR_ID_RE = re.compile(r"^[sS]?[mMfF][hbgfHBGF]\d{5}[lL]?$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync extracted client graphics into project assets.")
    parser.add_argument(
        "--source-root",
        default="public/assets/shared/client_graphics",
        help="Root folder created by extract_graphics_xfs.py.",
    )
    parser.add_argument(
        "--metadata-path",
        default="public/assets/shared/client_graphics/graphics_metadata.json",
        help="Metadata JSON created by extract_graphics_xfs.py.",
    )
    parser.add_argument(
        "--project-assets",
        default="public/assets",
        help="Project assets root.",
    )
    parser.add_argument(
        "--avatar-output",
        default="public/assets/shared/client_avatars",
        help="Separate output folder for extracted avatar folders + manifest.",
    )
    parser.add_argument(
        "--skip-avatars",
        action="store_true",
        help="Skip rebuilding avatar folders/manifest entirely.",
    )
    return parser.parse_args()


def build_source_map(source_root: Path) -> dict[str, Path]:
    out: dict[str, Path] = {}
    for child in source_root.iterdir():
        if not child.is_dir():
            continue
        if not any(child.glob(FRAME_GLOB)):
            continue
        out[child.name.lower()] = child
    return out


def replace_dir_frames(target_dir: Path, source_dir: Path) -> int:
    removed = 0
    for old in target_dir.glob(FRAME_GLOB):
        old.unlink()
        removed += 1
    copied = 0
    for src in source_dir.glob(FRAME_GLOB):
        shutil.copy2(src, target_dir / src.name)
        copied += 1
    return copied


def sync_existing_asset_folders(project_assets: Path, source_map: dict[str, Path]) -> tuple[int, int]:
    replaced_dirs = 0
    copied_frames = 0

    scan_roots = [
        project_assets / "screens",
        project_assets / "shared",
    ]

    for root in scan_roots:
        if not root.exists():
            continue
        for directory in root.rglob("*"):
            if not directory.is_dir():
                continue
            rel = directory.relative_to(project_assets).as_posix().lower()
            if (
                rel.startswith("shared/avatar_sheets")
                or rel.startswith("shared/client_graphics")
                or rel.startswith("shared/avatars")
                or rel.startswith("shared/client_avatars")
            ):
                continue
            if is_avatar_id(directory.name):
                continue
            if not any(directory.glob(FRAME_GLOB)):
                continue

            source_dir = source_map.get(directory.name.lower())
            if not source_dir:
                continue

            copied = replace_dir_frames(directory, source_dir)
            replaced_dirs += 1
            copied_frames += copied

    return replaced_dirs, copied_frames


def load_metadata(metadata_path: Path) -> dict[str, Any]:
    return json.loads(metadata_path.read_text(encoding="utf-8"))


def is_avatar_id(asset_id: str) -> bool:
    return bool(AVATAR_ID_RE.match(asset_id))


def rebuild_avatar_folders(
    source_map: dict[str, Path],
    metadata: dict[str, Any],
    avatar_output_root: Path,
) -> tuple[int, int]:
    avatars_root = avatar_output_root
    if avatars_root.exists():
        shutil.rmtree(avatars_root)
    avatars_root.mkdir(parents=True, exist_ok=True)

    metadata_files = {}
    for row in metadata.get("files", []):
        asset_id = str(row.get("id", ""))
        if asset_id:
            metadata_files[asset_id.lower()] = row

    copied_folders = 0
    copied_frames = 0
    manifest_folders: dict[str, Any] = {}

    for key, source_dir in sorted(source_map.items()):
        source_name = source_dir.name
        if not is_avatar_id(source_name):
            continue
        target_dir = avatars_root / source_name
        target_dir.mkdir(parents=True, exist_ok=True)

        frames = sorted(source_dir.glob(FRAME_GLOB))
        for src in frames:
            shutil.copy2(src, target_dir / src.name)
            copied_frames += 1

        copied_folders += 1
        row = metadata_files.get(key, {})
        indexes = row.get("indexes") if isinstance(row.get("indexes"), list) else list(range(len(frames)))
        anchors = row.get("anchors") if isinstance(row.get("anchors"), list) else [{"x": 0, "y": 0} for _ in indexes]
        manifest_folders[source_name] = {
            "count": len(indexes),
            "indexes": indexes,
            "anchors": anchors,
        }

    manifest_payload = {"folders": manifest_folders}
    (avatars_root / "manifest.json").write_text(
        json.dumps(manifest_payload, separators=(",", ":")),
        encoding="utf-8",
    )
    return copied_folders, copied_frames


def main() -> int:
    args = parse_args()
    source_root = Path(args.source_root)
    metadata_path = Path(args.metadata_path)
    project_assets = Path(args.project_assets)
    avatar_output = Path(args.avatar_output)

    if not source_root.is_dir():
        raise RuntimeError(f"Source root not found: {source_root}")
    if not metadata_path.is_file():
        raise RuntimeError(f"Metadata file not found: {metadata_path}")
    if not project_assets.is_dir():
        raise RuntimeError(f"Project assets root not found: {project_assets}")

    source_map = build_source_map(source_root)
    metadata = load_metadata(metadata_path)

    replaced_dirs, copied_frames_existing = sync_existing_asset_folders(project_assets, source_map)
    print(f"Replaced existing asset folders: {replaced_dirs}")
    print(f"Copied frames into existing folders: {copied_frames_existing}")
    if args.skip_avatars:
        print("Avatar export: skipped")
    else:
        avatar_dirs, avatar_frames = rebuild_avatar_folders(source_map, metadata, avatar_output)
        print(f"Rebuilt avatar folders: {avatar_dirs}")
        print(f"Copied avatar frames: {avatar_frames}")
        print(f"Avatar manifest: {avatar_output / 'manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
