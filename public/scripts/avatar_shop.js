const AVATAR_ANIMATION_FPS = 10;
const PREVIEW_ANCHOR_X = 31;
const PREVIEW_ANCHOR_Y = 58;
// Tweak these two values to reposition the avatar preview.
// +X moves right, +Y moves down.
const PREVIEW_OFFSET_X = 15;
const PREVIEW_OFFSET_Y = 20;
const DEFAULT_SHOP_ITEM_COUNT = 9;
const SET_SHOP_ITEM_COUNT = 4;
const AVATAR_ATLAS_METADATA_URL = '/assets/shared/avatar_sheets/avatar_metadata.json';
const AVATAR_SHEET_TEST_MODE = 'atlas_avatar';
const AVATAR_LAYERED_BASE_URLS = [
    '/assets/shared/avatars',
    '/assets/shared/client_avatars'
];
const AVATAR_THUMB_BASE_URLS = [
    '/assets/shared/avatar_sheets/gbth',
    '/assets/shared/avatar_sheets/dragonbound'
];
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
const SLOT_ORDER = [
    { key: 'flag', back: true, z: 1 },
    { key: 'body', back: true, z: 2 },
    { key: 'head', back: true, z: 3 },
    { key: 'eyes', back: true, z: 4 },
    { key: 'flag', back: false, z: 5 },
    { key: 'body', back: false, z: 6 },
    { key: 'head', back: false, z: 7 },
    { key: 'eyes', back: false, z: 8 }
];

function getPreviewBaseX() {
    return PREVIEW_ANCHOR_X + PREVIEW_OFFSET_X;
}

function getPreviewBaseY() {
    return PREVIEW_ANCHOR_Y + PREVIEW_OFFSET_Y;
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

function resolveGenderBadgeIcon(itemData) {
    const gender = normalizeCatalogGenderValue(itemData?.gender);
    if (gender === 'm') return getStoreAvatarFrameUrl(2);
    if (gender === 'f') return getStoreAvatarFrameUrl(3);
    return null;
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
            await updateShopGridForCategoryButton(
                avatarShopList,
                activeCategoryId,
                shopCatalog,
                userData,
                Math.max(0, currentPage - 1),
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
                ? Math.min(totalPages - 1, currentPage + 1)
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
    const isFemale = Number(userData?.gender) === 1;
    const state = {
        tick: 0,
        timer: null,
        layerState: {},
        avatar: {
            gender: isFemale ? 'f' : 'm',
            // Shop preview should default to naked base when avatar slots are not provided.
            head: parseAvatarItemId(userData?.ahead, 0, true),
            body: parseAvatarItemId(userData?.abody, 0, true),
            eyes: parseAvatarItemId(userData?.aeyes, null, false),
            flag: parseAvatarItemId(userData?.aflag, null, false)
        }
    };

    const root = document.createElement('div');
    root.id = 'avatar-shop-character-preview';
    hostElement.appendChild(root);

    const testRuntime = await tryCreateTestRuntime(root, state);
    if (testRuntime) {
        const tickMs = Math.floor(1000 / AVATAR_ANIMATION_FPS);
        let renderInFlight = false;
        const renderTick = async () => {
            if (renderInFlight) {
                return;
            }
            renderInFlight = true;
            try {
                await testRuntime.render(state.tick);
                state.tick += 1;
            } catch (error) {
                console.warn('[AvatarShop] Test runtime render error:', error);
            } finally {
                renderInFlight = false;
            }
        };
        renderTick();
        state.timer = window.setInterval(renderTick, tickMs);

        return {
            setEquip(slot, itemId) {
                if (!['head', 'body', 'eyes', 'flag'].includes(slot)) return;
                if (slot === 'eyes' || slot === 'flag') {
                    state.avatar[slot] = parseAvatarItemId(itemId, null, false);
                    return;
                }
                state.avatar[slot] = parseAvatarItemId(itemId, 0, true);
            },
            setGender(genderValue) {
                state.avatar.gender = Number(genderValue) === 1 || genderValue === 'f' ? 'f' : 'm';
            },
            destroy() {
                if (state.timer) {
                    window.clearInterval(state.timer);
                }
                testRuntime.destroy();
                root.remove();
            }
        };
    }

    const manifest = await loadAvatarManifest();
    const layerElements = {};
    SLOT_ORDER.forEach(({ key, back, z }) => {
        const layerKey = toLayerKey(key, back);
        const img = document.createElement('img');
        img.className = 'avatar-preview-layer';
        img.style.zIndex = String(z);
        img.alt = '';
        img.draggable = false;
        img.style.display = 'none';
        root.appendChild(img);
        layerElements[layerKey] = img;
        state.layerState[layerKey] = {
            currentFolder: null,
            currentSrc: null,
            currentLeft: null,
            currentTop: null,
            turnCycle: undefined
        };
    });

    const tickMs = Math.floor(1000 / AVATAR_ANIMATION_FPS);
    renderAvatarTick();
    state.timer = window.setInterval(renderAvatarTick, tickMs);

    function renderAvatarTick() {
        const visibleLayers = [];

        SLOT_ORDER.forEach(({ key, back }) => {
            const layerKey = toLayerKey(key, back);
            const layerSlotState = state.layerState[layerKey];
            const img = layerElements[layerKey];
            const itemId = state.avatar[key];
            const folder = resolveAvatarFolder(manifest.folders, state.avatar.gender, key, itemId, back);

            if (!folder) {
                layerSlotState.currentFolder = null;
                layerSlotState.currentSrc = null;
                layerSlotState.turnCycle = undefined;
                img.style.display = 'none';
                return;
            }

            if (layerSlotState.currentFolder !== folder) {
                layerSlotState.currentFolder = folder;
                layerSlotState.currentSrc = null;
                layerSlotState.turnCycle = undefined;
            }

            const folderInfo = manifest.folders[folder];
            if (!folderInfo || !Array.isArray(folderInfo.indexes) || folderInfo.indexes.length === 0) {
                img.style.display = 'none';
                return;
            }

            visibleLayers.push({
                key,
                back,
                folder,
                layerKey,
                layerSlotState,
                img,
                folderInfo
            });
        });

        let headState = null;
        const headLayer =
            visibleLayers.find((entry) => entry.key === 'head' && !entry.back) ||
            visibleLayers.find((entry) => entry.key === 'head');
        if (headLayer) {
            const headResult = computeLayerFrameBySlot(
                'head',
                headLayer.folderInfo.indexes.length,
                state.tick,
                headLayer.layerSlotState,
                null,
                state.avatar.head
            );
            headState = headResult;
        }

        visibleLayers.forEach(({ key, folder, layerSlotState, img, folderInfo }) => {
            const frameResult = computeLayerFrameBySlot(
                key,
                folderInfo.indexes.length,
                state.tick,
                layerSlotState,
                key === 'eyes' ? headState : null,
                state.avatar[key]
            );
            const logicalIndex = Number(frameResult?.index);
            if (frameResult?.hidden === true || !Number.isFinite(logicalIndex) || logicalIndex < 0) {
                img.style.display = 'none';
                layerSlotState.currentSrc = null;
                return;
            }
            const frameIndex = folderInfo.indexes[Math.max(0, Math.min(logicalIndex, folderInfo.indexes.length - 1))];
            const assetBaseUrl = String(manifest.__assetBaseUrl || '/assets/shared/avatars');
            const src = `${assetBaseUrl}/${folder}/${folder}_frame_${frameIndex}.png`;
            const anchor = (Array.isArray(folderInfo.anchors) && folderInfo.anchors[frameIndex])
                ? folderInfo.anchors[frameIndex]
                : { x: 0, y: 0 };
            const left = getPreviewBaseX() + Number(anchor.x || 0);
            const top = getPreviewBaseY() + Number(anchor.y || 0);

            if (layerSlotState.currentLeft !== left) {
                img.style.left = `${left}px`;
                layerSlotState.currentLeft = left;
            }
            if (layerSlotState.currentTop !== top) {
                img.style.top = `${top}px`;
                layerSlotState.currentTop = top;
            }

            if (layerSlotState.currentSrc !== src) {
                img.src = src;
                img.style.display = '';
                layerSlotState.currentSrc = src;
            }
        });

        state.tick += 1;
    }

    return {
        setEquip(slot, itemId) {
            if (!['head', 'body', 'eyes', 'flag'].includes(slot)) return;
            if (slot === 'eyes' || slot === 'flag') {
                state.avatar[slot] = parseAvatarItemId(itemId, null, false);
                return;
            }
            state.avatar[slot] = parseAvatarItemId(itemId, 0, true);
        },
        setGender(genderValue) {
            state.avatar.gender = Number(genderValue) === 1 || genderValue === 'f' ? 'f' : 'm';
            Object.values(state.layerState).forEach((slotState) => {
                slotState.currentFolder = null;
                slotState.currentSrc = null;
                slotState.currentLeft = null;
                slotState.currentTop = null;
                slotState.turnCycle = undefined;
            });
        },
        destroy() {
            if (state.timer) {
                window.clearInterval(state.timer);
            }
            root.remove();
        }
    };
}

async function loadAvatarManifest() {
    const tried = [];
    for (const baseUrl of AVATAR_LAYERED_BASE_URLS) {
        const manifestUrl = `${baseUrl}/manifest.json?v=${Date.now()}`;
        tried.push(manifestUrl);
        const response = await fetch(manifestUrl, { cache: 'no-store' });
        if (!response.ok) {
            continue;
        }

        const json = await response.json();
        return {
            ...json,
            __assetBaseUrl: baseUrl
        };
    }

    throw new Error(`Unable to load avatar manifest (tried: ${tried.join(', ')})`);
}

function resolveAvatarFolder(manifestFolders, gender, slot, itemId, isBackLayer) {
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

    // Female default flag has a dedicated ff00001 set.
    if (slot === 'flag' && gender === 'f' && id === 1) {
        const femaleDefaultFlag = `ff00001${backSuffix}`;
        if (manifestFolders[femaleDefaultFlag]) {
            return femaleDefaultFlag;
        }
    }

    const directFolder = `${prefix}${idPart}${backSuffix}`;
    if (manifestFolders[directFolder]) {
        return directFolder;
    }

    return null;
}

function computeSyncedFrameIndexFromForced(frameCount, tick, forcedSpecial) {
    const forcedState = (forcedSpecial && typeof forcedSpecial === 'object') ? forcedSpecial : null;
    if (!forcedState) {
        return null;
    }

    const rawPhase = Number(forcedState.phase);
    const rawMax = Number(forcedState.phaseMax);
    let mapped = null;
    if (Number.isFinite(rawPhase) && Number.isFinite(rawMax) && rawMax > 0) {
        const normalized = Math.max(0, Math.min(1, rawPhase / rawMax));
        mapped = Math.round(normalized * Math.max(0, frameCount - 1));
    } else if (Number.isFinite(rawPhase)) {
        mapped = Math.max(0, Math.floor(rawPhase)) % Math.max(1, frameCount);
    }

    if (!Number.isFinite(mapped)) {
        mapped = computePingPongFrameIndex(frameCount, tick);
    }

    return {
        index: Math.max(0, Math.min(frameCount - 1, mapped)),
        isSpecial: Boolean(forcedState.isSpecial),
        phase: Math.max(0, Math.min(frameCount - 1, mapped)),
        phaseMax: Math.max(0, frameCount - 1)
    };
}

function isHeadTriggeredEyesOnlyItem(itemId) {
    const id = Number(itemId);
    return Number.isFinite(id) && (id === 44 || id === 45 || id === 46);
}

function computeHeadTriggeredEyesOnlyFrame(frameCount, forcedSpecial, itemId) {
    const numericItemId = Number(itemId);
    const isAngryEyes = Number.isFinite(numericItemId) && numericItemId === 44;
    const idleIndex = 0;
    const forcedState = (forcedSpecial && typeof forcedSpecial === 'object') ? forcedSpecial : null;
    if (!forcedState || forcedState.isSpecial !== true) {
        if (isAngryEyes) {
            return { index: -1, isSpecial: false, hidden: true, phase: 0, phaseMax: Math.max(0, frameCount - 1) };
        }
        return { index: idleIndex, isSpecial: false, phase: idleIndex, phaseMax: Math.max(0, frameCount - 1) };
    }

    const rawPhase = Number(forcedState.phase);
    const rawMax = Number(forcedState.phaseMax);
    let mapped = 0;
    if (Number.isFinite(rawPhase) && Number.isFinite(rawMax) && rawMax > 0) {
        const normalized = Math.max(0, Math.min(1, rawPhase / rawMax));
        mapped = Math.round(normalized * Math.max(0, frameCount - 1));
    } else if (Number.isFinite(rawPhase)) {
        mapped = Math.max(0, Math.floor(rawPhase)) % Math.max(1, frameCount);
    }
    return {
        index: Math.max(0, Math.min(frameCount - 1, mapped)),
        isSpecial: true,
        phase: Math.max(0, Math.min(frameCount - 1, mapped)),
        phaseMax: Math.max(0, frameCount - 1)
    };
}

function computeLayerFrameBySlot(slot, frameCount, tick, layerState, forcedSpecial, slotItemId) {
    if (frameCount <= 1) {
        return { index: 0, isSpecial: false };
    }

    if (slot === 'body' || slot === 'flag') {
        return { index: computePingPongFrameIndex(frameCount, tick), isSpecial: false };
    }

    if (slot === 'head') {
        return computeAvatarSpecialFrameIndex(frameCount, tick, layerState, false, forcedSpecial);
    }

    if (slot === 'eyes') {
        if (isHeadTriggeredEyesOnlyItem(slotItemId)) {
            return computeHeadTriggeredEyesOnlyFrame(frameCount, forcedSpecial, slotItemId);
        }
        if (frameCount === 44) {
            return computeAvatarSpecialFrameIndex(frameCount, tick, layerState, true, forcedSpecial);
        }
        if (frameCount === 22) {
            return computeAvatarSpecialFrameIndex(frameCount, tick, layerState, false, forcedSpecial);
        }
        const synced = computeSyncedFrameIndexFromForced(frameCount, tick, forcedSpecial);
        if (synced) {
            return synced;
        }
        return { index: computePingPongFrameIndex(frameCount, tick), isSpecial: false };
    }

    return { index: tick % frameCount, isSpecial: false };
}

function computePingPongFrameIndex(frameCount, tick) {
    const period = Math.max(1, 2 * frameCount - 2);
    const step = tick % period;
    return step < frameCount ? step : period - step;
}

function computeAvatarSpecialFrameIndex(frameCount, tick, layerState, noReverse, forcedSpecial) {
    const half = Math.floor(frameCount / 2);
    if (half <= 0) {
        return { index: 0, isSpecial: false };
    }

    const forcedState = (forcedSpecial && typeof forcedSpecial === 'object') ? forcedSpecial : null;
    let isSpecial;
    if (typeof forcedSpecial === 'boolean') {
        isSpecial = forcedSpecial;
    } else if (forcedState && typeof forcedState.isSpecial === 'boolean') {
        isSpecial = forcedState.isSpecial;
    } else {
        const cycleBase = Math.max(1, frameCount - 2);
        const cycle = Math.floor(tick / cycleBase);
        if (!Number.isFinite(layerState.turnCycle) || cycle > layerState.turnCycle) {
            layerState.turnCycle = randomInt(cycle, cycle + 6);
        }
        isSpecial = cycle === layerState.turnCycle;
    }

    let forcedPhase = null;
    if (forcedState && Number.isFinite(forcedState.phase)) {
        const rawPhase = Math.max(0, Math.floor(Number(forcedState.phase)));
        const rawMax = Number(forcedState.phaseMax);
        if (Number.isFinite(rawMax) && rawMax > 0) {
            const normalized = Math.max(0, Math.min(1, rawPhase / rawMax));
            forcedPhase = Math.round(normalized * Math.max(0, half - 1));
        } else {
            forcedPhase = rawPhase;
        }
    }

    if (noReverse) {
        const step = forcedPhase === null ? (tick % half) : (forcedPhase % half);
        return { index: isSpecial ? step : step + half, isSpecial, phase: step, phaseMax: Math.max(0, half - 1) };
    }

    let step;
    if (forcedPhase !== null) {
        step = forcedPhase % half;
    } else {
        const period = Math.max(1, 2 * half - 2);
        step = tick % period;
        if (step >= half) {
            step = period - step;
        }
    }
    return { index: isSpecial ? step : step + half, isSpecial, phase: step, phaseMax: Math.max(0, half - 1) };
}

function parseAvatarItemId(value, fallback, allowZero) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    if (!allowZero && parsed <= 0) {
        return fallback;
    }
    if (allowZero && parsed < 0) {
        return fallback;
    }
    return parsed;
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
        upButton.disabled = totalPages <= 1 || pageIndex <= 0;
    }
    if (downButton) {
        downButton.disabled = totalPages <= 1 || pageIndex >= (totalPages - 1);
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
    tryButton.disabled = !getSelectedShopItem(container);
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
    const categoryItems = filterCatalogItemsByUserGender(rawCategoryItems, userData);

    const pageSize = getPageSizeForCategory(categoryKey);
    const totalPages = getTotalPages(categoryItems.length, pageSize);
    const currentPage = clampPageIndex(pageIndex, totalPages);
    const startIndex = currentPage * pageSize;
    const visibleItems = categoryItems.slice(startIndex, startIndex + pageSize);

    syncAvatarShopListMode(container, buttonId, visibleItems.length);

    const cardButtons = Array.from(container.querySelectorAll('.avatar-shop-item'));
    await Promise.all(cardButtons.map((cardButton, index) =>
        applyGridItemVisual(cardButton, visibleItems[index], categoryKey, userData)
    ));
    cardButtons.forEach((cardButton, index) => {
        cardButton.__shopItemData = visibleItems[index] || null;
        cardButton.dataset.hasItem = visibleItems[index] ? '1' : '0';
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
                <div class="avatar-shop-item-preview">
                    <div class="avatar-shop-item-thumb"></div>
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
    const genderCode = Number(userData?.gender) === 1 ? 'f' : 'm';
    return (items || []).filter((item) => {
        const rawGender = String(item?.gender || 'u').toLowerCase();
        const itemGender = rawGender === '1' ? 'f' : (rawGender === '0' ? 'm' : rawGender);
        return itemGender === 'u' || itemGender === genderCode;
    });
}

function getSlotByCategory(categoryKey, item) {
    if (categoryKey === 'cloth') return 'body';
    if (categoryKey === 'cap') return 'head';
    if (categoryKey === 'glasse') return 'eyes';
    if (categoryKey === 'flag') return 'flag';

    const slot = String(item?.slot || '').toLowerCase();
    if (slot === 'body' || slot === 'head' || slot === 'eyes' || slot === 'flag') {
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

async function resolveStaticThumbUrl(codeCandidates) {
    const cacheKey = codeCandidates.join('|');
    if (!resolvedThumbImagePromises.has(cacheKey)) {
        resolvedThumbImagePromises.set(cacheKey, (async () => {
            let lastError = null;
            for (const code of codeCandidates) {
                for (const baseUrl of AVATAR_THUMB_BASE_URLS) {
                    const url = `${baseUrl}/${code}.png`;
                    try {
                        await preloadImage(url);
                        return url;
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

async function applyGridItemVisual(itemButton, itemData, categoryKey, userData) {
    const nameEl = itemButton.querySelector('.avatar-shop-item-name');
    const slotIconEl = itemButton.querySelector('.avatar-shop-item-slot-icon');
    const genderBadgeEl = itemButton.querySelector('.avatar-shop-item-gender-badge');
    const thumbEl = itemButton.querySelector('.avatar-shop-item-thumb');
    if (!nameEl || !thumbEl || !slotIconEl || !genderBadgeEl) {
        return;
    }

    if (!itemData) {
        nameEl.textContent = '';
        slotIconEl.style.display = 'none';
        slotIconEl.removeAttribute('src');
        genderBadgeEl.style.display = 'none';
        genderBadgeEl.removeAttribute('src');
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

    const slot = getSlotByCategory(categoryKey, itemData);
    const itemId = Number(itemData?.source_ref_id);
    const genderCode = Number(userData?.gender) === 1 ? 'f' : 'm';
    const folderCode = resolveAtlasFolderCode(genderCode, slot, itemId, false)
        || String(itemData?.avatar_code || '').trim();
    if (!folderCode) {
        thumbEl.style.display = 'none';
        return;
    }

    try {
        const codeCandidates = buildThumbCodeCandidates(itemData, folderCode);
        if (!codeCandidates.length) {
            thumbEl.style.display = 'none';
            return;
        }

        const imageUrl = await resolveStaticThumbUrl(codeCandidates);
        thumbEl.style.display = 'block';
        thumbEl.style.backgroundImage = `url('${imageUrl}')`;
        thumbEl.style.backgroundPosition = 'center center';
        thumbEl.style.backgroundSize = 'auto';
        thumbEl.style.width = '100%';
        thumbEl.style.height = '100%';
    } catch (error) {
        thumbEl.style.display = 'none';
    }
}

let atlasMetadataPromise = null;
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

function findAtlasEntryByFolderCode(atlases, folderCode) {
    if (!folderCode || !atlases || typeof atlases !== 'object') {
        return null;
    }

    const candidates = [`gbth_${folderCode}`, `db_${folderCode}`, folderCode];
    for (const key of candidates) {
        if (atlases[key]) {
            return { key, atlas: atlases[key] };
        }
    }
    return null;
}

async function tryCreateAtlasAvatarRuntime(root, state) {
    try {
        const meta = await loadAtlasMetadata();
        const atlases = meta?.atlases;
        if (!atlases || typeof atlases !== 'object') {
            return null;
        }

        const runtimeLayers = SLOT_ORDER.map(({ key, back, z }) => {
            const el = document.createElement('div');
            el.className = 'avatar-preview-sheet';
            el.style.position = 'absolute';
            el.style.pointerEvents = 'none';
            el.style.backgroundRepeat = 'no-repeat';
            el.style.zIndex = String(z);
            el.style.display = 'none';
            root.appendChild(el);

            return {
                slot: key,
                back,
                z,
                el,
                folderCode: null,
                atlasKey: null,
                frames: [],
                state: { turnCycle: undefined }
            };
        });

        async function ensureLayerAtlas(layer) {
            const itemId = state.avatar[layer.slot];
            const folderCode = resolveAtlasFolderCode(state.avatar.gender, layer.slot, itemId, layer.back);
            if (!folderCode) {
                layer.folderCode = null;
                layer.atlasKey = null;
                layer.frames = [];
                layer.state.turnCycle = undefined;
                layer.el.style.display = 'none';
                return false;
            }

            const entry = findAtlasEntryByFolderCode(atlases, folderCode);
            if (!entry) {
                layer.folderCode = null;
                layer.atlasKey = null;
                layer.frames = [];
                layer.state.turnCycle = undefined;
                layer.el.style.display = 'none';
                return false;
            }

            if (layer.folderCode === folderCode && layer.atlasKey === entry.key && layer.frames.length > 0) {
                return true;
            }

            const imageUrl = await resolveAtlasImageUrl(entry.atlas.image, entry.key);
            const frames = expandAtlasFrames(entry.atlas);
            if (!frames.length) {
                layer.folderCode = null;
                layer.atlasKey = null;
                layer.frames = [];
                layer.state.turnCycle = undefined;
                layer.el.style.display = 'none';
                return false;
            }

            layer.folderCode = folderCode;
            layer.atlasKey = entry.key;
            layer.frames = frames;
            layer.state.turnCycle = undefined;
            layer.el.style.backgroundImage = `url('${imageUrl}')`;
            return true;
        }

        await Promise.all(runtimeLayers.map((layer) => ensureLayerAtlas(layer)));

        return {
            async render(tick) {
                await Promise.all(runtimeLayers.map((layer) => ensureLayerAtlas(layer)));

                let headState = null;
                const headLayer = runtimeLayers.find((layer) => layer.slot === 'head' && !layer.back)
                    || runtimeLayers.find((layer) => layer.slot === 'head');
                if (headLayer && headLayer.frames.length > 0) {
                    const headResult = computeLayerFrameBySlot(
                        'head',
                        headLayer.frames.length,
                        tick,
                        headLayer.state,
                        null,
                        state.avatar.head
                    );
                    headState = headResult;
                }

                runtimeLayers.forEach((layer) => {
                    if (!layer.frames.length) {
                        layer.el.style.display = 'none';
                        return;
                    }

                    const forcedSpecial = layer.slot === 'eyes' ? headState : null;
                    const result = computeLayerFrameBySlot(
                        layer.slot,
                        layer.frames.length,
                        tick,
                        layer.state,
                        forcedSpecial,
                        state.avatar[layer.slot]
                    );
                    if (result?.hidden === true || !Number.isFinite(result?.index) || Number(result.index) < 0) {
                        layer.el.style.display = 'none';
                        return;
                    }
                    const index = Math.max(0, Math.min(result.index, layer.frames.length - 1));
                    const frame = layer.frames[index];
                    if (!frame) {
                        layer.el.style.display = 'none';
                        return;
                    }

                    const left = getPreviewBaseX() + Number(frame.ox || 0) - Number(frame.cx || 0);
                    const top = getPreviewBaseY() + Number(frame.oy || 0) - Number(frame.cy || 0);
                    layer.el.style.left = `${left}px`;
                    layer.el.style.top = `${top}px`;
                    layer.el.style.width = `${frame.w}px`;
                    layer.el.style.height = `${frame.h}px`;
                    layer.el.style.backgroundPosition = `-${frame.sx}px -${frame.sy}px`;
                    layer.el.style.display = '';
                });
            },
            destroy() {
                runtimeLayers.forEach((layer) => layer.el.remove());
            }
        };
    } catch (error) {
        console.warn('[AvatarShop] Atlas runtime disabled (fallback to layered):', error);
        return null;
    }
}

function isDefaultMaleAvatar(avatarState) {
    return avatarState.gender === 'm'
        && Number(avatarState.head) === 0
        && Number(avatarState.body) === 0
        && (avatarState.eyes === null || avatarState.eyes === undefined)
        && (avatarState.flag === null || avatarState.flag === undefined);
}

async function tryCreateTestRuntime(root, state) {
    if (AVATAR_SHEET_TEST_MODE === 'dragonbound_random_avatar') {
        return tryCreateDragonboundAtlasRuntime(root);
    }
    if (AVATAR_SHEET_TEST_MODE === 'atlas_avatar' || AVATAR_SHEET_TEST_MODE === '') {
        const atlasRuntime = await tryCreateAtlasAvatarRuntime(root, state);
        if (atlasRuntime) {
            return atlasRuntime;
        }
    }
    if (AVATAR_SHEET_TEST_MODE === 'default_male' || (AVATAR_SHEET_TEST_MODE === '' && isDefaultMaleAvatar(state.avatar))) {
        return tryCreateDefaultMaleSheetRuntime(root, state);
    }
    return null;
}

async function tryCreateDefaultMaleSheetRuntime(root, state) {
    if (!isDefaultMaleAvatar(state.avatar)) {
        return null;
    }

    try {
        const meta = await loadAtlasMetadata();
        const sheetDef = meta?.spritesheets?.default_male;
        if (!sheetDef || sheetDef.mode !== 'grid' || !sheetDef.cell) {
            return null;
        }

        const rawImageUrl = String(sheetDef.image || '').trim();
        if (!rawImageUrl) {
            return null;
        }
        const imageUrl = await resolveAtlasImageUrl(rawImageUrl, 'default_male');

        const sprite = document.createElement('div');
        sprite.className = 'avatar-preview-sheet';
        sprite.style.position = 'absolute';
        sprite.style.pointerEvents = 'none';
        sprite.style.backgroundImage = `url('${imageUrl}')`;
        sprite.style.backgroundRepeat = 'no-repeat';
        root.appendChild(sprite);

        const fixedLeft = getPreviewBaseX() + Number(sheetDef.bounds?.min_x || 0);
        const fixedTop = getPreviewBaseY() + Number(sheetDef.bounds?.min_y || 0);
        sprite.style.left = `${fixedLeft}px`;
        sprite.style.top = `${fixedTop}px`;

        const columns = Math.max(1, Number(sheetDef.columns) || 1);
        const cellW = Math.max(1, Number(sheetDef.cell.w) || 1);
        const cellH = Math.max(1, Number(sheetDef.cell.h) || 1);
        const cycleTicks = Math.max(1, Number(sheetDef.cycle_ticks) || 1);

        return {
            render(tick) {
                const frame = ((tick % cycleTicks) + cycleTicks) % cycleTicks;
                const col = frame % columns;
                const row = Math.floor(frame / columns);
                sprite.style.width = `${cellW}px`;
                sprite.style.height = `${cellH}px`;
                sprite.style.backgroundPosition = `-${col * cellW}px -${row * cellH}px`;
                sprite.style.display = '';
            },
            destroy() {
                sprite.remove();
            }
        };
    } catch (error) {
        console.warn('[AvatarShop] Default sheet runtime disabled (fallback to layered):', error);
        return null;
    }
}

function decompressGraphics(graphicsList) {
    const out = [];
    let previousFrame = null;
    for (const entry of graphicsList || []) {
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

function computeIndexByLoop(loopName, frameCount, tick, layerState, forcedSpecial) {
    if (loopName === 'avatar') {
        return computeAvatarSpecialFrameIndex(frameCount, tick, layerState, false, forcedSpecial);
    }
    if (loopName === 'avatar_no_reverse') {
        return computeAvatarSpecialFrameIndex(frameCount, tick, layerState, true, forcedSpecial);
    }
    if (loopName === 'normal') {
        return { index: tick % Math.max(1, frameCount), isSpecial: false };
    }
    return { index: computePingPongFrameIndex(frameCount, tick), isSpecial: false };
}

async function tryCreateDragonboundAtlasRuntime(root) {
    try {
        const meta = await loadAtlasMetadata();
        const testDef = meta?.tests?.dragonbound_random_avatar;
        if (!testDef || !Array.isArray(testDef.layers) || testDef.layers.length === 0) {
            return null;
        }

        const runtimeLayers = [];
        for (const layerDef of testDef.layers) {
            const atlasName = layerDef?.atlas;
            const atlasDef = meta?.atlases?.[atlasName];
            if (!atlasName || !atlasDef?.image) {
                continue;
            }
            const frames = expandAtlasFrames(atlasDef);
            if (!frames.length) {
                continue;
            }
            await preloadImage(atlasDef.image);

            const layerEl = document.createElement('div');
            layerEl.className = 'avatar-preview-sheet';
            layerEl.style.position = 'absolute';
            layerEl.style.pointerEvents = 'none';
            layerEl.style.backgroundImage = `url('${atlasDef.image}')`;
            layerEl.style.backgroundRepeat = 'no-repeat';
            layerEl.style.zIndex = String(Number(layerDef.z || 6));
            root.appendChild(layerEl);

            runtimeLayers.push({
                slot: String(layerDef.slot || ''),
                loop: String(layerDef.loop || 'pingpong'),
                offsetX: Number(layerDef.offsetX || 0),
                offsetY: Number(layerDef.offsetY || 0),
                frames,
                el: layerEl,
                state: { turnCycle: undefined }
            });
        }

        if (!runtimeLayers.length) {
            return null;
        }

        return {
            render(tick) {
                let headState = null;
                const headLayer = runtimeLayers.find((layer) => layer.slot === 'head');
                if (headLayer) {
                    const headResult = computeIndexByLoop(
                        headLayer.loop,
                        headLayer.frames.length,
                        tick,
                        headLayer.state
                    );
                    headState = headResult;
                }

                runtimeLayers.forEach((layer) => {
                    const forcedSpecial = layer.slot === 'eyes' ? headState : null;
                    const result = computeIndexByLoop(
                        layer.loop,
                        layer.frames.length,
                        tick,
                        layer.state,
                        forcedSpecial
                    );
                    const clampedIndex = Math.max(0, Math.min(result.index, layer.frames.length - 1));
                    const frame = layer.frames[clampedIndex];
                    if (!frame) return;

                    const left = getPreviewBaseX() + layer.offsetX - frame.cx;
                    const top = getPreviewBaseY() + layer.offsetY - frame.cy;
                    layer.el.style.left = `${left}px`;
                    layer.el.style.top = `${top}px`;
                    layer.el.style.width = `${frame.w}px`;
                    layer.el.style.height = `${frame.h}px`;
                    layer.el.style.backgroundPosition = `-${frame.sx}px -${frame.sy}px`;
                    layer.el.style.display = '';
                });
            },
            destroy() {
                runtimeLayers.forEach((layer) => layer.el.remove());
            }
        };
    } catch (error) {
        console.warn('[AvatarShop] DragonBound test runtime disabled (fallback to layered):', error);
        return null;
    }
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function toLayerKey(slot, back) {
    return `${slot}:${back ? 'back' : 'front'}`;
}
