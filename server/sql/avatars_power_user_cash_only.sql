-- Force Power User EX items to be cash-only.
-- Keeps DB as single source of truth for pricing.

UPDATE avatars
SET
    gold_week = 0,
    gold_month = 0,
    gold_perm = 0
WHERE
    LOWER(name) LIKE '%power user%'
    OR source_avatar_id IN (204802, 204803, 204804)
    OR avatar_code IN ('ex2_204802', 'ex2_204803', 'ex2_204804');
