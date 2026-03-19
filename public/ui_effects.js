/**
 * UI Effects Utility
 * Handles global UI sound effects like button hovers, screen transitions, and persistent BGM.
 */

window.playTransition = function(type, callback) {
    const transition = document.getElementById('screen-transition');
    if (!transition) {
        if (callback) callback();
        return;
    }

    transition.classList.remove('opening', 'closing', 'run');
    transition.classList.add('active', type);
    
    // Force reflow
    transition.offsetHeight;

    transition.classList.add('run');

    setTimeout(() => {
        if (type === 'opening') {
            transition.classList.remove('active', 'opening', 'run');
        }
        if (callback) callback();
    }, 700); 
};

(function() {
    /**
     * PERSISTENT BGM LOGIC
     * channel.mp3 only starts from the Lobby.
     * Once started, it remains persistent even when returning to the World List.
     */
    const isLobby = window.location.pathname.includes('lobby.html');
    const isWorldList = window.location.pathname.includes('world_list.html');
    
    // Check if BGM should be active
    if (isLobby) {
        sessionStorage.setItem('bgmActive', 'true');
    }
    
    const bgmActive = sessionStorage.getItem('bgmActive') === 'true';

    if (isLobby || (isWorldList && bgmActive)) {
        const bgm = new Audio('/assets/sounds/channel.mp3');
        bgm.loop = true;
        bgm.volume = 0.5;
        
        // Load saved position
        const savedTime = sessionStorage.getItem('channelBgmTime');
        if (savedTime) {
            bgm.currentTime = parseFloat(savedTime);
        }
        
        bgm.play().catch(() => {});

        // Save position on any navigation
        window.addEventListener('beforeunload', () => {
            if (bgm) {
                sessionStorage.setItem('channelBgmTime', bgm.currentTime);
            }
        });
    }

    // Initial opening transition on page load
    document.addEventListener('DOMContentLoaded', () => {
        window.playTransition('opening');
    });

    const hoverSound = new Audio('/assets/sounds/bselect1.ogg');
    hoverSound.preload = 'auto';
    hoverSound.volume = 0.5;

    const clickSound = new Audio('/assets/sounds/bpush1.ogg');
    clickSound.preload = 'auto';
    clickSound.volume = 0.5;

    let lastHoveredElement = null;

    document.addEventListener('mouseover', (e) => {
        // Find the closest interactive element
        const target = e.target.closest('button, a, .btn, .nav-btn, .nav-btn-mini, .bottom-btn, .buddy-mini-btn, .server-item, .buddy-item, .buddy-scroll-button, .chat-scroll-button, .channel-scroll-button');
        
        if (target && target !== lastHoveredElement) {
            // Check if it's not disabled
            if (!target.disabled && !target.classList.contains('disabled')) {
                // Play hover sound
                const soundClone = hoverSound.cloneNode();
                soundClone.volume = hoverSound.volume;
                soundClone.play().catch(() => {});
            }
            lastHoveredElement = target;
        }
    }, true);

    document.addEventListener('mouseout', (e) => {
        const target = e.target.closest('button, a, .btn, .nav-btn, .nav-btn-mini, .bottom-btn, .buddy-mini-btn, .server-item, .buddy-item, .buddy-scroll-button, .chat-scroll-button, .channel-scroll-button');
        if (target === lastHoveredElement) {
            lastHoveredElement = null;
        }
    }, true);

    document.addEventListener('click', (e) => {
        const target = e.target.closest('button, a, .btn, .nav-btn, .nav-btn-mini, .bottom-btn, .buddy-mini-btn, .server-item, .buddy-item, .buddy-scroll-button, .chat-scroll-button, .channel-scroll-button');
        if (target && !target.disabled && !target.classList.contains('disabled')) {
            const soundClone = clickSound.cloneNode();
            soundClone.volume = clickSound.volume;
            soundClone.play().catch(() => {});
        }
    }, true);

    // Global Animated Cursor Logic using a div overlay
    let cursorFrame = 0;
    let lastMoveTime = 0;
    let moveTimeout;
    let cursorDiv = null;

    function createCursorDiv() {
        cursorDiv = document.createElement('div');
        cursorDiv.id = 'custom-cursor';
        document.body.appendChild(cursorDiv);
    }

    function updateCursorFrame(frame) {
        if (cursorDiv) {
            cursorDiv.style.backgroundImage = `url('/assets/cursor/cursor_frame_${frame}.png')`;
        }
    }

    // Create cursor div as soon as body is available
    if (document.body) {
        createCursorDiv();
    } else {
        document.addEventListener('DOMContentLoaded', createCursorDiv);
    }

    document.addEventListener('mousemove', (e) => {
        // Position the cursor div at the mouse location
        if (cursorDiv) {
            cursorDiv.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        }

        // Animate frames while moving
        const now = Date.now();
        if (now - lastMoveTime > 40) { // ~25 FPS
            cursorFrame = (cursorFrame + 1) % 17; // 0-16
            updateCursorFrame(cursorFrame);
            lastMoveTime = now;
        }
        
        clearTimeout(moveTimeout);
        moveTimeout = setTimeout(() => {
            cursorFrame = 0;
            updateCursorFrame(0);
        }, 100); // Reset after 100ms of no movement
    });

    // Hide custom cursor when mouse leaves the window
    document.addEventListener('mouseleave', () => {
        if (cursorDiv) cursorDiv.style.display = 'none';
    });
    document.addEventListener('mouseenter', () => {
        if (cursorDiv) cursorDiv.style.display = '';
    });
})();
