(function initBuildMasterNavigationModule() {
    function getCalcModule() {
        return window.BuildMasterCalcPagesModule || null;
    }

    function getStakeModule() {
        return window.BuildMasterStakePageModule || null;
    }

    function normalizeWorkMode(mode) {
        return mode === 'stake' ? 'stake' : 'calc';
    }

    function readStoredWorkMode(storageKey) {
        try {
            return normalizeWorkMode(localStorage.getItem(storageKey) || 'calc');
        } catch (_e) {
            return 'calc';
        }
    }

    function writeStoredWorkMode(storageKey, mode) {
        const normalized = normalizeWorkMode(mode);
        try {
            localStorage.setItem(storageKey, normalized);
        } catch (_e) {}
        return normalized;
    }

    function ensureFixedPageOrder() {
        const calcModule = getCalcModule();
        const stakeModule = getStakeModule();
        const calcSection = calcModule && typeof calcModule.getCalcSection === 'function'
            ? calcModule.getCalcSection()
            : null;
        const stakeSection = stakeModule && typeof stakeModule.getStakeSection === 'function'
            ? stakeModule.getStakeSection()
            : null;
        if (calcSection && stakeSection && calcSection.nextElementSibling !== stakeSection) {
            calcSection.insertAdjacentElement('afterend', stakeSection);
        }
        let anchor = stakeSection;
        const supportingNodes = stakeModule && typeof stakeModule.getStakeSupportingNodes === 'function'
            ? stakeModule.getStakeSupportingNodes()
            : [];
        supportingNodes.forEach((node) => {
            if (!anchor || !node) return;
            if (anchor.nextElementSibling !== node) {
                anchor.insertAdjacentElement('afterend', node);
            }
            anchor = node;
        });
    }

    function getScrollTarget(mode) {
        const normalized = normalizeWorkMode(mode);
        if (normalized === 'stake') {
            const stakeModule = getStakeModule();
            return stakeModule && typeof stakeModule.getStakeScrollTarget === 'function'
                ? stakeModule.getStakeScrollTarget()
                : null;
        }
        const calcModule = getCalcModule();
        return calcModule && typeof calcModule.getCalcScrollTarget === 'function'
            ? calcModule.getCalcScrollTarget()
            : null;
    }

    function scrollToModeSection(mode) {
        const target = getScrollTarget(mode);
        if (!target || typeof target.scrollIntoView !== 'function') return;
        requestAnimationFrame(() => {
            setTimeout(() => {
                const panel = target.closest('.calc-panel');
                const panelStyle = panel ? window.getComputedStyle(panel) : null;
                const panelScrollable = !!(panel
                    && panel.scrollHeight > panel.clientHeight + 8
                    && panelStyle
                    && panelStyle.overflowY !== 'visible');
                if (panelScrollable && typeof panel.scrollTo === 'function') {
                    const panelRect = panel.getBoundingClientRect();
                    const targetRect = target.getBoundingClientRect();
                    const nextTop = panel.scrollTop + (targetRect.top - panelRect.top) - 12;
                    panel.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
                    return;
                }
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 80);
        });
    }

    function setNodeVisibility(node, visible) {
        if (!node) return;
        node.hidden = !visible;
        node.style.display = visible ? '' : 'none';
        node.inert = !visible;
        node.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }

    function applyWorkMode(storageKey) {
        const mode = readStoredWorkMode(storageKey);
        const calcBtn = document.getElementById('workCalcBtn');
        const stakeBtn = document.getElementById('workStakeBtn');
        const calcModule = getCalcModule();
        const stakeModule = getStakeModule();
        if (calcBtn) calcBtn.classList.remove('active');
        if (stakeBtn) stakeBtn.classList.remove('active');
        if (calcBtn && mode === 'calc') calcBtn.classList.add('active');
        if (stakeBtn && mode === 'stake') stakeBtn.classList.add('active');
        const calcSection = calcModule && typeof calcModule.getCalcSection === 'function'
            ? calcModule.getCalcSection()
            : null;
        const stakeSection = stakeModule && typeof stakeModule.getStakeSection === 'function'
            ? stakeModule.getStakeSection()
            : null;
        setNodeVisibility(calcSection, mode === 'calc');
        setNodeVisibility(stakeSection, mode === 'stake');
        const stakeSupportingNodes = stakeModule && typeof stakeModule.getStakeSupportingNodes === 'function'
            ? stakeModule.getStakeSupportingNodes()
            : [];
        stakeSupportingNodes.forEach((node) => setNodeVisibility(node, mode === 'stake'));
        return mode;
    }

    window.BuildMasterNavigationModule = {
        normalizeWorkMode,
        readStoredWorkMode,
        writeStoredWorkMode,
        ensureFixedPageOrder,
        scrollToModeSection,
        applyWorkMode
    };
}());
