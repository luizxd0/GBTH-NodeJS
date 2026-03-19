#!/usr/bin/env python3
"""
Compose the default avatar animation into a single spritesheet PNG + metadata JSON.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image


ROOT = Path("public/assets/shared/avatars")
MANIFEST_PATH = ROOT / "manifest.json"
OUT_DIR = Path("public/assets/shared/avatar_sheets/default_male")
OUT_SHEET = OUT_DIR / "default_male_sheet.png"
OUT_META = OUT_DIR / "default_male_sheet.json"

# Current defaults used by the shop preview.
GENDER = "m"
DEFAULT_HEAD = 0
DEFAULT_BODY = 0
DEFAULT_EYES = None
DEFAULT_FLAG = None

# Layer order (back to front), aligned to current runtime.
SLOTS = [
    ("flag", True),
    ("body", True),
    ("head", True),
    ("eyes", True),
    ("flag", False),
    ("body", False),
    ("head", False),
    ("eyes", False),
]


def resolve_folder(manifest_folders: dict, gender: str, slot: str, item_id: int | None, back: bool) -> str | None:
    if item_id is None:
        return None
    item = int(item_id)
    if item < 0:
        return None

    suffix = "l" if back else ""
    id_part = str(item).zfill(5)

    male_prefix = {"head": "mh", "body": "mb", "eyes": "mg", "flag": "mf"}
    female_prefix = {"head": "fh", "body": "fb", "eyes": "fg", "flag": "mf"}
    prefix = (female_prefix if gender == "f" else male_prefix).get(slot)
    if not prefix:
        return None

    if slot == "flag" and gender == "f" and item == 1:
        fallback = f"ff00001{suffix}"
        if fallback in manifest_folders:
            return fallback

    direct = f"{prefix}{id_part}{suffix}"
    return direct if direct in manifest_folders else None


def ping_pong(frame_count: int, tick: int) -> int:
    if frame_count <= 1:
        return 0
    period = max(1, 2 * frame_count - 2)
    step = tick % period
    return step if step < frame_count else period - step


def avatar_loop_non_special(frame_count: int, tick: int) -> int:
    # Mirrors LOOP_AVATAR in "normal" (non-special) path.
    half = frame_count // 2
    if half <= 0:
        return 0
    period = max(1, 2 * half - 2)
    step = tick % period
    if step >= half:
        step = period - step
    return step + half


def slot_logical_index(slot: str, frame_count: int, tick: int) -> int:
    if slot in ("body", "flag"):
        return ping_pong(frame_count, tick)
    if slot == "head":
        return avatar_loop_non_special(frame_count, tick)
    if slot == "eyes":
        if frame_count == 44:
            half = frame_count // 2
            return tick % half + half
        if frame_count == 22:
            return avatar_loop_non_special(frame_count, tick)
        return ping_pong(frame_count, tick)
    return tick % frame_count


def load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def lcm(a: int, b: int) -> int:
    return abs(a * b) // math.gcd(a, b) if a and b else 0


def compute_cycle_length(layers: list[dict]) -> int:
    # LOOP_AVATAR and ping-pong both loop on (2*n-2) style periods for our defaults.
    cycle = 1
    for layer in layers:
        frame_count = len(layer["indexes"])
        if layer["slot"] in ("body", "flag"):
            period = max(1, 2 * frame_count - 2)
        elif layer["slot"] == "head":
            period = max(1, 2 * (frame_count // 2) - 2)
        elif layer["slot"] == "eyes" and frame_count == 44:
            period = frame_count // 2
        elif layer["slot"] == "eyes" and frame_count == 22:
            period = max(1, 2 * (frame_count // 2) - 2)
        else:
            period = max(1, frame_count)
        cycle = lcm(cycle, period)
    return max(cycle, 1)


def main() -> int:
    manifest = load_manifest()
    folders = manifest.get("folders", {})

    avatar = {
        "head": DEFAULT_HEAD,
        "body": DEFAULT_BODY,
        "eyes": DEFAULT_EYES,
        "flag": DEFAULT_FLAG,
    }

    layers: list[dict] = []
    for slot, back in SLOTS:
        folder = resolve_folder(folders, GENDER, slot, avatar[slot], back)
        if not folder:
            continue
        info = folders.get(folder)
        if not info or not info.get("indexes"):
            continue
        layers.append(
            {
                "slot": slot,
                "back": back,
                "folder": folder,
                "indexes": info["indexes"],
                "anchors": info.get("anchors", []),
            }
        )

    if not layers:
        raise RuntimeError("No layers resolved for default avatar.")

    cycle = compute_cycle_length(layers)

    # First pass: compute global bounds across the whole animation.
    min_x = 10**9
    min_y = 10**9
    max_x = -10**9
    max_y = -10**9
    per_tick = []

    for tick in range(cycle):
        tick_entries = []
        for layer in layers:
            logical = slot_logical_index(layer["slot"], len(layer["indexes"]), tick)
            logical = max(0, min(logical, len(layer["indexes"]) - 1))
            frame_index = layer["indexes"][logical]
            anchor = {"x": 0, "y": 0}
            if frame_index < len(layer["anchors"]):
                anchor = layer["anchors"][frame_index]
            frame_path = ROOT / layer["folder"] / f"{layer['folder']}_frame_{frame_index}.png"
            with Image.open(frame_path) as image:
                w, h = image.size
            x = int(anchor.get("x", 0))
            y = int(anchor.get("y", 0))
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x + w)
            max_y = max(max_y, y + h)
            tick_entries.append(
                {
                    "slot": layer["slot"],
                    "back": layer["back"],
                    "folder": layer["folder"],
                    "frame_index": frame_index,
                    "x": x,
                    "y": y,
                    "w": w,
                    "h": h,
                }
            )
        per_tick.append(tick_entries)

    cell_w = max_x - min_x
    cell_h = max_y - min_y
    cols = math.ceil(math.sqrt(cycle))
    rows = math.ceil(cycle / cols)

    sheet = Image.new("RGBA", (cols * cell_w, rows * cell_h), (0, 0, 0, 0))
    meta_frames = []

    for tick, entries in enumerate(per_tick):
        col = tick % cols
        row = tick // cols
        cell_x = col * cell_w
        cell_y = row * cell_h

        for entry in entries:
            frame_path = ROOT / entry["folder"] / f"{entry['folder']}_frame_{entry['frame_index']}.png"
            draw_x = cell_x + (entry["x"] - min_x)
            draw_y = cell_y + (entry["y"] - min_y)
            with Image.open(frame_path).convert("RGBA") as image:
                sheet.alpha_composite(image, (draw_x, draw_y))

        meta_frames.append(
            {
                "tick": tick,
                "x": cell_x,
                "y": cell_y,
                "w": cell_w,
                "h": cell_h,
                "layers": [
                    {
                        "slot": e["slot"],
                        "back": e["back"],
                        "folder": e["folder"],
                        "frame_index": e["frame_index"],
                        "x": e["x"] - min_x,
                        "y": e["y"] - min_y,
                        "w": e["w"],
                        "h": e["h"],
                    }
                    for e in entries
                ],
            }
        )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT_SHEET, format="PNG")

    metadata = {
        "name": "default_male",
        "gender": GENDER,
        "slots": avatar,
        "cycle_ticks": cycle,
        "columns": cols,
        "rows": rows,
        "cell": {"width": cell_w, "height": cell_h},
        "sheet_size": {"width": cols * cell_w, "height": rows * cell_h},
        "bounds": {"min_x": min_x, "min_y": min_y, "max_x": max_x, "max_y": max_y},
        "frames": meta_frames,
    }
    OUT_META.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print(f"Generated: {OUT_SHEET}")
    print(f"Generated: {OUT_META}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
