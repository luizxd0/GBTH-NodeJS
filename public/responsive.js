/**
 * responsive.js
 * Handles dynamic scaling of the #game-container to fit mobile and desktop screens.
 */

(function() {
    const TARGET_WIDTH = 800;
    const TARGET_HEIGHT = 600;
    const CONTAINER_ID = 'game-container';

    function updateScale() {
        const container = document.getElementById(CONTAINER_ID);
        if (!container) return;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Calculate scale ratios
        const scaleX = viewportWidth / TARGET_WIDTH;
        const scaleY = viewportHeight / TARGET_HEIGHT;

        // Use the smaller ratio to ensure the entire container fits (fit-to-screen)
        // Multiply by 0.95 to reduce overall size slightly as requested
        const scale = Math.min(scaleX, scaleY) * 0.95;
        window.currentScale = scale;
        // Apply scale transition/transform
        container.style.transform = `scale(${scale})`;
        container.style.transformOrigin = 'center center';
        
        // Ensure the body doesn't show scrollbars during scaling
        document.body.style.overflow = 'hidden';
        
        // Optional: Center the scaled container if it's smaller than the viewport
        // This is usually handled by the flex layout but scale doesn't affect actual layout size
        // so we might need to adjust positions if necessary.
    }

    // Initial scale
    window.addEventListener('load', updateScale);
    
    // Scale on resize and orientation change
    window.addEventListener('resize', updateScale);
    window.addEventListener('orientationchange', () => {
        // Delay slightly to allow innerWidth/Height to update correctly
        setTimeout(updateScale, 100);
    });

    // Proactive scale for immediate effect
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        updateScale();
    }
})();
