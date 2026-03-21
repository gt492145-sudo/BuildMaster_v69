    initMobileFuncDrawer();
    applyQaProfile(currentQaProfile, true);
    applyBimSpecPreset(currentBimSpecPreset, true);
    renderAutoInterpretMemoryPanel();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') {
            sessionStorage.removeItem(OWNER_UNLOCK_SESSION_KEY);
            updateOwnerLockButton();
        }
    });
