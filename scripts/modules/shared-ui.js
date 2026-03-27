(function initBuildMasterSharedUiModule() {
    function bindTapAction(element, handler) {
        if (!element || typeof handler !== 'function') return;
        let lastInvokeAt = 0;
        const invoke = (event) => {
            const now = Date.now();
            if (now - lastInvokeAt < 450) return;
            lastInvokeAt = now;
            handler(event);
        };
        element.addEventListener('touchend', (event) => {
            event.preventDefault();
            invoke(event);
        }, { passive: false });
        element.addEventListener('click', (event) => {
            invoke(event);
        });
    }

    window.BuildMasterSharedUiModule = {
        bindTapAction
    };
}());
