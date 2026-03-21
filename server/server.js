require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const http = require('http');
const path = require('path');
const mysql = require('mysql2/promise');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Tracking online users for buddy requests
const userSockets = new Map(); // nickname -> socket.id
const socketData = new Map(); // socket.id -> { nickname, id }
const pendingNotifications = new Map(); // userId -> timeoutId
const pendingDisconnects = new Map(); // userId -> timeoutId
const RECONNECT_GRACE_MS = 2500;

function getUKTimestamp() {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function getActivePlayerCount() {
    let count = 0;
    for (const data of socketData.values()) {
        if (data.location !== 'world_list') {
            count++;
        }
    }
    return count;
}

function normalizeGender(genderValue) {
    return Number(genderValue) === 1 ? 1 : 0;
}

function normalizeAvatarCatalogGender(genderValue) {
    const raw = String(genderValue ?? '').trim().toLowerCase();
    if (raw === '1' || raw === 'f' || raw === 'female' || raw === 'girl') {
        return 'f';
    }
    if (raw === '0' || raw === 'm' || raw === 'male' || raw === 'boy') {
        return 'm';
    }
    return 'u';
}

function normalizeAvatarCatalogSlot(slotValue) {
    const raw = String(slotValue ?? '').trim().toLowerCase();
    if (raw === 'cloth' || raw === 'body') return 'body';
    if (raw === 'cap' || raw === 'head') return 'head';
    if (raw === 'glasse' || raw === 'glass' || raw === 'eyes' || raw === 'eye') return 'eyes';
    if (raw === 'flag') return 'flag';
    if (raw === 'set' || raw === 'setitem') return 'setitem';
    if (raw === 'exitem' || raw === 'background' || raw === 'foreground') return raw;
    return raw;
}

function toOptionalAvatarValue(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function toBaseAvatarValue(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return 0;
    }
    return parsed;
}

function toSignedAvatarStatValue(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return 0;
    }
    return Math.trunc(parsed);
}

function pickAvatarCatalogPriceAmount(item, keyPrefix) {
    const week = toBaseAvatarValue(item?.[`${keyPrefix}_week`]);
    const month = toBaseAvatarValue(item?.[`${keyPrefix}_month`]);
    const perm = toBaseAvatarValue(item?.[`${keyPrefix}_perm`]);
    return perm || month || week || 0;
}

function hasAvatarCatalogPrice(item) {
    return pickAvatarCatalogPriceAmount(item, 'cash') > 0
        || pickAvatarCatalogPriceAmount(item, 'gold') > 0;
}

function getAvatarCatalogDedupeKey(item) {
    const slot = String(item?.slot || '').trim().toLowerCase();
    const gender = String(item?.gender || 'u').trim().toLowerCase();
    const name = String(item?.name || '').trim().toLowerCase();
    const setKey = String(item?.set_key || '').trim().toLowerCase();
    const note = Number(item?.note || 0);

    const prices = [
        Number(item?.gold_week || 0),
        Number(item?.gold_month || 0),
        Number(item?.gold_perm || 0),
        Number(item?.cash_week || 0),
        Number(item?.cash_month || 0),
        Number(item?.cash_perm || 0)
    ].join(',');

    const stats = [
        Number(item?.stat_pop || 0),
        Number(item?.stat_time || 0),
        Number(item?.stat_atk || 0),
        Number(item?.stat_def || 0),
        Number(item?.stat_life || 0),
        Number(item?.stat_item || 0),
        Number(item?.stat_dig || 0),
        Number(item?.stat_shld || 0)
    ].join(',');

    return `${slot}|${gender}|${name}|set:${setKey}|note:${note}|p:${prices}|s:${stats}`;
}

function buildUserPayload(row) {
    const ahead = toBaseAvatarValue(row?.ahead);
    const abody = toBaseAvatarValue(row?.abody);
    const aeyes = toOptionalAvatarValue(row?.aeyes);
    const aflag = toOptionalAvatarValue(row?.aflag);
    const abackground = toOptionalAvatarValue(row?.abackground);
    const aforeground = toOptionalAvatarValue(row?.aforeground);
    const aexitem = toOptionalAvatarValue(row?.aexitem);
    return {
        id: row.UserId,
        nickname: row.Nickname,
        guild: row.Guild,
        authority: row.Authority,
        gender: normalizeGender(row.Gender),
        ahead,
        abody,
        aeyes,
        aflag,
        abackground,
        aforeground,
        aexitem,
        gold: row.Gold,
        cash: row.Cash,
        score: row.TotalScore,
        grade: row.TotalGrade,
        rank: row.TotalRank
    };
}

const CHEST_EQUIPABLE_SLOTS = new Set(['head', 'body', 'eyes', 'flag', 'background', 'foreground', 'exitem']);
const CHEST_EX_SLOTS = new Set(['background', 'foreground', 'exitem']);
const CHEST_REGULAR_SLOTS = new Set(['head', 'body', 'eyes', 'flag']);
const POWER_USER_SOURCE_IDS = new Set([204802, 204803, 204804]);

function normalizeChestSlot(slotValue) {
    const normalized = normalizeAvatarCatalogSlot(slotValue);
    return CHEST_EQUIPABLE_SLOTS.has(normalized) ? normalized : null;
}

function isChestExSlot(slotValue) {
    const slot = normalizeChestSlot(slotValue);
    return slot ? CHEST_EX_SLOTS.has(slot) : false;
}

function isPowerUserChestRow(itemRow) {
    const nameLower = String(itemRow?.name || '').toLowerCase();
    const avatarCodeLower = String(itemRow?.avatar_code || '').toLowerCase();
    const itemCodeLower = String(itemRow?.item_code || '').toLowerCase();
    const sourceAvatarId = Number(itemRow?.source_avatar_id);
    const sourceRefId = Number(itemRow?.source_ref_id);
    const avatarId = Number(itemRow?.avatar_id);
    const itemId = Number(itemRow?.item_id);

    return nameLower.includes('power user')
        || avatarCodeLower === 'ex2_204802'
        || avatarCodeLower === 'ex2_204803'
        || avatarCodeLower === 'ex2_204804'
        || itemCodeLower === 'ex2_204802'
        || itemCodeLower === 'ex2_204803'
        || itemCodeLower === 'ex2_204804'
        || POWER_USER_SOURCE_IDS.has(sourceAvatarId)
        || POWER_USER_SOURCE_IDS.has(sourceRefId)
        || POWER_USER_SOURCE_IDS.has(avatarId)
        || POWER_USER_SOURCE_IDS.has(itemId);
}

function pickAvatarPricePlan(item, keyPrefix) {
    const week = toBaseAvatarValue(item?.[`${keyPrefix}_week`]);
    const month = toBaseAvatarValue(item?.[`${keyPrefix}_month`]);
    const perm = toBaseAvatarValue(item?.[`${keyPrefix}_perm`]);
    if (perm > 0) {
        return { amount: perm, expireType: 'P', durationDays: null };
    }
    if (month > 0) {
        return { amount: month, expireType: 'M', durationDays: 30 };
    }
    if (week > 0) {
        return { amount: week, expireType: 'W', durationDays: 7 };
    }
    return { amount: 0, expireType: 'I', durationDays: null };
}

function resolveExpireAtByPricePlan(pricePlan) {
    const days = Number(pricePlan?.durationDays);
    if (!Number.isFinite(days) || days <= 0) {
        return null;
    }
    return new Date(Date.now() + (days * 24 * 60 * 60 * 1000));
}

function computeAvatarSellGoldAmount(item) {
    const goldPrice = pickAvatarCatalogPriceAmount(item, 'gold');
    if (goldPrice <= 0) {
        return 0;
    }
    return Math.max(0, Math.floor(goldPrice * 0.06));
}

function createEmptyUserEquipState() {
    return {
        ahead: 0,
        abody: 0,
        aeyes: null,
        aflag: null,
        abackground: null,
        aforeground: null,
        aexitem: null
    };
}

function assignEquipSlotValue(target, slot, itemId) {
    const parsed = toOptionalAvatarValue(itemId);
    if (!slot) {
        return;
    }
    if (slot === 'head') {
        target.ahead = toBaseAvatarValue(parsed);
    } else if (slot === 'body') {
        target.abody = toBaseAvatarValue(parsed);
    } else if (slot === 'eyes') {
        target.aeyes = parsed;
    } else if (slot === 'flag') {
        target.aflag = parsed;
    } else if (slot === 'background') {
        target.abackground = parsed;
    } else if (slot === 'foreground') {
        target.aforeground = parsed;
    } else if (slot === 'exitem') {
        target.aexitem = parsed;
    }
}

async function loadUserEquipState(ownerId, executor = pool) {
    const [rows] = await executor.execute(
        `SELECT slot, item_id
         FROM chest
         WHERE owner_id = ? AND wearing = 1`,
        [ownerId]
    );

    const equipState = createEmptyUserEquipState();
    (rows || []).forEach((row) => {
        const slot = normalizeChestSlot(row?.slot);
        if (!slot) {
            return;
        }
        assignEquipSlotValue(equipState, slot, row?.item_id);
    });
    return equipState;
}

async function loadAvatarShopInventoryRows(ownerId, executor = pool) {
    const [rows] = await executor.execute(
        `SELECT
            c.id AS chest_id,
            c.owner_id AS chest_owner_id,
            c.avatar_id AS chest_avatar_id,
            c.item_id AS chest_item_id,
            c.item_code AS chest_item_code,
            c.slot AS chest_slot,
            c.wearing AS chest_wearing,
            c.acquisition_type AS chest_acquisition_type,
            c.expire_at AS chest_expire_at,
            c.volume AS chest_volume,
            c.place_order AS chest_place_order,
            c.recovered AS chest_recovered,
            c.expire_type AS chest_expire_type,
            a.id AS avatar_db_id,
            a.source_avatar_id AS source_avatar_id,
            a.source_ref_id AS source_ref_id,
            a.avatar_code AS avatar_code,
            a.name AS name,
            a.description AS description,
            a.slot AS avatar_slot,
            a.gender AS gender,
            a.note AS note,
            a.gold_week AS gold_week,
            a.gold_month AS gold_month,
            a.gold_perm AS gold_perm,
            a.cash_week AS cash_week,
            a.cash_month AS cash_month,
            a.cash_perm AS cash_perm,
            a.stat_pop AS stat_pop,
            a.stat_time AS stat_time,
            a.stat_atk AS stat_atk,
            a.stat_def AS stat_def,
            a.stat_life AS stat_life,
            a.stat_item AS stat_item,
            a.stat_dig AS stat_dig,
            a.stat_shld AS stat_shld
         FROM chest c
         LEFT JOIN avatars a ON a.id = c.avatar_id
         WHERE c.owner_id = ?
         ORDER BY
            c.place_order ASC,
            c.id ASC`,
        [ownerId]
    );
    return rows || [];
}

function normalizeAvatarShopInventoryItem(row) {
    const slot = normalizeChestSlot(row?.chest_slot) || normalizeChestSlot(row?.avatar_slot);
    const sourceRefId = toOptionalAvatarValue(row?.source_ref_id);
    const itemId = toOptionalAvatarValue(row?.chest_item_id);
    const resolvedRefId = sourceRefId == null ? itemId : sourceRefId;
    return {
        chest_id: toBaseAvatarValue(row?.chest_id),
        owner_id: String(row?.chest_owner_id || ''),
        avatar_id: toOptionalAvatarValue(row?.avatar_db_id ?? row?.chest_avatar_id),
        source_avatar_id: toBaseAvatarValue(row?.source_avatar_id),
        source_ref_id: resolvedRefId,
        item_id: itemId,
        avatar_code: String(row?.avatar_code || row?.chest_item_code || ''),
        item_code: String(row?.chest_item_code || row?.avatar_code || ''),
        name: String(row?.name || row?.avatar_code || row?.chest_item_code || ''),
        description: String(row?.description || ''),
        slot: slot || 'head',
        gender: normalizeAvatarCatalogGender(row?.gender),
        note: toBaseAvatarValue(row?.note),
        gold_week: toBaseAvatarValue(row?.gold_week),
        gold_month: toBaseAvatarValue(row?.gold_month),
        gold_perm: toBaseAvatarValue(row?.gold_perm),
        cash_week: toBaseAvatarValue(row?.cash_week),
        cash_month: toBaseAvatarValue(row?.cash_month),
        cash_perm: toBaseAvatarValue(row?.cash_perm),
        stat_pop: toSignedAvatarStatValue(row?.stat_pop),
        stat_time: toSignedAvatarStatValue(row?.stat_time),
        stat_atk: toSignedAvatarStatValue(row?.stat_atk),
        stat_def: toSignedAvatarStatValue(row?.stat_def),
        stat_life: toSignedAvatarStatValue(row?.stat_life),
        stat_item: toSignedAvatarStatValue(row?.stat_item),
        stat_dig: toSignedAvatarStatValue(row?.stat_dig),
        stat_shld: toSignedAvatarStatValue(row?.stat_shld),
        wearing: Number(row?.chest_wearing) === 1 ? 1 : 0,
        acquisition_type: String(row?.chest_acquisition_type || 'G'),
        expire_type: String(row?.chest_expire_type || 'I'),
        expire_at: row?.chest_expire_at ? new Date(row.chest_expire_at).getTime() : null,
        volume: toBaseAvatarValue(row?.chest_volume || 1),
        place_order: Number.isFinite(Number(row?.chest_place_order)) ? Math.trunc(Number(row?.chest_place_order)) : 0
    };
}

function buildAvatarShopInventoryPayload(rows) {
    const items = (rows || []).map(normalizeAvatarShopInventoryItem);
    const regularItems = items.filter((item) => !isChestExSlot(item.slot));
    const exItems = items.filter((item) => isChestExSlot(item.slot));

    const equipped = createEmptyUserEquipState();
    items.forEach((item) => {
        if (item.wearing !== 1) {
            return;
        }
        const equippedRefId = item.source_ref_id == null ? item.item_id : item.source_ref_id;
        assignEquipSlotValue(equipped, normalizeChestSlot(item.slot), equippedRefId);
    });

    return {
        items,
        regularItems,
        exItems,
        counts: {
            total: items.length,
            regular: regularItems.length,
            ex: exItems.length
        },
        equipped
    };
}

async function loadUserRowById(userId, executor = pool) {
    const [rows] = await executor.execute(
        `SELECT u.UserId, u.Authority, u.Gender, g.Nickname, g.Guild, g.Gold, g.Cash, g.TotalScore, g.TotalGrade, g.TotalRank
         FROM user u
         JOIN game g ON u.UserId = g.Id
         WHERE u.UserId = ?
         LIMIT 1`,
        [userId]
    );
    return rows?.[0] || null;
}

async function buildUserPayloadById(userId, executor = pool) {
    const userRow = await loadUserRowById(userId, executor);
    if (!userRow) {
        return null;
    }
    const equipState = await loadUserEquipState(userId, executor);
    return buildUserPayload({
        ...userRow,
        ...equipState
    });
}


app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Root redirect
app.get('/', (req, res) => {
    res.redirect('/views/index.html');
});

// Backward-compatible routes after moving HTML files into /views
const viewRedirects = {
    '/index.html': '/views/index.html',
    '/world_list.html': '/views/world_list.html',
    '/lobby.html': '/views/lobby.html',
    '/avatar_shop.html': '/views/avatar_shop.html',
    '/create_account.html': '/views/create_account.html'
};

Object.entries(viewRedirects).forEach(([from, to]) => {
    app.get(from, (req, res) => {
        res.redirect(to);
    });
});

// DB Connection Pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gunbound',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Signup Endpoint
app.post('/api/signup', async (req, res) => {
    const { username, nickname, gender, password, email } = req.body;
    const normalizedGender = normalizeGender(gender);

    const authority = 0;
    const gold = 10000;
    const cash = 10000;
    const score = 1000;
    const grade = 24;

    try {
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            await connection.execute(
                `INSERT INTO user (UserId, Gender, Password, Status, Authority, E_Mail, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [username, normalizedGender, password, 'OK', authority, email]
            );

            await connection.execute(
                `INSERT INTO game (Id, Nickname, Gold, Cash, TotalScore, TotalGrade, SeasonScore, SeasonGrade) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [username, nickname, gold, cash, score, grade, score, grade]
            );

            await connection.commit();
            res.status(201).json({
                message: 'Account created successfully',
                user: {
                    id: username,
                    nickname: nickname,
                    guild: '',
                    authority: authority,
                    gender: normalizedGender,
                    ahead: 0,
                    abody: 0,
                    aeyes: null,
                    aflag: null,
                    abackground: null,
                    aforeground: null,
                    aexitem: null,
                    gold: gold,
                    cash: cash,
                    score: score,
                    grade: grade,
                    rank: 0
                }
            });
        } catch (err) {
            await connection.rollback();
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'Username or Nickname already exists' });
            }
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Ranking Logic Function
async function updateRanks() {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute(
            `    SELECT g.Id, g.TotalScore, g.TotalGrade, g.TotalRank, u.created_at, u.Authority
             FROM game g
             JOIN user u ON g.Id = u.UserId
             ORDER BY g.TotalScore DESC, u.created_at ASC`
        );

        const dynamicRankPlayers = [];
        const fixedRankUpdates = [];
        let currentPosition = 1;

        const getRankByFixedGps = (gp) => {
            if (gp >= 6000) return 9;
            if (gp >= 5100) return 10;
            if (gp >= 4200) return 11;
            if (gp >= 3500) return 12;
            if (gp >= 2800) return 13;
            if (gp >= 2300) return 14;
            if (gp >= 1800) return 15;
            if (gp >= 1500) return 16;
            if (gp >= 1200) return 17;
            if (gp >= 1100) return 18;
            return 19;
        };

        for (const player of rows) {
            // GM Authority check
            if (player.Authority === 100) {
                fixedRankUpdates.push({ Id: player.Id, Grade: 25, Rank: 0 });
                continue;
            }

            const gp = player.TotalScore;
            const pos = currentPosition++;

            if (gp < 6900) {
                const innerRank = getRankByFixedGps(gp); // 9 to 19
                fixedRankUpdates.push({ Id: player.Id, Grade: innerRank + 5, Rank: pos });
            } else {
                dynamicRankPlayers.push({ ...player, gp, pos });
            }
        }

        const dynamicRankUpdates = [];
        const numDynamic = dynamicRankPlayers.length;

        if (numDynamic > 0) {
            let grades = [];
            grades.push(-4 + 5); // Grade 1
            for (let i = 0; i < 4; i++) grades.push(-3 + 5); // Grade 2
            for (let i = 0; i < 16; i++) grades.push(-2 + 5); // Grade 3

            const remaining = Math.max(0, numDynamic - 21);
            if (remaining > 0) {
                const percentages = [85, 65, 45, 25, 15, 10, 5, 3, 1];
                let currentInnerRank = -1;
                let distributed = 0;

                for (let i = percentages.length - 1; i >= 0; i--) {
                    const count = Math.max(1, Math.round((remaining * percentages[i]) / 100));
                    const toAdd = Math.min(count, remaining - distributed);
                    for (let j = 0; j < toAdd; j++) {
                        grades.push(currentInnerRank + 5);
                    }
                    distributed += toAdd;
                    currentInnerRank++;
                }

                while (grades.length < numDynamic) {
                    grades.push(7 + 5); // Grade 12
                }
            }

            for (let i = 0; i < numDynamic; i++) {
                const p = dynamicRankPlayers[i];
                dynamicRankUpdates.push({ Id: p.Id, Grade: grades[i] || 13, Rank: p.pos });
            }
        }

        const allUpdates = [...fixedRankUpdates, ...dynamicRankUpdates];
        for (const up of allUpdates) {
            await connection.execute(
                'UPDATE game SET TotalGrade = ?, TotalRank = ? WHERE Id = ?',
                [up.Grade, up.Rank, up.Id]
            );
        }
    } catch (err) {
        console.error('[Ranking] Error updating ranks:', err);
    } finally {
        if (connection) connection.release();
    }
}

// Schedule Ranking
updateRanks(); // Run on startup
setInterval(updateRanks, 30 * 60 * 1000); // Every 30 minutes

// ─── LOGIN ───────────────────────────────────
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const [users] = await pool.execute(
            `    SELECT u.UserId, u.Authority, u.Gender, g.Nickname, g.Guild, g.Gold, g.Cash, g.TotalScore, g.TotalGrade, g.TotalRank
             FROM user u
             JOIN game g ON u.UserId = g.Id
             WHERE u.UserId = ? AND u.Password = ?`,
            [username, password]
        );

        if (users.length > 0) {
            const user = users[0];
            const equipState = await loadUserEquipState(user.UserId);
            res.status(200).json({
                message: 'Login successful',
                user: buildUserPayload({
                    ...user,
                    ...equipState
                })
            });
        } else {
            res.status(401).json({ error: 'Invalid username or password' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// ─── WORLDS ──────────────────────────────────
app.get('/api/avatar-shop/catalog', async (req, res) => {
    const nowMs = Date.now();
    try {
        const [rows] = await pool.execute('SELECT * FROM avatars');
        const normalized = (rows || [])
            .map((row) => {
                const sourceAvatarId = row?.source_avatar_id ?? row?.SourceAvatarId ?? row?.sourceAvatarId;
                const sourceRefId = row?.source_ref_id ?? row?.SourceRefId ?? row?.sourceRefId ?? row?.ref_id ?? row?.RefId ?? null;
                const avatarCode = row?.avatar_code ?? row?.AvatarCode ?? row?.item_code ?? row?.ItemCode ?? '';
                const itemName = row?.name ?? row?.Name ?? avatarCode;
                const noteValue = row?.note ?? row?.Note ?? '';
                const descriptionValue = row?.description ?? row?.Description ?? '';
                const slotValue = row?.slot ?? row?.Slot ?? row?.category ?? row?.Category;
                const genderValue = row?.gender ?? row?.Gender;
                const setKey = row?.set_key ?? row?.SetKey ?? null;
                const removeTimeRaw = row?.remove_time ?? row?.RemoveTime ?? null;
                const enabledRaw = row?.enabled ?? row?.Enabled;
                const removeTime = toOptionalAvatarValue(removeTimeRaw);
                const noteFlag = toBaseAvatarValue(noteValue) === 1 ? 1 : 0;
                const descriptionText = String(descriptionValue ?? '').trim();
                const enabled = enabledRaw === undefined || enabledRaw === null
                    ? 1
                    : (Number(enabledRaw) === 1 ? 1 : 0);
                return {
                    id: toBaseAvatarValue(row?.id),
                    source_avatar_id: toBaseAvatarValue(sourceAvatarId),
                    source_ref_id: toOptionalAvatarValue(sourceRefId),
                    avatar_code: String(avatarCode || ''),
                    name: String(itemName || avatarCode || ''),
                    note: noteFlag,
                    description: descriptionText,
                    slot: normalizeAvatarCatalogSlot(slotValue),
                    gender: normalizeAvatarCatalogGender(genderValue),
                    set_key: setKey == null ? null : String(setKey),
                    remove_time: removeTime,
                    gold_week: toBaseAvatarValue(row?.gold_week),
                    gold_month: toBaseAvatarValue(row?.gold_month),
                    gold_perm: toBaseAvatarValue(row?.gold_perm),
                    cash_week: toBaseAvatarValue(row?.cash_week),
                    cash_month: toBaseAvatarValue(row?.cash_month),
                    cash_perm: toBaseAvatarValue(row?.cash_perm),
                    stat_pop: toSignedAvatarStatValue(row?.stat_pop),
                    stat_time: toSignedAvatarStatValue(row?.stat_time),
                    stat_atk: toSignedAvatarStatValue(row?.stat_atk),
                    stat_def: toSignedAvatarStatValue(row?.stat_def),
                    stat_life: toSignedAvatarStatValue(row?.stat_life),
                    stat_item: toSignedAvatarStatValue(row?.stat_item),
                    stat_dig: toSignedAvatarStatValue(row?.stat_dig),
                    stat_shld: toSignedAvatarStatValue(row?.stat_shld),
                    is_unlocked: toBaseAvatarValue(row?.is_unlocked ?? 1),
                    enabled
                };
            })
            .filter((item) =>
                item.enabled === 1
                && (item.remove_time === null || item.remove_time === 0 || item.remove_time > nowMs)
                && hasAvatarCatalogPrice(item)
            )
            .sort((a, b) => {
                const codeCompare = String(a.avatar_code).localeCompare(String(b.avatar_code));
                if (codeCompare !== 0) {
                    return codeCompare;
                }
                return Number(a.id) - Number(b.id);
            });

        const deduped = [];
        const seen = new Set();
        for (const item of normalized) {
            const dedupeKey = getAvatarCatalogDedupeKey(item);
            if (seen.has(dedupeKey)) {
                continue;
            }
            seen.add(dedupeKey);
            deduped.push(item);
        }

        res.json({ items: deduped });
    } catch (error) {
        console.warn(`[AvatarShop] Catalog load fallback to empty list (${error?.code || 'UNKNOWN'}):`, error?.message || error);
        res.json({ items: [] });
    }
});

app.get('/api/avatar-shop/inventory', async (req, res) => {
    const userId = String(req.query?.userId || '').trim();
    if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
    }

    try {
        const userPayload = await buildUserPayloadById(userId);
        if (!userPayload) {
            return res.status(404).json({ error: 'User not found' });
        }

        const inventoryRows = await loadAvatarShopInventoryRows(userId);
        res.json({
            user: userPayload,
            inventory: buildAvatarShopInventoryPayload(inventoryRows)
        });
    } catch (error) {
        console.error('[AvatarShop] Failed to load inventory:', error);
        res.status(500).json({ error: 'Unable to load inventory' });
    }
});

app.post('/api/avatar-shop/purchase', async (req, res) => {
    const userId = String(req.body?.userId || '').trim();
    const avatarId = Number(req.body?.avatarId);
    const currency = String(req.body?.currency || '').trim().toLowerCase();

    if (!userId || !Number.isFinite(avatarId) || avatarId <= 0 || (currency !== 'cash' && currency !== 'gold')) {
        return res.status(400).json({ error: 'Invalid purchase payload' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [gameRows] = await connection.execute(
            'SELECT Id, Gold, Cash FROM game WHERE Id = ? LIMIT 1 FOR UPDATE',
            [userId]
        );
        const gameRow = gameRows?.[0] || null;
        if (!gameRow) {
            await connection.rollback();
            return res.status(404).json({ error: 'User not found' });
        }

        const [avatarRows] = await connection.execute(
            'SELECT * FROM avatars WHERE id = ? LIMIT 1',
            [Math.trunc(avatarId)]
        );
        const avatarRow = avatarRows?.[0] || null;
        if (!avatarRow) {
            await connection.rollback();
            return res.status(404).json({ error: 'Avatar item not found' });
        }

        const nowMs = Date.now();
        const enabled = avatarRow.enabled === undefined || avatarRow.enabled === null
            ? 1
            : (Number(avatarRow.enabled) === 1 ? 1 : 0);
        const removeTime = toOptionalAvatarValue(avatarRow.remove_time);
        if (enabled !== 1 || (removeTime !== null && removeTime !== 0 && removeTime <= nowMs)) {
            await connection.rollback();
            return res.status(400).json({ error: 'Avatar item is no longer available' });
        }

        const slot = normalizeChestSlot(avatarRow.slot);
        if (!slot) {
            await connection.rollback();
            return res.status(400).json({ error: 'Avatar slot is invalid' });
        }

        const pricePlan = pickAvatarPricePlan(avatarRow, currency);
        const amount = toBaseAvatarValue(pricePlan?.amount);
        if (amount <= 0) {
            await connection.rollback();
            return res.status(400).json({ error: `This item cannot be purchased with ${currency}` });
        }

        const walletValue = currency === 'cash'
            ? toBaseAvatarValue(gameRow.Cash)
            : toBaseAvatarValue(gameRow.Gold);
        if (walletValue < amount) {
            await connection.rollback();
            return res.status(400).json({ error: `Not enough ${currency}` });
        }

        if (currency === 'cash') {
            await connection.execute(
                'UPDATE game SET Cash = Cash - ? WHERE Id = ?',
                [amount, userId]
            );
        } else {
            await connection.execute(
                'UPDATE game SET Gold = Gold - ? WHERE Id = ?',
                [amount, userId]
            );
        }

        await connection.execute(
            'UPDATE chest SET wearing = 0 WHERE owner_id = ? AND slot = ? AND wearing = 1',
            [userId, slot]
        );

        const isExSlot = isChestExSlot(slot);
        const orderSlotList = isExSlot
            ? ['background', 'foreground', 'exitem']
            : ['head', 'body', 'eyes', 'flag'];
        const orderPlaceholders = orderSlotList.map(() => '?').join(', ');
        const [orderRows] = await connection.execute(
            `SELECT COALESCE(MAX(place_order), 0) AS max_order
             FROM chest
             WHERE owner_id = ?
               AND slot IN (${orderPlaceholders})`,
            [userId, ...orderSlotList]
        );
        const nextPlaceOrder = Math.max(0, Math.trunc(Number(orderRows?.[0]?.max_order || 0))) + 1;

        const sourceRefId = toOptionalAvatarValue(avatarRow.source_ref_id);
        const fallbackItemId = toBaseAvatarValue(avatarRow.source_avatar_id || avatarRow.id);
        const chestItemId = sourceRefId == null ? fallbackItemId : sourceRefId;

        const acquisitionType = currency === 'cash' ? 'C' : 'G';
        const expireAt = resolveExpireAtByPricePlan(pricePlan);
        const expireType = String(pricePlan?.expireType || 'I');

        const [insertResult] = await connection.execute(
            `INSERT INTO chest (
                owner_id, avatar_id, item_id, item_code, slot, wearing,
                acquisition_type, expire_at, volume, place_order, recovered, expire_type
            ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 1, ?, 0, ?)`,
            [
                userId,
                toOptionalAvatarValue(avatarRow.id),
                toBaseAvatarValue(chestItemId),
                String(avatarRow.avatar_code || ''),
                slot,
                acquisitionType,
                expireAt,
                nextPlaceOrder,
                expireType
            ]
        );

        await connection.commit();

        const userPayload = await buildUserPayloadById(userId, connection);
        const inventoryRows = await loadAvatarShopInventoryRows(userId, connection);
        res.json({
            user: userPayload,
            inventory: buildAvatarShopInventoryPayload(inventoryRows),
            purchasedChestId: toBaseAvatarValue(insertResult?.insertId)
        });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (rollbackError) { /* ignore */ }
        }
        console.error('[AvatarShop] Purchase failed:', error);
        res.status(500).json({ error: 'Purchase failed' });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/avatar-shop/equip', async (req, res) => {
    const userId = String(req.body?.userId || '').trim();
    const chestId = Number(req.body?.chestId);

    if (!userId || !Number.isFinite(chestId) || chestId <= 0) {
        return res.status(400).json({ error: 'Invalid equip payload' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [itemRows] = await connection.execute(
            `SELECT id, owner_id, slot
             FROM chest
             WHERE id = ? AND owner_id = ?
             LIMIT 1
             FOR UPDATE`,
            [Math.trunc(chestId), userId]
        );
        const itemRow = itemRows?.[0] || null;
        if (!itemRow) {
            await connection.rollback();
            return res.status(404).json({ error: 'Owned item not found' });
        }

        const slot = normalizeChestSlot(itemRow.slot);
        if (!slot) {
            await connection.rollback();
            return res.status(400).json({ error: 'Owned item slot is invalid' });
        }

        await connection.execute(
            'UPDATE chest SET wearing = 0 WHERE owner_id = ? AND slot = ? AND wearing = 1',
            [userId, slot]
        );
        await connection.execute(
            'UPDATE chest SET wearing = 1 WHERE id = ? AND owner_id = ?',
            [Math.trunc(chestId), userId]
        );

        await connection.commit();

        const userPayload = await buildUserPayloadById(userId, connection);
        const inventoryRows = await loadAvatarShopInventoryRows(userId, connection);
        res.json({
            user: userPayload,
            inventory: buildAvatarShopInventoryPayload(inventoryRows)
        });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (rollbackError) { /* ignore */ }
        }
        console.error('[AvatarShop] Equip failed:', error);
        res.status(500).json({ error: 'Equip failed' });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/avatar-shop/unequip', async (req, res) => {
    const userId = String(req.body?.userId || '').trim();
    const chestId = Number(req.body?.chestId);

    if (!userId || !Number.isFinite(chestId) || chestId <= 0) {
        return res.status(400).json({ error: 'Invalid unequip payload' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [itemRows] = await connection.execute(
            `SELECT
                c.id,
                c.owner_id,
                c.avatar_id,
                c.item_id,
                c.item_code,
                a.name,
                a.avatar_code,
                a.source_avatar_id,
                a.source_ref_id
             FROM chest c
             LEFT JOIN avatars a ON a.id = c.avatar_id
             WHERE c.id = ? AND c.owner_id = ?
             LIMIT 1
             FOR UPDATE`,
            [Math.trunc(chestId), userId]
        );
        const itemRow = itemRows?.[0] || null;
        if (!itemRow) {
            await connection.rollback();
            return res.status(404).json({ error: 'Owned item not found' });
        }

        if (isPowerUserChestRow(itemRow)) {
            await connection.rollback();
            return res.status(400).json({ error: 'Power User cannot be unequipped' });
        }

        await connection.execute(
            'UPDATE chest SET wearing = 0 WHERE id = ? AND owner_id = ?',
            [Math.trunc(chestId), userId]
        );

        await connection.commit();

        const userPayload = await buildUserPayloadById(userId, connection);
        const inventoryRows = await loadAvatarShopInventoryRows(userId, connection);
        res.json({
            user: userPayload,
            inventory: buildAvatarShopInventoryPayload(inventoryRows)
        });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (rollbackError) { /* ignore */ }
        }
        console.error('[AvatarShop] Unequip failed:', error);
        res.status(500).json({ error: 'Unequip failed' });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/avatar-shop/reorder', async (req, res) => {
    const userId = String(req.body?.userId || '').trim();
    const listType = String(req.body?.listType || '').trim().toLowerCase();
    const orderedChestIds = Array.isArray(req.body?.orderedChestIds)
        ? req.body.orderedChestIds.map((value) => Math.trunc(Number(value))).filter((value) => Number.isFinite(value) && value > 0)
        : [];

    if (!userId || (listType !== 'regular' && listType !== 'ex') || orderedChestIds.length <= 1) {
        return res.status(400).json({ error: 'Invalid reorder payload' });
    }

    const uniqueIds = new Set(orderedChestIds);
    if (uniqueIds.size !== orderedChestIds.length) {
        return res.status(400).json({ error: 'Duplicate chest ids are not allowed in reorder payload' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const placeholders = orderedChestIds.map(() => '?').join(', ');
        const [rows] = await connection.execute(
            `SELECT id, slot
             FROM chest
             WHERE owner_id = ?
               AND id IN (${placeholders})
             FOR UPDATE`,
            [userId, ...orderedChestIds]
        );

        if (!rows || rows.length !== orderedChestIds.length) {
            await connection.rollback();
            return res.status(400).json({ error: 'Some items in reorder payload are invalid' });
        }

        const isExList = listType === 'ex';
        const hasMismatchedSlot = rows.some((row) => {
            const slot = normalizeChestSlot(row?.slot);
            if (!slot) {
                return true;
            }
            if (isExList) {
                return !CHEST_EX_SLOTS.has(slot);
            }
            return !CHEST_REGULAR_SLOTS.has(slot);
        });

        if (hasMismatchedSlot) {
            await connection.rollback();
            return res.status(400).json({ error: 'Reorder payload contains items from a different list category' });
        }

        for (let index = 0; index < orderedChestIds.length; index += 1) {
            await connection.execute(
                'UPDATE chest SET place_order = ? WHERE owner_id = ? AND id = ?',
                [index + 1, userId, orderedChestIds[index]]
            );
        }

        await connection.commit();

        const userPayload = await buildUserPayloadById(userId, connection);
        const inventoryRows = await loadAvatarShopInventoryRows(userId, connection);
        res.json({
            user: userPayload,
            inventory: buildAvatarShopInventoryPayload(inventoryRows)
        });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (rollbackError) { /* ignore */ }
        }
        console.error('[AvatarShop] Reorder failed:', error);
        res.status(500).json({ error: 'Reorder failed' });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/avatar-shop/sell', async (req, res) => {
    const userId = String(req.body?.userId || '').trim();
    const chestId = Number(req.body?.chestId);

    if (!userId || !Number.isFinite(chestId) || chestId <= 0) {
        return res.status(400).json({ error: 'Invalid sell payload' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [gameRows] = await connection.execute(
            'SELECT Id FROM game WHERE Id = ? LIMIT 1 FOR UPDATE',
            [userId]
        );
        if (!gameRows?.length) {
            await connection.rollback();
            return res.status(404).json({ error: 'User not found' });
        }

        const [itemRows] = await connection.execute(
            `SELECT
                c.id AS chest_id,
                c.owner_id AS owner_id,
                c.avatar_id AS avatar_id,
                c.item_id AS item_id,
                c.slot AS slot,
                c.wearing AS wearing,
                a.gold_week AS gold_week,
                a.gold_month AS gold_month,
                a.gold_perm AS gold_perm
             FROM chest c
             LEFT JOIN avatars a ON a.id = c.avatar_id
             WHERE c.id = ? AND c.owner_id = ?
             LIMIT 1
             FOR UPDATE`,
            [Math.trunc(chestId), userId]
        );

        const itemRow = itemRows?.[0] || null;
        if (!itemRow) {
            await connection.rollback();
            return res.status(404).json({ error: 'Owned item not found' });
        }

        const sellGoldAmount = computeAvatarSellGoldAmount(itemRow);

        await connection.execute(
            'DELETE FROM chest WHERE id = ? AND owner_id = ?',
            [Math.trunc(chestId), userId]
        );

        if (sellGoldAmount > 0) {
            await connection.execute(
                'UPDATE game SET Gold = Gold + ? WHERE Id = ?',
                [sellGoldAmount, userId]
            );
        }

        await connection.commit();

        const userPayload = await buildUserPayloadById(userId, connection);
        const inventoryRows = await loadAvatarShopInventoryRows(userId, connection);
        res.json({
            user: userPayload,
            inventory: buildAvatarShopInventoryPayload(inventoryRows),
            sellGold: sellGoldAmount
        });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (rollbackError) { /* ignore */ }
        }
        console.error('[AvatarShop] Sell failed:', error);
        res.status(500).json({ error: 'Sell failed' });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/worlds', (req, res) => {
    // Return only 1 world as requested, counting only users in the lobby
    res.json([
        {
            server_name: 'Server 1',
            server_description: 'All',
            server_utilization: getActivePlayerCount(),
            server_capacity: 10,
            server_enabled: true
        }
    ]);
});

io.on('connection', (socket) => {

    // Send current lobby count to new connections (e.g. World List)
    socket.emit('playerCountUpdate', userSockets.size);

    socket.on('set_user_data', async (data) => {
        if (data && data.nickname) {
            let resumedFromReconnect = false;
            // Fetch latest data from DB to ensure sync
            try {
                const existingSocketUser = socketData.get(socket.id);
                const [rows] = await pool.execute(
                    `SELECT u.UserId, u.Authority, u.Gender, g.Nickname, g.Guild, g.Gold, g.Cash, g.TotalScore, g.TotalGrade, g.TotalRank
                     FROM user u
                     JOIN game g ON u.UserId = g.Id
                     WHERE g.Nickname = ?`,
                    [data.nickname]
                );

                if (rows.length > 0) {
                    const dbUser = rows[0];
                    const userId = dbUser.UserId;
                    const nicknameKey = dbUser.Nickname.toLowerCase();
                    const hadPendingDisconnect = pendingDisconnects.has(userId);
                    if (hadPendingDisconnect) {
                        clearTimeout(pendingDisconnects.get(userId));
                        pendingDisconnects.delete(userId);
                        resumedFromReconnect = true;
                    }

                    const previousSocketId = userSockets.get(nicknameKey);
                    const previousSocketData = previousSocketId ? socketData.get(previousSocketId) : null;
                    const alreadyOnlineOnOtherSocket = Boolean(
                        previousSocketData
                        && previousSocketData.id === userId
                        && previousSocketId !== socket.id
                    );
                    const isRepeatIdentificationOnSameSocket = Boolean(
                        existingSocketUser && existingSocketUser.id === userId
                    );
                    const shouldLogLogin = !hadPendingDisconnect
                        && !alreadyOnlineOnOtherSocket
                        && !isRepeatIdentificationOnSameSocket;

                    userSockets.set(dbUser.Nickname.toLowerCase(), socket.id);
                    socketData.set(socket.id, {
                        nickname: dbUser.Nickname,
                        id: dbUser.UserId,
                        gender: dbUser.Gender,
                        grade: dbUser.TotalGrade,
                        guild: dbUser.Guild,
                        authority: dbUser.Authority,
                        location: data.location || 'unknown',
                        serverId: data.location === 'world_list' ? 0 : 1,
                        channelId: data.location === 'channel' ? 1 : (data.location === 'in_game' ? (data.roomId || 1) : 0)
                    });

                    // Send updated user info back to client
                    const equipState = await loadUserEquipState(dbUser.UserId);
                    socket.emit('user_info_update', buildUserPayload({
                        ...dbUser,
                        ...equipState
                    }));

                    if (shouldLogLogin) {
                        console.log(`[Login] [${getUKTimestamp()}] ${data.nickname} logged in.`);
                    }
                }
            } catch (err) {
                console.error('[UserSync] Error fetching latest data:', err);
            }

            io.emit('playerCountUpdate', getActivePlayerCount());

            // Automatically send buddy list on identification
            // Wait, we need the user id, which we now have from dbUser
            const currentData = socketData.get(socket.id);
            if (currentData) {
                sendBuddyList(socket, currentData.id);
                if (!resumedFromReconnect) {
                    notifyBuddiesOfStatusChange(currentData.id, 0);
                }
                broadcastChannelUsers(currentData.channelId);
            }
        }
    });

    socket.on('lobby_message', (message) => {
        const user = socketData.get(socket.id);
        if (user && message && message.trim() !== '') {
            const trimmedMessage = message.trim();

            // Check for commands
            if (trimmedMessage.startsWith('/')) {
                const Commands = require('./commands');
                Commands.handle(io, socket, user, trimmedMessage);
                return;
            }

            console.log(`[Chat] [${getUKTimestamp()}] ${user.nickname} to Lobby/Channel: ${trimmedMessage}`);

            // Broadcasting to users in the same channel
            const usersInChannel = [];
            for (const [sId, data] of socketData.entries()) {
                if (data.location === 'channel' && data.channelId === user.channelId) {
                    io.to(sId).emit('lobby_message', {
                        nickname: user.nickname,
                        guild: user.guild,
                        message: trimmedMessage,
                        authority: user.authority,
                        type: 'user'
                    });
                }
            }
        }
    });

    socket.on('switch_channel', (newChannelId) => {
        const user = socketData.get(socket.id);
        if (user && user.location === 'channel') {
            const oldChannelId = user.channelId;
            user.channelId = parseInt(newChannelId);
            
            // Re-broadcast user lists for both channels
            broadcastChannelUsers(oldChannelId);
            broadcastChannelUsers(user.channelId);

            // Notify buddies of the channel status change
            notifyBuddiesOfStatusChange(user.id, 0);
        }
    });

    socket.on('private_message', (data) => {
        const { toNickname, message } = data;
        const sender = socketData.get(socket.id);
        if (!sender || !toNickname || !message || message.trim() === '') return;

        console.log(`[Whisper] [${getUKTimestamp()}] ${sender.nickname} to ${toNickname}: ${message.trim()}`);

        const targetSocketId = userSockets.get(toNickname.toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit('private_message', {
                fromNickname: sender.nickname,
                message: message.trim()
            });
        }
    });

    function broadcastChannelUsers(channelId) {
        if (!channelId) return;
        const channelUsers = [];
        for (const [sId, data] of socketData.entries()) {
            if (data.location === 'channel' && data.channelId === channelId) {
                channelUsers.push({
                    id: data.id,
                    nickname: data.nickname,
                    gender: data.gender,
                    grade: data.grade,
                    guild: data.guild
                });
            }
        }
        for (const [sId, data] of socketData.entries()) {
            const userData = socketData.get(sId);
            if (userData && userData.location === 'channel' && userData.channelId === channelId) {
                io.to(sId).emit('channel_users', channelUsers);
            }
        }
    }

    async function sendBuddyList(socket, userId) {
        try {
            const connection = await pool.getConnection();
            try {
                const [buddies] = await connection.execute(
                    `SELECT b.Buddy as id, g.Nickname, g.TotalGrade as Grade, g.Guild 
                     FROM buddylist b
                     JOIN game g ON b.Buddy = g.Id
                     WHERE b.Id = ?`,
                    [userId]
                );

                const buddyListData = buddies.map(b => {
                    const buddyNicknameKey = b.Nickname.toLowerCase();
                    const isOnline = userSockets.has(buddyNicknameKey);
                    let location = 'offline';
                    let serverId = 0;
                    let channelId = 0;

                    if (isOnline) {
                        const buddySocketId = userSockets.get(buddyNicknameKey);
                        const buddyData = socketData.get(buddySocketId);
                        location = buddyData ? buddyData.location : 'online';
                        serverId = buddyData ? buddyData.serverId : 0;
                        channelId = buddyData ? buddyData.channelId : 0;
                    }

                    return {
                        id: b.id,
                        nickname: b.Nickname,
                        grade: b.Grade,
                        guild: b.Guild,
                        online: isOnline,
                        location: location,
                        serverId: serverId || 0,
                        channelId: channelId || 0
                    };
                });

                const onlineCount = buddyListData.filter(b => b.online).length;
                const totalCount = buddyListData.length;

                socket.emit('buddy_list_data', {
                    buddies: buddyListData,
                    onlineCount,
                    totalCount
                });
            } catch (err) {
                console.error('[Buddy] Error fetching list:', err);
            } finally {
                connection.release();
            }
        } catch (error) {
            console.error('[Buddy] Connection Error:', error);
        }
    }

    async function notifyBuddiesOfStatusChange(userId, delay = 0) {
        // Clear any pending notification for this user if we are sending an update (immediate or delayed)
        if (pendingNotifications.has(userId)) {
            clearTimeout(pendingNotifications.get(userId));
            pendingNotifications.delete(userId);
        }

        if (delay > 0) {
            const timeoutId = setTimeout(() => {
                pendingNotifications.delete(userId);
                notifyBuddiesOfStatusChange(userId, 0); // Execute immediately after delay
            }, delay);
            pendingNotifications.set(userId, timeoutId);
            return;
        }

        try {
            const connection = await pool.getConnection();
            try {
                const [friendsOnline] = await connection.execute(
                    `SELECT g.Nickname, g.Id
                     FROM buddylist b
                     JOIN game g ON b.Id = g.Id
                     WHERE b.Buddy = ?`,
                    [userId]
                );

                for (const friend of friendsOnline) {
                    const friendSocketId = userSockets.get(friend.Nickname.toLowerCase());
                    if (friendSocketId) {
                        const friendSocket = io.sockets.sockets.get(friendSocketId);
                        if (friendSocket) {
                            sendBuddyList(friendSocket, friend.Id);
                        }
                    }
                }
            } finally {
                connection.release();
            }
        } catch (error) {
            console.error('[Buddy] Error notifying buddies:', error);
        }
    }

    socket.on('leave_lobby', () => {
        const data = socketData.get(socket.id);
        if (data) {
            const userId = data.id;
            const nickname = data.nickname;
            const nicknameKey = nickname.toLowerCase();
            const linkedSocketId = userSockets.get(nicknameKey);
            if (linkedSocketId === socket.id) {
                userSockets.delete(nicknameKey);
            }
            socketData.delete(socket.id);
            io.emit('playerCountUpdate', getActivePlayerCount());

            broadcastChannelUsers(data.channelId);
        }
    });

    socket.on('send_buddy_request', (targetNickname) => {
        const sender = socketData.get(socket.id);
        if (!sender) return;

        console.log(`[Buddy] [${getUKTimestamp()}] ${sender.nickname} is trying to add ${targetNickname}`);

        const targetSocketId = userSockets.get(targetNickname.toLowerCase());
        if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
            io.to(targetSocketId).emit('incoming_buddy_request', {
                fromNickname: sender.nickname,
                fromId: sender.id
            });
        }
        // No specific error if offline, as per user's "wait for answer" requirement
    });

    socket.on('get_buddy_list', async () => {
        const user = socketData.get(socket.id);
        if (user) {
            sendBuddyList(socket, user.id);
        }
    });

    socket.on('respond_buddy_request', async (data) => {
        const { fromNickname, fromId, accepted } = data;
        const receiver = socketData.get(socket.id);
        if (!receiver) return;

        const senderSocketId = userSockets.get(fromNickname.toLowerCase());

        if (accepted) {
            try {
                const connection = await pool.getConnection();
                try {
                    await connection.beginTransaction();

                    // Mutual insert into buddylist
                    // Schema: Id, Category, Buddy
                    // Assuming Category 'Friend' (0) for now
                    await connection.execute(
                        'INSERT IGNORE INTO buddylist (Id, Category, Buddy) VALUES (?, ?, ?)',
                        [receiver.id, 'Friend', fromId]
                    );
                    await connection.execute(
                        'INSERT IGNORE INTO buddylist (Id, Category, Buddy) VALUES (?, ?, ?)',
                        [fromId, 'Friend', receiver.id]
                    );

                    await connection.commit();
                    console.log(`[Buddy] [${getUKTimestamp()}] ${receiver.nickname} accepted buddy request from ${fromNickname}`);

                    // Refresh buddy list instantly
                    sendBuddyList(socket, receiver.id);
                    if (senderSocketId && io.sockets.sockets.get(senderSocketId)) {
                        sendBuddyList(io.sockets.sockets.get(senderSocketId), fromId);
                    }

                    if (senderSocketId) {
                        io.to(senderSocketId).emit('buddy_request_accepted', { nickname: receiver.nickname });
                    }
                } catch (err) {
                    await connection.rollback();
                    console.error('[Buddy] DB Error on accept:', err);
                } finally {
                    connection.release();
                }
            } catch (error) {
                console.error('[Buddy] Connection Error:', error);
            }
        } else {
            console.log(`[Buddy] [${getUKTimestamp()}] ${receiver.nickname} rejected buddy request from ${fromNickname}`);
            if (senderSocketId) {
                io.to(senderSocketId).emit('buddy_request_rejected', { nickname: receiver.nickname });
            }
        }
    });

    socket.on('delete_buddy', async (targetId) => {
        const user = socketData.get(socket.id);
        if (!user) return;

        try {
            const connection = await pool.getConnection();
            try {
                await connection.beginTransaction();

                await connection.execute(
                    'DELETE FROM buddylist WHERE (Id = ? AND Buddy = ?) OR (Id = ? AND Buddy = ?)',
                    [user.id, targetId, targetId, user.id]
                );

                await connection.commit();
                console.log(`[Buddy] [${getUKTimestamp()}] ${user.nickname} deleted a buddy (ID: ${targetId})`);

                // Send updated list to the user who deleted
                sendBuddyList(socket, user.id);

                // Find the target's socket
                let targetSocketId = null;
                for (const [sId, data] of socketData.entries()) {
                    if (data.id === targetId) {
                        targetSocketId = sId;
                        break;
                    }
                }

                if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
                    sendBuddyList(io.sockets.sockets.get(targetSocketId), targetId);
                }

            } catch (err) {
                await connection.rollback();
                console.error('[Buddy] DB Error on delete:', err);
            } finally {
                connection.release();
            }
        } catch (error) {
            console.error('[Buddy] Connection Error:', error);
        }
    });

    socket.on('disconnect', () => {
        const data = socketData.get(socket.id);
        if (data) {
            const userId = data.id;
            const nickname = data.nickname;
            const nicknameKey = nickname.toLowerCase();
            const linkedSocketId = userSockets.get(nicknameKey);
            const isCurrentLinkedSocket = linkedSocketId === socket.id;
            const disconnectedChannelId = data.channelId;

            if (isCurrentLinkedSocket) {
                userSockets.delete(nicknameKey);
            }

            socketData.delete(socket.id);
            if (isCurrentLinkedSocket) {
                if (pendingDisconnects.has(userId)) {
                    clearTimeout(pendingDisconnects.get(userId));
                    pendingDisconnects.delete(userId);
                }

                const timeoutId = setTimeout(() => {
                    pendingDisconnects.delete(userId);
                    const activeSocketId = userSockets.get(nicknameKey);
                    const activeSocketData = activeSocketId ? socketData.get(activeSocketId) : null;
                    const isStillOnline = Boolean(activeSocketData && activeSocketData.id === userId);
                    if (isStillOnline) {
                        return;
                    }
                    console.log(`[Logoff] [${getUKTimestamp()}] ${nickname} logged off.`);
                    notifyBuddiesOfStatusChange(userId, 100);
                }, RECONNECT_GRACE_MS);

                pendingDisconnects.set(userId, timeoutId);
            }
            io.emit('playerCountUpdate', getActivePlayerCount());
            broadcastChannelUsers(disconnectedChannelId);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
