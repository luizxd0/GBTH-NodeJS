document.addEventListener('DOMContentLoaded', () => {
    const ui = window.GBTH?.ui;
    const buddyUi = window.GBTH?.buddy;
    const socket = io();
    const lobbyScreen = document.getElementById('lobby-screen');

    let userData = JSON.parse(sessionStorage.getItem('user'));

    const nicknameSpan = document.getElementById('lobby-nickname');
    const guildSpan = document.getElementById('lobby-guild');
    const rankIcon = document.getElementById('lobby-rank-icon');
    const rankingValue = document.getElementById('lobby-ranking-value');
    const goldSpan = document.getElementById('lobby-gold');
    const cashSpan = document.getElementById('lobby-cash');
    const gpSpan = document.getElementById('lobby-gp');

    const buddyPanel = document.getElementById('buddy-list-panel');
    const buddyListContent = document.querySelector('.buddy-list-content');
    const onlineCountEl = document.getElementById('buddy-online-count');
    const totalCountEl = document.getElementById('buddy-total-count');

    const addBuddyPopup = document.getElementById('add-buddy-popup');
    const addBuddyInput = document.getElementById('add-buddy-input');
    const addBuddyCursor = document.getElementById('add-buddy-cursor');
    const addBuddyGhostSpan = document.getElementById('add-buddy-input-ghost');

    const createRoomPopup = document.getElementById('create-room-popup');
    const createRoomTitleInput = document.getElementById('create-room-title');
    const createRoomTitleCursor = document.getElementById('create-room-title-cursor');
    const createRoomTitleGhostSpan = document.getElementById('create-room-title-ghost');
    const createRoomPasswordInput = document.getElementById('create-room-password');
    const createRoomPasswordCursor = document.getElementById('create-room-password-cursor');
    const createRoomPasswordGhostSpan = document.getElementById('create-room-password-ghost');
    const createRoomModeDesc = document.getElementById('create-room-mode-desc');
    const createRoomSizeButtons = document.querySelectorAll('.gamecreate-size-btn');
    const createRoomModeButtons = document.querySelectorAll('.gamecreate-mode-btn');

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
    const BUDDY_CHAT_HISTORY_KEY = 'gbth_buddy_chat_history_v1';
    const BUDDY_CHAT_HISTORY_LIMIT = 120;

    const chatInput = document.getElementById('chat-input');
    const chatCursor = document.getElementById('chat-cursor');
    const chatGhostSpan = document.getElementById('chat-input-ghost');
    const chatViewport = document.getElementById('chat-messages-content');

    const channelListContent = document.getElementById('channel-list-content');
    const lobbyRoomList = document.getElementById('lobby-room-list');
    const LOBBY_ROOMS_PAGE_SIZE = 6;
    let lobbyRoomsCache = [];
    let lobbyRoomsPageIndex = 0;

    const buddyScroll = ui?.setupScrollControls({
        viewport: buddyListContent,
        upButton: document.querySelector('.btn-buddy-scroll-up'),
        downButton: document.querySelector('.btn-buddy-scroll-down'),
        scrollAmount: 30
    });

    const channelScroll = ui?.setupScrollControls({
        viewport: channelListContent,
        upButton: document.querySelector('.btn-channel-scroll-up'),
        downButton: document.querySelector('.btn-channel-scroll-down'),
        scrollAmount: 30
    });

    const chatScroll = ui?.setupScrollControls({
        viewport: chatViewport,
        upButton: document.querySelector('.btn-chat-scroll-up'),
        downButton: document.querySelector('.btn-chat-scroll-down'),
        scrollAmount: 30
    });

    const buddyChatScroll = ui?.setupScrollControls({
        viewport: buddyChatContent,
        upButton: document.querySelector('.buddy-chat-scroll-up'),
        downButton: document.querySelector('.buddy-chat-scroll-down'),
        scrollAmount: 30
    });

    const chatCursorController = ui?.setupInputCursor({
        input: chatInput,
        cursor: chatCursor,
        ghost: chatGhostSpan,
        baseLeft: 23
    });

    const addBuddyCursorController = ui?.setupInputCursor({
        input: addBuddyInput,
        cursor: addBuddyCursor,
        ghost: addBuddyGhostSpan,
        baseLeft: 5,
        baseTop: 4,
        useInputOffset: true
    });

    const createRoomTitleCursorController = ui?.setupInputCursor({
        input: createRoomTitleInput,
        cursor: createRoomTitleCursor,
        ghost: createRoomTitleGhostSpan,
        baseLeft: 6,
        baseTop: 2,
        useInputOffset: true
    });

    const createRoomPasswordCursorController = ui?.setupInputCursor({
        input: createRoomPasswordInput,
        cursor: createRoomPasswordCursor,
        ghost: createRoomPasswordGhostSpan,
        baseLeft: 6,
        baseTop: 2,
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
    if (createRoomPopup) ui?.makeDraggable(createRoomPopup, { handleSelector: '.gamecreate-window-header' });
    if (buddyAlertPopup) ui?.makeDraggable(buddyAlertPopup);
    if (buddyChatWindow) ui?.makeDraggable(buddyChatWindow);

    buddyUi?.bindInteractions({
        listContent: buddyListContent,
        onOpenChat: (nickname) => window.openBuddyChat?.(nickname)
    });

    function updateUserUI(data) {
        if (!data) return;

        if (nicknameSpan) nicknameSpan.textContent = data.nickname;

        if (guildSpan) {
            guildSpan.textContent = data.guild && data.guild.trim() !== ''
                ? `${data.guild} [ 1/ 1]`
                : '';
        }

        if (rankingValue) rankingValue.textContent = (data.rank !== undefined ? data.rank : '1').toLocaleString();

        if (rankIcon) {
            const grade = data.grade || 24;
            rankIcon.src = `/assets/shared/rank1/rank1_frame_${grade}.png`;
        }

        if (goldSpan) goldSpan.textContent = `GOLD : ${(data.gold || 0).toLocaleString()}`;
        if (cashSpan) cashSpan.textContent = `CASH : ${(data.cash || 0).toLocaleString()}`;
        if (gpSpan) gpSpan.textContent = `${(data.score || 0).toLocaleString()} GP`;
    }

    updateUserUI(userData);

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

    socket.on('user_info_update', (data) => {
        userData = data;
        sessionStorage.setItem('user', JSON.stringify(data));
        updateUserUI(data);
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

    const CREATE_ROOM_MODE_TO_DESC_FRAME = {
        solo: 1,
        tag: 2,
        jewel: 3,
        score: 4
    };

    let selectedCreateRoomSize = '4v4';
    let selectedCreateRoomMode = 'solo';

    function updateCreateRoomModeDescription(mode) {
        if (!createRoomModeDesc) return;
        const frame = CREATE_ROOM_MODE_TO_DESC_FRAME[mode] || 1;
        createRoomModeDesc.style.backgroundImage = `url('/assets/screens/lobby/gamelist_create/gamelist_create_frame_${frame}.png')`;
    }

    function setCreateRoomSize(size) {
        selectedCreateRoomSize = size;
        createRoomSizeButtons.forEach((button) => {
            button.classList.toggle('active', button.dataset.size === size);
        });
    }

    function setCreateRoomMode(mode) {
        selectedCreateRoomMode = mode;
        createRoomModeButtons.forEach((button) => {
            button.classList.toggle('active', button.dataset.mode === mode);
        });
        updateCreateRoomModeDescription(mode);
    }

    function normalizeLobbyRoomsPayload(rooms) {
        if (!Array.isArray(rooms)) return [];

        return rooms.map((room) => {
            const roomId = Math.trunc(Number(room?.roomId || 0));
            const memberCount = Math.max(0, Math.trunc(Number(room?.memberCount || 0)));
            const maxPlayers = Math.max(1, Math.trunc(Number(room?.maxPlayers || 1)));
            return {
                roomId: Number.isFinite(roomId) && roomId > 0 ? roomId : 0,
                title: String(room?.title || '').trim(),
                mode: String(room?.mode || 'solo').trim().toLowerCase(),
                memberCount,
                maxPlayers,
                powerUser: Boolean(room?.powerUser),
                hasPassword: Boolean(room?.hasPassword),
                ownerNickname: String(room?.ownerNickname || '').trim()
            };
        }).filter((room) => room.roomId > 0)
            .sort((a, b) => {
                if (a.powerUser !== b.powerUser) return a.powerUser ? -1 : 1;
                return a.roomId - b.roomId;
            });
    }

    function getLobbyRoomsTotalPages() {
        if (!Array.isArray(lobbyRoomsCache) || lobbyRoomsCache.length <= 0) return 0;
        return Math.ceil(lobbyRoomsCache.length / LOBBY_ROOMS_PAGE_SIZE);
    }

    function clampLobbyRoomsPageIndex(pageIndex) {
        const totalPages = getLobbyRoomsTotalPages();
        if (totalPages <= 0) return 0;
        const parsed = Math.trunc(Number(pageIndex || 0));
        if (!Number.isFinite(parsed)) return 0;
        return Math.max(0, Math.min(totalPages - 1, parsed));
    }

    function updateLobbyRoomPagerButtons() {
        const totalPages = getLobbyRoomsTotalPages();
        if (btnPrev) {
            btnPrev.disabled = totalPages <= 1 || lobbyRoomsPageIndex <= 0;
        }
        if (btnNext) {
            btnNext.disabled = totalPages <= 1 || lobbyRoomsPageIndex >= totalPages - 1;
        }
    }

    function renderLobbyRoomsPage() {
        if (!lobbyRoomList) return;

        lobbyRoomsPageIndex = clampLobbyRoomsPageIndex(lobbyRoomsPageIndex);
        const startIndex = lobbyRoomsPageIndex * LOBBY_ROOMS_PAGE_SIZE;
        const normalizedRooms = lobbyRoomsCache.slice(startIndex, startIndex + LOBBY_ROOMS_PAGE_SIZE);
        const fragment = document.createDocumentFragment();

        normalizedRooms.forEach((room, index) => {
            const slot = document.createElement('button');
            const isLeftColumn = index < 3;
            slot.type = 'button';
            slot.className = `lobby-room-slot ${isLeftColumn ? 'left' : 'right'}${room.powerUser ? ' power-user' : ''}`;

            const numberEl = document.createElement('div');
            numberEl.className = 'lobby-room-number';
            numberEl.textContent = String(room.roomId);

            const titleEl = document.createElement('div');
            titleEl.className = 'lobby-room-title';
            titleEl.textContent = room.title || (room.ownerNickname ? `${room.ownerNickname}'s Room` : `Room ${room.roomId}`);

            const metaEl = document.createElement('div');
            metaEl.className = 'lobby-room-meta';
            const modeLabel = room.mode ? room.mode.toUpperCase() : 'SOLO';
            const lockLabel = room.hasPassword ? ' LOCK' : '';
            metaEl.textContent = `${room.memberCount}/${room.maxPlayers} ${modeLabel}${lockLabel}`;

            slot.appendChild(numberEl);
            slot.appendChild(titleEl);
            slot.appendChild(metaEl);
            fragment.appendChild(slot);
        });

        lobbyRoomList.innerHTML = '';
        lobbyRoomList.appendChild(fragment);
        updateLobbyRoomPagerButtons();
    }

    function setLobbyRooms(rooms) {
        lobbyRoomsCache = normalizeLobbyRoomsPayload(rooms);
        lobbyRoomsPageIndex = clampLobbyRoomsPageIndex(lobbyRoomsPageIndex);
        renderLobbyRoomsPage();
    }

    function shiftLobbyRoomsPage(delta) {
        const totalPages = getLobbyRoomsTotalPages();
        if (totalPages <= 1) {
            lobbyRoomsPageIndex = 0;
            updateLobbyRoomPagerButtons();
            return;
        }
        const targetPage = clampLobbyRoomsPageIndex(lobbyRoomsPageIndex + Math.trunc(Number(delta || 0)));
        if (targetPage === lobbyRoomsPageIndex) {
            updateLobbyRoomPagerButtons();
            return;
        }
        lobbyRoomsPageIndex = targetPage;
        renderLobbyRoomsPage();
    }

    function hideCreateRoomPopup() {
        createRoomPopup?.classList.add('hidden');
        setCreateRoomCursorTarget(null);
    }

    function setCreateRoomCursorTarget(target) {
        if (createRoomTitleCursor) {
            createRoomTitleCursor.style.display = target === 'title' ? 'block' : 'none';
        }
        if (createRoomPasswordCursor) {
            createRoomPasswordCursor.style.display = target === 'password' ? 'block' : 'none';
        }
    }

    function centerLobbyPopup(element, offsetX = 0, offsetY = 0) {
        if (!element) return;
        ui?.centerInContainer?.({
            element,
            container: lobbyScreen,
            offsetX,
            offsetY
        });
    }

    function showAddBuddyPopup({ resetInput = true } = {}) {
        if (!addBuddyPopup) return;
        addBuddyPopup.classList.remove('hidden');
        centerLobbyPopup(addBuddyPopup);

        if (addBuddyInput) {
            if (resetInput) {
                addBuddyInput.value = '';
            }
            addBuddyInput.focus();
            addBuddyCursorController?.update();
        }
    }

    function showCreateRoomPopup() {
        if (!createRoomPopup) return;
        createRoomPopup.classList.remove('hidden');
        centerLobbyPopup(createRoomPopup);
        setCreateRoomSize('4v4');
        setCreateRoomMode('solo');
        setCreateRoomCursorTarget('title');

        if (createRoomTitleInput) {
            if (!createRoomTitleInput.value.trim()) {
                const nickname = String(userData?.nickname || 'Room').trim();
                createRoomTitleInput.value = `${nickname}'s Room`;
            }
            createRoomTitleInput.focus();
            createRoomTitleInput.select();
            createRoomTitleCursorController?.update();
        }
        if (createRoomPasswordInput) {
            createRoomPasswordInput.value = '';
        }
        createRoomPasswordCursorController?.update();
    }

    function submitCreateRoom() {
        const roomTitleInput = String(createRoomTitleInput?.value || '').trim();
        const nickname = String(userData?.nickname || 'Room').trim();
        const teamSize = Number.parseInt(selectedCreateRoomSize.charAt(0), 10) || 4;

        const roomConfig = {
            title: roomTitleInput || `${nickname}'s Room`,
            password: String(createRoomPasswordInput?.value || ''),
            mode: selectedCreateRoomMode,
            teamSize,
            slotLabel: selectedCreateRoomSize,
            createdAt: Date.now()
        };

        sessionStorage.setItem('gbth_pending_room', JSON.stringify(roomConfig));

        if (userData) {
            socket.emit('set_user_data', {
                nickname: userData.nickname,
                id: userData.id,
                gender: userData.gender,
                grade: userData.grade || 24,
                guild: userData.guild || '',
                authority: userData.authority || 0,
                location: 'game_room',
                roomKey: String(roomConfig.createdAt),
                roomTitle: roomConfig.title,
                mode: roomConfig.mode,
                teamSize: roomConfig.teamSize,
                slotLabel: roomConfig.slotLabel,
                password: roomConfig.password,
                createdAt: roomConfig.createdAt
            });
        }

        hideCreateRoomPopup();
        window.playTransition('closing', () => {
            window.location.href = '/views/game_room/index.html';
        });
    }

    createRoomSizeButtons.forEach((button) => {
        button.addEventListener('click', () => {
            setCreateRoomSize(button.dataset.size || '4v4');
        });
    });

    createRoomModeButtons.forEach((button) => {
        button.addEventListener('click', () => {
            setCreateRoomMode(button.dataset.mode || 'solo');
        });
    });

    const btnGameCreateCreate = document.getElementById('btn-gamecreate-create');
    const btnGameCreateCancel = document.getElementById('btn-gamecreate-cancel');

    if (btnGameCreateCreate) {
        btnGameCreateCreate.addEventListener('click', submitCreateRoom);
    }

    if (btnGameCreateCancel) {
        btnGameCreateCancel.addEventListener('click', hideCreateRoomPopup);
    }

    if (createRoomTitleInput) {
        createRoomTitleInput.addEventListener('focus', () => {
            setCreateRoomCursorTarget('title');
        });
        createRoomTitleInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            createRoomPasswordInput?.focus();
            createRoomPasswordCursorController?.update();
        });
    }

    if (createRoomPasswordInput) {
        createRoomPasswordInput.addEventListener('focus', () => {
            setCreateRoomCursorTarget('password');
        });
        createRoomPasswordInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            submitCreateRoom();
        });
    }

    const buttons = [
        'btn-lobby-exit', 'btn-lobby-buddy', 'btn-lobby-ranking',
        'btn-lobby-avatar', 'btn-lobby-create', 'btn-lobby-join',
        'btn-view-all', 'btn-waiting', 'btn-friends', 'btn-goto',
        'btn-nav-prev', 'btn-nav-next'
    ];

    buttons.forEach((id) => {
        const button = document.getElementById(id);
        if (!button) return;

        button.addEventListener('click', () => {
            if (id === 'btn-lobby-exit') {
                socket.emit('leave_lobby');
                window.location.href = '/views/world_list.html';
            }
            if (id === 'btn-lobby-buddy') {
                toggleBuddyPanel();
            }
            if (id === 'btn-lobby-create') {
                showCreateRoomPopup();
            }
            if (id === 'btn-lobby-avatar') {
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
                window.playTransition('closing', () => {
                    window.location.href = '/views/avatar_shop.html';
                });
            }
        });
    });

    const btnRanking = document.getElementById('btn-lobby-ranking');
    const btnJoin = document.getElementById('btn-lobby-join');
    const btnPrev = document.getElementById('btn-nav-prev');
    const btnNext = document.getElementById('btn-nav-next');

    if (btnRanking) btnRanking.disabled = true;
    if (btnJoin) btnJoin.disabled = true;
    updateLobbyRoomPagerButtons();

    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            shiftLobbyRoomsPage(-1);
        });
    }

    if (btnNext) {
        btnNext.addEventListener('click', () => {
            shiftLobbyRoomsPage(1);
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
            showAddBuddyPopup({ resetInput: true });
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
        if (!buddyAlertPopup || !buddyAlertTextBox || !btnBuddyAlertYes || !btnBuddyAlertNo) return;

        buddyAlertTextBox.textContent = message;
        buddyAlertPopup.classList.remove('hidden');
        currentAlertCallbacks = { onYes, onNo };
        centerLobbyPopup(buddyAlertPopup);

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
    const submitBuddyInvite = () => {
        const nickname = addBuddyInput?.value.trim() || '';
        const currentNickname = userData?.nickname || '';

        if (nickname.toLowerCase() === currentNickname.toLowerCase()) {
            window.showBuddyAlert("You can't add your nickname to buddy.");
            return;
        }

        if (nickname === 'Perry') {
            window.showBuddyAlert(`'${nickname}' is already your friend.`);
            return;
        }

        if (nickname !== '') {
            socket.emit('send_buddy_request', nickname);
        }
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

    socket.on('incoming_buddy_request', (data) => {
        window.showBuddyAlert(`'${data.fromNickname}' Is trying to enter on your buddy list, Do you accept?`, {
            showNoButton: true,
            onYes: () => socket.emit('respond_buddy_request', { fromNickname: data.fromNickname, fromId: data.fromId, accepted: true }),
            onNo: () => socket.emit('respond_buddy_request', { fromNickname: data.fromNickname, fromId: data.fromId, accepted: false })
        });
    });

    socket.on('buddy_request_sent', (data) => {
        const nickname = String(data?.nickname || '').trim();
        if (!nickname) return;
        window.showBuddyAlert(`You trying to add ${nickname} to the buddy list, wait for an answer.`);
        addBuddyPopup?.classList.add('hidden');
    });

    socket.on('buddy_request_error', (data) => {
        const message = String(data?.message || 'Unable to send buddy request.');
        window.showBuddyAlert(message);
        if (addBuddyPopup && addBuddyPopup.classList.contains('hidden')) {
            showAddBuddyPopup({ resetInput: false });
        }
        if (addBuddyInput) {
            addBuddyInput.focus();
            addBuddyCursorController?.update();
        }
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
            const selected = document.querySelector('.buddy-item.selected');
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

        const msgDiv = document.createElement('div');
        msgDiv.className = 'buddy-chat-msg';
        msgDiv.innerHTML = `<span class="sender">${sender}]</span> ${message}`;
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
        if (!buddyChatWindow) return;
        if (userData && userData.nickname.toLowerCase() === nickname.toLowerCase()) return;

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
            const toNickname = buddyChatNickname.textContent;
            if (!message || !toNickname || !userData) return;

            socket.emit('private_message', { toNickname, message });
            appendBuddyChatMessage(toNickname, userData.nickname, message);
            buddyChatInput.value = '';
            buddyChatCursorController?.update();
        });
    }

    socket.on('private_message', (data) => {
        const { fromNickname, message } = data;
        window.openBuddyChat(fromNickname);
        appendBuddyChatMessage(fromNickname, fromNickname, message);
    });

    socket.on('lobby_message', (data) => {
        if (!chatViewport) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${data.type} ${data.color || ''}`;

        if (data.type === 'user') {
            const gmIconHtml = data.authority === 100 ? '<img src="/assets/shared/icon/icon_frame_4.png" class="gm-chat-icon">' : '';
            const guildHtml = data.guild ? `<span class="chat-guild">${data.guild}</span>` : '';
            msgDiv.innerHTML = `${gmIconHtml}${guildHtml}<span class="nickname">${data.nickname}]</span> ${data.message}`;
        } else if (data.type === 'broadcast') {
            const iconHtml = data.icon ? `<img src="/assets/shared/icon/${data.icon}.png" class="gm-chat-icon">` : '';
            msgDiv.innerHTML = `${iconHtml}${data.message}`;
            msgDiv.classList.add('yellow');
        } else {
            msgDiv.textContent = `${data.icon ? `${data.icon} ` : ''}${data.message}`;
        }

        const isAtBottom = chatViewport.scrollHeight - chatViewport.scrollTop <= chatViewport.clientHeight + 40;
        chatViewport.appendChild(msgDiv);

        if (isAtBottom) {
            chatViewport.scrollTop = chatViewport.scrollHeight;
        }

        window.setTimeout(() => chatScroll?.update(), 50);
    });

    socket.on('channel_users', (users) => {
        if (!channelListContent) return;

        const fragment = document.createDocumentFragment();

        users.forEach((user) => {
            const item = document.createElement('div');
            item.className = 'channel-item';

            const genderSrc = user.gender === 0
                ? '/assets/shared/avataimsi/avataimsi_frame_1.png'
                : '/assets/shared/avataimsi/avataimsi_frame_2.png';

            const rankSrc = `/assets/shared/rank1/rank1_frame_${user.grade || 24}.png`;

            item.innerHTML = `
                <div class="channel-gender-box">
                    <img src="${genderSrc}" class="channel-gender-icon">
                </div>
                <div class="channel-rank-box">
                    <img src="${rankSrc}" class="channel-rank-icon">
                </div>
                <div class="channel-info">
                    <div class="channel-guild">${user.guild || ''}</div>
                    <div class="channel-nickname">${user.nickname}</div>
                </div>
            `;

            item.addEventListener('dblclick', () => {
                if (user.nickname) {
                    window.openBuddyChat(user.nickname);
                }
            });

            fragment.appendChild(item);
        });

        channelListContent.innerHTML = '';
        channelListContent.appendChild(fragment);
        window.setTimeout(() => channelScroll?.update(), 50);
    });

    socket.on('lobby_rooms', (rooms) => {
        setLobbyRooms(rooms);
    });
    socket.emit('get_lobby_rooms');

    function sendSystemWelcome(chId = 1) {
        if (!chatViewport) return;

        const nickname = userData ? userData.nickname : 'Player';
        const now = new Date();

        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const timeStr = now.toTimeString().split(' ')[0];
        const ukDateStr = `${day}/${month}/${year} ${timeStr}`;

        const hour = now.getHours();
        let greeting = 'Good night';
        if (hour >= 5 && hour < 12) greeting = 'Good morning';
        else if (hour >= 12 && hour < 18) greeting = 'Good afternoon';
        else if (hour >= 18 && hour < 22) greeting = 'Good evening';

        const systemMessages = [
            { message: "GunBound Classic Thor's Hammer", color: 'orange' },
            { message: `${greeting} ${nickname}`, color: 'green' },
            { message: `Joined Channel ${chId} at ${ukDateStr}`, color: 'yellow' }
        ];

        systemMessages.forEach((msg, index) => {
            setTimeout(() => {
                const div = document.createElement('div');
                div.className = `chat-message ${msg.color}`;
                div.textContent = msg.message;
                chatViewport.appendChild(div);
                chatScroll?.update();
                chatViewport.scrollTop = chatViewport.scrollHeight;
            }, index * 100);
        });
    }

    let currentChannel = 1;
    let isChannelLoading = false;

    const btnChButtons = document.querySelectorAll('.ch-btn');

    function updateChannelButtonsUI() {
        btnChButtons.forEach((button) => {
            const chId = parseInt(button.dataset.channel, 10);
            button.classList.remove('active', 'loading');
            if (chId === currentChannel) {
                button.classList.add('active');
            }
        });
    }

    function switchChannel(newChannelId) {
        if (isChannelLoading || newChannelId === currentChannel) return;

        isChannelLoading = true;

        btnChButtons.forEach((button) => {
            button.classList.remove('active');
            button.classList.add('loading');
        });

        setTimeout(() => {
            currentChannel = newChannelId;
            isChannelLoading = false;

            if (chatViewport) chatViewport.innerHTML = '';

            socket.emit('switch_channel', newChannelId);
            updateChannelButtonsUI();
            sendSystemWelcome(newChannelId);
        }, 250);
    }

    btnChButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const chId = parseInt(button.dataset.channel, 10);
            switchChannel(chId);
        });
    });

    if (chatInput) {
        chatInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;

            const message = chatInput.value.trim();
            if (!message) return;

            socket.emit('lobby_message', message);
            chatInput.value = '';
            chatCursorController?.update();
        });

        window.addEventListener('focus', () => chatCursorController?.update());
    }

    document.addEventListener('keydown', (event) => {
        const isCreateRoomVisible = createRoomPopup && !createRoomPopup.classList.contains('hidden');
        if (event.key === 'Escape' && isCreateRoomVisible) {
            event.preventDefault();
            hideCreateRoomPopup();
            return;
        }

        const activeTag = document.activeElement?.tagName;
        const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
        if (isTyping) return;

        if (event.key.length !== 1 && event.key !== 'Backspace' && event.key !== 'Delete') return;

        const isAddBuddyVisible = addBuddyPopup && !addBuddyPopup.classList.contains('hidden');
        const isBuddyChatVisible = buddyChatWindow && !buddyChatWindow.classList.contains('hidden');

        if (isCreateRoomVisible && createRoomTitleInput) {
            createRoomTitleInput.focus();
        } else if (isBuddyChatVisible && buddyChatInput) {
            buddyChatInput.focus();
        } else if (isAddBuddyVisible && addBuddyInput) {
            addBuddyInput.focus();
        } else if (chatInput) {
            chatInput.focus();
        }
    });

    window.setTimeout(() => {
        buddyScroll?.update();
        channelScroll?.update();
        chatScroll?.update();
        buddyChatScroll?.update();
        setCreateRoomCursorTarget(null);
        createRoomTitleCursorController?.update();
        createRoomPasswordCursorController?.update();
        updateChannelButtonsUI();
        sendSystemWelcome(1);
    }, 100);
});

