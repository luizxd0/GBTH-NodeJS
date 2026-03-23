(() => {
    window.GBTH_AVATAR_POSE_CONFIG = {
        version: 1,
        contexts: {
            avatar_shop: {
                anchorX: 31,
                anchorY: 58,
                offsetX: 15,
                offsetY: 20
            },
            game_room: {
                anchorX: 31,
                anchorY: 58,
                // Game room slots use a different viewport than avatar shop.
                // Keep a dedicated calibration so avatar body sits in mobile seat.
                offsetX: 5,
                offsetY: 2
            }
        }
    };
})();
