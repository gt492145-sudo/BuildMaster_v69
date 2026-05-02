(function initBuildMasterStakePageModule() {
    const STAKE_SECTION_ID = 'stakeModePage';
    const STAKE_PROJECT_TITLE_ID = 'stakeProjectTitle';
    const STAKE_PROJECT_META_ROW_ID = 'stakeProjectMetaRow';
    const STAKE_MEMBER_WRAP_ID = 'stakeMemberWrap';

    function getStakeSection() {
        return document.getElementById(STAKE_SECTION_ID);
    }

    function getStakeProjectTitle() {
        return document.getElementById(STAKE_PROJECT_TITLE_ID);
    }

    function getStakeProjectMetaRow() {
        return document.getElementById(STAKE_PROJECT_META_ROW_ID);
    }

    function getStakeMemberWrap() {
        return document.getElementById(STAKE_MEMBER_WRAP_ID);
    }

    function getStakeSupportingNodes() {
        return [
            getStakeProjectTitle(),
            getStakeProjectMetaRow(),
            getStakeMemberWrap()
        ].filter(Boolean);
    }

    function getStakeScrollTarget() {
        return getStakeSection();
    }

    window.BuildMasterStakePageModule = {
        ids: {
            stakeSection: STAKE_SECTION_ID,
            stakeProjectTitle: STAKE_PROJECT_TITLE_ID,
            stakeProjectMetaRow: STAKE_PROJECT_META_ROW_ID,
            stakeMemberWrap: STAKE_MEMBER_WRAP_ID
        },
        getStakeSection,
        getStakeProjectTitle,
        getStakeProjectMetaRow,
        getStakeMemberWrap,
        getStakeSupportingNodes,
        getStakeScrollTarget
    };
}());
