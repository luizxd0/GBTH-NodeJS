const AVATAR_ANIMATION_FPS = 10;
const PREVIEW_ANCHOR_X = 31;
const PREVIEW_ANCHOR_Y = 58;
const PREVIEW_NUDGE_X = 0;
const PREVIEW_NUDGE_Y = 12;
const AVATAR_ATLAS_METADATA_URL = '/assets/shared/avatar_sheets/avatar_metadata.json';
const AVATAR_SHEET_TEST_MODE = 'dragonbound_random_avatar';
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

document.addEventListener('DOMContentLoaded', async () => {
    const socket = io();
    const userData = JSON.parse(sessionStorage.getItem('user'));

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
        sessionStorage.setItem('user', JSON.stringify(data));
        updateUserInfo(data);
    });

    const btnStoreExit = document.getElementById('btn-store-exit');
    const btnStorePuton = document.getElementById('btn-store-puton');
    const btnStoreBuy = document.getElementById('btn-store-buy');

    if (btnStorePuton) btnStorePuton.disabled = true;
    if (btnStoreBuy) btnStoreBuy.disabled = true;

    if (btnStoreExit) {
        btnStoreExit.addEventListener('click', () => {
            window.playTransition('closing', () => {
                window.location.href = 'lobby.html';
            });
        });
    }

    const categoryButtons = document.querySelectorAll('.avatar-shop-toggle');
    categoryButtons.forEach((button) => {
        button.addEventListener('click', () => {
            categoryButtons.forEach((btn) => btn.classList.remove('active'));
            button.classList.add('active');
        });
    });

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
        testRuntime.render(state.tick);
        state.timer = window.setInterval(() => {
            testRuntime.render(state.tick);
            state.tick += 1;
        }, tickMs);

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

        let headSpecial = null;
        const headLayer =
            visibleLayers.find((entry) => entry.key === 'head' && !entry.back) ||
            visibleLayers.find((entry) => entry.key === 'head');
        if (headLayer) {
            const headResult = computeLayerFrameBySlot('head', headLayer.folderInfo.indexes.length, state.tick, headLayer.layerSlotState);
            headSpecial = headResult.isSpecial;
        }

        visibleLayers.forEach(({ key, folder, layerSlotState, img, folderInfo }) => {
            const logicalIndex = computeLayerFrameBySlot(
                key,
                folderInfo.indexes.length,
                state.tick,
                layerSlotState,
                key === 'eyes' ? headSpecial : null
            ).index;
            const frameIndex = folderInfo.indexes[Math.max(0, Math.min(logicalIndex, folderInfo.indexes.length - 1))];
            const src = `/assets/shared/avatars/${folder}/${folder}_frame_${frameIndex}.png`;
            const anchor = (Array.isArray(folderInfo.anchors) && folderInfo.anchors[frameIndex])
                ? folderInfo.anchors[frameIndex]
                : { x: 0, y: 0 };
            const left = PREVIEW_ANCHOR_X + PREVIEW_NUDGE_X + Number(anchor.x || 0);
            const top = PREVIEW_ANCHOR_Y + PREVIEW_NUDGE_Y + Number(anchor.y || 0);

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
    const response = await fetch(`/assets/shared/avatars/manifest.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Unable to load avatar manifest (${response.status})`);
    }
    return response.json();
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

function computeLayerFrameBySlot(slot, frameCount, tick, layerState, forcedSpecial) {
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
        if (frameCount === 44) {
            return computeAvatarSpecialFrameIndex(frameCount, tick, layerState, true, forcedSpecial);
        }
        if (frameCount === 22) {
            return computeAvatarSpecialFrameIndex(frameCount, tick, layerState, false, forcedSpecial);
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

    let isSpecial;
    if (typeof forcedSpecial === 'boolean') {
        isSpecial = forcedSpecial;
    } else {
        const cycleBase = Math.max(1, frameCount - 2);
        const cycle = Math.floor(tick / cycleBase);
        if (!Number.isFinite(layerState.turnCycle) || cycle > layerState.turnCycle) {
            layerState.turnCycle = randomInt(cycle, cycle + 6);
        }
        isSpecial = cycle === layerState.turnCycle;
    }

    if (noReverse) {
        const step = tick % half;
        return { index: isSpecial ? step : step + half, isSpecial };
    }

    const period = Math.max(1, 2 * half - 2);
    let step = tick % period;
    if (step >= half) {
        step = period - step;
    }
    return { index: isSpecial ? step : step + half, isSpecial };
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

let atlasMetadataPromise = null;
const preloadedImagePromises = new Map();

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

        const imageUrl = String(sheetDef.image || '').trim();
        if (!imageUrl) {
            return null;
        }
        await preloadImage(imageUrl);

        const sprite = document.createElement('div');
        sprite.className = 'avatar-preview-sheet';
        sprite.style.position = 'absolute';
        sprite.style.pointerEvents = 'none';
        sprite.style.backgroundImage = `url('${imageUrl}')`;
        sprite.style.backgroundRepeat = 'no-repeat';
        root.appendChild(sprite);

        const fixedLeft = PREVIEW_ANCHOR_X + PREVIEW_NUDGE_X + Number(sheetDef.bounds?.min_x || 0);
        const fixedTop = PREVIEW_ANCHOR_Y + PREVIEW_NUDGE_Y + Number(sheetDef.bounds?.min_y || 0);
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
                let headSpecial = null;
                const headLayer = runtimeLayers.find((layer) => layer.slot === 'head');
                if (headLayer) {
                    const headResult = computeIndexByLoop(
                        headLayer.loop,
                        headLayer.frames.length,
                        tick,
                        headLayer.state
                    );
                    headSpecial = headResult.isSpecial;
                }

                runtimeLayers.forEach((layer) => {
                    const forcedSpecial = layer.slot === 'eyes' ? headSpecial : null;
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

                    const left = PREVIEW_ANCHOR_X + PREVIEW_NUDGE_X + layer.offsetX - frame.cx;
                    const top = PREVIEW_ANCHOR_Y + PREVIEW_NUDGE_Y + layer.offsetY - frame.cy;
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

