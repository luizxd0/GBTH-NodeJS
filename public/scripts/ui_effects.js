/**
 * UI Effects Utility
 * Handles global UI sound effects like button hovers, screen transitions, and persistent BGM.
 */

window.playTransition = function(type, callback) {
    if (window.enforceCursorLock) {
        window.enforceCursorLock();
    }
    if (type === 'closing') {
        try {
            sessionStorage.setItem('gbth_cursor_lock_transition_v1', '1');
        } catch (_) {
            // Ignore storage write errors.
        }
    }

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
     * channel.mp3 starts from the Lobby or Avatar Shop.
     * Once started, it remains persistent even when returning to the World List.
     */
    const isLobby = window.location.pathname.includes('lobby.html');
    const isAvatarShop = window.location.pathname.includes('avatar_shop.html');
    const isWorldList = window.location.pathname.includes('world_list.html');
    
    // Check if BGM should be active
    if (isLobby || isAvatarShop) {
        sessionStorage.setItem('bgmActive', 'true');
    }
    
    const bgmActive = sessionStorage.getItem('bgmActive') === 'true';

    if (isLobby || isAvatarShop || (isWorldList && bgmActive)) {
        const bgm = new Audio('/assets/shared/sounds/channel.mp3');
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

    const hoverSound = new Audio('/assets/shared/sounds/bselect1.ogg');
    hoverSound.preload = 'auto';
    hoverSound.volume = 0.5;

    const clickSound = new Audio('/assets/shared/sounds/bpush1.ogg');
    clickSound.preload = 'auto';
    clickSound.volume = 0.5;

    let lastHoveredElement = null;
    const shouldSuppressHoverSound = (target) => {
        if (!target) return false;
        return target.classList?.contains('avatar-shop-item') === true
            || target.classList?.contains('avatar-shop-owned-item') === true
            || target.classList?.contains('avatar-shop-owned-ex-item') === true
            || target.classList?.contains('buddy-item') === true;
    };

    const shouldSuppressClickSound = (target) => {
        if (!target) return false;
        return target.classList?.contains('avatar-shop-item') === true;
    };

    document.addEventListener('mouseover', (e) => {
        // Find the closest interactive element
        const target = e.target.closest('button, a, .btn, .nav-btn, .nav-btn-mini, .bottom-btn, .buddy-mini-btn, .server-item, .buddy-item, .buddy-scroll-button, .chat-scroll-button, .channel-scroll-button');
        
        if (target && target !== lastHoveredElement) {
            // Check if it's not disabled
            if (!target.disabled && !target.classList.contains('disabled') && !shouldSuppressHoverSound(target)) {
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
        if (target && !target.disabled && !target.classList.contains('disabled') && !shouldSuppressClickSound(target)) {
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
    let hasCursorPosition = false;
    let cursorX = 0;
    let cursorY = 0;
    const CURSOR_LOCK_STYLE_ID = 'gbth-cursor-lock-runtime';
    const CURSOR_FALLBACK_CSS_VALUE = "url('/assets/shared/cursor/cursor_frame_0.png') 0 0, none";

    function hideNativeCursorImmediately() {
        let lockStyle = document.getElementById(CURSOR_LOCK_STYLE_ID);
        if (!lockStyle) {
            lockStyle = document.createElement('style');
            lockStyle.id = CURSOR_LOCK_STYLE_ID;
            lockStyle.textContent = `
                html,
                body,
                *,
                *::before,
                *::after {
                    cursor: ${CURSOR_FALLBACK_CSS_VALUE} !important;
                }
            `;
            (document.head || document.documentElement).appendChild(lockStyle);
        }

        if (document.documentElement) {
            document.documentElement.style.setProperty('cursor', CURSOR_FALLBACK_CSS_VALUE, 'important');
        }
        if (document.body) {
            document.body.style.setProperty('cursor', CURSOR_FALLBACK_CSS_VALUE, 'important');
        }
    }

    function loadCursorPosition() {
        try {
            const raw = sessionStorage.getItem('gbth_cursor_position_v1');
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || !Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return;
            cursorX = Math.max(0, parsed.x);
            cursorY = Math.max(0, parsed.y);
            hasCursorPosition = true;
        } catch (_) {
            // Ignore storage parse errors.
        }
    }

    function persistCursorPosition() {
        if (!hasCursorPosition) return;
        try {
            sessionStorage.setItem('gbth_cursor_position_v1', JSON.stringify({
                x: cursorX,
                y: cursorY
            }));
        } catch (_) {
            // Ignore storage write errors.
        }
    }

    function createCursorDiv() {
        if (cursorDiv && cursorDiv.isConnected) {
            return cursorDiv;
        }

        const existingCursor = document.getElementById('custom-cursor');
        cursorDiv = existingCursor || document.createElement('div');
        cursorDiv.id = 'custom-cursor';

        // Inline fallback styles so custom cursor appears before stylesheet fully loads.
        Object.assign(cursorDiv.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '22px',
            height: '22px',
            pointerEvents: 'none',
            zIndex: '99999',
            backgroundImage: "url('/assets/shared/cursor/cursor_frame_0.png')",
            backgroundSize: '22px 22px',
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
            willChange: 'transform'
        });

        const cursorParent = document.body || document.documentElement;
        if (cursorParent && cursorDiv.parentNode !== cursorParent) {
            cursorParent.appendChild(cursorDiv);
        }

        if (hasCursorPosition) {
            cursorDiv.style.transform = `translate(${cursorX}px, ${cursorY}px)`;
            cursorDiv.style.display = '';
        } else {
            cursorDiv.style.display = 'none';
        }

        return cursorDiv;
    }

    function updateCursorFrame(frame) {
        if (cursorDiv) {
            cursorDiv.style.backgroundImage = `url('/assets/shared/cursor/cursor_frame_${frame}.png')`;
        }
    }

    window.enforceCursorLock = hideNativeCursorImmediately;
    hideNativeCursorImmediately();
    loadCursorPosition();
    createCursorDiv();

    document.addEventListener('DOMContentLoaded', () => {
        hideNativeCursorImmediately();
        createCursorDiv();
    });

    document.addEventListener('mousemove', (e) => {
        if (!cursorDiv) {
            createCursorDiv();
        }

        cursorX = e.clientX;
        cursorY = e.clientY;
        hasCursorPosition = true;

        // Position the cursor div at the mouse location
        if (cursorDiv) {
            cursorDiv.style.display = '';
            cursorDiv.style.transform = `translate(${cursorX}px, ${cursorY}px)`;
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

    window.addEventListener('beforeunload', () => {
        hideNativeCursorImmediately();
        persistCursorPosition();
    });
    window.addEventListener('pagehide', () => {
        hideNativeCursorImmediately();
        persistCursorPosition();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            hideNativeCursorImmediately();
        }
    });

    // Hide custom cursor when mouse leaves the window
    document.addEventListener('mouseleave', () => {
        if (cursorDiv) cursorDiv.style.display = 'none';
    });
    document.addEventListener('mouseenter', () => {
        if (cursorDiv && hasCursorPosition) cursorDiv.style.display = '';
    });
})();

