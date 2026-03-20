(function () {
const AVATAR_ANIMATION_FPS = 10;
const AVATAR_ANIMATION_TICK_MS = Math.floor(1000 / AVATAR_ANIMATION_FPS);
// Fine-tuning knob for shop preview parity (1.0 = base tick speed).
const PREVIEW_ANIMATION_SPEED_MULTIPLIER = 1.0;
// Locked visual calibration for Avatar Shop preview (position/size confirmed in QA).
const PREVIEW_ANCHOR_X = 31;
const PREVIEW_ANCHOR_Y = 58;
const PREVIEW_OFFSET_X = 15;
const PREVIEW_OFFSET_Y = 20;
// GBTH client parity: EX layers are advanced from the same master avatar tick.
const PREVIEW_EX_BACKGROUND_TICK_DIVISOR = 1;
const PREVIEW_EX_FOREGROUND_TICK_DIVISOR = 1;
// Optional per-folder tick-divisor overrides (example: { f204808: 2 }).
const PREVIEW_EX_EFFECT_TICK_DIVISOR_OVERRIDES = {};
const PREVIEW_EX_FOREGROUND_SPEED_MULTIPLIER = 1.0;
// Optional per-effect speed tuning when specific foreground effects need nudging.
const PREVIEW_EX_EFFECT_SPEED_MULTIPLIER_OVERRIDES = {};
// Calibrated GBTH EPA timeline unit for shop preview.
const PREVIEW_EX_EFFECT_EPA_DURATION_UNIT_MS = 50;
// Optional per-effect placement nudges (delta-only; base offset comes from metadata).
const PREVIEW_EX_EFFECT_POSITION_OFFSETS = {
    // Heart in the sky: keep GBTH visual parity in shop preview.
    sf204849: { x: 0, y: -21 }
};
// Some effects have frame metadata that oscillates the anchor by 1px; lock Y to avoid visible jitter.
const PREVIEW_EX_EFFECT_LOCK_Y_FOLDERS = new Set([
    'sf204854',
    'sf204855',
    'f204854',
    'f204855'
]);
const AVATAR_ATLAS_METADATA_URL = '/assets/shared/avatar_sheets/avatar_metadata.json';
const AVATAR_SHEET_TEST_MODE = 'atlas_avatar';
const AVATAR_LAYERED_BASE_URLS = [
    '/assets/shared/avatars',
    '/assets/shared/client_avatars'
];
const AVATAR_EX_EFFECT_METADATA_URL = '/assets/shared/avatar_effect_sheets/effect_metadata.json';
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

function getNowMs() {
    if (typeof performance !== 'undefined' && Number.isFinite(performance.now())) {
        return performance.now();
    }
    return Date.now() % 1000000000;
}

function getPreviewAnimationTick(nowMs, startMs, tickMs) {
    const elapsed = Math.max(0, Number(nowMs) - Number(startMs));
    const speed = Number.isFinite(PREVIEW_ANIMATION_SPEED_MULTIPLIER) && PREVIEW_ANIMATION_SPEED_MULTIPLIER > 0
        ? PREVIEW_ANIMATION_SPEED_MULTIPLIER
        : 1;
    return Math.max(0, Math.floor((elapsed / tickMs) * speed));
}

function getExEffectTickDivisor(layerKind, animation) {
    const folder = String(animation?.folder || '').trim().toLowerCase();
    const override = Number(PREVIEW_EX_EFFECT_TICK_DIVISOR_OVERRIDES?.[folder]);
    if (Number.isFinite(override) && override > 0) {
        return Math.max(1, Math.floor(override));
    }
    const baseDivisor = layerKind === 'foreground'
        ? Number(PREVIEW_EX_FOREGROUND_TICK_DIVISOR)
        : Number(PREVIEW_EX_BACKGROUND_TICK_DIVISOR);
    return Math.max(1, Math.floor(baseDivisor || 1));
}

function getExEffectSpeedMultiplier(layerKind, animation) {
    if (layerKind !== 'foreground') {
        return 1;
    }
    const folder = String(animation?.folder || '').trim().toLowerCase();
    const override = Number(PREVIEW_EX_EFFECT_SPEED_MULTIPLIER_OVERRIDES?.[folder]);
    if (Number.isFinite(override) && override > 0) {
        return override;
    }
    const base = Number(PREVIEW_EX_FOREGROUND_SPEED_MULTIPLIER);
    return Number.isFinite(base) && base > 0 ? base : 1;
}

function getExEffectPositionOffset(layerKind, animation) {
    if (layerKind !== 'foreground') {
        return { x: 0, y: 0 };
    }
    const folder = String(animation?.folder || '').trim().toLowerCase();
    const override = PREVIEW_EX_EFFECT_POSITION_OFFSETS?.[folder];
    if (!override || typeof override !== 'object') {
        return { x: 0, y: 0 };
    }
    const x = Number(override.x);
    const y = Number(override.y);
    return {
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0
    };
}

function shouldLockExEffectY(animation) {
    const folder = String(animation?.folder || '').trim().toLowerCase();
    return PREVIEW_EX_EFFECT_LOCK_Y_FOLDERS.has(folder);
}

function getExEffectFrameIndexByEpa(animation, frameCount, playbackStartMs, nowMs) {
    const sequence = Array.isArray(animation?.epaSequence) ? animation.epaSequence : null;
    const durations = Array.isArray(animation?.epaDurations) ? animation.epaDurations : null;
    if (!sequence || !durations || sequence.length === 0 || durations.length !== sequence.length) {
        return null;
    }
    if (frameCount <= 0) {
        return null;
    }

    const unitMs = Math.max(1, Number(PREVIEW_EX_EFFECT_EPA_DURATION_UNIT_MS) || 20);
    const startMs = Number(playbackStartMs);
    const currentMs = Number(nowMs);
    if (!Number.isFinite(startMs) || !Number.isFinite(currentMs)) {
        return null;
    }

    let totalUnits = 0;
    const normalizedDurations = durations.map((value) => {
        const parsed = Number(value);
        const unit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
        totalUnits += unit;
        return unit;
    });
    if (totalUnits <= 0) {
        return null;
    }

    const elapsedMs = Math.max(0, currentMs - startMs);
    const elapsedUnits = Math.floor(elapsedMs / unitMs);
    let cursor = ((elapsedUnits % totalUnits) + totalUnits) % totalUnits;
    for (let i = 0; i < normalizedDurations.length; i += 1) {
        const durationUnits = normalizedDurations[i];
        if (cursor < durationUnits) {
            const rawFrameIndex = Math.floor(Number(sequence[i]) || 0);
            return Math.max(0, Math.min(frameCount - 1, rawFrameIndex));
        }
        cursor -= durationUnits;
    }

    const rawTailFrame = Math.floor(Number(sequence[sequence.length - 1]) || 0);
    return Math.max(0, Math.min(frameCount - 1, rawTailFrame));
}

function getCssNumberValue(style, cssVariableName, fallbackValue) {
    const raw = String(style.getPropertyValue(cssVariableName) || '').trim();
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function getExLayerCssFrameOffsets(slotElement) {
    const style = window.getComputedStyle(slotElement);
    return {
        x: getCssNumberValue(style, '--ex-frame-offset-x', 0),
        y: getCssNumberValue(style, '--ex-frame-offset-y', 0)
    };
}

async function createAvatarPreviewAnimator(hostElement, userData, options = {}) {
    const isFemale = Number(userData?.gender) === 1;
    const requestedEffectVariant = String(options?.effectVariant || '').trim().toLowerCase();
    const effectVariant = requestedEffectVariant === 'legacy' ? 'legacy' : 'shop';
    const state = {
        tick: 0,
        timer: null,
        rafId: null,
        layerState: {},
        effectVariant,
        previewBackgroundItemId: null,
        previewForegroundItemId: null,
        previewBackgroundAnimation: null,
        previewForegroundAnimation: null,
        previewBackgroundPlaybackStartMs: null,
        previewForegroundPlaybackStartMs: null,
        previewBackgroundFrameSrc: null,
        previewForegroundFrameSrc: null,
        previewBackgroundRequestId: 0,
        previewForegroundRequestId: 0,
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

    const previewBackdrop = document.createElement('div');
    previewBackdrop.className = 'avatar-preview-backdrop';
    previewBackdrop.style.display = 'none';
    root.appendChild(previewBackdrop);
    const previewBackdropSprite = document.createElement('div');
    previewBackdropSprite.className = 'avatar-preview-backdrop-sprite';
    previewBackdrop.appendChild(previewBackdropSprite);

    const previewForeground = document.createElement('div');
    previewForeground.className = 'avatar-preview-foreground';
    previewForeground.style.display = 'none';
    root.appendChild(previewForeground);
    const previewForegroundSprite = document.createElement('div');
    previewForegroundSprite.className = 'avatar-preview-foreground-sprite';
    previewForeground.appendChild(previewForegroundSprite);

    const updatePreviewExtraLayerFrame = (layerKind, tick) => {
        const isBackground = layerKind === 'background';
        const targetLayerSlot = isBackground ? previewBackdrop : previewForeground;
        const targetLayerSprite = isBackground ? previewBackdropSprite : previewForegroundSprite;
        const animationKey = isBackground ? 'previewBackgroundAnimation' : 'previewForegroundAnimation';
        const playbackStartKey = isBackground ? 'previewBackgroundPlaybackStartMs' : 'previewForegroundPlaybackStartMs';
        const frameSrcKey = isBackground ? 'previewBackgroundFrameSrc' : 'previewForegroundFrameSrc';
        const slotRect = targetLayerSlot.getBoundingClientRect();
        const fallbackWidth = Math.max(1, Math.round(slotRect.width) || targetLayerSlot.clientWidth || 1);
        const fallbackHeight = Math.max(1, Math.round(slotRect.height) || targetLayerSlot.clientHeight || 1);
        const cssFrameOffset = getExLayerCssFrameOffsets(targetLayerSlot);
        const animation = state[animationKey];

        if (!animation || !Array.isArray(animation.frames) || animation.frames.length === 0) {
            state[frameSrcKey] = null;
            targetLayerSlot.style.display = 'none';
            targetLayerSprite.style.backgroundImage = '';
            targetLayerSprite.style.backgroundPosition = '';
            targetLayerSprite.style.transformOrigin = '';
            targetLayerSprite.style.transform = '';
            targetLayerSprite.style.left = '0px';
            targetLayerSprite.style.top = '0px';
            targetLayerSprite.style.width = `${fallbackWidth}px`;
            targetLayerSprite.style.height = `${fallbackHeight}px`;
            return;
        }

        const frameCount = Math.max(1, animation.frames.length);
        const nowMs = getNowMs();
        const playbackStartMs = state[playbackStartKey];
        let frameIndex = getExEffectFrameIndexByEpa(animation, frameCount, playbackStartMs, nowMs);
        if (!Number.isFinite(frameIndex)) {
            const normalizedTick = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
            const frameTickDivisor = getExEffectTickDivisor(layerKind, animation);
            const frameSpeedMultiplier = getExEffectSpeedMultiplier(layerKind, animation);
            const steps = Math.floor((normalizedTick / frameTickDivisor) * frameSpeedMultiplier);
            frameIndex = ((steps % frameCount) + frameCount) % frameCount;
        }

        const frame = animation.frames[frameIndex];
        if (!frame) {
            state[frameSrcKey] = null;
            targetLayerSlot.style.display = 'none';
            targetLayerSprite.style.backgroundImage = '';
            targetLayerSprite.style.backgroundPosition = '';
            targetLayerSprite.style.transformOrigin = '';
            targetLayerSprite.style.transform = '';
            targetLayerSprite.style.left = '0px';
            targetLayerSprite.style.top = '0px';
            targetLayerSprite.style.width = `${fallbackWidth}px`;
            targetLayerSprite.style.height = `${fallbackHeight}px`;
            return;
        }

        const imageUrl = String(animation.imageUrl || '');
        const frameWidth = Math.max(1, Number(frame.w) || fallbackWidth);
        const frameHeight = Math.max(1, Number(frame.h) || fallbackHeight);
        if (!imageUrl) {
            state[frameSrcKey] = null;
            targetLayerSlot.style.display = 'none';
            targetLayerSprite.style.backgroundImage = '';
            targetLayerSprite.style.backgroundPosition = '';
            targetLayerSprite.style.transformOrigin = '';
            targetLayerSprite.style.transform = '';
            targetLayerSprite.style.left = '0px';
            targetLayerSprite.style.top = '0px';
            targetLayerSprite.style.width = `${fallbackWidth}px`;
            targetLayerSprite.style.height = `${fallbackHeight}px`;
            return;
        }
        const frameCx = Number(frame.cx || 0);
        const frameCy = Number(frame.cy || 0);
        const frameOx = Number(frame.ox || 0);
        const frameOy = Number(frame.oy || 0);
        const animationOffsetX = Number(animation.offsetX || 0);
        const animationOffsetY = Number(animation.offsetY || 0);
        const effectOffsetX = Number(cssFrameOffset.x || 0);
        const effectOffsetY = Number(cssFrameOffset.y || 0);
        const effectPositionOffset = getExEffectPositionOffset(layerKind, animation);
        const layerLeft = Math.round(frameOx - frameCx + animationOffsetX + effectOffsetX + effectPositionOffset.x);
        let layerTop = Math.round(frameOy - frameCy + animationOffsetY + effectOffsetY + effectPositionOffset.y);
        if (shouldLockExEffectY(animation)) {
            const anchorFrame = Array.isArray(animation.frames) && animation.frames.length > 0
                ? animation.frames[0]
                : frame;
            const anchorCy = Number(anchorFrame?.cy || 0);
            const anchorOy = Number(anchorFrame?.oy || 0);
            layerTop = Math.round(anchorOy - anchorCy + animationOffsetY + effectOffsetY + effectPositionOffset.y);
        }
        if (state[frameSrcKey] !== imageUrl) {
            targetLayerSprite.style.backgroundImage = `url('${imageUrl}')`;
            state[frameSrcKey] = imageUrl;
        }
        targetLayerSprite.style.left = `${layerLeft}px`;
        targetLayerSprite.style.top = `${layerTop}px`;
        targetLayerSprite.style.width = `${frameWidth}px`;
        targetLayerSprite.style.height = `${frameHeight}px`;
        targetLayerSprite.style.backgroundPosition = `-${Number(frame.sx || 0)}px -${Number(frame.sy || 0)}px`;
        targetLayerSprite.style.transformOrigin = 'top left';
        targetLayerSprite.style.transform = '';
        targetLayerSlot.style.display = 'block';
    };

    const renderPreviewExtraLayers = (tick) => {
        updatePreviewExtraLayerFrame('background', tick);
        updatePreviewExtraLayerFrame('foreground', tick);
    };

    const applyPreviewExtraLayer = async (layerKind) => {
        const isBackground = layerKind === 'background';
        const requestKey = isBackground ? 'previewBackgroundRequestId' : 'previewForegroundRequestId';
        const targetLayerSlot = isBackground ? previewBackdrop : previewForeground;
        const targetLayerSprite = isBackground ? previewBackdropSprite : previewForegroundSprite;
        const targetItemId = isBackground ? state.previewBackgroundItemId : state.previewForegroundItemId;
        const animationKey = isBackground ? 'previewBackgroundAnimation' : 'previewForegroundAnimation';
        const playbackStartKey = isBackground ? 'previewBackgroundPlaybackStartMs' : 'previewForegroundPlaybackStartMs';
        const frameSrcKey = isBackground ? 'previewBackgroundFrameSrc' : 'previewForegroundFrameSrc';

        const currentRequest = state[requestKey] + 1;
        state[requestKey] = currentRequest;

        const itemId = Number(targetItemId);
        if (!Number.isFinite(itemId) || itemId <= 0) {
            state[animationKey] = null;
            state[playbackStartKey] = null;
            state[frameSrcKey] = null;
            targetLayerSlot.style.display = 'none';
            targetLayerSprite.style.backgroundImage = '';
            return;
        }

        try {
            // During live asset iteration, avoid stale folder/metadata resolution.
            // This guarantees shop preview re-resolves sf*/sb* atlases immediately.
            exEffectMetadataPromise = null;
            resolvedExEffectAnimationPromises.clear();
            resolvedExEffectAtlasAnimationPromises.clear();
            const animation = await resolveExEffectAnimation(itemId, layerKind, state.effectVariant);
            if (state[requestKey] !== currentRequest) {
                return;
            }
            if (!animation || !Array.isArray(animation.frames) || animation.frames.length === 0) {
                state[animationKey] = null;
                state[playbackStartKey] = null;
                state[frameSrcKey] = null;
                targetLayerSlot.style.display = 'none';
                targetLayerSprite.style.backgroundImage = '';
                return;
            }
            state[animationKey] = animation;
            state[playbackStartKey] = getNowMs();
            state[frameSrcKey] = null;
            renderPreviewExtraLayers(state.tick);
        } catch (error) {
            if (state[requestKey] !== currentRequest) {
                return;
            }
            state[animationKey] = null;
            state[playbackStartKey] = null;
            state[frameSrcKey] = null;
            targetLayerSlot.style.display = 'none';
            targetLayerSprite.style.backgroundImage = '';
        }
    };

    const applyEquipToState = (slot, itemId) => {
        if (slot === 'background') {
            state.previewBackgroundItemId = parseAvatarItemId(itemId, null, false);
            void applyPreviewExtraLayer('background');
            return;
        }
        if (slot === 'foreground') {
            state.previewForegroundItemId = parseAvatarItemId(itemId, null, false);
            void applyPreviewExtraLayer('foreground');
            return;
        }
        if (slot === 'exitem') {
            // Power-user style EX items are non-visual in preview.
            return;
        }
        if (!['head', 'body', 'eyes', 'flag'].includes(slot)) return;
        if (slot === 'eyes' || slot === 'flag') {
            state.avatar[slot] = parseAvatarItemId(itemId, null, false);
            return;
        }
        state.avatar[slot] = parseAvatarItemId(itemId, 0, true);
    };

    const testRuntime = await tryCreateTestRuntime(root, state);
    if (testRuntime) {
        const tickMs = AVATAR_ANIMATION_TICK_MS;
        const timerStartMs = getNowMs();
        let renderInFlight = false;
        let pendingTick = null;
        let lastRenderedTick = -1;
        const runRender = async (targetTick) => {
            renderInFlight = true;
            try {
                await testRuntime.render(targetTick);
                lastRenderedTick = targetTick;
            } catch (error) {
                    console.warn('[AvatarPreview] Test runtime render error:', error);
            } finally {
                renderInFlight = false;
                if (Number.isFinite(pendingTick) && pendingTick !== lastRenderedTick) {
                    const queuedTick = pendingTick;
                    pendingTick = null;
                    state.tick = queuedTick;
                    void runRender(queuedTick);
                }
            }
        };
        const renderTick = async () => {
            const currentTick = getPreviewAnimationTick(getNowMs(), timerStartMs, tickMs);
            if (currentTick !== lastRenderedTick) {
                state.tick = currentTick;
                if (renderInFlight) {
                    pendingTick = currentTick;
                } else {
                    void runRender(currentTick);
                }
            }
            renderPreviewExtraLayers(state.tick);
            state.rafId = window.requestAnimationFrame(renderTick);
        };
        state.rafId = window.requestAnimationFrame(renderTick);

        return {
            setEquip(slot, itemId) {
                applyEquipToState(slot, itemId);
            },
            setGender(genderValue) {
                state.avatar.gender = Number(genderValue) === 1 || genderValue === 'f' ? 'f' : 'm';
            },
            destroy() {
                if (state.timer) {
                    window.clearInterval(state.timer);
                }
                if (state.rafId) {
                    window.cancelAnimationFrame(state.rafId);
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

    const tickMs = AVATAR_ANIMATION_TICK_MS;
    const timerStartMs = getNowMs();
    let lastRenderedTick = -1;
    const renderLoop = () => {
        const currentTick = getPreviewAnimationTick(getNowMs(), timerStartMs, tickMs);
        if (currentTick !== lastRenderedTick) {
            renderAvatarTick(currentTick);
            lastRenderedTick = currentTick;
        }
        renderPreviewExtraLayers(state.tick);
        state.rafId = window.requestAnimationFrame(renderLoop);
    };
    state.rafId = window.requestAnimationFrame(renderLoop);

    function renderAvatarTick(currentTick) {
        state.tick = Number.isFinite(currentTick) ? currentTick : 0;
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

    }

    return {
        setEquip(slot, itemId) {
            applyEquipToState(slot, itemId);
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
            if (state.rafId) {
                window.cancelAnimationFrame(state.rafId);
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
        const cycleBase = noReverse
            ? Math.max(1, frameCount)
            : Math.max(1, frameCount - 2);
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

function toExEffectSourceAvatarId(itemId) {
    const parsed = Number(itemId);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }
    const normalized = Math.floor(parsed);
    if (normalized >= 204800) {
        return normalized;
    }
    return 204800 + normalized;
}

function buildExEffectFolderCandidates(sourceAvatarId, layerKind, effectVariant) {
    const normalized = Number(sourceAvatarId);
    if (!Number.isFinite(normalized) || normalized <= 0) {
        return [];
    }

    const id = Math.floor(normalized);
    const normalizedLayer = layerKind === 'foreground' ? 'foreground' : 'background';
    const useLegacyOnly = String(effectVariant || '').trim().toLowerCase() === 'legacy';
    const candidates = useLegacyOnly
        ? (
            normalizedLayer === 'foreground'
                ? [`f${id}`, `b${id}`]
                : [`b${id}`, `f${id}`]
        )
        : (
            normalizedLayer === 'foreground'
                ? [`sf${id}`, `f${id}`, `sb${id}`, `b${id}`]
                : [`sb${id}`, `b${id}`, `sf${id}`, `f${id}`]
        );
    return [...new Set(candidates)];
}

async function resolveExEffectAtlasAnimationByFolder(folderCode) {
    const normalized = String(folderCode || '').trim().toLowerCase();
    if (!normalized) {
        return null;
    }

    if (!resolvedExEffectAtlasAnimationPromises.has(normalized)) {
        resolvedExEffectAtlasAnimationPromises.set(normalized, (async () => {
            try {
                const metadata = await loadExEffectMetadata();
                const atlases = metadata?.atlases;
                if (!atlases || typeof atlases !== 'object') {
                    return null;
                }

                const atlasDef = atlases[normalized]
                    || atlases[`fx_${normalized}`]
                    || null;
                if (!atlasDef || !atlasDef.image) {
                    return null;
                }

                const imageUrl = String(atlasDef.image || '');
                if (!imageUrl) {
                    return null;
                }

                await preloadImage(imageUrl);
                const frames = expandAtlasFrames(atlasDef);
                if (!Array.isArray(frames) || frames.length === 0) {
                    return null;
                }

                return {
                    mode: 'atlas',
                    folder: normalized,
                    imageUrl,
                    frameDurationMs: Number(atlasDef?.frame_duration_ms) || null,
                    offsetX: Number(atlasDef?.offset_x) || 0,
                    offsetY: Number(atlasDef?.offset_y) || 0,
                    epaSequence: Array.isArray(atlasDef?.epa_sequence) ? atlasDef.epa_sequence : null,
                    epaDurations: Array.isArray(atlasDef?.epa_durations) ? atlasDef.epa_durations : null,
                    frames
                };
            } catch (error) {
                return null;
            }
        })());
    }

    return resolvedExEffectAtlasAnimationPromises.get(normalized);
}

async function resolveExEffectAnimation(itemId, layerKind, effectVariant) {
    const normalizedLayer = layerKind === 'foreground' ? 'foreground' : 'background';
    const sourceAvatarId = toExEffectSourceAvatarId(itemId);
    if (!sourceAvatarId) {
        return null;
    }

    const normalizedVariant = String(effectVariant || '').trim().toLowerCase() === 'legacy'
        ? 'legacy'
        : 'shop';
    const cacheKey = `${normalizedVariant}|${normalizedLayer}|${sourceAvatarId}`;
    if (!resolvedExEffectAnimationPromises.has(cacheKey)) {
        resolvedExEffectAnimationPromises.set(cacheKey, (async () => {
            const folderCandidates = buildExEffectFolderCandidates(sourceAvatarId, normalizedLayer, normalizedVariant);
            for (const folderCode of folderCandidates) {
                const atlasAnimation = await resolveExEffectAtlasAnimationByFolder(folderCode);
                if (atlasAnimation && Array.isArray(atlasAnimation.frames) && atlasAnimation.frames.length > 0) {
                    return atlasAnimation;
                }
            }
            return null;
        })());
    }

    return resolvedExEffectAnimationPromises.get(cacheKey);
}

let atlasMetadataPromise = null;
let exEffectMetadataPromise = null;
const preloadedImagePromises = new Map();
const resolvedAtlasImagePromises = new Map();
const resolvedExEffectAnimationPromises = new Map();
const resolvedExEffectAtlasAnimationPromises = new Map();

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
        console.warn('[AvatarPreview] Atlas runtime disabled (fallback to layered):', error);
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
        console.warn('[AvatarPreview] Default sheet runtime disabled (fallback to layered):', error);
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
        console.warn('[AvatarPreview] DragonBound test runtime disabled (fallback to layered):', error);
        return null;
    }
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function toLayerKey(slot, back) {
    return `${slot}:${back ? 'back' : 'front'}`;
}


window.AvatarPreviewRuntime = Object.freeze({
    createAnimator: createAvatarPreviewAnimator
});
})();

