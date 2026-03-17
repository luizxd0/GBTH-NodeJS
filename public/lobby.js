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
                guildSpan.style.display = 'inline-block';
            } else {
                guildSpan.textContent = '';
                guildSpan.style.display = 'none';
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
                    window.location.href = 'world_list.html';
                }
                if (id === 'btn-lobby-buddy') {
                    toggleBuddyPanel();
                }
            });
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
                    chatInput.focus();
                    // Let the event propagate to the input
                }
            }
        });

        // Initial position
        updateCursor();
        
        // Ensure cursor is always updated even if window focus changes
        window.addEventListener('focus', updateCursor);
    }

    // Make Buddy List Draggable
    const buddyPanel = document.getElementById('buddy-list-panel');
    if (buddyPanel) {
        makeDraggable(buddyPanel);
    }

    function makeDraggable(el) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        el.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            // Only drag if clicking in the top area (Y < 40 relative to element)
            const rect = el.getBoundingClientRect();
            const scale = window.currentScale || 1;
            const relativeY = (e.clientY - rect.top) / scale;
            
            if (relativeY > 40) return; 

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
});
