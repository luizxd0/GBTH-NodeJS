// audio_manager.js
(function() {
    // Read saved settings or default to 50%
    let bgmVolume = localStorage.getItem('gbth_bgmVolume') !== null ? parseFloat(localStorage.getItem('gbth_bgmVolume')) : 0.5;
    let sfxVolume = localStorage.getItem('gbth_sfxVolume') !== null ? parseFloat(localStorage.getItem('gbth_sfxVolume')) : 0.5;
    let bgmMuted = localStorage.getItem('gbth_bgmMuted') === 'true';
    let sfxMuted = localStorage.getItem('gbth_sfxMuted') === 'true';

    // Store active audio elements
    const activeAudios = new Set();
    const originalVolumeDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
    const originalPlay = HTMLMediaElement.prototype.play;

    Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
        get() {
            return this.__baseVolume !== undefined ? this.__baseVolume : originalVolumeDescriptor.get.call(this);
        },
        set(value) {
            this.__baseVolume = value;
            const isMusic = this.src && this.src.includes('.mp3');
            const multiplier = isMusic ? (bgmMuted ? 0 : bgmVolume) : (sfxMuted ? 0 : sfxVolume);
            // Apply volume via multiplier dynamically. Fall back to 1.0 if baseVolume isn't set somehow for playback.
            originalVolumeDescriptor.set.call(this, value * multiplier);
        }
    });

    HTMLMediaElement.prototype.play = function() {
        activeAudios.add(this);
        // Force volume setter immediately
        this.volume = this.__baseVolume !== undefined ? this.__baseVolume : originalVolumeDescriptor.get.call(this);
        
        // Clean up from active set when paused or ended so it doesn't leak memory
        const remove = () => activeAudios.delete(this);
        this.addEventListener('ended', remove, { once: true });
        this.addEventListener('pause', remove, { once: true });
        
        return originalPlay.apply(this, arguments);
    };

    function recalculateVolumes() {
        for (const audio of activeAudios) {
            // Re-trigger the setter to update effective volume based on new multipliers
            audio.volume = audio.__baseVolume !== undefined ? audio.__baseVolume : 1.0;
        }
    }

    // Inject the Options UI once DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.innerHTML = `
            #gbth-options-btn {
                position: fixed;
                top: -9999px;
                left: -9999px;
                background-color: #0b1f3d;
                border: 2px solid #1a3a6a;
                color: #fff;
                font-family: var(--gbth-ui-font, Tahoma, Verdana, Arial, sans-serif);
                font-size: 12px;
                font-weight: bold;
                padding: 6px 12px;
                cursor: inherit;
                z-index: 9999;
                box-shadow: 2px 2px 0 #000;
            }
            #gbth-options-btn:hover { background-color: #163666; }
            #gbth-options-btn:active { transform: translate(1px, 1px); box-shadow: 1px 1px 0 #000; }

            #gbth-options-modal {
                display: none;
                position: fixed;
                top: -9999px;
                left: -9999px;
                width: 250px;
                background-color: #000;
                border: 3px solid #1a3a6a;
                z-index: 9999;
                font-family: var(--gbth-ui-font, Tahoma, Verdana, Arial, sans-serif);
                color: #fff;
                padding: 10px;
                cursor: inherit;
                box-shadow: 4px 4px 0 rgba(0,0,0,0.8);
            }
            #gbth-options-modal.active { display: block; }

            .gbth-options-header {
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 12px;
                border-bottom: 2px solid #1a3a6a;
                padding-bottom: 4px;
                text-align: center;
                color: #ffff00;
                cursor: inherit;
            }

            .gbth-options-row {
                display: flex;
                flex-direction: column;
                margin-bottom: 12px;
                cursor: inherit;
            }
            .gbth-options-row-top {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 4px;
                cursor: inherit;
            }
            .gbth-options-label { font-size: 11px; font-weight: bold; cursor: inherit; }
            
            .gbth-mute-btn {
                background: #0b1f3d; border: 1px solid #1a3a6a; color: #fff; 
                font-size: 10px; cursor: inherit; padding: 2px 6px;
            }
            .gbth-mute-btn.muted { background: #880000; border-color: #550000; }

            .gbth-slider {
                -webkit-appearance: none;
                width: 100%; height: 6px; background: #1a3a6a; outline: none; border-radius: 3px;
                cursor: inherit;
            }
            .gbth-slider::-webkit-slider-thumb {
                -webkit-appearance: none; appearance: none;
                width: 14px; height: 14px; background: #ffff00; cursor: inherit; border-radius: 50%; border: 2px solid #000;
            }
        `;
        document.head.appendChild(style);

        const btn = document.createElement('button');
        btn.id = 'gbth-options-btn';
        btn.innerText = '\u2699 Options';
        document.body.appendChild(btn);

        const modal = document.createElement('div');
        modal.id = 'gbth-options-modal';
        modal.innerHTML = `
            <div class="gbth-options-header">Game Audio</div>

            <div class="gbth-options-row">
                <div class="gbth-options-row-top">
                    <span class="gbth-options-label">Music (BGM)</span>
                    <button id="gbth-mute-bgm" class="gbth-mute-btn ${bgmMuted ? 'muted' : ''}">${bgmMuted ? 'Muted' : 'Mute'}</button>
                </div>
                <input type="range" id="gbth-vol-bgm" class="gbth-slider" min="0" max="1" step="0.05" value="${bgmVolume}">
            </div>

            <div class="gbth-options-row">
                <div class="gbth-options-row-top">
                    <span class="gbth-options-label">Sounds (SFX)</span>
                    <button id="gbth-mute-sfx" class="gbth-mute-btn ${sfxMuted ? 'muted' : ''}">${sfxMuted ? 'Muted' : 'Mute'}</button>
                </div>
                <input type="range" id="gbth-vol-sfx" class="gbth-slider" min="0" max="1" step="0.05" value="${sfxVolume}">
            </div>
        `;
        document.body.appendChild(modal);

        const OPTIONS_BTN_TOP_OFFSET = -42;
        const OPTIONS_BTN_RIGHT_OFFSET = 4;
        const OPTIONS_MODAL_GAP = 6;
        const DEFAULT_MODAL_TOTAL_WIDTH = 276;

        const positionOptionsUi = () => {
            const gameContainer = document.getElementById('game-container');
            if (!gameContainer) {
                btn.style.left = '12px';
                btn.style.top = '12px';
                modal.style.left = '12px';
                modal.style.top = '44px';
                return;
            }

            const rect = gameContainer.getBoundingClientRect();
            const btnWidth = Math.max(1, Math.round(btn.getBoundingClientRect().width || btn.offsetWidth || 100));
            const btnHeight = Math.max(1, Math.round(btn.getBoundingClientRect().height || btn.offsetHeight || 30));
            const modalWidth = Math.max(1, Math.round(modal.offsetWidth || DEFAULT_MODAL_TOTAL_WIDTH));

            const btnLeft = Math.round(rect.right - btnWidth + OPTIONS_BTN_RIGHT_OFFSET);
            const btnTop = Math.round(rect.top + OPTIONS_BTN_TOP_OFFSET);
            const modalLeft = Math.round(rect.right - modalWidth + OPTIONS_BTN_RIGHT_OFFSET);
            const modalTop = btnTop + btnHeight + OPTIONS_MODAL_GAP;

            btn.style.left = `${btnLeft}px`;
            btn.style.top = `${btnTop}px`;
            modal.style.left = `${modalLeft}px`;
            modal.style.top = `${modalTop}px`;
        };

        positionOptionsUi();
        window.addEventListener('resize', positionOptionsUi);
        window.addEventListener('scroll', positionOptionsUi, true);

        // Click outside closes modal
        document.addEventListener('click', (e) => {
            if (modal.classList.contains('active') && !modal.contains(e.target) && e.target !== btn) {
                modal.classList.remove('active');
            }
        });

        btn.addEventListener('click', () => {
            modal.classList.toggle('active');
        });

        // Background Music Handlers
        document.getElementById('gbth-vol-bgm').addEventListener('input', (e) => {
            bgmVolume = parseFloat(e.target.value);
            if (bgmMuted && bgmVolume > 0) {
                bgmMuted = false;
                const mBtn = document.getElementById('gbth-mute-bgm');
                mBtn.classList.remove('muted');
                mBtn.innerText = 'Mute';
            }
            localStorage.setItem('gbth_bgmVolume', bgmVolume);
            localStorage.setItem('gbth_bgmMuted', bgmMuted);
            recalculateVolumes();
        });

        document.getElementById('gbth-mute-bgm').addEventListener('click', (e) => {
            bgmMuted = !bgmMuted;
            e.target.classList.toggle('muted', bgmMuted);
            e.target.innerText = bgmMuted ? 'Muted' : 'Mute';
            localStorage.setItem('gbth_bgmMuted', bgmMuted);
            recalculateVolumes();
        });

        // Sound Effects Handlers
        document.getElementById('gbth-vol-sfx').addEventListener('input', (e) => {
            sfxVolume = parseFloat(e.target.value);
            if (sfxMuted && sfxVolume > 0) {
                sfxMuted = false;
                const mBtn = document.getElementById('gbth-mute-sfx');
                mBtn.classList.remove('muted');
                mBtn.innerText = 'Mute';
            }
            localStorage.setItem('gbth_sfxVolume', sfxVolume);
            localStorage.setItem('gbth_sfxMuted', sfxMuted);
            recalculateVolumes();
        });

        document.getElementById('gbth-mute-sfx').addEventListener('click', (e) => {
            sfxMuted = !sfxMuted;
            e.target.classList.toggle('muted', sfxMuted);
            e.target.innerText = sfxMuted ? 'Muted' : 'Mute';
            localStorage.setItem('gbth_sfxMuted', sfxMuted);
            recalculateVolumes();
        });
    });
})();

