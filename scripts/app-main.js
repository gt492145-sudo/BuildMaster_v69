    function exposeInlineActionHandlers() {
        Object.assign(window, {
            submitSecurityCode,
            setUserLevel,
            setWorkMode,
            toggleCoachMode,
            toggleAiCoachMode,
            toggleWarRoom,
            startCoachGuide,
            toggleContrastMode,
            toggleAutoContrastMode,
            startBmAutoTestFromUi
        });
    }

    const bindTapAction = (window.BuildMasterSharedUiModule && window.BuildMasterSharedUiModule.bindTapAction)
        ? window.BuildMasterSharedUiModule.bindTapAction
        : function fallbackBindTapAction(element, handler) {
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
        };

    function bindPrimaryHeaderActions() {
        bindTapAction(document.getElementById('levelBasicBtn'), () => setUserLevel('1'));
        bindTapAction(document.getElementById('levelStandardBtn'), () => setUserLevel('2'));
        bindTapAction(document.getElementById('levelProBtn'), () => setUserLevel('3'));
        bindTapAction(document.getElementById('workCalcBtn'), () => setWorkMode('calc'));
        bindTapAction(document.getElementById('workStakeBtn'), () => setWorkMode('stake'));
        bindTapAction(document.getElementById('coachToggle'), () => toggleCoachMode());
        bindTapAction(document.getElementById('aiCoachToggle'), () => toggleAiCoachMode());
        bindTapAction(document.getElementById('btnWarRoom'), () => toggleWarRoom());
        bindTapAction(document.getElementById('btnMemberChatEntry'), () => toggleMemberChatPanel());
        bindTapAction(document.getElementById('btnWarRoomEntry'), () => toggleWarRoom());
        bindTapAction(document.getElementById('coachGuideBtn'), () => startCoachGuide(true));
        bindTapAction(document.getElementById('contrastToggle'), () => toggleContrastMode());
        bindTapAction(document.getElementById('contrastAutoToggle'), () => toggleAutoContrastMode());
        bindTapAction(document.querySelector('#securityLock button.tool-btn'), () => submitSecurityCode());
    }

    exposeInlineActionHandlers();
    bindPrimaryHeaderActions();
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
