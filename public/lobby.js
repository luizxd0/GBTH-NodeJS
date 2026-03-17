document.addEventListener('DOMContentLoaded', () => {
    // Play opening transition on load
    playTransition('opening');
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
                    playTransition('closing', () => {
                        window.location.href = 'world_list.html';
                    });
                }
            });
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
            transition.classList.add('run');
        } else {
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
