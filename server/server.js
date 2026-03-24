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
const lastKnownPresence = new Map(); // userId -> { location, serverId, channelId, roomId }
const activeGameRooms = new Map(); // roomKey -> Set(userId)
const userGameRoomMembership = new Map(); // userId -> roomKey
const gameRoomNumbers = new Map(); // roomKey -> room number
const gameRoomDisabledItems = new Map(); // roomKey -> Set("page:index")
const RECONNECT_GRACE_MS = 2500;
const WORLD_LIST_DISCONNECT_GRACE_MS = 150;

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

function normalizeGameRoomKey(roomKey, userId) {
    const rawRoomKey = String(roomKey || '').trim();
    if (rawRoomKey) {
        return rawRoomKey;
    }
    return `room:${String(userId || '').trim() || 'guest'}`;
}

function getUsedGameRoomNumbers() {
    const used = new Set();
    for (const value of gameRoomNumbers.values()) {
        const numeric = Math.trunc(Number(value));
        if (Number.isFinite(numeric) && numeric > 0) {
            used.add(numeric);
        }
    }
    return used;
}

function allocateGameRoomNumber() {
    const used = getUsedGameRoomNumbers();
    let candidate = 1;
    while (used.has(candidate)) {
        candidate += 1;
    }
    return candidate;
}

function getGameRoomNumberForKey(roomKey) {
    const normalizedKey = String(roomKey || '').trim();
    if (!normalizedKey) return 0;
    return Math.trunc(Number(gameRoomNumbers.get(normalizedKey) || 0));
}

function isUserGameRoomMaster(userId, roomKey) {
    const normalizedUserId = String(userId || '').trim();
    const normalizedRoomKey = String(roomKey || '').trim();
    if (!normalizedUserId || !normalizedRoomKey) return false;

    const members = activeGameRooms.get(normalizedRoomKey);
    if (!members || members.size <= 0) return false;

    const firstMember = members.values().next().value;
    return String(firstMember || '').trim() === normalizedUserId;
}

function getGameRoomMemberCount(roomKey) {
    const normalizedRoomKey = String(roomKey || '').trim();
    if (!normalizedRoomKey) return 0;
    const members = activeGameRooms.get(normalizedRoomKey);
    return members ? members.size : 0;
}

function getGameRoomDisabledItemSet(roomKey) {
    const normalizedRoomKey = String(roomKey || '').trim();
    if (!normalizedRoomKey) {
        return null;
    }
    let set = gameRoomDisabledItems.get(normalizedRoomKey);
    if (!set) {
        set = new Set();
        gameRoomDisabledItems.set(normalizedRoomKey, set);
    }
    return set;
}

function getSerializedGameRoomDisabledItems(roomKey) {
    const normalizedRoomKey = String(roomKey || '').trim();
    if (!normalizedRoomKey) return [];
    const set = gameRoomDisabledItems.get(normalizedRoomKey);
    if (!set) return [];
    return Array.from(set);
}

function syncSocketGameRoomNumbers(notifyClients = false) {
    for (const [socketId, presence] of socketData.entries()) {
        if (!presence) continue;
        if (String(presence.location || '').toLowerCase() !== 'game_room') continue;

        const resolvedRoomId = getGameRoomNumberForKey(presence.roomKey);
        presence.roomId = resolvedRoomId > 0 ? resolvedRoomId : 1;

        if (notifyClients) {
            const targetSocket = io.sockets.sockets.get(socketId);
            if (targetSocket) {
                io.to(socketId).emit('game_room_presence', {
                    roomId: Number(presence.roomId || 1),
                    roomKey: String(presence.roomKey || ''),
                    isMaster: isUserGameRoomMaster(presence.id, presence.roomKey),
                    memberCount: getGameRoomMemberCount(presence.roomKey)
                });
            }
        }
    }
}

function removeUserFromGameRoom(userId) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) {
        return false;
    }

    const previousRoomKey = userGameRoomMembership.get(normalizedUserId);
    if (!previousRoomKey) {
        return false;
    }

    const members = activeGameRooms.get(previousRoomKey);
    if (members) {
        members.delete(normalizedUserId);
        if (members.size <= 0) {
            activeGameRooms.delete(previousRoomKey);
            gameRoomNumbers.delete(previousRoomKey);
            gameRoomDisabledItems.delete(previousRoomKey);
        }
    }

    userGameRoomMembership.delete(normalizedUserId);
    syncSocketGameRoomNumbers(true);
    return true;
}

function assignUserToGameRoom(userId, roomKey) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) {
        return { roomKey: '', roomId: 0, topologyChanged: false };
    }

    const normalizedRoomKey = normalizeGameRoomKey(roomKey, normalizedUserId);
    const previousRoomKey = userGameRoomMembership.get(normalizedUserId);
    let topologyChanged = false;

    if (previousRoomKey && previousRoomKey !== normalizedRoomKey) {
        const previousMembers = activeGameRooms.get(previousRoomKey);
        if (previousMembers) {
            previousMembers.delete(normalizedUserId);
            if (previousMembers.size <= 0) {
                activeGameRooms.delete(previousRoomKey);
                gameRoomNumbers.delete(previousRoomKey);
                gameRoomDisabledItems.delete(previousRoomKey);
            }
        }
        topologyChanged = true;
    }

    let members = activeGameRooms.get(normalizedRoomKey);
    if (!members) {
        members = new Set();
        activeGameRooms.set(normalizedRoomKey, members);
        if (!gameRoomNumbers.has(normalizedRoomKey)) {
            gameRoomNumbers.set(normalizedRoomKey, allocateGameRoomNumber());
        }
        topologyChanged = true;
    }

    const sizeBefore = members.size;
    members.add(normalizedUserId);
    if (members.size !== sizeBefore) {
        topologyChanged = true;
    }

    userGameRoomMembership.set(normalizedUserId, normalizedRoomKey);

    if (!gameRoomNumbers.has(normalizedRoomKey)) {
        gameRoomNumbers.set(normalizedRoomKey, allocateGameRoomNumber());
    }

    if (topologyChanged) {
        syncSocketGameRoomNumbers(true);
    }

    return {
        roomKey: normalizedRoomKey,
        roomId: getGameRoomNumberForKey(normalizedRoomKey) || 1,
        topologyChanged
    };
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
        guildrank: row.guildrank,
        membercount: row.membercount,
        authority: row.Authority,
        gender: normalizeGender(row.Gender),
        ahead,
        abody,
        aeyes,
        aflag,
        abackground,
        aforeground,
        aexitem,
        poweruser: Boolean(row?.poweruser),
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
    return Math.max(0, Math.floor(goldPrice * 0.60));
}

function createEmptyUserEquipState() {
    return {
        ahead: 0,
        abody: 0,
        aeyes: null,
        aflag: null,
        abackground: null,
        aforeground: null,
        aexitem: null,
        poweruser: false
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
        `SELECT
            c.slot,
            c.item_id,
            c.avatar_id,
            c.item_code,
            a.source_avatar_id,
            a.source_ref_id,
            a.avatar_code,
            a.name
         FROM chest c
         LEFT JOIN avatars a ON a.id = c.avatar_id
         WHERE c.owner_id = ? AND c.wearing = 1`,
        [ownerId]
    );

    const equipState = createEmptyUserEquipState();
    (rows || []).forEach((row) => {
        const slot = normalizeChestSlot(row?.slot);
        if (!slot) {
            return;
        }
        assignEquipSlotValue(equipState, slot, row?.item_id);
        if (isPowerUserChestRow(row)) {
            equipState.poweruser = true;
        }
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
        `SELECT u.UserId, u.Authority, u.Gender, g.Nickname, g.Guild, g.Gold, g.Cash, g.TotalScore, g.TotalGrade, g.TotalRank,
                g.GuildRank AS guildrank, g.MemberCount AS membercount
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

let avatarGiftTableInitPromise = null;

async function ensureAvatarShopGiftTable() {
    if (!avatarGiftTableInitPromise) {
        avatarGiftTableInitPromise = pool.execute(
            `CREATE TABLE IF NOT EXISTS avatar_shop_gifts (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                from_user_id VARCHAR(16) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL,
                to_user_id VARCHAR(16) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL,
                from_nickname VARCHAR(32) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL,
                to_nickname VARCHAR(32) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL,
                message VARCHAR(120) NOT NULL DEFAULT '',
                avatar_id BIGINT UNSIGNED NULL,
                item_id INT UNSIGNED NOT NULL DEFAULT 0,
                item_code VARCHAR(64) NULL,
                slot ENUM('head', 'body', 'eyes', 'flag', 'background', 'foreground', 'exitem') NOT NULL,
                acquisition_type ENUM('C', 'G', 'E', 'R', 'S', 'M') NOT NULL DEFAULT 'G',
                expire_at DATETIME NULL,
                volume INT UNSIGNED NOT NULL DEFAULT 1,
                recovered TINYINT(1) NOT NULL DEFAULT 0,
                expire_type ENUM('I', 'W', 'M', 'P') NOT NULL DEFAULT 'I',
                avatar_code VARCHAR(64) NULL,
                item_name VARCHAR(128) NULL,
                gender CHAR(1) NOT NULL DEFAULT 'u',
                source_avatar_id INT UNSIGNED NOT NULL DEFAULT 0,
                source_ref_id INT NULL,
                status ENUM('pending', 'accepted', 'declined') NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                responded_at DATETIME NULL,
                PRIMARY KEY (id),
                KEY idx_avatar_shop_gifts_to_status (to_user_id, status, id),
                KEY idx_avatar_shop_gifts_from_status (from_user_id, status, id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
        );
    }
    await avatarGiftTableInitPromise;
}

function buildAvatarGiftClientPayload(row) {
    const slot = normalizeChestSlot(row?.slot) || 'head';
    const itemName = String(row?.item_name || row?.avatar_code || row?.item_code || '').trim();
    const sourceRefId = toOptionalAvatarValue(row?.source_ref_id);
    return {
        giftId: toBaseAvatarValue(row?.id),
        fromUserId: String(row?.from_user_id || ''),
        toUserId: String(row?.to_user_id || ''),
        fromNickname: String(row?.from_nickname || ''),
        toNickname: String(row?.to_nickname || ''),
        itemName,
        message: String(row?.message || ''),
        item: {
            slot,
            name: itemName,
            avatar_code: String(row?.avatar_code || row?.item_code || ''),
            item_code: String(row?.item_code || row?.avatar_code || ''),
            source_avatar_id: toBaseAvatarValue(row?.source_avatar_id),
            source_ref_id: sourceRefId == null ? toOptionalAvatarValue(row?.item_id) : sourceRefId,
            item_id: toOptionalAvatarValue(row?.item_id),
            avatar_id: toOptionalAvatarValue(row?.avatar_id),
            gender: normalizeAvatarCatalogGender(row?.gender)
        }
    };
}

async function sendPendingAvatarShopGifts(socket, userId, executor = pool) {
    if (!socket || !userId) {
        return;
    }
    await ensureAvatarShopGiftTable();
    const [rows] = await executor.execute(
        `SELECT
            id, from_user_id, to_user_id, from_nickname, to_nickname, message,
            avatar_id, item_id, item_code, slot, acquisition_type, expire_at, volume,
            recovered, expire_type, avatar_code, item_name, gender, source_avatar_id, source_ref_id
         FROM avatar_shop_gifts
         WHERE to_user_id = ? AND status = 'pending'
         ORDER BY id ASC`,
        [userId]
    );

    (rows || []).forEach((row) => {
        socket.emit('avatar_shop_gift_pending', buildAvatarGiftClientPayload(row));
    });
}

const PACKET_CODE_BUDDY_REQUEST = 1001;
const PACKET_CODE_PRIVATE_MESSAGE = 1002;
const PACKET_CODE_GIFT_PENDING = 1003;
const PACKET_CODE_GIFT_RESULT = 1004;
const PACKET_CODE_BUDDY_ACCEPTED = 1005;
const PACKET_CODE_BUDDY_REJECTED = 1006;
let packetTableInitPromise = null;

async function ensurePacketTable() {
    if (!packetTableInitPromise) {
        packetTableInitPromise = pool.execute(
            `CREATE TABLE IF NOT EXISTS packet (
                SerialNo INT(11) NOT NULL AUTO_INCREMENT,
                Receiver VARCHAR(16) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL,
                Sender VARCHAR(16) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL,
                Code INT(10) UNSIGNED NOT NULL DEFAULT 0,
                Body VARBINARY(1024) DEFAULT NULL,
                Time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (SerialNo),
                KEY idx_packet_receiver_serial (Receiver, SerialNo)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        );
    }
    await packetTableInitPromise;
}

function encodePacketBody(body) {
    if (body == null) {
        return null;
    }
    const json = JSON.stringify(body);
    if (!json) {
        return null;
    }
    const bytes = Buffer.from(json, 'utf8');
    return bytes.length > 1024 ? bytes.subarray(0, 1024) : bytes;
}

function decodePacketBody(rawBody) {
    if (rawBody == null) {
        return {};
    }
    const bytes = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    const json = bytes.toString('utf8').trim();
    if (!json) {
        return {};
    }
    try {
        return JSON.parse(json);
    } catch (error) {
        return {};
    }
}

async function enqueueOfflinePacket(receiverId, senderId, code, body, executor = pool) {
    const normalizedReceiver = String(receiverId || '').trim();
    const normalizedSender = String(senderId || '').trim();
    const numericCode = Math.trunc(Number(code));
    if (!normalizedReceiver || !normalizedSender || !Number.isFinite(numericCode) || numericCode <= 0) {
        return;
    }
    await ensurePacketTable();
    await executor.execute(
        'INSERT INTO packet (Receiver, Sender, Code, Body) VALUES (?, ?, ?, ?)',
        [normalizedReceiver, normalizedSender, numericCode, encodePacketBody(body)]
    );
}

async function consumeOfflinePackets(receiverId, allowedCodes = [], executor = pool) {
    const normalizedReceiver = String(receiverId || '').trim();
    const numericCodes = Array.isArray(allowedCodes)
        ? allowedCodes.map((value) => Math.trunc(Number(value))).filter((value) => Number.isFinite(value) && value > 0)
        : [];
    if (!normalizedReceiver || !numericCodes.length) {
        return [];
    }

    await ensurePacketTable();
    const placeholders = numericCodes.map(() => '?').join(', ');
    const [rows] = await executor.execute(
        `SELECT SerialNo, Receiver, Sender, Code, Body, Time
         FROM packet
         WHERE Receiver = ?
           AND Code IN (${placeholders})
         ORDER BY SerialNo ASC`,
        [normalizedReceiver, ...numericCodes]
    );
    const packets = rows || [];
    if (!packets.length) {
        return [];
    }

    const serials = packets
        .map((row) => Math.trunc(Number(row?.SerialNo)))
        .filter((value) => Number.isFinite(value) && value > 0);
    if (serials.length) {
        const serialPlaceholders = serials.map(() => '?').join(', ');
        await executor.execute(
            `DELETE FROM packet
             WHERE Receiver = ?
               AND SerialNo IN (${serialPlaceholders})`,
            [normalizedReceiver, ...serials]
        );
    }

    return packets.map((row) => ({
        serialNo: Math.trunc(Number(row?.SerialNo || 0)),
        receiver: String(row?.Receiver || ''),
        sender: String(row?.Sender || ''),
        code: Math.trunc(Number(row?.Code || 0)),
        body: decodePacketBody(row?.Body),
        time: row?.Time || null
    }));
}

function resolvePacketCodesForLocation(location) {
    const normalized = String(location || '').toLowerCase();
    if (normalized === 'avatar_shop') {
        return [
            PACKET_CODE_BUDDY_REQUEST,
            PACKET_CODE_BUDDY_ACCEPTED,
            PACKET_CODE_BUDDY_REJECTED,
            PACKET_CODE_PRIVATE_MESSAGE
        ];
    }
    if (normalized === 'channel') {
        return [
            PACKET_CODE_BUDDY_REQUEST,
            PACKET_CODE_BUDDY_ACCEPTED,
            PACKET_CODE_BUDDY_REJECTED,
            PACKET_CODE_PRIVATE_MESSAGE
        ];
    }
    if (normalized === 'game_room') {
        return [
            PACKET_CODE_BUDDY_REQUEST,
            PACKET_CODE_BUDDY_ACCEPTED,
            PACKET_CODE_BUDDY_REJECTED,
            PACKET_CODE_PRIVATE_MESSAGE
        ];
    }
    if (normalized === 'world_list') {
        return [];
    }
    return [PACKET_CODE_PRIVATE_MESSAGE];
}

async function deliverOfflinePacketsToSocket(socket, user, executor = pool, allowedCodesOverride = null) {
    if (!socket || !user?.id) {
        return;
    }
    const allowedCodes = Array.isArray(allowedCodesOverride) && allowedCodesOverride.length
        ? allowedCodesOverride
        : resolvePacketCodesForLocation(user.location);
    const packets = await consumeOfflinePackets(user.id, allowedCodes, executor);
    if (!packets.length) {
        return;
    }

    for (const packet of packets) {
        if (packet.code === PACKET_CODE_BUDDY_REQUEST) {
            const fromId = String(packet.body?.fromId || packet.sender || '').trim();
            const fromNickname = String(packet.body?.fromNickname || '').trim();
            if (fromId && fromNickname) {
                socket.emit('incoming_buddy_request', {
                    fromNickname,
                    fromId
                });
            }
            continue;
        }

        if (packet.code === PACKET_CODE_BUDDY_ACCEPTED) {
            const nickname = String(packet.body?.nickname || '').trim();
            if (nickname) {
                socket.emit('buddy_request_accepted', { nickname });
            }
            continue;
        }

        if (packet.code === PACKET_CODE_BUDDY_REJECTED) {
            const nickname = String(packet.body?.nickname || '').trim();
            if (nickname) {
                socket.emit('buddy_request_rejected', { nickname });
            }
            continue;
        }

        if (packet.code === PACKET_CODE_PRIVATE_MESSAGE) {
            const fromNickname = String(packet.body?.fromNickname || '').trim();
            const message = String(packet.body?.message || '').trim();
            if (fromNickname && message) {
                socket.emit('private_message', {
                    fromNickname,
                    message
                });
            }
            continue;
        }

        if (packet.code === PACKET_CODE_GIFT_PENDING) {
            const giftId = Number(packet.body?.giftId);
            if (!Number.isFinite(giftId) || giftId <= 0) {
                continue;
            }
            await ensureAvatarShopGiftTable();
            const [giftRows] = await executor.execute(
                `SELECT
                    id, from_user_id, to_user_id, from_nickname, to_nickname, message,
                    avatar_id, item_id, item_code, slot, acquisition_type, expire_at, volume,
                    recovered, expire_type, avatar_code, item_name, gender, source_avatar_id, source_ref_id
                 FROM avatar_shop_gifts
                 WHERE id = ? AND to_user_id = ? AND status = 'pending'
                 LIMIT 1`,
                [Math.trunc(giftId), String(user.id)]
            );
            const giftRow = giftRows?.[0] || null;
            if (giftRow) {
                socket.emit('avatar_shop_gift_pending', buildAvatarGiftClientPayload(giftRow));
            }
            continue;
        }

        if (packet.code === PACKET_CODE_GIFT_RESULT) {
            socket.emit('avatar_shop_gift_result', {
                giftId: Number(packet.body?.giftId) || 0,
                accepted: Boolean(packet.body?.accepted),
                itemName: String(packet.body?.itemName || ''),
                toNickname: String(packet.body?.toNickname || ''),
                fromNickname: String(packet.body?.fromNickname || '')
            });
        }
    }
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
    '/create_account.html': '/views/create_account.html',
    '/game_room.html': '/views/game_room/index.html'
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
    const normalizedUsername = String(username || '').trim();
    const normalizedNickname = String(nickname || '').trim();
    const normalizedPassword = String(password || '');
    const normalizedEmail = String(email || '').trim();
    const normalizedGender = normalizeGender(gender);

    const authority = 0;
    const gold = 10000;
    const cash = 10000;
    const score = 1000;
    const grade = 24;

    if (!normalizedUsername || !normalizedNickname || !normalizedPassword || !normalizedEmail) {
        return res.status(400).json({ error: 'Username, Nickname, Password and E-Mail are required' });
    }

    if (normalizedUsername.toLowerCase() === normalizedNickname.toLowerCase()) {
        return res.status(400).json({ error: 'Username and Nickname must be different' });
    }

    if (normalizedUsername.length > 16 || normalizedNickname.length > 16) {
        return res.status(400).json({ error: 'Username and Nickname must be 16 characters or less' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [existingUserRows] = await connection.execute(
            `SELECT UserId FROM user WHERE LOWER(UserId) = LOWER(?) LIMIT 1 FOR UPDATE`,
            [normalizedUsername]
        );
        if (existingUserRows.length > 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Username already exists' });
        }

        const [existingNicknameRows] = await connection.execute(
            `SELECT Id FROM game WHERE LOWER(Nickname) = LOWER(?) LIMIT 1 FOR UPDATE`,
            [normalizedNickname]
        );
        if (existingNicknameRows.length > 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Nickname already exists' });
        }

        await connection.execute(
            `INSERT INTO user (UserId, Gender, Password, Status, Authority, E_Mail, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [normalizedUsername, normalizedGender, normalizedPassword, 'OK', authority, normalizedEmail]
        );

        await connection.execute(
            `INSERT INTO game (Id, Nickname, Gold, Cash, TotalScore, TotalGrade, SeasonScore, SeasonGrade) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [normalizedUsername, normalizedNickname, gold, cash, score, grade, score, grade]
        );

        await connection.commit();
        return res.status(201).json({
            message: 'Account created successfully',
            user: {
                id: normalizedUsername,
                nickname: normalizedNickname,
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
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (_) {
                // Ignore rollback errors.
            }
        }
        if (error?.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Username or Nickname already exists' });
        }
        console.error('Signup error:', error);
        return res.status(500).json({ error: 'Database error' });
    } finally {
        if (connection) {
            connection.release();
        }
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
            `    SELECT u.UserId, u.Authority, u.Gender, g.Nickname, g.Guild, g.Gold, g.Cash, g.TotalScore, g.TotalGrade, g.TotalRank,
                        g.GuildRank AS guildrank, g.MemberCount AS membercount
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
        if (isPowerUserChestRow(itemRow)) {
            await connection.rollback();
            return res.status(400).json({ error: 'Power User cannot be gifted' });
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

        const [deleteResult] = await connection.execute(
            'DELETE FROM chest WHERE id = ? AND owner_id = ?',
            [Math.trunc(chestId), userId]
        );
        if (!deleteResult || Number(deleteResult.affectedRows) !== 1) {
            await connection.rollback();
            return res.status(500).json({ error: 'Sell failed to remove item from chest' });
        }

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

app.post('/api/avatar-shop/gift', async (req, res) => {
    const userId = String(req.body?.userId || '').trim();
    const chestId = Number(req.body?.chestId);
    const targetNicknameInput = String(req.body?.targetNickname || '').trim();
    const messageInput = String(req.body?.message || '');
    const giftMessage = messageInput.replace(/\r/g, '').replace(/\n+/g, ' ').trim().slice(0, 120);

    if (!userId || !Number.isFinite(chestId) || chestId <= 0 || !targetNicknameInput) {
        return res.status(400).json({ error: 'Invalid gift payload' });
    }

    let connection;
    try {
        await ensureAvatarShopGiftTable();
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [senderRows] = await connection.execute(
            'SELECT Id, Nickname FROM game WHERE Id = ? LIMIT 1 FOR UPDATE',
            [userId]
        );
        const senderRow = senderRows?.[0] || null;
        if (!senderRow) {
            await connection.rollback();
            return res.status(404).json({ error: 'User not found' });
        }

        const [itemRows] = await connection.execute(
            `SELECT
                c.id,
                c.owner_id,
                c.avatar_id,
                c.item_id,
                c.item_code,
                c.slot,
                c.wearing,
                c.acquisition_type,
                c.expire_at,
                c.volume,
                c.place_order,
                c.recovered,
                c.expire_type,
                a.name,
                a.avatar_code,
                a.gender,
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

        const slot = normalizeChestSlot(itemRow.slot);
        if (!slot) {
            await connection.rollback();
            return res.status(400).json({ error: 'Owned item slot is invalid' });
        }

        const [targetRows] = await connection.execute(
            'SELECT Id, Nickname FROM game WHERE LOWER(Nickname) = LOWER(?) LIMIT 1 FOR UPDATE',
            [targetNicknameInput]
        );
        const targetRow = targetRows?.[0] || null;
        if (!targetRow) {
            await connection.rollback();
            return res.status(404).json({ error: 'Recipient nickname not found' });
        }
        if (String(targetRow.Id) === userId) {
            await connection.rollback();
            return res.status(400).json({ error: 'You cannot gift an item to yourself' });
        }

        const recipientId = String(targetRow.Id);
        const senderNickname = String(senderRow.Nickname || '').trim();
        const recipientNickname = String(targetRow.Nickname || '').trim();
        const itemName = String(itemRow.name || itemRow.avatar_code || itemRow.item_code || '').trim();
        const sourceRefId = toOptionalAvatarValue(itemRow.source_ref_id);
        const sourceAvatarId = toBaseAvatarValue(itemRow.source_avatar_id);

        const [deleteResult] = await connection.execute(
            'DELETE FROM chest WHERE id = ? AND owner_id = ?',
            [Math.trunc(chestId), userId]
        );
        if (!deleteResult || Number(deleteResult.affectedRows) !== 1) {
            await connection.rollback();
            return res.status(500).json({ error: 'Gift failed to remove item from sender inventory' });
        }

        const [insertGiftResult] = await connection.execute(
            `INSERT INTO avatar_shop_gifts (
                from_user_id, to_user_id, from_nickname, to_nickname, message,
                avatar_id, item_id, item_code, slot, acquisition_type, expire_at,
                volume, recovered, expire_type, avatar_code, item_name, gender,
                source_avatar_id, source_ref_id, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [
                userId,
                recipientId,
                senderNickname,
                recipientNickname,
                giftMessage,
                toOptionalAvatarValue(itemRow.avatar_id),
                toBaseAvatarValue(itemRow.item_id),
                String(itemRow.item_code || ''),
                slot,
                String(itemRow.acquisition_type || 'G'),
                itemRow.expire_at || null,
                Math.max(1, toBaseAvatarValue(itemRow.volume || 1)),
                Number(itemRow.recovered) === 1 ? 1 : 0,
                String(itemRow.expire_type || 'I'),
                String(itemRow.avatar_code || itemRow.item_code || ''),
                itemName,
                normalizeAvatarCatalogGender(itemRow.gender),
                sourceAvatarId,
                sourceRefId
            ]
        );

        const giftId = toBaseAvatarValue(insertGiftResult?.insertId);
        const recipientSocketId = userSockets.get(recipientNickname.toLowerCase());
        const recipientSocket = recipientSocketId ? io.sockets.sockets.get(recipientSocketId) : null;
        const recipientSocketInfo = recipientSocketId ? socketData.get(recipientSocketId) : null;
        const recipientCanReceiveGiftNow = Boolean(
            recipientSocket
            && recipientSocketInfo
            && String(recipientSocketInfo.location || '').toLowerCase() === 'avatar_shop'
        );
        if (!recipientCanReceiveGiftNow) {
            await enqueueOfflinePacket(
                recipientId,
                userId,
                PACKET_CODE_GIFT_PENDING,
                { giftId },
                connection
            );
        }

        await connection.commit();

        const userPayload = await buildUserPayloadById(userId, connection);
        const inventoryRows = await loadAvatarShopInventoryRows(userId, connection);
        const pendingGiftPayload = buildAvatarGiftClientPayload({
            id: giftId,
            from_user_id: userId,
            to_user_id: recipientId,
            from_nickname: senderNickname,
            to_nickname: recipientNickname,
            message: giftMessage,
            avatar_id: itemRow.avatar_id,
            item_id: itemRow.item_id,
            item_code: itemRow.item_code,
            slot,
            avatar_code: itemRow.avatar_code || itemRow.item_code,
            item_name: itemName,
            gender: itemRow.gender,
            source_avatar_id: sourceAvatarId,
            source_ref_id: sourceRefId
        });
        if (recipientCanReceiveGiftNow && recipientSocketId) {
            io.to(recipientSocketId).emit('avatar_shop_gift_pending', pendingGiftPayload);
        }

        res.json({
            user: userPayload,
            inventory: buildAvatarShopInventoryPayload(inventoryRows),
            giftId
        });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (rollbackError) { /* ignore */ }
        }
        console.error('[AvatarShop] Gift failed:', error);
        res.status(500).json({ error: 'Gift failed' });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/avatar-shop/gift/respond', async (req, res) => {
    const userId = String(req.body?.userId || '').trim();
    const giftId = Number(req.body?.giftId);
    const accept = Boolean(req.body?.accept);

    if (!userId || !Number.isFinite(giftId) || giftId <= 0) {
        return res.status(400).json({ error: 'Invalid gift response payload' });
    }

    let connection;
    try {
        await ensureAvatarShopGiftTable();
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [giftRows] = await connection.execute(
            `SELECT *
             FROM avatar_shop_gifts
             WHERE id = ? AND to_user_id = ? AND status = 'pending'
             LIMIT 1
             FOR UPDATE`,
            [Math.trunc(giftId), userId]
        );
        const giftRow = giftRows?.[0] || null;
        if (!giftRow) {
            await connection.rollback();
            return res.status(404).json({ error: 'Pending gift not found' });
        }

        const slot = normalizeChestSlot(giftRow.slot);
        if (!slot) {
            await connection.rollback();
            return res.status(400).json({ error: 'Gift item slot is invalid' });
        }

        const receiverId = String(giftRow.to_user_id || '');
        const senderId = String(giftRow.from_user_id || '');
        const targetOwnerId = accept ? receiverId : senderId;
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
            [targetOwnerId, ...orderSlotList]
        );
        const nextPlaceOrder = Math.max(0, Math.trunc(Number(orderRows?.[0]?.max_order || 0))) + 1;

        await connection.execute(
            `INSERT INTO chest (
                owner_id, avatar_id, item_id, item_code, slot, wearing,
                acquisition_type, expire_at, volume, place_order, recovered, expire_type
            ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
            [
                targetOwnerId,
                toOptionalAvatarValue(giftRow.avatar_id),
                toBaseAvatarValue(giftRow.item_id),
                String(giftRow.item_code || ''),
                slot,
                String(giftRow.acquisition_type || 'G'),
                giftRow.expire_at || null,
                Math.max(1, toBaseAvatarValue(giftRow.volume || 1)),
                nextPlaceOrder,
                Number(giftRow.recovered) === 1 ? 1 : 0,
                String(giftRow.expire_type || 'I')
            ]
        );

        await connection.execute(
            'UPDATE avatar_shop_gifts SET status = ?, responded_at = NOW() WHERE id = ?',
            [accept ? 'accepted' : 'declined', Math.trunc(giftId)]
        );

        const senderNickname = String(giftRow.from_nickname || '').trim();
        const recipientNickname = String(giftRow.to_nickname || '').trim();
        const itemName = String(giftRow.item_name || giftRow.avatar_code || giftRow.item_code || '').trim();
        const senderSocketId = userSockets.get(senderNickname.toLowerCase());
        const senderSocket = senderSocketId ? io.sockets.sockets.get(senderSocketId) : null;
        const senderSocketInfo = senderSocketId ? socketData.get(senderSocketId) : null;
        const senderCanReceiveGiftResultNow = Boolean(
            senderSocket
            && senderSocketInfo
            && String(senderSocketInfo.location || '').toLowerCase() === 'avatar_shop'
        );
        if (!senderCanReceiveGiftResultNow) {
            await enqueueOfflinePacket(
                senderId,
                receiverId,
                PACKET_CODE_GIFT_RESULT,
                {
                    giftId: Math.trunc(giftId),
                    accepted: accept,
                    itemName,
                    toNickname: recipientNickname,
                    fromNickname: senderNickname
                },
                connection
            );
        }

        await connection.commit();

        const userPayload = await buildUserPayloadById(userId, connection);
        const inventoryRows = await loadAvatarShopInventoryRows(userId, connection);
        if (senderCanReceiveGiftResultNow && senderSocketId) {
            io.to(senderSocketId).emit('avatar_shop_gift_result', {
                giftId: Math.trunc(giftId),
                accepted: accept,
                itemName,
                toNickname: recipientNickname,
                fromNickname: senderNickname
            });
        }

        res.json({
            accepted: accept,
            giftId: Math.trunc(giftId),
            user: userPayload,
            inventory: buildAvatarShopInventoryPayload(inventoryRows)
        });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (rollbackError) { /* ignore */ }
        }
        console.error('[AvatarShop] Gift response failed:', error);
        res.status(500).json({ error: 'Gift response failed' });
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
                    `SELECT u.UserId, u.Authority, u.Gender, g.Nickname, g.Guild, g.Gold, g.Cash, g.TotalScore, g.TotalGrade, g.TotalRank,
                            g.GuildRank AS guildrank, g.MemberCount AS membercount
                     FROM user u
                     JOIN game g ON u.UserId = g.Id
                     WHERE g.Nickname = ?`,
                    [data.nickname]
                );

                if (rows.length > 0) {
                    const dbUser = rows[0];
                    const userId = dbUser.UserId;
                    const nicknameKey = dbUser.Nickname.toLowerCase();
                    let hasGameRoomTopologyChanged = false;
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
                    const normalizedLocation = String(data.location || 'unknown').toLowerCase();
                    let roomId = 0;
                    let roomKey = '';

                    if (normalizedLocation === 'game_room') {
                        const roomAssignment = assignUserToGameRoom(
                            dbUser.UserId,
                            data.roomKey || data.roomId || data.roomTitle
                        );
                        roomId = roomAssignment.roomId || 1;
                        roomKey = roomAssignment.roomKey;
                        hasGameRoomTopologyChanged = roomAssignment.topologyChanged;
                    } else {
                        hasGameRoomTopologyChanged = removeUserFromGameRoom(dbUser.UserId);
                    }

                    const nextPresence = {
                        nickname: dbUser.Nickname,
                        id: dbUser.UserId,
                        gender: dbUser.Gender,
                        grade: dbUser.TotalGrade,
                        guild: dbUser.Guild,
                        authority: dbUser.Authority,
                        location: normalizedLocation,
                        serverId: normalizedLocation === 'world_list' ? 0 : 1,
                        channelId: normalizedLocation === 'channel' ? 1 : 0,
                        roomId: normalizedLocation === 'game_room' ? roomId : 0,
                        roomKey: normalizedLocation === 'game_room' ? roomKey : ''
                    };
                    socketData.set(socket.id, nextPresence);

                    // Send updated user info back to client
                    const equipState = await loadUserEquipState(dbUser.UserId);
                    socket.emit('user_info_update', buildUserPayload({
                        ...dbUser,
                        ...equipState
                    }));

                    if (shouldLogLogin) {
                        console.log(`[Login] [${getUKTimestamp()}] ${data.nickname} logged in.`);
                    }

                    const previousPresence = lastKnownPresence.get(userId) || null;
                    const hasPresenceChanged = !previousPresence
                        || previousPresence.location !== nextPresence.location
                        || Number(previousPresence.serverId) !== Number(nextPresence.serverId)
                        || Number(previousPresence.channelId) !== Number(nextPresence.channelId)
                        || Number(previousPresence.roomId || 0) !== Number(nextPresence.roomId || 0);
                    nextPresence.__hasPresenceChanged = hasPresenceChanged;
                    nextPresence.__hasGameRoomTopologyChanged = hasGameRoomTopologyChanged;
                    lastKnownPresence.set(userId, {
                        location: nextPresence.location,
                        serverId: nextPresence.serverId,
                        channelId: nextPresence.channelId,
                        roomId: nextPresence.roomId || 0
                    });
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
                if (String(currentData.location || '').toLowerCase() === 'game_room') {
                    socket.emit('game_room_presence', {
                        roomId: Number(currentData.roomId || 1),
                        roomKey: String(currentData.roomKey || ''),
                        isMaster: isUserGameRoomMaster(currentData.id, currentData.roomKey),
                        memberCount: getGameRoomMemberCount(currentData.roomKey)
                    });
                    socket.emit('game_room_item_state', {
                        disabledItems: getSerializedGameRoomDisabledItems(currentData.roomKey)
                    });
                }
                const shouldRefreshAllBuddyLists = Boolean(currentData.__hasGameRoomTopologyChanged);
                if (shouldRefreshAllBuddyLists) {
                    refreshBuddyListsForAllOnlineUsers();
                } else {
                    const shouldNotifyBuddyStatus = Boolean(currentData.__hasPresenceChanged) || !resumedFromReconnect;
                    if (shouldNotifyBuddyStatus) {
                        notifyBuddiesOfStatusChange(currentData.id, 0);
                    }
                }
                broadcastChannelUsers(currentData.channelId);
                deliverOfflinePacketsToSocket(socket, currentData).catch((error) => {
                    console.error('[Packet] Failed to deliver offline packets:', error);
                });
                delete currentData.__hasPresenceChanged;
                delete currentData.__hasGameRoomTopologyChanged;
            }
        }
    });

    socket.on('consume_avatar_shop_packets', async () => {
        const user = socketData.get(socket.id);
        if (!user) {
            return;
        }
        try {
            await deliverOfflinePacketsToSocket(
                socket,
                user,
                pool,
                [PACKET_CODE_GIFT_PENDING, PACKET_CODE_GIFT_RESULT]
            );
            // Safety net: deliver any still-pending gifts even if a packet was previously missed.
            await sendPendingAvatarShopGifts(socket, user.id);
        } catch (error) {
            console.error('[Packet] Failed to deliver avatar shop packets:', error);
        }
    });

    socket.on('lobby_message', (message) => {
        const user = socketData.get(socket.id);
        if (user && message && message.trim() !== '') {
            const trimmedMessage = message.trim();
            const normalizedChannelId = Math.trunc(Number(user.channelId));
            const channelLabel = Number.isFinite(normalizedChannelId) && normalizedChannelId > 0
                ? `Channel ${normalizedChannelId}`
                : 'Channel ?';

            // Check for commands
            if (trimmedMessage.startsWith('/')) {
                const Commands = require('./commands');
                Commands.handle(io, socket, user, trimmedMessage);
                return;
            }

            console.log(`[Chat] [${getUKTimestamp()}] ${user.nickname} to ${channelLabel}: ${trimmedMessage}`);

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

    socket.on('private_message', async (data) => {
        const { toNickname, message } = data;
        const sender = socketData.get(socket.id);
        const trimmedMessage = String(message || '').trim();
        const normalizedTargetNickname = String(toNickname || '').trim();
        if (!sender || !normalizedTargetNickname || !trimmedMessage) return;

        console.log(`[Whisper] [${getUKTimestamp()}] ${sender.nickname} to ${normalizedTargetNickname}: ${trimmedMessage}`);

        try {
            const [targetRows] = await pool.execute(
                'SELECT Id, Nickname FROM game WHERE LOWER(Nickname) = LOWER(?) LIMIT 1',
                [normalizedTargetNickname]
            );
            const targetRow = targetRows?.[0] || null;
            if (!targetRow) {
                return;
            }

            const targetId = String(targetRow.Id || '').trim();
            const targetNicknameKey = String(targetRow.Nickname || normalizedTargetNickname).toLowerCase();
            const targetSocketId = userSockets.get(targetNicknameKey);
            const targetSocket = targetSocketId ? io.sockets.sockets.get(targetSocketId) : null;
            const targetSocketInfo = targetSocketId ? socketData.get(targetSocketId) : null;
            const targetCanReceiveWhisperNow = Boolean(
                targetSocket
                && targetSocketInfo
                && String(targetSocketInfo.location || '').toLowerCase() !== 'world_list'
            );
            if (targetCanReceiveWhisperNow && targetSocketId) {
                io.to(targetSocketId).emit('private_message', {
                    fromNickname: sender.nickname,
                    message: trimmedMessage
                });
            } else {
                await enqueueOfflinePacket(
                    targetId,
                    sender.id,
                    PACKET_CODE_PRIVATE_MESSAGE,
                    {
                        fromNickname: sender.nickname,
                        message: trimmedMessage
                    }
                );
            }
        } catch (error) {
            console.error('[Whisper] Failed to deliver or queue message:', error);
        }
    });

    socket.on('game_room_message', (message) => {
        const user = socketData.get(socket.id);
        if (!user || String(user.location || '').toLowerCase() !== 'game_room') {
            return;
        }

        const trimmedMessage = String(message || '').trim();
        if (!trimmedMessage) {
            return;
        }

        // Support slash commands from game room chat too (e.g. /bcm).
        if (trimmedMessage.startsWith('/')) {
            const Commands = require('./commands');
            Commands.handle(io, socket, user, trimmedMessage);
            return;
        }

        const roomKey = String(user.roomKey || '').trim();
        if (!roomKey) {
            return;
        }

        for (const [socketId, data] of socketData.entries()) {
            if (String(data?.location || '').toLowerCase() !== 'game_room') continue;
            if (String(data?.roomKey || '') !== roomKey) continue;

            io.to(socketId).emit('game_room_message', {
                nickname: user.nickname,
                guild: user.guild || '',
                message: trimmedMessage,
                authority: user.authority || 0,
                type: 'user'
            });
        }
    });

    socket.on('latency_probe', (_clientSentAt, ack) => {
        if (typeof ack === 'function') {
            ack(Date.now());
        }
    });

    socket.on('game_room_toggle_item_disabled', (payload) => {
        const user = socketData.get(socket.id);
        if (!user || String(user.location || '').toLowerCase() !== 'game_room') {
            return;
        }

        const roomKey = String(user.roomKey || '').trim();
        if (!roomKey) {
            return;
        }

        if (!isUserGameRoomMaster(user.id, roomKey)) {
            return;
        }

        const pageIndex = Math.trunc(Number(payload?.pageIndex));
        const itemIndex = Math.trunc(Number(payload?.itemIndex));
        if (!Number.isFinite(pageIndex) || pageIndex < 0) return;
        if (!Number.isFinite(itemIndex) || itemIndex < 0) return;
        if (pageIndex > 20 || itemIndex > 20) return;

        const key = `${pageIndex}:${itemIndex}`;
        const disabled = Boolean(payload?.disabled);
        const disabledItems = getGameRoomDisabledItemSet(roomKey);
        if (!disabledItems) return;

        if (disabled) {
            disabledItems.add(key);
        } else {
            disabledItems.delete(key);
        }

        for (const [socketId, data] of socketData.entries()) {
            if (String(data?.location || '').toLowerCase() !== 'game_room') continue;
            if (String(data?.roomKey || '') !== roomKey) continue;
            io.to(socketId).emit('game_room_item_disabled_changed', {
                pageIndex,
                itemIndex,
                disabled
            });
        }
    });

    function broadcastChannelUsers(channelId) {
        if (!channelId) return;
        const channelUsers = [];
        for (const [sId, data] of socketData.entries()) {
            const nicknameKey = String(data?.nickname || '').toLowerCase();
            const linkedSocketId = userSockets.get(nicknameKey);
            const isLinkedPresence = Boolean(linkedSocketId) && linkedSocketId === sId;
            if (isLinkedPresence && data.location === 'channel' && data.channelId === channelId) {
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
            const nicknameKey = String(userData?.nickname || '').toLowerCase();
            const linkedSocketId = userSockets.get(nicknameKey);
            const isLinkedPresence = Boolean(linkedSocketId) && linkedSocketId === sId;
            if (userData && isLinkedPresence && userData.location === 'channel' && userData.channelId === channelId) {
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
                    let roomId = 0;

                    if (isOnline) {
                        const buddySocketId = userSockets.get(buddyNicknameKey);
                        const buddyData = socketData.get(buddySocketId);
                        location = buddyData ? buddyData.location : 'online';
                        serverId = buddyData ? buddyData.serverId : 0;
                        channelId = buddyData ? buddyData.channelId : 0;
                        roomId = buddyData ? buddyData.roomId : 0;
                    }

                    return {
                        id: b.id,
                        nickname: b.Nickname,
                        grade: b.Grade,
                        guild: b.Guild,
                        online: isOnline,
                        location: location,
                        serverId: serverId || 0,
                        channelId: channelId || 0,
                        roomId: roomId || 0
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

    function refreshBuddyListsForAllOnlineUsers() {
        for (const [socketId, data] of socketData.entries()) {
            const onlineSocket = io.sockets.sockets.get(socketId);
            if (!onlineSocket || !data?.id) continue;
            sendBuddyList(onlineSocket, data.id);
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
            const hasGameRoomTopologyChanged = removeUserFromGameRoom(userId);
            io.emit('playerCountUpdate', getActivePlayerCount());

            broadcastChannelUsers(data.channelId);
            if (hasGameRoomTopologyChanged) {
                refreshBuddyListsForAllOnlineUsers();
            }
        }
    });

    socket.on('send_buddy_request', async (targetNickname) => {
        const sender = socketData.get(socket.id);
        if (!sender) return;
        const normalizedTargetNickname = String(targetNickname || '').trim();
        if (!normalizedTargetNickname) return;

        console.log(`[Buddy] [${getUKTimestamp()}] ${sender.nickname} is trying to add ${normalizedTargetNickname}`);

        try {
            const [targetRows] = await pool.execute(
                'SELECT Id, Nickname FROM game WHERE LOWER(Nickname) = LOWER(?) LIMIT 1',
                [normalizedTargetNickname]
            );
            const targetRow = targetRows?.[0] || null;
            if (!targetRow) {
                socket.emit('buddy_request_error', {
                    nickname: normalizedTargetNickname,
                    message: `'${normalizedTargetNickname}' does not exist.`
                });
                return;
            }

            const targetId = String(targetRow.Id || '').trim();
            if (!targetId || targetId === String(sender.id)) {
                socket.emit('buddy_request_error', {
                    nickname: normalizedTargetNickname,
                    message: "You can't add your nickname to buddy."
                });
                return;
            }

            const targetNicknameKey = String(targetRow.Nickname || normalizedTargetNickname).toLowerCase();
            const targetSocketId = userSockets.get(targetNicknameKey);
            const targetSocket = targetSocketId ? io.sockets.sockets.get(targetSocketId) : null;
            const targetSocketInfo = targetSocketId ? socketData.get(targetSocketId) : null;
            const targetCanReceiveBuddyRequestNow = Boolean(
                targetSocket
                && targetSocketInfo
                && String(targetSocketInfo.location || '').toLowerCase() !== 'world_list'
            );
            if (targetCanReceiveBuddyRequestNow && targetSocketId) {
                io.to(targetSocketId).emit('incoming_buddy_request', {
                    fromNickname: sender.nickname,
                    fromId: sender.id
                });
            } else {
                await enqueueOfflinePacket(
                    targetId,
                    sender.id,
                    PACKET_CODE_BUDDY_REQUEST,
                    {
                        fromNickname: sender.nickname,
                        fromId: sender.id
                    }
                );
            }
            socket.emit('buddy_request_sent', {
                nickname: String(targetRow.Nickname || normalizedTargetNickname)
            });
        } catch (error) {
            console.error('[Buddy] Failed to deliver or queue buddy request:', error);
            socket.emit('buddy_request_error', {
                nickname: normalizedTargetNickname,
                message: 'Unable to send buddy request right now. Please try again.'
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
        const senderSocket = senderSocketId ? io.sockets.sockets.get(senderSocketId) : null;
        const senderSocketInfo = senderSocketId ? socketData.get(senderSocketId) : null;
        const senderCanReceiveBuddyPopupNow = Boolean(
            senderSocket
            && senderSocketInfo
            && String(senderSocketInfo.location || '').toLowerCase() !== 'world_list'
        );
        const normalizedSenderId = String(fromId || '').trim();

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

                    if (!senderCanReceiveBuddyPopupNow && normalizedSenderId) {
                        await enqueueOfflinePacket(
                            normalizedSenderId,
                            receiver.id,
                            PACKET_CODE_BUDDY_ACCEPTED,
                            {
                                nickname: receiver.nickname
                            },
                            connection
                        );
                    }

                    await connection.commit();
                    console.log(`[Buddy] [${getUKTimestamp()}] ${receiver.nickname} accepted buddy request from ${fromNickname}`);

                    // Refresh buddy list instantly
                    sendBuddyList(socket, receiver.id);
                    if (senderSocket) {
                        sendBuddyList(io.sockets.sockets.get(senderSocketId), fromId);
                    }

                    if (senderCanReceiveBuddyPopupNow && senderSocketId) {
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
            if (senderCanReceiveBuddyPopupNow && senderSocketId) {
                io.to(senderSocketId).emit('buddy_request_rejected', { nickname: receiver.nickname });
            } else if (normalizedSenderId) {
                try {
                    await enqueueOfflinePacket(
                        normalizedSenderId,
                        receiver.id,
                        PACKET_CODE_BUDDY_REJECTED,
                        {
                            nickname: receiver.nickname
                        }
                    );
                } catch (error) {
                    console.error('[Buddy] Failed to queue rejected request packet:', error);
                }
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

                const locationAtDisconnect = String(data.location || '').toLowerCase();
                const disconnectGraceMs = locationAtDisconnect === 'world_list'
                    ? WORLD_LIST_DISCONNECT_GRACE_MS
                    : RECONNECT_GRACE_MS;

                const timeoutId = setTimeout(() => {
                    pendingDisconnects.delete(userId);
                    const activeSocketId = userSockets.get(nicknameKey);
                    const activeSocketData = activeSocketId ? socketData.get(activeSocketId) : null;
                    const isStillOnline = Boolean(activeSocketData && activeSocketData.id === userId);
                    if (isStillOnline) {
                        return;
                    }
                    const hasGameRoomTopologyChanged = removeUserFromGameRoom(userId);
                    lastKnownPresence.set(userId, {
                        location: 'offline',
                        serverId: 0,
                        channelId: 0,
                        roomId: 0
                    });
                    console.log(`[Logoff] [${getUKTimestamp()}] ${nickname} logged off.`);
                    notifyBuddiesOfStatusChange(userId, 100);
                    if (hasGameRoomTopologyChanged) {
                        refreshBuddyListsForAllOnlineUsers();
                    }
                }, disconnectGraceMs);

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
