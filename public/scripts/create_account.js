document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.getElementById('signup-form');
    const messageDiv = document.getElementById('signup-message');
    const btnCancel = document.getElementById('btn-signup-cancel');

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(signupForm);
            const data = Object.fromEntries(formData.entries());
            const normalizedUsername = String(data.username || '').trim();
            const normalizedNickname = String(data.nickname || '').trim();

            if (data.password !== data.confirm_password) {
                showMessage('Passwords do not match!', 'error');
                return;
            }

            if (normalizedUsername.toLowerCase() === normalizedNickname.toLowerCase()) {
                showMessage('Username and Nickname must be different', 'error');
                return;
            }

            try {
                const response = await fetch('/api/signup', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok) {
                    showMessage('Account created successfully!', 'success');
                    setTimeout(() => {
                        window.location.href = '/views/index.html'; // Redirect to login or world list
                    }, 2000);
                } else {
                    showMessage(result.error || 'Failed to create account', 'error');
                }
            } catch (error) {
                console.error('Signup error:', error);
                showMessage('Connection error. Please try again later.', 'error');
            }
        });
    }

    if (btnCancel) {
        btnCancel.addEventListener('click', () => {
            window.history.back();
        });
    }

    function showMessage(msg, type) {
        messageDiv.textContent = msg;
        messageDiv.className = type;
        messageDiv.style.display = 'block';
    }
});
