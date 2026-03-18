document.addEventListener('DOMContentLoaded', () => {
    // Transition removed for instant load
    const socket = io();
    
    console.log('Lobby screen loaded');
    
    // Populate User Info (Dynamically from session)
    const userData = JSON.parse(sessionStorage.getItem('user'));
    
    const nicknameSpan = document.getElementById('lobby-nickname');
    const guildSpan = document.getElementById('lobby-guild');
    const rankIcon = document.getElementById('lobby-rank-icon');
    const rankingValue = document.getElementById('lobby-ranking-value');
    const goldSpan = document.getElementById('lobby-gold');
    const cashSpan = document.getElementById('lobby-cash');
    const gpSpan = document.getElementById('lobby-gp');
    
    if (userData) {
        if (nicknameSpan) nicknameSpan.textContent = userData.nickname;
        
        if (guildSpan) {
            if (userData.guild && userData.guild.trim() !== '') {
                guildSpan.textContent = userData.guild + ' [ 1/ 1]';
            } else {
                guildSpan.textContent = '';
            }
        }
        
        if (rankingValue) rankingValue.textContent = (userData.rank || '1').toLocaleString();
        
        // Rank mapping to assets (Thor's Hammer 1-24 grade system)
        if (rankIcon) {
            const grade = userData.grade || 24;
            rankIcon.src = `/assets/rank1/rank1_frame_${grade}.png`;
        }

        if (goldSpan) goldSpan.textContent = 'GOLD : ' + (userData.gold || 0).toLocaleString();
        if (cashSpan) cashSpan.textContent = 'CASH : ' + (userData.cash || 0).toLocaleString();
        
        if (gpSpan) {
            gpSpan.textContent = (userData.score || 0).toLocaleString() + ' GP';
        }

        // Identify this session to the server for buddy requests
        socket.emit('set_user_data', { 
            nickname: userData.nickname, 
            id: userData.id,
            gender: userData.gender,
            grade: userData.grade || 24,
            guild: userData.guild || '',
            location: 'channel' 
        });
    }


    // Custom Animated Cursor Logic (same as world_list)
    let cursorFrame = 0;
    let lastMoveTime = 0;
    
    document.documentElement.style.cursor = `url('/assets/cursor/cursor_frame_0.png') 0 0, auto`;

    document.addEventListener('mousemove', () => {
        const now = Date.now();
        if (now - lastMoveTime > 40) {
            cursorFrame = (cursorFrame + 1) % 17;
            document.body.style.cursor = `url('/assets/cursor/cursor_frame_${cursorFrame}.png') 0 0, auto`;
            lastMoveTime = now;
        }
    });

    const buttons = [
        'btn-lobby-exit', 'btn-lobby-buddy', 'btn-lobby-ranking', 
        'btn-lobby-avatar', 'btn-lobby-create', 'btn-lobby-join',
        'btn-view-all', 'btn-waiting', 'btn-friends', 'btn-goto',
        'btn-nav-prev', 'btn-nav-next'
    ];

    buttons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => {
                console.log(`Button clicked: ${id}`);
                if (id === 'btn-lobby-exit') {
                    socket.emit('leave_lobby');
                    window.location.href = 'world_list.html';
                }
                if (id === 'btn-lobby-buddy') {
                    toggleBuddyPanel();
                }
            });
        }
    });

    const btnBuddyPlus = document.getElementById('btn-buddy-plus');
    if (btnBuddyPlus) {
        btnBuddyPlus.addEventListener('click', () => {
            const addBuddyPopup = document.getElementById('add-buddy-popup');
            if (addBuddyPopup) {
                addBuddyPopup.classList.remove('hidden');
                // Reset position to center if it was moved
                addBuddyPopup.style.top = '226px';
                addBuddyPopup.style.left = '273px';
                
                // Reset and Focus input
                if (addBuddyInput) {
                    addBuddyInput.value = '';
                    addBuddyInput.focus();
                    if (updateAddBuddyCursor) updateAddBuddyCursor();
                }
            }
        });
    }

    const btnAddBuddyClose = document.getElementById('btn-add-buddy-close');
    const btnAddBuddyOk = document.getElementById('btn-add-buddy-ok');
    if (btnAddBuddyClose) {
        btnAddBuddyClose.addEventListener('click', () => {
            document.getElementById('add-buddy-popup').classList.add('hidden');
        });
    }
    if (btnAddBuddyOk) {
        btnAddBuddyOk.addEventListener('click', () => {
            const nickname = addBuddyInput.value.trim();
            const currentNickname = userData ? userData.nickname : '';

            if (nickname.toLowerCase() === currentNickname.toLowerCase()) {
                showBuddyAlert(`You can't add your nickname to buddy.`);
            } else if (nickname === 'Perry') { // Example simulation for "Already Friends"
                showBuddyAlert(`'${nickname}' is already your friend.`);
            } else if (nickname !== '') {
                // Real buddy request emit
                socket.emit('send_buddy_request', nickname);
                showBuddyAlert(`You trying to add ${nickname} to the buddy list, wait for an answer.`);
                document.getElementById('add-buddy-popup').classList.add('hidden');
            }
        });
    }

    let currentAlertCallbacks = { onYes: null, onNo: null };

    const btnBuddyAlertYes = document.getElementById('btn-buddy-alert-yes');
    const btnBuddyAlertNo = document.getElementById('btn-buddy-alert-no');
    if (btnBuddyAlertYes) {
        btnBuddyAlertYes.addEventListener('click', () => {
            document.getElementById('buddy-alert-popup').classList.add('hidden');
            if (currentAlertCallbacks.onYes) currentAlertCallbacks.onYes();
        });
    }
    if (btnBuddyAlertNo) {
        btnBuddyAlertNo.addEventListener('click', () => {
            document.getElementById('buddy-alert-popup').classList.add('hidden');
            if (currentAlertCallbacks.onNo) currentAlertCallbacks.onNo();
        });
    }

    window.showBuddyAlert = function(message, options = {}) {
        const { showNoButton = false, onYes = null, onNo = null } = options;
        const popup = document.getElementById('buddy-alert-popup');
        const parent = document.getElementById('add-buddy-popup');
        const textBox = document.getElementById('buddy-alert-text-box');
        const btnNo = document.getElementById('btn-buddy-alert-no');
        const btnYes = document.getElementById('btn-buddy-alert-yes');
        
        if (popup && textBox && parent && btnYes && btnNo) {
            textBox.textContent = message;
            popup.classList.remove('hidden');
            
            // Store callbacks
            currentAlertCallbacks = { onYes, onNo };
            
            // Calculate center relative to parent (Add Buddy window)
            const parentRect = {
                top: parseInt(parent.style.top) || 226,
                left: parseInt(parent.style.left) || 273
            };
            
            const offsetTop = (147 - 138) / 2;
            const offsetLeft = (253 - 200) / 2;
            
            popup.style.top = (parentRect.top + offsetTop) + 'px';
            popup.style.left = (parentRect.left + offsetLeft) + 'px';

            if (showNoButton) {
                btnNo.classList.remove('hidden');
                btnYes.style.left = '64px';
                btnNo.style.left = '128px';
            } else {
                btnNo.classList.add('hidden');
                btnYes.style.left = '128px';
            }
        }
    };

    // Socket Listeners for Buddy Flow
    socket.on('incoming_buddy_request', (data) => {
        showBuddyAlert(`'${data.fromNickname}' Is trying to enter on your buddy list, Do you accept?`, {
            showNoButton: true,
            onYes: () => {
                socket.emit('respond_buddy_request', { fromNickname: data.fromNickname, fromId: data.fromId, accepted: true });
            },
            onNo: () => {
                socket.emit('respond_buddy_request', { fromNickname: data.fromNickname, fromId: data.fromId, accepted: false });
            }
        });
    });

    socket.on('buddy_request_accepted', (data) => {
        showBuddyAlert(`'${data.nickname}' has accepted your buddy request.`);
        // Note: Future step could involve refreshing the actual buddy list UI here
    });

    socket.on('buddy_request_rejected', (data) => {
        showBuddyAlert(`'${data.nickname}' has rejected your buddy request.`);
    });

    socket.on('buddy_list_data', (data) => {
        const onlineCountEl = document.getElementById('buddy-online-count');
        const totalCountEl = document.getElementById('buddy-total-count');
        const listContent = document.querySelector('.buddy-list-content');

        if (onlineCountEl) onlineCountEl.textContent = data.onlineCount;
        if (totalCountEl) totalCountEl.textContent = data.totalCount;

        if (listContent) {
            listContent.innerHTML = '';
            data.buddies.forEach(buddy => {
                const item = document.createElement('div');
                item.className = 'buddy-item';
                
                const rankSrc = `/assets/rank1/rank1_frame_${buddy.grade}.png`;
                
                item.dataset.id = buddy.id;
                item.dataset.nickname = buddy.nickname;

                let statusFrame = 4; // Default to offline (Logout)
                if (buddy.online) {
                    if (buddy.location === 'world_list') statusFrame = 5;
                    else if (buddy.location === 'channel') statusFrame = 2;
                    else if (buddy.location === 'in_game') statusFrame = 3;
                    else if (buddy.location === 'avatar_shop') statusFrame = 6;
                    else statusFrame = 0; // Default online status
                }
                
                const statusImg = `<img src="/assets/lobby/buddy_back/buddy_back_frame_${statusFrame}.png" class="buddy-status-img status-${statusFrame} buddy-logout">`;

                item.innerHTML = `
                    <div class="buddy-rank-box">
                        <img src="${rankSrc}" class="buddy-rank-icon">
                    </div>
                    <div class="buddy-info">
                        <div class="buddy-guild">${buddy.guild || ''}</div>
                        <div class="buddy-nickname">${buddy.nickname}</div>
                    </div>
                    <div class="buddy-status">
                        ${statusImg}
                        ${buddy.online && buddy.location !== 'world_list' ? `
                            <div class="buddy-server-status">
                                <span class="buddy-status-value server">${buddy.serverId}</span>
                            </div>
                            <div class="buddy-channel-status">
                                <span class="buddy-status-value channel">${buddy.channelId}</span>
                            </div>
                        ` : ''}
                    </div>
                `;

                // Selection logic
                item.addEventListener('click', (e) => {
                    document.querySelectorAll('.buddy-item').forEach(el => el.classList.remove('selected'));
                    item.classList.add('selected');
                });

                listContent.appendChild(item);
            });
            setTimeout(updateBuddyScrollButtons, 50);
        }
    });

    socket.on('lobby_message', (data) => {
        const messagesContent = document.getElementById('chat-messages-content');
        if (messagesContent) {
            const msgDiv = document.createElement('div');
            msgDiv.className = `chat-message ${data.type} ${data.color || ''}`;
            
            if (data.type === 'user') {
                const guildHtml = data.guild ? `<span class="chat-guild">${data.guild}</span>` : '';
                msgDiv.innerHTML = `${guildHtml}<span class="nickname">${data.nickname}]</span> ${data.message}`;
            } else {
                msgDiv.textContent = (data.icon ? data.icon + ' ' : '') + data.message;
            }
            
            messagesContent.appendChild(msgDiv);
            
            // Auto-scroll to bottom if we were already at the bottom
            const isAtBottom = messagesContent.scrollHeight - messagesContent.scrollTop <= messagesContent.clientHeight + 40;
            if (isAtBottom) {
                messagesContent.scrollTop = messagesContent.scrollHeight;
            }
            
            setTimeout(updateChatScrollButtons, 50);
        }
    });

    socket.on('channel_users', (users) => {
        const channelListContent = document.getElementById('channel-list-content');
        if (channelListContent) {
            channelListContent.innerHTML = '';
            users.forEach(user => {
                const item = document.createElement('div');
                item.className = 'channel-item';
                
                const genderSrc = user.gender === 0 ? '/assets/avataimsi/avataimsi_frame_1.png' : '/assets/avataimsi/avataimsi_frame_2.png';
                const rankSrc = `/assets/rank1/rank1_frame_${user.grade || 24}.png`;
                
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
                
                channelListContent.appendChild(item);
            });
            setTimeout(updateChannelScrollButtons, 50);
        }
    });

    function toggleBuddyPanel() {
        const panel = document.getElementById('buddy-list-panel');
        if (panel) {
            const isHidden = panel.classList.contains('hidden');
            if (isHidden) {
                // Reset to CSS default position before showing
                panel.style.top = '';
                panel.style.left = '';
                // Clear selection when opening
                document.querySelectorAll('.buddy-item').forEach(el => el.classList.remove('selected'));
            }
            panel.classList.toggle('hidden');
        }
    }

    // F10 Toggle for Buddy List
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F10') {
            e.preventDefault(); // Prevent browser menu
            toggleBuddyPanel();
        }
    });

    // Initial Button States
    const btnRanking = document.getElementById('btn-lobby-ranking');
    const btnJoin = document.getElementById('btn-lobby-join');
    const btnPrev = document.getElementById('btn-nav-prev');

    if (btnRanking) btnRanking.disabled = true;
    if (btnJoin) btnJoin.disabled = true; // Enabled when rooms are loaded
    if (btnPrev) btnPrev.disabled = true; // Page 1

    // Error Popup functionality
    const errorOverlay = document.getElementById('error-overlay');
    const errorTitle = document.getElementById('error-title');
    const errorMessage = document.getElementById('error-message');
    const errorConfirmBtn = document.getElementById('error-confirm-btn');

    window.showError = function(title, message) {
        if (!errorOverlay || !errorTitle || !errorMessage) return;
        errorTitle.textContent = title;
        errorMessage.textContent = message;
        errorOverlay.classList.remove('hidden');
    };

    if (errorConfirmBtn) {
        errorConfirmBtn.addEventListener('click', () => {
            errorOverlay.classList.add('hidden');
        });
    }

    // playTransition removed

    // Chat Cursor Positioning Logic
    const chatInput = document.getElementById('chat-input');
    const chatCursor = document.getElementById('chat-cursor');
    const ghostSpan = document.getElementById('chat-input-ghost');

    if (chatInput && chatCursor && ghostSpan) {
        function updateCursor() {
            const text = chatInput.value;
            const selectionStart = chatInput.selectionStart;
            const textBeforeCursor = text.substring(0, selectionStart);
            
            ghostSpan.textContent = textBeforeCursor;
            const width = ghostSpan.offsetWidth;
            
            // 23px is the base left offset of the input
            chatCursor.style.left = (23 + width) + 'px';
        }

        chatInput.addEventListener('input', updateCursor);
        chatInput.addEventListener('keyup', updateCursor);
        chatInput.addEventListener('click', updateCursor);
        chatInput.addEventListener('focus', updateCursor);
        chatInput.addEventListener('blur', updateCursor);
        
        // Global key listener to auto-focus chat
        document.addEventListener('keydown', (e) => {
            // If we're not already typing in an input, and it's a printable character or backspace
            if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                // Ignore function keys, alt, ctrl, etc.
                if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
                    const addBuddyPopup = document.getElementById('add-buddy-popup');
                    const isAddBuddyVisible = addBuddyPopup && !addBuddyPopup.classList.contains('hidden');
                    
                    if (isAddBuddyVisible && addBuddyInput) {
                        addBuddyInput.focus();
                    } else if (chatInput) {
                        chatInput.focus();
                    }
                }
            }
        });

        // Initial position
        updateCursor();
        
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const message = chatInput.value.trim();
                if (message !== '') {
                    socket.emit('lobby_message', message);
                    chatInput.value = '';
                    updateCursor();
                }
            }
        });

        // Ensure cursor is always updated even if window focus changes
        window.addEventListener('focus', updateCursor);
    }

    // Add Buddy Popup Cursor Logic
    const addBuddyInput = document.getElementById('add-buddy-input');
    const addBuddyCursor = document.getElementById('add-buddy-cursor');
    const addBuddyGhostSpan = document.getElementById('add-buddy-input-ghost');

    if (addBuddyInput && addBuddyCursor && addBuddyGhostSpan) {
        function updateAddBuddyCursor() {
            const text = addBuddyInput.value;
            const selectionStart = addBuddyInput.selectionStart;
            const textBeforeCursor = text.substring(0, selectionStart);
            
            addBuddyGhostSpan.textContent = textBeforeCursor;
            const width = addBuddyGhostSpan.offsetWidth;
            
            // Now relative to the same container as the input
            addBuddyCursor.style.left = (addBuddyInput.offsetLeft + 5 + width) + 'px';
            addBuddyCursor.style.top = (addBuddyInput.offsetTop + 4) + 'px';
        }

        addBuddyInput.addEventListener('input', updateAddBuddyCursor);
        addBuddyInput.addEventListener('keyup', updateAddBuddyCursor);
        addBuddyInput.addEventListener('click', updateAddBuddyCursor);
        addBuddyInput.addEventListener('focus', updateAddBuddyCursor);
        addBuddyInput.addEventListener('blur', updateAddBuddyCursor);
    }

    const btnBuddyExit = document.getElementById('btn-buddy-exit');
    if (btnBuddyExit) {
        btnBuddyExit.addEventListener('click', () => {
             document.getElementById('buddy-list-panel').classList.add('hidden');
        });
    }

    const btnBuddyDel = document.getElementById('btn-buddy-del');
    if (btnBuddyDel) {
        btnBuddyDel.addEventListener('click', () => {
            const selected = document.querySelector('.buddy-item.selected');
            if (!selected) {
                showBuddyAlert("Please select a buddy to delete.");
                return;
            }
            const nickname = selected.dataset.nickname;
            const targetId = selected.dataset.id;
            
            if (nickname && targetId) {
                showBuddyAlert(`Are you sure you want to delete '${nickname}'?`, {
                    showNoButton: true,
                    onYes: () => {
                        socket.emit('delete_buddy', targetId);
                    }
                });
            }
        });
    }

    // Make Buddy List Draggable
    const buddyPanel = document.getElementById('buddy-list-panel');
    if (buddyPanel) {
        makeDraggable(buddyPanel);
    }

    const addBuddyPopup = document.getElementById('add-buddy-popup');
    if (addBuddyPopup) {
        makeDraggable(addBuddyPopup);
    }

    const buddyAlertPopup = document.getElementById('buddy-alert-popup');
    if (buddyAlertPopup) {
        makeDraggable(buddyAlertPopup);
    }

    function makeDraggable(el) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        el.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            // Don't drag if clicking on a button
            if (e.target.tagName.toLowerCase() === 'button') return;

            e = e || window.event;
            
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }


        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            
            const scale = window.currentScale || 1;
            
            // calculate the new cursor position:
            pos1 = (pos3 - e.clientX) / scale;
            pos2 = (pos4 - e.clientY) / scale;
            pos3 = e.clientX;
            pos4 = e.clientY;
            
            // set the element's new position:
            el.style.top = (el.offsetTop - pos2) + "px";
            el.style.left = (el.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    // Scroll Logic for Buddy and Channel Lists
    const buddyViewport = document.querySelector('.buddy-list-content');
    const buddyScrollUpBtn = document.querySelector('.btn-buddy-scroll-up');
    const buddyScrollDownBtn = document.querySelector('.btn-buddy-scroll-down');
    
    const channelViewport = document.getElementById('channel-list-content');
    const channelScrollUpBtn = document.querySelector('.btn-channel-scroll-up');
    const channelScrollDownBtn = document.querySelector('.btn-channel-scroll-down');
    
    const scrollAmount = 30;

    function updateBuddyScrollButtons() {
        if (!buddyViewport || !buddyScrollUpBtn || !buddyScrollDownBtn) return;
        if (buddyViewport.scrollTop <= 0) {
            buddyScrollUpBtn.classList.add('disabled');
        } else {
            buddyScrollUpBtn.classList.remove('disabled');
        }
        if (buddyViewport.scrollTop + buddyViewport.clientHeight >= buddyViewport.scrollHeight - 2) {
            buddyScrollDownBtn.classList.add('disabled');
        } else {
            buddyScrollDownBtn.classList.remove('disabled');
        }
    }

    function updateChannelScrollButtons() {
        if (!channelViewport || !channelScrollUpBtn || !channelScrollDownBtn) return;
        if (channelViewport.scrollTop <= 0) {
            channelScrollUpBtn.classList.add('disabled');
        } else {
            channelScrollUpBtn.classList.remove('disabled');
        }
        if (channelViewport.scrollTop + channelViewport.clientHeight >= channelViewport.scrollHeight - 2) {
            channelScrollDownBtn.classList.add('disabled');
        } else {
            channelScrollDownBtn.classList.remove('disabled');
        }
    }

    if (buddyScrollUpBtn) {
        buddyScrollUpBtn.addEventListener('click', () => {
            buddyViewport.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
        });
    }
    if (buddyScrollDownBtn) {
        buddyScrollDownBtn.addEventListener('click', () => {
            buddyViewport.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        });
    }
    if (buddyViewport) {
        buddyViewport.addEventListener('scroll', updateBuddyScrollButtons);
    }

    if (channelScrollUpBtn) {
        channelScrollUpBtn.addEventListener('click', () => {
            channelViewport.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
        });
    }
    if (channelScrollDownBtn) {
        channelScrollDownBtn.addEventListener('click', () => {
            channelViewport.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        });
    }
    if (channelViewport) {
        channelViewport.addEventListener('scroll', updateChannelScrollButtons);
    }

    const chatViewport = document.getElementById('chat-messages-content');
    const chatScrollUpBtn = document.querySelector('.btn-chat-scroll-up');
    const chatScrollDownBtn = document.querySelector('.btn-chat-scroll-down');

    function updateChatScrollButtons() {
        if (!chatViewport || !chatScrollUpBtn || !chatScrollDownBtn) return;
        if (chatViewport.scrollTop <= 0) {
            chatScrollUpBtn.classList.add('disabled');
        } else {
            chatScrollUpBtn.classList.remove('disabled');
        }
        if (chatViewport.scrollTop + chatViewport.clientHeight >= chatViewport.scrollHeight - 2) {
            chatScrollDownBtn.classList.add('disabled');
        } else {
            chatScrollDownBtn.classList.remove('disabled');
        }
    }

    if (chatScrollUpBtn) {
        chatScrollUpBtn.addEventListener('click', () => {
            chatViewport.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
        });
    }
    if (chatScrollDownBtn) {
        chatScrollDownBtn.addEventListener('click', () => {
            chatViewport.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        });
    }
    if (chatViewport) {
        chatViewport.addEventListener('scroll', updateChatScrollButtons);
    }

    function sendSystemWelcome() {
        if (!chatViewport) return;
        const nickname = userData ? userData.nickname : 'Player';
        const now = new Date();
        
        // UK Style Timestamp: DD/MM/YYYY HH:mm:ss
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const timeStr = now.toTimeString().split(' ')[0];
        const ukDateStr = `${day}/${month}/${year} ${timeStr}`;
        
        // Dynamic Greeting based on Hour
        const hour = now.getHours();
        let greeting = "Good night";
        if (hour >= 5 && hour < 12) greeting = "Good morning";
        else if (hour >= 12 && hour < 18) greeting = "Good afternoon";
        else if (hour >= 18 && hour < 22) greeting = "Good evening";
        
        const systemMessages = [
            { message: "GunBound Classic Thor's Hammer", color: 'orange' },
            { message: `${greeting} ${nickname}`, color: 'green' },
            { message: `Requesting SVC_CHANNEL_JOIN 1 at ${ukDateStr}`, color: 'yellow' }
        ];

        systemMessages.forEach((msg, index) => {
            setTimeout(() => {
                const div = document.createElement('div');
                div.className = `chat-message ${msg.color}`;
                div.textContent = msg.message;
                chatViewport.appendChild(div);
                updateChatScrollButtons();
                chatViewport.scrollTop = chatViewport.scrollHeight;
            }, index * 100);
        });
    }

    // Initial check
    window.setTimeout(() => {
        updateBuddyScrollButtons();
        updateChannelScrollButtons();
        updateChatScrollButtons();
        
        sendSystemWelcome();
    }, 100);
});
