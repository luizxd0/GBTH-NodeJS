document.addEventListener('DOMContentLoaded', () => {
    // Transition removed
    const serverListElement = document.getElementById('server-list');
    const btnServer = document.getElementById('btn-server');
    const btnExit = document.getElementById('btn-exit');
    let selectedServer = null;

    const socket = io();
    let currentWorlds = [];

    // Fetch world list from API
    fetch('/api/worlds')
        .then(response => response.json())
        .then(worlds => {
            currentWorlds = worlds;
            renderWorlds(currentWorlds);
            
            // Initial button state
            if (btnServer) btnServer.disabled = true;

            // Identify this session to the server for buddy data immediately
            const userData = JSON.parse(sessionStorage.getItem('user'));
            if (userData) {
                socket.emit('set_user_data', { 
                    nickname: userData.nickname, 
                    id: userData.id,
                    location: 'world_list'
                });
            }
        })
        .catch(error => console.error('Error fetching worlds:', error));

    socket.on('playerCountUpdate', (count) => {
        if (currentWorlds.length > 0) {
            currentWorlds[0].server_utilization = count;
            renderWorlds(currentWorlds);
        }
    });

    function renderWorlds(worlds) {
        serverListElement.innerHTML = '';
        worlds.forEach((world, index) => {
            const li = document.createElement('div');
            li.className = 'server-item';
            
            if (!world.server_enabled) {
                li.classList.add('disabled');
            }
            
            let gaugeFrame = 5; 
            if (!world.server_enabled) {
                gaugeFrame = 11;
            } else {
                const pct = (world.server_utilization / world.server_capacity) * 100;
                if (pct >= 100) gaugeFrame = 10;
                else if (pct >= 80) gaugeFrame = 9;
                else if (pct >= 60) gaugeFrame = 8;
                else if (pct >= 40) gaugeFrame = 7;
                else if (pct >= 20) gaugeFrame = 6;
                else gaugeFrame = 5;
            }
            
            const gaugeStyle = `style="background-image: url('/assets/world_list/server_list/server_list_frame_${gaugeFrame}.png');"`;

            // Format [0/10] in description as requested
            const playerStats = `[${world.server_utilization}/${world.server_capacity}]`;
            const desc = `${world.server_description} ${playerStats}`;

            li.innerHTML = `
                <div class="server-item-header">${world.server_name}</div>
                <div class="server-item-body">${desc}</div>
                <div class="server-gauge" ${gaugeStyle}></div>
            `;

            li.addEventListener('click', () => {
                if (!world.server_enabled) return;
                
                const items = document.querySelectorAll('.server-item');
                items.forEach(item => item.classList.remove('selected'));
                li.classList.add('selected');
                selectedServer = world;
                
                // Enable choice button when selected
                if (btnServer) btnServer.disabled = false;
            });

            li.addEventListener('dblclick', () => {
                if (!world.server_enabled) return;
                selectedServer = world;
                joinSelectedServer();
            });

            serverListElement.appendChild(li);
        });
    }

    function joinSelectedServer() {
        if (selectedServer) {
            showJoiningAnimation(() => {
                socket.emit('joinWorld');
                window.playTransition('closing', () => {
                    window.location.href = 'lobby.html';
                });
            });
        } else {
            window.showError("Server Access Error", "Please select a server first to join.");
        }
    }

    if (btnServer) {
        btnServer.addEventListener('click', joinSelectedServer);
    }

    function showJoiningAnimation(onComplete) {
        const overlay = document.getElementById('joining-overlay');
        const waitMsg = document.getElementById('wait-message');
        if (!overlay || !waitMsg) return;

        overlay.classList.remove('hidden');
        let frame = 0;
        const animationInterval = setInterval(() => {
            waitMsg.style.backgroundImage = `url('/assets/waitmessage_frame_${frame}.png')`;
            frame = (frame + 1) % 4;
        }, 150);

        setTimeout(() => {
            clearInterval(animationInterval);
            overlay.classList.add('hidden');
            if (onComplete) onComplete();
        }, 2000);
    }

    if (btnExit) {
        btnExit.addEventListener('click', () => {
             sessionStorage.clear();
             window.location.href = 'index.html';
        });
    }

    const btnBuddy = document.getElementById('btn-buddy');
    if (btnBuddy) {
        btnBuddy.addEventListener('click', () => {
            toggleBuddyPanel();
        });
    }

    const btnBuddyExit = document.getElementById('btn-buddy-exit');
    if (btnBuddyExit) {
        btnBuddyExit.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('buddy-list-panel').classList.add('hidden');
        });
    }

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

                item.addEventListener('dblclick', () => {
                   if (buddy.nickname) {
                       window.openBuddyChat(buddy.nickname);
                   }
                });

                listContent.appendChild(item);
            });
            setTimeout(updateBuddyScrollButtons, 50);
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

    // Make Buddy List Draggable
    const buddyPanel = document.getElementById('buddy-list-panel');
    if (buddyPanel) {
        makeDraggable(buddyPanel);
    }

    const buddyChatWindow = document.getElementById('buddy-chat-window');
    if (buddyChatWindow) {
        makeDraggable(buddyChatWindow);
    }

    // Buddy Chat Logic
    const buddyChatInput = document.getElementById('buddy-chat-input');
    const buddyChatCursor = document.getElementById('buddy-chat-cursor');
    const buddyChatGhostSpan = document.getElementById('buddy-chat-input-ghost');
    const buddyChatNickname = document.getElementById('buddy-chat-nickname');
    const buddyChatMessages = document.getElementById('buddy-chat-messages');
    const buddyChatContent = document.querySelector('.buddy-chat-content');
    const btnBuddyChatClose = document.getElementById('btn-buddy-chat-close');

    function updateBuddyChatCursor() {
        if (!buddyChatInput || !buddyChatCursor || !buddyChatGhostSpan) return;
        const text = buddyChatInput.value;
        const selectionStart = buddyChatInput.selectionStart;
        const textBeforeCursor = text.substring(0, selectionStart);

        buddyChatGhostSpan.textContent = textBeforeCursor;
        const width = buddyChatGhostSpan.offsetWidth;

        buddyChatCursor.style.left = (width) + 'px';
    }

    if (buddyChatInput) {
        buddyChatInput.addEventListener('input', updateBuddyChatCursor);
        buddyChatInput.addEventListener('keyup', updateBuddyChatCursor);
        buddyChatInput.addEventListener('click', updateBuddyChatCursor);
        buddyChatInput.addEventListener('focus', updateBuddyChatCursor);
        buddyChatInput.addEventListener('blur', updateBuddyChatCursor);

        buddyChatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const message = buddyChatInput.value.trim();
                const toNickname = buddyChatNickname.textContent;
                const userData = JSON.parse(sessionStorage.getItem('user'));
                if (message !== '' && toNickname !== '' && userData) {
                    socket.emit('private_message', { toNickname, message });
                    appendBuddyChatMessage(userData.nickname, message);
                    buddyChatInput.value = '';
                    updateBuddyChatCursor();
                }
            }
        });
    }

    if (btnBuddyChatClose) {
        btnBuddyChatClose.addEventListener('click', () => {
            buddyChatWindow.classList.add('hidden');
        });
    }

    function appendBuddyChatMessage(sender, message) {
        if (!buddyChatMessages) return;
        const msgDiv = document.createElement('div');
        msgDiv.className = 'buddy-chat-msg';
        msgDiv.innerHTML = `<span class="sender">${sender}]</span> ${message}`;
        buddyChatMessages.appendChild(msgDiv);

        // Auto-scroll to bottom
        if (buddyChatContent) {
            buddyChatContent.scrollTop = buddyChatContent.scrollHeight;
        }
        setTimeout(updateBuddyChatScrollButtons, 50);
    }

    window.openBuddyChat = function(nickname) {
        if (!buddyChatWindow) return;
        const userData = JSON.parse(sessionStorage.getItem('user'));
        if (userData && userData.nickname.toLowerCase() === nickname.toLowerCase()) return;
        
        buddyChatNickname.textContent = nickname;
        buddyChatWindow.classList.remove('hidden');

        // Reset to default position (per user request)
        buddyChatWindow.style.bottom = '';
        buddyChatWindow.style.right = '';
        buddyChatWindow.style.top = '279px';
        buddyChatWindow.style.left = '541px';
        
        // Reset and Focus
        if (buddyChatInput) {
            buddyChatInput.focus();
            updateBuddyChatCursor();
        }
    };

    socket.on('private_message', (data) => {
        const { fromNickname, message } = data;
        openBuddyChat(fromNickname);
        appendBuddyChatMessage(fromNickname, message);
    });

    // Global key listener to auto-focus buddy chat if open
    document.addEventListener('keydown', (e) => {
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
                const isBuddyChatVisible = buddyChatWindow && !buddyChatWindow.classList.contains('hidden');
                if (isBuddyChatVisible && buddyChatInput) {
                    buddyChatInput.focus();
                }
            }
        }
    });

    // Scroll Logic for Buddy Chat
    const buddyChatScrollUpBtn = document.querySelector('.buddy-chat-scroll-up');
    const buddyChatScrollDownBtn = document.querySelector('.buddy-chat-scroll-down');

    function updateBuddyChatScrollButtons() {
        if (!buddyChatContent || !buddyChatScrollUpBtn || !buddyChatScrollDownBtn) return;
        if (buddyChatContent.scrollTop <= 0) {
            buddyChatScrollUpBtn.classList.add('disabled');
        } else {
            buddyChatScrollUpBtn.classList.remove('disabled');
        }
        if (buddyChatContent.scrollTop + buddyChatContent.clientHeight >= buddyChatContent.scrollHeight - 2) {
            buddyChatScrollDownBtn.classList.add('disabled');
        } else {
            buddyChatScrollDownBtn.classList.remove('disabled');
        }
    }

    if (buddyChatScrollUpBtn) {
        buddyChatScrollUpBtn.addEventListener('click', () => {
            buddyChatContent.scrollBy({ top: -30, behavior: 'smooth' });
        });
    }
    if (buddyChatScrollDownBtn) {
        buddyChatScrollDownBtn.addEventListener('click', () => {
            buddyChatContent.scrollBy({ top: 30, behavior: 'smooth' });
        });
    }
    if (buddyChatContent) {
        buddyChatContent.addEventListener('scroll', updateBuddyChatScrollButtons);
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

    // Custom Scroll Logic
    const viewport = document.querySelector('.server-list-viewport');
    const scrollUpBtn = document.getElementById('scroll-up');
    const scrollDownBtn = document.getElementById('scroll-down');
    const scrollAmount = 77; // roughly one row height

    function updateScrollButtons() {
        if (!viewport) return;
        
        // Disable up button if at top
        if (viewport.scrollTop === 0) {
            scrollUpBtn.classList.add('disabled');
        } else {
            scrollUpBtn.classList.remove('disabled');
        }

        // Disable down button if at bottom
        if (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 5) {
            scrollDownBtn.classList.add('disabled');
        } else {
            scrollDownBtn.classList.remove('disabled');
        }
    }

    if (scrollUpBtn) {
        scrollUpBtn.addEventListener('click', () => {
            viewport.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
        });
    }

    if (scrollDownBtn) {
        scrollDownBtn.addEventListener('click', () => {
            viewport.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        });
    }

    if (viewport) {
        viewport.addEventListener('scroll', updateScrollButtons);
        // Initial check
        window.setTimeout(updateScrollButtons, 100);
    }

    // Custom Animated Cursor Logic handled by ui_effects.js

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

    // Buddy List Scroll Logic
    const buddyViewport = document.querySelector('.buddy-list-content');
    const buddyScrollUpBtn = document.querySelector('.btn-buddy-scroll-up');
    const buddyScrollDownBtn = document.querySelector('.btn-buddy-scroll-down');
    const buddyScrollAmount = 30; // roughly one buddy row height + gap

    function updateBuddyScrollButtons() {
        if (!buddyViewport || !buddyScrollUpBtn || !buddyScrollDownBtn) return;
        
        // Disable up button if at top
        if (buddyViewport.scrollTop <= 0) {
            buddyScrollUpBtn.classList.add('disabled');
        } else {
            buddyScrollUpBtn.classList.remove('disabled');
        }

        // Disable down button if at bottom (or if no scroll needed)
        // Adding a small 2px margin of error
        if (buddyViewport.scrollTop + buddyViewport.clientHeight >= buddyViewport.scrollHeight - 2) {
            buddyScrollDownBtn.classList.add('disabled');
        } else {
            buddyScrollDownBtn.classList.remove('disabled');
        }
    }

    if (buddyScrollUpBtn) {
        buddyScrollUpBtn.addEventListener('click', () => {
            if (buddyViewport) {
                buddyViewport.scrollBy({ top: -buddyScrollAmount, behavior: 'smooth' });
                // We shouldn't rely only on smooth scroll finishing for the UI update, but the scroll event itself handles it.
            }
        });
    }

    if (buddyScrollDownBtn) {
        buddyScrollDownBtn.addEventListener('click', () => {
            if (buddyViewport) {
                buddyViewport.scrollBy({ top: buddyScrollAmount, behavior: 'smooth' });
            }
        });
    }

    if (buddyViewport) {
        buddyViewport.addEventListener('scroll', updateBuddyScrollButtons);
        // Initial check
        window.setTimeout(updateBuddyScrollButtons, 100);
    }

});
