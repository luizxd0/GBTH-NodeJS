document.addEventListener('DOMContentLoaded', () => {
    // Play opening transition on load
    playTransition('opening');
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
                playTransition('closing', () => {
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
             alert('Exiting game...');
        });
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

    // Custom Animated Cursor Logic
    let cursorFrame = 0;
    let lastMoveTime = 0;
    
    // Set initial cursor on the root element for consistent inheritance
    document.documentElement.style.cursor = `url('/assets/cursor/cursor_frame_0.png') 0 0, auto`;

    document.addEventListener('mousemove', () => {
        const now = Date.now();
        // Play cursor animation roughly at 25 fps when moving
        if (now - lastMoveTime > 40) {
            cursorFrame = (cursorFrame + 1) % 17; // frames 0 to 16
            // Apply to body for better rendering and inheritance
            document.body.style.cursor = `url('/assets/cursor/cursor_frame_${cursorFrame}.png') 0 0, auto`;
            lastMoveTime = now;
        }
    });

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

    function playTransition(type, callback) {
        const transition = document.getElementById('screen-transition');
        if (!transition) {
            if (callback) callback();
            return;
        }

        transition.classList.remove('opening', 'closing', 'run');
        transition.classList.add('active', type);
        
        // Force reflow
        transition.offsetHeight;

        if (type === 'opening') {
            // Bars are at translate(0,0) by default in opening class
            // Now start moving them out
            transition.classList.add('run');
        } else {
            // type === 'closing'
            // Bars start OUT by default, now move them IN
            transition.classList.add('run');
        }

        setTimeout(() => {
            if (type === 'opening') {
                transition.classList.remove('active', 'opening', 'run');
            }
            if (callback) callback();
        }, 700); 
    }
});
