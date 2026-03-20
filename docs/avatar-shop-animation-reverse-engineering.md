# Avatar Shop Character Animation Reverse Engineering

Date: 2026-03-20

## Goal
Replicate GunBound Thor's Hammer avatar-shop character animation (equip/unequip preview) with extracted assets.

## Sources Used
- Original client binaries: `C:\GBTH-Client\Gunbound.gme`, `graphics.xfs`, `avatar.xfs`.
- Extracted assets: `C:\tools\xfs2`, `C:\tools\client_graphics`.

## Locked Shop Layout (Do Not Drift)
- JS anchor: `PREVIEW_ANCHOR_X=31`, `PREVIEW_ANCHOR_Y=58`
- JS offset: `PREVIEW_OFFSET_X=15`, `PREVIEW_OFFSET_Y=20`
- CSS slot rect:
  - `--avatar-preview-slot-left: 18px`
  - `--avatar-preview-slot-top: 34px`
  - `--avatar-preview-slot-width: 88px`
  - `--avatar-preview-slot-height: 70px`
  - `--avatar-preview-slot-radius: 8px`

## What Was Copied Into This Repo
Copied avatar-related assets into:
- `C:\GBTH-NodeJS\public\assets\shared\avatars`

Copied set size:
- 1,554 directories
- 14,780 PNG files
- ~14.73 MB

## Asset Taxonomy (Confirmed)

Animated wearable layers:
- `mb#####` = male body/cloth
- `mh#####` = male head/cap
- `mg#####` = male glasses/eyes
- `mf#####` = flags (shared flag set; used for male and for most female flag items)
- `fb#####` = female body/cloth
- `fh#####` = female head/cap
- `fg#####` = female glasses/eyes
- `ff00001` = female default flag

Static shop icons (one-frame previews):
- `smb#####`, `smh#####`, `smg#####`, `smf#####`
- `sfb#####`, `sfh#####`, `sfg#####`
- `sff00001` (female default flag icon)

ID mapping:
- For cloth/cap/glasses: shop icon IDs match animated IDs 1:1.
- For flags: `smf#####` maps to `mf#####`; extra animated `mf` IDs exist outside shop pages.

## Frame Structure Observed
- Heads (`mh`/`fh`): mostly 22 frames.
- Bodies (`mb`/`fb`): mostly 11 frames (some variants).
- Glasses (`mg`/`fg`): mostly 22, some 44.
- Flags (`mf`): mostly 11, with some 22/other counts.

`l`-suffix companion folders exist for some items (example: `mf00039l`, `mh00002l`, `fb00007l`).
- Treat as an extra layer for the same item ID.
- Practical rule: if `<prefix><id>l` exists, render it in addition to base folder.
- Draw order recommendation: draw `l` layer before the main layer (back-support layer behavior).

## Animation Model (Recovered)

GBTH shop preview behavior implemented in this repo:
- Global avatar tick: `ANIMATIONS_FPS = 10` (100 ms/frame).
- Avatar frame counter: `a = floor(elapsedMs / 100)`.
- All preview layers are driven from one master tick to avoid layer drift.
- EX background/foreground playback is tick-based (not wall-clock ms metadata based).
- EX background/foreground default cadence currently runs at master tick (`frame = a`) for visual parity with GBTH client behavior observed in side-by-side checks.
- Global preview speed multiplier is kept at `1.0`; parity tweaks are done with per-effect overrides.
- EX timing now reads GBTH `.epa` sequence/duration tables (`epa_sequence`, `epa_durations`) from `C:\tools\xfs2`.
- EPA duration unit is currently calibrated to `50ms` per step in preview runtime.
- Position overrides remain narrow and foreground-only (`Howling Wolf`) to avoid shifting already-correct effects.
- `.img` header field `i2` is preserved for diagnostics only; it is not used as frame-duration source.

### Critical Positioning Discovery
- `.img` frame metadata includes signed per-frame centers:
  - `center_x`
  - `center_y`
- These values were present in the extractor metadata but previously ignored.
- Correct composition uses:
  - `draw_x = preview_anchor_x + center_x`
  - `draw_y = preview_anchor_y + center_y`
- This is now implemented in shop preview via `public/assets/shared/avatars/manifest.json` (`anchors` array per folder).

Loop modes used by avatar parts:
- `LOOP_NORMAL` (1): `idx = t % n`
- `LOOP_NORMAL_AND_REVERSE` (2):
  - `period = 2*n - 2`
  - `x = t % period`
  - `idx = x < n ? x : period - x`
- `LOOP_AVATAR` (4), used for face-like blink/turn behavior:
  - Uses 2 halves (`n/2` each): one "normal", one "special/blink"
  - Picks occasional special cycles with random cadence (`RANDOM_FACE_TURN_CHANCE = 6`)
  - For 22-frame sets, this is the key blink-style behavior
- `LOOP_AVATAR_NO_REVERSE` (5):
  - Uses half-cycle without reverse (used by some 44-frame eye sets)

Recovered default per-slot loop choice:
- Head: `LOOP_AVATAR`
- Body: `LOOP_NORMAL_AND_REVERSE`
- Eyes/Glasses:
  - 22 frames -> `LOOP_AVATAR`
  - 44 frames -> `LOOP_AVATAR_NO_REVERSE`
  - otherwise -> `LOOP_NORMAL_AND_REVERSE`
- Flag: `LOOP_NORMAL_AND_REVERSE`

### Shop Composition Sync Rule (Critical)
- For avatar-shop layered preview, body/head/eyes/flag must stay on the same pose timeline.
- If each slot advances on an independent loop (especially with random face-turn cadence), layers drift into different poses and visually "stack/misalign".
- Practical renderer rule:
  - Compute one master frame index for the current tick (ping-pong over a primary slot frame count, usually body/head).
  - Map that master index into each layer's frame range.
  - Apply each layer's per-frame `center_x/center_y` anchor after frame selection.

## Layer Order For Shop Preview

Recommended draw stack (back -> front):
1. Optional item companion `l` layers (per slot)
2. Flag
3. Head
4. Body
5. Glasses/Eyes
6. Optional foreground/exitem (if implemented later)

Note:
- Original code has special per-item z-order overrides (`HEAD_BEHIND`, `MOVE_FG_TO_BACK`, `FORCED_LOOP`) for high item IDs not present in this extracted TH set range. Keep architecture open for overrides.

## Practical Integration Rules For This Project

Path convention in repo:
- `public/assets/shared/avatars/<folder>/<folder>_frame_<index>.png`

Folder resolver:
- Male: head=`mh`, body=`mb`, glasses=`mg`, flag=`mf`
- Female: head=`fh`, body=`fb`, glasses=`fg`, flag=`mf` for shop flags, fallback default=`ff00001`

Frame selection:
- Build per-layer sorted frame list by numeric frame suffix.
- On each 100 ms tick, compute frame index from loop mode.
- Render each layer image at fixed origin (top-left compositing works with current extraction).

## Open Items
- Confirm exact female flag fallback behavior in original TH for "no flag equipped" state (`ff00001` vs none).
- Confirm whether any TH-specific forced-loop/z-order overrides exist in `Gunbound.gme` for this asset set.
- Validate whether any GBTH EX items require per-folder tick-divisor overrides.
