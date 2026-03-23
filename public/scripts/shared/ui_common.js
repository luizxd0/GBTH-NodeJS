(function (global) {
    const root = global.GBTH = global.GBTH || {};
    const ui = root.ui = root.ui || {};

    ui.makeDraggable = function makeDraggable(element, options = {}) {
        if (!element) return () => {};

        const ignoreSelector = options.ignoreSelector || 'button';
        const dragHandle = options.handleSelector ? element.querySelector(options.handleSelector) : element;
        if (!dragHandle) return () => {};

        let startX = 0;
        let startY = 0;
        let dragging = false;

        const onMouseMove = (event) => {
            if (!dragging) return;
            event.preventDefault();

            const scale = global.currentScale || 1;
            const diffX = (startX - event.clientX) / scale;
            const diffY = (startY - event.clientY) / scale;
            startX = event.clientX;
            startY = event.clientY;

            element.style.top = `${element.offsetTop - diffY}px`;
            element.style.left = `${element.offsetLeft - diffX}px`;
        };

        const onMouseUp = () => {
            dragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        const onMouseDown = (event) => {
            if (ignoreSelector && event.target.closest(ignoreSelector)) return;

            startX = event.clientX;
            startY = event.clientY;
            dragging = true;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        dragHandle.addEventListener('mousedown', onMouseDown);

        return () => {
            dragHandle.removeEventListener('mousedown', onMouseDown);
            onMouseUp();
        };
    };

    ui.centerInContainer = function centerInContainer(config = {}) {
        const isElementInput = config instanceof Element;
        const element = isElementInput ? config : config.element;
        const container = isElementInput
            ? (element?.offsetParent || document.getElementById('game-container') || document.body)
            : (config.container || element?.offsetParent || document.getElementById('game-container') || document.body);
        const offsetX = Number(isElementInput ? 0 : config.offsetX) || 0;
        const offsetY = Number(isElementInput ? 0 : config.offsetY) || 0;

        if (!element || !container) {
            return { left: 0, top: 0 };
        }

        const width = element.offsetWidth || Number.parseFloat(global.getComputedStyle(element).width) || 0;
        const height = element.offsetHeight || Number.parseFloat(global.getComputedStyle(element).height) || 0;
        const containerWidth = container.clientWidth || container.offsetWidth || 0;
        const containerHeight = container.clientHeight || container.offsetHeight || 0;

        const left = Math.max(0, Math.round((containerWidth - width) / 2 + offsetX));
        const top = Math.max(0, Math.round((containerHeight - height) / 2 + offsetY));

        element.style.right = '';
        element.style.bottom = '';
        element.style.left = `${left}px`;
        element.style.top = `${top}px`;

        return { left, top };
    };

    ui.setupScrollControls = function setupScrollControls(config) {
        const {
            viewport,
            upButton,
            downButton,
            scrollAmount = 30,
            bottomThreshold = 2,
            topThreshold = 0
        } = config || {};

        if (!viewport || !upButton || !downButton) {
            return { update: () => {} };
        }

        const update = () => {
            if (viewport.scrollTop <= topThreshold) {
                upButton.classList.add('disabled');
            } else {
                upButton.classList.remove('disabled');
            }

            if (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - bottomThreshold) {
                downButton.classList.add('disabled');
            } else {
                downButton.classList.remove('disabled');
            }
        };

        upButton.addEventListener('click', () => {
            viewport.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
        });

        downButton.addEventListener('click', () => {
            viewport.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        });

        viewport.addEventListener('scroll', update);
        update();

        return { update };
    };

    ui.setupInputCursor = function setupInputCursor(config) {
        const {
            input,
            cursor,
            ghost,
            baseLeft = 0,
            baseTop = null,
            useInputOffset = false
        } = config || {};

        if (!input || !cursor || !ghost) {
            return { update: () => {} };
        }

        const update = () => {
            const safeSelectionStart = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
            const textBeforeCursor = input.value.substring(0, safeSelectionStart);
            ghost.textContent = textBeforeCursor;

            const width = ghost.offsetWidth;
            const left = useInputOffset ? (input.offsetLeft + baseLeft + width) : (baseLeft + width);
            cursor.style.left = `${left}px`;

            if (typeof baseTop === 'number') {
                const top = useInputOffset ? (input.offsetTop + baseTop) : baseTop;
                cursor.style.top = `${top}px`;
            }
        };

        ['input', 'keyup', 'click', 'focus', 'blur'].forEach((eventName) => {
            input.addEventListener(eventName, update);
        });

        update();

        return { update };
    };

    ui.createErrorPopupController = function createErrorPopupController(config) {
        const {
            overlay,
            title,
            message,
            confirmButton
        } = config || {};

        const hide = () => {
            if (overlay) overlay.classList.add('hidden');
        };

        const show = (popupTitle, popupMessage) => {
            if (!overlay || !title || !message) return;
            title.textContent = popupTitle;
            message.textContent = popupMessage;
            overlay.classList.remove('hidden');
        };

        if (confirmButton) {
            confirmButton.addEventListener('click', hide);
        }

        return { show, hide };
    };
})(window);
