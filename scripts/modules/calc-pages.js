(function initBuildMasterCalcPagesModule() {
    const CALC_SECTION_ID = 'calcModePage';
    const CALC_ADVANCED_ID = 'calcAdvancedPage';

    function getCalcSection() {
        return document.getElementById(CALC_SECTION_ID);
    }

    function getCalcAdvancedAnchor() {
        return document.getElementById(CALC_ADVANCED_ID);
    }

    function getCalcScrollTarget() {
        return getCalcAdvancedAnchor() || getCalcSection();
    }

    window.BuildMasterCalcPagesModule = {
        ids: {
            calcSection: CALC_SECTION_ID,
            calcAdvanced: CALC_ADVANCED_ID
        },
        getCalcSection,
        getCalcAdvancedAnchor,
        getCalcScrollTarget
    };
}());
