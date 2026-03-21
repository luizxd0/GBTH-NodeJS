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
const SHOP_BUTTON_CATEGORY = {
    'btn-store-cloth': 'cloth',
    'btn-store-cap': 'cap',
    'btn-store-glasse': 'glasse',
    'btn-store-flag': 'flag',
    'btn-store-setitem': 'setitem',
    'btn-store-exitem': 'exitem'
};
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
    const itemGender = normalizeCatalogGenderValue(item?.gender);
    const userGender = getUserGenderCode(userData);
    return itemGender === 'u' || itemGender === userGender;
}

function resolveGenderBadgeIcon(itemData) {
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

function resolveCatalogPriceLines(itemData) {
    const cash = pickPriceAmount(itemData, 'cash');
    const gold = pickPriceAmount(itemData, 'gold');
    const nameLower = String(itemData?.name || '').toLowerCase();
    const codeLower = String(itemData?.avatar_code || '').toLowerCase();
    const sourceAvatarId = Number(itemData?.source_avatar_id);
    const isPowerUser = nameLower.includes('power user')
        || codeLower === 'ex2_204802'
        || codeLower === 'ex2_204803'
        || codeLower === 'ex2_204804'
        || sourceAvatarId === 204802
        || sourceAvatarId === 204803
        || sourceAvatarId === 204804;

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
    if (categoryKey === 'setitem') return 31;
    if (slot === 'background' || slot === 'foreground') return 30;
    if (categoryKey === 'exitem' || slot === 'exitem') return 29;
    return gender === 'f' ? 1 : 0;
}

function resolveSlotIconUrl(itemData, categoryKey, userData) {
    return getStoreIconUrl(resolveSlotIconFrame(itemData, categoryKey, userData));
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
    const socket = io();
    let userData = JSON.parse(sessionStorage.getItem('user'));

    const nicknameSpan = document.getElementById('lobby-nickname');
    const guildSpan = document.getElementById('lobby-guild');
    const rankIcon = document.getElementById('lobby-rank-icon');
    const rankingValue = document.getElementById('lobby-ranking-value');
    const gpSpan = document.getElementById('lobby-gp');
    const goldSpan = document.getElementById('lobby-gold');
    const cashSpan = document.getElementById('lobby-cash');

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
        userData = data;
        sessionStorage.setItem('user', JSON.stringify(data));
        updateUserInfo(data);
        if (window.avatarShopPreview) {
            window.avatarShopPreview.setGender(data?.gender);
            window.avatarShopPreview.setEquip('head', data?.ahead);
            window.avatarShopPreview.setEquip('body', data?.abody);
            window.avatarShopPreview.setEquip('eyes', data?.aeyes);
            window.avatarShopPreview.setEquip('flag', data?.aflag);
        }
    });

    const btnStoreExit = document.getElementById('btn-store-exit');
    const btnStorePuton = document.getElementById('btn-store-puton');
    const btnStoreBuy = document.getElementById('btn-store-buy');
    const btnStoreMainUp = document.getElementById('btn-store-main-up');
    const btnStoreMainDown = document.getElementById('btn-store-main-down');

    if (btnStorePuton) btnStorePuton.disabled = true;
    if (btnStoreBuy) btnStoreBuy.disabled = true;
    if (btnStoreMainUp) btnStoreMainUp.disabled = true;
    if (btnStoreMainDown) btnStoreMainDown.disabled = true;

    if (btnStoreExit) {
        btnStoreExit.addEventListener('click', () => {
            window.playTransition('closing', () => {
                window.location.href = 'lobby.html';
            });
        });
    }

    let shopCatalog = createEmptyShopCatalog();
    try {
        const catalogItems = await loadAvatarShopCatalogItems();
        shopCatalog = buildShopCatalogByCategory(catalogItems);
    } catch (error) {
        console.warn('[AvatarShop] Failed to load catalog from DB, keeping default button visibility:', error);
    }

    const categoryButtons = Array.from(document.querySelectorAll('.avatar-shop-toggle'));
    const avatarShopList = document.getElementById('avatar-shop-list');
    const applyCurrentSelectionTry = () => {
        if (!avatarShopList) {
            return;
        }
        applySelectedShopItemToPreview(avatarShopList);
    };

    if (avatarShopList) {
        avatarShopList.addEventListener('avatar-shop-selection-change', () => {
            syncTryButtonState(avatarShopList, btnStorePuton);
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

    const firstVisibleCategoryButton = applyCategoryButtonVisibility(categoryButtons, shopCatalog);

    categoryButtons.forEach((button) => {
        button.addEventListener('click', async () => {
            if (button.disabled || button.style.display === 'none') {
                return;
            }
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
        try {
            window.avatarShopPreview = await createAvatarPreviewAnimator(avatarFrame, userData);
        } catch (error) {
            console.error('[AvatarShop] Failed to initialize avatar preview:', error);
        }
    }
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

function applySelectedShopItemToPreview(container) {
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

    container.dataset.activeCategoryId = String(buttonId || '');
    container.dataset.activeCategoryKey = String(categoryKey || '');
    container.dataset.pageIndex = String(currentPage);
    container.dataset.totalPages = String(totalPages);
    container.dataset.pageSize = String(pageSize);
    container.dataset.totalItems = String(categoryItems.length);

    updateMainPagerButtons(upButton, downButton, currentPage, totalPages);
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
                <div class="avatar-shop-item-price">
                    <div class="avatar-shop-item-price-line1"></div>
                    <div class="avatar-shop-item-price-line2"></div>
                </div>
            </div>
        `;
        if (index === 0) {
            item.classList.add('selected');
        }
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
    const genderBadgeUrl = resolveGenderBadgeIcon(itemData);
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

    const slot = getSlotByCategory(categoryKey, itemData);
    const itemId = Number(itemData?.source_ref_id);
    const itemGender = normalizeCatalogGenderValue(itemData?.gender);
    const genderCode = itemGender === 'u'
        ? (Number(userData?.gender) === 1 ? 'f' : 'm')
        : itemGender;
    const folderCode = resolveAtlasFolderCode(genderCode, slot, itemId, false)
        || String(itemData?.avatar_code || '').trim();

    try {
        const slotLower = String(itemData?.slot || '').toLowerCase();
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
