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
                
                // Play closing transition before redirect
                playTransition('closing', () => {
                    window.location.href = 'world_list.html';
                });
            } else {
                showMessage(result.error || 'Signup failed', 'error');
            }
        } catch (error) {
            showMessage('Connection error', 'error');
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
                
                // Play closing transition before redirect
                playTransition('closing', () => {
                    window.location.href = 'world_list.html';
                });
            } else {
                showMessage(result.error || 'Login failed', 'error');
            }
        } catch (error) {
            showMessage('Connection error', 'error');
        }
    });

    function showMessage(msg, type) {
        authMessage.textContent = msg;
        authMessage.className = type;
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

        transition.classList.add('run');

        setTimeout(() => {
            if (type === 'opening') {
                transition.classList.remove('active', 'opening', 'run');
            }
            if (callback) callback();
        }, 700); 
    }
});
