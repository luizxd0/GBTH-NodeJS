document.addEventListener('DOMContentLoaded', () => {
    const ui = window.GBTH?.ui;
    const buddyUi = window.GBTH?.buddy;

    const socket = io();
    const serverListElement = document.getElementById('server-list');
    const btnServer = document.getElementById('btn-server');
    const btnExit = document.getElementById('btn-exit');
    const btnBuddy = document.getElementById('btn-buddy');
    const buddyPanel = document.getElementById('buddy-list-panel');
    const buddyListContent = document.querySelector('.buddy-list-content');

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

    window.showError = (title, message) => errorPopup?.show(title, message);

    const worldScroll = ui?.setupScrollControls({
        viewport: document.querySelector('.server-list-viewport'),
        upButton: document.getElementById('scroll-up'),
        downButton: document.getElementById('scroll-down'),
        scrollAmount: 77,
        bottomThreshold: 5
    });

    const buddyScroll = ui?.setupScrollControls({
        viewport: buddyListContent,
        upButton: document.querySelector('.btn-buddy-scroll-up'),
        downButton: document.querySelector('.btn-buddy-scroll-down'),
        scrollAmount: 30
    });

    const buddyChatScroll = ui?.setupScrollControls({
        viewport: buddyChatContent,
        upButton: document.querySelector('.buddy-chat-scroll-up'),
        downButton: document.querySelector('.buddy-chat-scroll-down'),
        scrollAmount: 30
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

    if (buddyChatWindow) {
        ui?.makeDraggable(buddyChatWindow);
    }

    buddyUi?.bindInteractions({
        listContent: buddyListContent,
        onOpenChat: (nickname) => window.openBuddyChat?.(nickname)
    });

    let selectedServer = null;
    let selectedServerElement = null;
    let currentWorlds = [];

    const userData = JSON.parse(sessionStorage.getItem('user'));

    fetch('/api/worlds')
        .then((response) => response.json())
        .then((worlds) => {
            currentWorlds = worlds;
            renderWorlds(currentWorlds);

            if (btnServer) btnServer.disabled = true;

            if (userData) {
                socket.emit('set_user_data', {
                    nickname: userData.nickname,
                    id: userData.id,
                    location: 'world_list'
                });
            }
        })
        .catch((error) => console.error('Error fetching worlds:', error));

    socket.on('playerCountUpdate', (count) => {
        if (currentWorlds.length === 0) return;
        currentWorlds[0].server_utilization = count;
        renderWorlds(currentWorlds);
    });

    socket.on('buddy_list_data', (data) => {
        const onlineCountEl = document.getElementById('buddy-online-count');
        const totalCountEl = document.getElementById('buddy-total-count');

        if (onlineCountEl) onlineCountEl.textContent = data.onlineCount;
        if (totalCountEl) totalCountEl.textContent = data.totalCount;

        buddyUi?.renderList(buddyListContent, data.buddies, { includeIdDataset: false });
        window.setTimeout(() => buddyScroll?.update(), 50);
    });

    socket.on('private_message', (data) => {
        const { fromNickname, message } = data;
        window.openBuddyChat(fromNickname);
        appendBuddyChatMessage(fromNickname, message);
    });

    function getGaugeFrame(world) {
        if (!world.server_enabled) return 11;

        const pct = (world.server_utilization / world.server_capacity) * 100;
        if (pct >= 100) return 10;
        if (pct >= 80) return 9;
        if (pct >= 60) return 8;
        if (pct >= 40) return 7;
        if (pct >= 20) return 6;
        return 5;
    }

    function renderWorlds(worlds) {
        if (!serverListElement) return;

        selectedServer = null;
        selectedServerElement = null;
        if (btnServer) btnServer.disabled = true;

        const fragment = document.createDocumentFragment();

        worlds.forEach((world) => {
            const item = document.createElement('div');
            item.className = 'server-item';

            if (!world.server_enabled) {
                item.classList.add('disabled');
            }

            const gaugeFrame = getGaugeFrame(world);
            const playerStats = `[${world.server_utilization}/${world.server_capacity}]`;
            const desc = `${world.server_description} ${playerStats}`;

            item.innerHTML = `
                <div class="server-item-header">${world.server_name}</div>
                <div class="server-item-body">${desc}</div>
                <div class="server-gauge" style="background-image: url('/assets/screens/world_list/server_list/server_list_frame_${gaugeFrame}.png');"></div>
            `;

            item.addEventListener('click', () => {
                if (!world.server_enabled) return;

                if (selectedServerElement && selectedServerElement !== item) {
                    selectedServerElement.classList.remove('selected');
                }

                selectedServerElement = item;
                selectedServerElement.classList.add('selected');
                selectedServer = world;

                if (btnServer) btnServer.disabled = false;
            });

            item.addEventListener('dblclick', () => {
                if (!world.server_enabled) return;
                selectedServer = world;
                joinSelectedServer();
            });

            fragment.appendChild(item);
        });

        serverListElement.innerHTML = '';
        serverListElement.appendChild(fragment);
        window.setTimeout(() => worldScroll?.update(), 50);
    }

    function showJoiningAnimation(onComplete) {
        const overlay = document.getElementById('joining-overlay');
        const waitMsg = document.getElementById('wait-message');
        if (!overlay || !waitMsg) return;

        overlay.classList.remove('hidden');
        let frame = 0;
        const animationInterval = setInterval(() => {
            waitMsg.style.backgroundImage = `url('/assets/shared/waitmessage/waitmessage_frame_${frame}.png')`;
            frame = (frame + 1) % 4;
        }, 150);

        setTimeout(() => {
            clearInterval(animationInterval);
            overlay.classList.add('hidden');
            if (onComplete) onComplete();
        }, 2000);
    }

    function joinSelectedServer() {
        if (!selectedServer) {
            window.showError('Server Access Error', 'Please select a server first to join.');
            return;
        }

        showJoiningAnimation(() => {
            socket.emit('joinWorld');
            window.playTransition('closing', () => {
                window.location.href = 'lobby.html';
            });
        });
    }

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

    function appendBuddyChatMessage(sender, message) {
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

    window.openBuddyChat = function openBuddyChat(nickname) {
        if (!buddyChatWindow) return;
        if (userData && userData.nickname.toLowerCase() === nickname.toLowerCase()) return;

        buddyChatNickname.textContent = nickname;
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

    if (btnServer) {
        btnServer.addEventListener('click', joinSelectedServer);
    }

    if (btnExit) {
        btnExit.addEventListener('click', () => {
            sessionStorage.clear();
            window.location.href = 'index.html';
        });
    }

    if (btnBuddy) {
        btnBuddy.addEventListener('click', toggleBuddyPanel);
    }

    const btnBuddyExit = document.getElementById('btn-buddy-exit');
    if (btnBuddyExit) {
        btnBuddyExit.addEventListener('click', (event) => {
            event.stopPropagation();
            buddyPanel?.classList.add('hidden');
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

            const message = buddyChatInput.value.trim();
            const toNickname = buddyChatNickname.textContent;
            if (!message || !toNickname || !userData) return;

            socket.emit('private_message', { toNickname, message });
            appendBuddyChatMessage(userData.nickname, message);
            buddyChatInput.value = '';
            buddyChatCursorController?.update();
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'F10') {
            event.preventDefault();
            toggleBuddyPanel();
            return;
        }

        const isTyping = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
        if (isTyping) return;

        if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
            const isBuddyChatVisible = buddyChatWindow && !buddyChatWindow.classList.contains('hidden');
            if (isBuddyChatVisible && buddyChatInput) {
                buddyChatInput.focus();
            }
        }
    });
});

