document.addEventListener('DOMContentLoaded', () => {
    const ui = window.GBTH?.ui;
    const buddyUi = window.GBTH?.buddy;
    const socket = io();

    const userData = JSON.parse(sessionStorage.getItem('user') || 'null');
    const roomConfig = JSON.parse(sessionStorage.getItem('gbth_pending_room') || 'null') || {};
    const selectedServerName = String(sessionStorage.getItem('gbth_selected_server_name') || '').trim();
    const roomKey = String(roomConfig?.roomKey || roomConfig?.createdAt || roomConfig?.title || userData?.id || '').trim();

    const roomTitleEl = document.getElementById('game-room-room-title');
    const roomNumberEl = document.getElementById('game-room-room-number');
    const gameRoomPasswordPanel = document.getElementById('game-room-password-panel');
    const gameRoomPasswordText = document.getElementById('game-room-password-text');
    const btnEditRoomTitle = document.getElementById('btn-game-room-edit-title');
    const serverTitleEl = document.getElementById('game-room-server-title');
    const gameRoomScreen = document.getElementById('game-room-screen');
    const mapPanelEl = document.getElementById('game-room-map-panel');
    const mapCardEl = document.getElementById('game-room-map-card');
    const mobilePreviewEl = document.getElementById('game-room-mobile-preview');
    const gameRoomChattingPanel = document.getElementById('game-room-chatting-panel');
    const roomChatFeedEl = document.getElementById('game-room-chat-feed');
    const btnGameRoomChatScrollUp = document.getElementById('btn-game-room-chat-scroll-up');
    const btnGameRoomChatScrollDown = document.getElementById('btn-game-room-chat-scroll-down');
    const btnGameRoomChatting = document.getElementById('btn-game-room-chatting');
    const roomChatInput = document.getElementById('game-room-chat-input');
    const roomChatCursor = document.getElementById('game-room-chat-cursor');
    const roomChatGhostSpan = document.getElementById('game-room-chat-input-ghost');
    const buddyPanel = document.getElementById('buddy-list-panel');
    const buddyListContent = document.querySelector('#buddy-list-panel .buddy-list-content');
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
    const gameRoomTitlePopup = document.getElementById('game-room-title-popup');
    const gameRoomTitleInput = document.getElementById('game-room-title-input');
    const gameRoomTitleCursor = document.getElementById('game-room-title-cursor');
    const gameRoomTitleGhostSpan = document.getElementById('game-room-title-input-ghost');
    const btnGameRoomTitleOk = document.getElementById('btn-game-room-title-ok');
    const btnGameRoomTitleCancel = document.getElementById('btn-game-room-title-cancel');
    const buddyChatWindow = document.getElementById('buddy-chat-window');
    const buddyChatInput = document.getElementById('buddy-chat-input');
    const buddyChatCursor = document.getElementById('buddy-chat-cursor');
    const buddyChatGhostSpan = document.getElementById('buddy-chat-input-ghost');
    const buddyChatNickname = document.getElementById('buddy-chat-nickname');
    const buddyChatMessages = document.getElementById('buddy-chat-messages');
    const buddyChatContent = document.querySelector('.buddy-chat-content');
    const btnBuddyChatClose = document.getElementById('btn-buddy-chat-close');

    const errorPopup = ui?.createErrorPopupController({
        overlay: document.getElementById('error-overlay'),
        title: document.getElementById('error-title'),
        message: document.getElementById('error-message'),
        confirmButton: document.getElementById('error-confirm-btn')
    });

    function showError(title, message) {
        errorPopup?.show(title, message);
    }

    function appendRoomChatMessage(data) {
        if (!roomChatFeedEl) return;
        const typeClass = String(data?.type || 'user').trim() || 'user';
        const colorClass = String(data?.color || '').trim();
        const nickname = String(data?.nickname || '').trim();
        const message = String(data?.message || '').trim();
        if (!message) return;
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${typeClass}${colorClass ? ` ${colorClass}` : ''}`;
        if (typeClass === 'broadcast') {
            const icon = String(data?.icon || '').trim();
            const iconHtml = icon ? `<img src="/assets/shared/icon/${icon}.png" class="gm-chat-icon">` : '';
            msgDiv.innerHTML = `${iconHtml}${message}`;
        } else if (typeClass === 'system') {
            msgDiv.textContent = message;
        } else {
            if (!nickname) return;
            const guild = String(data?.guild || '').trim();
            const guildHtml = guild ? `<span class="chat-guild">${guild}</span>` : '';
            msgDiv.innerHTML = `${guildHtml}<span class="nickname">${nickname}]</span> ${message}`;
        }

        const isAtBottom = roomChatFeedEl.scrollHeight - roomChatFeedEl.scrollTop <= roomChatFeedEl.clientHeight + 40;
        roomChatFeedEl.appendChild(msgDiv);
        while (roomChatFeedEl.childElementCount > 120) {
            roomChatFeedEl.removeChild(roomChatFeedEl.firstElementChild);
        }
        if (isAtBottom) {
            roomChatFeedEl.scrollTop = roomChatFeedEl.scrollHeight;
        }
        window.setTimeout(() => roomChatScroll?.update(), 20);
    }

    function appendRoomSystemMessage(message, color = 'yellow') {
        if (!roomChatFeedEl) return;
        const text = String(message || '').trim();
        if (!text) return;
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message system ${String(color || '').trim()}`.trim();
        msgDiv.textContent = text;
        roomChatFeedEl.appendChild(msgDiv);
        roomChatFeedEl.scrollTop = roomChatFeedEl.scrollHeight;
        window.setTimeout(() => roomChatScroll?.update(), 20);
    }

    const buddyScroll = ui?.setupScrollControls({
        viewport: buddyListContent,
        upButton: document.querySelector('#buddy-list-panel .btn-buddy-scroll-up'),
        downButton: document.querySelector('#buddy-list-panel .btn-buddy-scroll-down'),
        scrollAmount: 30
    });

    const buddyChatScroll = ui?.setupScrollControls({
        viewport: buddyChatContent,
        upButton: document.querySelector('.buddy-chat-scroll-up'),
        downButton: document.querySelector('.buddy-chat-scroll-down'),
        scrollAmount: 30
    });

    const roomChatScroll = ui?.setupScrollControls({
        viewport: roomChatFeedEl,
        upButton: btnGameRoomChatScrollUp,
        downButton: btnGameRoomChatScrollDown,
        scrollAmount: 28
    });

    const addBuddyCursorController = ui?.setupInputCursor({
        input: addBuddyInput,
        cursor: addBuddyCursor,
        ghost: addBuddyGhostSpan,
        baseLeft: 5,
        baseTop: 4,
        useInputOffset: true
    });

    const roomChatCursorController = ui?.setupInputCursor({
        input: roomChatInput,
        cursor: roomChatCursor,
        ghost: roomChatGhostSpan,
        baseLeft: 77
    });

    const buddyChatCursorController = ui?.setupInputCursor({
        input: buddyChatInput,
        cursor: buddyChatCursor,
        ghost: buddyChatGhostSpan,
        baseLeft: 0
    });

    const gameRoomTitleCursorController = ui?.setupInputCursor({
        input: gameRoomTitleInput,
        cursor: gameRoomTitleCursor,
        ghost: gameRoomTitleGhostSpan,
        baseLeft: 6,
        baseTop: 2,
        useInputOffset: true
    });

    if (buddyPanel) {
        ui?.makeDraggable(buddyPanel);
    }
    if (addBuddyPopup) {
        ui?.makeDraggable(addBuddyPopup);
    }
    if (buddyAlertPopup) {
        ui?.makeDraggable(buddyAlertPopup);
    }
    if (buddyChatWindow) {
        ui?.makeDraggable(buddyChatWindow);
    }
    if (gameRoomTitlePopup) {
        ui?.makeDraggable(gameRoomTitlePopup, { handleSelector: '.game-room-title-popup-header' });
    }

    function centerGameRoomPopup(element, offsetX = 0, offsetY = 0) {
        if (!element) return;
        ui?.centerInContainer?.({
            element,
            container: document.getElementById('game-container'),
            offsetX,
            offsetY
        });
    }

    function showAddBuddyPopup({ resetInput = true } = {}) {
        if (!addBuddyPopup) return;
        addBuddyPopup.classList.remove('hidden');
        centerGameRoomPopup(addBuddyPopup);
        if (addBuddyInput) {
            if (resetInput) {
                addBuddyInput.value = '';
            }
            addBuddyInput.focus();
            addBuddyCursorController?.update();
        }
    }

    function hideRoomTitlePopup() {
        if (!gameRoomTitlePopup) return;
        gameRoomTitlePopup.classList.add('hidden');
    }

    function showRoomTitlePopup() {
        if (!gameRoomTitlePopup || !gameRoomTitleInput) return;
        if (!isRoomMaster) return;
        gameRoomTitlePopup.classList.remove('hidden');
        centerGameRoomPopup(gameRoomTitlePopup);
        gameRoomTitleInput.placeholder = 'Title Name';
        gameRoomTitleInput.value = String(roomConfig.title || roomTitleEl?.textContent || '').trim();
        gameRoomTitleInput.focus();
        gameRoomTitleInput.select();
        gameRoomTitleCursorController?.update();
    }

    function submitRoomTitleChange() {
        if (!isRoomMaster) return;
        const nextTitle = String(gameRoomTitleInput?.value || '').trim();
        if (!nextTitle) {
            hideRoomTitlePopup();
            return;
        }
        roomConfig.title = nextTitle;
        persistRoomConfig();
        syncRoomMetadataToLobby();
        if (roomTitleEl) {
            roomTitleEl.textContent = nextTitle;
        }
        hideRoomTitlePopup();
    }

    let currentAlertCallbacks = { onYes: null, onNo: null };
    function showBuddyAlert(message, options = {}) {
        const { showNoButton = false, onYes = null, onNo = null } = options;
        if (!buddyAlertPopup || !buddyAlertTextBox || !btnBuddyAlertYes || !btnBuddyAlertNo) return;

        buddyAlertTextBox.textContent = String(message || '');
        buddyAlertPopup.classList.remove('hidden');
        currentAlertCallbacks = { onYes, onNo };
        centerGameRoomPopup(buddyAlertPopup);

        if (showNoButton) {
            btnBuddyAlertNo.classList.remove('hidden');
            btnBuddyAlertYes.style.left = '64px';
            btnBuddyAlertNo.style.left = '128px';
        } else {
            btnBuddyAlertNo.classList.add('hidden');
            btnBuddyAlertYes.style.left = '128px';
        }
    }

    function appendBuddyChatMessage(sender, message) {
        if (!buddyChatMessages) return;
        const safeSender = String(sender || '').trim();
        const safeMessage = String(message || '').trim();
        if (!safeSender || !safeMessage) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'buddy-chat-msg';
        msgDiv.innerHTML = `<span class="sender">${safeSender}]</span> ${safeMessage}`;
        buddyChatMessages.appendChild(msgDiv);

        if (buddyChatContent) {
            buddyChatContent.scrollTop = buddyChatContent.scrollHeight;
        }
        window.setTimeout(() => buddyChatScroll?.update(), 50);
    }

    window.openBuddyChat = function openBuddyChat(nickname) {
        const safeNickname = String(nickname || '').trim();
        if (!safeNickname || !buddyChatWindow) return;
        if (userData && String(userData.nickname || '').toLowerCase() === safeNickname.toLowerCase()) return;

        if (buddyChatMessages) {
            buddyChatMessages.innerHTML = '';
        }
        buddyChatNickname.textContent = safeNickname;
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

    buddyUi?.bindInteractions({
        listContent: buddyListContent,
        onOpenChat: (nickname) => window.openBuddyChat?.(nickname)
    });

    const fallbackTitle = userData?.nickname ? `${userData.nickname}'s Room` : 'Room';
    let isRoomMaster = false;
    let isLocalReady = false;
    let roomMemberCount = 1;
    let isLeavingGameRoom = false;
    if (roomNumberEl) {
        roomNumberEl.textContent = '';
    }
    if (roomTitleEl) {
        roomTitleEl.textContent = String(roomConfig.title || fallbackTitle);
    }

    const ROOM_PASSWORD_MAX_LEN = 4;

    function normalizeRoomPassword(value) {
        return String(value || '').trim().slice(0, ROOM_PASSWORD_MAX_LEN);
    }

    function updateGameRoomPasswordPanel() {
        if (!gameRoomPasswordPanel || !gameRoomPasswordText) return;
        const pwd = normalizeRoomPassword(roomConfig?.password);
        const show = pwd.length > 0;
        gameRoomPasswordPanel.classList.toggle('hidden', !show);
        gameRoomPasswordPanel.setAttribute('aria-hidden', show ? 'false' : 'true');
        gameRoomPasswordText.textContent = pwd;
    }

    roomConfig.password = normalizeRoomPassword(roomConfig?.password);
    updateGameRoomPasswordPanel();

    if (serverTitleEl) {
        const label = selectedServerName || 'Server name';
        serverTitleEl.textContent = `${label} - Gunbound Classic`;
    }

    const MAP_FRAME_COUNT = 22;
    const MAP_SIDE_FRAME_COUNT = 11;
    const MAP_SIDE_A_START = 0;
    const MAP_SIDE_B_START = 11;
    let selectedMapSide = String(roomConfig?.mapSide || 'A').trim().toUpperCase() === 'B' ? 'B' : 'A';
    let selectedMapIndex = Math.trunc(Number(roomConfig?.mapIndex));
    if (!Number.isFinite(selectedMapIndex) || selectedMapIndex < 0 || selectedMapIndex >= MAP_FRAME_COUNT) {
        selectedMapIndex = selectedMapSide === 'B' ? MAP_SIDE_B_START : MAP_SIDE_A_START;
    }
    const TEAM_SIZE_MIN = 1;
    const TEAM_SIZE_MAX = 4;
    const slotElementsByTeam = {
        A: [1, 2, 3, 4].map((value) => document.getElementById(`game-room-slot-a${value}`)).filter(Boolean),
        B: [1, 2, 3, 4].map((value) => document.getElementById(`game-room-slot-b${value}`)).filter(Boolean)
    };

    function insertNicknameIntoRoomChatInput(nickname) {
        if (!roomChatInput) return;
        const safeNickname = String(nickname || '').trim();
        if (!safeNickname) return;
        const currentValue = String(roomChatInput.value || '');
        const nextValue = currentValue.trim()
            ? `${currentValue}${currentValue.endsWith(' ') ? '' : ' '}${safeNickname} `
            : `${safeNickname} `;
        roomChatInput.value = nextValue;
        roomChatInput.focus();
        const caretPosition = nextValue.length;
        if (typeof roomChatInput.setSelectionRange === 'function') {
            roomChatInput.setSelectionRange(caretPosition, caretPosition);
        }
        roomChatCursorController?.update();
    }

    function bindSlotNicknameClickToChatInput() {
        const allSlots = [
            ...(slotElementsByTeam.A || []),
            ...(slotElementsByTeam.B || [])
        ];
        allSlots.forEach((slot) => {
            if (!slot) return;
            if (String(slot.dataset.chatNicknameBinding || '') === '1') return;
            slot.dataset.chatNicknameBinding = '1';
            slot.addEventListener('click', () => {
                if (isLeavingGameRoom) return;
                const nickname = String(slot.dataset.nickname || '').trim();
                if (!nickname) return;
                insertNicknameIntoRoomChatInput(nickname);
            });
        });
    }
    bindSlotNicknameClickToChatInput();
    let currentTeamSize = Math.max(
        TEAM_SIZE_MIN,
        Math.min(TEAM_SIZE_MAX, Math.trunc(Number(roomConfig?.teamSize || 4)))
    );
    const GAME_MODE_ORDER = ['solo', 'score', 'tag', 'jewel'];
    let currentGameMode = String(roomConfig?.mode || 'solo').trim().toLowerCase();
    if (!GAME_MODE_ORDER.includes(currentGameMode)) {
        currentGameMode = 'solo';
    }
    const BOMB_MODE_ORDER = ['basic', 'attack'];
    let currentBombMode = String(roomConfig?.bombMode || 'basic').trim().toLowerCase();
    if (!BOMB_MODE_ORDER.includes(currentBombMode)) {
        currentBombMode = 'basic';
    }
    const BIGBOMB_MODE_ORDER = ['bigbomb', 'ssdeath', 'nodeath'];
    let currentBigBombMode = String(roomConfig?.bigbombMode || roomConfig?.bigBombMode || 'bigbomb').trim().toLowerCase();
    if (currentBigBombMode === 'bigbombdeath') {
        currentBigBombMode = 'bigbomb';
    }
    if (!BIGBOMB_MODE_ORDER.includes(currentBigBombMode)) {
        currentBigBombMode = 'bigbomb';
    }
    const DEATH_MODE_ORDER = ['death56', 'death72', 'death40'];
    let currentDeathMode = String(roomConfig?.deathMode || 'death56').trim().toLowerCase();
    if (!DEATH_MODE_ORDER.includes(currentDeathMode)) {
        currentDeathMode = 'death56';
    }

    function getMapCardPath(index) {
        const safeIndex = Math.max(0, Math.min(MAP_FRAME_COUNT - 1, Math.trunc(Number(index) || 0)));
        return `/assets/screens/game_room/ready_selectmap/ready_selectmap_frame_${safeIndex}.png`;
    }

    function persistRoomConfig() {
        if (roomConfig.password !== undefined && roomConfig.password !== null) {
            roomConfig.password = normalizeRoomPassword(roomConfig.password);
        }
        sessionStorage.setItem('gbth_pending_room', JSON.stringify(roomConfig));
    }

    function getMapStartForSide(mapSide) {
        return mapSide === 'B' ? MAP_SIDE_B_START : MAP_SIDE_A_START;
    }

    function mapIndexForSide(index, mapSide) {
        const start = getMapStartForSide(mapSide);
        const raw = Math.trunc(Number(index));
        const fallback = start;
        if (!Number.isFinite(raw) || raw < 0 || raw >= MAP_FRAME_COUNT) {
            return fallback;
        }
        if (mapSide === 'A') {
            return raw >= MAP_SIDE_B_START ? raw - MAP_SIDE_FRAME_COUNT : raw;
        }
        return raw < MAP_SIDE_B_START ? raw + MAP_SIDE_FRAME_COUNT : raw;
    }

    function setMapSideButtonVisual(mapSide) {
        const sideButton = document.getElementById('btn-game-room-aside');
        if (!sideButton) return;
        sideButton.dataset.mapSide = mapSide === 'B' ? 'B' : 'A';
    }

    function renderMapCard() {
        if (!mapCardEl) return;
        selectedMapIndex = mapIndexForSide(selectedMapIndex, selectedMapSide);
        mapCardEl.style.backgroundImage = `url('${getMapCardPath(selectedMapIndex)}')`;
        roomConfig.mapSide = selectedMapSide;
        roomConfig.mapIndex = selectedMapIndex;
        setMapSideButtonVisual(selectedMapSide);
        persistRoomConfig();
        syncRoomMetadataToLobby();
    }

    function cycleMapBy(delta) {
        if (!isRoomMaster) return;
        const start = getMapStartForSide(selectedMapSide);
        const relative = selectedMapIndex - start;
        const nextRelative = (relative + delta + MAP_SIDE_FRAME_COUNT) % MAP_SIDE_FRAME_COUNT;
        selectedMapIndex = start + nextRelative;
        renderMapCard();
    }

    function moveMapByDirection(directionKey) {
        if (directionKey === 'ArrowLeft' || directionKey === 'ArrowUp') {
            cycleMapBy(-1);
            return;
        }
        if (directionKey === 'ArrowRight' || directionKey === 'ArrowDown') {
            cycleMapBy(1);
        }
    }

    function toggleMapSide() {
        if (!isRoomMaster) return;
        selectedMapSide = selectedMapSide === 'A' ? 'B' : 'A';
        selectedMapIndex = mapIndexForSide(selectedMapIndex, selectedMapSide);
        renderMapCard();
    }

    function setTeamSizeButtonVisual(teamSize) {
        const teamButton = document.getElementById('btn-game-room-4v4');
        if (!teamButton) return;
        teamButton.dataset.teamSize = String(teamSize);
    }

    function setGameModeButtonVisual(mode) {
        const modeButton = document.getElementById('btn-game-room-solo');
        if (!modeButton) return;
        modeButton.dataset.gameMode = GAME_MODE_ORDER.includes(mode) ? mode : 'solo';
    }

    function setBombModeButtonVisual(mode) {
        const bombButton = document.getElementById('btn-game-room-basic');
        if (!bombButton) return;
        bombButton.dataset.bombMode = BOMB_MODE_ORDER.includes(mode) ? mode : 'basic';
    }

    function setBigBombModeButtonVisual(mode) {
        const bigBombButton = document.getElementById('btn-game-room-bigbomb');
        if (!bigBombButton) return;
        bigBombButton.dataset.bigbombMode = BIGBOMB_MODE_ORDER.includes(mode) ? mode : 'bigbomb';
    }

    function setDeathModeButtonVisual(mode) {
        const deathButton = document.getElementById('btn-game-room-death56');
        if (!deathButton) return;
        deathButton.dataset.deathMode = DEATH_MODE_ORDER.includes(mode) ? mode : 'death56';
    }

    function syncRoomMetadataToLobby() {
        if (!isRoomMaster) return;
        socket.emit('update_game_room_metadata', {
            roomKey: roomKey || roomConfig.roomKey || `room:${userData?.id || ''}`,
            title: String(roomConfig?.title || roomTitleEl?.textContent || '').trim(),
            mode: String(roomConfig?.mode || currentGameMode || 'solo').trim().toLowerCase(),
            bigbombMode: String(roomConfig?.bigbombMode || currentBigBombMode || 'bigbomb').trim().toLowerCase(),
            bombMode: String(roomConfig?.bombMode || currentBombMode || 'basic').trim().toLowerCase(),
            deathMode: String(roomConfig?.deathMode || currentDeathMode || 'death56').trim().toLowerCase(),
            teamSize: Math.max(1, Math.trunc(Number(roomConfig?.teamSize || currentTeamSize || 4))),
            slotLabel: String(roomConfig?.slotLabel || `${currentTeamSize}v${currentTeamSize}`).trim(),
            mapSide: selectedMapSide === 'B' ? 'B' : 'A',
            mapIndex: Math.max(0, Math.min(MAP_FRAME_COUNT - 1, Math.trunc(Number(selectedMapIndex || 0))))
        });
    }

    function isSlotOccupied(slotElement) {
        if (!slotElement) return false;
        if (String(slotElement.dataset.occupied || '') === '1') return true;
        if (String(slotElement.dataset.userId || '').trim()) return true;
        if (slotElement.querySelector('[data-slot-player], .game-room-player, .avatar-preview-root, img, canvas')) return true;
        return false;
    }

    function hasOccupiedSlotsBeyondSize(teamSize) {
        const targetSize = Math.max(TEAM_SIZE_MIN, Math.min(TEAM_SIZE_MAX, Math.trunc(Number(teamSize) || TEAM_SIZE_MAX)));
        const teams = ['A', 'B'];
        for (const team of teams) {
            const slots = slotElementsByTeam[team] || [];
            for (let index = targetSize; index < slots.length; index += 1) {
                if (isSlotOccupied(slots[index])) {
                    return true;
                }
            }
        }
        return false;
    }

    function applyTeamSizeLayout(teamSize) {
        const nextSize = Math.max(TEAM_SIZE_MIN, Math.min(TEAM_SIZE_MAX, Math.trunc(Number(teamSize) || TEAM_SIZE_MAX)));
        currentTeamSize = nextSize;

        const teams = ['A', 'B'];
        for (const team of teams) {
            const slots = slotElementsByTeam[team] || [];
            slots.forEach((slot, index) => {
                if (!slot) return;
                slot.style.display = index < nextSize ? '' : 'none';
            });
        }

        setTeamSizeButtonVisual(nextSize);
        roomConfig.teamSize = nextSize;
        roomConfig.slotLabel = `${nextSize}v${nextSize}`;
        persistRoomConfig();
        syncRoomMetadataToLobby();
        updateMapControlPermissions();
    }

    function getNextTeamSize() {
        return currentTeamSize >= TEAM_SIZE_MAX ? TEAM_SIZE_MIN : currentTeamSize + 1;
    }

    function validateTeamSizeChange(nextSize) {
        const isDownsizing = nextSize < currentTeamSize;
        const targetCapacity = nextSize * 2;

        if (!isDownsizing) {
            return { ok: true, message: '' };
        }
        if (roomMemberCount > targetCapacity) {
            return {
                ok: false,
                message: `Cannot change to ${nextSize}:${nextSize}. Room has ${roomMemberCount} players.`
            };
        }
        if (hasOccupiedSlotsBeyondSize(nextSize)) {
            return {
                ok: false,
                message: `Cannot change to ${nextSize}:${nextSize} while removed slots have players.`
            };
        }

        return { ok: true, message: '' };
    }

    function cycleTeamSize() {
        if (!isRoomMaster) return;
        const nextSize = getNextTeamSize();
        const validation = validateTeamSizeChange(nextSize);
        if (!validation.ok) {
            showError('Room', validation.message);
            updateMapControlPermissions();
            return;
        }

        applyTeamSizeLayout(nextSize);
    }

    function applyGameMode(mode) {
        currentGameMode = GAME_MODE_ORDER.includes(mode) ? mode : 'solo';
        setGameModeButtonVisual(currentGameMode);
        roomConfig.mode = currentGameMode;
        persistRoomConfig();
        syncRoomMetadataToLobby();
        updateMapControlPermissions();
    }

    function getNextGameMode(mode) {
        const normalized = GAME_MODE_ORDER.includes(mode) ? mode : 'solo';
        const index = GAME_MODE_ORDER.indexOf(normalized);
        return GAME_MODE_ORDER[(index + 1) % GAME_MODE_ORDER.length];
    }

    function cycleGameMode() {
        if (!isRoomMaster) return;
        applyGameMode(getNextGameMode(currentGameMode));
    }

    function applyBigBombMode(mode) {
        currentBigBombMode = BIGBOMB_MODE_ORDER.includes(mode) ? mode : 'bigbomb';
        setBigBombModeButtonVisual(currentBigBombMode);
        roomConfig.bigbombMode = currentBigBombMode;
        persistRoomConfig();
        syncRoomMetadataToLobby();
        updateMapControlPermissions();
    }

    function getNextBigBombMode(mode) {
        const normalized = BIGBOMB_MODE_ORDER.includes(mode) ? mode : 'bigbomb';
        const index = BIGBOMB_MODE_ORDER.indexOf(normalized);
        return BIGBOMB_MODE_ORDER[(index + 1) % BIGBOMB_MODE_ORDER.length];
    }

    function cycleBigBombMode() {
        if (!isRoomMaster) return;
        applyBigBombMode(getNextBigBombMode(currentBigBombMode));
    }

    function applyBombMode(mode) {
        currentBombMode = BOMB_MODE_ORDER.includes(mode) ? mode : 'basic';
        setBombModeButtonVisual(currentBombMode);
        roomConfig.bombMode = currentBombMode;
        persistRoomConfig();
        syncRoomMetadataToLobby();
        updateMapControlPermissions();
    }

    function getNextBombMode(mode) {
        const normalized = BOMB_MODE_ORDER.includes(mode) ? mode : 'basic';
        const index = BOMB_MODE_ORDER.indexOf(normalized);
        return BOMB_MODE_ORDER[(index + 1) % BOMB_MODE_ORDER.length];
    }

    function cycleBombMode() {
        if (!isRoomMaster) return;
        applyBombMode(getNextBombMode(currentBombMode));
    }

    function applyDeathMode(mode) {
        currentDeathMode = DEATH_MODE_ORDER.includes(mode) ? mode : 'death56';
        setDeathModeButtonVisual(currentDeathMode);
        roomConfig.deathMode = currentDeathMode;
        persistRoomConfig();
        syncRoomMetadataToLobby();
        updateMapControlPermissions();
    }

    function getNextDeathMode(mode) {
        const normalized = DEATH_MODE_ORDER.includes(mode) ? mode : 'death56';
        const index = DEATH_MODE_ORDER.indexOf(normalized);
        return DEATH_MODE_ORDER[(index + 1) % DEATH_MODE_ORDER.length];
    }

    function cycleDeathMode() {
        if (!isRoomMaster) return;
        applyDeathMode(getNextDeathMode(currentDeathMode));
    }

    renderMapCard();

    if (userData) {
        const initialMobileIndex = Math.trunc(Number(roomConfig?.mobileIndex || 15));
        const storedJoinPassword = normalizeRoomPassword(roomConfig?.password);
        const presencePayload = {
            nickname: userData.nickname,
            id: userData.id,
            gender: userData.gender,
            grade: userData.grade || 24,
            guild: userData.guild || '',
            authority: userData.authority || 0,
            location: 'game_room',
            roomKey: roomKey || roomConfig.roomKey || `room:${userData.id}`,
            roomTitle: String(roomConfig?.title || '').trim(),
            mode: String(roomConfig?.mode || '').trim(),
            teamSize: Math.max(1, Math.trunc(Number(roomConfig?.teamSize || 4))),
            slotLabel: String(roomConfig?.slotLabel || '').trim(),
            mapSide: String(roomConfig?.mapSide || 'A').trim().toUpperCase() === 'B' ? 'B' : 'A',
            mapIndex: Math.max(0, Math.min(MAP_FRAME_COUNT - 1, Math.trunc(Number(roomConfig?.mapIndex || 0)))),
            mobileIndex: Number.isFinite(initialMobileIndex) ? initialMobileIndex : 15
        };
        if (storedJoinPassword !== '') {
            presencePayload.password = storedJoinPassword;
        }
        socket.emit('set_user_data', presencePayload);
        appendRoomSystemMessage('Room successfuly created', 'yellow');
    }

    socket.on('buddy_list_data', (data) => {
        if (onlineCountEl) onlineCountEl.textContent = String(data?.onlineCount ?? 0);
        if (totalCountEl) totalCountEl.textContent = String(data?.totalCount ?? 0);
        buddyUi?.renderList(buddyListContent, data?.buddies || [], { includeIdDataset: true });
        window.setTimeout(() => buddyScroll?.update(), 50);
    });

    socket.on('game_room_message', (data) => {
        if (isLeavingGameRoom) return;
        appendRoomChatMessage(data);
        const nickname = String(data?.nickname || '').trim();
        const message = String(data?.message || '').trim();
        if (!nickname || !message) return;
        showSlotSpeechBubbleByNickname(nickname, message, data?.poweruser === true);
    });

    socket.on('game_room_presence', (data) => {
        if (isLeavingGameRoom) return;
        const roomId = Math.trunc(Number(data?.roomId || 0));
        const teamSizeFromServer = Math.max(1, Math.trunc(Number(data?.teamSize || currentTeamSize || 4)));
        const assignedSlotIndex = Math.trunc(Number(data?.roomSlotIndex));
        isRoomMaster = Boolean(data?.isMaster);
        roomMemberCount = Math.max(1, Math.trunc(Number(data?.memberCount || 1)));
        preferredJoinSlotIndex = Number.isFinite(assignedSlotIndex) ? assignedSlotIndex : -1;
        if (teamSizeFromServer !== currentTeamSize) {
            applyTeamSizeLayout(teamSizeFromServer);
        }
        const preferredSlot = getSlotByAssignedIndex(preferredJoinSlotIndex);
        if (preferredSlot) {
            preferredSlot.style.display = '';
        }
        if (preferredSlot && localPlayerSlot && preferredSlot !== localPlayerSlot) {
            clearRemotePlayerFromSlot(preferredSlot);
            if (!moveLocalPlayerToSlot(preferredSlot)) {
                destroySlotAvatar();
                renderSlotAvatar(preferredSlot, userData);
            } else {
                startMobileAnimation(selectedMobile);
            }
        }
        if (!localPlayerSlot && userData) {
            const slot = findPlayerSlot();
            if (slot) {
                renderSlotAvatar(slot, userData);
            }
        }
        updateLocalSlotMasterKeyIcon();
        updateMapControlPermissions();
        if (roomNumberEl) {
            roomNumberEl.textContent = String(roomId > 0 ? roomId : 1);
        }
    });

    socket.on('game_room_roster', (payload) => {
        if (isLeavingGameRoom) return;
        applyGameRoomRoster(payload);
    });

    socket.on('game_room_config', (payload) => {
        if (isLeavingGameRoom) return;
        const title = String(payload?.title || '').trim();
        if (title && roomTitleEl) {
            roomTitleEl.textContent = title;
            roomConfig.title = title;
        }
        const mode = String(payload?.mode || '').trim().toLowerCase();
        if (mode) {
            applyGameMode(mode);
        }
        const bigbombMode = String(payload?.bigbombMode || '').trim().toLowerCase();
        if (bigbombMode) {
            applyBigBombMode(bigbombMode);
        }
        const bombMode = String(payload?.bombMode || '').trim().toLowerCase();
        if (bombMode) {
            applyBombMode(bombMode);
        }
        const deathMode = String(payload?.deathMode || '').trim().toLowerCase();
        if (deathMode) {
            applyDeathMode(deathMode);
        }
        const nextTeamSize = Math.trunc(Number(payload?.teamSize));
        if (Number.isFinite(nextTeamSize) && nextTeamSize > 0) {
            applyTeamSizeLayout(nextTeamSize);
        }
        const mapSide = String(payload?.mapSide || '').trim().toUpperCase();
        if (mapSide === 'A' || mapSide === 'B') {
            selectedMapSide = mapSide;
        }
        const mapIndex = Math.trunc(Number(payload?.mapIndex));
        if (Number.isFinite(mapIndex)) {
            selectedMapIndex = Math.max(0, Math.min(MAP_FRAME_COUNT - 1, mapIndex));
        }
        if (Object.prototype.hasOwnProperty.call(payload || {}, 'password')) {
            const nextPwd = normalizeRoomPassword(payload.password);
            const hasPw = Boolean(payload?.hasPassword);
            roomConfig.password = hasPw && nextPwd !== '' ? nextPwd : '';
            persistRoomConfig();
        }
        updateGameRoomPasswordPanel();
        renderMapCard();
    });

    socket.on('game_room_latency', (payload) => {
        if (isLeavingGameRoom) return;
        const userId = String(payload?.userId || '').trim();
        if (!userId) return;
        const localUserId = String(userData?.id || '').trim();
        const latencyMs = Math.trunc(Number(payload?.latencyMs));
        if (userId === localUserId) {
            setSlotLatencyLabelText(formatLatencyLabel(latencyMs));
            return;
        }
        setRemoteSlotLatencyLabel(userId, latencyMs);
    });

    socket.on('game_room_error', (data) => {
        const message = String(data?.message || 'Room action failed.');
        showError('Room', message);
    });

    socket.on('incoming_buddy_request', (data) => {
        showBuddyAlert(`'${data.fromNickname}' Is trying to enter on your buddy list, Do you accept?`, {
            showNoButton: true,
            onYes: () => socket.emit('respond_buddy_request', { fromNickname: data.fromNickname, fromId: data.fromId, accepted: true }),
            onNo: () => socket.emit('respond_buddy_request', { fromNickname: data.fromNickname, fromId: data.fromId, accepted: false })
        });
    });

    socket.on('buddy_request_sent', (data) => {
        const nickname = String(data?.nickname || '').trim();
        if (!nickname) return;
        showBuddyAlert(`You trying to add ${nickname} to the buddy list, wait for an answer.`);
        addBuddyPopup?.classList.add('hidden');
    });

    socket.on('buddy_request_error', (data) => {
        const message = String(data?.message || 'Unable to send buddy request.');
        showBuddyAlert(message);
        if (addBuddyPopup && addBuddyPopup.classList.contains('hidden')) {
            showAddBuddyPopup({ resetInput: false });
        }
        if (addBuddyInput) {
            addBuddyInput.focus();
            addBuddyCursorController?.update();
        }
    });

    socket.on('buddy_request_accepted', (data) => {
        showBuddyAlert(`'${data.nickname}' has accepted your buddy request.`);
    });

    socket.on('buddy_request_rejected', (data) => {
        showBuddyAlert(`'${data.nickname}' has rejected your buddy request.`);
    });

    socket.on('private_message', (data) => {
        const fromNickname = String(data?.fromNickname || '').trim();
        const message = String(data?.message || '').trim();
        if (!fromNickname || !message) return;
        window.openBuddyChat?.(fromNickname);
        appendBuddyChatMessage(fromNickname, message);
    });

    function requestBuddyList() {
        if (!userData?.id) return;
        socket.emit('get_buddy_list');
    }

    function clearAllReadyBadges() {
        const allSlots = [
            ...(slotElementsByTeam.A || []),
            ...(slotElementsByTeam.B || [])
        ];
        allSlots.forEach((slot) => {
            if (!slot) return;
            const badge = slot.querySelector('.slot-ready-badge');
            if (badge) badge.remove();
        });
    }

    function applySlotReadyBadge(slot, isMasterUser, isReadyUser) {
        if (!slot) return;
        const badge = document.createElement('img');
        badge.className = 'slot-ready-badge';
        const teamDefaultFrame = slot.classList.contains('team-b') ? 4 : 3;
        const frame = (!isMasterUser && isReadyUser) ? 6 : teamDefaultFrame;
        badge.alt = '';
        badge.draggable = false;
        badge.src = `/assets/screens/game_room/ready_back/ready_back_frame_${frame}.png`;
        slot.appendChild(badge);
    }

    function updateReadyBadgesFromRoster(players) {
        clearAllReadyBadges();
        (players || []).forEach((player) => {
            const slotIndex = Math.trunc(Number(player?.slotIndex));
            const slot = getSlotByAssignedIndex(slotIndex);
            if (!slot) return;
            applySlotReadyBadge(slot, Boolean(player?.isMaster), Boolean(player?.isReady));
        });
    }

    function updateMapControlPermissions() {
        const disabled = !isRoomMaster;
        const prevButton = document.getElementById('btn-game-room-map-prev');
        const nextButton = document.getElementById('btn-game-room-map-next');
        const modeButton = document.getElementById('btn-game-room-solo');
        const bigBombModeButton = document.getElementById('btn-game-room-bigbomb');
        const bombModeButton = document.getElementById('btn-game-room-basic');
        const deathModeButton = document.getElementById('btn-game-room-death56');
        const teamSizeButton = document.getElementById('btn-game-room-4v4');
        const mapSideButton = document.getElementById('btn-game-room-aside');
        const editTitleButton = document.getElementById('btn-game-room-edit-title');
        const startButton = document.getElementById('btn-game-room-start');
        if (prevButton) {
            prevButton.disabled = disabled;
        }
        if (nextButton) {
            nextButton.disabled = disabled;
        }
        if (modeButton) {
            modeButton.disabled = disabled;
        }
        if (bigBombModeButton) {
            bigBombModeButton.disabled = disabled;
        }
        if (bombModeButton) {
            bombModeButton.disabled = disabled;
        }
        if (deathModeButton) {
            deathModeButton.disabled = disabled || currentBigBombMode === 'nodeath';
        }
        if (teamSizeButton) {
            const nextSize = getNextTeamSize();
            const validation = validateTeamSizeChange(nextSize);
            teamSizeButton.disabled = disabled || !validation.ok;
        }
        if (mapSideButton) {
            mapSideButton.disabled = disabled;
        }
        if (editTitleButton) {
            editTitleButton.disabled = disabled;
            editTitleButton.classList.toggle('hidden', disabled);
        }
        if (disabled && gameRoomTitlePopup && !gameRoomTitlePopup.classList.contains('hidden')) {
            hideRoomTitlePopup();
        }
        if (startButton) {
            const nonMasterReadyMode = !isRoomMaster;
            startButton.classList.toggle('ready-mode', nonMasterReadyMode);
        }
    }

    function nudgeMapPanel(deltaX, deltaY) {
        if (!mapPanelEl) return;
        const parent = mapPanelEl.offsetParent || document.getElementById('game-room-screen');
        const parentWidth = Number(parent?.clientWidth || 800);
        const parentHeight = Number(parent?.clientHeight || 600);
        const panelWidth = Number(mapPanelEl.offsetWidth || 136);
        const panelHeight = Number(mapPanelEl.offsetHeight || 84);

        const nextLeft = Math.max(0, Math.min(parentWidth - panelWidth, mapPanelEl.offsetLeft + deltaX));
        const nextTop = Math.max(0, Math.min(parentHeight - panelHeight, mapPanelEl.offsetTop + deltaY));
        mapPanelEl.style.left = `${nextLeft}px`;
        mapPanelEl.style.top = `${nextTop}px`;
    }

    function toggleBuddyPanel() {
        if (!buddyPanel) return;

        const isHidden = buddyPanel.classList.contains('hidden');
        if (isHidden) {
            buddyPanel.style.top = '';
            buddyPanel.style.left = '';
            buddyUi?.clearSelection(buddyListContent);
            requestBuddyList();
        }

        buddyPanel.classList.toggle('hidden');
        window.setTimeout(() => buddyScroll?.update(), 50);
    }

    window.toggleBuddyList = toggleBuddyPanel;

    const btnMapPrev = document.getElementById('btn-game-room-map-prev');
    const btnMapNext = document.getElementById('btn-game-room-map-next');
    const btnGameMode = document.getElementById('btn-game-room-solo');
    const btnBigBombMode = document.getElementById('btn-game-room-bigbomb');
    const btnTeamSize = document.getElementById('btn-game-room-4v4');
    const btnMapSide = document.getElementById('btn-game-room-aside');
    const btnBombMode = document.getElementById('btn-game-room-basic');
    const btnDeathMode = document.getElementById('btn-game-room-death56');

    if (btnMapPrev) {
        btnMapPrev.addEventListener('click', () => {
            cycleMapBy(-1);
        });
    }

    if (btnMapNext) {
        btnMapNext.addEventListener('click', () => {
            cycleMapBy(1);
        });
    }

    if (btnGameMode) {
        btnGameMode.addEventListener('click', () => {
            cycleGameMode();
        });
    }

    if (btnBigBombMode) {
        btnBigBombMode.addEventListener('click', () => {
            cycleBigBombMode();
        });
    }

    if (btnTeamSize) {
        btnTeamSize.addEventListener('click', () => {
            cycleTeamSize();
        });
    }

    if (btnMapSide) {
        btnMapSide.addEventListener('click', () => {
            toggleMapSide();
        });
    }

    if (btnBombMode) {
        btnBombMode.addEventListener('click', () => {
            cycleBombMode();
        });
    }

    if (btnDeathMode) {
        btnDeathMode.addEventListener('click', () => {
            cycleDeathMode();
        });
    }

    if (btnEditRoomTitle) {
        btnEditRoomTitle.addEventListener('click', () => {
            showRoomTitlePopup();
        });
    }

    if (btnGameRoomTitleOk) {
        btnGameRoomTitleOk.addEventListener('click', () => {
            submitRoomTitleChange();
        });
    }

    if (btnGameRoomTitleCancel) {
        btnGameRoomTitleCancel.addEventListener('click', () => {
            hideRoomTitlePopup();
        });
    }

    if (gameRoomTitleInput) {
        gameRoomTitleInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                submitRoomTitleChange();
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                hideRoomTitlePopup();
            }
        });
    }

    applyGameMode(currentGameMode);
    applyBigBombMode(currentBigBombMode);
    applyBombMode(currentBombMode);
    applyDeathMode(currentDeathMode);
    applyTeamSizeLayout(currentTeamSize);
    updateMapControlPermissions();

    const mobileGrid = document.getElementById('game-room-mobile-grid');
    const mobileButtons = [];

    /* ── Slot Avatar + Animated Mobile State ── */
    const MOBILE_FRAME_COUNT = 20;
    const RIDER_FRAME_COUNT = 12;
    const MOBILE_ANIMATION_FPS = 8;
    const MOBILE_ANIMATION_INTERVAL = Math.floor(1000 / MOBILE_ANIMATION_FPS);
    const MOBILE_SELECTION_MIN = 1;
    const MOBILE_BUTTON_COUNT = 15;
    const DEFAULT_SELECTION_TO_ASSET = {
        1: 1,
        2: 2,
        3: 3,
        4: 4,
        5: 5,
        6: 6,
        7: 7,
        8: 8,
        9: 9,
        10: 10,
        11: 11,
        12: 12,
        13: 13,
        14: 16, // Aduka
        15: 0   // Random -> Rider
    };
    const RIDER_ASSET_INDEX = 0;
    const mobilePoseConfig = window.GBTH_MOBILE_POSE_CONFIG || {};
    const SELECTION_TO_ASSET = Object.assign({}, DEFAULT_SELECTION_TO_ASSET, mobilePoseConfig.selectionToAsset || {});
    const MOBILE_SELECTION_MAX = Math.max(
        MOBILE_SELECTION_MIN,
        ...Object.keys(SELECTION_TO_ASSET).map((key) => Math.trunc(Number(key))).filter(Number.isFinite)
    );
    const MOBILE_ASSET_POSE = mobilePoseConfig.assets || {};
    const MOBILE_FRAME_ANCHOR_DELTAS = mobilePoseConfig.frameAnchorDeltas || {};
    const USE_MOBILE_FRAME_ANCHOR_DELTAS = mobilePoseConfig.useFrameAnchorDeltas === true;
    const AVATAR_SYNC_CONFIG = mobilePoseConfig.avatarSync || {};
    const AVATAR_SYNC_ENABLED = AVATAR_SYNC_CONFIG.enabled !== false;
    const AVATAR_SYNC_REFERENCE_OFFSET = {
        x: Number.isFinite(Number(AVATAR_SYNC_CONFIG?.referenceMobileOffset?.x))
            ? Math.trunc(Number(AVATAR_SYNC_CONFIG.referenceMobileOffset.x))
            : -35,
        y: Number.isFinite(Number(AVATAR_SYNC_CONFIG?.referenceMobileOffset?.y))
            ? Math.trunc(Number(AVATAR_SYNC_CONFIG.referenceMobileOffset.y))
            : -30
    };
    const AVATAR_SYNC_X_FACTOR = Number.isFinite(Number(AVATAR_SYNC_CONFIG.xFactor))
        ? Number(AVATAR_SYNC_CONFIG.xFactor)
        : 1;
    const AVATAR_SYNC_Y_FACTOR = Number.isFinite(Number(AVATAR_SYNC_CONFIG.yFactor))
        ? Number(AVATAR_SYNC_CONFIG.yFactor)
        : 1;
    const AVATAR_SYNC_MAX_DELTA_X = Number.isFinite(Number(AVATAR_SYNC_CONFIG.maxDeltaX))
        ? Math.max(0, Math.trunc(Number(AVATAR_SYNC_CONFIG.maxDeltaX)))
        : 999;
    const AVATAR_SYNC_MAX_DELTA_Y = Number.isFinite(Number(AVATAR_SYNC_CONFIG.maxDeltaY))
        ? Math.max(0, Math.trunc(Number(AVATAR_SYNC_CONFIG.maxDeltaY)))
        : 999;
    const AVATAR_SYNC_DISABLED_ASSETS = new Set(
        Array.isArray(AVATAR_SYNC_CONFIG.disabledAssets)
            ? AVATAR_SYNC_CONFIG.disabledAssets
                .map((value) => Math.trunc(Number(value)))
                .filter(Number.isFinite)
            : []
    );
    const AVATAR_FRAME_SEAT_DELTA_DISABLED_ASSETS = new Set(
        Array.isArray(AVATAR_SYNC_CONFIG.frameSeatDeltaDisabledAssets)
            ? AVATAR_SYNC_CONFIG.frameSeatDeltaDisabledAssets
                .map((value) => Math.trunc(Number(value)))
                .filter(Number.isFinite)
            : []
    );
    const AVATAR_SEAT_ADJUST_BY_ASSET = AVATAR_SYNC_CONFIG.seatAdjustByAsset || mobilePoseConfig.avatarSeatAdjustByAsset || {};
    const AVATAR_SEAT_ADJUST_BY_ASSET_TEAM_B = AVATAR_SYNC_CONFIG.seatAdjustByAssetTeamB || mobilePoseConfig.avatarSeatAdjustByAssetTeamB || {};
    const ROOM_MASTER_KEY_ICON_PATH = '/assets/screens/game_room/ready_back/ready_back_frame_7.png';
    const POWER_USER_EXITEM_IDS = new Set([204801, 204802, 204803, 204804, 204831, 204832, 204833, 204834, 204835]);
    const POWER_USER_READY_BACKGROUND_FRAMES = [0, 1, 2, 3, 4, 5];
    const SLOT_BUBBLE_MIN_DURATION_MS = 10000;
    const SLOT_BUBBLE_MAX_DURATION_MS = 24000;
    const SLOT_BUBBLE_MS_PER_CHAR = 160;
    const SLOT_BUBBLE_RESTORE_MIN_DURATION_MS = 5000;
    const DEFAULT_JOIN_MOBILE_INDEX = 15;
    let selectedMobile = Math.trunc(Number(roomConfig?.mobileIndex));
    if (selectedMobile === 0) selectedMobile = DEFAULT_JOIN_MOBILE_INDEX;
    if (!Number.isFinite(selectedMobile) || selectedMobile < MOBILE_SELECTION_MIN || selectedMobile > MOBILE_SELECTION_MAX) {
        selectedMobile = DEFAULT_JOIN_MOBILE_INDEX;
    }

    let slotAvatarAnimator = null;
    let slotMobileAnimationTimer = null;
    let slotMobileCurrentFrame = 0;
    let slotMobileIndex = 0;
    let slotMobileImgEl = null;
    let slotAvatarContainerEl = null;
    let localPlayerKeyIconEl = null;
    let slotFxBackdropHostEl = null;
    let slotFxForegroundHostEl = null;
    let slotPowerUserFallbackBgEl = null;
    let slotPowerUserFallbackFrame = null;
    let slotLatencyLabelEl = null;
    let slotLatencyTimer = null;
    let slotLatencyProbeSeq = 0;
    let slotMobileBaseOffsetX = -35;
    let slotMobileBaseOffsetY = -30;
    let slotAvatarDynamicSeatX = 0;
    let slotAvatarDynamicSeatY = 0;
    let localPlayerSlot = null;
    let preferredJoinSlotIndex = -1;
    const remotePlayerIdsBySlot = new Map();
    const remoteAvatarAnimatorsBySlot = new Map();
    const remoteMobileAnimationBySlot = new Map();
    const remoteLatencyLabelByUserId = new Map();
    const slotSpeechBubbleHideTimers = new WeakMap();
    const activeSlotSpeechBubblesByNickname = new Map();

    function isLocalPlayerInTeamB() {
        return !!localPlayerSlot?.classList?.contains('team-b');
    }

    function normalizeMobileSelectionIndex(mobileIndex) {
        const normalized = Math.trunc(Number(mobileIndex));
        if (normalized === 0) return DEFAULT_JOIN_MOBILE_INDEX;
        if (!Number.isFinite(normalized) || normalized < MOBILE_SELECTION_MIN || normalized > MOBILE_SELECTION_MAX) {
            return DEFAULT_JOIN_MOBILE_INDEX;
        }
        return normalized;
    }

    function getRenderedMobileAssetIndex(selectionIndex) {
        const selectedIndex = normalizeMobileSelectionIndex(selectionIndex);
        const mappedAsset = Math.trunc(Number(SELECTION_TO_ASSET[selectedIndex]));
        if (Number.isFinite(mappedAsset) && mappedAsset >= 0) {
            return mappedAsset;
        }
        return selectedIndex;
    }

    function getButtonIndexFromSelection(selectionIndex) {
        const normalizedSelection = normalizeMobileSelectionIndex(selectionIndex);
        return Math.max(MOBILE_SELECTION_MIN, Math.min(MOBILE_BUTTON_COUNT, normalizedSelection));
    }

    function getMobileFramePathForAsset(assetIndex, frame) {
        const normalizedAsset = Math.trunc(Number(assetIndex));
        if (normalizedAsset === RIDER_ASSET_INDEX) {
            return `/assets/screens/game_room/mobiles/rider/frame_${frame}.png`;
        }
        return `/assets/screens/game_room/mobiles/tank${normalizedAsset}/frame_${frame}.png`;
    }

    function getMobileFrameCountForAsset(assetIndex) {
        return Math.trunc(Number(assetIndex)) === RIDER_ASSET_INDEX
            ? RIDER_FRAME_COUNT
            : MOBILE_FRAME_COUNT;
    }

    function getMobileBaseOffsetForAsset(assetIndex, teamBOverride = null) {
        const isTeamB = typeof teamBOverride === 'boolean' ? teamBOverride : isLocalPlayerInTeamB();
        const pose = MOBILE_ASSET_POSE[Math.trunc(Number(assetIndex))] || {};
        const mobileOffset = (isTeamB && pose.mobileOffsetTeamB)
            ? pose.mobileOffsetTeamB
            : (pose.mobileOffset || {});
        return {
            x: Number.isFinite(Number(mobileOffset.x)) ? Math.trunc(Number(mobileOffset.x)) : -35,
            y: Number.isFinite(Number(mobileOffset.y)) ? Math.trunc(Number(mobileOffset.y)) : -30
        };
    }

    function getAvatarSeatAdjustForAsset(assetIndex, teamBOverride = null) {
        const normalizedAssetIndex = Math.trunc(Number(assetIndex));
        const isTeamB = typeof teamBOverride === 'boolean' ? teamBOverride : isLocalPlayerInTeamB();
        const pose = MOBILE_ASSET_POSE[normalizedAssetIndex] || {};
        // Prefer per-asset seatAdjust in the same list as mobile/avatar offsets.
        const teamBAdjust = pose.seatAdjustTeamB || AVATAR_SEAT_ADJUST_BY_ASSET_TEAM_B[normalizedAssetIndex] || null;
        const adjust = isTeamB
            ? (teamBAdjust || pose.seatAdjust || AVATAR_SEAT_ADJUST_BY_ASSET[normalizedAssetIndex] || {})
            : (pose.seatAdjust || AVATAR_SEAT_ADJUST_BY_ASSET[normalizedAssetIndex] || {});
        return {
            left: Number.isFinite(Number(adjust.left)) ? Math.trunc(Number(adjust.left)) : 0,
            bottom: Number.isFinite(Number(adjust.bottom)) ? Math.trunc(Number(adjust.bottom)) : 0
        };
    }

    function computeAvatarPlacementForAsset(assetIndex, teamBOverride = null, dynamicSeatX = 0, dynamicSeatY = 0) {
        const isTeamB = typeof teamBOverride === 'boolean' ? teamBOverride : isLocalPlayerInTeamB();
        const normalizedAssetIndex = Math.trunc(Number(assetIndex));
        const pose = MOBILE_ASSET_POSE[normalizedAssetIndex] || {};
        const useReferenceAvatarOffset = AVATAR_SYNC_CONFIG.useReferenceAvatarOffset === true;
        const referencePose = MOBILE_ASSET_POSE[RIDER_ASSET_INDEX] || {};
        const avatarOffset = useReferenceAvatarOffset
            ? ((isTeamB && referencePose.avatarOffsetTeamB) ? referencePose.avatarOffsetTeamB : (referencePose.avatarOffset || {}))
            : ((isTeamB && pose.avatarOffsetTeamB) ? pose.avatarOffsetTeamB : (pose.avatarOffset || {}));
        let avatarBottom = Number.isFinite(Number(avatarOffset.bottom)) ? Math.trunc(Number(avatarOffset.bottom)) : 20;
        let avatarLeft = Number.isFinite(Number(avatarOffset.left)) ? Math.trunc(Number(avatarOffset.left)) : 0;
        if (AVATAR_SYNC_ENABLED && !AVATAR_SYNC_DISABLED_ASSETS.has(normalizedAssetIndex)) {
            const mobileOffset = getMobileBaseOffsetForAsset(normalizedAssetIndex, isTeamB);
            const syncX = (mobileOffset.x - AVATAR_SYNC_REFERENCE_OFFSET.x) * AVATAR_SYNC_X_FACTOR;
            const syncY = (mobileOffset.y - AVATAR_SYNC_REFERENCE_OFFSET.y) * AVATAR_SYNC_Y_FACTOR;
            const clampedSyncX = Math.max(-AVATAR_SYNC_MAX_DELTA_X, Math.min(AVATAR_SYNC_MAX_DELTA_X, Math.trunc(syncX)));
            const clampedSyncY = Math.max(-AVATAR_SYNC_MAX_DELTA_Y, Math.min(AVATAR_SYNC_MAX_DELTA_Y, Math.trunc(syncY)));
            avatarLeft += clampedSyncX;
            avatarBottom += clampedSyncY;
        }
        const seatAdjust = getAvatarSeatAdjustForAsset(normalizedAssetIndex, isTeamB);
        avatarLeft += seatAdjust.left;
        avatarBottom += seatAdjust.bottom;
        avatarLeft += Math.trunc(Number(dynamicSeatX) || 0);
        avatarBottom += Math.trunc(Number(dynamicSeatY) || 0);
        return { left: avatarLeft, bottom: avatarBottom };
    }

    function applyAvatarPlacementForMobile(assetIndex) {
        if (!slotAvatarContainerEl) return;
        const placement = computeAvatarPlacementForAsset(assetIndex, null, slotAvatarDynamicSeatX, slotAvatarDynamicSeatY);
        slotAvatarContainerEl.style.bottom = `${placement.bottom}px`;
        slotAvatarContainerEl.style.left = `calc(50% + ${placement.left}px)`;
    }

    function getMobileFrameAnchorDelta(assetIndex, frame) {
        if (!USE_MOBILE_FRAME_ANCHOR_DELTAS) {
            return { x: 0, y: 0 };
        }
        const assetKey = Math.trunc(Number(assetIndex));
        const deltas = MOBILE_FRAME_ANCHOR_DELTAS[assetKey];
        if (!Array.isArray(deltas) || deltas.length === 0) {
            return { x: 0, y: 0 };
        }
        const index = Math.max(0, Math.trunc(Number(frame))) % deltas.length;
        const pair = deltas[index];
        if (!Array.isArray(pair) || pair.length < 2) {
            return { x: 0, y: 0 };
        }
        const dx = Number(pair[0]);
        const dy = Number(pair[1]);
        return {
            x: Number.isFinite(dx) ? Math.trunc(dx) : 0,
            y: Number.isFinite(dy) ? Math.trunc(dy) : 0
        };
    }

    function getMobileFrameSeatDelta(assetIndex, frame) {
        const assetKey = Math.trunc(Number(assetIndex));
        if (AVATAR_FRAME_SEAT_DELTA_DISABLED_ASSETS.has(assetKey)) {
            return { x: 0, y: 0 };
        }
        const deltas = MOBILE_FRAME_ANCHOR_DELTAS[assetKey];
        if (!Array.isArray(deltas) || deltas.length === 0) {
            return { x: 0, y: 0 };
        }
        const index = Math.max(0, Math.trunc(Number(frame))) % deltas.length;
        const pair = deltas[index];
        if (!Array.isArray(pair) || pair.length < 2) {
            return { x: 0, y: 0 };
        }
        const dx = Number(pair[0]);
        const dy = Number(pair[1]);
        return {
            x: Number.isFinite(dx) ? Math.trunc(dx) : 0,
            y: Number.isFinite(dy) ? Math.trunc(dy) : 0
        };
    }

    function applyMobileFramePose() {
        if (!slotMobileImgEl) return;
        slotMobileImgEl.src = getMobileFramePathForAsset(slotMobileIndex, slotMobileCurrentFrame);
        const mobileDelta = getMobileFrameAnchorDelta(slotMobileIndex, slotMobileCurrentFrame);
        slotMobileImgEl.style.marginLeft = `${slotMobileBaseOffsetX + mobileDelta.x}px`;
        slotMobileImgEl.style.marginBottom = `${slotMobileBaseOffsetY + mobileDelta.y}px`;
        // Client behavior couples avatar seat to mobile frame hold spot.
        // We only apply dynamic X to avoid reintroducing prior Y wobble regressions.
        const seatDelta = getMobileFrameSeatDelta(slotMobileIndex, slotMobileCurrentFrame);
        slotAvatarDynamicSeatX = seatDelta.x;
        slotAvatarDynamicSeatY = 0;
        applyAvatarPlacementForMobile(slotMobileIndex);
    }

    function getMobileTransformForAsset() {
        const isTeamA = !!localPlayerSlot?.classList?.contains('team-a');
        const scaleX = isTeamA ? -1 : 1;
        return `translateX(-50%) scaleX(${scaleX})`;
    }

    function resolveRankIconPathByGrade(gradeValue) {
        const parsedGrade = Math.trunc(Number(gradeValue));
        const safeGrade = Number.isFinite(parsedGrade) && parsedGrade >= 0 ? parsedGrade : 24;
        return `/assets/shared/rank1/rank1_frame_${safeGrade}.png`;
    }

    function resolveGuildSlotStats(user) {
        const rank = Math.trunc(Number(user?.guildrank));
        const total = Math.trunc(Number(user?.membercount));

        return {
            rank: Number.isFinite(rank) && rank > 0 ? rank : null,
            total: Number.isFinite(total) && total > 0 ? total : null
        };
    }

    function updateLocalSlotMasterKeyIcon() {
        if (!localPlayerKeyIconEl) return;
        localPlayerKeyIconEl.classList.toggle('hidden', !isRoomMaster);
    }

    function hasEquippedAvatarBackground(user) {
        const backgroundId = Math.trunc(Number(user?.abackground));
        return Number.isFinite(backgroundId) && backgroundId > 0;
    }

    function hasPowerUserEquipped(user) {
        if (user?.poweruser === true) return true;
        const exitemId = Math.trunc(Number(user?.aexitem));
        if (Number.isFinite(exitemId) && POWER_USER_EXITEM_IDS.has(exitemId)) return true;
        return false;
    }

    function sanitizeSlotBubbleMessage(message) {
        return String(message || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 140);
    }

    function getBubbleNicknameKey(nickname) {
        return String(nickname || '').trim().toLowerCase();
    }

    function getAllRoomSlots() {
        return [
            ...(slotElementsByTeam.A || []),
            ...(slotElementsByTeam.B || [])
        ];
    }

    function clearSlotSpeechBubbleTimer(slot) {
        if (!slot) return;
        const prevTimer = slotSpeechBubbleHideTimers.get(slot);
        if (prevTimer) {
            window.clearTimeout(prevTimer);
            slotSpeechBubbleHideTimers.delete(slot);
        }
    }

    function hideSlotSpeechBubble(slot) {
        if (!slot) return;
        clearSlotSpeechBubbleTimer(slot);
        const bubbleEl = slot.querySelector('.slot-textballoon');
        if (!bubbleEl) return;
        bubbleEl.classList.remove('visible');
    }

    function getSlotSpeechBubbleElement(slot) {
        if (!slot) return null;
        let bubbleEl = slot.querySelector('.slot-textballoon');
        if (bubbleEl) return bubbleEl;

        bubbleEl = document.createElement('div');
        bubbleEl.className = 'slot-textballoon';

        const bodyEl = document.createElement('div');
        bodyEl.className = 'slot-textballoon-body';
        bubbleEl.appendChild(bodyEl);

        const textEl = document.createElement('div');
        textEl.className = 'slot-textballoon-text';
        bodyEl.appendChild(textEl);

        const tailEl = document.createElement('div');
        tailEl.className = 'slot-textballoon-tail';
        bubbleEl.appendChild(tailEl);

        slot.appendChild(bubbleEl);
        return bubbleEl;
    }

    function applySlotSpeechBubbleTheme(bubbleEl, isPowerUser) {
        if (!bubbleEl) return;
        bubbleEl.classList.toggle('power-user', Boolean(isPowerUser));
    }

    function resolveSlotByNickname(nickname) {
        const normalizedNickname = String(nickname || '').trim().toLowerCase();
        if (!normalizedNickname) return null;
        const allSlots = getAllRoomSlots();
        for (let index = 0; index < allSlots.length; index += 1) {
            const slot = allSlots[index];
            if (!slot) continue;
            const slotNickname = String(slot.dataset.nickname || '').trim().toLowerCase();
            if (slotNickname && slotNickname === normalizedNickname) {
                return slot;
            }
        }
        return null;
    }

    function setSlotOccupantDataset(slot, user) {
        if (!slot || !user) return;
        const userId = String(user.id || '').trim();
        const nickname = String(user.nickname || '').trim();
        const isPowerUser = hasPowerUserEquipped(user);
        slot.dataset.occupied = '1';
        slot.dataset.userId = userId;
        slot.dataset.nickname = nickname;
        slot.dataset.poweruser = isPowerUser ? '1' : '';
        showCachedSlotSpeechBubbleForSlot(slot);
    }

    function clearSlotOccupantDataset(slot) {
        if (!slot) return;
        hideSlotSpeechBubble(slot);
        slot.dataset.occupied = '';
        slot.dataset.userId = '';
        slot.dataset.nickname = '';
        slot.dataset.poweruser = '';
    }

    function pruneExpiredActiveSlotSpeechBubbles() {
        const now = Date.now();
        for (const [nicknameKey, bubbleState] of activeSlotSpeechBubblesByNickname.entries()) {
            if (!bubbleState || !Number.isFinite(Number(bubbleState.expiresAt)) || Number(bubbleState.expiresAt) <= now) {
                activeSlotSpeechBubblesByNickname.delete(nicknameKey);
            }
        }
    }

    function showCachedSlotSpeechBubbleForSlot(slot) {
        if (!slot) return;
        pruneExpiredActiveSlotSpeechBubbles();
        const nicknameKey = getBubbleNicknameKey(slot.dataset.nickname);
        if (!nicknameKey) return;
        const bubbleState = activeSlotSpeechBubblesByNickname.get(nicknameKey);
        if (!bubbleState) return;
        const remainingMs = Math.max(0, Math.trunc(Number(bubbleState.expiresAt) - Date.now()));
        if (remainingMs <= 0) {
            activeSlotSpeechBubblesByNickname.delete(nicknameKey);
            return;
        }
        renderSlotSpeechBubble(slot, bubbleState.message, Boolean(bubbleState.isPowerUser), remainingMs);
    }

    function renderSlotSpeechBubble(slot, message, isPowerUser, durationMs) {
        if (!slot) return;
        const bubbleEl = getSlotSpeechBubbleElement(slot);
        if (!bubbleEl) return;
        const textEl = bubbleEl.querySelector('.slot-textballoon-text');
        if (!textEl) return;
        
        applySlotSpeechBubbleTheme(bubbleEl, isPowerUser);
        
        // Disable transition temporarily to prevent css flashing
        bubbleEl.style.transition = 'none';
        bubbleEl.classList.remove('visible');
        void bubbleEl.offsetWidth; // Force reflow
        textEl.textContent = message;
        
        // Re-enable transition and show
        bubbleEl.style.transition = '';
        bubbleEl.classList.add('visible');

        clearSlotSpeechBubbleTimer(slot);
        const hideTimer = window.setTimeout(() => {
            bubbleEl.classList.remove('visible');
            slotSpeechBubbleHideTimers.delete(slot);
        }, durationMs);
        slotSpeechBubbleHideTimers.set(slot, hideTimer);
    }

    function getSlotBubbleDurationMs(message) {
        const safeMessage = sanitizeSlotBubbleMessage(message);
        // Absolute minimum 4 seconds. Add more based on text length.
        return Math.max(4000, safeMessage.length * 150);
    }

    function showSlotSpeechBubbleByNickname(nickname, message, isPowerUser = false) {
        const safeMessage = sanitizeSlotBubbleMessage(message);
        if (!safeMessage) return;
        const nicknameKey = getBubbleNicknameKey(nickname);
        if (!nicknameKey) return;

        const slot = resolveSlotByNickname(nickname);
        const slotPowerUser = slot ? (String(slot.dataset.poweruser || '').trim() === '1') : false;
        const durationMs = getSlotBubbleDurationMs(safeMessage);
        
        activeSlotSpeechBubblesByNickname.set(nicknameKey, {
            message: safeMessage,
            isPowerUser: Boolean(isPowerUser) || slotPowerUser,
            expiresAt: Date.now() + durationMs
        });

        if (slot) {
            renderSlotSpeechBubble(slot, safeMessage, Boolean(isPowerUser) || slotPowerUser, durationMs);
        }
    }

    function getRandomPowerUserReadyBackgroundFrame() {
        if (!Array.isArray(POWER_USER_READY_BACKGROUND_FRAMES) || POWER_USER_READY_BACKGROUND_FRAMES.length <= 0) {
            return 0;
        }
        const index = Math.floor(Math.random() * POWER_USER_READY_BACKGROUND_FRAMES.length);
        const frame = Math.trunc(Number(POWER_USER_READY_BACKGROUND_FRAMES[index]));
        return Number.isFinite(frame) && frame >= 0 ? frame : 0;
    }

    function getStablePowerUserReadyBackgroundFrame(seedValue) {
        if (!Array.isArray(POWER_USER_READY_BACKGROUND_FRAMES) || POWER_USER_READY_BACKGROUND_FRAMES.length <= 0) {
            return 0;
        }
        const raw = String(seedValue ?? '').trim();
        if (!raw) {
            return getRandomPowerUserReadyBackgroundFrame();
        }
        let hash = 0;
        for (let index = 0; index < raw.length; index += 1) {
            hash = ((hash << 5) - hash) + raw.charCodeAt(index);
            hash |= 0;
        }
        const normalizedIndex = Math.abs(hash) % POWER_USER_READY_BACKGROUND_FRAMES.length;
        const frame = Math.trunc(Number(POWER_USER_READY_BACKGROUND_FRAMES[normalizedIndex]));
        return Number.isFinite(frame) && frame >= 0 ? frame : 0;
    }

    function updatePowerUserFallbackBackground(user) {
        if (!slotPowerUserFallbackBgEl) return;
        const shouldShow = hasPowerUserEquipped(user) && !hasEquippedAvatarBackground(user);
        if (!shouldShow) {
            slotPowerUserFallbackBgEl.classList.add('hidden');
            slotPowerUserFallbackBgEl.style.backgroundImage = 'none';
            return;
        }
        if (!Number.isFinite(slotPowerUserFallbackFrame)) {
            slotPowerUserFallbackFrame = getRandomPowerUserReadyBackgroundFrame();
        }
        const frame = Math.trunc(Number(slotPowerUserFallbackFrame));
        slotPowerUserFallbackBgEl.style.backgroundImage = `url('/assets/screens/game_room/ready_backimgae/ready_backimgae_frame_${frame}.png')`;
        slotPowerUserFallbackBgEl.classList.remove('hidden');
    }

    function setSlotLatencyLabelText(text) {
        if (!slotLatencyLabelEl) return;
        slotLatencyLabelEl.textContent = String(text || '');
    }

    function formatLatencyLabel(latencyMs) {
        const parsed = Math.trunc(Number(latencyMs));
        if (!Number.isFinite(parsed) || parsed < 0) {
            return '-- ms';
        }
        return `${parsed} ms`;
    }

    function setRemoteSlotLatencyLabel(userId, latencyMs) {
        const normalizedUserId = String(userId || '').trim();
        if (!normalizedUserId) return;
        const labelEl = remoteLatencyLabelByUserId.get(normalizedUserId);
        if (!labelEl) return;
        labelEl.textContent = formatLatencyLabel(latencyMs);
    }

    function stopSlotLatencyMonitor() {
        if (slotLatencyTimer) {
            window.clearInterval(slotLatencyTimer);
            slotLatencyTimer = null;
        }
        slotLatencyProbeSeq += 1;
    }

    function startSlotLatencyMonitor() {
        stopSlotLatencyMonitor();
        if (!socket || !slotLatencyLabelEl) return;

        const sampleLatency = () => {
            const probeId = ++slotLatencyProbeSeq;
            const startedAt = (typeof performance !== 'undefined' && typeof performance.now === 'function')
                ? performance.now()
                : Date.now();
            let settled = false;
            const timeoutId = window.setTimeout(() => {
                if (settled || probeId !== slotLatencyProbeSeq) return;
                settled = true;
                setSlotLatencyLabelText('-- ms');
            }, 3000);

            socket.emit('latency_probe', Date.now(), () => {
                if (settled || probeId !== slotLatencyProbeSeq) return;
                settled = true;
                window.clearTimeout(timeoutId);
                const endedAt = (typeof performance !== 'undefined' && typeof performance.now === 'function')
                    ? performance.now()
                    : Date.now();
                const rttMs = Math.max(0, Math.round(endedAt - startedAt));
                setSlotLatencyLabelText(`${rttMs} ms`);
                if (!isLeavingGameRoom) {
                    socket.emit('game_room_latency_update', { latencyMs: rttMs });
                }
            });
        };

        sampleLatency();
        slotLatencyTimer = window.setInterval(sampleLatency, 2000);
    }

    function startMobileAnimation(mobileIndex) {
        stopMobileAnimation();
        slotMobileIndex = getRenderedMobileAssetIndex(mobileIndex);
        slotMobileCurrentFrame = 0;
        slotAvatarDynamicSeatX = 0;
        slotAvatarDynamicSeatY = 0;

        if (slotMobileImgEl) {
            const offset = getMobileBaseOffsetForAsset(slotMobileIndex);
            slotMobileBaseOffsetX = offset.x;
            slotMobileBaseOffsetY = offset.y;
            slotMobileImgEl.style.width = '';
            slotMobileImgEl.style.height = '';
            slotMobileImgEl.style.transform = '';
            slotMobileImgEl.style.transformOrigin = 'center bottom';
            applyMobileFramePose();
        }
        applyAvatarPlacementForMobile(slotMobileIndex);

        slotMobileAnimationTimer = window.setInterval(() => {
            slotMobileCurrentFrame = (slotMobileCurrentFrame + 1) % getMobileFrameCountForAsset(slotMobileIndex);
            applyMobileFramePose();
        }, MOBILE_ANIMATION_INTERVAL);
    }

    function stopMobileAnimation() {
        if (slotMobileAnimationTimer) {
            window.clearInterval(slotMobileAnimationTimer);
            slotMobileAnimationTimer = null;
        }
    }

    function stopRemoteMobileAnimationForSlot(slot) {
        if (!slot) return;
        const state = remoteMobileAnimationBySlot.get(slot);
        if (!state) return;
        if (state.timer) {
            window.clearInterval(state.timer);
        }
        remoteMobileAnimationBySlot.delete(slot);
    }

    function startRemoteMobileAnimationForSlot(slot, mobileImgEl, assetIndex, isTeamB) {
        if (!slot || !mobileImgEl) return;
        stopRemoteMobileAnimationForSlot(slot);
        const normalizedAssetIndex = Math.trunc(Number(assetIndex));
        const frameCount = Math.max(1, getMobileFrameCountForAsset(normalizedAssetIndex));
        let frame = 0;
        const baseOffset = getMobileBaseOffsetForAsset(normalizedAssetIndex, isTeamB);
        const applyFrame = () => {
            mobileImgEl.src = getMobileFramePathForAsset(normalizedAssetIndex, frame);
            const frameDelta = getMobileFrameAnchorDelta(normalizedAssetIndex, frame);
            mobileImgEl.style.marginLeft = `${baseOffset.x + frameDelta.x}px`;
            mobileImgEl.style.marginBottom = `${baseOffset.y + frameDelta.y}px`;
        };
        applyFrame();
        const timer = window.setInterval(() => {
            frame = (frame + 1) % frameCount;
            applyFrame();
        }, MOBILE_ANIMATION_INTERVAL);
        remoteMobileAnimationBySlot.set(slot, { timer });
    }

    function getMobileButtonPath(index, frame) {
        const slot = String(index).padStart(2, '0');
        return `/assets/screens/game_room/b_ready_mobile${slot}/b_ready_mobile${slot}_frame_${frame}.png`;
    }

    function applyMobileButtonFrame(index, frame) {
        const button = mobileButtons[index - 1];
        if (!button) return;
        button.style.backgroundImage = `url('${getMobileButtonPath(index, frame)}')`;
    }

    function getMobilePreviewFrame(index) {
        const normalized = getRenderedMobileAssetIndex(index);
        return normalized;
    }

    function updateMobilePreview(index) {
        if (!mobilePreviewEl) return;
        const previewFrame = getMobilePreviewFrame(index);
        mobilePreviewEl.style.backgroundImage = `url('/assets/screens/game_room/ready_selectcharacter/ready_selectcharacter_frame_${previewFrame}.png')`;
    }

    function setSelectedMobile(index) {
        const previousSelection = selectedMobile;
        selectedMobile = normalizeMobileSelectionIndex(index);
        roomConfig.mobileIndex = selectedMobile;
        persistRoomConfig();
        const selectedButtonIndex = getButtonIndexFromSelection(selectedMobile);
        for (let i = 1; i <= mobileButtons.length; i++) {
            const button = mobileButtons[i - 1];
            if (!button) continue;
            const isSelected = i === selectedButtonIndex;
            button.classList.toggle('selected', isSelected);
            applyMobileButtonFrame(i, isSelected ? 4 : 0);
        }
        updateMobilePreview(selectedMobile);
        // Update slot mobile animation when selection changes
        if (localPlayerSlot && slotMobileImgEl) {
            startMobileAnimation(selectedMobile);
            if (!isLeavingGameRoom && selectedMobile !== previousSelection) {
                socket.emit('game_room_set_mobile', { mobileIndex: selectedMobile });
            }
        }
    }

    if (mobileGrid) {
        for (let i = 1; i <= MOBILE_BUTTON_COUNT; i++) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'game-room-mobile-btn';
            button.dataset.mobile = String(i);
            button.style.backgroundImage = `url('${getMobileButtonPath(i, 0)}')`;

            button.addEventListener('mouseenter', () => {
                const selectedButtonIndex = getButtonIndexFromSelection(selectedMobile);
                if (selectedButtonIndex === i) return;
                applyMobileButtonFrame(i, 1);
            });

            button.addEventListener('mouseleave', () => {
                const selectedButtonIndex = getButtonIndexFromSelection(selectedMobile);
                if (selectedButtonIndex === i) return;
                applyMobileButtonFrame(i, 0);
            });

            button.addEventListener('mousedown', () => {
                const selectedButtonIndex = getButtonIndexFromSelection(selectedMobile);
                if (selectedButtonIndex === i) return;
                applyMobileButtonFrame(i, 2);
            });

            button.addEventListener('mouseup', () => {
                const selectedButtonIndex = getButtonIndexFromSelection(selectedMobile);
                if (selectedButtonIndex === i) return;
                applyMobileButtonFrame(i, 1);
            });

            button.addEventListener('click', () => {
                setSelectedMobile(i);
            });

            mobileButtons.push(button);
            mobileGrid.appendChild(button);
        }
    }

    setSelectedMobile(selectedMobile);



    function getSlotByAssignedIndex(slotIndex) {
        const normalized = Math.trunc(Number(slotIndex));
        if (!Number.isFinite(normalized) || normalized < 0) return null;
        const seat = Math.floor(normalized / 2);
        const teamKey = normalized % 2 === 0 ? 'A' : 'B';
        const teamSlots = slotElementsByTeam[teamKey] || [];
        if (seat < 0 || seat >= teamSlots.length) return null;
        return teamSlots[seat] || null;
    }

    function syncSlotVisibilityFromRoster(players) {
        const safePlayers = Array.isArray(players) ? players : [];
        const totalPlayers = safePlayers.length;
        const teamAPlayers = safePlayers.filter((player) => Math.trunc(Number(player?.slotIndex)) % 2 === 0).length;
        const teamBPlayers = safePlayers.filter((player) => Math.trunc(Number(player?.slotIndex)) % 2 === 1).length;
        const occupiedSlots = new Set(
            safePlayers
                .map((player) => Math.trunc(Number(player?.slotIndex)))
                .filter((slotIndex) => Number.isFinite(slotIndex) && slotIndex >= 0)
        );

        ['A', 'B'].forEach((teamKey) => {
            const teamSlots = slotElementsByTeam[teamKey] || [];
            teamSlots.forEach((slot, index) => {
                if (!slot) return;
                slot.style.display = index < currentTeamSize ? '' : 'none';
            });
        });

        safePlayers.forEach((player) => {
            const slot = getSlotByAssignedIndex(player?.slotIndex);
            if (slot) {
                slot.style.display = '';
            }
        });

        const roomCapacity = Math.max(1, currentTeamSize * 2);
        const remainingOpenSeats = Math.max(0, roomCapacity - totalPlayers);

        // If one team is empty, only keep as many free slots visible as can still be filled.
        // Example: 2v2 with 3 players on Team A => show only one Team B free slot.
        if (teamAPlayers === 0 && teamBPlayers > 0) {
            const freeSlotsToShow = Math.min(currentTeamSize, remainingOpenSeats);
            (slotElementsByTeam.A || []).forEach((slot, index) => {
                if (!slot) return;
                slot.style.display = index < freeSlotsToShow ? '' : 'none';
            });
        } else if (teamBPlayers === 0 && teamAPlayers > 0) {
            const freeSlotsToShow = Math.min(currentTeamSize, remainingOpenSeats);
            (slotElementsByTeam.B || []).forEach((slot, index) => {
                if (!slot) return;
                slot.style.display = index < freeSlotsToShow ? '' : 'none';
            });
        }

        // Once room is full, hide any unoccupied configured slots.
        if (remainingOpenSeats === 0) {
            ['A', 'B'].forEach((teamKey) => {
                const teamSlots = slotElementsByTeam[teamKey] || [];
                teamSlots.forEach((slot, index) => {
                    if (!slot) return;
                    const slotIndex = index * 2 + (teamKey === 'A' ? 0 : 1);
                    if (!occupiedSlots.has(slotIndex)) {
                        slot.style.display = 'none';
                    }
                });
            });
        }
    }

    function removeRemotePlayersFromSlots() {
        const allSlots = getAllRoomSlots();
        allSlots.forEach((slot) => {
            if (!slot) return;
            stopRemoteMobileAnimationForSlot(slot);
            const remoteAnimator = remoteAvatarAnimatorsBySlot.get(slot);
            if (remoteAnimator) {
                try { remoteAnimator.destroy(); } catch (error) { /* ignore */ }
                remoteAvatarAnimatorsBySlot.delete(slot);
            }
            const remoteFxBackdrop = slot.querySelector('.slot-avatar-fx-backdrop-remote');
            if (remoteFxBackdrop) {
                remoteFxBackdrop.remove();
            }
            const remoteFxForeground = slot.querySelector('.slot-avatar-fx-foreground-remote');
            if (remoteFxForeground) {
                remoteFxForeground.remove();
            }
            const remoteWrapper = slot.querySelector('.slot-avatar-wrapper-remote');
            if (remoteWrapper) {
                remoteWrapper.remove();
            }
            const remoteInfo = slot.querySelector('.slot-player-info-remote');
            if (remoteInfo) {
                remoteInfo.remove();
            }
            const remoteLatency = slot.querySelector('.slot-latency-ms-remote');
            if (remoteLatency) {
                remoteLatency.remove();
            }
            if (slot === localPlayerSlot) return;
            const remoteUserId = String(slot.dataset.userId || '').trim();
            if (remoteUserId) {
                remoteLatencyLabelByUserId.delete(remoteUserId);
            }
            clearSlotOccupantDataset(slot);
        });
        remotePlayerIdsBySlot.clear();
    }

    function clearRemotePlayerFromSlot(slot) {
        if (!slot || slot === localPlayerSlot) return;

        const remoteUserId = String(slot.dataset.userId || '').trim();
        if (remoteUserId) {
            remoteLatencyLabelByUserId.delete(remoteUserId);
        }
        stopRemoteMobileAnimationForSlot(slot);
        const remoteAnimator = remoteAvatarAnimatorsBySlot.get(slot);
        if (remoteAnimator) {
            try { remoteAnimator.destroy(); } catch (error) { /* ignore */ }
            remoteAvatarAnimatorsBySlot.delete(slot);
        }

        const remoteFxBackdrop = slot.querySelector('.slot-avatar-fx-backdrop-remote');
        if (remoteFxBackdrop) {
            remoteFxBackdrop.remove();
        }
        const remoteFxForeground = slot.querySelector('.slot-avatar-fx-foreground-remote');
        if (remoteFxForeground) {
            remoteFxForeground.remove();
        }
        const remoteWrapper = slot.querySelector('.slot-avatar-wrapper-remote');
        if (remoteWrapper) {
            remoteWrapper.remove();
        }
        const remoteInfo = slot.querySelector('.slot-player-info-remote');
        if (remoteInfo) {
            remoteInfo.remove();
        }
        const remoteLatency = slot.querySelector('.slot-latency-ms-remote');
        if (remoteLatency) {
            remoteLatency.remove();
        }

        remotePlayerIdsBySlot.delete(slot);
        clearSlotOccupantDataset(slot);
    }

    function renderRemotePlayerVisual(slot, player) {
        if (!slot || !player) return;
        if (slot === localPlayerSlot) return;

        const fxBackdropHost = document.createElement('div');
        fxBackdropHost.className = 'slot-avatar-fx-layer slot-avatar-fx-backdrop slot-avatar-fx-backdrop-remote';
        fxBackdropHost.style.setProperty('--avatar-preview-slot-left', '0px');
        fxBackdropHost.style.setProperty('--avatar-preview-slot-top', '-37px');
        fxBackdropHost.style.setProperty('--avatar-preview-slot-width', '127px');
        fxBackdropHost.style.setProperty('--avatar-preview-slot-height', '108px');
        fxBackdropHost.style.setProperty('--avatar-preview-slot-radius', '0px');
        slot.appendChild(fxBackdropHost);

        const remotePowerBgEl = document.createElement('div');
        remotePowerBgEl.className = 'slot-poweruser-fallback-bg hidden';
        fxBackdropHost.appendChild(remotePowerBgEl);

        const shouldShowRemotePowerBg = hasPowerUserEquipped(player) && !hasEquippedAvatarBackground(player);
        if (shouldShowRemotePowerBg) {
            const remotePowerFrame = getStablePowerUserReadyBackgroundFrame(player.id || player.nickname);
            remotePowerBgEl.style.backgroundImage = `url('/assets/screens/game_room/ready_backimgae/ready_backimgae_frame_${remotePowerFrame}.png')`;
            remotePowerBgEl.classList.remove('hidden');
        }

        const fxForegroundHost = document.createElement('div');
        fxForegroundHost.className = 'slot-avatar-fx-layer slot-avatar-fx-foreground slot-avatar-fx-foreground-remote';
        fxForegroundHost.style.setProperty('--avatar-preview-slot-left', '0px');
        fxForegroundHost.style.setProperty('--avatar-preview-slot-top', '-37px');
        fxForegroundHost.style.setProperty('--avatar-preview-slot-width', '127px');
        fxForegroundHost.style.setProperty('--avatar-preview-slot-height', '108px');
        fxForegroundHost.style.setProperty('--avatar-preview-slot-radius', '0px');
        slot.appendChild(fxForegroundHost);

        const wrapper = document.createElement('div');
        wrapper.className = 'slot-avatar-wrapper slot-avatar-wrapper-remote';

        const avatarContainer = document.createElement('div');
        avatarContainer.className = 'slot-avatar-container';
        avatarContainer.style.zIndex = '1';
        avatarContainer.style.setProperty('--avatar-preview-slot-left', '-14px');
        avatarContainer.style.setProperty('--avatar-preview-slot-top', '-3px');
        avatarContainer.style.setProperty('--avatar-preview-slot-width', '127px');
        avatarContainer.style.setProperty('--avatar-preview-slot-height', '71px');
        avatarContainer.style.setProperty('--avatar-preview-slot-radius', '0px');
        wrapper.appendChild(avatarContainer);

        const mobileImgEl = document.createElement('img');
        mobileImgEl.className = 'slot-mobile-img';
        mobileImgEl.alt = '';
        mobileImgEl.draggable = false;
        const remoteMobileIndex = normalizeMobileSelectionIndex(Number(player.mobileIndex || DEFAULT_JOIN_MOBILE_INDEX));
        const remoteAssetIndex = getRenderedMobileAssetIndex(remoteMobileIndex);
        mobileImgEl.src = getMobileFramePathForAsset(remoteAssetIndex, 0);
        mobileImgEl.style.left = '73px';
        mobileImgEl.style.bottom = '35px';
        const isRemoteTeamB = slot.classList.contains('team-b');
        startRemoteMobileAnimationForSlot(slot, mobileImgEl, remoteAssetIndex, isRemoteTeamB);
        mobileImgEl.addEventListener('error', () => {
            mobileImgEl.src = getMobileFramePathForAsset(remoteAssetIndex, 1);
        }, { once: true });
        wrapper.appendChild(mobileImgEl);

        const remoteAvatarPlacement = computeAvatarPlacementForAsset(remoteAssetIndex, isRemoteTeamB, 0, 0);
        avatarContainer.style.bottom = `${remoteAvatarPlacement.bottom}px`;
        avatarContainer.style.left = `calc(50% + ${remoteAvatarPlacement.left}px)`;

        slot.appendChild(wrapper);

        if (window.AvatarPreviewRuntime?.createAnimator) {
            window.AvatarPreviewRuntime.createAnimator(avatarContainer, {
                gender: player.gender,
                ahead: player.ahead,
                abody: player.abody,
                aeyes: player.aeyes,
                aflag: player.aflag,
                abackground: player.abackground,
                aforeground: player.aforeground,
                aexitem: player.aexitem
            }, {
                rootId: 'avatar-shop-character-preview',
                context: 'game_room',
                effectVariant: 'legacy'
            }).then((animator) => {
                animator?.setEquip?.('background', player.abackground);
                animator?.setEquip?.('foreground', player.aforeground);
                const previewRoot = avatarContainer.querySelector('#avatar-shop-character-preview');
                if (previewRoot) {
                    const backdropNode = previewRoot.querySelector('.avatar-preview-backdrop');
                    const foregroundNode = previewRoot.querySelector('.avatar-preview-foreground');
                    if (backdropNode) {
                        fxBackdropHost.appendChild(backdropNode);
                    }
                    if (foregroundNode) {
                        fxForegroundHost.appendChild(foregroundNode);
                    }
                }
                remoteAvatarAnimatorsBySlot.set(slot, animator);
            }).catch(() => {
                // Ignore avatar render failures for remote users.
            });
        }
    }

    function renderRemotePlayerInSlot(slot, player) {
        if (!slot || !player) return;
        if (slot === localPlayerSlot) return;
        const remoteUserId = String(player.id || '').trim();
        if (!remoteUserId) return;

        renderRemotePlayerVisual(slot, player);

        const infoEl = document.createElement('div');
        infoEl.className = 'slot-player-info slot-player-info-remote';

        const rankIconEl = document.createElement('img');
        rankIconEl.className = 'slot-level-icon';
        rankIconEl.alt = '';
        rankIconEl.draggable = false;
        rankIconEl.src = resolveRankIconPathByGrade(player.grade);
        infoEl.appendChild(rankIconEl);

        const textWrapEl = document.createElement('div');
        textWrapEl.className = 'slot-player-texts';

        const nicknameEl = document.createElement('div');
        nicknameEl.className = 'slot-nickname';
        nicknameEl.textContent = String(player.nickname || '').trim();
        textWrapEl.appendChild(nicknameEl);

        const guildEl = document.createElement('div');
        guildEl.className = 'slot-guild';
        guildEl.textContent = String(player.guild || '').trim();
        guildEl.style.visibility = guildEl.textContent ? 'visible' : 'hidden';
        textWrapEl.appendChild(guildEl);

        infoEl.appendChild(textWrapEl);

        const keyIconEl = document.createElement('img');
        keyIconEl.className = 'slot-master-key-icon';
        keyIconEl.alt = '';
        keyIconEl.draggable = false;
        keyIconEl.src = ROOM_MASTER_KEY_ICON_PATH;
        keyIconEl.style.visibility = player.isMaster ? 'visible' : 'hidden';
        infoEl.appendChild(keyIconEl);

        slot.appendChild(infoEl);
        const latencyEl = document.createElement('div');
        latencyEl.className = 'slot-latency-ms slot-latency-ms-remote';
        latencyEl.textContent = formatLatencyLabel(player?.latencyMs);
        slot.appendChild(latencyEl);
        setSlotOccupantDataset(slot, player);
        remotePlayerIdsBySlot.set(slot, remoteUserId);
        remoteLatencyLabelByUserId.set(remoteUserId, latencyEl);
    }

    function applyGameRoomRoster(payload) {
        const players = Array.isArray(payload?.players) ? payload.players : [];
        const localUserId = String(userData?.id || '').trim();
        const localNickname = String(userData?.nickname || '').trim().toLowerCase();
        removeRemotePlayersFromSlots();
        syncSlotVisibilityFromRoster(players);
        let localReadyFromRoster = false;
        let localSlotFromRoster = -1;

        let rosterCount = 0;
        players.forEach((player) => {
            const playerId = String(player?.id || '').trim();
            if (!playerId) return;
            rosterCount += 1;
            const playerNickname = String(player?.nickname || '').trim().toLowerCase();
            const isLocal = playerId === localUserId || (localNickname && playerNickname === localNickname);
            if (isLocal) {
                localReadyFromRoster = Boolean(player?.isReady);
                const localSlotIndex = Math.trunc(Number(player?.slotIndex));
                localSlotFromRoster = Number.isFinite(localSlotIndex) ? localSlotIndex : -1;
                return;
            }
            const slotIndex = Math.trunc(Number(player?.slotIndex));
            const slot = getSlotByAssignedIndex(slotIndex);
            if (!slot) return;
            renderRemotePlayerInSlot(slot, player);
        });
        isLocalReady = localReadyFromRoster;
        if (localSlotFromRoster >= 0) {
            preferredJoinSlotIndex = localSlotFromRoster;
            const targetLocalSlot = getSlotByAssignedIndex(localSlotFromRoster);
            if (targetLocalSlot && localPlayerSlot && targetLocalSlot !== localPlayerSlot) {
                clearRemotePlayerFromSlot(targetLocalSlot);
                if (!moveLocalPlayerToSlot(targetLocalSlot)) {
                    destroySlotAvatar();
                    renderSlotAvatar(targetLocalSlot, userData);
                } else {
                    startMobileAnimation(selectedMobile);
                }
            }
        }
        updateReadyBadgesFromRoster(players);
        updateMapControlPermissions();

        if (rosterCount > 0) {
            roomMemberCount = rosterCount;
        }
    }

    function findPlayerSlot() {
        const preferredSlot = getSlotByAssignedIndex(preferredJoinSlotIndex);
        if (preferredSlot && !isSlotOccupied(preferredSlot)) {
            return preferredSlot;
        }

        // Place local player in first available Team A slot by default
        const teamASlots = slotElementsByTeam.A || [];
        for (let index = 0; index < teamASlots.length; index += 1) {
            if (index >= currentTeamSize) break;
            const slot = teamASlots[index];
            if (slot && !isSlotOccupied(slot)) {
                return slot;
            }
        }
        // Fallback: try Team B
        const teamBSlots = slotElementsByTeam.B || [];
        for (let index = 0; index < teamBSlots.length; index += 1) {
            if (index >= currentTeamSize) break;
            const slot = teamBSlots[index];
            if (slot && !isSlotOccupied(slot)) {
                return slot;
            }
        }
        // Last fallback: first Team A slot
        return teamASlots[0] || null;
    }

    function getNextAvailableTeamSlotForPlayer(currentSlot) {
        if (!currentSlot) return null;
        const isCurrentTeamA = currentSlot.classList.contains('team-a');
        const nextTeamKey = isCurrentTeamA ? 'B' : 'A';
        const nextTeamSlots = slotElementsByTeam[nextTeamKey] || [];

        for (let index = 0; index < nextTeamSlots.length; index += 1) {
            if (index >= currentTeamSize) break;
            const slot = nextTeamSlots[index];
            if (!slot) continue;
            if (slot.style.display === 'none') continue;
            if (!isSlotOccupied(slot)) {
                return slot;
            }
        }

        return null;
    }

    function updateLocalPlayerTeamTransforms() {
        if (!localPlayerSlot) return;
        // Facing should follow slot CSS team classes to stay consistent
        // across side changes and mobile re-selection.
        if (slotAvatarContainerEl) {
            slotAvatarContainerEl.style.transform = '';
        }
        if (slotMobileImgEl) {
            slotMobileImgEl.style.transform = '';
        }
        applyAvatarPlacementForMobile(slotMobileIndex);
    }

    function moveLocalPlayerToSlot(targetSlot) {
        if (!targetSlot || !localPlayerSlot || targetSlot === localPlayerSlot) return false;

        const sourceSlot = localPlayerSlot;
        const wrapper = sourceSlot.querySelector('.slot-avatar-wrapper');
        const info = sourceSlot.querySelector('.slot-player-info');
        const latency = sourceSlot.querySelector('.slot-latency-ms');
        if (!wrapper || !info || !latency || !slotFxBackdropHostEl || !slotFxForegroundHostEl) {
            return false;
        }

        const userId = String(sourceSlot.dataset.userId || userData?.id || '');
        const sourceNickname = String(sourceSlot.dataset.nickname || userData?.nickname || '').trim();
        const sourcePowerUser = String(sourceSlot.dataset.poweruser || '').trim() === '1';
        const sourceBubbleEl = sourceSlot.querySelector('.slot-textballoon');
        const sourceBubbleTimer = slotSpeechBubbleHideTimers.get(sourceSlot);
        sourceSlot.dataset.occupied = '';
        sourceSlot.dataset.userId = '';
        sourceSlot.dataset.nickname = '';
        sourceSlot.dataset.poweruser = '';
        if (sourceBubbleEl) {
            sourceBubbleEl.remove();
        }
        if (sourceBubbleTimer) {
            slotSpeechBubbleHideTimers.delete(sourceSlot);
        }

        localPlayerSlot = targetSlot;
        targetSlot.dataset.occupied = '1';
        targetSlot.dataset.userId = userId;
        targetSlot.dataset.nickname = sourceNickname;
        targetSlot.dataset.poweruser = sourcePowerUser ? '1' : '';
        if (sourceBubbleEl) {
            targetSlot.appendChild(sourceBubbleEl);
        }
        if (sourceBubbleTimer) {
            slotSpeechBubbleHideTimers.set(targetSlot, sourceBubbleTimer);
        }

        targetSlot.appendChild(slotFxBackdropHostEl);
        targetSlot.appendChild(slotFxForegroundHostEl);
        targetSlot.appendChild(wrapper);
        targetSlot.appendChild(info);
        targetSlot.appendChild(latency);
        showCachedSlotSpeechBubbleForSlot(targetSlot);

        updateLocalSlotMasterKeyIcon();
        updateLocalPlayerTeamTransforms();
        return true;
    }

    function renderSlotAvatar(slotElement, user) {
        if (!slotElement || !user) return;
        localPlayerSlot = slotElement;
        setSlotOccupantDataset(slotElement, user);

        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'slot-avatar-wrapper';

        // Create fixed FX layers (do not follow mobile/avatar seat motion)
        const fxBackdropHost = document.createElement('div');
        fxBackdropHost.className = 'slot-avatar-fx-layer slot-avatar-fx-backdrop';
        fxBackdropHost.style.setProperty('--avatar-preview-slot-left', '0px');
        fxBackdropHost.style.setProperty('--avatar-preview-slot-top', '-37px');
        fxBackdropHost.style.setProperty('--avatar-preview-slot-width', '127px');
        fxBackdropHost.style.setProperty('--avatar-preview-slot-height', '108px');
        fxBackdropHost.style.setProperty('--avatar-preview-slot-radius', '0px');
        slotFxBackdropHostEl = fxBackdropHost;
        slotElement.appendChild(fxBackdropHost);

        // Power User fallback backdrop (same container/positioning as equipped backgrounds)
        const powerBgEl = document.createElement('div');
        powerBgEl.className = 'slot-poweruser-fallback-bg hidden';
        slotPowerUserFallbackBgEl = powerBgEl;
        slotFxBackdropHostEl.appendChild(powerBgEl);
        slotPowerUserFallbackFrame = getRandomPowerUserReadyBackgroundFrame();
        updatePowerUserFallbackBackground(user);

        const fxForegroundHost = document.createElement('div');
        fxForegroundHost.className = 'slot-avatar-fx-layer slot-avatar-fx-foreground';
        fxForegroundHost.style.setProperty('--avatar-preview-slot-left', '0px');
        fxForegroundHost.style.setProperty('--avatar-preview-slot-top', '-37px');
        fxForegroundHost.style.setProperty('--avatar-preview-slot-width', '127px');
        fxForegroundHost.style.setProperty('--avatar-preview-slot-height', '108px');
        fxForegroundHost.style.setProperty('--avatar-preview-slot-radius', '0px');
        slotFxForegroundHostEl = fxForegroundHost;
        slotElement.appendChild(fxForegroundHost);

        // Create avatar container
        const avatarContainer = document.createElement('div');
        avatarContainer.className = 'slot-avatar-container';
        avatarContainer.style.zIndex = '1';
        avatarContainer.style.setProperty('--avatar-preview-slot-left', '-14px');
        avatarContainer.style.setProperty('--avatar-preview-slot-top', '-3px');
        avatarContainer.style.setProperty('--avatar-preview-slot-width', '127px');
        avatarContainer.style.setProperty('--avatar-preview-slot-height', '71px');
        avatarContainer.style.setProperty('--avatar-preview-slot-radius', '0px');
        slotAvatarContainerEl = avatarContainer;
        wrapper.appendChild(avatarContainer);

        // Create mobile image element
        slotMobileImgEl = document.createElement('img');
        slotMobileImgEl.className = 'slot-mobile-img';
        slotMobileImgEl.alt = '';
        slotMobileImgEl.draggable = false;
        slotMobileImgEl.style.zIndex = '3';
        wrapper.appendChild(slotMobileImgEl);
        updateLocalPlayerTeamTransforms();

        slotElement.appendChild(wrapper);

        // Create player info HUD
        const infoEl = document.createElement('div');
        infoEl.className = 'slot-player-info';

        const rankIconEl = document.createElement('img');
        rankIconEl.className = 'slot-level-icon';
        rankIconEl.alt = '';
        rankIconEl.draggable = false;
        rankIconEl.src = resolveRankIconPathByGrade(user.grade);
        infoEl.appendChild(rankIconEl);

        const textWrapEl = document.createElement('div');
        textWrapEl.className = 'slot-player-texts';

        const nicknameEl = document.createElement('div');
        nicknameEl.className = 'slot-nickname';
        nicknameEl.textContent = String(user.nickname || '').trim();
        textWrapEl.appendChild(nicknameEl);

        const guildEl = document.createElement('div');
        guildEl.className = 'slot-guild';
        const guildName = String(user.guild || '').trim();
        if (guildName) {
            const guildStats = resolveGuildSlotStats(user);
            const hasGuildStats = Number.isFinite(guildStats.rank) && Number.isFinite(guildStats.total);
            guildEl.textContent = hasGuildStats
                ? `${guildName} [${guildStats.rank}/${guildStats.total}]`
                : guildName;
        } else {
            guildEl.textContent = '';
        }
        guildEl.style.visibility = guildEl.textContent ? 'visible' : 'hidden';
        textWrapEl.appendChild(guildEl);

        infoEl.appendChild(textWrapEl);

        const keyIconEl = document.createElement('img');
        keyIconEl.className = 'slot-master-key-icon';
        keyIconEl.alt = '';
        keyIconEl.draggable = false;
        keyIconEl.src = ROOM_MASTER_KEY_ICON_PATH;
        infoEl.appendChild(keyIconEl);
        localPlayerKeyIconEl = keyIconEl;
        updateLocalSlotMasterKeyIcon();

        slotElement.appendChild(infoEl);

        const latencyEl = document.createElement('div');
        latencyEl.className = 'slot-latency-ms';
        latencyEl.textContent = '0 ms';
        slotLatencyLabelEl = latencyEl;
        slotElement.appendChild(latencyEl);
        startSlotLatencyMonitor();

        // Start animated avatar
        if (window.AvatarPreviewRuntime) {
            window.AvatarPreviewRuntime.createAnimator(avatarContainer, {
                gender: user.gender,
                ahead: user.ahead,
                abody: user.abody,
                aeyes: user.aeyes,
                aflag: user.aflag,
                abackground: user.abackground,
                aforeground: user.aforeground,
                aexitem: user.aexitem
            }, {
                rootId: 'avatar-shop-character-preview',
                context: 'game_room',
                effectVariant: 'legacy'
            }).then((animator) => {
                slotAvatarAnimator = animator;
                slotAvatarAnimator?.setEquip('background', user.abackground);
                slotAvatarAnimator?.setEquip('foreground', user.aforeground);
                const previewRoot = avatarContainer.querySelector('#avatar-shop-character-preview');
                if (previewRoot && slotFxBackdropHostEl && slotFxForegroundHostEl) {
                    const backdropNode = previewRoot.querySelector('.avatar-preview-backdrop');
                    const foregroundNode = previewRoot.querySelector('.avatar-preview-foreground');
                    if (backdropNode) {
                        slotFxBackdropHostEl.appendChild(backdropNode);
                    }
                    if (foregroundNode) {
                        slotFxForegroundHostEl.appendChild(foregroundNode);
                    }
                }
            }).catch((err) => {
                console.warn('[GameRoom] Avatar animator error:', err);
            });
        }

        // Start mobile animation with random mobile (default)
        startMobileAnimation(selectedMobile);
    }

    function destroySlotAvatar() {
        stopSlotLatencyMonitor();
        stopMobileAnimation();
        if (slotAvatarAnimator) {
            slotAvatarAnimator.destroy();
            slotAvatarAnimator = null;
        }
        if (localPlayerSlot) {
            const wrapper = localPlayerSlot.querySelector('.slot-avatar-wrapper');
            if (wrapper) wrapper.remove();
            if (slotFxBackdropHostEl) slotFxBackdropHostEl.remove();
            if (slotFxForegroundHostEl) slotFxForegroundHostEl.remove();
            if (slotPowerUserFallbackBgEl) slotPowerUserFallbackBgEl.remove();
            const info = localPlayerSlot.querySelector('.slot-player-info');
            if (info) info.remove();
            const latency = localPlayerSlot.querySelector('.slot-latency-ms');
            if (latency) latency.remove();
            clearSlotOccupantDataset(localPlayerSlot);
            localPlayerSlot = null;
        }
        slotAvatarContainerEl = null;
        slotMobileImgEl = null;
        localPlayerKeyIconEl = null;
        slotFxBackdropHostEl = null;
        slotFxForegroundHostEl = null;
        slotPowerUserFallbackBgEl = null;
        slotPowerUserFallbackFrame = null;
        slotLatencyLabelEl = null;
    }



    // Render local player's avatar on room join
    if (userData) {
        const slot = findPlayerSlot();
        if (slot) {
            renderSlotAvatar(slot, userData);
        }
    }

    const btnExit = document.getElementById('btn-game-room-exit');
    const btnBuddy = document.getElementById('btn-game-room-buddy');
    const btnBuddyExit = document.getElementById('btn-buddy-exit');
    const btnBuddyPlus = document.getElementById('btn-buddy-plus');
    const btnBuddyDel = document.getElementById('btn-buddy-del');
    const btnAddBuddyOk = document.getElementById('btn-add-buddy-ok');
    const btnAddBuddyClose = document.getElementById('btn-add-buddy-close');
    const btnChange = document.getElementById('btn-game-room-change');
    const btnStart = document.getElementById('btn-game-room-start');
    const btnItemUp = document.getElementById('btn-game-room-item-up');
    const btnItemDown = document.getElementById('btn-game-room-item-down');
    const itemSlotButtons = Array.from(document.querySelectorAll('#game-room-item-slots .game-room-item-slot'));
    const itemButtons = Array.from(document.querySelectorAll('#game-room-item-grid .game-room-item-btn'));

    if (btnExit) {
        btnExit.addEventListener('click', () => {
            isLeavingGameRoom = true;
            destroySlotAvatar();
            if (userData) {
                socket.emit('set_user_data', {
                    nickname: userData.nickname,
                    id: userData.id,
                    gender: userData.gender,
                    grade: userData.grade || 24,
                    guild: userData.guild || '',
                    authority: userData.authority || 0,
                    location: 'channel'
                });
            }

            if (typeof window.playTransition === 'function') {
                window.playTransition('closing', () => {
                    window.location.href = '/views/lobby.html';
                });
                return;
            }

            window.location.href = '/views/lobby.html';
        });
    }

    if (btnBuddy) {
        btnBuddy.addEventListener('click', () => {
            toggleBuddyPanel();
        });
    }

    if (btnBuddyExit) {
        btnBuddyExit.addEventListener('click', () => {
            buddyPanel?.classList.add('hidden');
        });
    }

    if (btnBuddyPlus) {
        btnBuddyPlus.addEventListener('click', () => {
            showAddBuddyPopup({ resetInput: true });
        });
    }

    if (btnBuddyDel) {
        btnBuddyDel.addEventListener('click', () => {
            const selected = buddyListContent?.querySelector('.buddy-item.selected');
            if (!selected) {
                showBuddyAlert('Please select a buddy to delete.');
                return;
            }

            const nickname = selected.dataset.nickname;
            const targetId = selected.dataset.id;
            if (!nickname || !targetId) {
                showBuddyAlert('Unable to resolve selected buddy.');
                return;
            }

            showBuddyAlert(`Are you sure you want to delete '${nickname}'?`, {
                showNoButton: true,
                onYes: () => socket.emit('delete_buddy', targetId)
            });
        });
    }

    if (btnAddBuddyClose) {
        btnAddBuddyClose.addEventListener('click', () => {
            addBuddyPopup?.classList.add('hidden');
        });
    }

    const submitBuddyInvite = () => {
        const nickname = String(addBuddyInput?.value || '').trim();
        const currentNickname = String(userData?.nickname || '').trim();
        if (!nickname) return;

        if (nickname.toLowerCase() === currentNickname.toLowerCase()) {
            showBuddyAlert("You can't add your nickname to buddy.");
            return;
        }

        socket.emit('send_buddy_request', nickname);
    };

    if (btnAddBuddyOk) {
        btnAddBuddyOk.addEventListener('click', submitBuddyInvite);
    }

    if (addBuddyInput) {
        addBuddyInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            submitBuddyInvite();
        });
    }

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

    if (btnBuddyChatClose) {
        btnBuddyChatClose.addEventListener('click', () => {
            buddyChatWindow?.classList.add('hidden');
        });
    }

    if (buddyChatInput) {
        buddyChatInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();

            const message = String(buddyChatInput.value || '').trim();
            const toNickname = String(buddyChatNickname?.textContent || '').trim();
            if (!message || !toNickname || !userData) return;

            socket.emit('private_message', { toNickname, message });
            appendBuddyChatMessage(userData.nickname, message);
            buddyChatInput.value = '';
            buddyChatCursorController?.update();
        });
    }

    if (btnChange) {
        btnChange.addEventListener('click', () => {
            if (!userData) return;
            socket.emit('game_room_change_slot');
        });
    }

    if (btnStart) {
        btnStart.addEventListener('click', () => {
            if (isRoomMaster) {
                showError('Room', 'Start game flow is not implemented yet.');
                return;
            }
            isLocalReady = !isLocalReady;
            updateMapControlPermissions();
            socket.emit('game_room_set_ready', { ready: isLocalReady });
        });
    }

    if (roomChatInput) {
        roomChatInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();

            const message = String(roomChatInput.value || '').trim();
            if (!message) {
                roomChatInput.blur();
                return;
            }

            socket.emit('game_room_message', message);
            roomChatInput.value = '';
            roomChatCursorController?.update();
        });

        window.addEventListener('focus', () => roomChatCursorController?.update());
    }

    if (btnGameRoomChatting) {
        const applyChattingMode = (isChattingMode) => {
            if (!gameRoomScreen) return;
            gameRoomScreen.classList.toggle('chatting-mode', isChattingMode);
            if (gameRoomChattingPanel) {
                gameRoomChattingPanel.setAttribute('aria-hidden', isChattingMode ? 'false' : 'true');
            }
        };

        btnGameRoomChatting.addEventListener('click', () => {
            const nextChattingMode = !gameRoomScreen?.classList?.contains('chatting-mode');
            applyChattingMode(nextChattingMode);
            roomChatInput?.focus();
            roomChatCursorController?.update();
            window.setTimeout(() => roomChatScroll?.update(), 20);
        });
    }

    function resolveSelectedItemIconPath(shopIconPath) {
        const normalizedPath = String(shopIconPath || '');
        const shop1Match = normalizedPath.match(/\/ready_itemshop1\/ready_itemshop1_frame_(\d+)\.png$/);
        if (shop1Match) {
            return `/assets/screens/game_room/ready_item1/ready_item1_frame_${shop1Match[1]}.png`;
        }
        const shop2Match = normalizedPath.match(/\/ready_itemshop2\/ready_itemshop2_frame_(\d+)\.png$/);
        if (shop2Match) {
            return `/assets/screens/game_room/ready_item2/ready_item2_frame_${shop2Match[1]}.png`;
        }
        return normalizedPath;
    }

    function resolveDisabledGridItemIconPath(shopIconPath) {
        const normalizedPath = String(shopIconPath || '');
        const match = normalizedPath.match(/\/(ready_itemshop[12])\/\1_frame_(\d+)\.png$/);
        if (!match) {
            return normalizedPath;
        }
        const folder = match[1];
        const frame = Math.trunc(Number(match[2]));
        if (!Number.isFinite(frame) || frame < 0) {
            return normalizedPath;
        }
        return `/assets/screens/game_room/${folder}/${folder}_frame_${frame + 1}.png`;
    }

    function createRoomItem(iconPath) {
        const gridIconPath = String(iconPath || '');
        const selectedIconPath = resolveSelectedItemIconPath(gridIconPath);
        const disabledGridIconPath = resolveDisabledGridItemIconPath(gridIconPath);
        return {
            gridIconPath,
            disabledGridIconPath,
            selectedIconPath,
            slotCost: String(selectedIconPath).includes('/ready_item2/') ? 2 : 1
        };
    }

    const itemPages = [
        [
            '/assets/screens/game_room/ready_itemshop2/ready_itemshop2_frame_0.png',
            '/assets/screens/game_room/ready_itemshop1/ready_itemshop1_frame_4.png',
            '/assets/screens/game_room/ready_itemshop2/ready_itemshop2_frame_12.png',
            '/assets/screens/game_room/ready_itemshop1/ready_itemshop1_frame_12.png',
            '/assets/screens/game_room/ready_itemshop2/ready_itemshop2_frame_2.png',
            '/assets/screens/game_room/ready_itemshop1/ready_itemshop1_frame_28.png',
            '/assets/screens/game_room/ready_itemshop2/ready_itemshop2_frame_20.png',
            '/assets/screens/game_room/ready_itemshop1/ready_itemshop1_frame_0.png',
            '/assets/screens/game_room/ready_itemshop1/ready_itemshop1_frame_2.png'
        ].map(createRoomItem),
        [
            '/assets/screens/game_room/ready_itemshop2/ready_itemshop2_frame_10.png',
            '/assets/screens/game_room/ready_itemshop2/ready_itemshop2_frame_18.png'
        ].map(createRoomItem)
    ];

    const ITEM_SLOT_COUNT = Math.max(1, itemSlotButtons.length || 6);
    const selectedItemSlots = Array.from({ length: ITEM_SLOT_COUNT }, () => null);
    const disabledRoomItemKeys = new Set();
    const renderedItemRefByButton = Array.from({ length: itemButtons.length }, () => null);
    let nextSelectedItemEntryId = 1;

    let currentItemPage = 0;

    function getNonMasterVisibleItemEntries() {
        const entries = [];
        itemPages.forEach((page, pageIndex) => {
            (page || []).forEach((item, itemIndex) => {
                const iconPath = String(item?.gridIconPath || '');
                if (!iconPath) return;
                if (isRoomItemDisabled(pageIndex, itemIndex)) return;
                entries.push({
                    pageIndex,
                    itemIndex,
                    iconPath
                });
            });
        });
        return entries;
    }

    function getRenderableItemPageCount() {
        const pageSize = Math.max(1, itemButtons.length || 1);
        if (isRoomMaster) {
            return Math.max(1, itemPages.length);
        }
        const visibleEntries = getNonMasterVisibleItemEntries();
        return Math.max(1, Math.ceil(visibleEntries.length / pageSize));
    }

    function normalizeItemPageIndex(pageIndex) {
        const pageCount = getRenderableItemPageCount();
        const numeric = Math.trunc(Number(pageIndex || 0));
        if (!Number.isFinite(numeric)) return 0;
        const normalized = ((numeric % pageCount) + pageCount) % pageCount;
        return normalized;
    }

    function shiftItemPage(delta) {
        const pageCount = getRenderableItemPageCount();
        if (pageCount <= 0) return;
        const numericDelta = Math.trunc(Number(delta || 0));
        currentItemPage = normalizeItemPageIndex(currentItemPage + numericDelta);
        renderItemPage();
    }

    function getRoomItemKey(pageIndex, itemIndex) {
        return `${Math.trunc(Number(pageIndex) || 0)}:${Math.trunc(Number(itemIndex) || 0)}`;
    }

    function isRoomItemDisabled(pageIndex, itemIndex) {
        return disabledRoomItemKeys.has(getRoomItemKey(pageIndex, itemIndex));
    }

    function setRoomItemDisabled(pageIndex, itemIndex, disabled) {
        const key = getRoomItemKey(pageIndex, itemIndex);
        if (disabled) {
            disabledRoomItemKeys.add(key);
        } else {
            disabledRoomItemKeys.delete(key);
        }
    }

    function applyRoomDisabledItemState(disabledKeys) {
        disabledRoomItemKeys.clear();
        if (Array.isArray(disabledKeys)) {
            disabledKeys.forEach((value) => {
                const key = String(value || '').trim();
                if (!/^\d+:\d+$/.test(key)) return;
                disabledRoomItemKeys.add(key);
            });
        }
    }

    socket.on('game_room_item_state', (data) => {
        applyRoomDisabledItemState(data?.disabledItems || []);
        removeDisabledItemsFromSlots();
        renderItemPage();
    });

    socket.on('game_room_item_disabled_changed', (data) => {
        const pageIndex = Math.trunc(Number(data?.pageIndex));
        const itemIndex = Math.trunc(Number(data?.itemIndex));
        if (!Number.isFinite(pageIndex) || pageIndex < 0) return;
        if (!Number.isFinite(itemIndex) || itemIndex < 0) return;
        setRoomItemDisabled(pageIndex, itemIndex, Boolean(data?.disabled));
        removeDisabledItemsFromSlots();
        renderItemPage();
    });

    function renderSelectedItemSlots() {
        itemSlotButtons.forEach((button, index) => {
            const entry = selectedItemSlots[index];
            button.classList.remove('item-present', 'item-double');
            button.style.backgroundImage = 'none';

            if (!entry) return;

            button.classList.add('item-present');
            if (entry.startIndex === index) {
                button.style.backgroundImage = `url('${entry.iconPath}')`;
                if (entry.slotCost === 2) {
                    button.classList.add('item-double');
                }
            }
        });
    }

    function findNextAvailableItemStart(slotCost) {
        const size = slotCost === 2 ? 2 : 1;
        for (let start = 0; start <= ITEM_SLOT_COUNT - size; start += 1) {
            let allFree = true;
            for (let i = 0; i < size; i += 1) {
                if (selectedItemSlots[start + i]) {
                    allFree = false;
                    break;
                }
            }
            if (allFree) return start;
        }
        return -1;
    }

    function removeDisabledItemsFromSlots() {
        const blockedEntryIds = new Set();
        selectedItemSlots.forEach((entry) => {
            if (!entry) return;
            if (entry.itemKey && disabledRoomItemKeys.has(entry.itemKey)) {
                blockedEntryIds.add(entry.id);
            }
        });
        if (blockedEntryIds.size <= 0) return;

        for (let i = 0; i < ITEM_SLOT_COUNT; i += 1) {
            const entry = selectedItemSlots[i];
            if (!entry) continue;
            if (blockedEntryIds.has(entry.id)) {
                selectedItemSlots[i] = null;
            }
        }
        renderSelectedItemSlots();
    }

    function addItemToSlots(item, pageIndex, itemIndex) {
        const slotCost = item?.slotCost === 2 ? 2 : 1;
        const startIndex = findNextAvailableItemStart(slotCost);
        if (startIndex < 0) {
            return;
        }

        const entry = {
            id: nextSelectedItemEntryId++,
            iconPath: String(item.selectedIconPath || item.gridIconPath || ''),
            itemKey: getRoomItemKey(pageIndex, itemIndex),
            slotCost,
            startIndex
        };

        for (let i = 0; i < slotCost; i += 1) {
            selectedItemSlots[startIndex + i] = entry;
        }
        renderSelectedItemSlots();
    }

    function removeItemFromSlots(slotIndex) {
        const entry = selectedItemSlots[slotIndex];
        if (!entry) return;

        for (let i = 0; i < ITEM_SLOT_COUNT; i += 1) {
            if (selectedItemSlots[i] && selectedItemSlots[i].id === entry.id) {
                selectedItemSlots[i] = null;
            }
        }
        renderSelectedItemSlots();
    }

    itemSlotButtons.forEach((button, index) => {
        button.addEventListener('click', () => {
            removeItemFromSlots(index);
        });
    });

    itemButtons.forEach((button, index) => {
        button.addEventListener('click', () => {
            const ref = renderedItemRefByButton[index];
            if (!ref) return;
            const sourcePageIndex = Math.trunc(Number(ref.pageIndex));
            const sourceItemIndex = Math.trunc(Number(ref.itemIndex));
            if (!Number.isFinite(sourcePageIndex) || sourcePageIndex < 0) return;
            if (!Number.isFinite(sourceItemIndex) || sourceItemIndex < 0) return;
            const page = itemPages[sourcePageIndex] || [];
            const item = page[sourceItemIndex];
            if (!item) return;
            if (isRoomItemDisabled(sourcePageIndex, sourceItemIndex)) return;
            addItemToSlots(item, sourcePageIndex, sourceItemIndex);
        });

        button.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            if (!isRoomMaster) return;
            const ref = renderedItemRefByButton[index];
            if (!ref) return;
            const sourcePageIndex = Math.trunc(Number(ref.pageIndex));
            const sourceItemIndex = Math.trunc(Number(ref.itemIndex));
            if (!Number.isFinite(sourcePageIndex) || sourcePageIndex < 0) return;
            if (!Number.isFinite(sourceItemIndex) || sourceItemIndex < 0) return;
            const page = itemPages[sourcePageIndex] || [];
            const item = page[sourceItemIndex];
            if (!item) return;

            const nextDisabled = !isRoomItemDisabled(sourcePageIndex, sourceItemIndex);
            setRoomItemDisabled(sourcePageIndex, sourceItemIndex, nextDisabled);
            if (nextDisabled) {
                removeDisabledItemsFromSlots();
            }
            renderItemPage();
            socket.emit('game_room_toggle_item_disabled', {
                pageIndex: sourcePageIndex,
                itemIndex: sourceItemIndex,
                disabled: nextDisabled
            });
        });
    });

    function renderItemPage() {
        currentItemPage = normalizeItemPageIndex(currentItemPage);
        const pageCount = getRenderableItemPageCount();
        const page = itemPages[currentItemPage] || [];
        if (isRoomMaster) {
            itemButtons.forEach((button, index) => {
                const item = page[index];
                const normalIconPath = String(item?.gridIconPath || '');
                const hasItem = Boolean(normalIconPath);
                const itemDisabled = hasItem && isRoomItemDisabled(currentItemPage, index);

                let isVisible = hasItem;
                let iconPath = normalIconPath;
                if (itemDisabled) {
                    iconPath = String(item?.disabledGridIconPath || normalIconPath);
                }

                renderedItemRefByButton[index] = hasItem
                    ? { pageIndex: currentItemPage, itemIndex: index }
                    : null;
                button.style.backgroundImage = isVisible ? `url('${iconPath}')` : 'none';
                button.style.visibility = isVisible ? 'visible' : 'hidden';
                button.style.pointerEvents = isVisible ? 'auto' : 'none';
                button.disabled = !isVisible;
            });
        } else {
            const visibleEntries = getNonMasterVisibleItemEntries();
            const pageSize = Math.max(1, itemButtons.length || 1);
            const start = currentItemPage * pageSize;
            const pageEntries = visibleEntries.slice(start, start + pageSize);

            itemButtons.forEach((button, visualIndex) => {
                const entry = pageEntries[visualIndex];
                if (entry) {
                    renderedItemRefByButton[visualIndex] = {
                        pageIndex: entry.pageIndex,
                        itemIndex: entry.itemIndex
                    };
                    button.style.backgroundImage = `url('${entry.iconPath}')`;
                    button.style.visibility = 'visible';
                    button.style.pointerEvents = 'auto';
                    button.disabled = false;
                } else {
                    renderedItemRefByButton[visualIndex] = null;
                    button.style.backgroundImage = 'none';
                    button.style.visibility = 'hidden';
                    button.style.pointerEvents = 'none';
                    button.disabled = true;
                }
            });
        }

        if (btnItemUp) {
            btnItemUp.disabled = !isRoomMaster && pageCount <= 1;
        }
        if (btnItemDown) {
            btnItemDown.disabled = !isRoomMaster && pageCount <= 1;
        }
    }

    if (btnItemUp) {
        btnItemUp.addEventListener('click', () => {
            shiftItemPage(-1);
        });
    }

    if (btnItemDown) {
        btnItemDown.addEventListener('click', () => {
            shiftItemPage(1);
        });
    }

    if (gameRoomScreen) {
        gameRoomScreen.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });
    }

    document.addEventListener('keydown', (event) => {
        const activeTag = document.activeElement?.tagName;
        const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
        const isAddBuddyVisible = addBuddyPopup && !addBuddyPopup.classList.contains('hidden');
        const isBuddyChatVisible = buddyChatWindow && !buddyChatWindow.classList.contains('hidden');
        const isRoomTitlePopupVisible = gameRoomTitlePopup && !gameRoomTitlePopup.classList.contains('hidden');

        if (!isTyping && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
            if (event.ctrlKey) {
                const step = event.shiftKey ? 5 : 1;
                if (event.key === 'ArrowUp') nudgeMapPanel(0, -step);
                if (event.key === 'ArrowDown') nudgeMapPanel(0, step);
                if (event.key === 'ArrowLeft') nudgeMapPanel(-step, 0);
                if (event.key === 'ArrowRight') nudgeMapPanel(step, 0);
            } else {
                moveMapByDirection(event.key);
            }
            event.preventDefault();
            return;
        }

        if (event.key === 'Enter' && !isTyping) {
            event.preventDefault();
            if (isRoomTitlePopupVisible && gameRoomTitleInput) {
                gameRoomTitleInput.focus();
                gameRoomTitleCursorController?.update();
            } else if (isBuddyChatVisible && buddyChatInput) {
                buddyChatInput.focus();
            } else if (isAddBuddyVisible && addBuddyInput) {
                addBuddyInput.focus();
            } else if (roomChatInput) {
                roomChatInput.focus();
            }
            return;
        }

        if (event.key === 'Escape' && !isTyping && isRoomTitlePopupVisible) {
            event.preventDefault();
            hideRoomTitlePopup();
            return;
        }

        if (isTyping) return;

        if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
            if (isRoomTitlePopupVisible && gameRoomTitleInput) {
                gameRoomTitleInput.focus();
                gameRoomTitleCursorController?.update();
            } else if (isBuddyChatVisible && buddyChatInput) {
                buddyChatInput.focus();
            } else if (isAddBuddyVisible && addBuddyInput) {
                addBuddyInput.focus();
            } else if (roomChatInput) {
                roomChatInput.focus();
            }
        }
    });

    renderItemPage();
    renderSelectedItemSlots();
});
