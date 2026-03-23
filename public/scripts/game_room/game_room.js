document.addEventListener('DOMContentLoaded', () => {
    const ui = window.GBTH?.ui;
    const buddyUi = window.GBTH?.buddy;
    const socket = io();

    const userData = JSON.parse(sessionStorage.getItem('user') || 'null');
    const roomConfig = JSON.parse(sessionStorage.getItem('gbth_pending_room') || 'null') || {};
    const selectedServerName = String(sessionStorage.getItem('gbth_selected_server_name') || '').trim();
    const roomKey = String(roomConfig?.createdAt || roomConfig?.title || userData?.id || '').trim();

    const roomTitleEl = document.getElementById('game-room-room-title');
    const roomNumberEl = document.getElementById('game-room-room-number');
    const serverTitleEl = document.getElementById('game-room-server-title');
    const gameRoomScreen = document.getElementById('game-room-screen');
    const mapPanelEl = document.getElementById('game-room-map-panel');
    const mapCardEl = document.getElementById('game-room-map-card');
    const mobilePreviewEl = document.getElementById('game-room-mobile-preview');
    const roomChatFeedEl = document.getElementById('game-room-chat-feed');
    const roomChatInput = document.getElementById('game-room-chat-input');
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
        const nickname = String(data?.nickname || '').trim();
        const message = String(data?.message || '').trim();
        if (!nickname || !message) return;
        roomChatFeedEl.textContent = `${nickname}] ${message}`;
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
    let roomMemberCount = 1;
    if (roomNumberEl) {
        roomNumberEl.textContent = '';
    }
    if (roomTitleEl) {
        roomTitleEl.textContent = String(roomConfig.title || fallbackTitle);
    }

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
        socket.emit('set_user_data', {
            nickname: userData.nickname,
            id: userData.id,
            gender: userData.gender,
            grade: userData.grade || 24,
            guild: userData.guild || '',
            authority: userData.authority || 0,
            location: 'game_room',
            roomKey: roomKey || `room:${userData.id}`
        });
    }

    socket.on('buddy_list_data', (data) => {
        if (onlineCountEl) onlineCountEl.textContent = String(data?.onlineCount ?? 0);
        if (totalCountEl) totalCountEl.textContent = String(data?.totalCount ?? 0);
        buddyUi?.renderList(buddyListContent, data?.buddies || [], { includeIdDataset: true });
        window.setTimeout(() => buddyScroll?.update(), 50);
    });

    socket.on('game_room_message', (data) => {
        appendRoomChatMessage(data);
    });

    socket.on('game_room_presence', (data) => {
        const roomId = Math.trunc(Number(data?.roomId || 0));
        isRoomMaster = Boolean(data?.isMaster);
        roomMemberCount = Math.max(1, Math.trunc(Number(data?.memberCount || 1)));
        updateMapControlPermissions();
        if (roomNumberEl) {
            roomNumberEl.textContent = String(roomId > 0 ? roomId : 1);
        }
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
    const AVATAR_SEAT_ADJUST_BY_ASSET = AVATAR_SYNC_CONFIG.seatAdjustByAsset || mobilePoseConfig.avatarSeatAdjustByAsset || {};
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
    let slotMobileBaseOffsetX = -35;
    let slotMobileBaseOffsetY = -30;
    let slotAvatarDynamicSeatX = 0;
    let slotAvatarDynamicSeatY = 0;
    let localPlayerSlot = null;

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

    function getMobileBaseOffsetForAsset(assetIndex) {
        const pose = MOBILE_ASSET_POSE[Math.trunc(Number(assetIndex))] || {};
        const mobileOffset = pose.mobileOffset || {};
        return {
            x: Number.isFinite(Number(mobileOffset.x)) ? Math.trunc(Number(mobileOffset.x)) : -35,
            y: Number.isFinite(Number(mobileOffset.y)) ? Math.trunc(Number(mobileOffset.y)) : -30
        };
    }

    function getAvatarSeatAdjustForAsset(assetIndex) {
        const normalizedAssetIndex = Math.trunc(Number(assetIndex));
        const adjust = AVATAR_SEAT_ADJUST_BY_ASSET[normalizedAssetIndex] || {};
        return {
            left: Number.isFinite(Number(adjust.left)) ? Math.trunc(Number(adjust.left)) : 0,
            bottom: Number.isFinite(Number(adjust.bottom)) ? Math.trunc(Number(adjust.bottom)) : 0
        };
    }

    function applyAvatarPlacementForMobile(assetIndex) {
        if (!slotAvatarContainerEl) return;
        const normalizedAssetIndex = Math.trunc(Number(assetIndex));
        const pose = MOBILE_ASSET_POSE[normalizedAssetIndex] || {};
        const useReferenceAvatarOffset = AVATAR_SYNC_CONFIG.useReferenceAvatarOffset === true;
        const referencePose = MOBILE_ASSET_POSE[RIDER_ASSET_INDEX] || {};
        const avatarOffset = useReferenceAvatarOffset
            ? (referencePose.avatarOffset || {})
            : (pose.avatarOffset || {});
        let avatarBottom = Number.isFinite(Number(avatarOffset.bottom)) ? Math.trunc(Number(avatarOffset.bottom)) : 20;
        let avatarLeft = Number.isFinite(Number(avatarOffset.left)) ? Math.trunc(Number(avatarOffset.left)) : 0;
        if (AVATAR_SYNC_ENABLED && !AVATAR_SYNC_DISABLED_ASSETS.has(normalizedAssetIndex)) {
            const mobileOffset = getMobileBaseOffsetForAsset(normalizedAssetIndex);
            const syncX = (mobileOffset.x - AVATAR_SYNC_REFERENCE_OFFSET.x) * AVATAR_SYNC_X_FACTOR;
            const syncY = (mobileOffset.y - AVATAR_SYNC_REFERENCE_OFFSET.y) * AVATAR_SYNC_Y_FACTOR;
            const clampedSyncX = Math.max(-AVATAR_SYNC_MAX_DELTA_X, Math.min(AVATAR_SYNC_MAX_DELTA_X, Math.trunc(syncX)));
            const clampedSyncY = Math.max(-AVATAR_SYNC_MAX_DELTA_Y, Math.min(AVATAR_SYNC_MAX_DELTA_Y, Math.trunc(syncY)));
            avatarLeft += clampedSyncX;
            avatarBottom += clampedSyncY;
        }
        const seatAdjust = getAvatarSeatAdjustForAsset(normalizedAssetIndex);
        avatarLeft += seatAdjust.left;
        avatarBottom += seatAdjust.bottom;
        avatarLeft += slotAvatarDynamicSeatX;
        avatarBottom += slotAvatarDynamicSeatY;
        slotAvatarContainerEl.style.bottom = `${avatarBottom}px`;
        slotAvatarContainerEl.style.left = `calc(50% + ${avatarLeft}px)`;
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
            slotMobileImgEl.style.transform = getMobileTransformForAsset();
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



    function findPlayerSlot() {
        // Place local player in first available Team A slot by default
        const teamASlots = slotElementsByTeam.A || [];
        for (const slot of teamASlots) {
            if (slot && !isSlotOccupied(slot)) {
                return slot;
            }
        }
        // Fallback: try Team B
        const teamBSlots = slotElementsByTeam.B || [];
        for (const slot of teamBSlots) {
            if (slot && !isSlotOccupied(slot)) {
                return slot;
            }
        }
        // Last fallback: first Team A slot
        return teamASlots[0] || null;
    }

    function renderSlotAvatar(slotElement, user) {
        if (!slotElement || !user) return;
        localPlayerSlot = slotElement;
        slotElement.dataset.occupied = '1';
        slotElement.dataset.userId = String(user.id || '');

        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'slot-avatar-wrapper';

        // Create avatar container
        const avatarContainer = document.createElement('div');
        avatarContainer.className = 'slot-avatar-container';
        avatarContainer.style.zIndex = '1';
        slotAvatarContainerEl = avatarContainer;
        wrapper.appendChild(avatarContainer);

        // Create mobile image element
        slotMobileImgEl = document.createElement('img');
        slotMobileImgEl.className = 'slot-mobile-img';
        slotMobileImgEl.alt = '';
        slotMobileImgEl.draggable = false;
        slotMobileImgEl.style.zIndex = '3';
        wrapper.appendChild(slotMobileImgEl);
        const isTeamA = slotElement.classList.contains('team-a');
        avatarContainer.style.transform = isTeamA
            ? 'translateX(-50%) scaleX(-1)'
            : 'translateX(-50%) scaleX(1)';
        slotMobileImgEl.style.transform = getMobileTransformForAsset();

        slotElement.appendChild(wrapper);

        // Create nickname label
        const nicknameEl = document.createElement('div');
        nicknameEl.className = 'slot-nickname';
        nicknameEl.textContent = String(user.nickname || '').trim();
        slotElement.appendChild(nicknameEl);

        // Start animated avatar
        if (window.AvatarPreviewRuntime) {
            window.AvatarPreviewRuntime.createAnimator(avatarContainer, {
                gender: user.gender,
                ahead: user.ahead,
                abody: user.abody,
                aeyes: user.aeyes,
                aflag: user.aflag
            }, {
                rootId: 'avatar-shop-character-preview',
                context: 'game_room',
                effectVariant: 'legacy'
            }).then((animator) => {
                slotAvatarAnimator = animator;
            }).catch((err) => {
                console.warn('[GameRoom] Avatar animator error:', err);
            });
        }

        // Start mobile animation with random mobile (default)
        startMobileAnimation(selectedMobile);
    }

    function destroySlotAvatar() {
        stopMobileAnimation();
        if (slotAvatarAnimator) {
            slotAvatarAnimator.destroy();
            slotAvatarAnimator = null;
        }
        if (localPlayerSlot) {
            const wrapper = localPlayerSlot.querySelector('.slot-avatar-wrapper');
            if (wrapper) wrapper.remove();
            const nickname = localPlayerSlot.querySelector('.slot-nickname');
            if (nickname) nickname.remove();
            localPlayerSlot.dataset.occupied = '';
            localPlayerSlot.dataset.userId = '';
            localPlayerSlot = null;
        }
        slotAvatarContainerEl = null;
        slotMobileImgEl = null;
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
            const next = selectedMobile >= MOBILE_SELECTION_MAX ? MOBILE_SELECTION_MIN : selectedMobile + 1;
            setSelectedMobile(next);
        });
    }

    if (btnStart) {
        btnStart.addEventListener('click', () => {
            showError('Room', 'Start game flow is not implemented yet.');
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
    let nextSelectedItemEntryId = 1;

    let currentItemPage = 0;

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
            const page = itemPages[currentItemPage] || [];
            const item = page[index];
            if (!item) return;
            if (isRoomItemDisabled(currentItemPage, index)) return;
            addItemToSlots(item, currentItemPage, index);
        });

        button.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            const page = itemPages[currentItemPage] || [];
            const item = page[index];
            if (!item) return;
            if (!isRoomMaster) return;

            const nextDisabled = !isRoomItemDisabled(currentItemPage, index);
            setRoomItemDisabled(currentItemPage, index, nextDisabled);
            if (nextDisabled) {
                removeDisabledItemsFromSlots();
            }
            renderItemPage();
            socket.emit('game_room_toggle_item_disabled', {
                pageIndex: currentItemPage,
                itemIndex: index,
                disabled: nextDisabled
            });
        });
    });

    function renderItemPage() {
        const page = itemPages[currentItemPage] || [];
        itemButtons.forEach((button, index) => {
            const item = page[index];
            const normalIconPath = String(item?.gridIconPath || '');
            const hasItem = Boolean(normalIconPath);
            const itemDisabled = hasItem && isRoomItemDisabled(currentItemPage, index);

            let isVisible = hasItem;
            let iconPath = normalIconPath;
            if (itemDisabled) {
                if (isRoomMaster) {
                    iconPath = String(item?.disabledGridIconPath || normalIconPath);
                } else {
                    isVisible = false;
                }
            }

            button.style.backgroundImage = isVisible ? `url('${iconPath}')` : 'none';
            button.style.visibility = isVisible ? 'visible' : 'hidden';
            button.style.pointerEvents = isVisible ? 'auto' : 'none';
            button.disabled = !isVisible;
        });

        if (btnItemUp) {
            btnItemUp.disabled = currentItemPage <= 0;
        }
        if (btnItemDown) {
            btnItemDown.disabled = currentItemPage >= itemPages.length - 1;
        }
    }

    if (btnItemUp) {
        btnItemUp.addEventListener('click', () => {
            if (currentItemPage <= 0) return;
            currentItemPage -= 1;
            renderItemPage();
        });
    }

    if (btnItemDown) {
        btnItemDown.addEventListener('click', () => {
            if (currentItemPage >= itemPages.length - 1) return;
            currentItemPage += 1;
            renderItemPage();
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
            if (isBuddyChatVisible && buddyChatInput) {
                buddyChatInput.focus();
            } else if (isAddBuddyVisible && addBuddyInput) {
                addBuddyInput.focus();
            } else if (roomChatInput) {
                roomChatInput.focus();
            }
            return;
        }

        if (isTyping) return;

        if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
            if (isBuddyChatVisible && buddyChatInput) {
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
