-- Backfill default equipped base avatar (head/body) for all users.
-- Male: mh00000 + mb00000
-- Female: fh00000 + fb00000
-- Only inserts when there is no currently equipped item for that slot.

INSERT INTO chest (owner_id, avatar_id, item_id, item_code, slot, wearing, acquisition_type, expire_type, place_order)
SELECT
    u.UserId,
    a.id,
    COALESCE(a.source_ref_id, 0),
    a.avatar_code,
    'head',
    1,
    'S',
    'I',
    0
FROM user u
JOIN avatars a
    ON a.avatar_code = CASE WHEN u.Gender = 1 THEN 'fh00000' ELSE 'mh00000' END
LEFT JOIN chest c
    ON c.owner_id = u.UserId
   AND c.slot = 'head'
   AND c.wearing = 1
WHERE c.id IS NULL;

INSERT INTO chest (owner_id, avatar_id, item_id, item_code, slot, wearing, acquisition_type, expire_type, place_order)
SELECT
    u.UserId,
    a.id,
    COALESCE(a.source_ref_id, 0),
    a.avatar_code,
    'body',
    1,
    'S',
    'I',
    0
FROM user u
JOIN avatars a
    ON a.avatar_code = CASE WHEN u.Gender = 1 THEN 'fb00000' ELSE 'mb00000' END
LEFT JOIN chest c
    ON c.owner_id = u.UserId
   AND c.slot = 'body'
   AND c.wearing = 1
WHERE c.id IS NULL;
