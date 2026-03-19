(function (global) {
    const root = global.GBTH = global.GBTH || {};
    const buddy = root.buddy = root.buddy || {};

    buddy.getStatusFrame = function getStatusFrame(isOnline, location) {
        if (!isOnline) return 4;
        if (location === 'world_list') return 5;
        if (location === 'channel') return 2;
        if (location === 'in_game') return 3;
        if (location === 'avatar_shop') return 6;
        return 0;
    };

    buddy.createItem = function createItem(entry, options = {}) {
        const { includeIdDataset = false } = options;

        const item = document.createElement('div');
        item.className = 'buddy-item';
        item.dataset.nickname = entry.nickname || '';

        if (includeIdDataset && entry.id) {
            item.dataset.id = entry.id;
        }

        const rankSrc = `/assets/shared/rank1/rank1_frame_${entry.grade}.png`;
        const statusFrame = buddy.getStatusFrame(entry.online, entry.location);
        const statusImg = `<img src="/assets/screens/lobby/buddy_back/buddy_back_frame_${statusFrame}.png" class="buddy-status-img status-${statusFrame} buddy-logout">`;

        item.innerHTML = `
            <div class="buddy-rank-box">
                <img src="${rankSrc}" class="buddy-rank-icon">
            </div>
            <div class="buddy-info">
                <div class="buddy-guild">${entry.guild || ''}</div>
                <div class="buddy-nickname">${entry.nickname}</div>
            </div>
            <div class="buddy-status">
                ${statusImg}
                ${entry.online && (entry.location === 'channel' || entry.location === 'in_game') ? `
                    <div class="buddy-server-status">
                        <span class="buddy-status-value server">${entry.serverId}</span>
                    </div>
                    <div class="buddy-channel-status">
                        <span class="buddy-status-value channel">${entry.channelId}</span>
                    </div>
                ` : ''}
            </div>
        `;

        return item;
    };

    buddy.renderList = function renderList(listContent, entries, options = {}) {
        if (!listContent) return;

        const fragment = document.createDocumentFragment();
        entries.forEach((entry) => {
            fragment.appendChild(buddy.createItem(entry, options));
        });

        listContent.innerHTML = '';
        listContent.appendChild(fragment);
    };

    buddy.bindInteractions = function bindInteractions(config) {
        const {
            listContent,
            onOpenChat
        } = config || {};

        if (!listContent || listContent.dataset.interactionsBound === 'true') return;

        let selectedItem = null;

        listContent.addEventListener('click', (event) => {
            const item = event.target.closest('.buddy-item');
            if (!item || !listContent.contains(item)) return;

            if (selectedItem && selectedItem !== item) {
                selectedItem.classList.remove('selected');
            }
            selectedItem = item;
            selectedItem.classList.add('selected');
        });

        listContent.addEventListener('dblclick', (event) => {
            const item = event.target.closest('.buddy-item');
            if (!item || !listContent.contains(item)) return;

            const nickname = item.dataset.nickname;
            if (nickname && onOpenChat) {
                onOpenChat(nickname);
            }
        });

        listContent.dataset.interactionsBound = 'true';
    };

    buddy.clearSelection = function clearSelection(listContent) {
        if (!listContent) return;
        const selected = listContent.querySelector('.buddy-item.selected');
        if (selected) {
            selected.classList.remove('selected');
        }
    };
})(window);

