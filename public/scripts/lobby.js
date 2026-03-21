document.addEventListener('DOMContentLoaded', () => {
    const ui = window.GBTH?.ui;
    const buddyUi = window.GBTH?.buddy;
    const socket = io();

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
                window.location.href = 'world_list.html';
            }
            if (id === 'btn-lobby-buddy') {
                toggleBuddyPanel();
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
                    window.location.href = 'avatar_shop.html';
                });
            }
        });
    });

    const btnRanking = document.getElementById('btn-lobby-ranking');
    const btnJoin = document.getElementById('btn-lobby-join');
    const btnPrev = document.getElementById('btn-nav-prev');

    if (btnRanking) btnRanking.disabled = true;
    if (btnJoin) btnJoin.disabled = true;
    if (btnPrev) btnPrev.disabled = true;

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

            if (nickname === 'Perry') {
                window.showBuddyAlert(`'${nickname}' is already your friend.`);
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
        } else if (chatInput) {
            chatInput.focus();
        }
    });

    window.setTimeout(() => {
        buddyScroll?.update();
        channelScroll?.update();
        chatScroll?.update();
        buddyChatScroll?.update();
        updateChannelButtonsUI();
        sendSystemWelcome(1);
    }, 100);
});

