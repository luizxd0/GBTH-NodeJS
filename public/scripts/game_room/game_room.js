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
    let selectedMobile = 15;

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
        if (index === 14) return 16; // Aduka preview card
        if (index === 15) return 15; // Random preview card
        return index;
    }

    function updateMobilePreview(index) {
        if (!mobilePreviewEl) return;
        const previewFrame = getMobilePreviewFrame(index);
        mobilePreviewEl.style.backgroundImage = `url('/assets/screens/game_room/ready_selectcharacter/ready_selectcharacter_frame_${previewFrame}.png')`;
    }

    function setSelectedMobile(index) {
        selectedMobile = index;
        for (let i = 1; i <= mobileButtons.length; i++) {
            const button = mobileButtons[i - 1];
            if (!button) continue;
            const isSelected = i === index;
            button.classList.toggle('selected', isSelected);
            applyMobileButtonFrame(i, isSelected ? 4 : 0);
        }
        updateMobilePreview(index);
    }

    if (mobileGrid) {
        for (let i = 1; i <= 15; i++) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'game-room-mobile-btn';
            button.dataset.mobile = String(i);
            button.style.backgroundImage = `url('${getMobileButtonPath(i, 0)}')`;

            button.addEventListener('mouseenter', () => {
                if (selectedMobile === i) return;
                applyMobileButtonFrame(i, 1);
            });

            button.addEventListener('mouseleave', () => {
                if (selectedMobile === i) return;
                applyMobileButtonFrame(i, 0);
            });

            button.addEventListener('mousedown', () => {
                if (selectedMobile === i) return;
                applyMobileButtonFrame(i, 2);
            });

            button.addEventListener('mouseup', () => {
                if (selectedMobile === i) return;
                applyMobileButtonFrame(i, 1);
            });

            button.addEventListener('click', () => {
                setSelectedMobile(i);
            });

            mobileButtons.push(button);
            mobileGrid.appendChild(button);
        }
    }

    setSelectedMobile(15);

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
    const itemButtons = Array.from(document.querySelectorAll('#game-room-item-grid .game-room-item-btn'));

    if (btnExit) {
        btnExit.addEventListener('click', () => {
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
            const next = selectedMobile >= 15 ? 1 : selectedMobile + 1;
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
        ],
        [
            '/assets/screens/game_room/ready_itemshop2/ready_itemshop2_frame_10.png',
            '/assets/screens/game_room/ready_itemshop2/ready_itemshop2_frame_18.png'
        ]
    ];

    let currentItemPage = 0;

    function renderItemPage() {
        const page = itemPages[currentItemPage] || [];
        itemButtons.forEach((button, index) => {
            const iconPath = page[index];
            const hasItem = Boolean(iconPath);
            button.style.backgroundImage = hasItem ? `url('${iconPath}')` : 'none';
            button.style.visibility = hasItem ? 'visible' : 'hidden';
            button.style.pointerEvents = hasItem ? 'auto' : 'none';
            button.disabled = !hasItem;
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
});
