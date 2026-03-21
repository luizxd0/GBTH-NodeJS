document.addEventListener('DOMContentLoaded', () => {
    // Message area
    const authMessage = document.getElementById('auth-message');
    const loginView = document.getElementById('login-view');
    const signupView = document.getElementById('signup-view');
    const linkShowSignup = document.getElementById('link-show-signup');
    const linkShowLogin = document.getElementById('link-show-login');

    linkShowSignup.addEventListener('click', (e) => {
        e.preventDefault();
        loginView.classList.add('hidden');
        signupView.classList.remove('hidden');
        authMessage.textContent = '';
    });

    linkShowLogin.addEventListener('click', (e) => {
        e.preventDefault();
        signupView.classList.add('hidden');
        loginView.classList.remove('hidden');
        authMessage.textContent = '';
    });

    // Audio Logic
    let bgm = new Audio('/assets/shared/sounds/title.mp3');
    bgm.loop = false;
    bgm.preload = 'auto';

    // Pre-unlock audio on first user gesture
    function unlockAudio() {
        bgm.play().then(() => {
            bgm.pause();
            bgm.currentTime = 0;
        }).catch(e => {});
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('keydown', unlockAudio);
    }
    document.addEventListener('click', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    // Signup Submission
    const signupForm = document.getElementById('signup-form');
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(signupForm);
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch('/api/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            if (response.ok) {
                // Store user data dynamically
                sessionStorage.setItem('user', JSON.stringify(result.user));
                
                // Show loading animation
                const joiningOverlay = document.getElementById('joining-overlay');
                if (joiningOverlay) joiningOverlay.classList.remove('hidden');

                // Play intro sound
                bgm.play().catch(e => console.log('Audio play failed:', e));

                // Navigate after 1.5s delay
                setTimeout(() => {
                    window.playTransition('closing', () => {
                        window.location.href = '/views/world_list.html';
                    });
                }, 1500);
            } else {
                showError('Signup Error', result.error || 'Signup failed');
            }
        } catch (error) {
            showError('Connection Error', 'Could not connect to the server.');
        }
    });

    // Login Submission
    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(loginForm);
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            if (response.ok) {
                // Store user data dynamically
                sessionStorage.setItem('user', JSON.stringify(result.user));
                
                // Show loading animation
                const joiningOverlay = document.getElementById('joining-overlay');
                if (joiningOverlay) joiningOverlay.classList.remove('hidden');

                // Play intro sound
                bgm.play().catch(e => console.log('Audio play failed:', e));

                // Navigate after 1.5s delay
                setTimeout(() => {
                    window.playTransition('closing', () => {
                        window.location.href = '/views/world_list.html';
                    });
                }, 1500);
            } else {
                showError('Login Error', result.error || 'Login failed');
            }
        } catch (error) {
            showError('Connection Error', 'Could not connect to the server.');
        }
    });

    function showMessage(msg, type) {
        authMessage.textContent = msg;
        authMessage.className = type;
    }

    function showError(title, message) {
        const errorOverlay = document.getElementById('error-overlay');
        const errorTitle = document.getElementById('error-title');
        const errorMessage = document.getElementById('error-message');
        const errorBtn = document.getElementById('error-confirm-btn');

        if (errorOverlay && errorTitle && errorMessage) {
            errorTitle.textContent = title;
            errorMessage.textContent = message;
            errorOverlay.classList.remove('hidden');
            
            if (errorBtn) {
                errorBtn.onclick = () => {
                    errorOverlay.classList.add('hidden');
                };
            }
        }
    }
});

