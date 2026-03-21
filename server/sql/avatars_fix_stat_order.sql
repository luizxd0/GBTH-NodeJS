-- One-time migration for legacy DB stat column ordering.
-- Handles both known bad layouts:
-- 1) original DAT->DB wrong order
-- 2) intermediate "first rotation" order

START TRANSACTION;

-- Case 1: original legacy order
-- Signature: mh00003 has popularity in stat_shld (pop=0, shld=6).
UPDATE avatars a
JOIN (
    SELECT
        id,
        stat_pop  AS old_pop,
        stat_time AS old_time,
        stat_atk  AS old_atk,
        stat_def  AS old_def,
        stat_life AS old_life,
        stat_item AS old_item,
        stat_dig  AS old_dig,
        stat_shld AS old_shld
    FROM avatars
    WHERE slot IN ('body', 'head', 'eyes', 'flag')
) src ON src.id = a.id
SET
    a.stat_pop  = src.old_shld,
    a.stat_time = src.old_pop,
    a.stat_atk  = src.old_atk,
    a.stat_def  = src.old_def,
    a.stat_life = src.old_life,
    a.stat_item = src.old_item,
    a.stat_dig  = src.old_time,
    a.stat_shld = src.old_dig
WHERE EXISTS (
    SELECT 1
    FROM avatars chk
    WHERE chk.avatar_code = 'mh00003'
      AND chk.stat_pop = 0
      AND chk.stat_shld = 6
);

-- Case 2: intermediate rotated order
-- Signature: pharaoh has def=3, life=6, item=18, atk=0.
UPDATE avatars a
JOIN (
    SELECT
        id,
        stat_pop  AS old_pop,
        stat_time AS old_time,
        stat_atk  AS old_atk,
        stat_def  AS old_def,
        stat_life AS old_life,
        stat_item AS old_item,
        stat_dig  AS old_dig,
        stat_shld AS old_shld
    FROM avatars
    WHERE slot IN ('body', 'head', 'eyes', 'flag')
) src ON src.id = a.id
SET
    a.stat_pop  = src.old_pop,
    a.stat_time = src.old_time,
    a.stat_atk  = src.old_def,
    a.stat_def  = src.old_life,
    a.stat_life = src.old_item,
    a.stat_item = src.old_dig,
    a.stat_dig  = src.old_atk,
    a.stat_shld = src.old_shld
WHERE EXISTS (
    SELECT 1
    FROM avatars chk
    WHERE chk.avatar_code = 'mh00014'
      AND chk.stat_atk = 0
      AND chk.stat_def = 3
      AND chk.stat_life = 6
      AND chk.stat_item = 18
);

-- Known parity fix: Golden Helmet uses positive turn-delay value in client.
UPDATE avatars
SET stat_time = ABS(stat_time)
WHERE avatar_code IN ('mh00041', 'fh00055')
  AND stat_time < 0;

COMMIT;
