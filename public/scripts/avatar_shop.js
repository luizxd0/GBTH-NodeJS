document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const userData = JSON.parse(sessionStorage.getItem('user'));

    const nicknameSpan = document.getElementById('avatar-shop-nickname');
    const gpSpan = document.getElementById('avatar-shop-gp');
    const goldSpan = document.getElementById('avatar-shop-gold');
    const cashSpan = document.getElementById('avatar-shop-cash');

    function updateHeader(data) {
        if (!data) return;
        if (nicknameSpan) nicknameSpan.textContent = data.nickname || '';
        if (gpSpan) gpSpan.textContent = `${(data.score || 0).toLocaleString()} GP`;
        if (goldSpan) goldSpan.textContent = `GOLD : ${(data.gold || 0).toLocaleString()}`;
        if (cashSpan) cashSpan.textContent = `CASH : ${(data.cash || 0).toLocaleString()}`;
    }

    updateHeader(userData);

    if (userData) {
        socket.emit('set_user_data', {
            nickname: userData.nickname,
            id: userData.id,
            gender: userData.gender,
            grade: userData.grade || 24,
            guild: userData.guild || '',
            authority: userData.authority || 0,
            location: 'avatar_shop'
        });
    }

    socket.on('user_info_update', (data) => {
        sessionStorage.setItem('user', JSON.stringify(data));
        updateHeader(data);
    });

    const btnStoreExit = document.getElementById('btn-store-exit');
    const btnStorePuton = document.getElementById('btn-store-puton');
    const btnStoreBuy = document.getElementById('btn-store-buy');

    if (btnStorePuton) btnStorePuton.disabled = true;
    if (btnStoreBuy) btnStoreBuy.disabled = true;

    if (btnStoreExit) {
        btnStoreExit.addEventListener('click', () => {
            window.playTransition('closing', () => {
                window.location.href = 'lobby.html';
            });
        });
    }

    const categoryButtons = document.querySelectorAll('.avatar-shop-toggle');
    categoryButtons.forEach((button) => {
        button.addEventListener('click', () => {
            categoryButtons.forEach((btn) => btn.classList.remove('active'));
            button.classList.add('active');
        });
    });
});
