# Graphics XFS Extraction

This project now includes a quality-safe extractor:

- Script: `tools/extract_graphics_xfs.py`
- Output: `public/assets/shared/client_graphics`
- Metadata: `public/assets/shared/client_graphics/graphics_metadata.json`

## Why this script

Previous extraction logic forced pure black pixels to transparent, which removed
avatar outlines and eye details. The new decoder preserves true alpha from the
IMG formats and keeps black pixels opaque when encoded as opaque.

## Usage

1) Unpack `graphics.xfs` to `.img` files (for example into `C:\tools\xfs2`).

2) Decode all IMG files:

```powershell
python tools/extract_graphics_xfs.py --img-root C:/tools/xfs2 --output-root public/assets/shared/client_graphics --overwrite
```

3) Optional targeted test (few files only):

```powershell
python tools/extract_graphics_xfs.py --img-root C:/tools/xfs2 --match "^(mb00005|mh00006)$" --overwrite
```

## Notes

- The script can attempt unpacking with `--try-unpack`, but unpacker CLI support
  depends on your local `XFS2_English.exe`.
- Any decode issues are written into `graphics_metadata.json` under `issues`.
