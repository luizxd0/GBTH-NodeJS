const DEFAULT_SHOP_ITEM_COUNT = 9;
const SET_SHOP_ITEM_COUNT = 4;
const AVATAR_ATLAS_METADATA_URL = '/assets/shared/avatar_sheets/avatar_metadata.json';
const AVATAR_EX_EFFECT_METADATA_URL = '/assets/shared/avatar_effect_sheets/effect_metadata.json';
const AVATAR_THUMB_BASE_URLS = [
    '/assets/shared/avatar_thumbs',
    '/assets/shared/avatar_sheets/gbth',
    '/assets/shared/avatar_sheets/dragonbound'
];
const AVATAR_EXITEM_THUMB_BASE_URL = '/assets/shared/avatar_thumbs';
const STORE_ICON_BASE_URL = '/assets/screens/avatar_shop/store_icon/store_icon_frame_';
const STORE_AVATAR_BASE_URL = '/assets/screens/avatar_shop/store_avatar/store_avatar_frame_';
const CATALOG_STAT_DISPLAY_ORDER = [
    'stat_pop',
    'stat_atk',
    'stat_def',
    'stat_life',
    'stat_time',
    'stat_item',
    'stat_dig',
    'stat_shld'
];
const CATALOG_STAT_ICON_FRAMES_BY_KEY = {
    stat_pop: { positive: 11, negative: 10 },
    stat_atk: { positive: 13, negative: 12 },
    stat_def: { positive: 15, negative: 14 },
    stat_life: { positive: 17, negative: 16 },
    stat_time: { positive: 9, negative: 8 },
    stat_item: { positive: 19, negative: 18 },
    stat_dig: { positive: 21, negative: 20 },
    stat_shld: { positive: 23, negative: 22 }
};
const SHOP_BUTTON_CATEGORY = {
    'btn-store-cloth': 'cloth',
    'btn-store-cap': 'cap',
    'btn-store-glasse': 'glasse',
    'btn-store-flag': 'flag',
    'btn-store-setitem': 'setitem',
    'btn-store-exitem': 'exitem'
};
const MY_AVATAR_STAT_SUMMARY_ORDER = [
    'stat_time',
    'stat_pop',
    'stat_atk',
    'stat_def',
    'stat_life',
    'stat_item',
    'stat_dig',
    'stat_shld'
];
const MY_AVATAR_TRACKED_SLOTS = ['head', 'body', 'eyes', 'flag', 'background', 'foreground', 'exitem'];
const MY_AVATAR_STAT_ABS_CAP = 50;
const OWNED_SORT_SLOT_BY_BUTTON_ID = {
    'btn-store-sort-puton': 'all',
    'btn-store-sort-hat': 'head',
    'btn-store-sort-cloth': 'body',
    'btn-store-sort-glasses': 'eyes',
    'btn-store-sort-flag': 'flag'
};
const OWNED_REGULAR_SLOT_SORT_ORDER = ['head', 'body', 'eyes', 'flag'];

function createEmptyCatalogStatTotals() {
    const totals = {};
    CATALOG_STAT_DISPLAY_ORDER.forEach((statKey) => {
        totals[statKey] = 0;
    });
    return totals;
}

function normalizeMyAvatarStatDisplayValue(statKey, rawValue) {
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    // Client parity: turn-delay sign is inverted vs stored DB sign.
    if (statKey === 'stat_time') {
        return -Math.trunc(numeric);
    }
    return Math.trunc(numeric);
}

function capMyAvatarStatDisplayValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(-MY_AVATAR_STAT_ABS_CAP, Math.min(MY_AVATAR_STAT_ABS_CAP, Math.trunc(numeric)));
}

function normalizePreviewEquipSlotValue(slot, value) {
    const parsed = Number(value);
    const isBaseSlot = slot === 'head' || slot === 'body';
    if (!Number.isFinite(parsed)) {
        return isBaseSlot ? 0 : null;
    }
    const normalized = Math.trunc(parsed);
    if (normalized < 0) {
        return isBaseSlot ? 0 : null;
    }
    return normalized;
}

function buildPreviewEquipStateFromUserData(userData) {
    return {
        head: normalizePreviewEquipSlotValue('head', userData?.ahead),
        body: normalizePreviewEquipSlotValue('body', userData?.abody),
        eyes: normalizePreviewEquipSlotValue('eyes', userData?.aeyes),
        flag: normalizePreviewEquipSlotValue('flag', userData?.aflag),
        background: normalizePreviewEquipSlotValue('background', userData?.abackground),
        foreground: normalizePreviewEquipSlotValue('foreground', userData?.aforeground),
        exitem: normalizePreviewEquipSlotValue('exitem', userData?.aexitem)
    };
}

function buildCatalogStatItemIndex(catalogByCategory) {
    const index = new Map();
    const categories = Object.values(catalogByCategory || {});
    categories.forEach((items) => {
        (items || []).forEach((item) => {
            const slot = String(item?.slot || '').trim().toLowerCase();
            const refId = Number(item?.source_ref_id);
            if (!slot || !Number.isFinite(refId)) {
                return;
            }
            const key = `${slot}:${Math.trunc(refId)}`;
            const bucket = index.get(key) || [];
            bucket.push(item);
            index.set(key, bucket);
        });
    });
    return index;
}

function resolveCatalogItemForStatSummary(itemIndex, slot, refId, userData) {
    const key = `${slot}:${Math.trunc(refId)}`;
    const candidates = itemIndex.get(key) || [];
    if (!candidates.length) {
        return null;
    }

    const userGender = getUserGenderCode(userData);
    const exactMatch = candidates.find((item) => normalizeCatalogGenderValue(item?.gender) === userGender);
    if (exactMatch) {
        return exactMatch;
    }

    const unisex = candidates.find((item) => normalizeCatalogGenderValue(item?.gender) === 'u');
    if (unisex) {
        return unisex;
    }

    return candidates[0];
}

function computeMyAvatarStatTotals(previewEquipState, itemIndex, userData) {
    const totals = createEmptyCatalogStatTotals();
    if (!previewEquipState || !itemIndex) {
        return totals;
    }

    MY_AVATAR_TRACKED_SLOTS.forEach((slot) => {
        const itemId = Number(previewEquipState?.[slot]);
        if (!Number.isFinite(itemId)) {
            return;
        }

        const item = resolveCatalogItemForStatSummary(itemIndex, slot, itemId, userData);
        if (!item) {
            return;
        }

        CATALOG_STAT_DISPLAY_ORDER.forEach((statKey) => {
            const numeric = Number(item?.[statKey]);
            if (Number.isFinite(numeric)) {
                totals[statKey] += Math.trunc(numeric);
            }
        });
    });

    return totals;
}

function ensureMyAvatarStatsOverlay(frameElement) {
    if (!frameElement) {
        return null;
    }

    let overlay = frameElement.querySelector('#avatar-shop-myavatar-stats');
    if (overlay) {
        return overlay;
    }

    overlay = document.createElement('div');
    overlay.id = 'avatar-shop-myavatar-stats';
    MY_AVATAR_STAT_SUMMARY_ORDER.forEach((statKey) => {
        const statCell = document.createElement('div');
        statCell.className = 'avatar-shop-myavatar-stat-cell';
        statCell.dataset.statKey = statKey;

        const icon = document.createElement('img');
        icon.className = 'avatar-shop-myavatar-stat-icon';
        icon.alt = '';

        const value = document.createElement('span');
        value.className = 'avatar-shop-myavatar-stat-value';
        value.textContent = '00';

        statCell.appendChild(icon);
        statCell.appendChild(value);
        overlay.appendChild(statCell);
    });

    frameElement.appendChild(overlay);
    return overlay;
}

function ensureMyAvatarCountOverlay(frameElement) {
    if (!frameElement) {
        return null;
    }

    let countEl = frameElement.querySelector('#avatar-shop-myavatar-count');
    if (countEl) {
        return countEl;
    }

    countEl = document.createElement('span');
    countEl.id = 'avatar-shop-myavatar-count';
    countEl.textContent = '0';
    frameElement.appendChild(countEl);
    return countEl;
}

function renderMyAvatarCountValue(countEl, value) {
    if (!countEl) {
        return;
    }
    const numeric = Number(value);
    const safeValue = Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
    countEl.textContent = safeValue.toLocaleString();
}

function renderMyAvatarStatSummary(overlay, totals) {
    if (!overlay) {
        return;
    }

    const safeTotals = totals || createEmptyCatalogStatTotals();
    const cells = Array.from(overlay.querySelectorAll('.avatar-shop-myavatar-stat-cell'));
    cells.forEach((cell) => {
        const statKey = String(cell.dataset.statKey || '');
        const icon = cell.querySelector('.avatar-shop-myavatar-stat-icon');
        const value = cell.querySelector('.avatar-shop-myavatar-stat-value');
        if (!statKey || !icon || !value) {
            return;
        }

        const displayValue = capMyAvatarStatDisplayValue(
            normalizeMyAvatarStatDisplayValue(statKey, safeTotals[statKey])
        );
        const frames = CATALOG_STAT_ICON_FRAMES_BY_KEY[statKey];
        const frameIndex = frames
            ? (displayValue < 0 ? frames.negative : frames.positive)
            : 11;

        icon.src = getStoreIconUrl(frameIndex);
        value.textContent = String(Math.abs(Math.trunc(displayValue))).padStart(2, '0');
    });
}

function createEmptyShopCatalog() {
    return {
        cloth: [],
        cap: [],
        glasse: [],
        flag: [],
        setitem: [],
        exitem: []
    };
}

function getStoreIconUrl(frameIndex) {
    return `${STORE_ICON_BASE_URL}${frameIndex}.png`;
}

function getStoreAvatarFrameUrl(frameIndex) {
    return `${STORE_AVATAR_BASE_URL}${frameIndex}.png`;
}

function normalizeCatalogGenderValue(genderValue) {
    const raw = String(genderValue || '').toLowerCase();
    if (raw === 'm' || raw === '0') return 'm';
    if (raw === 'f' || raw === '1') return 'f';
    return 'u';
}

function getUserGenderCode(userData) {
    return Number(userData?.gender) === 1 ? 'f' : 'm';
}

function canUserTryCatalogItem(item, userData) {
    const slot = String(item?.slot || '').toLowerCase();
    // Flags are unisex in original client behavior.
    if (slot === 'flag') {
        return true;
    }

    const itemGender = normalizeCatalogGenderValue(item?.gender);
    const userGender = getUserGenderCode(userData);
    return itemGender === 'u' || itemGender === userGender;
}

function resolveGenderBadgeIcon(itemData, categoryKey) {
    const slot = String(itemData?.slot || '').toLowerCase();
    if (categoryKey === 'flag' || slot === 'flag') {
        return null;
    }
    const gender = normalizeCatalogGenderValue(itemData?.gender);
    if (gender === 'm') return getStoreAvatarFrameUrl(2);
    if (gender === 'f') return getStoreAvatarFrameUrl(3);
    return null;
}

function isCatalogNewBadgeItem(itemData) {
    return Number(itemData?.note) === 1;
}

function formatPriceValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return 0;
    }
    return Math.floor(numeric);
}

function pickPriceAmount(itemData, keyPrefix) {
    return formatPriceValue(itemData?.[`${keyPrefix}_perm`])
        || formatPriceValue(itemData?.[`${keyPrefix}_month`])
        || formatPriceValue(itemData?.[`${keyPrefix}_week`]);
}

function resolveCatalogPurchaseState(itemData, userData) {
    const cashPrice = pickPriceAmount(itemData, 'cash');
    const goldPrice = pickPriceAmount(itemData, 'gold');
    const userCash = formatPriceValue(userData?.cash);
    const userGold = formatPriceValue(userData?.gold);
    const canBuyWithCash = cashPrice > 0 && userCash >= cashPrice;
    const canBuyWithGold = goldPrice > 0 && userGold >= goldPrice;
    return {
        cashPrice,
        goldPrice,
        userCash,
        userGold,
        canBuyWithCash,
        canBuyWithGold,
        canBuy: canBuyWithCash || canBuyWithGold
    };
}

function resolveCatalogSellGoldValue(itemData) {
    const goldPrice = pickPriceAmount(itemData, 'gold');
    if (goldPrice <= 0) {
        return 0;
    }
    return Math.max(0, Math.floor(goldPrice * 0.06));
}

function isPowerUserItemData(itemData) {
    const nameLower = String(itemData?.name || '').toLowerCase();
    const avatarCodeLower = String(itemData?.avatar_code || '').toLowerCase();
    const itemCodeLower = String(itemData?.item_code || '').toLowerCase();
    const sourceAvatarId = Number(itemData?.source_avatar_id);
    const sourceRefId = Number(itemData?.source_ref_id);
    const avatarId = Number(itemData?.avatar_id);
    const itemId = Number(itemData?.item_id);
    const knownPowerUserIds = new Set([204802, 204803, 204804]);

    return nameLower.includes('power user')
        || avatarCodeLower === 'ex2_204802'
        || avatarCodeLower === 'ex2_204803'
        || avatarCodeLower === 'ex2_204804'
        || itemCodeLower === 'ex2_204802'
        || itemCodeLower === 'ex2_204803'
        || itemCodeLower === 'ex2_204804'
        || knownPowerUserIds.has(sourceAvatarId)
        || knownPowerUserIds.has(sourceRefId)
        || knownPowerUserIds.has(avatarId)
        || knownPowerUserIds.has(itemId);
}

function resolveCatalogPriceLines(itemData) {
    const cash = pickPriceAmount(itemData, 'cash');
    const gold = pickPriceAmount(itemData, 'gold');
    const isPowerUser = isPowerUserItemData(itemData);

    if (isPowerUser && cash > 0) {
        return {
            line1: `${cash.toLocaleString()} CASH`,
            line2: 'CASH ONLY',
            line1Kind: 'cash',
            line2Kind: 'cash'
        };
    }

    if (cash > 0 && gold > 0) {
        return {
            line1: `${cash.toLocaleString()} CASH`,
            line2: `${gold.toLocaleString()} GOLD`,
            line1Kind: 'cash',
            line2Kind: 'gold'
        };
    }

    if (cash > 0) {
        return {
            line1: `${cash.toLocaleString()} CASH`,
            line2: 'CASH ONLY',
            line1Kind: 'cash',
            line2Kind: 'cash'
        };
    }

    if (gold > 0) {
        return {
            line1: 'GOLD ONLY',
            line2: `${gold.toLocaleString()} GOLD`,
            line1Kind: 'gold',
            line2Kind: 'gold'
        };
    }

    return {
        line1: '',
        line2: '',
        line1Kind: '',
        line2Kind: ''
    };
}

function resolveCatalogHoverDescription(itemData) {
    const candidates = [
        itemData?.description,
        itemData?.name
    ];

    for (const value of candidates) {
        const normalized = String(value || '').trim();
        if (normalized && normalized !== '0') {
            return normalized;
        }
    }

    return '';
}

function formatOwnedItemRemainingLabel(itemData, nowMs = Date.now()) {
    const expireAtMs = Number(itemData?.expire_at);
    if (!Number.isFinite(expireAtMs) || expireAtMs <= 0) {
        return '';
    }

    const remainingMs = Math.max(0, expireAtMs - nowMs);
    if (remainingMs <= 0) {
        return 'Expired';
    }

    const hourMs = 60 * 60 * 1000;
    const dayMs = 24 * hourMs;
    const weekMs = 7 * dayMs;
    const monthMs = 30 * dayMs;
    const yearMs = 365 * dayMs;

    const formatUnit = (value, unit) => {
        const safeValue = Math.max(1, Math.ceil(value));
        const plural = safeValue === 1 ? '' : 's';
        return `${safeValue} ${unit}${plural} Left`;
    };

    if (remainingMs < dayMs) {
        return formatUnit(remainingMs / hourMs, 'Hour');
    }
    if (remainingMs < weekMs) {
        return formatUnit(remainingMs / dayMs, 'Day');
    }
    if (remainingMs < monthMs) {
        return formatUnit(remainingMs / weekMs, 'Week');
    }
    if (remainingMs < yearMs) {
        return formatUnit(remainingMs / monthMs, 'Month');
    }
    return formatUnit(remainingMs / yearMs, 'Year');
}

function resolveOwnedExDisplayName(itemData, nowMs = Date.now()) {
    const baseName = String(itemData?.name || '').trim();
    const remainingLabel = formatOwnedItemRemainingLabel(itemData, nowMs);
    if (!remainingLabel) {
        return baseName;
    }
    return `${baseName}:${remainingLabel}`;
}

function resolveCatalogStatRows(itemData, maxRows = 3) {
    const limit = Number.isFinite(maxRows) ? Math.max(0, Math.floor(maxRows)) : 3;
    const rows = [];

    for (const statKey of CATALOG_STAT_DISPLAY_ORDER) {
        let numeric = Number(itemData?.[statKey]);
        // Client parity: turn-delay sign is inverted vs stored DB sign.
        if (statKey === 'stat_time') {
            numeric = -numeric;
        }
        if (!Number.isFinite(numeric) || numeric === 0) {
            continue;
        }

        const iconFrames = CATALOG_STAT_ICON_FRAMES_BY_KEY[statKey];
        if (!iconFrames) {
            continue;
        }

        const iconFrame = numeric < 0 ? iconFrames.negative : iconFrames.positive;
        rows.push({
            iconUrl: getStoreIconUrl(iconFrame),
            value: String(Math.abs(Math.trunc(numeric))).padStart(2, '0')
        });

        if (rows.length >= limit) {
            break;
        }
    }

    return rows;
}

function resolveSlotIconFrame(itemData, categoryKey, userData) {
    const slot = String(itemData?.slot || '').toLowerCase();
    const gender = (() => {
        const itemGender = normalizeCatalogGenderValue(itemData?.gender);
        if (itemGender === 'm' || itemGender === 'f') {
            return itemGender;
        }
        return Number(userData?.gender) === 1 ? 'f' : 'm';
    })();

    if (categoryKey === 'cloth' || slot === 'body') return gender === 'f' ? 1 : 0;
    if (categoryKey === 'cap' || slot === 'head') return gender === 'f' ? 3 : 2;
    if (categoryKey === 'glasse' || slot === 'eyes') return gender === 'f' ? 5 : 4;
    if (categoryKey === 'flag' || slot === 'flag') return 6;
    if (slot === 'background') return 31;
    if (slot === 'foreground') return 30;
    if (categoryKey === 'setitem') return 31;
    if (categoryKey === 'exitem' || slot === 'exitem') return 29;
    return gender === 'f' ? 1 : 0;
}

function resolveSlotIconUrl(itemData, categoryKey, userData) {
    return getStoreIconUrl(resolveSlotIconFrame(itemData, categoryKey, userData));
}

function isExOwnedInventorySlot(slotValue) {
    const slot = String(slotValue || '').toLowerCase();
    return slot === 'background' || slot === 'foreground' || slot === 'exitem';
}

function resolveCategoryKeyFromSlot(slotValue) {
    const slot = String(slotValue || '').toLowerCase();
    if (slot === 'head') return 'cap';
    if (slot === 'body') return 'cloth';
    if (slot === 'eyes') return 'glasse';
    if (slot === 'flag') return 'flag';
    if (slot === 'background' || slot === 'foreground' || slot === 'exitem') return 'exitem';
    return 'cap';
}

function shouldHideCatalogItem(item) {
    const slot = String(item?.slot || '').toLowerCase();
    const name = String(item?.name || '').trim().toLowerCase();
    const code = String(item?.avatar_code || '').trim().toLowerCase();
    const refId = Number(item?.source_ref_id);

    if (slot === 'eyes') {
        if (name === 'standard' || name === 'default' || name === 'none') {
            return true;
        }
        if (code === 'mg00000' || code === 'fg00000') {
            return true;
        }
        if (Number.isFinite(refId) && refId === 0) {
            return true;
        }
    }

    return false;
}

function isBaseAvatarCategoryKey(categoryKey) {
    return categoryKey === 'cap'
        || categoryKey === 'cloth'
        || categoryKey === 'glasse'
        || categoryKey === 'flag';
}

function hasAtlasEntryByCode(atlases, code) {
    const normalized = String(code || '').trim().toLowerCase();
    if (!normalized) {
        return false;
    }
    return Boolean(
        atlases?.[`gbth_${normalized}`]
        || atlases?.[`db_${normalized}`]
        || atlases?.[normalized]
    );
}

function canRenderCatalogItemWithAtlas(atlases, item, categoryKey) {
    const directCode = String(item?.avatar_code || '').trim().toLowerCase();
    if (hasAtlasEntryByCode(atlases, directCode)) {
        return true;
    }

    const slot = getSlotByCategory(categoryKey, item);
    const refId = Number(item?.source_ref_id);
    if (!slot || !Number.isFinite(refId)) {
        return false;
    }

    const normalizedGender = normalizeCatalogGenderValue(item?.gender);
    const genderCandidates = normalizedGender === 'u' ? ['m', 'f'] : [normalizedGender];

    for (const gender of genderCandidates) {
        const folderCode = resolveAtlasFolderCode(gender, slot, refId, false);
        if (hasAtlasEntryByCode(atlases, folderCode)) {
            return true;
        }
    }
    return false;
}

async function filterRenderableCatalogItems(items, categoryKey) {
    if (!isBaseAvatarCategoryKey(categoryKey)) {
        return items || [];
    }

    try {
        const meta = await loadAtlasMetadata();
        const atlases = meta?.atlases || {};
        return (items || []).filter((item) => canRenderCatalogItemWithAtlas(atlases, item, categoryKey));
    } catch (error) {
        // If metadata is unavailable, keep existing behavior rather than hiding everything.
        return items || [];
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const ui = window.GBTH?.ui;
    const buddyUi = window.GBTH?.buddy;
    const socket = io();
    let userData = JSON.parse(sessionStorage.getItem('user'));
    let currentPreviewEquip = buildPreviewEquipStateFromUserData(userData);
    let myAvatarStatIndex = new Map();
    let myAvatarStatsOverlay = null;
    let myAvatarCountEl = null;

    const nicknameSpan = document.getElementById('lobby-nickname');
    const guildSpan = document.getElementById('lobby-guild');
    const rankIcon = document.getElementById('lobby-rank-icon');
    const rankingValue = document.getElementById('lobby-ranking-value');
    const gpSpan = document.getElementById('lobby-gp');
    const goldSpan = document.getElementById('lobby-gold');
    const cashSpan = document.getElementById('lobby-cash');
    const buddyPanel = document.getElementById('buddy-list-panel');
    const buddyListContent = document.querySelector('.buddy-list-content');
    const onlineCountEl = document.getElementById('buddy-online-count');
    const totalCountEl = document.getElementById('buddy-total-count');
    const addBuddyPopup = document.getElementById('add-buddy-popup');
    const addBuddyInput = document.getElementById('add-buddy-input');
    const addBuddyCursor = document.getElementById('add-buddy-cursor');
    const addBuddyGhostSpan = document.getElementById('add-buddy-input-ghost');
    const buddyAlertPopup = document.getElementById('buddy-alert-popup');
    const buddyAlertTextBox = document.getElementById('buddy-alert-text-box');
    const btnBuddyAlertYes = document.getElementById('btn-buddy-alert-yes');
    const btnBuddyAlertNo = document.getElementById('btn-buddy-alert-no');
    const buddyChatWindow = document.getElementById('buddy-chat-window');
    const buddyChatInput = document.getElementById('buddy-chat-input');
    const buddyChatCursor = document.getElementById('buddy-chat-cursor');
    const buddyChatGhostSpan = document.getElementById('buddy-chat-input-ghost');
    const buddyChatNickname = document.getElementById('buddy-chat-nickname');
    const buddyChatMessages = document.getElementById('buddy-chat-messages');
    const buddyChatContent = document.querySelector('.buddy-chat-content');
    const avatarShopBuyPopup = document.getElementById('avatar-shop-buy-popup');
    const avatarShopBuyName = document.getElementById('avatar-shop-buy-name');
    const avatarShopBuyGoldLine = document.getElementById('avatar-shop-buy-gold-line');
    const avatarShopBuyCashLine = document.getElementById('avatar-shop-buy-cash-line');
    const avatarShopBuyResaleLine = document.getElementById('avatar-shop-buy-resale-line');
    const avatarShopBuyDesc = document.getElementById('avatar-shop-buy-desc');
    const avatarShopBuyThumb = document.getElementById('avatar-shop-buy-thumb');
    const avatarShopOwnedList = document.getElementById('avatar-shop-owned-list');
    const avatarShopOwnedExList = document.getElementById('avatar-shop-owned-ex-list');
    const btnStoreOwnedUp = document.getElementById('btn-store-owned-up');
    const btnStoreOwnedDown = document.getElementById('btn-store-owned-down');
    const btnStoreOwnedExUp = document.getElementById('btn-store-owned-ex-up');
    const btnStoreOwnedExDown = document.getElementById('btn-store-owned-ex-down');
    const btnAvatarShopSell = document.getElementById('btn-avatar-shop-sell');
    const btnStoreSortPuton = document.getElementById('btn-store-sort-puton');
    const btnStoreSortHat = document.getElementById('btn-store-sort-hat');
    const btnStoreSortCloth = document.getElementById('btn-store-sort-cloth');
    const btnStoreSortGlasses = document.getElementById('btn-store-sort-glasses');
    const btnStoreSortFlag = document.getElementById('btn-store-sort-flag');
    const BUDDY_CHAT_HISTORY_KEY = 'gbth_buddy_chat_history_v1';
    const BUDDY_CHAT_HISTORY_LIMIT = 120;
    let ownedInventoryRegularItems = [];
    let ownedInventoryExItems = [];
    let ownedListSortPrimarySlot = 'all';
    let selectedOwnedRegularChestId = null;
    let selectedOwnedExChestId = null;
    let ownedDragState = null;
    let ownedInventoryActionInProgress = false;
    let buyActionInProgress = false;

    const buddyScroll = ui?.setupScrollControls({
        viewport: buddyListContent,
        upButton: document.querySelector('.btn-buddy-scroll-up'),
        downButton: document.querySelector('.btn-buddy-scroll-down'),
        scrollAmount: 30
    });

    const buddyChatScroll = ui?.setupScrollControls({
        viewport: buddyChatContent,
        upButton: document.querySelector('.buddy-chat-scroll-up'),
        downButton: document.querySelector('.buddy-chat-scroll-down'),
        scrollAmount: 30
    });

    const ownedRegularScroll = ui?.setupScrollControls({
        viewport: avatarShopOwnedList,
        upButton: btnStoreOwnedUp,
        downButton: btnStoreOwnedDown,
        scrollAmount: 34
    });

    const ownedExScroll = ui?.setupScrollControls({
        viewport: avatarShopOwnedExList,
        upButton: btnStoreOwnedExUp,
        downButton: btnStoreOwnedExDown,
        scrollAmount: 34
    });

    const addBuddyCursorController = ui?.setupInputCursor({
        input: addBuddyInput,
        cursor: addBuddyCursor,
        ghost: addBuddyGhostSpan,
        baseLeft: 5,
        baseTop: 4,
        useInputOffset: true
    });

    const buddyChatCursorController = ui?.setupInputCursor({
        input: buddyChatInput,
        cursor: buddyChatCursor,
        ghost: buddyChatGhostSpan,
        baseLeft: 0
    });

    const errorPopup = ui?.createErrorPopupController({
        overlay: document.getElementById('error-overlay'),
        title: document.getElementById('error-title'),
        message: document.getElementById('error-message'),
        confirmButton: document.getElementById('error-confirm-btn')
    });

    window.showError = (title, message) => errorPopup?.show(title, message);

    if (buddyPanel) ui?.makeDraggable(buddyPanel);
    if (addBuddyPopup) ui?.makeDraggable(addBuddyPopup);
    if (buddyAlertPopup) ui?.makeDraggable(buddyAlertPopup);
    if (buddyChatWindow) ui?.makeDraggable(buddyChatWindow);
    if (avatarShopBuyPopup) ui?.makeDraggable(avatarShopBuyPopup, { handleSelector: '#avatar-shop-buy-popup-header' });

    buddyUi?.bindInteractions({
        listContent: buddyListContent,
        onOpenChat: (nickname) => window.openBuddyChat?.(nickname)
    });

    function toggleBuddyPanel() {
        if (!buddyPanel) return;
        const isHidden = buddyPanel.classList.contains('hidden');
        if (isHidden) {
            buddyPanel.style.top = '';
            buddyPanel.style.left = '';
            buddyUi?.clearSelection(buddyListContent);
        }
        buddyPanel.classList.toggle('hidden');
    }

    window.toggleBuddyList = toggleBuddyPanel;

    function updateUserInfo(data) {
        if (!data) return;
        if (nicknameSpan) nicknameSpan.textContent = data.nickname || '';
        if (guildSpan) {
            guildSpan.textContent = data.guild && data.guild.trim() !== ''
                ? `${data.guild} [ 1/ 1]`
                : '';
        }
        if (rankingValue) rankingValue.textContent = (data.rank !== undefined ? data.rank : 1).toLocaleString();
        if (rankIcon) {
            const grade = data.grade || 24;
            rankIcon.src = `/assets/shared/rank1/rank1_frame_${grade}.png`;
        }
        if (gpSpan) gpSpan.textContent = `${(data.score || 0).toLocaleString()} GP`;
        if (goldSpan) goldSpan.textContent = `GOLD : ${(data.gold || 0).toLocaleString()}`;
        if (cashSpan) cashSpan.textContent = `CASH : ${(data.cash || 0).toLocaleString()}`;
    }

    function refreshMyAvatarStatsSummary() {
        if (!myAvatarStatsOverlay) {
            return;
        }
        const totals = computeMyAvatarStatTotals(currentPreviewEquip, myAvatarStatIndex, userData);
        renderMyAvatarStatSummary(myAvatarStatsOverlay, totals);
    }

    function applyUserDataSnapshot(data, options = {}) {
        if (!data || typeof data !== 'object') {
            return;
        }

        const { persistSession = true } = options;
        userData = data;
        if (persistSession) {
            sessionStorage.setItem('user', JSON.stringify(data));
        }
        updateUserInfo(data);

        const baseState = buildPreviewEquipStateFromUserData(data);
        currentPreviewEquip = {
            ...currentPreviewEquip,
            head: baseState.head,
            body: baseState.body,
            eyes: baseState.eyes,
            flag: baseState.flag,
            background: baseState.background,
            foreground: baseState.foreground,
            exitem: baseState.exitem
        };

        if (window.avatarShopPreview) {
            window.avatarShopPreview.setGender(data?.gender);
            window.avatarShopPreview.setEquip('head', data?.ahead);
            window.avatarShopPreview.setEquip('body', data?.abody);
            window.avatarShopPreview.setEquip('eyes', data?.aeyes);
            window.avatarShopPreview.setEquip('flag', data?.aflag);
            window.avatarShopPreview.setEquip('background', data?.abackground);
            window.avatarShopPreview.setEquip('foreground', data?.aforeground);
            window.avatarShopPreview.setEquip('exitem', data?.aexitem);
        }

        refreshMyAvatarStatsSummary();

        const activeShopList = document.getElementById('avatar-shop-list');
        const activeBuyButton = document.getElementById('btn-store-buy');
        syncBuyButtonState(activeShopList, activeBuyButton, data);
        if (avatarShopBuyPopup && !avatarShopBuyPopup.classList.contains('hidden')) {
            const selectedItem = getSelectedShopItem(activeShopList);
            const purchaseState = resolveCatalogPurchaseState(selectedItem, data);
            if (!purchaseState.canBuy) {
                hideAvatarShopBuyPopup();
            }
        }
    }

    function showAvatarShopError(title, message) {
        const safeTitle = String(title || 'System Error');
        const safeMessage = String(message || 'An unexpected error occurred. Please try again later.');
        if (typeof window.showError === 'function') {
            window.showError(safeTitle, safeMessage);
            return;
        }
        window.showBuddyAlert?.(safeMessage);
    }

    function getSelectedOwnedChestId() {
        const regularId = Number(selectedOwnedRegularChestId);
        if (Number.isFinite(regularId) && regularId > 0) {
            return regularId;
        }
        const exId = Number(selectedOwnedExChestId);
        if (Number.isFinite(exId) && exId > 0) {
            return exId;
        }
        return null;
    }

    function updateSellButtonState() {
        if (!btnAvatarShopSell) {
            return;
        }
        const hasSelection = getSelectedOwnedChestId() !== null;
        btnAvatarShopSell.disabled = ownedInventoryActionInProgress || !hasSelection;
    }

    function clearOwnedDropTargets() {
        document.querySelectorAll('.avatar-shop-owned-item.is-drop-target, .avatar-shop-owned-ex-item.is-drop-target').forEach((element) => {
            element.classList.remove('is-drop-target');
        });
    }

    function findOwnedItemByChestId(chestId) {
        const normalizedChestId = Number(chestId);
        if (!Number.isFinite(normalizedChestId) || normalizedChestId <= 0) {
            return null;
        }
        const regular = ownedInventoryRegularItems.find((item) => Number(item?.chest_id) === normalizedChestId);
        if (regular) {
            return { item: regular, listType: 'regular' };
        }
        const ex = ownedInventoryExItems.find((item) => Number(item?.chest_id) === normalizedChestId);
        if (ex) {
            return { item: ex, listType: 'ex' };
        }
        return null;
    }

    function getOwnedListByType(listType) {
        return listType === 'ex' ? ownedInventoryExItems : ownedInventoryRegularItems;
    }

    function getOwnedRegularSlotPriority(primarySlot) {
        const normalizedPrimary = String(primarySlot || 'all').toLowerCase();
        if (normalizedPrimary === 'all') {
            return OWNED_REGULAR_SLOT_SORT_ORDER.slice();
        }
        if (!OWNED_REGULAR_SLOT_SORT_ORDER.includes(normalizedPrimary)) {
            return OWNED_REGULAR_SLOT_SORT_ORDER.slice();
        }
        return [
            normalizedPrimary,
            ...OWNED_REGULAR_SLOT_SORT_ORDER.filter((slot) => slot !== normalizedPrimary)
        ];
    }

    function getSortedOwnedRegularItemsForDisplay() {
        const priorityOrder = getOwnedRegularSlotPriority(ownedListSortPrimarySlot);
        const priorityMap = new Map(priorityOrder.map((slot, index) => [slot, index]));
        return ownedInventoryRegularItems.slice().sort((leftItem, rightItem) => {
            const leftSlot = String(leftItem?.slot || '').toLowerCase();
            const rightSlot = String(rightItem?.slot || '').toLowerCase();
            const leftPriority = priorityMap.has(leftSlot) ? priorityMap.get(leftSlot) : Number.MAX_SAFE_INTEGER;
            const rightPriority = priorityMap.has(rightSlot) ? priorityMap.get(rightSlot) : Number.MAX_SAFE_INTEGER;
            if (leftPriority !== rightPriority) {
                return leftPriority - rightPriority;
            }

            const leftOrder = Number(leftItem?.place_order);
            const rightOrder = Number(rightItem?.place_order);
            const leftHasOrder = Number.isFinite(leftOrder);
            const rightHasOrder = Number.isFinite(rightOrder);
            if (leftHasOrder && rightHasOrder && leftOrder !== rightOrder) {
                return leftOrder - rightOrder;
            }
            if (leftHasOrder !== rightHasOrder) {
                return leftHasOrder ? -1 : 1;
            }

            const leftChestId = Number(leftItem?.chest_id);
            const rightChestId = Number(rightItem?.chest_id);
            const leftHasChestId = Number.isFinite(leftChestId);
            const rightHasChestId = Number.isFinite(rightChestId);
            if (leftHasChestId && rightHasChestId && leftChestId !== rightChestId) {
                return leftChestId - rightChestId;
            }
            if (leftHasChestId !== rightHasChestId) {
                return leftHasChestId ? -1 : 1;
            }
            return 0;
        });
    }

    function getOwnedDisplayListByType(listType) {
        if (listType === 'ex') {
            return ownedInventoryExItems;
        }
        return getSortedOwnedRegularItemsForDisplay();
    }

    function setOwnedListByType(listType, nextList) {
        if (listType === 'ex') {
            ownedInventoryExItems = nextList;
            return;
        }
        ownedInventoryRegularItems = nextList;
    }

    function bindOwnedRowDragHandlers(row, listType, chestId) {
        if (!row) {
            return;
        }
        const itemsForList = getOwnedListByType(listType);
        row.draggable = !ownedInventoryActionInProgress && itemsForList.length > 1;
        if (!row.draggable) {
            return;
        }

        row.addEventListener('dragstart', (event) => {
            if (ownedInventoryActionInProgress) {
                event.preventDefault();
                return;
            }
            ownedDragState = { listType, chestId };
            row.classList.add('is-dragging');
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', `${listType}:${chestId}`);
            }
        });

        row.addEventListener('dragover', (event) => {
            if (!ownedDragState || ownedDragState.listType !== listType || Number(ownedDragState.chestId) === Number(chestId)) {
                return;
            }
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'move';
            }
            clearOwnedDropTargets();
            row.classList.add('is-drop-target');
        });

        row.addEventListener('dragleave', () => {
            row.classList.remove('is-drop-target');
        });

        row.addEventListener('drop', async (event) => {
            event.preventDefault();
            row.classList.remove('is-drop-target');
            if (!ownedDragState || ownedDragState.listType !== listType || Number(ownedDragState.chestId) === Number(chestId)) {
                return;
            }
            const sourceChestId = Number(ownedDragState.chestId);
            const targetChestId = Number(chestId);
            ownedDragState = null;
            clearOwnedDropTargets();
            await requestReorderOwnedItems(listType, sourceChestId, targetChestId);
        });

        row.addEventListener('dragend', () => {
            row.classList.remove('is-dragging');
            ownedDragState = null;
            clearOwnedDropTargets();
        });
    }

    function setActiveOwnedSortButton(sortSlot) {
        const targetSlot = String(sortSlot || 'all');
        const entries = Object.entries(OWNED_SORT_SLOT_BY_BUTTON_ID);
        entries.forEach(([buttonId, slot]) => {
            const button = document.getElementById(buttonId);
            if (!button) {
                return;
            }
            button.classList.toggle('active', slot === targetSlot);
        });
    }

    function renderOwnedRegularList() {
        if (!avatarShopOwnedList) {
            return;
        }

        avatarShopOwnedList.innerHTML = '';
        getSortedOwnedRegularItemsForDisplay().forEach((item) => {
            const chestId = Number(item?.chest_id);
            if (!Number.isFinite(chestId) || chestId <= 0) {
                return;
            }

            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'avatar-shop-owned-item';
            row.dataset.chestId = String(chestId);
            if (chestId === Number(selectedOwnedRegularChestId)) {
                row.classList.add('selected');
            }
            if (Number(item?.wearing) === 1) {
                row.classList.add('is-equipped');
            }

            const equipArrow = document.createElement('img');
            equipArrow.className = 'avatar-shop-owned-item-equip-arrow';
            if (Number(item?.wearing) !== 1) {
                equipArrow.classList.add('is-hidden');
            }
            equipArrow.alt = '';
            equipArrow.src = getStoreIconUrl(7);
            row.appendChild(equipArrow);

            const slotIcon = document.createElement('img');
            slotIcon.className = 'avatar-shop-owned-item-slot';
            slotIcon.alt = '';
            slotIcon.src = resolveSlotIconUrl(item, resolveCategoryKeyFromSlot(item?.slot), userData);
            row.appendChild(slotIcon);

            const nameEl = document.createElement('span');
            nameEl.className = 'avatar-shop-owned-item-name';
            nameEl.textContent = String(item?.name || '');
            row.appendChild(nameEl);

            const statRows = resolveCatalogStatRows(item, 3);
            if (statRows.length > 0) {
                const statsEl = document.createElement('span');
                statsEl.className = 'avatar-shop-owned-item-stats';
                statRows.forEach((statRow) => {
                    const statEl = document.createElement('span');
                    statEl.className = 'avatar-shop-owned-item-stat';

                    const statIcon = document.createElement('img');
                    statIcon.className = 'avatar-shop-owned-item-stat-icon';
                    statIcon.alt = '';
                    statIcon.src = statRow.iconUrl;
                    statEl.appendChild(statIcon);

                    const statValue = document.createElement('span');
                    statValue.className = 'avatar-shop-owned-item-stat-value';
                    statValue.textContent = statRow.value;
                    statEl.appendChild(statValue);

                    statsEl.appendChild(statEl);
                });
                row.appendChild(statsEl);
            }

            row.addEventListener('click', () => {
                selectedOwnedRegularChestId = chestId;
                selectedOwnedExChestId = null;
                renderOwnedRegularList();
                renderOwnedExList();
                updateSellButtonState();
            });

            row.addEventListener('dblclick', () => {
                requestToggleOwnedItemEquip(chestId);
            });

            bindOwnedRowDragHandlers(row, 'regular', chestId);

            avatarShopOwnedList.appendChild(row);
        });
        ownedRegularScroll?.update();
    }

    function renderOwnedExList() {
        if (!avatarShopOwnedExList) {
            return;
        }

        const nowMs = Date.now();
        avatarShopOwnedExList.innerHTML = '';
        ownedInventoryExItems.forEach((item) => {
            const chestId = Number(item?.chest_id);
            if (!Number.isFinite(chestId) || chestId <= 0) {
                return;
            }

            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'avatar-shop-owned-ex-item';
            row.dataset.chestId = String(chestId);
            if (chestId === Number(selectedOwnedExChestId)) {
                row.classList.add('selected');
            }
            if (Number(item?.wearing) === 1) {
                row.classList.add('is-equipped');
            }

            const equipArrow = document.createElement('img');
            equipArrow.className = 'avatar-shop-owned-ex-item-equip-arrow';
            if (Number(item?.wearing) !== 1) {
                equipArrow.classList.add('is-hidden');
            }
            equipArrow.alt = '';
            equipArrow.src = getStoreIconUrl(7);
            row.appendChild(equipArrow);

            const slotIcon = document.createElement('img');
            slotIcon.className = 'avatar-shop-owned-ex-item-slot';
            slotIcon.alt = '';
            slotIcon.src = resolveSlotIconUrl(item, resolveCategoryKeyFromSlot(item?.slot), userData);
            row.appendChild(slotIcon);

            const nameEl = document.createElement('span');
            nameEl.className = 'avatar-shop-owned-ex-item-name';
            nameEl.textContent = resolveOwnedExDisplayName(item, nowMs);
            row.appendChild(nameEl);

            row.addEventListener('click', () => {
                selectedOwnedExChestId = chestId;
                selectedOwnedRegularChestId = null;
                renderOwnedRegularList();
                renderOwnedExList();
                updateSellButtonState();
            });

            row.addEventListener('dblclick', () => {
                requestToggleOwnedItemEquip(chestId);
            });

            bindOwnedRowDragHandlers(row, 'ex', chestId);

            avatarShopOwnedExList.appendChild(row);
        });
        ownedExScroll?.update();
    }

    function applyInventoryPayload(inventoryPayload, options = {}) {
        const { preserveSelection = true } = options;
        const nextRegular = Array.isArray(inventoryPayload?.regularItems) ? inventoryPayload.regularItems : [];
        const nextEx = Array.isArray(inventoryPayload?.exItems) ? inventoryPayload.exItems : [];
        const nextCounts = inventoryPayload?.counts || {};

        const previousRegularSelection = selectedOwnedRegularChestId;
        const previousExSelection = selectedOwnedExChestId;

        ownedInventoryRegularItems = nextRegular;
        ownedInventoryExItems = nextEx;

        if (preserveSelection) {
            const regularStillExists = ownedInventoryRegularItems.some((item) => Number(item?.chest_id) === Number(previousRegularSelection));
            const exStillExists = ownedInventoryExItems.some((item) => Number(item?.chest_id) === Number(previousExSelection));
            selectedOwnedRegularChestId = regularStillExists ? previousRegularSelection : null;
            selectedOwnedExChestId = exStillExists ? previousExSelection : null;
        } else {
            selectedOwnedRegularChestId = null;
            selectedOwnedExChestId = null;
        }

        renderOwnedRegularList();
        renderOwnedExList();
        updateSellButtonState();

        const totalCount = Number(nextCounts?.total);
        renderMyAvatarCountValue(myAvatarCountEl, Number.isFinite(totalCount) ? totalCount : (nextRegular.length + nextEx.length));
    }

    function applyAvatarShopServerPayload(payload, options = {}) {
        if (!payload || typeof payload !== 'object') {
            return;
        }
        if (payload.user) {
            applyUserDataSnapshot(payload.user, { persistSession: true });
        }
        if (payload.inventory) {
            applyInventoryPayload(payload.inventory, options);
        }
    }

    async function refreshAvatarShopInventory(options = {}) {
        if (!userData?.id) {
            return;
        }
        try {
            const payload = await loadAvatarShopInventory(userData.id);
            applyAvatarShopServerPayload(payload, options);
        } catch (error) {
            console.warn('[AvatarShop] Failed to load owned inventory:', error);
            applyInventoryPayload({ regularItems: [], exItems: [], counts: { total: 0 } }, { preserveSelection: false });
        }
    }

    async function requestSetOwnedItemEquip(chestId, shouldEquip) {
        const normalizedChestId = Number(chestId);
        if (!Number.isFinite(normalizedChestId) || normalizedChestId <= 0 || !userData?.id || ownedInventoryActionInProgress) {
            return;
        }

        ownedInventoryActionInProgress = true;
        updateSellButtonState();
        try {
            const payload = shouldEquip
                ? await equipAvatarShopChestItem(userData.id, normalizedChestId)
                : await unequipAvatarShopChestItem(userData.id, normalizedChestId);
            applyAvatarShopServerPayload(payload, { preserveSelection: true });
            const existsInRegular = ownedInventoryRegularItems.some((item) => Number(item?.chest_id) === normalizedChestId);
            const existsInEx = ownedInventoryExItems.some((item) => Number(item?.chest_id) === normalizedChestId);
            selectedOwnedRegularChestId = existsInRegular ? normalizedChestId : null;
            selectedOwnedExChestId = existsInEx ? normalizedChestId : null;
            renderOwnedRegularList();
            renderOwnedExList();
        } catch (error) {
            const actionLabel = shouldEquip ? 'Equip' : 'Unequip';
            showAvatarShopError(`${actionLabel} Error`, error?.message || `Unable to ${actionLabel.toLowerCase()} item.`);
        } finally {
            ownedInventoryActionInProgress = false;
            updateSellButtonState();
            renderOwnedRegularList();
            renderOwnedExList();
        }
    }

    async function requestToggleOwnedItemEquip(chestId) {
        const match = findOwnedItemByChestId(chestId);
        if (!match) {
            return;
        }
        const shouldEquip = Number(match.item?.wearing) !== 1;
        if (!shouldEquip && isPowerUserItemData(match.item)) {
            showAvatarShopError('Equip Error', 'Power User cannot be unequipped.');
            return;
        }
        await requestSetOwnedItemEquip(chestId, shouldEquip);
    }

    async function requestReorderOwnedItems(listType, sourceChestId, targetChestId) {
        if (!userData?.id || ownedInventoryActionInProgress) {
            return;
        }
        const normalizedSourceId = Number(sourceChestId);
        const normalizedTargetId = Number(targetChestId);
        if (!Number.isFinite(normalizedSourceId) || normalizedSourceId <= 0 || !Number.isFinite(normalizedTargetId) || normalizedTargetId <= 0) {
            return;
        }
        if (normalizedSourceId === normalizedTargetId) {
            return;
        }

        const currentList = getOwnedDisplayListByType(listType);
        if (!Array.isArray(currentList) || currentList.length <= 1) {
            return;
        }

        const sourceIndex = currentList.findIndex((item) => Number(item?.chest_id) === normalizedSourceId);
        const targetIndex = currentList.findIndex((item) => Number(item?.chest_id) === normalizedTargetId);
        if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
            return;
        }

        const nextList = currentList.slice();
        const [movedItem] = nextList.splice(sourceIndex, 1);
        nextList.splice(targetIndex, 0, movedItem);
        const orderedChestIds = nextList
            .map((item) => Number(item?.chest_id))
            .filter((value) => Number.isFinite(value) && value > 0);
        if (orderedChestIds.length <= 1) {
            return;
        }

        ownedInventoryActionInProgress = true;
        updateSellButtonState();
        setOwnedListByType(listType, nextList);
        renderOwnedRegularList();
        renderOwnedExList();
        try {
            const payload = await reorderAvatarShopOwnedItems(userData.id, listType, orderedChestIds);
            applyAvatarShopServerPayload(payload, { preserveSelection: true });
        } catch (error) {
            showAvatarShopError('Sort Error', error?.message || 'Unable to reorder owned items.');
            await refreshAvatarShopInventory({ preserveSelection: true });
        } finally {
            ownedInventoryActionInProgress = false;
            updateSellButtonState();
            renderOwnedRegularList();
            renderOwnedExList();
        }
    }

    async function requestSellSelectedOwnedItem() {
        const chestId = getSelectedOwnedChestId();
        if (!Number.isFinite(chestId) || chestId <= 0 || !userData?.id || ownedInventoryActionInProgress) {
            return;
        }

        ownedInventoryActionInProgress = true;
        updateSellButtonState();
        try {
            const payload = await sellAvatarShopChestItem(userData.id, chestId);
            selectedOwnedRegularChestId = null;
            selectedOwnedExChestId = null;
            applyAvatarShopServerPayload(payload, { preserveSelection: false });
        } catch (error) {
            showAvatarShopError('Sell Error', error?.message || 'Unable to sell item.');
        } finally {
            ownedInventoryActionInProgress = false;
            updateSellButtonState();
            renderOwnedRegularList();
            renderOwnedExList();
        }
    }

    updateUserInfo(userData);

    if (userData) {
        socket.emit('set_user_data', {
            nickname: userData.nickname,
            id: userData.id,
            gender: userData.gender,
            grade: userData.grade || 24,
            guild: userData.guild || '',
            authority: userData.authority || 0,
            location: 'avatar_shop'
        });
    }

    socket.on('user_info_update', (data) => {
        applyUserDataSnapshot(data, { persistSession: true });
    });

    const btnStoreExit = document.getElementById('btn-store-exit');
    const btnStoreBuddy = document.getElementById('btn-store-buddy');
    const btnStorePuton = document.getElementById('btn-store-puton');
    const btnStoreBuy = document.getElementById('btn-store-buy');
    const btnStoreMainUp = document.getElementById('btn-store-main-up');
    const btnStoreMainDown = document.getElementById('btn-store-main-down');
    const btnStoreWindowBuyCash = document.getElementById('btn-storewindow-buy-cash');
    const btnStoreWindowBuyGold = document.getElementById('btn-storewindow-buy-gold');
    const btnStoreWindowCancel = document.getElementById('btn-storewindow-cancel');

    if (btnStorePuton) btnStorePuton.disabled = true;
    if (btnStoreBuy) btnStoreBuy.disabled = true;
    if (btnStoreMainUp) btnStoreMainUp.disabled = true;
    if (btnStoreMainDown) btnStoreMainDown.disabled = true;
    if (btnAvatarShopSell) btnAvatarShopSell.disabled = true;

    const ownedSortButtons = [
        btnStoreSortPuton,
        btnStoreSortHat,
        btnStoreSortCloth,
        btnStoreSortGlasses,
        btnStoreSortFlag
    ].filter(Boolean);

    ownedSortButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const sortSlot = OWNED_SORT_SLOT_BY_BUTTON_ID[button.id] || 'all';
            ownedListSortPrimarySlot = sortSlot;
            setActiveOwnedSortButton(sortSlot);
            renderOwnedRegularList();
        });
    });
    setActiveOwnedSortButton(ownedListSortPrimarySlot);

    if (btnAvatarShopSell) {
        btnAvatarShopSell.addEventListener('click', () => {
            requestSellSelectedOwnedItem();
        });
    }

    function hideAvatarShopBuyPopup() {
        if (!avatarShopBuyPopup) {
            return;
        }
        avatarShopBuyPopup.classList.add('hidden');
    }

    function renderAvatarShopBuyPopup(listContainer) {
        if (
            !avatarShopBuyName
            || !avatarShopBuyGoldLine
            || !avatarShopBuyCashLine
            || !avatarShopBuyResaleLine
            || !avatarShopBuyDesc
            || !avatarShopBuyThumb
        ) {
            return false;
        }

        const selectedCard = listContainer?.querySelector('.avatar-shop-item.selected');
        const selectedItem = selectedCard?.__shopItemData || null;
        if (!selectedItem) {
            return false;
        }

        const purchaseState = resolveCatalogPurchaseState(selectedItem, userData);
        if (!purchaseState.canBuy) {
            return false;
        }

        avatarShopBuyName.textContent = String(selectedItem?.name || '');
        avatarShopBuyGoldLine.textContent = purchaseState.goldPrice > 0
            ? `Buy with Gold ${purchaseState.goldPrice.toLocaleString()} Gold`
            : 'Buy with Gold unavailable';
        avatarShopBuyCashLine.textContent = purchaseState.cashPrice > 0
            ? `Buy with Cash ${purchaseState.cashPrice.toLocaleString()} Cash`
            : 'Buy with Cash unavailable';
        avatarShopBuyGoldLine.classList.toggle('disabled', !purchaseState.canBuyWithGold);
        avatarShopBuyCashLine.classList.toggle('disabled', !purchaseState.canBuyWithCash);

        const sellGold = resolveCatalogSellGoldValue(selectedItem);
        avatarShopBuyResaleLine.textContent = sellGold > 0
            ? `(Sell -${sellGold.toLocaleString()} Gold)`
            : '';

        avatarShopBuyDesc.textContent = resolveCatalogHoverDescription(selectedItem);
        copyAvatarShopThumbVisual(selectedCard?.querySelector('.avatar-shop-item-thumb'), avatarShopBuyThumb);

        if (btnStoreWindowBuyCash) {
            btnStoreWindowBuyCash.disabled = buyActionInProgress || !purchaseState.canBuyWithCash;
        }
        if (btnStoreWindowBuyGold) {
            btnStoreWindowBuyGold.disabled = buyActionInProgress || !purchaseState.canBuyWithGold;
        }
        if (btnStoreWindowCancel) {
            btnStoreWindowCancel.disabled = buyActionInProgress;
        }

        return true;
    }

    function openAvatarShopBuyPopup(listContainer) {
        if (!avatarShopBuyPopup) {
            return;
        }
        if (!renderAvatarShopBuyPopup(listContainer)) {
            hideAvatarShopBuyPopup();
            return;
        }

        const parent = avatarShopBuyPopup.offsetParent || document.getElementById('avatar-shop-screen');
        const parentWidth = Number(parent?.clientWidth || 800);
        const parentHeight = Number(parent?.clientHeight || 600);
        const popupWidth = Number(avatarShopBuyPopup.offsetWidth || 275);
        const popupHeight = Number(avatarShopBuyPopup.offsetHeight || 263);
        const styleSource = parent || avatarShopBuyPopup;
        const computedStyle = window.getComputedStyle(styleSource);
        const offsetX = Number.parseFloat(computedStyle.getPropertyValue('--avatar-shop-buy-popup-center-offset-x')) || 0;
        const offsetY = Number.parseFloat(computedStyle.getPropertyValue('--avatar-shop-buy-popup-center-offset-y')) || 0;
        const centeredLeft = Math.max(0, Math.floor((parentWidth - popupWidth) / 2) + Math.round(offsetX));
        const centeredTop = Math.max(0, Math.floor((parentHeight - popupHeight) / 2) + Math.round(offsetY));
        avatarShopBuyPopup.style.left = `${centeredLeft}px`;
        avatarShopBuyPopup.style.top = `${centeredTop}px`;

        avatarShopBuyPopup.classList.remove('hidden');
    }

    async function handleAvatarShopBuyClick(currency) {
        if (buyActionInProgress || !userData?.id) {
            return;
        }

        const listContainer = document.getElementById('avatar-shop-list');
        const selectedItem = getSelectedShopItem(listContainer);
        const avatarId = Number(selectedItem?.id);
        if (!selectedItem || !Number.isFinite(avatarId) || avatarId <= 0) {
            return;
        }

        const purchaseState = resolveCatalogPurchaseState(selectedItem, userData);
        const canBuy = currency === 'cash'
            ? purchaseState.canBuyWithCash
            : purchaseState.canBuyWithGold;

        if (!canBuy) {
            return;
        }

        buyActionInProgress = true;
        if (btnStoreWindowBuyCash) btnStoreWindowBuyCash.disabled = true;
        if (btnStoreWindowBuyGold) btnStoreWindowBuyGold.disabled = true;
        if (btnStoreWindowCancel) btnStoreWindowCancel.disabled = true;

        try {
            const payload = await purchaseAvatarShopItem(userData.id, avatarId, currency);
            hideAvatarShopBuyPopup();
            applyAvatarShopServerPayload(payload, { preserveSelection: false });

            const purchasedChestId = Number(payload?.purchasedChestId);
            if (Number.isFinite(purchasedChestId) && purchasedChestId > 0) {
                const existsInRegular = ownedInventoryRegularItems.some((item) => Number(item?.chest_id) === purchasedChestId);
                const existsInEx = ownedInventoryExItems.some((item) => Number(item?.chest_id) === purchasedChestId);
                selectedOwnedRegularChestId = existsInRegular ? purchasedChestId : null;
                selectedOwnedExChestId = existsInEx ? purchasedChestId : null;
                renderOwnedRegularList();
                renderOwnedExList();
                updateSellButtonState();
            }
        } catch (error) {
            showAvatarShopError('Purchase Error', error?.message || 'Purchase failed.');
        } finally {
            buyActionInProgress = false;
            if (btnStoreWindowCancel) btnStoreWindowCancel.disabled = false;
            if (avatarShopBuyPopup && !avatarShopBuyPopup.classList.contains('hidden')) {
                renderAvatarShopBuyPopup(listContainer);
            }
        }
    }

    if (btnStoreWindowCancel) {
        btnStoreWindowCancel.addEventListener('click', () => {
            hideAvatarShopBuyPopup();
        });
    }

    if (btnStoreWindowBuyCash) {
        btnStoreWindowBuyCash.addEventListener('click', () => {
            handleAvatarShopBuyClick('cash');
        });
    }

    if (btnStoreWindowBuyGold) {
        btnStoreWindowBuyGold.addEventListener('click', () => {
            handleAvatarShopBuyClick('gold');
        });
    }

    if (btnStoreExit) {
        btnStoreExit.addEventListener('click', () => {
            window.playTransition('closing', () => {
                window.location.href = '/views/lobby.html';
            });
        });
    }

    if (btnStoreBuddy) {
        btnStoreBuddy.addEventListener('click', () => {
            toggleBuddyPanel();
        });
    }

    const btnBuddyExit = document.getElementById('btn-buddy-exit');
    if (btnBuddyExit) {
        btnBuddyExit.addEventListener('click', () => {
            buddyPanel?.classList.add('hidden');
        });
    }

    const btnBuddyPlus = document.getElementById('btn-buddy-plus');
    if (btnBuddyPlus) {
        btnBuddyPlus.addEventListener('click', () => {
            if (!addBuddyPopup) return;
            addBuddyPopup.classList.remove('hidden');
            addBuddyPopup.style.top = '226px';
            addBuddyPopup.style.left = '273px';

            if (addBuddyInput) {
                addBuddyInput.value = '';
                addBuddyInput.focus();
                addBuddyCursorController?.update();
            }
        });
    }

    const btnAddBuddyClose = document.getElementById('btn-add-buddy-close');
    if (btnAddBuddyClose) {
        btnAddBuddyClose.addEventListener('click', () => {
            addBuddyPopup?.classList.add('hidden');
        });
    }

    let currentAlertCallbacks = { onYes: null, onNo: null };
    window.showBuddyAlert = function showBuddyAlert(message, options = {}) {
        const { showNoButton = false, onYes = null, onNo = null } = options;
        if (!buddyAlertPopup || !buddyAlertTextBox || !addBuddyPopup || !btnBuddyAlertYes || !btnBuddyAlertNo) return;

        buddyAlertTextBox.textContent = message;
        buddyAlertPopup.classList.remove('hidden');
        currentAlertCallbacks = { onYes, onNo };

        const parentRect = {
            top: parseInt(addBuddyPopup.style.top, 10) || 226,
            left: parseInt(addBuddyPopup.style.left, 10) || 273
        };
        const offsetTop = (147 - 138) / 2;
        const offsetLeft = (253 - 200) / 2;

        buddyAlertPopup.style.top = `${parentRect.top + offsetTop}px`;
        buddyAlertPopup.style.left = `${parentRect.left + offsetLeft}px`;

        if (showNoButton) {
            btnBuddyAlertNo.classList.remove('hidden');
            btnBuddyAlertYes.style.left = '64px';
            btnBuddyAlertNo.style.left = '128px';
        } else {
            btnBuddyAlertNo.classList.add('hidden');
            btnBuddyAlertYes.style.left = '128px';
        }
    };

    if (btnBuddyAlertYes) {
        btnBuddyAlertYes.addEventListener('click', () => {
            buddyAlertPopup?.classList.add('hidden');
            if (currentAlertCallbacks.onYes) currentAlertCallbacks.onYes();
        });
    }

    if (btnBuddyAlertNo) {
        btnBuddyAlertNo.addEventListener('click', () => {
            buddyAlertPopup?.classList.add('hidden');
            if (currentAlertCallbacks.onNo) currentAlertCallbacks.onNo();
        });
    }

    const btnAddBuddyOk = document.getElementById('btn-add-buddy-ok');
    if (btnAddBuddyOk) {
        btnAddBuddyOk.addEventListener('click', () => {
            const nickname = addBuddyInput?.value.trim() || '';
            const currentNickname = userData?.nickname || '';

            if (nickname.toLowerCase() === currentNickname.toLowerCase()) {
                window.showBuddyAlert("You can't add your nickname to buddy.");
                return;
            }

            if (nickname !== '') {
                socket.emit('send_buddy_request', nickname);
                window.showBuddyAlert(`You trying to add ${nickname} to the buddy list, wait for an answer.`);
                addBuddyPopup?.classList.add('hidden');
            }
        });
    }

    socket.on('incoming_buddy_request', (data) => {
        window.showBuddyAlert(`'${data.fromNickname}' Is trying to enter on your buddy list, Do you accept?`, {
            showNoButton: true,
            onYes: () => socket.emit('respond_buddy_request', { fromNickname: data.fromNickname, fromId: data.fromId, accepted: true }),
            onNo: () => socket.emit('respond_buddy_request', { fromNickname: data.fromNickname, fromId: data.fromId, accepted: false })
        });
    });

    socket.on('buddy_request_accepted', (data) => {
        window.showBuddyAlert(`'${data.nickname}' has accepted your buddy request.`);
    });

    socket.on('buddy_request_rejected', (data) => {
        window.showBuddyAlert(`'${data.nickname}' has rejected your buddy request.`);
    });

    socket.on('buddy_list_data', (data) => {
        if (onlineCountEl) onlineCountEl.textContent = data.onlineCount;
        if (totalCountEl) totalCountEl.textContent = data.totalCount;

        buddyUi?.renderList(buddyListContent, data.buddies, { includeIdDataset: true });
        window.setTimeout(() => buddyScroll?.update(), 50);
    });

    const btnBuddyDel = document.getElementById('btn-buddy-del');
    if (btnBuddyDel) {
        btnBuddyDel.addEventListener('click', () => {
            const selected = buddyListContent?.querySelector('.buddy-item.selected');
            if (!selected) {
                window.showBuddyAlert('Please select a buddy to delete.');
                return;
            }

            const nickname = selected.dataset.nickname;
            const targetId = selected.dataset.id;
            if (nickname && targetId) {
                window.showBuddyAlert(`Are you sure you want to delete '${nickname}'?`, {
                    showNoButton: true,
                    onYes: () => socket.emit('delete_buddy', targetId)
                });
            }
        });
    }

    function normalizeBuddyThreadKey(nickname) {
        return String(nickname || '').trim().toLowerCase();
    }

    function loadBuddyChatHistoryStore() {
        try {
            const raw = sessionStorage.getItem(BUDDY_CHAT_HISTORY_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    function saveBuddyChatHistoryStore(store) {
        try {
            sessionStorage.setItem(BUDDY_CHAT_HISTORY_KEY, JSON.stringify(store || {}));
        } catch (error) {
            // Ignore storage failures and keep in-session behavior.
        }
    }

    function persistBuddyChatMessage(threadNickname, sender, message) {
        const threadKey = normalizeBuddyThreadKey(threadNickname);
        const senderText = String(sender || '').trim();
        const messageText = String(message || '').trim();
        if (!threadKey || !senderText || !messageText) return;

        const store = loadBuddyChatHistoryStore();
        const existing = store[threadKey];
        const payload = existing && typeof existing === 'object'
            ? existing
            : { nickname: String(threadNickname || '').trim(), messages: [] };

        if (!Array.isArray(payload.messages)) {
            payload.messages = [];
        }
        payload.nickname = String(threadNickname || payload.nickname || '').trim();
        payload.messages.push({
            sender: senderText,
            message: messageText
        });
        if (payload.messages.length > BUDDY_CHAT_HISTORY_LIMIT) {
            payload.messages = payload.messages.slice(-BUDDY_CHAT_HISTORY_LIMIT);
        }

        store[threadKey] = payload;
        saveBuddyChatHistoryStore(store);
    }

    function getBuddyChatHistory(threadNickname) {
        const threadKey = normalizeBuddyThreadKey(threadNickname);
        if (!threadKey) return [];
        const store = loadBuddyChatHistoryStore();
        const payload = store[threadKey];
        if (!payload || !Array.isArray(payload.messages)) {
            return [];
        }
        return payload.messages;
    }

    function appendBuddyChatMessageToDom(sender, message) {
        if (!buddyChatMessages) return;
        const senderText = String(sender || '').trim();
        const messageText = String(message || '').trim();
        if (!senderText || !messageText) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'buddy-chat-msg';
        msgDiv.innerHTML = `<span class="sender">${senderText}]</span> ${messageText}`;
        buddyChatMessages.appendChild(msgDiv);

        if (buddyChatContent) {
            buddyChatContent.scrollTop = buddyChatContent.scrollHeight;
        }
        window.setTimeout(() => buddyChatScroll?.update(), 50);
    }

    function appendBuddyChatMessage(threadNickname, sender, message, persist = true) {
        const senderText = String(sender || '').trim();
        const messageText = String(message || '').trim();
        if (!senderText || !messageText) return;

        if (persist) {
            persistBuddyChatMessage(threadNickname, senderText, messageText);
        }

        const activeThread = String(buddyChatNickname?.textContent || '').trim();
        if (normalizeBuddyThreadKey(activeThread) !== normalizeBuddyThreadKey(threadNickname)) {
            return;
        }

        appendBuddyChatMessageToDom(senderText, messageText);
    }

    function renderBuddyChatHistory(threadNickname) {
        if (!buddyChatMessages) return;
        buddyChatMessages.innerHTML = '';
        const history = getBuddyChatHistory(threadNickname);
        history.forEach((entry) => {
            appendBuddyChatMessageToDom(entry?.sender, entry?.message);
        });
    }

    window.openBuddyChat = function openBuddyChat(nickname) {
        if (!buddyChatWindow || !nickname) return;
        if (userData && userData.nickname && userData.nickname.toLowerCase() === String(nickname).toLowerCase()) return;

        buddyChatNickname.textContent = nickname;
        renderBuddyChatHistory(nickname);
        buddyChatWindow.classList.remove('hidden');
        buddyChatWindow.style.bottom = '';
        buddyChatWindow.style.right = '';
        buddyChatWindow.style.top = '279px';
        buddyChatWindow.style.left = '541px';

        if (buddyChatInput) {
            buddyChatInput.focus();
            buddyChatCursorController?.update();
        }
    };

    const btnBuddyChatClose = document.getElementById('btn-buddy-chat-close');
    if (btnBuddyChatClose) {
        btnBuddyChatClose.addEventListener('click', () => {
            buddyChatWindow?.classList.add('hidden');
        });
    }

    if (buddyChatInput) {
        buddyChatInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;

            const message = buddyChatInput.value.trim();
            const toNickname = buddyChatNickname?.textContent || '';
            if (!message || !toNickname || !userData) return;

            socket.emit('private_message', { toNickname, message });
            appendBuddyChatMessage(toNickname, userData.nickname, message);
            buddyChatInput.value = '';
            buddyChatCursorController?.update();
        });
    }

    socket.on('private_message', (data) => {
        const { fromNickname, message } = data || {};
        if (!fromNickname || !message) return;
        window.openBuddyChat(fromNickname);
        appendBuddyChatMessage(fromNickname, fromNickname, message);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && avatarShopBuyPopup && !avatarShopBuyPopup.classList.contains('hidden')) {
            event.preventDefault();
            hideAvatarShopBuyPopup();
            return;
        }

        if (event.key === 'F10') {
            event.preventDefault();
            toggleBuddyPanel();
            return;
        }

        const activeTag = document.activeElement?.tagName;
        const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
        if (isTyping) return;
        if (event.key.length !== 1 && event.key !== 'Backspace' && event.key !== 'Delete') return;

        const isAddBuddyVisible = addBuddyPopup && !addBuddyPopup.classList.contains('hidden');
        const isBuddyChatVisible = buddyChatWindow && !buddyChatWindow.classList.contains('hidden');

        if (isBuddyChatVisible && buddyChatInput) {
            buddyChatInput.focus();
        } else if (isAddBuddyVisible && addBuddyInput) {
            addBuddyInput.focus();
        }
    });

    let shopCatalog = createEmptyShopCatalog();
    try {
        const catalogItems = await loadAvatarShopCatalogItems();
        shopCatalog = buildShopCatalogByCategory(catalogItems);
    } catch (error) {
        console.warn('[AvatarShop] Failed to load catalog from DB, keeping default button visibility:', error);
    }
    myAvatarStatIndex = buildCatalogStatItemIndex(shopCatalog);

    const categoryButtons = Array.from(document.querySelectorAll('.avatar-shop-toggle'));
    const avatarShopList = document.getElementById('avatar-shop-list');
    const applyCurrentSelectionTry = () => {
        if (!avatarShopList) {
            return;
        }
        applySelectedShopItemToPreview(avatarShopList, ({ slot, itemId }) => {
            currentPreviewEquip[slot] = itemId;
            refreshMyAvatarStatsSummary();
        });
    };

    if (avatarShopList) {
        avatarShopList.addEventListener('avatar-shop-selection-change', () => {
            syncTryButtonState(avatarShopList, btnStorePuton);
            syncBuyButtonState(avatarShopList, btnStoreBuy, userData);
            hideAvatarShopBuyPopup();
        });
        avatarShopList.addEventListener('avatar-shop-item-activate', () => {
            applyCurrentSelectionTry();
        });
    }

    if (btnStorePuton) {
        btnStorePuton.addEventListener('click', () => {
            applyCurrentSelectionTry();
        });
    }

    if (btnStoreBuy) {
        btnStoreBuy.addEventListener('click', () => {
            if (btnStoreBuy.disabled) {
                return;
            }
            openAvatarShopBuyPopup(avatarShopList);
        });
    }

    const firstVisibleCategoryButton = applyCategoryButtonVisibility(categoryButtons, shopCatalog);

    categoryButtons.forEach((button) => {
        button.addEventListener('click', async () => {
            if (button.disabled || button.style.display === 'none') {
                return;
            }
            if (btnStorePuton) {
                btnStorePuton.disabled = true;
            }
            if (btnStoreBuy) {
                btnStoreBuy.disabled = true;
            }
            hideAvatarShopBuyPopup();
            categoryButtons.forEach((btn) => btn.classList.remove('active'));
            button.classList.add('active');

            if (avatarShopList) {
                await updateShopGridForCategoryButton(
                    avatarShopList,
                    button.id,
                    shopCatalog,
                    userData,
                    0,
                    btnStoreMainUp,
                    btnStoreMainDown
                );
            }
        });
    });

    if (btnStoreMainUp && avatarShopList) {
        btnStoreMainUp.addEventListener('click', async () => {
            if (btnStoreMainUp.disabled) {
                return;
            }
            if (btnStorePuton) {
                btnStorePuton.disabled = true;
            }
            if (btnStoreBuy) {
                btnStoreBuy.disabled = true;
            }
            hideAvatarShopBuyPopup();
            const activeCategoryId = avatarShopList.dataset.activeCategoryId;
            if (!activeCategoryId) {
                return;
            }
            const currentPage = Math.max(0, Number(avatarShopList.dataset.pageIndex || 0));
            const totalPages = Math.max(0, Number(avatarShopList.dataset.totalPages || 0));
            const targetPage = totalPages > 0
                ? (currentPage > 0 ? currentPage - 1 : totalPages - 1)
                : 0;
            await updateShopGridForCategoryButton(
                avatarShopList,
                activeCategoryId,
                shopCatalog,
                userData,
                targetPage,
                btnStoreMainUp,
                btnStoreMainDown
            );
        });
    }

    if (btnStoreMainDown && avatarShopList) {
        btnStoreMainDown.addEventListener('click', async () => {
            if (btnStoreMainDown.disabled) {
                return;
            }
            if (btnStorePuton) {
                btnStorePuton.disabled = true;
            }
            if (btnStoreBuy) {
                btnStoreBuy.disabled = true;
            }
            hideAvatarShopBuyPopup();
            const activeCategoryId = avatarShopList.dataset.activeCategoryId;
            if (!activeCategoryId) {
                return;
            }
            const currentPage = Math.max(0, Number(avatarShopList.dataset.pageIndex || 0));
            const totalPages = Math.max(0, Number(avatarShopList.dataset.totalPages || 0));
            const targetPage = totalPages > 0
                ? ((currentPage + 1) % totalPages)
                : 0;
            await updateShopGridForCategoryButton(
                avatarShopList,
                activeCategoryId,
                shopCatalog,
                userData,
                targetPage,
                btnStoreMainUp,
                btnStoreMainDown
            );
        });
    }

    if (avatarShopList) {
        let activeCategoryButton = categoryButtons.find((button) =>
            button.id === 'btn-store-cap' && !button.disabled && button.style.display !== 'none'
        );
        if (!activeCategoryButton) {
            activeCategoryButton = categoryButtons.find((button) =>
                button.classList.contains('active') && !button.disabled && button.style.display !== 'none'
            );
        }
        if (!activeCategoryButton) {
            activeCategoryButton = firstVisibleCategoryButton || null;
        }

        categoryButtons.forEach((button) => {
            button.classList.toggle('active', button === activeCategoryButton);
        });

        if (activeCategoryButton) {
            await updateShopGridForCategoryButton(
                avatarShopList,
                activeCategoryButton.id,
                shopCatalog,
                userData,
                0,
                btnStoreMainUp,
                btnStoreMainDown
            );
        } else {
            syncAvatarShopListMode(avatarShopList, null, 0);
            if (btnStoreMainUp) btnStoreMainUp.disabled = true;
            if (btnStoreMainDown) btnStoreMainDown.disabled = true;
            if (btnStorePuton) btnStorePuton.disabled = true;
            if (btnStoreBuy) btnStoreBuy.disabled = true;
            hideAvatarShopBuyPopup();
        }
    }

    const legacyCard = document.getElementById('avatar-shop-avatar-card');
    if (legacyCard) {
        legacyCard.remove();
    }

    const legacyPreviewBox = document.getElementById('avatar-shop-avatar-preview-box');
    if (legacyPreviewBox) {
        legacyPreviewBox.remove();
    }

    const avatarFrame = document.getElementById('avatar-shop-myavatar-frame');
    if (avatarFrame) {
        myAvatarCountEl = ensureMyAvatarCountOverlay(avatarFrame);
        renderMyAvatarCountValue(myAvatarCountEl, 0);
        myAvatarStatsOverlay = ensureMyAvatarStatsOverlay(avatarFrame);
        try {
            window.avatarShopPreview = await createAvatarPreviewAnimator(avatarFrame, userData);
        } catch (error) {
            console.error('[AvatarShop] Failed to initialize avatar preview:', error);
        }
        refreshMyAvatarStatsSummary();
    }

    await refreshAvatarShopInventory({ preserveSelection: false });

    window.setInterval(() => {
        if (ownedInventoryActionInProgress || ownedDragState || document.hidden) {
            return;
        }
        if (!Array.isArray(ownedInventoryExItems) || ownedInventoryExItems.length <= 0) {
            return;
        }
        renderOwnedExList();
    }, 60 * 1000);

    window.setTimeout(() => {
        buddyScroll?.update();
        buddyChatScroll?.update();
    }, 100);
});

async function createAvatarPreviewAnimator(hostElement, userData) {
    if (!window.AvatarPreviewRuntime || typeof window.AvatarPreviewRuntime.createAnimator !== 'function') {
        throw new Error('Avatar preview runtime is unavailable');
    }
    return window.AvatarPreviewRuntime.createAnimator(hostElement, userData, {
        rootId: 'avatar-shop-character-preview',
        effectVariant: 'shop'
    });
}

async function loadAvatarShopCatalogItems() {
    const response = await fetch('/api/avatar-shop/catalog', { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Unable to load avatar shop catalog (${response.status})`);
    }
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.items)) {
        return [];
    }
    return payload.items;
}

async function loadAvatarShopInventory(userId) {
    const response = await fetch(`/api/avatar-shop/inventory?userId=${encodeURIComponent(String(userId || ''))}`, {
        cache: 'no-store'
    });
    if (!response.ok) {
        throw new Error(`Unable to load avatar inventory (${response.status})`);
    }
    const payload = await response.json();
    if (!payload || typeof payload !== 'object') {
        throw new Error('Avatar inventory payload is invalid');
    }
    return payload;
}

async function purchaseAvatarShopItem(userId, avatarId, currency) {
    const response = await fetch('/api/avatar-shop/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: String(userId || ''),
            avatarId: Number(avatarId),
            currency: String(currency || '').toLowerCase()
        })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(String(payload?.error || `Purchase failed (${response.status})`));
    }
    return payload;
}

async function equipAvatarShopChestItem(userId, chestId) {
    const response = await fetch('/api/avatar-shop/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: String(userId || ''),
            chestId: Number(chestId)
        })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(String(payload?.error || `Equip failed (${response.status})`));
    }
    return payload;
}

async function unequipAvatarShopChestItem(userId, chestId) {
    const response = await fetch('/api/avatar-shop/unequip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: String(userId || ''),
            chestId: Number(chestId)
        })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(String(payload?.error || `Unequip failed (${response.status})`));
    }
    return payload;
}

async function reorderAvatarShopOwnedItems(userId, listType, orderedChestIds) {
    const response = await fetch('/api/avatar-shop/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: String(userId || ''),
            listType: String(listType || '').toLowerCase(),
            orderedChestIds: Array.isArray(orderedChestIds) ? orderedChestIds.map((value) => Number(value)) : []
        })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(String(payload?.error || `Reorder failed (${response.status})`));
    }
    return payload;
}

async function sellAvatarShopChestItem(userId, chestId) {
    const response = await fetch('/api/avatar-shop/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: String(userId || ''),
            chestId: Number(chestId)
        })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(String(payload?.error || `Sell failed (${response.status})`));
    }
    return payload;
}

function resolveShopCategoryForItem(item) {
    const slot = String(item?.slot || '').toLowerCase();
    const name = String(item?.name || '').toLowerCase();
    const setKey = String(item?.set_key || '').trim();

    if (setKey !== '' || /\bset\b/.test(name)) {
        return 'setitem';
    }
    if (slot === 'exitem' || slot === 'background' || slot === 'foreground') {
        return 'exitem';
    }
    if (slot === 'body') {
        return 'cloth';
    }
    if (slot === 'head') {
        return 'cap';
    }
    if (slot === 'eyes') {
        return 'glasse';
    }
    if (slot === 'flag') {
        return 'flag';
    }
    return null;
}

function buildShopCatalogByCategory(items) {
    const categories = createEmptyShopCatalog();
    const seenSetKeys = new Set();

    items.forEach((item) => {
        if (shouldHideCatalogItem(item)) {
            return;
        }
        const category = resolveShopCategoryForItem(item);
        if (!category) {
            return;
        }
        if (category === 'setitem') {
            const setKey = String(item?.set_key || '').trim();
            const dedupeKey = setKey !== ''
                ? setKey
                : `${String(item?.name || '').trim().toLowerCase()}|${String(item?.gender || '').trim().toLowerCase()}`;
            if (seenSetKeys.has(dedupeKey)) {
                return;
            }
            seenSetKeys.add(dedupeKey);
        }
        categories[category].push(item);
    });

    return categories;
}

function getCategoryKeyFromButtonId(buttonId) {
    return SHOP_BUTTON_CATEGORY[buttonId] || null;
}

function getPageSizeForCategory(categoryKey) {
    return categoryKey === 'setitem' ? SET_SHOP_ITEM_COUNT : DEFAULT_SHOP_ITEM_COUNT;
}

function getTotalPages(totalItems, pageSize) {
    if (!Number.isFinite(totalItems) || totalItems <= 0 || !Number.isFinite(pageSize) || pageSize <= 0) {
        return 0;
    }
    return Math.ceil(totalItems / pageSize);
}

function getCatalogGenderPriorityForUser(item, userData, categoryKey) {
    const itemGender = normalizeCatalogGenderValue(item?.gender);
    const userGender = getUserGenderCode(userData);
    const prioritizeGender = categoryKey === 'cap'
        || categoryKey === 'cloth'
        || categoryKey === 'glasse'
        || categoryKey === 'flag'
        || categoryKey === 'setitem';

    if (!prioritizeGender) {
        return 0;
    }
    if (itemGender === userGender) {
        return 0;
    }
    if (itemGender === 'u') {
        return 1;
    }
    return 2;
}

function sortCatalogItemsForDisplay(items, userData, categoryKey) {
    return [...(items || [])].sort((a, b) => {
        const isNewA = Number(a?.note) === 1 ? 0 : 1;
        const isNewB = Number(b?.note) === 1 ? 0 : 1;
        if (isNewA !== isNewB) {
            return isNewA - isNewB;
        }

        const pa = getCatalogGenderPriorityForUser(a, userData, categoryKey);
        const pb = getCatalogGenderPriorityForUser(b, userData, categoryKey);
        if (pa !== pb) {
            return pa - pb;
        }

        const codeA = String(a?.avatar_code || '');
        const codeB = String(b?.avatar_code || '');
        const codeCompare = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
        if (codeCompare !== 0) {
            return codeCompare;
        }

        return Number(a?.id || 0) - Number(b?.id || 0);
    });
}

function clampPageIndex(pageIndex, totalPages) {
    const parsed = Number(pageIndex);
    const base = Number.isFinite(parsed) ? Math.floor(parsed) : 0;
    if (totalPages <= 0) {
        return 0;
    }
    return Math.max(0, Math.min(totalPages - 1, base));
}

function updateMainPagerButtons(upButton, downButton, pageIndex, totalPages) {
    if (upButton) {
        upButton.disabled = totalPages <= 1;
    }
    if (downButton) {
        downButton.disabled = totalPages <= 1;
    }
}

function setSelectedShopCard(container, itemButton) {
    if (!container) {
        return;
    }
    const selected = container.querySelector('.avatar-shop-item.selected');
    if (selected) {
        selected.classList.remove('selected');
    }
    if (itemButton && container.contains(itemButton)) {
        itemButton.classList.add('selected');
    }
}

function getSelectedShopItem(container) {
    if (!container) {
        return null;
    }
    const selected = container.querySelector('.avatar-shop-item.selected');
    if (!selected) {
        return null;
    }
    return selected.__shopItemData || null;
}

function syncTryButtonState(container, tryButton) {
    if (!tryButton) {
        return;
    }
    const selected = container?.querySelector?.('.avatar-shop-item.selected');
    const canTry = Boolean(selected && selected.__shopItemData && selected.__canTry === true);
    tryButton.disabled = !canTry;
}

function syncBuyButtonState(container, buyButton, userData) {
    if (!buyButton) {
        return;
    }
    const selectedItem = getSelectedShopItem(container);
    if (!selectedItem) {
        buyButton.disabled = true;
        return;
    }
    const purchaseState = resolveCatalogPurchaseState(selectedItem, userData);
    buyButton.disabled = !purchaseState.canBuy;
}

function copyAvatarShopThumbVisual(sourceThumb, targetThumb) {
    if (!targetThumb) {
        return;
    }

    targetThumb.style.display = 'none';
    targetThumb.style.backgroundImage = '';
    targetThumb.style.backgroundPosition = '';
    targetThumb.style.backgroundSize = '';
    targetThumb.style.width = '';
    targetThumb.style.height = '';

    if (!sourceThumb || sourceThumb.style.display === 'none' || !sourceThumb.style.backgroundImage) {
        return;
    }

    targetThumb.style.display = 'block';
    targetThumb.style.backgroundImage = sourceThumb.style.backgroundImage;
    targetThumb.style.backgroundPosition = sourceThumb.style.backgroundPosition || 'center center';
    targetThumb.style.backgroundSize = sourceThumb.style.backgroundSize || 'auto';
    targetThumb.style.width = sourceThumb.style.width || '100%';
    targetThumb.style.height = sourceThumb.style.height || '100%';
}

function resolvePreviewItemId(item) {
    const sourceRefId = Number(item?.source_ref_id);
    if (Number.isFinite(sourceRefId) && sourceRefId >= 0) {
        return sourceRefId;
    }

    const avatarCode = String(item?.avatar_code || '').toLowerCase();
    const codeMatch = avatarCode.match(/(\d{5})$/);
    if (!codeMatch) {
        return null;
    }

    const parsed = Number(codeMatch[1]);
    return Number.isFinite(parsed) ? parsed : null;
}

function applySelectedShopItemToPreview(container, onApplied = null) {
    if (!container || !window.avatarShopPreview) {
        return false;
    }

    const selected = container.querySelector('.avatar-shop-item.selected');
    if (!selected || selected.__canTry !== true) {
        return false;
    }

    const selectedItem = getSelectedShopItem(container);
    if (!selectedItem) {
        return false;
    }

    const categoryKey = String(container.dataset.activeCategoryKey || '');
    const slot = getSlotByCategory(categoryKey, selectedItem);
    const itemId = resolvePreviewItemId(selectedItem);

    if (!slot || itemId === null) {
        return false;
    }

    window.avatarShopPreview.setEquip(slot, itemId);
    if (typeof onApplied === 'function') {
        onApplied({ slot, itemId, item: selectedItem });
    }
    return true;
}

function applyCategoryButtonVisibility(buttons, catalogByCategory) {
    let firstVisibleButton = null;
    buttons.forEach((button) => {
        button.style.display = '';
        button.disabled = false;
        if (!firstVisibleButton) {
            firstVisibleButton = button;
        }
    });
    return firstVisibleButton;
}

async function updateShopGridForCategoryButton(
    container,
    buttonId,
    catalogByCategory,
    userData,
    pageIndex = 0,
    upButton = null,
    downButton = null
) {
    const categoryKey = getCategoryKeyFromButtonId(buttonId);
    const rawCategoryItems = categoryKey && Array.isArray(catalogByCategory[categoryKey])
        ? catalogByCategory[categoryKey]
        : [];
    const genderVisibleItems = filterCatalogItemsByUserGender(rawCategoryItems, userData);
    const renderableItems = await filterRenderableCatalogItems(genderVisibleItems, categoryKey);
    const categoryItems = sortCatalogItemsForDisplay(renderableItems, userData, categoryKey);

    const pageSize = getPageSizeForCategory(categoryKey);
    const totalPages = getTotalPages(categoryItems.length, pageSize);
    let currentPage = clampPageIndex(pageIndex, totalPages);
    let startIndex = currentPage * pageSize;
    let visibleItems = categoryItems.slice(startIndex, startIndex + pageSize);

    // Never render a blank page while the category still has items.
    if (categoryItems.length > 0 && visibleItems.length === 0) {
        currentPage = 0;
        startIndex = 0;
        visibleItems = categoryItems.slice(0, pageSize);
    }

    const cardCountOverride = visibleItems.length;
    syncAvatarShopListMode(container, buttonId, cardCountOverride);

    const cardButtons = Array.from(container.querySelectorAll('.avatar-shop-item'));
    await Promise.all(cardButtons.map((cardButton, index) =>
        applyGridItemVisual(cardButton, visibleItems[index], categoryKey, userData)
    ));
    cardButtons.forEach((cardButton, index) => {
        const item = visibleItems[index] || null;
        const canTry = Boolean(item && canUserTryCatalogItem(item, userData));
        cardButton.__shopItemData = item;
        cardButton.__canTry = canTry;
        cardButton.dataset.hasItem = item ? '1' : '0';
        cardButton.dataset.canTry = canTry ? '1' : '0';
        cardButton.classList.toggle('not-tryable', Boolean(item) && !canTry);
    });
    setSelectedShopCard(container, null);

    container.dataset.activeCategoryId = String(buttonId || '');
    container.dataset.activeCategoryKey = String(categoryKey || '');
    container.dataset.pageIndex = String(currentPage);
    container.dataset.totalPages = String(totalPages);
    container.dataset.pageSize = String(pageSize);
    container.dataset.totalItems = String(categoryItems.length);

    updateMainPagerButtons(upButton, downButton, currentPage, totalPages);
    container.dispatchEvent(new CustomEvent('avatar-shop-grid-updated', {
        detail: {
            categoryId: String(buttonId || ''),
            categoryKey: String(categoryKey || ''),
            totalItems: Number(categoryItems.length),
            pageIndex: Number(currentPage),
            totalPages: Number(totalPages)
        }
    }));
    container.dispatchEvent(new CustomEvent('avatar-shop-selection-change'));
}

function initializeAvatarShopList(container) {
    const requestedCount = Number(container.dataset.itemCount);
    const itemCount = Number.isFinite(requestedCount) && requestedCount >= 0
        ? requestedCount
        : DEFAULT_SHOP_ITEM_COUNT;

    container.innerHTML = '';

    for (let index = 0; index < itemCount; index += 1) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'avatar-shop-item';
        item.dataset.index = String(index);
        item.innerHTML = `
            <div class="avatar-shop-item-content">
                <div class="avatar-shop-item-header">
                    <img class="avatar-shop-item-slot-icon" alt="">
                    <div class="avatar-shop-item-name"></div>
                    <img class="avatar-shop-item-gender-badge" alt="">
                </div>
                <img class="avatar-shop-item-new-badge" alt="">
                <div class="avatar-shop-item-preview">
                    <div class="avatar-shop-item-thumb"></div>
                </div>
                <div class="avatar-shop-item-hover-desc"></div>
                <div class="avatar-shop-item-stats">
                    <div class="avatar-shop-item-stat-row">
                        <img class="avatar-shop-item-stat-icon" alt="">
                        <span class="avatar-shop-item-stat-value"></span>
                    </div>
                    <div class="avatar-shop-item-stat-row">
                        <img class="avatar-shop-item-stat-icon" alt="">
                        <span class="avatar-shop-item-stat-value"></span>
                    </div>
                    <div class="avatar-shop-item-stat-row">
                        <img class="avatar-shop-item-stat-icon" alt="">
                        <span class="avatar-shop-item-stat-value"></span>
                    </div>
                </div>
                <div class="avatar-shop-item-price">
                    <div class="avatar-shop-item-price-line1"></div>
                    <div class="avatar-shop-item-price-line2"></div>
                </div>
            </div>
        `;
        container.appendChild(item);
    }

    if (container.dataset.selectionHandlerBound === '1') {
        return;
    }
    container.dataset.selectionHandlerBound = '1';

    container.addEventListener('click', (event) => {
        const item = event.target.closest('.avatar-shop-item');
        if (!item || !container.contains(item)) {
            return;
        }

        setSelectedShopCard(container, item);
        container.dispatchEvent(new CustomEvent('avatar-shop-selection-change'));
    });

    container.addEventListener('dblclick', (event) => {
        const item = event.target.closest('.avatar-shop-item');
        if (!item || !container.contains(item)) {
            return;
        }

        setSelectedShopCard(container, item);
        container.dispatchEvent(new CustomEvent('avatar-shop-selection-change'));
        container.dispatchEvent(new CustomEvent('avatar-shop-item-activate'));
    });
}

function syncAvatarShopListMode(container, activeCategoryId, itemCountOverride) {
    const isSetMode = activeCategoryId === 'btn-store-setitem';
    const isExitemMode = activeCategoryId === 'btn-store-exitem';
    const defaultCount = isSetMode ? SET_SHOP_ITEM_COUNT : DEFAULT_SHOP_ITEM_COUNT;
    const itemCount = Number.isFinite(itemCountOverride) ? Math.max(0, Number(itemCountOverride)) : defaultCount;

    container.classList.toggle('set-mode', isSetMode);
    container.classList.toggle('exitem-mode', isExitemMode);
    container.classList.toggle('is-empty', itemCount === 0);

    const currentCount = container.querySelectorAll('.avatar-shop-item').length;
    if (currentCount !== itemCount) {
        container.dataset.itemCount = String(itemCount);
        initializeAvatarShopList(container);
    }
}

function filterCatalogItemsByUserGender(items, userData) {
    return (items || []).filter((item) => {
        const itemGender = normalizeCatalogGenderValue(item?.gender);
        const slot = String(item?.slot || '').toLowerCase();
        // Base wearable slots must be gendered; unknown gender entries are invalid.
        if ((slot === 'head' || slot === 'body' || slot === 'eyes' || slot === 'flag') && itemGender === 'u') {
            return false;
        }
        return true;
    });
}

function getSlotByCategory(categoryKey, item) {
    if (categoryKey === 'cloth') return 'body';
    if (categoryKey === 'cap') return 'head';
    if (categoryKey === 'glasse') return 'eyes';
    if (categoryKey === 'flag') return 'flag';

    const slot = String(item?.slot || '').toLowerCase();
    if (
        slot === 'body'
        || slot === 'head'
        || slot === 'eyes'
        || slot === 'flag'
        || slot === 'background'
        || slot === 'foreground'
        || slot === 'exitem'
    ) {
        return slot;
    }
    return null;
}

function buildThumbCodeCandidates(itemData, folderCode) {
    const inputCodes = [];
    const avatarCode = String(itemData?.avatar_code || '').trim();
    if (avatarCode) {
        inputCodes.push(avatarCode.toLowerCase());
    }
    if (folderCode) {
        inputCodes.push(String(folderCode).toLowerCase());
    }

    const seen = new Set();
    const out = [];
    inputCodes.forEach((code) => {
        if (!code) {
            return;
        }
        const normalized = code.endsWith('l') ? code.slice(0, -1) : code;
        const variants = normalized.startsWith('s')
            ? [normalized, normalized.slice(1)]
            : [`s${normalized}`, normalized];
        variants.forEach((variant) => {
            if (!variant || seen.has(variant)) {
                return;
            }
            seen.add(variant);
            out.push(variant);
        });
    });
    return out;
}

function collectExitemThumbRefCandidates(itemData) {
    const candidates = [];
    const seen = new Set();
    const addRefCandidate = (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return;
        }
        const ref = Math.floor(parsed);
        if (seen.has(ref)) {
            return;
        }
        seen.add(ref);
        candidates.push(ref);
    };

    addRefCandidate(itemData?.source_ref_id);

    const sourceAvatarId = Number(itemData?.source_avatar_id);
    if (Number.isFinite(sourceAvatarId) && sourceAvatarId >= 204801 && sourceAvatarId <= 204899) {
        addRefCandidate(sourceAvatarId - 204800);
    }

    const avatarCode = String(itemData?.avatar_code || '').trim().toLowerCase();
    const ex2Match = avatarCode.match(/^ex2_(\d+)$/);
    if (ex2Match) {
        const parsed = Number(ex2Match[1]);
        addRefCandidate(parsed);
        if (parsed >= 204801 && parsed <= 204899) {
            addRefCandidate(parsed - 204800);
        }
    }

    // Historical rows may reference Power User variants without dedicated ex2_* assets.
    if (seen.has(31) || seen.has(32) || seen.has(33) || seen.has(34) || seen.has(35)) {
        addRefCandidate(1);
    }

    return candidates;
}

function buildExitemThumbPathCandidates(itemData) {
    const refs = collectExitemThumbRefCandidates(itemData);
    return refs.map((ref) => `${AVATAR_EXITEM_THUMB_BASE_URL}/ex2_${ref}.png`);
}

async function resolveExitemThumbAsset(itemData) {
    const pathCandidates = buildExitemThumbPathCandidates(itemData);
    const cacheKey = `exitem|${pathCandidates.join('|')}`;
    if (!resolvedThumbImagePromises.has(cacheKey)) {
        resolvedThumbImagePromises.set(cacheKey, (async () => {
            let lastError = null;
            for (const url of pathCandidates) {
                try {
                    await preloadImage(url);
                    return { url, code: '', atlasPrefix: '' };
                } catch (error) {
                    lastError = error;
                }
            }
            throw lastError || new Error('Failed to resolve exitem thumbnail');
        })());
    }
    return resolvedThumbImagePromises.get(cacheKey);
}

function toExEffectSourceAvatarId(itemData) {
    const sourceAvatarId = Number(itemData?.source_avatar_id);
    if (Number.isFinite(sourceAvatarId) && sourceAvatarId > 0) {
        const normalized = Math.floor(sourceAvatarId);
        return normalized >= 204800 ? normalized : (204800 + normalized);
    }

    const avatarCode = String(itemData?.avatar_code || '').trim().toLowerCase();
    const ex2Match = avatarCode.match(/^ex2_(\d+)$/);
    if (ex2Match) {
        const parsed = Number(ex2Match[1]);
        if (Number.isFinite(parsed) && parsed > 0) {
            const normalized = Math.floor(parsed);
            return normalized >= 204800 ? normalized : (204800 + normalized);
        }
    }

    const sourceRefId = Number(itemData?.source_ref_id);
    if (Number.isFinite(sourceRefId) && sourceRefId > 0) {
        return 204800 + Math.floor(sourceRefId);
    }

    return null;
}

function buildExEffectFolderCandidates(sourceAvatarId, slotLower) {
    const id = Number(sourceAvatarId);
    if (!Number.isFinite(id) || id <= 0) {
        return [];
    }
    const normalizedId = Math.floor(id);
    const isForeground = slotLower === 'foreground';
    const out = isForeground
        ? [`sf${normalizedId}`, `f${normalizedId}`, `sb${normalizedId}`, `b${normalizedId}`]
        : [`sb${normalizedId}`, `b${normalizedId}`, `sf${normalizedId}`, `f${normalizedId}`];
    return [...new Set(out)];
}

function decompressGraphics(rawFrames) {
    if (!Array.isArray(rawFrames)) {
        return [];
    }
    const out = [];
    let previousFrame = null;
    for (const entry of rawFrames) {
        if (typeof entry === 'number' && previousFrame && out.length > 0) {
            for (let i = 0; i < entry; i += 1) {
                out.push(previousFrame);
            }
            continue;
        }
        if (Array.isArray(entry)) {
            previousFrame = entry;
            out.push(entry);
        }
    }
    return out;
}

function expandAtlasFrames(atlasDef) {
    const decompressed = decompressGraphics(atlasDef?.g);
    const frames = [];
    let cursorX = Number(atlasDef?.x || 0);
    let cursorY = Number(atlasDef?.y || 0);

    for (const src of decompressed) {
        const w = Number(src[0] || 0);
        const h = Number(src[1] || 0);
        const cx = Number(src[2] || 0);
        const cy = Number(src[3] || 0);
        const ox = Number(src[4] || 0);
        const oy = Number(src[5] || 0);

        let sx;
        let sy;
        if (src.length >= 8) {
            sx = Number(src[6] || 0);
            sy = Number(src[7] || 0);
        } else if (src.length >= 7) {
            sx = Number(src[6] || 0);
            sy = cursorY;
        } else {
            sx = cursorX;
            sy = cursorY;
        }

        frames.push({ w, h, cx, cy, ox, oy, sx, sy });
        if (src.length < 7) {
            cursorX += w + 1;
        }
    }

    return frames;
}

function pickFirstThumbFrame(frames) {
    if (!Array.isArray(frames)) {
        return null;
    }
    return frames.find((frame) => Number(frame?.w) > 0 && Number(frame?.h) > 0) || null;
}

async function resolveExEffectThumbAsset(itemData, slotLower) {
    if (slotLower !== 'foreground' && slotLower !== 'background') {
        return null;
    }
    const sourceAvatarId = toExEffectSourceAvatarId(itemData);
    if (!sourceAvatarId) {
        return null;
    }

    const folderCandidates = buildExEffectFolderCandidates(sourceAvatarId, slotLower);
    if (!folderCandidates.length) {
        return null;
    }

    const cacheKey = `exeffect|${slotLower}|${folderCandidates.join('|')}`;
    if (!resolvedThumbImagePromises.has(cacheKey)) {
        resolvedThumbImagePromises.set(cacheKey, (async () => {
            const metadata = await loadExEffectMetadata();
            const atlases = metadata?.atlases;
            if (!atlases || typeof atlases !== 'object') {
                throw new Error('Invalid EX effect metadata');
            }

            let lastError = null;
            for (const folderCode of folderCandidates) {
                const atlasDef = atlases[folderCode] || atlases[`fx_${folderCode}`] || null;
                if (!atlasDef || !atlasDef.image) {
                    continue;
                }
                const imageUrl = String(atlasDef.image || '');
                if (!imageUrl) {
                    continue;
                }

                try {
                    await preloadImage(imageUrl);
                    const frames = expandAtlasFrames(atlasDef);
                    const frame = pickFirstThumbFrame(frames);
                    if (!frame) {
                        continue;
                    }
                    return { url: imageUrl, code: '', atlasPrefix: '', cropFrame: frame };
                } catch (error) {
                    lastError = error;
                }
            }

            throw lastError || new Error('Failed to resolve EX effect thumbnail');
        })());
    }

    return resolvedThumbImagePromises.get(cacheKey);
}

async function resolveStaticThumbAsset(codeCandidates) {
    const cacheKey = codeCandidates.join('|');
    if (!resolvedThumbImagePromises.has(cacheKey)) {
        resolvedThumbImagePromises.set(cacheKey, (async () => {
            let lastError = null;
            for (const code of codeCandidates) {
                for (const baseUrl of AVATAR_THUMB_BASE_URLS) {
                    const url = `${baseUrl}/${code}.png`;
                    try {
                        await preloadImage(url);
                        const atlasPrefix = baseUrl.includes('/gbth/')
                            ? 'gbth'
                            : (baseUrl.includes('/dragonbound/') ? 'db' : '');
                        return { url, code, atlasPrefix };
                    } catch (error) {
                        lastError = error;
                    }
                }
            }
            throw lastError || new Error(`Failed to resolve thumbnail for: ${codeCandidates.join(', ')}`);
        })());
    }
    return resolvedThumbImagePromises.get(cacheKey);
}

function pickBestThumbFrame(frames) {
    if (!Array.isArray(frames) || frames.length === 0) {
        return null;
    }
    const usable = frames.filter((frame) => Number(frame?.w) > 0 && Number(frame?.h) > 0);
    if (!usable.length) {
        return null;
    }
    return usable.reduce((best, frame) => {
        const area = Number(frame.w) * Number(frame.h);
        const bestArea = Number(best.w) * Number(best.h);
        return area < bestArea ? frame : best;
    }, usable[0]);
}

async function resolveThumbCropFrame(thumbAsset) {
    const code = String(thumbAsset?.code || '').trim().toLowerCase();
    if (!code) {
        return null;
    }

    try {
        const meta = await loadAtlasMetadata();
        const atlases = meta?.atlases;
        if (!atlases || typeof atlases !== 'object') {
            return null;
        }

        const prefix = String(thumbAsset?.atlasPrefix || '');
        const keyCandidates = prefix === 'gbth'
            ? [`gbth_${code}`, code]
            : (prefix === 'db'
                ? [`db_${code}`, code]
                : [`gbth_${code}`, `db_${code}`, code]);

        for (const key of keyCandidates) {
            const atlasDef = atlases[key];
            if (!atlasDef) {
                continue;
            }
            const frames = expandAtlasFrames(atlasDef);
            const frame = pickBestThumbFrame(frames);
            if (frame) {
                return frame;
            }
        }
    } catch (error) {
        // Ignore crop failures and fallback to direct image rendering.
    }

    return null;
}

async function applyGridItemVisual(itemButton, itemData, categoryKey, userData) {
    const nameEl = itemButton.querySelector('.avatar-shop-item-name');
    const slotIconEl = itemButton.querySelector('.avatar-shop-item-slot-icon');
    const genderBadgeEl = itemButton.querySelector('.avatar-shop-item-gender-badge');
    const newBadgeEl = itemButton.querySelector('.avatar-shop-item-new-badge');
    const thumbEl = itemButton.querySelector('.avatar-shop-item-thumb');
    const hoverDescEl = itemButton.querySelector('.avatar-shop-item-hover-desc');
    const statsEl = itemButton.querySelector('.avatar-shop-item-stats');
    const statRowEls = Array.from(itemButton.querySelectorAll('.avatar-shop-item-stat-row'));
    const priceLine1El = itemButton.querySelector('.avatar-shop-item-price-line1');
    const priceLine2El = itemButton.querySelector('.avatar-shop-item-price-line2');
    if (!nameEl || !thumbEl || !hoverDescEl || !slotIconEl || !genderBadgeEl || !newBadgeEl || !priceLine1El || !priceLine2El) {
        return;
    }

    if (!itemData) {
        nameEl.textContent = '';
        slotIconEl.style.display = 'none';
        slotIconEl.removeAttribute('src');
        genderBadgeEl.style.display = 'none';
        genderBadgeEl.removeAttribute('src');
        newBadgeEl.style.display = 'none';
        newBadgeEl.classList.remove('is-blinking');
        newBadgeEl.removeAttribute('src');
        priceLine1El.textContent = '';
        priceLine2El.textContent = '';
        if (statsEl) {
            statsEl.style.display = 'none';
        }
        statRowEls.forEach((rowEl) => {
            rowEl.style.display = 'none';
            const iconEl = rowEl.querySelector('.avatar-shop-item-stat-icon');
            const valueEl = rowEl.querySelector('.avatar-shop-item-stat-value');
            if (iconEl) {
                iconEl.style.display = 'none';
                iconEl.removeAttribute('src');
            }
            if (valueEl) {
                valueEl.textContent = '';
            }
        });
        priceLine1El.classList.remove('is-cash', 'is-gold');
        priceLine2El.classList.remove('is-cash', 'is-gold');
        hoverDescEl.textContent = '';
        thumbEl.style.display = 'none';
        thumbEl.style.backgroundImage = '';
        thumbEl.style.backgroundPosition = '';
        thumbEl.style.width = '';
        thumbEl.style.height = '';
        return;
    }

    nameEl.textContent = String(itemData?.name || '');
    slotIconEl.src = resolveSlotIconUrl(itemData, categoryKey, userData);
    slotIconEl.style.display = 'block';
    const genderBadgeUrl = resolveGenderBadgeIcon(itemData, categoryKey);
    if (genderBadgeUrl) {
        genderBadgeEl.src = genderBadgeUrl;
        genderBadgeEl.style.display = 'block';
    } else {
        genderBadgeEl.style.display = 'none';
        genderBadgeEl.removeAttribute('src');
    }
    if (isCatalogNewBadgeItem(itemData)) {
        newBadgeEl.src = getStoreAvatarFrameUrl(14);
        newBadgeEl.classList.add('is-blinking');
        newBadgeEl.style.display = 'block';
    } else {
        newBadgeEl.style.display = 'none';
        newBadgeEl.classList.remove('is-blinking');
        newBadgeEl.removeAttribute('src');
    }

    const priceInfo = resolveCatalogPriceLines(itemData);
    priceLine1El.textContent = priceInfo.line1;
    priceLine2El.textContent = priceInfo.line2;
    priceLine1El.classList.toggle('is-cash', priceInfo.line1Kind === 'cash');
    priceLine1El.classList.toggle('is-gold', priceInfo.line1Kind === 'gold');
    priceLine2El.classList.toggle('is-cash', priceInfo.line2Kind === 'cash');
    priceLine2El.classList.toggle('is-gold', priceInfo.line2Kind === 'gold');
    hoverDescEl.textContent = resolveCatalogHoverDescription(itemData);
    const slotLower = String(itemData?.slot || '').toLowerCase();
    const hideStats = categoryKey === 'exitem'
        || slotLower === 'exitem'
        || slotLower === 'background'
        || slotLower === 'foreground';
    const statRows = hideStats ? [] : resolveCatalogStatRows(itemData, 3);
    if (statsEl) {
        statsEl.style.display = statRows.length > 0 ? 'flex' : 'none';
    }
    statRowEls.forEach((rowEl, index) => {
        const iconEl = rowEl.querySelector('.avatar-shop-item-stat-icon');
        const valueEl = rowEl.querySelector('.avatar-shop-item-stat-value');
        const statRow = statRows[index];
        if (!statRow || !iconEl || !valueEl) {
            rowEl.style.display = 'none';
            if (iconEl) {
                iconEl.style.display = 'none';
                iconEl.removeAttribute('src');
            }
            if (valueEl) {
                valueEl.textContent = '';
            }
            return;
        }

        iconEl.src = statRow.iconUrl;
        iconEl.style.display = 'block';
        valueEl.textContent = statRow.value;
        rowEl.style.display = 'flex';
    });

    const slot = getSlotByCategory(categoryKey, itemData);
    const itemId = Number(itemData?.source_ref_id);
    const itemGender = normalizeCatalogGenderValue(itemData?.gender);
    const genderCode = itemGender === 'u'
        ? (Number(userData?.gender) === 1 ? 'f' : 'm')
        : itemGender;
    const folderCode = resolveAtlasFolderCode(genderCode, slot, itemId, false)
        || String(itemData?.avatar_code || '').trim();

    try {
        const isExitemLike = categoryKey === 'exitem'
            || slotLower === 'exitem'
            || slotLower === 'background'
            || slotLower === 'foreground';

        let thumbAsset = null;
        let cropFrame = null;

        if (isExitemLike) {
            try {
                // Match original shop appearance: EX category cards use ex2_* thumbnail assets.
                thumbAsset = await resolveExitemThumbAsset(itemData);
            } catch (error) {
                thumbAsset = null;
                cropFrame = null;
            }
        }

        if (!thumbAsset && (slotLower === 'background' || slotLower === 'foreground')) {
            try {
                // Fallback only if a thumbnail is missing.
                thumbAsset = await resolveExEffectThumbAsset(itemData, slotLower);
                cropFrame = thumbAsset?.cropFrame || null;
            } catch (error) {
                thumbAsset = null;
            }
        }

        if (!thumbAsset) {
            if (!folderCode) {
                thumbEl.style.display = 'none';
                return;
            }
            const codeCandidates = buildThumbCodeCandidates(itemData, folderCode);
            if (!codeCandidates.length) {
                thumbEl.style.display = 'none';
                return;
            }
            thumbAsset = await resolveStaticThumbAsset(codeCandidates);
            if (!isExitemLike) {
                cropFrame = await resolveThumbCropFrame(thumbAsset);
            }
        }

        const imageUrl = String(thumbAsset?.url || '');
        thumbEl.style.display = 'block';
        thumbEl.style.backgroundImage = `url('${imageUrl}')`;
        thumbEl.style.backgroundPosition = 'center center';
        thumbEl.style.backgroundSize = 'auto';
        thumbEl.style.width = '100%';
        thumbEl.style.height = '100%';

        if (cropFrame) {
            thumbEl.style.width = `${Math.max(1, Number(cropFrame.w) || 1)}px`;
            thumbEl.style.height = `${Math.max(1, Number(cropFrame.h) || 1)}px`;
            thumbEl.style.backgroundPosition = `-${Number(cropFrame.sx || 0)}px -${Number(cropFrame.sy || 0)}px`;
            thumbEl.style.backgroundSize = 'auto';
        }
    } catch (error) {
        thumbEl.style.display = 'none';
    }
}

let atlasMetadataPromise = null;
let exEffectMetadataPromise = null;
const preloadedImagePromises = new Map();
const resolvedAtlasImagePromises = new Map();
const resolvedThumbImagePromises = new Map();

async function loadAtlasMetadata() {
    if (!atlasMetadataPromise) {
        atlasMetadataPromise = (async () => {
            const response = await fetch(`${AVATAR_ATLAS_METADATA_URL}?v=${Date.now()}`, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Unable to load avatar atlas metadata (${response.status})`);
            }
            return response.json();
        })();
    }
    return atlasMetadataPromise;
}

async function loadExEffectMetadata() {
    if (!exEffectMetadataPromise) {
        exEffectMetadataPromise = (async () => {
            const response = await fetch(`${AVATAR_EX_EFFECT_METADATA_URL}?v=${Date.now()}`, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Unable to load EX effect metadata (${response.status})`);
            }
            return response.json();
        })();
    }
    return exEffectMetadataPromise;
}

function preloadImage(src) {
    if (!preloadedImagePromises.has(src)) {
        preloadedImagePromises.set(src, new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
            image.src = src;
        }));
    }
    return preloadedImagePromises.get(src);
}

function getAtlasImageCandidates(rawImageUrl, atlasKey) {
    const raw = String(rawImageUrl || '').trim();
    if (!raw) {
        return [];
    }

    const swappedToGbth = raw.replace('/assets/shared/avatar_sheets/dragonbound/', '/assets/shared/avatar_sheets/gbth/');
    const swappedToDragonbound = raw.replace('/assets/shared/avatar_sheets/gbth/', '/assets/shared/avatar_sheets/dragonbound/');
    const candidates = [];
    const addCandidate = (value) => {
        if (value && !candidates.includes(value)) {
            candidates.push(value);
        }
    };

    if (String(atlasKey || '').startsWith('gbth_')) {
        addCandidate(swappedToGbth);
        addCandidate(raw);
    } else if (String(atlasKey || '').startsWith('db_')) {
        addCandidate(swappedToDragonbound);
        addCandidate(raw);
    } else {
        addCandidate(raw);
        addCandidate(swappedToGbth);
        addCandidate(swappedToDragonbound);
    }
    return candidates;
}

async function resolveAtlasImageUrl(rawImageUrl, atlasKey) {
    const cacheKey = `${String(atlasKey || '')}|${String(rawImageUrl || '')}`;
    if (!resolvedAtlasImagePromises.has(cacheKey)) {
        resolvedAtlasImagePromises.set(cacheKey, (async () => {
            const candidates = getAtlasImageCandidates(rawImageUrl, atlasKey);
            let lastError = null;
            for (const candidate of candidates) {
                try {
                    await preloadImage(candidate);
                    return candidate;
                } catch (error) {
                    lastError = error;
                }
            }
            throw lastError || new Error(`Failed to resolve atlas image: ${rawImageUrl}`);
        })());
    }
    return resolvedAtlasImagePromises.get(cacheKey);
}

function resolveAtlasFolderCode(gender, slot, itemId, isBackLayer) {
    if (itemId === null || itemId === undefined) {
        return null;
    }

    const id = Number(itemId);
    if (!Number.isFinite(id)) {
        return null;
    }

    const idPart = String(Math.max(0, id)).padStart(5, '0');
    const backSuffix = isBackLayer ? 'l' : '';
    const malePrefixBySlot = { head: 'mh', body: 'mb', eyes: 'mg', flag: 'mf' };
    const femalePrefixBySlot = { head: 'fh', body: 'fb', eyes: 'fg', flag: 'mf' };
    const prefixBySlot = gender === 'f' ? femalePrefixBySlot : malePrefixBySlot;
    const prefix = prefixBySlot[slot];

    if (!prefix) {
        return null;
    }

    if (slot === 'flag' && gender === 'f' && id === 1) {
        return `ff00001${backSuffix}`;
    }

    return `${prefix}${idPart}${backSuffix}`;
}
