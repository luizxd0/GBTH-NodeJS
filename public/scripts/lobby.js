document.addEventListener('DOMContentLoaded', () => {
    const ui = window.GBTH?.ui;
    const buddyUi = window.GBTH?.buddy;
    const socket = io();
    const lobbyScreen = document.getElementById('lobby-screen');

    let lobbyJoinNavigation = null;

    function clearLobbyJoinNavigation() {
        if (!lobbyJoinNavigation) return;
        if (lobbyJoinNavigation.timeoutId) {
            window.clearTimeout(lobbyJoinNavigation.timeoutId);
        }
        if (lobbyJoinNavigation.presenceHandler) {
            socket.off('game_room_presence', lobbyJoinNavigation.presenceHandler);
        }
        lobbyJoinNavigation = null;
    }

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
    const LOBBY_STAGE_FRAME_COUNT = 22;
    const JOIN_ROOM_PASSWORD_MAX_LEN = 4;
    let lobbyRoomsCache = [];
    let lobbyRoomsPageIndex = 0;
    /** Lobby room list filter: all rooms, only waiting, or only rooms with a buddy member. */
    let lobbyRoomNavFilter = 'all';
    /** Buddy user ids (from `buddy_list_data`) — used to show headcount friend icon on room rows. */
    const lobbyBuddyIds = new Set();

    function syncLobbyBuddyIdsFromBuddyList(buddies) {
        lobbyBuddyIds.clear();
        if (!Array.isArray(buddies)) return;
        buddies.forEach((entry) => {
            const id = String(entry?.id ?? '').trim();
            if (id) lobbyBuddyIds.add(id);
        });
    }

    function lobbyRoomHasBuddyMember(room) {
        const ids = Array.isArray(room?.memberIds) ? room.memberIds : [];
        for (let i = 0; i < ids.length; i += 1) {
            const id = String(ids[i] ?? '').trim();
            if (id && lobbyBuddyIds.has(id)) return true;
        }
        return false;
    }

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

    const joinRoomPasswordPopup = document.getElementById('join-room-password-popup');
    const joinRoomPasswordInput = document.getElementById('join-room-password-input');
    const joinRoomPasswordCursor = document.getElementById('join-room-password-cursor');
    const joinRoomPasswordGhostSpan = document.getElementById('join-room-password-ghost');
    const btnJoinRoomPasswordOk = document.getElementById('btn-join-room-password-ok');
    const btnJoinRoomPasswordCancel = document.getElementById('btn-join-room-password-cancel');

    const joinRoomPasswordCursorController = ui?.setupInputCursor({
        input: joinRoomPasswordInput,
        cursor: joinRoomPasswordCursor,
        ghost: joinRoomPasswordGhostSpan,
        baseLeft: 6,
        baseTop: 4,
        useInputOffset: true
    });

    if (joinRoomPasswordInput) {
        joinRoomPasswordInput.maxLength = JOIN_ROOM_PASSWORD_MAX_LEN;
        joinRoomPasswordInput.addEventListener('input', () => {
            const v = String(joinRoomPasswordInput.value || '');
            if (v.length <= JOIN_ROOM_PASSWORD_MAX_LEN) return;
            joinRoomPasswordInput.value = v.slice(0, JOIN_ROOM_PASSWORD_MAX_LEN);
            joinRoomPasswordCursorController?.update();
        });
    }

    const lobbyDirectGoPopup = document.getElementById('lobby-direct-go-popup');
    const directGoRoomInput = document.getElementById('direct-go-room-input');
    const directGoRoomCursor = document.getElementById('direct-go-room-cursor');
    const directGoRoomGhostSpan = document.getElementById('direct-go-room-ghost');
    const directGoPasswordInput = document.getElementById('direct-go-password-input');
    const directGoPasswordCursor = document.getElementById('direct-go-password-cursor');
    const directGoPasswordGhostSpan = document.getElementById('direct-go-password-ghost');
    const btnDirectGoOk = document.getElementById('btn-direct-go-ok');
    const btnDirectGoCancel = document.getElementById('btn-direct-go-cancel');
    const DIRECT_GO_ROOM_INPUT_MAX_LEN = 8;

    const roomDetailsPopup = document.getElementById('room-details-popup');
    const roomDetailsLayoutLeft = roomDetailsPopup?.querySelector?.('.room-details-layout--left') || null;
    const roomDetailsLayoutRight = roomDetailsPopup?.querySelector?.('.room-details-layout--right') || null;

    function getRoomDetailsLayout(isLeftColumn) {
        return isLeftColumn ? roomDetailsLayoutLeft : roomDetailsLayoutRight;
    }

    const directGoRoomCursorController = ui?.setupInputCursor({
        input: directGoRoomInput,
        cursor: directGoRoomCursor,
        ghost: directGoRoomGhostSpan,
        baseLeft: 6,
        baseTop: 4,
        useInputOffset: true
    });

    const directGoPasswordCursorController = ui?.setupInputCursor({
        input: directGoPasswordInput,
        cursor: directGoPasswordCursor,
        ghost: directGoPasswordGhostSpan,
        baseLeft: 6,
        baseTop: 4,
        useInputOffset: true
    });

    if (directGoRoomInput) {
        directGoRoomInput.addEventListener('input', () => {
            const digits = String(directGoRoomInput.value || '').replace(/\D/g, '').slice(0, DIRECT_GO_ROOM_INPUT_MAX_LEN);
            if (directGoRoomInput.value !== digits) {
                directGoRoomInput.value = digits;
            }
            directGoRoomCursorController?.update();
        });
    }

    if (directGoPasswordInput) {
        directGoPasswordInput.maxLength = JOIN_ROOM_PASSWORD_MAX_LEN;
        directGoPasswordInput.addEventListener('input', () => {
            const v = String(directGoPasswordInput.value || '');
            if (v.length <= JOIN_ROOM_PASSWORD_MAX_LEN) return;
            directGoPasswordInput.value = v.slice(0, JOIN_ROOM_PASSWORD_MAX_LEN);
            directGoPasswordCursorController?.update();
        });
    }

    let pendingJoinRoom = null;

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
    if (joinRoomPasswordPopup) ui?.makeDraggable(joinRoomPasswordPopup, { handleSelector: '.lobby-password-popup-drag' });
    if (lobbyDirectGoPopup) ui?.makeDraggable(lobbyDirectGoPopup, { handleSelector: '.lobby-direct-go-drag' });
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

    function isLobbyGm() {
        return Number(userData?.authority || 0) === 100;
    }

    function normalizeLobbyRoomsPayload(rooms) {
        if (!Array.isArray(rooms)) return [];

        return rooms.map((room) => {
            const roomId = Math.trunc(Number(room?.roomId || 0));
            const memberCount = Math.max(0, Math.trunc(Number(room?.memberCount || 0)));
            const maxPlayers = Math.max(1, Math.trunc(Number(room?.maxPlayers || 1)));
            const teamSize = Math.max(1, Math.trunc(Number(room?.teamSize || 4)));
            const mapIndexRaw = Math.trunc(Number(room?.mapIndex));
            const mapIndex = Number.isFinite(mapIndexRaw)
                ? Math.max(0, Math.min(LOBBY_STAGE_FRAME_COUNT - 1, mapIndexRaw))
                : 0;
            const mapSide = String(room?.mapSide || (mapIndex >= 11 ? 'B' : 'A')).trim().toUpperCase() === 'B' ? 'B' : 'A';
            const explicitStatus = String(room?.status || '').trim().toLowerCase();
            const isPlaying = room?.isPlaying === true
                || room?.playing === true
                || explicitStatus === 'playing'
                || explicitStatus === 'started'
                || explicitStatus === 'in_game';
            const isFull = memberCount >= maxPlayers;
            const status = isPlaying ? 'playing' : (isFull ? 'full' : 'waiting');
            const hintPwd = String(room?.password ?? '').trim().slice(0, JOIN_ROOM_PASSWORD_MAX_LEN);
            const memberIdsNormalized = Array.isArray(room?.memberIds)
                ? room.memberIds.map((id) => String(id ?? '').trim()).filter(Boolean)
                : [];
            const membersNormalized = Array.isArray(room?.members)
                ? room.members.map((m) => {
                    const id = String(m?.id ?? '').trim();
                    const nickname = String(m?.nickname ?? '').trim();
                    const guild = String(m?.guild ?? '').trim();
                    return {
                        id,
                        nickname,
                        guild
                    };
                }).filter((m) => Boolean(m?.id || m?.nickname))
                : memberIdsNormalized.map((id) => ({ id, nickname: '', guild: '' }));

            const teamANormalized = Array.isArray(room?.teamA)
                ? room.teamA.map((m) => ({
                    id: String(m?.id ?? '').trim(),
                    nickname: String(m?.nickname ?? '').trim(),
                    guild: String(m?.guild ?? '').trim()
                }))
                : [];

            const teamBNormalized = Array.isArray(room?.teamB)
                ? room.teamB.map((m) => ({
                    id: String(m?.id ?? '').trim(),
                    nickname: String(m?.nickname ?? '').trim(),
                    guild: String(m?.guild ?? '').trim()
                }))
                : [];
            const normalized = {
                roomKey: String(room?.roomKey || '').trim(),
                roomId: Number.isFinite(roomId) && roomId > 0 ? roomId : 0,
                title: String(room?.title || '').trim(),
                mode: String(room?.mode || 'solo').trim().toLowerCase(),
                memberCount,
                maxPlayers,
                teamSize,
                mapIndex,
                mapSide,
                slotLabel: String(room?.slotLabel || '').trim(),
                powerUser: Boolean(room?.powerUser),
                hasPassword: Boolean(room?.hasPassword),
                ownerNickname: String(room?.ownerNickname || '').trim(),
                memberIds: memberIdsNormalized,
                members: membersNormalized,
                teamA: teamANormalized,
                teamB: teamBNormalized,
                status
            };
            if (hintPwd !== '') {
                normalized.password = hintPwd;
            }
            return normalized;
        }).filter((room) => room.roomId > 0)
            .sort((a, b) => {
                if (a.powerUser !== b.powerUser) return a.powerUser ? -1 : 1;
                return a.roomId - b.roomId;
            });
    }

    function getLobbyRoomsVisibleList() {
        if (!Array.isArray(lobbyRoomsCache) || lobbyRoomsCache.length <= 0) return [];
        if (lobbyRoomNavFilter === 'waiting') {
            return lobbyRoomsCache.filter((r) => String(r?.status || '').trim().toLowerCase() === 'waiting');
        }
        if (lobbyRoomNavFilter === 'friends') {
            return lobbyRoomsCache.filter((r) => lobbyRoomHasBuddyMember(r));
        }
        return lobbyRoomsCache;
    }

    function getLobbyRoomsTotalPages() {
        const visible = getLobbyRoomsVisibleList();
        if (visible.length <= 0) return 0;
        return Math.ceil(visible.length / LOBBY_ROOMS_PAGE_SIZE);
    }

    function updateLobbyRoomNavFilterButtons() {
        const modes = [
            { id: 'btn-view-all', mode: 'all' },
            { id: 'btn-waiting', mode: 'waiting' },
            { id: 'btn-friends', mode: 'friends' }
        ];
        modes.forEach(({ id, mode }) => {
            const el = document.getElementById(id);
            if (!el) return;
            const active = lobbyRoomNavFilter === mode;
            el.classList.toggle('lobby-room-filter-active', active);
            el.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function setLobbyRoomNavFilter(mode) {
        const next = mode === 'waiting' || mode === 'friends' ? mode : 'all';
        if (lobbyRoomNavFilter === next) return;
        lobbyRoomNavFilter = next;
        lobbyRoomsPageIndex = 0;
        updateLobbyRoomNavFilterButtons();
        renderLobbyRoomsPage();
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

    function getLobbyRoomStatusFrame(room) {
        const status = String(room?.status || 'waiting').trim().toLowerCase();
        const isPowerUser = Boolean(room?.powerUser);
        if (status === 'playing') {
            return isPowerUser
                ? '/assets/screens/lobby/gamelist_back/gamelist_back_frame_25.png'
                : '/assets/screens/lobby/gamelist_back/gamelist_back_frame_7.png';
        }
        if (status === 'full') {
            return isPowerUser
                ? '/assets/screens/lobby/gamelist_back/gamelist_back_frame_26.png'
                : '/assets/screens/lobby/gamelist_back/gamelist_back_frame_8.png';
        }
        return isPowerUser
            ? '/assets/screens/lobby/gamelist_back/gamelist_back_frame_27.png'
            : '/assets/screens/lobby/gamelist_back/gamelist_back_frame_9.png';
    }

    function getLobbyRoomStageFrame(room) {
        const rawIndex = Math.trunc(Number(room?.mapIndex));
        const safeIndex = Number.isFinite(rawIndex)
            ? Math.max(0, Math.min(LOBBY_STAGE_FRAME_COUNT - 1, rawIndex))
            : 0;
        return `/assets/screens/lobby/gameliststage/gameliststage_frame_${safeIndex}.png`;
    }

    function getLobbyRoomModeFrame(room) {
        const mode = String(room?.mode || 'solo').trim().toLowerCase();
        if (mode === 'score') {
            return '/assets/screens/lobby/gamelist_back/gamelist_back_frame_11.png';
        }
        if (mode === 'tag') {
            return '/assets/screens/lobby/gamelist_back/gamelist_back_frame_12.png';
        }
        if (mode === 'jewel') {
            return '/assets/screens/lobby/gamelist_back/gamelist_back_frame_13.png';
        }
        return '/assets/screens/lobby/gamelist_back/gamelist_back_frame_10.png';
    }

    function renderLobbyRoomsPage() {
        if (!lobbyRoomList) return;

        hideRoomDetailsPopup();

        lobbyRoomsPageIndex = clampLobbyRoomsPageIndex(lobbyRoomsPageIndex);
        const visibleRooms = getLobbyRoomsVisibleList();
        const startIndex = lobbyRoomsPageIndex * LOBBY_ROOMS_PAGE_SIZE;
        const normalizedRooms = visibleRooms.slice(startIndex, startIndex + LOBBY_ROOMS_PAGE_SIZE);
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

            const statusEl = document.createElement('img');
            statusEl.className = 'lobby-room-status';
            statusEl.src = getLobbyRoomStatusFrame(room);
            statusEl.alt = `${room.status || 'waiting'} status`;
            statusEl.setAttribute('draggable', 'false');

            const stageEl = document.createElement('img');
            stageEl.className = 'lobby-room-stage';
            stageEl.src = getLobbyRoomStageFrame(room);
            stageEl.alt = `${room.mapSide || 'A'} stage ${Math.trunc(Number(room.mapIndex || 0)) + 1}`;
            stageEl.setAttribute('draggable', 'false');

            const modeEl = document.createElement('img');
            modeEl.className = 'lobby-room-mode';
            modeEl.src = getLobbyRoomModeFrame(room);
            modeEl.alt = `${String(room.mode || 'solo').trim().toUpperCase()} mode`;
            modeEl.setAttribute('draggable', 'false');

            // Lobby list should show occupancy as current players / room capacity.
            // Example: 1v1 with 1 player => 1/2, 4v4 with 1 player => 1/8.
            const normalizedMaxPlayers = Math.max(1, Math.trunc(Number(room.maxPlayers || (room.teamSize || 4) * 2)));
            const occupied = Math.min(normalizedMaxPlayers, Math.max(0, Math.trunc(Number(room.memberCount || 0))));
            const capacityEl = document.createElement('div');
            capacityEl.className = 'lobby-room-capacity';
            if (lobbyRoomHasBuddyMember(room)) {
                const capacityIconEl = document.createElement('img');
                capacityIconEl.className = 'lobby-room-capacity-icon';
                capacityIconEl.src = '/assets/screens/lobby/gamelist_back/gamelist_back_frame_14.png';
                capacityIconEl.alt = '';
                capacityIconEl.setAttribute('draggable', 'false');
                capacityEl.appendChild(capacityIconEl);
            }
            const capacityCurrentEl = document.createElement('span');
            capacityCurrentEl.className = 'lobby-room-capacity-current';
            capacityCurrentEl.textContent = String(occupied);
            const capacityMaxEl = document.createElement('span');
            capacityMaxEl.className = 'lobby-room-capacity-max';
            capacityMaxEl.textContent = String(normalizedMaxPlayers);
            capacityEl.appendChild(capacityCurrentEl);
            capacityEl.appendChild(capacityMaxEl);

            slot.appendChild(numberEl);
            slot.appendChild(titleEl);
            slot.appendChild(statusEl);
            slot.appendChild(modeEl);
            slot.appendChild(stageEl);
            slot.appendChild(capacityEl);

            if (room.hasPassword) {
                slot.classList.add('lobby-room-slot--password');
                const passwordTabEl = document.createElement('img');
                passwordTabEl.className = 'lobby-room-password-tab';
                passwordTabEl.src = '/assets/screens/lobby/gamelist_back/gamelist_back_frame_15.png';
                passwordTabEl.alt = 'password protected';
                passwordTabEl.setAttribute('draggable', 'false');
                slot.appendChild(passwordTabEl);
            }
            slot.addEventListener('dblclick', () => {
                joinLobbyRoom(room);
            });
            slot.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                event.stopPropagation();
                showRoomDetailsPopup(room, isLeftColumn, slot);
            });
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

    function hideJoinRoomPasswordPopup() {
        pendingJoinRoom = null;
        joinRoomPasswordPopup?.classList.add('hidden');
        if (joinRoomPasswordInput) {
            joinRoomPasswordInput.value = '';
        }
        joinRoomPasswordCursorController?.update();
    }

    function updateDirectGoCaretFocusState() {
        if (!lobbyDirectGoPopup) return;
        const ae = document.activeElement;
        const onRoom = ae === directGoRoomInput;
        const onPwd = ae === directGoPasswordInput;
        lobbyDirectGoPopup.classList.toggle('lobby-direct-go--focus-room', onRoom);
        lobbyDirectGoPopup.classList.toggle('lobby-direct-go--focus-password', onPwd);
    }

    function hideDirectGoPopup() {
        lobbyDirectGoPopup?.classList.add('hidden');
        lobbyDirectGoPopup?.classList.remove('lobby-direct-go--focus-room', 'lobby-direct-go--focus-password');
        if (directGoRoomInput) {
            directGoRoomInput.value = '';
        }
        if (directGoPasswordInput) {
            directGoPasswordInput.value = '';
        }
        directGoRoomCursorController?.update();
        directGoPasswordCursorController?.update();
    }

    function showDirectGoPopup() {
        if (!lobbyDirectGoPopup) return;
        hideJoinRoomPasswordPopup();
        lobbyDirectGoPopup.classList.remove('hidden');
        lobbyDirectGoPopup.classList.remove('lobby-direct-go--focus-room', 'lobby-direct-go--focus-password');
        centerLobbyPopup(lobbyDirectGoPopup);
        socket.emit('get_lobby_rooms');
        if (directGoRoomInput) {
            directGoRoomInput.value = '';
            directGoRoomInput.focus();
        }
        if (directGoPasswordInput) {
            directGoPasswordInput.value = '';
        }
        directGoRoomCursorController?.update();
        directGoPasswordCursorController?.update();
        updateDirectGoCaretFocusState();
    }

    function submitDirectGo() {
        if (!userData) return;
        const rawNum = String(directGoRoomInput?.value || '').trim();
        const roomId = Math.trunc(Number(rawNum));
        if (!rawNum || !Number.isFinite(roomId) || roomId <= 0) {
            window.showError?.('Room', 'Enter a valid room number.');
            return;
        }
        const room = lobbyRoomsCache.find((r) => Math.trunc(Number(r?.roomId || 0)) === roomId) || null;
        if (!room || !String(room.roomKey || '').trim()) {
            window.showError?.('Room', 'Room not found.');
            return;
        }
        const pwd = String(directGoPasswordInput?.value || '').trim().slice(0, JOIN_ROOM_PASSWORD_MAX_LEN);
        if (room.hasPassword && pwd === '') {
            window.showError?.('Room', 'This room requires a password.');
            return;
        }
        const normalizedMaxPlayers = Math.max(1, Math.trunc(Number(room.maxPlayers || (room.teamSize || 4) * 2)));
        const occupied = Math.max(0, Math.trunc(Number(room.memberCount || 0)));
        if (occupied >= normalizedMaxPlayers) {
            window.showError?.('Room', 'Room is full.');
            return;
        }
        completeJoinLobbyRoom(room, pwd);
    }

    function showJoinRoomPasswordPopup(room) {
        if (!joinRoomPasswordPopup || !room) return;
        hideDirectGoPopup();
        pendingJoinRoom = room;
        joinRoomPasswordPopup.classList.remove('hidden');
        centerLobbyPopup(joinRoomPasswordPopup);
        if (joinRoomPasswordInput) {
            const gmPrefill = isLobbyGm()
                ? String(room?.password || '').trim().slice(0, JOIN_ROOM_PASSWORD_MAX_LEN)
                : '';
            joinRoomPasswordInput.value = gmPrefill;
            joinRoomPasswordInput.focus();
        }
        joinRoomPasswordCursorController?.update();
    }

    function completeJoinLobbyRoom(room, joinPassword) {
        if (!userData || !room?.roomKey) return;
        const normalizedMaxPlayers = Math.max(1, Math.trunc(Number(room.maxPlayers || (room.teamSize || 4) * 2)));
        const occupied = Math.max(0, Math.trunc(Number(room.memberCount || 0)));
        if (occupied >= normalizedMaxPlayers) {
            window.showError?.('Room', 'Room is full.');
            return;
        }

        const pwd = String(joinPassword || '').trim().slice(0, JOIN_ROOM_PASSWORD_MAX_LEN);
        const roomConfig = {
            title: String(room.title || `Room ${room.roomId}`).trim(),
            roomKey: String(room.roomKey || '').trim(),
            mode: String(room.mode || 'solo').trim().toLowerCase(),
            teamSize: Math.max(1, Math.trunc(Number(room.teamSize || 4))),
            slotLabel: String(room.slotLabel || '').trim(),
            mapSide: String(room.mapSide || 'A').trim().toUpperCase() === 'B' ? 'B' : 'A',
            mapIndex: Math.max(0, Math.min(LOBBY_STAGE_FRAME_COUNT - 1, Math.trunc(Number(room.mapIndex || 0)))),
            createdAt: Date.now(),
            password: pwd
        };

        clearLobbyJoinNavigation();
        hideJoinRoomPasswordPopup();
        hideDirectGoPopup();

        const presenceHandler = () => {
            sessionStorage.setItem('gbth_pending_room', JSON.stringify(roomConfig));
            clearLobbyJoinNavigation();
            window.playTransition('closing', () => {
                window.location.href = '/views/game_room/index.html';
            });
        };

        lobbyJoinNavigation = {
            timeoutId: window.setTimeout(() => {
                clearLobbyJoinNavigation();
                window.showError?.('Room', 'Unable to join room. Please try again.');
            }, 12000),
            presenceHandler
        };
        socket.on('game_room_presence', presenceHandler);

        socket.emit('set_user_data', {
            nickname: userData.nickname,
            id: userData.id,
            gender: userData.gender,
            grade: userData.grade || 24,
            guild: userData.guild || '',
            authority: userData.authority || 0,
            location: 'game_room',
            roomKey: roomConfig.roomKey,
            roomTitle: roomConfig.title,
            mode: roomConfig.mode,
            teamSize: roomConfig.teamSize,
            slotLabel: roomConfig.slotLabel,
            mapSide: roomConfig.mapSide,
            mapIndex: roomConfig.mapIndex,
            password: pwd,
            createdAt: roomConfig.createdAt
        });
    }

    function joinLobbyRoom(room) {
        if (!userData || !room?.roomKey) return;
        const normalizedMaxPlayers = Math.max(1, Math.trunc(Number(room.maxPlayers || (room.teamSize || 4) * 2)));
        const occupied = Math.max(0, Math.trunc(Number(room.memberCount || 0)));
        if (occupied >= normalizedMaxPlayers) {
            window.showError?.('Room', 'Room is full.');
            return;
        }
        if (room.hasPassword) {
            showJoinRoomPasswordPopup(room);
            return;
        }
        completeJoinLobbyRoom(room, '');
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

    let activeRoomDetailsRoomKey = null;

    function hideRoomDetailsPopup() {
        if (!roomDetailsPopup) return;
        roomDetailsPopup.classList.add('hidden');
        roomDetailsPopup.classList.remove('room-details-popup--power-user');
        roomDetailsPopup.classList.remove('room-details-popup--left', 'room-details-popup--right');
        roomDetailsPopup.setAttribute('aria-hidden', 'true');
        if (roomDetailsLayoutLeft) roomDetailsLayoutLeft.classList.remove('room-details-layout--password');
        if (roomDetailsLayoutRight) roomDetailsLayoutRight.classList.remove('room-details-layout--password');
        activeRoomDetailsRoomKey = null;
    }

    function getRoomDetailsFrameUrl(room, isLeftColumn) {
        const powerUser = Boolean(room?.powerUser);
        if (powerUser) {
            return isLeftColumn
                ? '/assets/screens/lobby/gamelist_back/gamelist_back_frame_28.png'
                : '/assets/screens/lobby/gamelist_back/gamelist_back_frame_29.png';
        }
        return isLeftColumn
            ? '/assets/screens/lobby/gamelist_back/gamelist_back_frame_16.png'
            : '/assets/screens/lobby/gamelist_back/gamelist_back_frame_17.png';
    }

    function showRoomDetailsPopup(room, isLeftColumn, anchorEl) {
        if (!roomDetailsPopup || !room) return;

        const frameUrl = getRoomDetailsFrameUrl(room, isLeftColumn);
        roomDetailsPopup.style.backgroundImage = `url('${frameUrl}')`;
        roomDetailsPopup.classList.toggle('room-details-popup--power-user', Boolean(room?.powerUser));
        roomDetailsPopup.classList.remove('room-details-popup--left', 'room-details-popup--right');
        roomDetailsPopup.classList.add(isLeftColumn ? 'room-details-popup--left' : 'room-details-popup--right');

        if (roomDetailsLayoutLeft) roomDetailsLayoutLeft.classList.toggle('hidden', !isLeftColumn);
        if (roomDetailsLayoutRight) roomDetailsLayoutRight.classList.toggle('hidden', isLeftColumn);

        const layout = getRoomDetailsLayout(isLeftColumn);
        if (!layout) return;

        roomDetailsPopup.setAttribute('aria-hidden', 'false');
        roomDetailsPopup.classList.remove('hidden');

        activeRoomDetailsRoomKey = String(room?.roomKey || room?.roomId || '');

        // Anchor horizontally to the clicked room tile; vertically to the tile top.
        if (anchorEl && lobbyScreen) {
            const btnRect = anchorEl.getBoundingClientRect();
            const lobbyRect = lobbyScreen.getBoundingClientRect();
            const popupWidth = 257;
            const popupHeight = 188;
            const left = btnRect.left - lobbyRect.left;
            const top = btnRect.top - lobbyRect.top;
            const clampedLeft = Math.max(0, Math.min(lobbyRect.width - popupWidth, left));
            const clampedTop = Math.max(0, Math.min(lobbyRect.height - popupHeight, top));
            roomDetailsPopup.style.left = `${Math.round(clampedLeft)}px`;
            roomDetailsPopup.style.top = `${Math.round(clampedTop)}px`;
        } else {
            centerLobbyPopup(roomDetailsPopup);
        }

        const hasPassword = Boolean(room?.hasPassword);
        layout.classList.toggle('room-details-layout--password', hasPassword);
        const passwordTab = layout.querySelector('[data-role="password-tab"]');
        if (passwordTab) {
            passwordTab.classList.toggle('room-details-password-tab--hidden', !hasPassword);
        }

        const roomDetailsStatusImg = layout.querySelector('[data-role="status-img"]');
        const roomDetailsStageImg = layout.querySelector('[data-role="stage-img"]');
        const roomDetailsModeImg = layout.querySelector('[data-role="mode-img"]');
        const roomDetailsRoomTitle = layout.querySelector('[data-role="title"]');
        const roomDetailsRoomNumber = layout.querySelector('[data-role="room-number"]');
        const roomDetailsCapacityBuddyIcon = layout.querySelector('[data-role="capacity-buddy-icon"]');
        const roomDetailsCapacityCurrent = layout.querySelector('[data-role="capacity-current"]');
        const roomDetailsCapacityMax = layout.querySelector('[data-role="capacity-max"]');

        // Status / stage / mode icons (same logic as room tile)
        if (roomDetailsStatusImg) {
            roomDetailsStatusImg.src = getLobbyRoomStatusFrame(room);
            roomDetailsStatusImg.alt = `${room?.status || 'waiting'} status`;
        }
        if (roomDetailsStageImg) {
            roomDetailsStageImg.src = getLobbyRoomStageFrame(room);
            roomDetailsStageImg.alt = `${room?.mapSide || 'A'} stage ${Math.trunc(Number(room?.mapIndex || 0)) + 1}`;
        }
        if (roomDetailsModeImg) {
            roomDetailsModeImg.src = getLobbyRoomModeFrame(room);
            roomDetailsModeImg.alt = `${String(room?.mode || 'solo').trim().toUpperCase()} mode`;
        }

        if (roomDetailsRoomNumber) {
            roomDetailsRoomNumber.textContent = String(room?.roomId ?? '');
        }

        // Room title (replicates the room tile's title text, but in the popup header area)
        if (roomDetailsRoomTitle) {
            const title = String(room?.title || room?.ownerNickname || '').trim();
            roomDetailsRoomTitle.textContent = title || '';
        }

        // Occupancy + buddy badge (same logic as room tile)
        const normalizedMaxPlayers = Math.max(1, Math.trunc(Number(room.maxPlayers || (room.teamSize || 4) * 2)));
        const occupied = Math.min(
            normalizedMaxPlayers,
            Math.max(0, Math.trunc(Number(room.memberCount || 0)))
        );

        if (roomDetailsCapacityCurrent) roomDetailsCapacityCurrent.textContent = String(occupied);
        if (roomDetailsCapacityMax) roomDetailsCapacityMax.textContent = String(normalizedMaxPlayers);

        const showBuddyBadge = lobbyRoomHasBuddyMember(room);
        if (roomDetailsCapacityBuddyIcon) {
            roomDetailsCapacityBuddyIcon.style.display = showBuddyBadge ? 'block' : 'none';
        }

        const padTeamPlayers = (arr) => {
            const list = Array.isArray(arr) ? arr.slice(0, 4) : [];
            const normalized = list.map((m) => ({
                id: String(m?.id || '').trim(),
                nickname: String(m?.nickname || '').trim(),
                guild: String(m?.guild || '').trim()
            }));
            while (normalized.length < 4) {
                normalized.push({ id: '', nickname: '', guild: '' });
            }
            return normalized;
        };

        const teamAPlayers = padTeamPlayers(room?.teamA);
        const teamBPlayers = padTeamPlayers(room?.teamB);

        const setSlot = (slotKey, player) => {
            const slotEl = layout.querySelector(`.room-details-slot[data-slot="${slotKey}"]`);
            if (!slotEl) return;
            const guildEl = slotEl.querySelector('[data-field="guild"]');
            const nickEl = slotEl.querySelector('[data-field="nickname"]');
            if (guildEl) guildEl.textContent = String(player?.guild || '').trim();
            if (nickEl) nickEl.textContent = String(player?.nickname || player?.id || '').trim();
        };

        setSlot('a1', teamAPlayers[0]);
        setSlot('a2', teamAPlayers[1]);
        setSlot('a3', teamAPlayers[2]);
        setSlot('a4', teamAPlayers[3]);
        setSlot('b1', teamBPlayers[0]);
        setSlot('b2', teamBPlayers[1]);
        setSlot('b3', teamBPlayers[2]);
        setSlot('b4', teamBPlayers[3]);
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
            password: String(createRoomPasswordInput?.value || '').trim().slice(0, 4),
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

    if (joinRoomPasswordInput) {
        joinRoomPasswordInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (!pendingJoinRoom) return;
            completeJoinLobbyRoom(pendingJoinRoom, joinRoomPasswordInput.value);
        });
    }

    if (btnJoinRoomPasswordOk) {
        btnJoinRoomPasswordOk.addEventListener('click', () => {
            if (!pendingJoinRoom) return;
            completeJoinLobbyRoom(pendingJoinRoom, joinRoomPasswordInput?.value || '');
        });
    }

    if (btnJoinRoomPasswordCancel) {
        btnJoinRoomPasswordCancel.addEventListener('click', () => {
            hideJoinRoomPasswordPopup();
        });
    }

    if (btnDirectGoOk) {
        btnDirectGoOk.addEventListener('click', () => {
            submitDirectGo();
        });
    }

    if (btnDirectGoCancel) {
        btnDirectGoCancel.addEventListener('click', () => {
            hideDirectGoPopup();
        });
    }

    if (directGoRoomInput) {
        directGoRoomInput.addEventListener('focus', updateDirectGoCaretFocusState);
        directGoRoomInput.addEventListener('blur', () => {
            window.requestAnimationFrame(() => updateDirectGoCaretFocusState());
        });
        directGoRoomInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            directGoPasswordInput?.focus();
            directGoPasswordCursorController?.update();
            updateDirectGoCaretFocusState();
        });
    }

    if (directGoPasswordInput) {
        directGoPasswordInput.addEventListener('focus', updateDirectGoCaretFocusState);
        directGoPasswordInput.addEventListener('blur', () => {
            window.requestAnimationFrame(() => updateDirectGoCaretFocusState());
        });
        directGoPasswordInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            submitDirectGo();
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
            if (id === 'btn-view-all') {
                setLobbyRoomNavFilter('all');
            }
            if (id === 'btn-waiting') {
                setLobbyRoomNavFilter('waiting');
            }
            if (id === 'btn-friends') {
                setLobbyRoomNavFilter('friends');
            }
            if (id === 'btn-goto') {
                showDirectGoPopup();
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
    updateLobbyRoomNavFilterButtons();
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
    let buddyInviteInFlight = false;
    const submitBuddyInvite = () => {
        if (buddyInviteInFlight) return;
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
            buddyInviteInFlight = true;
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
        buddyInviteInFlight = false;
        const nickname = String(data?.nickname || '').trim();
        if (!nickname) return;
        window.showBuddyAlert(`You trying to add ${nickname} to the buddy list, wait for an answer.`);
        addBuddyPopup?.classList.add('hidden');
    });

    socket.on('buddy_request_error', (data) => {
        buddyInviteInFlight = false;
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

        syncLobbyBuddyIdsFromBuddyList(data?.buddies);
        buddyUi?.renderList(buddyListContent, data.buddies, { includeIdDataset: true });
        window.setTimeout(() => buddyScroll?.update(), 50);
        if (lobbyRoomList && lobbyRoomsCache.length > 0) {
            renderLobbyRoomsPage();
        }
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
    socket.on('lobby_room_join_error', (payload) => {
        clearLobbyJoinNavigation();
        hideJoinRoomPasswordPopup();
        hideDirectGoPopup();
        const reason = String(payload?.reason || '').trim().toLowerCase();
        let fallback = 'Unable to join room.';
        if (reason === 'room_full') fallback = 'Room is full.';
        else if (reason === 'wrong_password') fallback = 'Incorrect password.';
        const message = String(payload?.message || '').trim() || fallback;
        window.showError?.('Room', message);
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
        const isRoomDetailsVisible = roomDetailsPopup && !roomDetailsPopup.classList.contains('hidden');
        const isCreateRoomVisible = createRoomPopup && !createRoomPopup.classList.contains('hidden');
        if (event.key === 'Escape' && isRoomDetailsVisible) {
            event.preventDefault();
            hideRoomDetailsPopup();
            return;
        }
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

    // Disable browser right-click menu (inspection context) on the lobby screen.
    // Also: when the room-details popup is open, right-click anywhere *except* on a room tile closes it.
    // Right-clicking on a room tile itself still opens the popup because the room handler runs and stops propagation.
    document.addEventListener('contextmenu', (event) => {
        event.preventDefault();

        if (!roomDetailsPopup || roomDetailsPopup.classList.contains('hidden')) return;
        const target = event.target;
        const clickedRoomTile = target && target.closest ? target.closest('.lobby-room-slot') : null;
        if (!clickedRoomTile) hideRoomDetailsPopup();
    });

    // Close room details popup on any left mouse click while it is open.
    document.addEventListener('mousedown', (event) => {
        if (!roomDetailsPopup || roomDetailsPopup.classList.contains('hidden')) return;
        // Only close on left click.
        if (event.button !== 0) return;
        hideRoomDetailsPopup();
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

