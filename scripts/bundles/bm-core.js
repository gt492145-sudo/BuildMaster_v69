
/* === scripts/modules/shared-ui.js === */
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

/* === scripts/modules/calc-pages.js === */
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

/* === scripts/modules/stake-page.js === */
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
        // 會員管理區已移至 calcModePage 頂端，勿隨放樣模式隱藏，管理者在「計算」模式即可操作。
        return [
            getStakeProjectTitle(),
            getStakeProjectMetaRow()
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

/* === scripts/modules/navigation.js === */
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

/* === scripts/loader/panel-widgets-loader.js === */
(function initBuildMasterPanelWidgetsLoader() {
    let loadPromise = null;

    (function seedDeferredPanelApiStubs() {
        if (typeof window.addAuditLog !== 'function') {
            window.addAuditLog = function addAuditLogStub() {};
        }
        if (typeof window.updateQaDashboard !== 'function') {
            window.updateQaDashboard = function updateQaDashboardStub() {};
        }
    }());

    window.ensurePanelWidgetsLoaded = function ensurePanelWidgetsLoaded() {
        if (typeof initUtilityWidgets === 'function') {
            return Promise.resolve();
        }
        if (loadPromise) return loadPromise;
        loadPromise = new Promise((resolve, reject) => {
            const s1 = document.createElement('script');
            s1.src = 'scripts/features/measurement-logs.js?v=v827';
            s1.onload = () => {
                const s2 = document.createElement('script');
                s2.src = 'scripts/features/bim-qa.js?v=v833';
                s2.onload = () => resolve();
                s2.onerror = (e) => reject(e || new Error('bim-qa load failed'));
                document.body.appendChild(s2);
            };
            s1.onerror = (e) => reject(e || new Error('measurement-logs load failed'));
            document.body.appendChild(s1);
        });
        return loadPromise;
    };
}());

/* === scripts/core/core-bootstrap.js === */
    // 1.0 資料隔離與相容性設定
    const STORAGE_KEY = 'bm_69:list';
    const SCHEMA_VERSION = '8.5';
    const SECURITY_UNLOCK_KEY = 'bm_69:security_unlocked';
    const OWNER_LOCK_HASH_KEY = 'cm_owner_lock_hash_v1';
    const OWNER_UNLOCK_SESSION_KEY = 'cm_owner_lock_unlocked_v1';
    const MEMBER_CODES_STORAGE_KEY = 'bm_69:member_codes';
    const AUTH_TOKEN_KEY = 'bm_69:auth_token';
    const API_BASE_URL_KEY = 'bm_69:api_base_url';
    const LOCAL_OFFLINE_DEMO_KEY = 'bm_69:local_offline_demo';
    const LOCAL_OFFLINE_BASIC_ENTITLEMENTS = {
        calcCore: true,
        measureQaReport: false,
        dataSync: false
    };
    const SECURITY_CONFIG = {
        allowedHosts: [
            'gt492145-sudo.github.io',
            'localhost',
            '127.0.0.1',
            'wenwenming.com',
            'www.wenwenming.com'
        ],
        allowDirectIpHosts: true
    };
    function isCapacitorShell() {
        try {
            return !!(typeof window !== 'undefined' && window.Capacitor);
        } catch (_e) {
            return false;
        }
    }
    function isCapacitorIos() {
        try {
            const cap = window.Capacitor;
            return !!(cap && typeof cap.getPlatform === 'function' && String(cap.getPlatform()) === 'ios');
        } catch (_e) {
            return false;
        }
    }
    function isIosReviewRuntime() {
        try {
            if (isCapacitorIos()) return true;
            if (typeof navigator === 'undefined') return false;
            const ua = String(navigator.userAgent || '');
            const platform = String(navigator.platform || '');
            const hasAppleTouch = Number(navigator.maxTouchPoints || 0) > 1;
            return /iPad|iPhone|iPod/i.test(ua) || (/MacIntel/i.test(platform) && hasAppleTouch);
        } catch (_e) {
            return false;
        }
    }
    function shouldShowLocalApiDevButton() {
        try {
            if (isCapacitorShell()) return false;
            if (typeof location === 'undefined') return false;
            const h = String(location.hostname || '');
            return h === 'localhost' || h === '127.0.0.1';
        } catch (_e) {
            return false;
        }
    }
    const AI_API_ENABLED = true;
    let appBootstrapped = false;
    let scalePixelsPerUnit = 0;
    let drawMode = 'none';
    let clickPoints = [];
    let calibrationPendingPoint = null;
    let manualPrecisionState = { active: false, clientX: 0, clientY: 0, targetClientX: 0, targetClientY: 0 };
    let zoomLevel = 1;
    const SMART_MEASURE_DRAW_MODES = ['smart-calibration', 'smart-measure'];
    const SMART_MEASURE_MODE_LABELS = {
        'smart-calibration': '智慧定比例',
        'smart-measure': '智慧量圖'
    };
    const SMART_MEASURE_COMPONENT_LABELS = {
        slab: '版',
        wall: '牆',
        column: '柱',
        beam: '樑'
    };
    let imageFilterState = { contrast: 1, brightness: 1 };
    let selectedMaterial = null;
    const PRICES_JSON_URL = 'prices.json';
    const REGION_STORAGE_KEY = 'bm_69:region_pref';
    const GYRO_MODE_KEY = 'bm_69:gyro_mode';
    const MEASURE_ASSIST_KEY = 'bm_69:measure_assist';
    const MEASURE_STRICT_KEY = 'bm_69:measure_strict';
    const MEASUREMENT_LOG_STORAGE_KEY = 'bm_69:measurement_logs';
    const MEASURE_STRICT_TILT_DEG = 8;
    const REGION_FILE_MAP = {
        '台北市': 'prices-taipei.json',
        '新北市': 'prices-newtaipei.json',
        '桃園市': 'prices-taoyuan.json',
        '台中市': 'prices-taichung.json',
        '台南市': 'prices-tainan.json',
        '高雄市': 'prices-kaohsiung.json'
    };
    const WEATHER_REGION_CENTER_MAP = {
        '台北市': { latitude: 25.0375, longitude: 121.5637 },
        '新北市': { latitude: 25.0169, longitude: 121.4628 },
        '桃園市': { latitude: 24.9937, longitude: 121.3009 },
        '台中市': { latitude: 24.1477, longitude: 120.6736 },
        '台南市': { latitude: 22.9997, longitude: 120.2270 },
        '高雄市': { latitude: 22.6273, longitude: 120.3014 }
    };
    const WEATHER_GEOLOCATION_MAX_ACCURACY_M = 1800;
    const WEATHER_CODE_MAP = {
        0: '晴朗',
        1: '大致晴',
        2: '局部多雲',
        3: '陰天',
        45: '霧',
        48: '霧凇',
        51: '毛毛雨',
        53: '小雨',
        55: '中雨',
        61: '小雨',
        63: '中雨',
        65: '大雨',
        71: '小雪',
        73: '中雪',
        75: '大雪',
        80: '短暫雨',
        81: '陣雨',
        82: '強陣雨',
        95: '雷雨',
        96: '雷雨夾冰雹',
        99: '強雷雨夾冰雹'
    };
    const DEFAULT_MATERIAL_CATALOG = [
        { name: '模板工程(透天)', price: 14000 },
        { name: '模板工程(大樓)', price: 10800 },
        { name: '模板工程(大樓)-鋁模', price: 1400 },
        { name: '2000psi混凝土(140kg)', price: 2700 },
        { name: '3000psi混凝土(210kg)', price: 2800 },
        { name: '竹節鋼筋(SD280)', price: 16400 },
        { name: '竹節鋼筋(SD420W)', price: 17600 },
        { name: '鋼筋加工費', price: 1500 },
        { name: '綁紮工程(透天)', price: 6400 },
        { name: '綁紮工程(大樓)', price: 6200 },
        { name: '鷹架(透天)', price: 320 },
        { name: '鷹架(大樓)', price: 520 }
    ];
    const STAKING_EXPORT_QA_MIN_SCORE = 85;
    const STAKING_STABILITY_RETEST_RUNS = 3;
    const STAKING_STABILITY_DRIFT_THRESHOLD_M = 0.03;
    const QA_PROFILE_STORAGE_KEY = 'bm_69:qa_profile';
    const BIM_SPEC_PRESET_STORAGE_KEY = 'bm_69:bim_spec_preset';
    const QA_PROFILE_CONFIGS = {
        standard: {
            label: '標準',
            thresholds: { S: 95, A: 90, B: 80, C: 70, D: 60 },
            warningPenalty: 5,
            missingTypePenalty: 6,
            noQuantityPenalty: 5,
            entityPenalty: 18,
            elementPenalty: 18,
            layoutDuplicatePenalty: 2,
            layoutMissingPenalty: 5,
            layoutRangePenalty: 3,
            namingPenalty: 2,
            floorPenalty: 2,
            clusterPenalty: 1
        },
        strict: {
            label: '嚴格',
            thresholds: { S: 97, A: 93, B: 85, C: 75, D: 65 },
            warningPenalty: 6,
            missingTypePenalty: 8,
            noQuantityPenalty: 8,
            entityPenalty: 22,
            elementPenalty: 22,
            layoutDuplicatePenalty: 3,
            layoutMissingPenalty: 6,
            layoutRangePenalty: 4,
            namingPenalty: 3,
            floorPenalty: 3,
            clusterPenalty: 2
        },
        enterprise: {
            label: '企業',
            thresholds: { S: 99, A: 95, B: 90, C: 80, D: 70 },
            warningPenalty: 7,
            missingTypePenalty: 10,
            noQuantityPenalty: 10,
            entityPenalty: 26,
            elementPenalty: 26,
            layoutDuplicatePenalty: 4,
            layoutMissingPenalty: 7,
            layoutRangePenalty: 5,
            namingPenalty: 4,
            floorPenalty: 4,
            clusterPenalty: 3
        }
    };
    const BIM_SPEC_PRESETS = {
        general: {
            label: 'BuildMaster 通用',
            requiredTypes: ['IFCWALL', 'IFCBEAM', 'IFCCOLUMN'],
            minEntities: 50,
            minElements: 10,
            requireQuantities: false,
            requireFloorTag: false,
            pointIdPattern: /^(LP|P|PT|COL|WALL|BEAM|SLAB)[-_A-Z0-9]+$/i,
            duplicateToleranceM: 0.01,
            maxAbsCoord: 10000
        },
        public: {
            label: '公共工程 BIM',
            requiredTypes: ['IFCWALL', 'IFCBEAM', 'IFCCOLUMN', 'IFCSLAB'],
            minEntities: 200,
            minElements: 30,
            requireQuantities: true,
            requireFloorTag: true,
            pointIdPattern: /^(COL|WALL|BEAM|SLAB|LP)-[A-Z0-9_-]+$/i,
            duplicateToleranceM: 0.01,
            maxAbsCoord: 6000
        },
        structure: {
            label: '結構施工 BIM',
            requiredTypes: ['IFCBEAM', 'IFCCOLUMN', 'IFCSLAB'],
            minEntities: 120,
            minElements: 20,
            requireQuantities: true,
            requireFloorTag: true,
            pointIdPattern: /^(COL|BEAM|SLAB|WALL|LP)-[A-Z0-9_-]+$/i,
            duplicateToleranceM: 0.008,
            maxAbsCoord: 8000
        }
    };
    let materialCatalog = [...DEFAULT_MATERIAL_CATALOG];
    let currentRegionLabel = '全台共用';
    let currentRegionMode = '預設';
    let currentMaterialSourceMeta = {
        file: '內建預設',
        generatedAt: '',
        updateMode: '',
        seasonalFactor: '',
        fallbackReason: ''
    };
    let bimModelData = null;
    let bimEstimateRows = [];
    let bimLayoutPoints = [];
    let bimLayoutQaResult = null;
    let bimLayoutPrecisionPass = 0;
    let quantumStakeAutoRuns = 0;
    let layoutAlignmentState = null;
    let layoutConfidenceFilterMode = 'all';
    let layoutSpotCheckSelection = [];
    let stakingConservativeMode = false;
    let latestWeatherAdviceLevel = '未知';
    const BIM_RULES_STORAGE_KEY = 'bm_69:bim_rules';
    const BIM_AUDIT_STORAGE_KEY = 'bm_69:bim_audit_logs';
    const BIM_SNAPSHOT_STORAGE_KEY = 'bm_69:bim_snapshots';
    const UNIT_OPTIONS = ['m', '尺', 'm²', '坪', '建坪', 'm³', '噸', '件', '組', '台', '戶', '樘', '只', '工', '次', '包', '塊', '才'];
    let bimRuleMap = {};
    let bimAuditLogs = [];
    let bimSnapshots = [];
    let stakingRunHistory = [];
    let stakingReviewMemory = [];
    let currentQaProfile = 'enterprise';
    let currentBimSpecPreset = 'public';
    let memberCodeMap = {};
    let is3DView = false;
    let is360Spinning = false;
    let spinTimer = null;
    let rotation3D = { x: 0, y: 0 };
    let dragState3D = { active: false, x: 0, y: 0 };
    let gyroState = { enabled: false, ready: false, baselineBeta: null, baselineGamma: null, smoothX: 0, smoothY: 0 };
    let measureAssistState = { enabled: false, strict: false, baselineBeta: null, baselineGamma: null, tiltDeg: 0, warned: false };
    let measureQaStats = {
        startedAt: new Date().toISOString(),
        calibrationStarts: 0,
        calibrationSuccess: 0,
        measureStarts: 0,
        measureSuccess: 0,
        tiltSamples: 0,
        tiltSum: 0,
        tiltMax: 0,
        strictBlocks: 0,
        smartSessions: 0,
        smartCompleted: 0,
        smartSnapUses: 0,
        smartManualAdjusts: 0,
        smartDragAdjusts: 0,
        smartFallbacks: 0,
        smartLowConfidence: 0
    };
    let measurementLogs = [];
    let list = [];
    let backendSessionState = {
        token: '',
        account: '',
        sessionType: 'access',
        userLevel: 'basic',
        entitlements: {},
        featureOverrides: {},
        integrations: {},
        canManageMembers: false,
        accessExpiresAt: '',
        billing: {}
    };
    let workspaceHydratedFromBackend = false;
    const workspacePersistTimers = {};

    const canvas = document.getElementById('drawCanvas');
    const ctx = canvas.getContext('2d');
    const img = document.getElementById('blueprint');

    const COACH_DISABLED_KEY = 'bm_69:coach_disabled';
    const COACH_GUIDE_DONE_KEY = 'bm_69:coach_guide_done';
    const AI_COACH_ENABLED_KEY = 'bm_69:ai_coach_enabled';
    const AI_COACH_API_KEY = 'bm_69:ai_coach_api_key';
    const AI_COACH_MODEL_KEY = 'bm_69:ai_coach_model';
    const AI_COACH_ENDPOINT_KEY = 'bm_69:ai_coach_endpoint';
    const USER_LEVEL_KEY = 'bm_69:user_level';
    const WORK_MODE_KEY = 'bm_69:work_mode';
    const IBM_QUANTUM_KEY_STORAGE = 'bm_69:ibm_quantum_key';
    const CONTRAST_MODE_KEY = 'bm_69:contrast_mode';
    const CONTRAST_AUTO_KEY = 'bm_69:contrast_auto';
    const SUNLIGHT_MODE_KEY = 'bm_69:sunlight_mode';
    const MOBILE_VIEW_MODE_KEY = 'bm_69:mobile_view_mode';
    const WAR_ROOM_KEY = 'bm_69:war_room_enabled';
    const FEATURE_FLAGS_KEY = 'bm_69:feature_flags';
    const SHOW_WAR_ROOM_ROWS_KEY = 'bm_69:show_war_room_rows';
    const DEMO_MODE_KEY = 'bm_69:demo_mode';
    const EDGE_AI_MIN_SCORE = 0.5;
    const EDGE_AI_ALLOWED_CLASSES = [];
    let smartMeasureState = {
        active: false,
        mode: 'idle',
        step: 'idle',
        componentType: 'slab',
        measurePlan: [],
        currentTaskIndex: -1,
        bounds: null,
        suggestionLine: null,
        guidePoints: [],
        confirmedPoints: [],
        qualityScore: 0,
        fallbackUsed: false,
        lastSnapUsed: false,
        lastManualAdjust: false,
        dragAdjustCount: 0,
        nudgeAdjustCount: 0,
        message: '未啟動',
        lastResult: '',
        lastQaSummary: ''
    };
    const COACH_GUIDE_STEPS = [
        { selector: '#coachToggle', message: '第 1 步：建議保持「解說員」為開啟。你點畫面上任何按鈕或區塊，我都會用白話說明用途與下一步；進階問題可再開「AI解說」（會員3＋後端設定）。' },
        { selector: '#workCalcBtn', message: '第 2 步：記住新版固定規則——第 1 到 3 頁是計算模式；先從這裡留在計算頁。' },
        { selector: '#calcMeasureCluster', message: '第 3 步：在第三頁先做智慧定比例與智慧量圖，讓圖紙尺寸和比例更穩定。' },
        { selector: '#calcAiVisionCluster', message: '第 4 步：再做 AI 看圖辨識，包含快速判讀、精準辨識與柱樑尺寸標註。' },
        { selector: '#calcIbmCluster', message: '第 5 步：第三頁只做 IBM 自動計算、估價預覽與匯入清單；放樣本身改在第四頁執行。' },
        { selector: '.btn-add', message: '第 6 步：確認即時預覽後，把資料吸入計算清單並匯出報表。' },
        { selector: '#workStakeBtn', message: '第 7 步：需要放樣時，再切到第四頁放樣模式；切換後只會顯示第四頁放樣相關內容。' },
        { selector: '#stakeExecutionCluster', message: '第 8 步：第四頁先設定柱、牆、梁與高精度，再執行一鍵放樣流程。' },
        { selector: '#stakeQaCluster', message: '第 9 步：最後做控制點配準、偏差熱圖、穩定度重測與放樣 QA。' }
    ];
    let coachTimer = null;
    let coachBound = false;
    let coachEscapeBound = false;
    let coachGuideState = { active: false, stepIndex: 0 };
    let coachLastTouchAt = 0;
    let coachLastInteractionAt = 0;
    let coachLastTargetSig = '';
    const COACH_CLICK_THROTTLE_MS = 280;
    const COACH_TOUCH_TO_CLICK_GUARD_MS = 650;
    const COACH_DUPLICATE_TARGET_MS = 1200;
    let canvasLastTouchAt = 0;
    const CANVAS_TOUCH_CLICK_GUARD_MS = 700;
    let suppressNextCanvasClick = false;
    let suppressNextCanvasTouch = false;
    let smartMeasureDragState = { active: false, pointIndex: -1, moved: false };
    let blueprintPanState = { active: false, lastX: 0, lastY: 0, moved: false };
    let blueprintPinchState = { active: false, startDistance: 0, startZoom: 1 };
    let blueprintTapState = { lastAt: 0, lastX: 0, lastY: 0 };
    let aiCoachState = { enabled: false, busy: false };
    let bluetoothDevice = null;
    let fakeLaserTimer = null;
    let laserConnectInProgress = false;
    let laserRulerMode = 'real';
    let voiceAgentListening = false;
    let voiceRecognition = null;
    let voiceGuardTimer = null;
    let warRoomTimer = null;
    let warRoomConnectTimer = null;
    let isWarRoomActive = false;
    let featureFlags = { aiVision: true, voice: false, laser: true, warRoom: true };
    let showWarRoomRows = true;
    let demoModeEnabled = true;
    let warRoomList = [];
    let resilienceGuardsBound = false;
    const resilienceState = { globalErrors: 0, storageErrors: 0, networkErrors: 0, lastToastAt: 0 };
    let watchdogTimer = null;
    let lifecycleGuardsBound = false;
    let watchdogLagStrikes = 0;
    let watchdogLastTickAt = 0;
    let watchdogLastWarnAt = 0;
    let safeModeActive = false;
    const WATCHDOG_INTERVAL_MS = 1500;
    const WATCHDOG_LAG_THRESHOLD_MS = 2200;
    const WATCHDOG_WARN_THROTTLE_MS = 10000;
    const WATCHDOG_HIBERNATION_RESET_MS = 20000;

    let last3DMoveAt = 0;
    let qaStressMode = false;
    let qaStressRenderTimer = null;
    let qaStressNetworkTimer = null;
    let qaStressExportProbeCount = 0;
    let destructiveTestMode = false;
    let destructiveTestTimer = null;
    let destructiveTestTickCount = 0;
    let isQuantumScanning = false;
    let quantumScanLockTimer = null;
    let quantumWallTimers = [];
    let chaosMonkeyMode = false;
    let chaosMonkeyTimer = null;
    let chaosMonkeyTickCount = 0;
    let chaosMonkeyLastActionName = '';
    let chaosMonkeyPrevActionName = '';
    /** 剛跑過定比例／開始量測後，連續幾輪不再抽這兩招（先依冷卻建池再遞減 tick） */
    let chaosMonkeyCalibCooldownTicks = 0;
    let siteWeatherAutoRefreshTimer = null;
    let laserChaosStats = { dirtyBlocked: 0, successWrites: 0 };
    const SITE_WEATHER_REFRESH_MS = 12 * 60 * 1000;

    function safeToast(message) {
        const now = Date.now();
        if (now - resilienceState.lastToastAt < 1200) return;
        resilienceState.lastToastAt = now;
        try {
            if (typeof showToast === 'function') showToast(message);
        } catch (_e) {}
    }

    function updateLaserChaosChip() {
        const chip = document.getElementById('laserChaosChip');
        if (!chip) return;
        chip.innerText = `雷射資料計數：無效 ${laserChaosStats.dirtyBlocked} / 成功 ${laserChaosStats.successWrites}`;
    }

    const safeStorage = {
        get(storage, key, fallback = '') {
            try {
                const value = storage.getItem(key);
                return value === null ? fallback : value;
            } catch (error) {
                resilienceState.storageErrors += 1;
                console.warn('讀取儲存資料失敗', key, error);
                return fallback;
            }
        },
        set(storage, key, value) {
            try {
                storage.setItem(key, value);
                return true;
            } catch (error) {
                resilienceState.storageErrors += 1;
                console.warn('寫入儲存資料失敗', key, error);
                safeToast('儲存空間不足或受限，已保留目前操作但暫無法寫入本機。');
                return false;
            }
        },
        remove(storage, key) {
            try {
                storage.removeItem(key);
                return true;
            } catch (error) {
                resilienceState.storageErrors += 1;
                console.warn('移除儲存資料失敗', key, error);
                return false;
            }
        }
    };

    function initGlobalErrorGuards() {
        if (resilienceGuardsBound) return;
        resilienceGuardsBound = true;
        window.addEventListener('error', event => {
            resilienceState.globalErrors += 1;
            console.error('全域錯誤', event.error || event.message || event);
            safeToast('偵測到執行異常，已啟用保護模式。');
        });
        window.addEventListener('unhandledrejection', event => {
            resilienceState.globalErrors += 1;
            console.error('未處理的非同步錯誤', event.reason || event);
            safeToast('偵測到非同步異常，已自動降級部分功能。');
        });
    }

    async function fetchWithRetry(url, options = {}, retryOptions = {}) {
        const retries = Number.isInteger(retryOptions.retries) ? retryOptions.retries : 2;
        const baseDelayMs = Number.isFinite(retryOptions.baseDelayMs) ? retryOptions.baseDelayMs : 350;
        const timeoutMs = Number.isFinite(retryOptions.timeoutMs) ? retryOptions.timeoutMs : 8000;
        const retryOnStatuses = Array.isArray(retryOptions.retryOnStatuses)
            ? retryOptions.retryOnStatuses
            : [408, 425, 429, 500, 502, 503, 504];
        const qaChaosEnabled = qaStressMode && retryOptions.enableQaChaos !== false;

        let lastError = null;
        for (let attempt = 0; attempt <= retries; attempt++) {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
            try {
                if (qaChaosEnabled) {
                    const jitter = 80 + Math.floor(Math.random() * 420);
                    await new Promise(resolve => setTimeout(resolve, jitter));
                    if (Math.random() < 0.16) throw new Error('QA injected network jitter failure');
                }
                const mergedOptions = controller
                    ? { ...options, signal: controller.signal }
                    : options;
                const response = await fetch(url, mergedOptions);
                if (!response.ok && attempt < retries && retryOnStatuses.includes(response.status)) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response;
            } catch (error) {
                lastError = error;
                if (attempt >= retries) break;
                const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 120);
                await new Promise(resolve => setTimeout(resolve, delay));
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
            }
        }

        resilienceState.networkErrors += 1;
        console.warn('網路請求重試後仍失敗', url, lastError);
        throw lastError || new Error('Network request failed');
    }

    function cloneJsonPayload(value, fallback) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_error) {
            return fallback;
        }
    }

    function normalizeApiBaseUrl(rawBase) {
        const raw = String(rawBase || '').trim();
        if (!raw || raw === '/') return '/api';
        if (/^https?:\/\/[^/]+$/i.test(raw)) return `${raw}/api`;
        return raw.replace(/\/+$/g, '');
    }

    function getDefaultApiBaseForRuntime() {
        try {
            if (isCapacitorShell()) {
                const cap = window.Capacitor;
                if (cap && typeof cap.getPlatform === 'function' && String(cap.getPlatform()) === 'ios') {
                    return 'https://wenwenming.com';
                }
            }
        } catch (_e) {}
        return '/api';
    }

    function getApiBaseUrl() {
        return normalizeApiBaseUrl(safeStorage.get(localStorage, API_BASE_URL_KEY, getDefaultApiBaseForRuntime()));
    }

    function normalizeMemberAccount(account) {
        return String(account || '').trim().toLowerCase();
    }

    function buildApiUrl(pathName) {
        const normalizedPath = String(pathName || '').startsWith('/') ? String(pathName) : `/${String(pathName || '')}`;
        return `${getApiBaseUrl()}${normalizedPath}`;
    }

    async function apiRequest(pathName, options = {}) {
        const method = options.method || 'GET';
        const headers = {
            'Accept': 'application/json',
            ...(options.headers || {})
        };
        if (options.body !== undefined) headers['Content-Type'] = 'application/json';
        if (!options.skipAuth && backendSessionState.token) {
            headers.Authorization = `Bearer ${backendSessionState.token}`;
        }

        const response = await fetchWithRetry(
            buildApiUrl(pathName),
            {
                method,
                headers,
                body: options.body === undefined ? undefined : JSON.stringify(options.body)
            },
            {
                retries: Number.isFinite(options.retries) ? options.retries : 1,
                timeoutMs: Number.isFinite(options.timeoutMs) ? options.timeoutMs : 15000
            }
        );

        const rawText = await response.text();
        let payload = {};
        if (rawText) {
            try {
                payload = JSON.parse(rawText);
            } catch (_error) {
                payload = { raw: rawText };
            }
        }

        if (!response.ok) {
            const error = new Error(payload.message || payload.error || `HTTP ${response.status}`);
            error.status = response.status;
            error.payload = payload;
            if (response.status === 401 && options.skipAuth !== true) {
                clearBackendSession(true);
                updateBillingStatusChip();
                showSecurityLock('登入已失效或通行證已過期，請重新驗證。');
            }
            throw error;
        }

        return payload;
    }

    function purgeLegacySecurityStorage() {
        [
            AI_COACH_API_KEY,
            AI_COACH_ENDPOINT_KEY,
            IBM_QUANTUM_KEY_STORAGE,
            MEMBER_CODES_STORAGE_KEY,
            STORAGE_KEY,
            MEASUREMENT_LOG_STORAGE_KEY,
            BIM_RULES_STORAGE_KEY,
            BIM_AUDIT_STORAGE_KEY,
            BIM_SNAPSHOT_STORAGE_KEY,
            QA_PROFILE_STORAGE_KEY,
            BIM_SPEC_PRESET_STORAGE_KEY,
            'bm_69:auto_interpret_memory'
        ].forEach((key) => safeStorage.remove(localStorage, key));
    }

    function updateBillingStatusChip() {
        const el = document.getElementById('billingStatusChip');
        if (!el) return;
        if (!backendSessionState.token) {
            el.hidden = true;
            el.textContent = '';
            el.removeAttribute('title');
            return;
        }
        const iso = String(backendSessionState.accessExpiresAt || '').trim();
        if (!iso) {
            el.hidden = true;
            el.textContent = '';
            el.removeAttribute('title');
            return;
        }
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) {
            el.hidden = true;
            return;
        }
        const billing = backendSessionState.billing || {};
        const src = billing.source;
        const srcLabel = src === 'stripe' ? 'Stripe'
            : src === 'apple' ? 'Apple IAP'
            : src === 'password' ? '會員密碼'
            : src === 'access_code' ? '存取碼'
            : '';
        const dateStr = d.toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' });
        let title = `通行證到期：${iso}`;
        if (billing.hasSubscriptionExpiry) {
            title += '\n訂閱制：效期與 Stripe／Apple 帳單週期連動，到期後請續約或重新付款兌換。';
        } else if (src === 'password') {
            title += '\n管理者建立的會員帳號；JWT 預設約 12 小時，到期請重新登入。';
        } else if (src === 'access_code') {
            title += '\n存取碼登入；JWT 預設約 12 小時，到期請重新輸入。';
        }
        el.hidden = false;
        el.textContent = srcLabel ? `通行證至 ${dateStr} · ${srcLabel}` : `通行證至 ${dateStr}`;
        el.title = title;
    }

    function maybeWarnBillingExpirySoon() {
        try {
            if (sessionStorage.getItem('bm_69:billing_expiry_warn') === '1') return;
            const iso = String(backendSessionState.accessExpiresAt || '').trim();
            if (!iso || !backendSessionState.token) return;
            const end = new Date(iso).getTime();
            if (Number.isNaN(end)) return;
            const remaining = end - Date.now();
            if (remaining <= 0 || remaining > 48 * 60 * 60 * 1000) return;
            sessionStorage.setItem('bm_69:billing_expiry_warn', '1');
            showToast('通行證將在兩天內到期，請提早續約或重新登入／兌換。');
        } catch (_e) {}
    }

    function setBackendSession(authPayload, tokenOverride) {
        const view = authPayload && typeof authPayload === 'object' ? authPayload : {};
        const nextToken = String(tokenOverride || view.token || '').trim();
        if (nextToken) {
            try {
                sessionStorage.removeItem(LOCAL_OFFLINE_DEMO_KEY);
            } catch (_e) {}
        }
        backendSessionState = {
            token: nextToken,
            account: normalizeMemberAccount(view.account || ''),
            sessionType: String(view.sessionType || 'access'),
            userLevel: normalizeUserLevel(view.userLevel || 'basic'),
            entitlements: view.entitlements && typeof view.entitlements === 'object' ? view.entitlements : {},
            featureOverrides: view.featureOverrides && typeof view.featureOverrides === 'object' ? view.featureOverrides : {},
            integrations: view.integrations && typeof view.integrations === 'object' ? view.integrations : {},
            canManageMembers: !!view.canManageMembers,
            accessExpiresAt: String(view.accessExpiresAt || '').trim(),
            billing: view.billing && typeof view.billing === 'object' ? view.billing : {}
        };
        if (nextToken) safeStorage.set(sessionStorage, AUTH_TOKEN_KEY, nextToken);
        sessionStorage.setItem(SECURITY_UNLOCK_KEY, '1');
        if (backendSessionState.account && backendSessionState.sessionType === 'member') {
            sessionStorage.setItem('bm_69:member', backendSessionState.account);
        } else {
            sessionStorage.removeItem('bm_69:member');
        }
        // After a successful login, default the UI to the granted level so
        // stale local preferences do not make a pro session look restricted.
        safeStorage.set(localStorage, USER_LEVEL_KEY, backendSessionState.userLevel);
        applyUserLevel();
        updateBillingStatusChip();
    }

    function clearBackendSession(keepVisualState = false) {
        backendSessionState = {
            token: '',
            account: '',
            sessionType: 'access',
            userLevel: 'basic',
            entitlements: {},
            featureOverrides: {},
            integrations: {},
            canManageMembers: false,
            accessExpiresAt: '',
            billing: {}
        };
        workspaceHydratedFromBackend = false;
        safeStorage.remove(sessionStorage, AUTH_TOKEN_KEY);
        sessionStorage.removeItem(SECURITY_UNLOCK_KEY);
        sessionStorage.removeItem(LOCAL_OFFLINE_DEMO_KEY);
        sessionStorage.removeItem('bm_69:member');
        if (!keepVisualState) safeStorage.set(localStorage, USER_LEVEL_KEY, 'basic');
        applyUserLevel();
        updateBillingStatusChip();
    }

    function applyLocalOfflineDemoSession() {
        backendSessionState = {
            token: '',
            account: 'local',
            sessionType: 'access',
            userLevel: 'basic',
            entitlements: { ...LOCAL_OFFLINE_BASIC_ENTITLEMENTS },
            featureOverrides: {},
            integrations: { localOfflineDemo: true },
            canManageMembers: false,
            accessExpiresAt: '',
            billing: {}
        };
        try {
            safeStorage.remove(sessionStorage, AUTH_TOKEN_KEY);
        } catch (_e) {}
        sessionStorage.setItem(SECURITY_UNLOCK_KEY, '1');
        sessionStorage.setItem(LOCAL_OFFLINE_DEMO_KEY, '1');
        safeStorage.set(localStorage, USER_LEVEL_KEY, 'basic');
        applyUserLevel();
        updateBillingStatusChip();
    }

    async function enterLocalOfflineDemoFromButton() {
        applyLocalOfflineDemoSession();
        hideSecurityLock();
        try {
            await startApp();
        } catch (error) {
            console.warn('離線略過登入後啟動失敗', error);
            showToast(error.message || '載入主畫面失敗');
            return;
        }
        showToast('已略過登入（免費第一頁）：高階會員功能待後端登入後啟用');
    }

    function getGrantedUserLevel() {
        return normalizeUserLevel(backendSessionState.userLevel || 'basic');
    }

    function normalizePersistedUserLevel(rawLevel) {
        const requested = normalizeUserLevel(rawLevel || getGrantedUserLevel());
        const granted = getGrantedUserLevel();
        const order = { basic: 1, standard: 2, pro: 3 };
        return order[requested] <= order[granted] ? requested : granted;
    }

    function hasFeatureEntitlement(featureName) {
        return !!(featureName && backendSessionState.entitlements && backendSessionState.entitlements[featureName]);
    }

    async function ensureFeatureAccess(featureName, deniedMessage) {
        const offlineDemo = !!(backendSessionState.integrations && backendSessionState.integrations.localOfflineDemo);
        if (!backendSessionState.token && !offlineDemo) {
            showSecurityLock('請先登入後再使用此功能。');
            showToast('登入已失效，請重新驗證');
            return false;
        }
        if (!hasFeatureEntitlement(featureName)) {
            showToast(deniedMessage || '目前帳號沒有這項權限');
            return false;
        }
        if (offlineDemo) {
            return true;
        }
        try {
            await apiRequest('/features/authorize', {
                method: 'POST',
                body: { feature: featureName }
            });
            return true;
        } catch (error) {
            console.warn('後端權限驗證失敗', featureName, error);
            showToast(deniedMessage || error.message || '權限驗證失敗');
            return false;
        }
    }

    function hydrateWorkspaceState(workspace, members) {
        const data = workspace && typeof workspace === 'object' ? workspace : {};
        list = Array.isArray(data.list) ? data.list.filter(item => item && item.source !== 'warroom') : [];
        bimRuleMap = data.bimRuleMap && typeof data.bimRuleMap === 'object' ? cloneJsonPayload(data.bimRuleMap, {}) : {};
        bimAuditLogs = Array.isArray(data.bimAuditLogs) ? cloneJsonPayload(data.bimAuditLogs, []) : [];
        bimSnapshots = Array.isArray(data.bimSnapshots) ? cloneJsonPayload(data.bimSnapshots, []) : [];
        measurementLogs = Array.isArray(data.measurementLogs) ? cloneJsonPayload(data.measurementLogs, []) : [];
        currentQaProfile = QA_PROFILE_CONFIGS[data.qaProfile] ? data.qaProfile : 'enterprise';
        currentBimSpecPreset = BIM_SPEC_PRESETS[data.bimSpecPreset] ? data.bimSpecPreset : 'public';
        if (typeof autoInterpretMemoryCache !== 'undefined') {
            autoInterpretMemoryCache = Array.isArray(data.autoInterpretMemory) ? cloneJsonPayload(data.autoInterpretMemory, []) : [];
        }
        if (typeof guidedPrecisionReviewCache !== 'undefined') {
            guidedPrecisionReviewCache = Array.isArray(data.guidedPrecisionReviews) ? cloneJsonPayload(data.guidedPrecisionReviews, []) : [];
        }
        if (typeof blueprintLearningAssetCache !== 'undefined') {
            blueprintLearningAssetCache = Array.isArray(data.blueprintLearningAssets) ? cloneJsonPayload(data.blueprintLearningAssets, []) : [];
        }
        if (typeof autoInterpretLearningJobCache !== 'undefined') {
            autoInterpretLearningJobCache = Array.isArray(data.autoInterpretLearningJobs) ? cloneJsonPayload(data.autoInterpretLearningJobs, []) : [];
        }
        if (typeof autoInterpretLearningReviewCache !== 'undefined') {
            autoInterpretLearningReviewCache = Array.isArray(data.autoInterpretLearningReviews) ? cloneJsonPayload(data.autoInterpretLearningReviews, []) : [];
        }
        if (typeof stakingRunHistory !== 'undefined') {
            stakingRunHistory = Array.isArray(data.stakingRunHistory) ? cloneJsonPayload(data.stakingRunHistory, []) : [];
        }
        if (typeof stakingReviewMemory !== 'undefined') {
            stakingReviewMemory = Array.isArray(data.stakingReviewMemory) ? cloneJsonPayload(data.stakingReviewMemory, []) : [];
        }
        memberCodeMap = {};
        if (Array.isArray(members)) {
            members.forEach((member) => {
                const account = normalizeMemberAccount(member && member.account);
                if (!account) return;
                memberCodeMap[account] = {
                    level: normalizeUserLevel(member.level || 'pro'),
                    updatedAt: String(member.updatedAt || '')
                };
            });
        }
        workspaceHydratedFromBackend = true;
        if (typeof renderAutoInterpretLearningPanel === 'function') {
            renderAutoInterpretLearningPanel();
        }
        if (typeof window.__bmRefreshSharedAutoInterpretMemory === 'function') {
            window.__bmRefreshSharedAutoInterpretMemory()
                .then(() => {
                    if (typeof renderAutoInterpretMemoryPanel === 'function') renderAutoInterpretMemoryPanel();
                })
                .catch(() => {
                    if (typeof renderAutoInterpretMemoryPanel === 'function') renderAutoInterpretMemoryPanel();
                });
        } else if (typeof renderAutoInterpretMemoryPanel === 'function') {
            renderAutoInterpretMemoryPanel();
        }
        if (typeof renderGuidedPrecisionReviewPanel === 'function') {
            renderGuidedPrecisionReviewPanel();
        }
        purgeLegacySecurityStorage();
    }

    async function loadWorkspaceBootstrap() {
        if (!backendSessionState.token) return false;
        try {
            const payload = await apiRequest('/data/bootstrap', {
                method: 'GET',
                retries: 0
            });
            hydrateWorkspaceState(payload.workspace || {}, payload.members || []);
            return true;
        } catch (error) {
            console.error('工作區同步啟動失敗', error);
            showToast('雲端工作區尚未同步（多為 PostgreSQL 未連線）。已改用本機資料，修復資料庫後可重新整理再同步。');
            return false;
        }
    }

    function queueWorkspacePersist(resourceName, value, delayMs = 180) {
        if (!backendSessionState.token) return false;
        if (!hasFeatureEntitlement('dataSync')) return false;
        const snapshot = cloneJsonPayload(value, null);
        if (snapshot === null) return false;
        if (workspacePersistTimers[resourceName]) {
            clearTimeout(workspacePersistTimers[resourceName]);
        }
        workspacePersistTimers[resourceName] = setTimeout(async () => {
            try {
                await apiRequest(`/data/resource/${encodeURIComponent(resourceName)}`, {
                    method: 'PUT',
                    body: { value: snapshot },
                    retries: 0,
                    timeoutMs: 12000
                });
            } catch (error) {
                console.warn('雲端同步失敗', resourceName, error);
            } finally {
                delete workspacePersistTimers[resourceName];
            }
        }, delayMs);
        return true;
    }

    async function restoreBackendSession() {
        const token = safeStorage.get(sessionStorage, AUTH_TOKEN_KEY, '');
        if (!token) return false;
        backendSessionState.token = token;
        try {
            const me = await apiRequest('/me', {
                method: 'GET',
                retries: 0
            });
            setBackendSession(me, token);
            return true;
        } catch (error) {
            console.warn('還原登入狀態失敗', error);
            clearBackendSession();
            return false;
        }
    }

    function enterSafeMode(reason) {
        if (safeModeActive) return;
        safeModeActive = true;
        console.warn('進入安全模式:', reason);
        stopQaStressTest(true);

        stop360Spin();
        stopGyroMode(true);
        stopLaserRuler(false);
        if (voiceGuardTimer) {
            clearTimeout(voiceGuardTimer);
            voiceGuardTimer = null;
        }
        if (voiceRecognition) {
            try { voiceRecognition.stop(); } catch (_e) {}
        }
        if (warRoomConnectTimer) {
            clearTimeout(warRoomConnectTimer);
            warRoomConnectTimer = null;
        }
        if (warRoomTimer) {
            clearInterval(warRoomTimer);
            warRoomTimer = null;
        }
        if (isWarRoomActive) {
            isWarRoomActive = false;
            safeStorage.set(localStorage, WAR_ROOM_KEY, '0');
            warRoomList = [];
            renderTable();
            applyWarRoomStatus();
        }
        if (typeof edgeAiVisionRunning !== 'undefined' && edgeAiVisionRunning) {
            stopEdgeAIVision();
        }
        safeToast('偵測到卡頓風險，已自動降載並切換安全模式。');
        applyFeatureControlStatus();
    }

    function startMainThreadWatchdog() {
        if (watchdogTimer) return;
        watchdogLastTickAt = Date.now();
        watchdogLagStrikes = 0;
        watchdogLastWarnAt = 0;
        watchdogTimer = setInterval(() => {
            const now = Date.now();
            if (document.hidden) {
                // Background tabs and wake-from-sleep can produce huge fake lag values.
                watchdogLastTickAt = now;
                watchdogLagStrikes = 0;
                return;
            }
            const drift = now - watchdogLastTickAt - WATCHDOG_INTERVAL_MS;
            watchdogLastTickAt = now;
            if (drift > WATCHDOG_HIBERNATION_RESET_MS) {
                watchdogLagStrikes = 0;
                return;
            }
            if (drift > WATCHDOG_LAG_THRESHOLD_MS) {
                watchdogLagStrikes += 1;
                if (now - watchdogLastWarnAt >= WATCHDOG_WARN_THROTTLE_MS) {
                    watchdogLastWarnAt = now;
                    console.warn(`主執行緒卡頓偵測：${Math.round(drift)}ms`);
                }
            } else if (watchdogLagStrikes > 0) {
                watchdogLagStrikes -= 1;
            }
            if (!safeModeActive && watchdogLagStrikes >= 2) {
                enterSafeMode(`event-loop lag ${Math.round(drift)}ms`);
            }
        }, WATCHDOG_INTERVAL_MS);
    }

    function bindLifecycleResilience() {
        if (lifecycleGuardsBound) return;
        lifecycleGuardsBound = true;
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                applyWarRoomStatus();
                return;
            }
            stop360Spin();
            if (voiceRecognition) {
                try { voiceRecognition.stop(); } catch (_e) {}
            }
            if (warRoomTimer) {
                clearInterval(warRoomTimer);
                warRoomTimer = null;
            }
            if (warRoomConnectTimer) {
                clearTimeout(warRoomConnectTimer);
                warRoomConnectTimer = null;
            }
        });
        window.addEventListener('pagehide', () => {
            stop360Spin();
            stopLaserRuler(false);
            if (voiceGuardTimer) {
                clearTimeout(voiceGuardTimer);
                voiceGuardTimer = null;
            }
            if (warRoomTimer) {
                clearInterval(warRoomTimer);
                warRoomTimer = null;
            }
        });
    }

    function applyNetworkLiteMode() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        const saveData = !!(connection && connection.saveData);
        const effectiveType = connection && typeof connection.effectiveType === 'string'
            ? connection.effectiveType
            : '';
        const isSlowNetwork = saveData || effectiveType.includes('2g') || effectiveType === 'slow-2g';

        document.body.classList.toggle('network-lite', isSlowNetwork);
        document.body.classList.toggle('bg-wallpaper', !isSlowNetwork);
    }

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        let reloadScheduled = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (reloadScheduled) return;
            reloadScheduled = true;
            window.location.reload();
        });
        navigator.serviceWorker
            .register('./service-worker.js', { updateViaCache: 'none' })
            .then((reg) => {
                reg.update().catch(() => {});
                reg.addEventListener('updatefound', () => {
                    const nw = reg.installing;
                    if (!nw) return;
                    nw.addEventListener('statechange', () => {
                        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                            try {
                                showToast('已取得新版腳本，將自動重新整理…');
                            } catch (_e) {}
                        }
                    });
                });
            })
            .catch((err) => console.warn('Service worker 註冊失敗:', err));
    }

    function runWhenIdle(task, timeoutMs = 1200) {
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(() => task(), { timeout: timeoutMs });
            return;
        }
        setTimeout(task, 0);
    }

    window.onload = async function() {
        applyNetworkLiteMode();
        registerServiceWorker();
        const canStart = await bootstrapSecurity();
        if (!canStart) return;
        await startApp();
    };

    async function startApp() {
        if (appBootstrapped) return;
        initGlobalErrorGuards();
        bindLifecycleResilience();
        startMainThreadWatchdog();
        loadDemoMode();
        loadFeatureFlags();
        loadWarRoomRowVisibility();
        try {
            if (typeof window.ensurePanelWidgetsLoaded === 'function') {
                await window.ensurePanelWidgetsLoaded();
            }
        } catch (err) {
            console.warn('延伸面板模組載入失敗', err);
            showToast('進階面板腳本載入失敗，請重新整理頁面');
        }
        await loadWorkspaceBootstrap();
        applyUserLevel();
        ensureWorkModeSectionOrder();
        applyWorkMode();
        applyAutoContrastMode();
        applyContrastMode();
        applySunlightMode();
        applyFeatureControlStatus();
        applyWarRoomStatus();
        window.addEventListener('online', applyWarRoomStatus);
        window.addEventListener('offline', applyWarRoomStatus);
        if (typeof applyQaProfile === 'function') {
            applyQaProfile(currentQaProfile, true);
        }
        if (typeof applyBimSpecPreset === 'function') {
            applyBimSpecPreset(currentBimSpecPreset, true);
        }
        if (typeof updateQaDashboard === 'function') {
            updateQaDashboard();
        }
        await initMaterialCatalog();
        updateUI();
        renderTable();
        if (typeof applyAiCoachMode === 'function') applyAiCoachMode();
        maybeWarnBillingExpirySoon();
        if (typeof renderMeasurementLogTable === 'function') renderMeasurementLogTable();
        if (typeof renderAuditTable === 'function') renderAuditTable();
        if (typeof renderSnapshotTable === 'function') renderSnapshotTable();
        if (typeof renderAutoInterpretMemoryPanel === 'function') renderAutoInterpretMemoryPanel();
        if (typeof renderGuidedPrecisionReviewPanel === 'function') renderGuidedPrecisionReviewPanel();
        hydrateInputFromUrlParam();
        runDeferredBootTasks();
        appBootstrapped = true;
    }

    function runDeferredBootTasks() {
        runWhenIdle(async () => {
            initTouchCoach();
            try {
                if (typeof window.ensurePanelWidgetsLoaded === 'function') {
                    await window.ensurePanelWidgetsLoaded();
                }
            } catch (_e) {}
            if (typeof initUtilityWidgets === 'function') {
                await initUtilityWidgets();
            }
        }, 800);

        runWhenIdle(() => {
            restoreMeasureAssistMode();
            restoreGyroMode();
            maybeStartCoachGuide();
        }, 1800);
    }

    function getCurrentExpectedInput() {
        const activeInput = document.activeElement;
        const candidateIds = ['v1', 'v2', 'v3', 'qty'];

        if (
            activeInput &&
            activeInput.tagName === 'INPUT' &&
            activeInput.type === 'number' &&
            candidateIds.includes(activeInput.id)
        ) {
            return activeInput;
        }

        for (const id of candidateIds) {
            const el = document.getElementById(id);
            if (!el || el.disabled || el.readOnly) continue;
            if (String(el.value || '').trim() === '') return el;
        }

        return document.getElementById('v1');
    }

    function focusNextInputField(currentInputId) {
        const nextMap = {
            v1: 'v2',
            v2: 'v3',
            v3: 'qty',
            qty: 'unitPrice'
        };
        const nextId = nextMap[currentInputId];
        if (!nextId) return;
        const nextInput = document.getElementById(nextId);
        if (nextInput && !nextInput.disabled && !nextInput.readOnly) {
            nextInput.focus();
        }
    }

    function clearUrlParam(paramKey) {
        const url = new URL(window.location.href);
        if (!url.searchParams.has(paramKey)) return;
        url.searchParams.delete(paramKey);
        const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
        history.replaceState({}, document.title, cleanUrl);
    }

    function hydrateInputFromUrlParam() {
        const params = new URLSearchParams(window.location.search);
        const rawVal = params.get('val');
        if (rawVal === null) return;

        const normalized = String(rawVal).trim();
        const matched = normalized.match(/^-?\d+(\.\d+)?$/);
        if (!matched) return;

        const parsed = parseFloat(matched[0]);
        if (!Number.isFinite(parsed)) return;

        const targetInput = getCurrentExpectedInput();
        if (!targetInput) return;

        targetInput.value = String(parsed);
        previewCalc();
        clearUrlParam('val');
        setTimeout(() => focusNextInputField(targetInput.id), 0);
    }

    function loadDemoMode() {
        if (safeStorage.get(localStorage, DEMO_MODE_KEY, null) === null) {
            safeStorage.set(localStorage, DEMO_MODE_KEY, '1');
        }
        demoModeEnabled = safeStorage.get(localStorage, DEMO_MODE_KEY, '1') === '1';
    }

    function normalizeUserLevel(rawLevel) {
        const raw = String(rawLevel || '').trim().toLowerCase();
        if (raw === '1' || raw === 'basic' || raw.includes('頁1') || raw.includes('會員1')) return 'basic';
        if (raw === '2' || raw === 'standard' || raw.includes('頁2') || raw.includes('會員2')) return 'standard';
        if (raw === '3' || raw === 'pro' || raw.includes('頁3') || raw.includes('會員3')) return 'pro';
        return 'basic';
    }

    function getUserLevelLabel(level) {
        if (level === 'standard') return '會員2（工程）';
        if (level === 'pro') return '會員3（專家）';
        return '會員1（基礎）';
    }

    function getCurrentUserLevel() {
        return normalizePersistedUserLevel(safeStorage.get(localStorage, USER_LEVEL_KEY, getGrantedUserLevel()));
    }

    function setUserLevel(level) {
        const normalized = normalizePersistedUserLevel(level);
        safeStorage.set(localStorage, USER_LEVEL_KEY, normalized);
        applyUserLevel();
        if (normalizeUserLevel(level) !== normalized) {
            showToast(`已切換為目前帳號可用的最高等級：${getUserLevelLabel(normalized)}`);
            return;
        }
        showToast(`已切換：${getUserLevelLabel(normalized)}`);
    }

    function applyUserLevel() {
        const normalized = normalizePersistedUserLevel(safeStorage.get(localStorage, USER_LEVEL_KEY, getGrantedUserLevel()));
        safeStorage.set(localStorage, USER_LEVEL_KEY, normalized);
        document.body.setAttribute('data-user-level', normalized);
        const mapping = [
            ['levelBasicBtn', normalized === 'basic'],
            ['levelStandardBtn', normalized === 'standard'],
            ['levelProBtn', normalized === 'pro']
        ];
        mapping.forEach(([id, active]) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.toggle('active', !!active);
        });
        if (typeof applyAiCoachMode === 'function') applyAiCoachMode();
    }

    function setWorkMode(mode) {
        const normalized = mode === 'stake' ? 'stake' : 'calc';
        const targetUrl = normalized === 'stake' ? 'stake.html' : 'index.html';
        try {
            safeStorage.set(localStorage, WORK_MODE_KEY, normalized);
        } catch (_e) {}
        window.location.href = targetUrl;
    }

    /** 同頁切換計算/放樣（不重新載入）；供混沌猴子／破壞測試使用，避免整頁跳轉把測試狀態清掉。 */
    function toggleWorkModeInPlace() {
        const nav = window.BuildMasterNavigationModule;
        if (!nav || typeof nav.readStoredWorkMode !== 'function' || typeof nav.writeStoredWorkMode !== 'function') {
            return;
        }
        const current = nav.readStoredWorkMode(WORK_MODE_KEY);
        const next = current === 'stake' ? 'calc' : 'stake';
        nav.writeStoredWorkMode(WORK_MODE_KEY, next);
        if (typeof nav.ensureFixedPageOrder === 'function') nav.ensureFixedPageOrder();
        applyWorkMode();
        scrollToWorkModeSection(next);
    }

    function getCurrentWorkMode() {
        const stored = safeStorage.get(localStorage, WORK_MODE_KEY, 'calc');
        const mode = document.body && document.body.dataset && document.body.dataset.workMode
            ? document.body.dataset.workMode
            : stored;
        return mode === 'stake' ? 'stake' : 'calc';
    }

    function ensureWorkModeAccess(expectedMode, deniedMessage) {
        const expected = expectedMode === 'stake' ? 'stake' : 'calc';
        const current = getCurrentWorkMode();
        if (current === expected) return true;
        showToast(deniedMessage || (expected === 'stake' ? '請先切到第四頁放樣模式' : '請先切到第三頁計算模式'));
        return false;
    }

    function ensureWorkModeSectionOrder() {
        const navigationModule = window.BuildMasterNavigationModule;
        if (navigationModule && typeof navigationModule.ensureFixedPageOrder === 'function') {
            navigationModule.ensureFixedPageOrder();
        }
    }

    function scrollToWorkModeSection(mode) {
        const navigationModule = window.BuildMasterNavigationModule;
        if (navigationModule && typeof navigationModule.scrollToModeSection === 'function') {
            navigationModule.scrollToModeSection(mode);
        }
    }

    function applyWorkMode() {
        const navigationModule = window.BuildMasterNavigationModule;
        const mode = safeStorage.get(localStorage, WORK_MODE_KEY, 'calc') === 'stake' ? 'stake' : 'calc';
        if (navigationModule && typeof navigationModule.applyWorkMode === 'function') {
            navigationModule.applyWorkMode(WORK_MODE_KEY);
        } else {
            const calcBtn = document.getElementById('workCalcBtn');
            const stakeBtn = document.getElementById('workStakeBtn');
            if (calcBtn) calcBtn.classList.toggle('active', mode === 'calc');
            if (stakeBtn) stakeBtn.classList.toggle('active', mode === 'stake');
        }
        document.body.dataset.workMode = mode;
    }

    function loadFeatureFlags() {
        try {
            const parsed = JSON.parse(localStorage.getItem(FEATURE_FLAGS_KEY) || '{}');
            featureFlags = {
                aiVision: parsed.aiVision !== false,
                voice: parsed.voice === true,
                laser: parsed.laser !== false,
                warRoom: parsed.warRoom !== false
            };
        } catch (_e) {
            featureFlags = { aiVision: true, voice: false, laser: true, warRoom: true };
        }
    }

    function saveFeatureFlags() {
        localStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify(featureFlags));
    }

    function loadWarRoomRowVisibility() {
        showWarRoomRows = localStorage.getItem(SHOW_WAR_ROOM_ROWS_KEY) !== '0';
    }

    function applyFeatureControlStatus() {
        const demoBtn = document.getElementById('btnDemoMode');
        if (demoBtn) {
            demoBtn.innerText = `Demo模式: ${demoModeEnabled ? '開' : '關'}`;
            demoBtn.style.borderColor = demoModeEnabled ? '#ffd166' : 'rgba(255,255,255,0.25)';
            demoBtn.style.color = demoModeEnabled ? '#ffe4a1' : '#e8f5ff';
        }

        const map = [
            ['btnCtrlAiVision', 'aiVision', 'AI盤點'],
            ['btnCtrlVoice', 'voice', '語音助理'],
            ['btnCtrlLaser', 'laser', '雷射尺'],
            ['btnCtrlWarRoom', 'warRoom', '戰情室']
        ];
        map.forEach(([id, key, label]) => {
            const el = document.getElementById(id);
            if (!el) return;
            const enabled = !!featureFlags[key];
            const blockedByDemo = !demoModeEnabled && (key === 'laser' || key === 'warRoom');
            el.innerText = `${label}: ${enabled ? '開' : '關'}`;
            el.style.borderColor = blockedByDemo ? '#8a8a8a' : (enabled ? 'rgba(255,255,255,0.3)' : '#ff7675');
            el.style.color = blockedByDemo ? '#c8c8c8' : (enabled ? '#e8f5ff' : '#ffd0ce');
            el.disabled = blockedByDemo;
        });
        const laserChip = document.getElementById('laserModeChip');
        if (laserChip) {
            const isConnected = !!(bluetoothDevice && bluetoothDevice.gatt && bluetoothDevice.gatt.connected);
            laserChip.innerText = `雷射尺模式：${laserRulerMode === 'real' ? '真機' : '模擬'} / ${isConnected ? '已連線' : '未連線'}`;
        }
        updateLaserChaosChip();
        const warChip = document.getElementById('warRoomModeChip');
        if (warChip) warChip.innerText = `戰情室模式：模擬協作 / ${isWarRoomActive ? 'LIVE' : '離線'}`;
        const rowsBtn = document.getElementById('btnWarRoomRows');
        if (rowsBtn) rowsBtn.innerText = `顯示雲端資料: ${showWarRoomRows ? '開' : '關'}`;
        const qaBtn = document.getElementById('btnQaStress');
        if (qaBtn) {
            qaBtn.innerText = `QA 壓力測試: ${qaStressMode ? '開' : '關'}`;
            qaBtn.style.borderColor = qaStressMode ? '#ff7675' : '#ffd166';
            qaBtn.style.color = qaStressMode ? '#ffd0ce' : '#ffe4a1';
        }
        const destBtn = document.getElementById('btnDestructiveTest');
        if (destBtn) {
            destBtn.innerText = `無限制破壞測試: ${destructiveTestMode ? '開' : '關'}`;
            destBtn.style.borderColor = destructiveTestMode ? '#ff7675' : '#e74c3c';
            destBtn.style.color = destructiveTestMode ? '#ffd0ce' : '#ffb3b3';
        }
        const chaosBtn = document.getElementById('btnChaosMonkey');
        if (chaosBtn) {
            chaosBtn.innerText = `🐒 混沌猴子: ${chaosMonkeyMode ? '開' : '關'}`;
            chaosBtn.style.borderColor = chaosMonkeyMode ? '#ff7675' : '#ff9f43';
            chaosBtn.style.color = chaosMonkeyMode ? '#ffd0ce' : '#ffd6aa';
            chaosBtn.style.display = isLocalOfflineBypassAllowed() ? '' : 'none';
        }
        const keepTestLogVisible = !!(chaosMonkeyMode || destructiveTestMode || qaStressMode);
        if (keepTestLogVisible) {
            document.body.setAttribute('data-bm-keep-test-log', '1');
        } else {
            document.body.removeAttribute('data-bm-keep-test-log');
        }
        updateMobileChaosLabel();
    }

    function toggleFeatureFlag(key) {
        if (!Object.prototype.hasOwnProperty.call(featureFlags, key)) return;
        if (!demoModeEnabled && (key === 'laser' || key === 'warRoom')) {
            return showToast('Demo 模式已關閉，模擬雷射/戰情室不可啟用');
        }
        featureFlags[key] = !featureFlags[key];
        saveFeatureFlags();
        if (!featureFlags[key]) {
            if (key === 'aiVision') stopEdgeAIVision();
            if (key === 'laser') stopLaserRuler();
            if (key === 'warRoom' && isWarRoomActive) {
                isWarRoomActive = false;
                localStorage.setItem(WAR_ROOM_KEY, '0');
                if (warRoomConnectTimer) clearTimeout(warRoomConnectTimer);
                if (warRoomTimer) clearInterval(warRoomTimer);
                warRoomConnectTimer = null;
                warRoomTimer = null;
            }
        }
        applyFeatureControlStatus();
        applyWarRoomStatus();
        const nameMap = { aiVision: 'AI盤點', voice: '語音助理', laser: '雷射尺', warRoom: '戰情室' };
        showToast(`${nameMap[key] || key}功能已${featureFlags[key] ? '啟用' : '停用'}`);
    }

    function toggleDemoMode() {
        demoModeEnabled = !demoModeEnabled;
        localStorage.setItem(DEMO_MODE_KEY, demoModeEnabled ? '1' : '0');
        if (!demoModeEnabled) {
            stopLaserRuler();
            if (isWarRoomActive) toggleWarRoom();
        }
        applyFeatureControlStatus();
        showToast(demoModeEnabled ? 'Demo 模式已啟用' : 'Demo 模式已關閉');
    }

    function stopAllRealtimeFeatures() {
        stopEdgeAIVision();
        stopLaserRuler();
        if (voiceRecognition && voiceAgentListening) {
            try { voiceRecognition.stop(); } catch (_e) {}
            voiceAgentListening = false;
        }
        if (voiceGuardTimer) {
            clearTimeout(voiceGuardTimer);
            voiceGuardTimer = null;
        }
        if (isWarRoomActive) toggleWarRoom();
        stopQaStressTest(true);
        stopChaosMonkey(true);
        stopDestructiveTest(true);
        applyFeatureControlStatus();
        showToast('即時功能已全部停止');
    }

    async function runQaStressNetworkProbe() {
        try {
            await fetchWithRetry(
                `${PRICES_JSON_URL}?qa_stress=${Date.now()}`,
                { cache: 'no-store' },
                { retries: 1, timeoutMs: 2400 }
            );
        } catch (_e) {
            // 壓測模式預期可容忍失敗，僅記錄狀態，不中斷主流程。
        }
    }

    function startQaStressTest() {
        if (qaStressMode) return;
        stopDestructiveTest(true);
        qaStressMode = true;
        createDataSnapshot('QA壓力測試前', true);

        qaStressExportProbeCount = 0;
        qaStressRenderTimer = setInterval(() => {
            if (!qaStressMode) return;
            try {
                renderTable();
                previewCalc();
                applyFeatureControlStatus();
            } catch (err) {
                console.warn('QA render stress tick failed', err);
            }
            qaStressExportProbeCount += 1;
            if (qaStressExportProbeCount % 4 === 0 && typeof runMainListExportDryRun === 'function') {
                try {
                    const r = runMainListExportDryRun();
                    if (r && !r.ok) {
                        console.warn('QA 匯出記憶體探針失敗', r.error);
                        if (typeof appendMobileTestLog === 'function') {
                            appendMobileTestLog(`匯出探針失敗: ${(r.error && r.error.message) || String(r.error)}`);
                        }
                    }
                } catch (ex) {
                    console.warn('QA 匯出探針拋錯', ex);
                    if (typeof appendMobileTestLog === 'function') {
                        appendMobileTestLog(`匯出探針拋錯: ${(ex && ex.message) || String(ex)}`);
                    }
                }
            }
        }, 900);

        qaStressNetworkTimer = setInterval(() => {
            if (!qaStressMode) return;
            runQaStressNetworkProbe();
        }, 1800);

        applyFeatureControlStatus();
        showToast('QA 壓力測試已啟動（重繪＋網路＋主清單 CSV 匯出記憶體探針）');
    }

    function stopQaStressTest(silent) {
        if (qaStressRenderTimer) {
            clearInterval(qaStressRenderTimer);
            qaStressRenderTimer = null;
        }
        if (qaStressNetworkTimer) {
            clearInterval(qaStressNetworkTimer);
            qaStressNetworkTimer = null;
        }
        if (!qaStressMode) return;
        qaStressMode = false;
        applyFeatureControlStatus();
        if (!silent) showToast('QA 壓力測試已停止');
    }

    function toggleQaStressTest() {
        if (qaStressMode) return stopQaStressTest(false);
        startQaStressTest();
    }

    function stopDestructiveTest(silent) {
        if (destructiveTestTimer) {
            clearInterval(destructiveTestTimer);
            destructiveTestTimer = null;
        }
        if (!destructiveTestMode) return;
        destructiveTestMode = false;
        applyFeatureControlStatus();
        if (!silent) showToast('無限制破壞測試已停止');
    }

    function runDestructiveTestTick() {
        if (!destructiveTestMode) return;
        destructiveTestTickCount += 1;
        const pick = (fn) => {
            try {
                fn();
            } catch (err) {
                console.warn('[破壞測試] 動作失敗', err);
            }
        };
        const pool = [
            () => pick(() => renderTable()),
            () => pick(() => previewCalc()),
            () => pick(() => applyFeatureControlStatus()),
            () => pick(() => applyWarRoomStatus()),
            () => pick(() => runQaStressNetworkProbe()),
            () => {
                if (typeof runMainListExportDryRun === 'function') {
                    pick(() => runMainListExportDryRun());
                }
            },
            () => {
                if (typeof updateQaDashboard === 'function') pick(() => updateQaDashboard());
            },
            () => {
                if (typeof updateUI === 'function') pick(() => updateUI());
            },
            () => {
                if (typeof syncCanvasEmptyState === 'function') pick(() => syncCanvasEmptyState());
            },
            () => {
                if (typeof redrawManualMeasurementCanvas === 'function') pick(() => redrawManualMeasurementCanvas());
            },
            () => {
                if (typeof renderManualMeasurePad === 'function') pick(() => renderManualMeasurePad());
            },
            () => {
                if (img && img.src && Math.random() < 0.4) pick(() => fitBlueprintToViewport());
            },
            () => {
                if (Math.random() < 0.35) pick(() => clearCanvas());
            },
            () => pick(() => autoEnhanceImage()),
            () => pick(() => resetImageFilter()),
            () => {
                if (Math.random() < 0.5) pick(() => changeZoom((Math.random() - 0.5) * 0.25));
            },
            () => {
                if (Math.random() < 0.3) {
                    pick(() => toggleWorkModeInPlace());
                }
            },
            () => pick(() => toggleWarRoomRows()),
            () => pick(() => resetLaserChaosStats()),
            () => {
                if (Math.random() < 0.2 && img && img.src) pick(() => toggle3DView());
            },
            () => {
                if (typeof renderBimLayoutTable === 'function' && Math.random() < 0.25) {
                    pick(() => renderBimLayoutTable());
                }
            },
            () => {
                if (typeof renderMeasurementLogTable === 'function' && Math.random() < 0.2) {
                    pick(() => renderMeasurementLogTable());
                }
            },
            () => {
                if (typeof renderAuditTable === 'function' && Math.random() < 0.15) {
                    pick(() => renderAuditTable());
                }
            },
            () => {
                window.scrollTo(0, Math.max(0, Math.floor(Math.random() * 400)));
            }
        ];
        const burst = 2 + Math.floor(Math.random() * 5);
        for (let i = 0; i < burst; i += 1) {
            pool[Math.floor(Math.random() * pool.length)]();
        }
        if (destructiveTestTickCount % 20 === 0 && typeof appendMobileTestLog === 'function') {
            appendMobileTestLog(`破壞測試 tick #${destructiveTestTickCount}（本輪約 ${burst} 隨機動作）`);
        }
    }

    function startDestructiveTest() {
        if (destructiveTestMode) return;
        stopQaStressTest(true);
        stopChaosMonkey(true);
        destructiveTestMode = true;
        destructiveTestTickCount = 0;
        createDataSnapshot('破壞測試開始前', true);
        destructiveTestTimer = setInterval(runDestructiveTestTick, 220);
        applyFeatureControlStatus();
        showToast('無限制破壞測試已啟動（高頻隨機：重繪／匯出探針／畫布／模式等；勿在正式資料上使用）');
    }

    function toggleDestructiveTest() {
        if (destructiveTestMode) return stopDestructiveTest(false);
        startDestructiveTest();
    }

    function runChaosMonkeyTick() {
        if (!chaosMonkeyMode) return;
        const actions = [
            {
                name: '開始量測',
                run: () => {
                    if (!scalePixelsPerUnit) return startCalibration();
                    return startMeasure();
                }
            },
            { name: '定比例', run: () => startCalibration() },
            { name: '清空標註', run: () => clearCanvas() },
            {
                name: '自動優化圖面',
                run: () => {
                    if (!img || !img.src) return;
                    autoEnhanceImage();
                }
            },
            {
                name: '切換工作模式',
                run: () => toggleWorkModeInPlace()
            },
            {
                name: '切換3D檢視',
                run: () => {
                    if (!img.src) return;
                    toggle3DView();
                }
            }
        ];
        const heavyMeasure = new Set(['開始量測', '定比例']);
        const spacedRepeat = new Set(['清空標註', '自動優化圖面', '切換工作模式', '切換3D檢視']);
        let pool = chaosMonkeyCalibCooldownTicks > 0
            ? actions.filter((a) => !heavyMeasure.has(a.name))
            : actions.slice();
        if (pool.length < 1) pool = actions.slice();
        if (chaosMonkeyCalibCooldownTicks > 0) {
            chaosMonkeyCalibCooldownTicks -= 1;
        }

        let selected = pool[Math.floor(Math.random() * pool.length)];
        let pickTries = 0;
        while (pickTries < 18 && pool.length > 1) {
            selected = pool[Math.floor(Math.random() * pool.length)];
            const sameAsLast = selected.name === chaosMonkeyLastActionName;
            const heavyCluster =
                heavyMeasure.has(selected.name)
                && (heavyMeasure.has(chaosMonkeyLastActionName)
                    || heavyMeasure.has(chaosMonkeyPrevActionName));
            const tooSoonSame =
                spacedRepeat.has(selected.name)
                && selected.name === chaosMonkeyPrevActionName;
            if (!sameAsLast && !heavyCluster && !tooSoonSame) break;
            pickTries += 1;
        }
        chaosMonkeyPrevActionName = chaosMonkeyLastActionName;
        chaosMonkeyLastActionName = selected.name;
        chaosMonkeyTickCount += 1;
        appendMobileTestLog(`猴子動作 #${chaosMonkeyTickCount}: ${selected.name}`);
        try {
            selected.run();
            if (heavyMeasure.has(selected.name)) {
                chaosMonkeyCalibCooldownTicks = 4;
            }
        } catch (error) {
            console.warn('Chaos monkey action failed', error);
            appendMobileTestLog(`猴子動作失敗: ${selected.name}`);
        }
    }

    function startChaosMonkey() {
        if (!isLocalOfflineBypassAllowed()) return;
        if (chaosMonkeyMode) return;
        chaosMonkeyMode = true;
        chaosMonkeyTickCount = 0;
        chaosMonkeyCalibCooldownTicks = 0;
        chaosMonkeyTimer = setInterval(runChaosMonkeyTick, 2600);
        applyFeatureControlStatus();
        showToast('🐒 混沌猴子已放出（每 2.6 秒隨機壓測）');
        window.__bmMonkeyToastQuiet = true;
    }

    function stopChaosMonkey(silent) {
        if (chaosMonkeyTimer) {
            clearInterval(chaosMonkeyTimer);
            chaosMonkeyTimer = null;
        }
        window.__bmMonkeyToastQuiet = false;
        if (!chaosMonkeyMode) return;
        chaosMonkeyLastActionName = '';
        chaosMonkeyPrevActionName = '';
        chaosMonkeyCalibCooldownTicks = 0;
        chaosMonkeyMode = false;
        applyFeatureControlStatus();
        if (!silent) showToast('🐒 混沌猴子已收回');
    }

    async function toggleChaosMonkey() {
        const unlocked = await ensureOwnerUnlocked('混沌猴子');
        if (!unlocked) return;
        if (!isLocalOfflineBypassAllowed()) {
            stopChaosMonkey(true);
            return showToast('🐒 混沌猴子僅在本機（localhost / 127.0.0.1 / 離線檔）開放');
        }
        if (chaosMonkeyMode) return stopChaosMonkey(false);
        stopDestructiveTest(true);
        startChaosMonkey();
    }

    async function startBmAutoTestFromUi() {
        if (isMemberSession()) {
            showToast('自動測試僅限管理者，會員不可使用');
            return;
        }
        const unlocked = await ensureOwnerUnlocked('自動測試');
        if (!unlocked) return;
        if (window.__bmAutoTestRunning) {
            showToast('自動測試已在執行中');
            return;
        }
        window.__bmAutoTestGate = {
            v: 1,
            at: Date.now(),
            token: (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID()
                : String(Date.now()) + '-' + Math.random().toString(36).slice(2)
        };
        const script = document.createElement('script');
        script.src = '/bm-auto-test.js?v=' + Date.now();
        script.async = true;
        script.onerror = function() {
            showToast('無法載入 bm-auto-test.js，請確認伺服器已部署此檔');
        };
        document.body.appendChild(script);
        showToast('已載入自動測試腳本');
    }

    function toggleWarRoomRows() {
        showWarRoomRows = !showWarRoomRows;
        localStorage.setItem(SHOW_WAR_ROOM_ROWS_KEY, showWarRoomRows ? '1' : '0');
        applyFeatureControlStatus();
        renderTable();
        showToast(showWarRoomRows ? '已顯示雲端資料' : '已隱藏雲端資料');
    }

    function resetLaserChaosStats() {
        laserChaosStats = { dirtyBlocked: 0, successWrites: 0 };
        updateLaserChaosChip();
        showToast('雷射資料計數已重置');
    }

    function isDirectIpHost(hostname) {
        const raw = String(hostname || '').trim().toLowerCase();
        if (!raw) return false;
        if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(raw)) return true;
        return raw.includes(':') && /^[a-f0-9:]+$/i.test(raw);
    }

    function isAllowedRuntimeHost(hostname) {
        try {
            if (typeof location !== 'undefined' && location.protocol === 'file:') {
                return true;
            }
        } catch (_e) {}
        const raw = String(hostname || '').trim().toLowerCase();
        if (!raw) return false;
        if (SECURITY_CONFIG.allowedHosts.some(allowed => raw === allowed || raw.endsWith(`.${allowed}`))) {
            return true;
        }
        if (raw.endsWith('.netlify.app') || raw.endsWith('.github.io')) return true;
        return SECURITY_CONFIG.allowDirectIpHosts !== false && isDirectIpHost(raw);
    }

    function isDevHost() {
        return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    }

    function isPublishedTestHost() {
        return location.hostname === 'gt492145-sudo.github.io'
            && location.pathname.startsWith('/BuildMaster_v69/');
    }

    function isLocalOfflineBypassAllowed() {
        try {
            if (location.protocol === 'file:') return true;
            return isDevHost() || isPublishedTestHost();
        } catch (_e) {
            return false;
        }
    }

    async function hashTextSHA256(text) {
        const msgUint8 = new TextEncoder().encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function hasOwnerPassword() {
        return !!safeStorage.get(localStorage, OWNER_LOCK_HASH_KEY, '');
    }

    function currentMemberAccount() {
        return normalizeMemberAccount(backendSessionState.account || sessionStorage.getItem('bm_69:member') || '');
    }

    function isMemberSession() {
        return backendSessionState.sessionType === 'member' && !!currentMemberAccount();
    }

    function isOwnerUnlocked() {
        if (!hasOwnerPassword()) return true;
        return sessionStorage.getItem(OWNER_UNLOCK_SESSION_KEY) === '1';
    }

    function updateOwnerLockButton() {
        const btn = document.getElementById('mobileOwnerLockBtn');
        if (!btn) {
            updateMonkeyControlsVisibility();
            return;
        }
        if (isMemberSession()) {
            const span = btn.querySelector('span');
            const text = '🚫 猴子權限：會員不可用';
            if (span) span.textContent = text;
            else btn.textContent = text;
            updateMonkeyControlsVisibility();
            return;
        }
        let text = '🐒 猴子權限：未設定';
        if (hasOwnerPassword()) {
            text = isOwnerUnlocked() ? '🐒 猴子權限：已解鎖' : '🐒 猴子權限：已上鎖';
        }
        const span = btn.querySelector('span');
        if (span) span.textContent = text;
        else btn.textContent = text;
        updateMonkeyControlsVisibility();
    }

    function updateMonkeyControlsVisibility() {
        const mobileMonkeyBtn = document.getElementById('mobileMonkeyBtn');
        const mobileAutoTestBtn = document.getElementById('mobileAutoTestBtn');
        const devLocal = isLocalOfflineBypassAllowed() && !isMemberSession();
        const visible =
            devLocal || (!isMemberSession() && hasOwnerPassword() && isOwnerUnlocked());
        if (mobileMonkeyBtn) mobileMonkeyBtn.style.display = visible ? '' : 'none';
        if (mobileAutoTestBtn) mobileAutoTestBtn.style.display = visible ? '' : 'none';
    }

    async function setupOwnerPassword() {
        if (isMemberSession()) {
            showToast('此功能僅限擁有者，會員不可使用');
            return false;
        }
        const pass1 = prompt('設定管理密碼（至少 4 碼）');
        if (pass1 === null) return false;
        const password = String(pass1).trim();
        if (password.length < 4) {
            showToast('管理密碼至少 4 碼');
            return false;
        }
        const pass2 = prompt('再次輸入管理密碼');
        if (pass2 === null) return false;
        if (password !== String(pass2).trim()) {
            showToast('兩次密碼不一致');
            return false;
        }
        const hashed = await hashTextSHA256(password);
        safeStorage.set(localStorage, OWNER_LOCK_HASH_KEY, hashed);
        sessionStorage.setItem(OWNER_UNLOCK_SESSION_KEY, '1');
        updateOwnerLockButton();
        showToast('管理密碼已設定並解鎖');
        return true;
    }

    async function unlockOwnerPassword() {
        if (isMemberSession()) {
            showToast('此功能僅限擁有者，會員不可使用');
            return false;
        }
        if (!hasOwnerPassword()) return setupOwnerPassword();
        const input = prompt('輸入管理密碼');
        if (input === null) return false;
        const hashed = await hashTextSHA256(String(input).trim());
        const saved = safeStorage.get(localStorage, OWNER_LOCK_HASH_KEY, '');
        if (hashed !== saved) {
            showToast('管理密碼錯誤');
            return false;
        }
        sessionStorage.setItem(OWNER_UNLOCK_SESSION_KEY, '1');
        updateOwnerLockButton();
        showToast('猴子權限已解鎖');
        return true;
    }

    async function changeOwnerPassword() {
        if (isMemberSession()) {
            showToast('此功能僅限擁有者，會員不可使用');
            return false;
        }
        if (!hasOwnerPassword()) {
            showToast('請先設定猴子密碼');
            return false;
        }
        const oldPass = prompt('輸入舊猴子密碼');
        if (oldPass === null) return false;
        const saved = safeStorage.get(localStorage, OWNER_LOCK_HASH_KEY, '');
        const oldHash = await hashTextSHA256(String(oldPass).trim());
        if (oldHash !== saved) {
            showToast('舊密碼錯誤');
            return false;
        }
        const newPass1 = prompt('輸入新猴子密碼（至少 4 碼）');
        if (newPass1 === null) return false;
        const newPassword = String(newPass1).trim();
        if (newPassword.length < 4) {
            showToast('新密碼至少 4 碼');
            return false;
        }
        const newPass2 = prompt('再次輸入新猴子密碼');
        if (newPass2 === null) return false;
        if (newPassword !== String(newPass2).trim()) {
            showToast('兩次新密碼不一致');
            return false;
        }
        const nextHash = await hashTextSHA256(newPassword);
        safeStorage.set(localStorage, OWNER_LOCK_HASH_KEY, nextHash);
        sessionStorage.setItem(OWNER_UNLOCK_SESSION_KEY, '1');
        updateOwnerLockButton();
        showToast('猴子密碼已更新');
        return true;
    }

    async function ensureOwnerUnlocked(reason) {
        if (isMemberSession()) {
            showToast('此功能僅限擁有者，會員不可使用');
            return false;
        }
        if (isOwnerUnlocked()) return true;
        showToast(`此功能需管理密碼：${reason || '受保護功能'}`);
        return unlockOwnerPassword();
    }

    function lockOwnerAccess() {
        sessionStorage.removeItem(OWNER_UNLOCK_SESSION_KEY);
        updateOwnerLockButton();
        showToast('猴子權限已上鎖');
    }

    async function handleOwnerLockAction() {
        if (isMemberSession()) {
            showToast('此功能僅限擁有者，會員不可使用');
            return;
        }
        if (!hasOwnerPassword()) {
            await setupOwnerPassword();
            return;
        }
        if (isOwnerUnlocked()) {
            lockOwnerAccess();
            return;
        }
        await unlockOwnerPassword();
    }

    function showSecurityLock(message) {
        const lock = document.getElementById('securityLock');
        const msg = document.getElementById('securityMessage');
        if (msg) msg.innerText = message || '請輸入存取碼以啟用系統。';
        if (lock) lock.classList.add('show');
        const input = document.getElementById('securityCodeInput');
        if (input) setTimeout(() => input.focus(), 80);
    }

    function hideSecurityLock() {
        const lock = document.getElementById('securityLock');
        if (lock) lock.classList.remove('show');
    }

    function setupSecurityWatermark() {
        const wm = document.getElementById('securityWatermark');
        if (!wm) return;
        const stamp = new Date().toLocaleString('zh-TW');
        wm.innerText = `Construction Master Secure | ${location.hostname} | ${stamp}`;
    }

    function bindClientDeterrence() {
        if (isDevHost()) return;
        document.addEventListener('contextmenu', e => e.preventDefault());
        document.addEventListener('keydown', e => {
            const key = String(e.key || '').toLowerCase();
            const blocked =
                key === 'f12' ||
                (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(key)) ||
                (e.metaKey && e.altKey && ['i', 'j', 'c'].includes(key)) ||
                (e.ctrlKey && key === 'u') ||
                (e.metaKey && key === 'u') ||
                (e.ctrlKey && key === 's') ||
                (e.metaKey && key === 's');
            if (blocked) {
                e.preventDefault();
                showToast('此快捷鍵已受保護模式限制');
            }
        });
    }

    function bindSecurityApiQuickFixButton() {
        const fixBtn = document.getElementById('securityApi8787Btn');
        if (!fixBtn || fixBtn.dataset.bmApi8787Bound === '1') return;
        if (!shouldShowLocalApiDevButton()) {
            fixBtn.hidden = true;
            fixBtn.dataset.bmApi8787Bound = '1';
            return;
        }
        fixBtn.dataset.bmApi8787Bound = '1';
        fixBtn.addEventListener('click', () => {
            try {
                safeStorage.set(localStorage, API_BASE_URL_KEY, 'http://127.0.0.1:8787');
            } catch (_e) {
                try {
                    localStorage.setItem(API_BASE_URL_KEY, 'http://127.0.0.1:8787');
                } catch (_e2) {}
            }
            window.location.reload();
        });
    }

    function bindSecurityOfflineDemoButton() {
        const btn = document.getElementById('securityOfflineDemoBtn');
        if (!btn || btn.dataset.bmOfflineBound === '1') return;
        btn.dataset.bmOfflineBound = '1';
        if (isLocalOfflineBypassAllowed()) {
            btn.hidden = false;
        }
        btn.addEventListener('click', () => {
            enterLocalOfflineDemoFromButton().catch((e) => console.warn(e));
        });
    }

    function bindSecuritySelfDeleteButton() {
        const btn = document.getElementById('securitySelfDeleteBtn');
        if (!btn || btn.dataset.bmSelfDeleteBound === '1') return;
        btn.dataset.bmSelfDeleteBound = '1';
        btn.addEventListener('click', async () => {
            const memberInput = document.getElementById('securityMemberInput');
            const input = document.getElementById('securityCodeInput');
            const hint = document.getElementById('securityHint');
            const account = normalizeMemberAccount((memberInput && memberInput.value) || '');
            const password = String((input && input.value) || '').trim();
            if (!account) {
                if (hint) hint.innerText = '刪除帳號請先填「會員帳號」';
                return;
            }
            if (!password) {
                if (hint) hint.innerText = '刪除帳號請輸入「會員密碼」確認';
                return;
            }
            if (!window.confirm('將永久刪除此會員帳號與雲端工作區資料，無法復原。確定刪除？')) return;
            try {
                const res = await fetch(buildApiUrl('/account/self-delete'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({ account, password })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.message || data.error || `HTTP ${res.status}`);
                }
                if (hint) hint.innerText = '';
                clearBackendSession(true);
                showToast('帳號已刪除');
                if (memberInput) memberInput.value = '';
                if (input) input.value = '';
            } catch (err) {
                console.warn('self-delete failed', err);
                if (hint) hint.innerText = (err && err.message) ? String(err.message) : '刪除失敗';
            }
        });
    }

    async function bootstrapSecurity() {
        setupSecurityWatermark();
        bindClientDeterrence();
        bindSecurityApiQuickFixButton();
        bindSecurityOfflineDemoButton();
        bindSecuritySelfDeleteButton();

        if (window.top !== window.self) {
            showSecurityLock('偵測到外部框架嵌入，已阻擋顯示。');
            return false;
        }

        const hostAllowed = isAllowedRuntimeHost(location.hostname);
        if (!hostAllowed) {
            showSecurityLock(`未授權網域：${location.hostname}`);
            return false;
        }

        if (sessionStorage.getItem(LOCAL_OFFLINE_DEMO_KEY) === '1' && isLocalOfflineBypassAllowed()) {
            applyLocalOfflineDemoSession();
            hideSecurityLock();
            return true;
        }

        const restored = await restoreBackendSession();
        if (restored) {
            hideSecurityLock();
            return true;
        }

        showSecurityLock('請輸入後端存取碼或會員密碼以啟用系統。');
        const input = document.getElementById('securityCodeInput');
        const memberInput = document.getElementById('securityMemberInput');
        if (input) {
            input.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') submitSecurityCode();
            });
        }
        if (memberInput) {
            memberInput.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') submitSecurityCode();
            });
        }
        return false;
    }

    async function submitSecurityCode() {
        const memberInput = document.getElementById('securityMemberInput');
        const input = document.getElementById('securityCodeInput');
        const hint = document.getElementById('securityHint');
        const account = normalizeMemberAccount((memberInput && memberInput.value) || '');
        const code = String((input && input.value) || '').trim();
        if (!code) {
            if (hint) hint.innerText = '請先輸入存取碼';
            return;
        }
        try {
            const loginResult = await apiRequest('/auth/login', {
                method: 'POST',
                body: {
                    account,
                    password: code
                },
                skipAuth: true,
                retries: 0,
                timeoutMs: 12000
            });
            setBackendSession(loginResult, loginResult.token);
            await startApp();
            hideSecurityLock();
            if (hint) hint.innerText = '';
            if (memberInput) memberInput.value = '';
            if (input) input.value = '';
            showToast(loginResult.sessionType === 'member'
                ? `會員「${loginResult.account}」驗證成功`
                : '後端保護模式驗證成功');
        } catch (error) {
            console.warn('後端登入失敗', error);
            const status = error && Number(error.status);
            let loginUrl = '';
            try {
                loginUrl = buildApiUrl('/auth/login');
            } catch (_e) {
                loginUrl = '';
            }
            const msgLower = String(error && error.message || '').toLowerCase();
            const netFail = msgLower.includes('failed to fetch') || msgLower.includes('networkerror')
                || (error && error.name === 'TypeError');
            const aborted = error && error.name === 'AbortError';
            let errText;
            if (status === 404) {
                errText = `找不到後端（404）：${loginUrl}。請用專案 server 開站（預設埠 8787）或設定 Local Storage 鍵 bm_69:api_base_url 為 API 根網址。`;
            } else if (netFail) {
                errText = `無法連上後端：${loginUrl || '(請檢查 bm_69:api_base_url)'}。請確認伺服器已啟動且網址正確。`;
            } else if (aborted || msgLower.includes('abort')) {
                errText = `連線逾時或中斷。請確認後端可連線後重試（${loginUrl}）。`;
            } else if (status === 401) {
                errText = account ? '會員帳號或密碼錯誤，請重試' : '存取碼錯誤（請對照 server 的 BUILDMASTER_ACCESS_CODE 或 .env）';
            } else if (status === 503) {
                errText = account
                    ? '會員登入需資料庫，後端暫時無法連線，請稍後再試。'
                    : '後端暫時無法使用，請稍後再試。';
            } else if (status === 501) {
                errText = 'HTTP 501：目前網頁所在伺服器不支援 API（POST）。請先啟動專案 server 的 Node（埠 8787），再按下方「將 API 指向本機 Node（8787）並重新整理」，或直接開 http://127.0.0.1:8787/index.html。';
            } else if (status === 405) {
                errText = `HTTP 405（不允許的 HTTP 方法）。請確認後端為 BuildMaster 的 Node server，且網址含正確路徑 /api/…。`;
            } else if (Number.isFinite(status) && status >= 500) {
                errText = `後端錯誤（HTTP ${status}）${error.message ? `：${error.message}` : ''}。請看伺服器主控台；常見原因為資料庫未連線。`;
            } else if (status === 400) {
                errText = error.message || '請求格式錯誤，請重試。';
            } else {
                const detail = error && error.message ? `（${error.message}）` : '';
                errText = (account ? '會員帳號或密碼錯誤，請重試' : '無法完成登入，請確認後端與網址') + detail;
            }
            if (hint) hint.innerText = errText;
            if (input) input.value = '';
        }
    }

    async function applyExternalLoginResult(loginResult) {
        if (!loginResult || !loginResult.token) return false;
        setBackendSession(loginResult, loginResult.token);
        try {
            await startApp();
        } catch (error) {
            console.warn('外部登入後啟動失敗', error);
            showToast(error.message || '載入主畫面失敗，請重新整理');
            return false;
        }
        hideSecurityLock();
        showToast(loginResult.sessionType === 'member'
            ? `會員「${loginResult.account}」已啟用`
            : '已啟用');
        return true;
    }

    window.BuildMasterAuthBridge = {
        applyLoginResult: applyExternalLoginResult
    };


/* === scripts/billing/membership-billing.js === */
(function () {
    function normalizeApiBase() {
        try {
            const raw = String(localStorage.getItem('bm_69:api_base_url') || '/api').trim();
            if (!raw || raw === '/') return '/api';
            if (/^https?:\/\/[^/]+$/i.test(raw)) return `${raw.replace(/\/+$/g, '')}/api`;
            return raw.replace(/\/+$/g, '');
        } catch (_e) {
            return '/api';
        }
    }

    function buildApiUrl(path) {
        const p = String(path || '').startsWith('/') ? String(path) : `/${path}`;
        return `${normalizeApiBase()}${p}`;
    }

    function clearStripeReturnParams() {
        try {
            const url = new URL(window.location.href);
            if (!url.searchParams.has('stripe_session') && !url.searchParams.has('session_id')) return;
            url.searchParams.delete('stripe_session');
            url.searchParams.delete('session_id');
            history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
        } catch (_e) {}
    }

    async function fetchCatalog() {
        const res = await fetch(buildApiUrl('/billing/catalog'), { headers: { Accept: 'application/json' } });
        if (!res.ok) return null;
        return res.json();
    }

    async function redeemStripeSession(sessionId) {
        const res = await fetch(buildApiUrl('/billing/stripe/redeem'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ sessionId: String(sessionId || '').trim() })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.message || data.error || `HTTP ${res.status}`);
            err.payload = data;
            throw err;
        }
        return data;
    }

    async function redeemAppleReceipt(receiptBase64) {
        const res = await fetch(buildApiUrl('/billing/apple/redeem'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ receiptBase64: String(receiptBase64 || '').trim() })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.message || data.error || `HTTP ${res.status}`);
            err.payload = data;
            throw err;
        }
        return data;
    }

    function renderTierButtons(container, catalog) {
        if (!container || !catalog || !Array.isArray(catalog.tiers)) return;
        container.innerHTML = '';
        catalog.tiers.forEach((tier) => {
            const row = document.createElement('div');
            row.className = 'billing-tier-row';
            const label = document.createElement('span');
            label.className = 'billing-tier-label';
            label.textContent = tier.label || tier.id;
            const actions = document.createElement('div');
            actions.className = 'billing-tier-actions';
            if (tier.stripePaymentLinkUrl && !isIosReviewRuntime()) {
                const a = document.createElement('a');
                a.className = 'billing-link billing-link-stripe';
                a.href = tier.stripePaymentLinkUrl;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = '信用卡 (Stripe)';
                actions.appendChild(a);
            }
            if (tier.appleProductId) {
                const hint = document.createElement('span');
                hint.className = 'billing-iap-hint';
                hint.textContent = 'App 內：用 Apple 訂閱';
                hint.title = `Product ID: ${tier.appleProductId}`;
                actions.appendChild(hint);
            }
            row.appendChild(label);
            row.appendChild(actions);
            container.appendChild(row);
        });
        if (!container.children.length) {
            container.innerHTML = '<p class="billing-muted">尚未設定付款連結（伺服器環境變數）。</p>';
        }
    }

    function setBillingStripeSessionPreview(raw) {
        const wrap = document.getElementById('billingStripeSessionPreview');
        const codeEl = document.getElementById('billingStripeSessionPreviewValue');
        const sid = String(raw || '').trim();
        if (!wrap || !codeEl) return;
        if (isIosReviewRuntime()) {
            codeEl.textContent = '';
            wrap.hidden = true;
            return;
        }
        if (sid.startsWith('cs_')) {
            codeEl.textContent = sid;
            wrap.hidden = false;
        } else {
            codeEl.textContent = '';
            wrap.hidden = true;
        }
    }

    async function tryAutoRedeemStripe() {
        if (isIosReviewRuntime()) {
            clearStripeReturnParams();
            return;
        }
        const params = new URLSearchParams(window.location.search);
        const sid = params.get('stripe_session') || params.get('session_id');
        if (!sid || !sid.startsWith('cs_')) return;
        const input = document.getElementById('billingStripeSessionInput');
        if (input && !String(input.value || '').trim()) {
            input.value = sid;
        }
        setBillingStripeSessionPreview(sid);
        const hint = document.getElementById('securityHint');
        if (hint) hint.innerText = '正在兌換 Stripe 付款…';
        try {
            const data = await redeemStripeSession(sid);
            const bridge = window.BuildMasterAuthBridge;
            if (bridge && typeof bridge.applyLoginResult === 'function') {
                await bridge.applyLoginResult(data);
            }
            clearStripeReturnParams();
        } catch (e) {
            console.warn(e);
            if (hint) hint.innerText = e.message || 'Stripe 兌換失敗，請改用手動輸入 Session ID';
        }
    }

    function bindManualRedeem() {
        const btn = document.getElementById('billingStripeRedeemBtn');
        const input = document.getElementById('billingStripeSessionInput');
        const hint = document.getElementById('securityHint');
        if (!btn || !input) return;
        if (isIosReviewRuntime()) {
            btn.disabled = true;
            btn.hidden = true;
            input.disabled = true;
            input.hidden = true;
            return;
        }
        const syncPreview = () => setBillingStripeSessionPreview(input.value);
        input.addEventListener('input', syncPreview);
        input.addEventListener('paste', () => queueMicrotask(syncPreview));
        syncPreview();
        btn.addEventListener('click', async () => {
            const sid = String(input.value || '').trim();
            if (!sid.startsWith('cs_')) {
                if (hint) hint.innerText = 'Session ID 應以 cs_ 開頭';
                setBillingStripeSessionPreview(input.value);
                return;
            }
            setBillingStripeSessionPreview(sid);
            if (hint) hint.innerText = '兌換中…';
            try {
                const data = await redeemStripeSession(sid);
                const bridge = window.BuildMasterAuthBridge;
                if (bridge && typeof bridge.applyLoginResult === 'function') {
                    await bridge.applyLoginResult(data);
                }
                input.value = '';
                setBillingStripeSessionPreview('');
            } catch (e) {
                if (hint) hint.innerText = e.message || '兌換失敗';
            }
        });
    }

    async function initBillingPanel() {
        const tiersHost = document.getElementById('billingTiersHost');
        if (tiersHost) {
            const catalog = await fetchCatalog();
            if (catalog) renderTierButtons(tiersHost, catalog);
        }
        bindManualRedeem();
        await tryAutoRedeemStripe();
    }

    function boot() {
        initBillingPanel().catch((e) => console.warn('billing ui', e));
    }

    window.BuildMasterBilling = {
        redeemStripeSession,
        redeemAppleReceipt,
        fetchCatalog
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

/* === scripts/features/materials-weather.js === */
    async function initMaterialCatalog() {
        const savedRegion = localStorage.getItem(REGION_STORAGE_KEY);
        const selector = document.getElementById('regionSelect');
        if (savedRegion) {
            currentRegionLabel = savedRegion;
            currentRegionMode = '手動';
            if (selector) selector.value = savedRegion;
        } else {
            currentRegionLabel = '全台共用';
            currentRegionMode = '預設';
            if (selector) selector.value = '全台共用';
        }
        materialCatalog = await loadMaterialCatalog(currentRegionLabel);
        renderMaterialOptions(materialCatalog);
        updateMaterialChips(materialCatalog.length, null);
        updateRegionChip();
        updateMaterialSourceChip();
        await refreshSiteWeather(true, { allowGps: false });
        startSiteWeatherAutoRefresh();
        if (typeof initBimRuleEditor === 'function') {
            initBimRuleEditor();
        }
    }

    function startSiteWeatherAutoRefresh() {
        if (siteWeatherAutoRefreshTimer) clearInterval(siteWeatherAutoRefreshTimer);
        siteWeatherAutoRefreshTimer = setInterval(() => {
            refreshSiteWeather(true, { allowGps: false });
        }, SITE_WEATHER_REFRESH_MS);
    }


    function normalizeMaterialItems(payload) {
        const items = Array.isArray(payload)
            ? payload
            : (Array.isArray(payload && payload.items) ? payload.items : []);

        const parsePrice = value => {
            if (typeof value === 'number') return value;
            const text = String(value ?? '').replace(/,/g, '').trim();
            const parsed = Number(text);
            return Number.isFinite(parsed) ? parsed : NaN;
        };

        return items
            .map(item => {
                if (!item || typeof item !== 'object') return null;
                const name = String(
                    item.name ??
                    item.materialName ??
                    item.material ??
                    item['材料名稱'] ??
                    item['名稱'] ??
                    ''
                ).trim();
                const price = parsePrice(
                    item.price ??
                    item.unitPrice ??
                    item['單價'] ??
                    item['單價 (已取高標)'] ??
                    item['單價(已取高標)']
                );
                const unit = String(item.unit ?? item['單位'] ?? '').trim();
                return { name, price, unit };
            })
            .filter(item => item && item.name && Number.isFinite(item.price) && item.price > 0);
    }

    async function loadMaterialCatalog(regionLabel = '全台共用') {
        const regionFile = REGION_FILE_MAP[regionLabel];
        const candidateFiles = regionFile ? [regionFile, PRICES_JSON_URL] : [PRICES_JSON_URL];
        const loaded = [];

        for (const file of candidateFiles) {
            try {
                const res = await fetchWithRetry(
                    `${file}?v=${Date.now()}`,
                    { cache: 'no-store' },
                    { retries: 2, timeoutMs: 6500 }
                );
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const payload = await res.json();
                const normalized = normalizeMaterialItems(payload);
                if (normalized.length > 0) {
                    const sourceFile = String(
                        (payload && typeof payload === 'object' && payload.source) ? payload.source : file
                    ).trim() || file;
                    const generatedAt = String(
                        (payload && typeof payload === 'object' && payload.generated_at) ? payload.generated_at : ''
                    ).trim();
                    const updateMode = String(
                        (payload && typeof payload === 'object' && payload.price_update_mode) ? payload.price_update_mode : ''
                    ).trim();
                    const seasonalFactor = String(
                        (payload && typeof payload === 'object' && payload.seasonal_factor !== undefined) ? payload.seasonal_factor : ''
                    ).trim();
                    const fallbackReason = String(
                        (payload && typeof payload === 'object' && payload.fallback_reason) ? payload.fallback_reason : ''
                    ).trim();
                    loaded.push({ file, items: normalized, sourceFile, generatedAt, updateMode, seasonalFactor, fallbackReason });
                }
            } catch (e) {
                console.warn(`載入 ${file} 失敗`, e);
            }
        }

        if (loaded.length > 0) {
            loaded.sort((a, b) => b.items.length - a.items.length);
            const best = loaded[0];
            const isRegionFile = !!regionFile && best.file === regionFile;
            const isRegionMode = regionLabel !== '全台共用';

            // 若地區檔資料筆數偏少，優先改用全台完整檔，避免只看到少量單價。
            if (isRegionMode && isRegionFile && best.items.length < 30) {
                const fallbackGlobal = loaded.find(entry => entry.file === PRICES_JSON_URL);
                if (fallbackGlobal && fallbackGlobal.items.length > best.items.length) {
                    showToast(`偵測到地區單價僅 ${best.items.length} 筆，已改用全台完整價目 ${fallbackGlobal.items.length} 筆`);
                    currentMaterialSourceMeta = {
                        file: fallbackGlobal.sourceFile || fallbackGlobal.file,
                        generatedAt: fallbackGlobal.generatedAt || '',
                        updateMode: fallbackGlobal.updateMode || '',
                        seasonalFactor: fallbackGlobal.seasonalFactor || '',
                        fallbackReason: fallbackGlobal.fallbackReason || ''
                    };
                    if (currentMaterialSourceMeta.updateMode === 'fallback_seasonal_factor') {
                        const factorText = currentMaterialSourceMeta.seasonalFactor
                            ? `（係數 x${currentMaterialSourceMeta.seasonalFactor}）`
                            : '';
                        showToast(`提醒：目前為季度估算價${factorText}，正式報價請上傳審核 CSV`);
                    }
                    return fallbackGlobal.items;
                }
            }

            currentMaterialSourceMeta = {
                file: best.sourceFile || best.file,
                generatedAt: best.generatedAt || '',
                updateMode: best.updateMode || '',
                seasonalFactor: best.seasonalFactor || '',
                fallbackReason: best.fallbackReason || ''
            };
            if (currentMaterialSourceMeta.updateMode === 'fallback_seasonal_factor') {
                const factorText = currentMaterialSourceMeta.seasonalFactor
                    ? `（係數 x${currentMaterialSourceMeta.seasonalFactor}）`
                    : '';
                showToast(`提醒：目前為季度估算價${factorText}，正式報價請上傳審核 CSV`);
            }
            showToast(`已同步${regionLabel}價格（${best.items.length} 筆）`);
            return best.items;
        }

        try {
            currentMaterialSourceMeta = {
                file: '內建預設',
                generatedAt: '',
                updateMode: '',
                seasonalFactor: '',
                fallbackReason: ''
            };
            showToast(`使用內建單價（離線模式：${DEFAULT_MATERIAL_CATALOG.length} 筆）`);
            return [...DEFAULT_MATERIAL_CATALOG];
        } catch (_e) {
            currentMaterialSourceMeta = {
                file: '內建預設',
                generatedAt: '',
                updateMode: '',
                seasonalFactor: '',
                fallbackReason: ''
            };
            return [...DEFAULT_MATERIAL_CATALOG];
        }
    }

    async function handleRegionChange(value) {
        if (value === 'auto') {
            localStorage.removeItem(REGION_STORAGE_KEY);
            const detected = await detectRegionFromDevice();
            currentRegionLabel = detected || '全台共用';
            currentRegionMode = detected ? '自動' : '預設';
        } else {
            currentRegionLabel = value;
            currentRegionMode = '手動';
            localStorage.setItem(REGION_STORAGE_KEY, value);
        }

        selectedMaterial = null;
        materialCatalog = await loadMaterialCatalog(currentRegionLabel);
        renderMaterialOptions(materialCatalog);
        renderBimRuleMaterialOptions();
        updateMaterialChips(materialCatalog.length, null);
        updateRegionChip();
        updateMaterialSourceChip();
        addAuditLog('切換地區價目', `${currentRegionLabel}（${currentRegionMode}）`);
    }

    async function autoDetectRegion() {
        localStorage.removeItem(REGION_STORAGE_KEY);
        const selector = document.getElementById('regionSelect');
        if (selector) selector.value = 'auto';
        await handleRegionChange('auto');
        await refreshSiteWeather(true, { allowGps: true });
    }

    function updateRegionChip() {
        const chip = document.getElementById('materialRegionChip');
        if (!chip) return;
        chip.innerHTML = `地區：<strong>${currentRegionLabel}</strong>（${currentRegionMode}）`;
    }

    function updateMaterialSourceChip() {
        const chip = document.getElementById('materialSourceChip');
        if (!chip) return;
        const file = String(currentMaterialSourceMeta.file || '未同步');
        const generatedAt = String(currentMaterialSourceMeta.generatedAt || '').trim();
        const timeText = generatedAt ? ` / ${generatedAt}` : '';
        const isFallback = String(currentMaterialSourceMeta.updateMode || '').trim() === 'fallback_seasonal_factor';
        const factor = String(currentMaterialSourceMeta.seasonalFactor || '').trim();
        const warningText = isFallback
            ? ` ｜ <strong>估算價模式</strong>${factor ? ` (x${factor})` : ''}`
            : '';
        chip.innerHTML = `資料來源：<strong>${file}</strong>${timeText}${warningText}`;
        chip.classList.toggle('material-chip-warning', isFallback);
    }

    function formatMaterialCatalogLabel(item) {
        if (!item) return '';
        const name = String(item.name || '').trim() || '未命名材料';
        const unit = String(item.unit || '').trim();
        const price = Number(item.price);
        const priceText = Number.isFinite(price) ? price.toLocaleString() : '-';
        return unit
            ? `${name} ｜ ${unit} ｜ ${priceText}`
            : `${name} ｜ ${priceText}`;
    }

    function normalizeRegionName(name) {
        const text = String(name || '');
        if (text.includes('台中') || text.includes('臺中')) return '台中市';
        if (text.includes('台北') || text.includes('臺北')) return '台北市';
        if (text.includes('新北')) return '新北市';
        if (text.includes('桃園')) return '桃園市';
        if (text.includes('台南') || text.includes('臺南')) return '台南市';
        if (text.includes('高雄')) return '高雄市';
        return '';
    }

    async function getDeviceCoordinates() {
        if (!navigator.geolocation) return null;
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 6000,
                    maximumAge: 120000
                });
            });
            const latitude = Number(pos && pos.coords && pos.coords.latitude);
            const longitude = Number(pos && pos.coords && pos.coords.longitude);
            const accuracyM = Number(pos && pos.coords && pos.coords.accuracy);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
            return {
                latitude,
                longitude,
                accuracyM: Number.isFinite(accuracyM) ? Math.max(0, accuracyM) : null
            };
        } catch (_e) {
            return null;
        }
    }

    function getWeatherFallbackCoordsByRegion(regionName) {
        const normalized = normalizeRegionName(regionName) || String(regionName || '');
        return WEATHER_REGION_CENTER_MAP[normalized] || null;
    }

    function getWeatherLocationSourceLabel(mode) {
        if (mode === 'manual-region') return '手動地區';
        if (mode === 'region-fallback') return '地區備援';
        return '按鈕抓地區';
    }

    async function resolveWeatherLocation(options = {}) {
        const allowGps = !!(options && options.allowGps);
        const coords = allowGps ? await getDeviceCoordinates() : null;
        const fallbackRegion = currentRegionLabel && currentRegionLabel !== '全台共用'
            ? (normalizeRegionName(currentRegionLabel) || currentRegionLabel)
            : '';
        const fallbackCoords = getWeatherFallbackCoordsByRegion(fallbackRegion);

        if (coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)) {
            const accuracyM = Number(coords.accuracyM);
            if (!Number.isFinite(accuracyM) || accuracyM <= WEATHER_GEOLOCATION_MAX_ACCURACY_M) {
                return {
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    accuracyM: Number.isFinite(accuracyM) ? accuracyM : null,
                    label: fallbackRegion || '目前工地',
                    mode: 'gps'
                };
            }
            if (fallbackCoords) {
                return {
                    latitude: fallbackCoords.latitude,
                    longitude: fallbackCoords.longitude,
                    accuracyM,
                    label: fallbackRegion,
                    mode: 'region-fallback'
                };
            }
            return {
                latitude: coords.latitude,
                longitude: coords.longitude,
                accuracyM,
                label: '目前工地',
                mode: 'gps'
            };
        }

        if (fallbackCoords) {
            return {
                latitude: fallbackCoords.latitude,
                longitude: fallbackCoords.longitude,
                accuracyM: null,
                label: fallbackRegion,
                mode: 'manual-region'
            };
        }
        return null;
    }

    function resolveOpenMeteoRainProbability(current, hourly) {
        const fromCurrent = Number(current && current.precipitation_probability);
        if (Number.isFinite(fromCurrent)) {
            return Math.max(0, Math.min(100, fromCurrent));
        }
        const times = Array.isArray(hourly && hourly.time) ? hourly.time : [];
        const probs = Array.isArray(hourly && hourly.precipitation_probability) ? hourly.precipitation_probability : [];
        if (!times.length || times.length !== probs.length) return 0;
        const nowTime = String((current && current.time) || '');
        const exactIdx = times.indexOf(nowTime);
        if (exactIdx >= 0 && Number.isFinite(Number(probs[exactIdx]))) {
            return Math.max(0, Math.min(100, Number(probs[exactIdx])));
        }
        const nowTs = Date.parse(nowTime);
        if (Number.isFinite(nowTs)) {
            let bestIdx = -1;
            let bestGap = Infinity;
            for (let i = 0; i < times.length; i += 1) {
                const ts = Date.parse(String(times[i] || ''));
                if (!Number.isFinite(ts)) continue;
                const gap = Math.abs(ts - nowTs);
                if (gap < bestGap) {
                    bestGap = gap;
                    bestIdx = i;
                }
            }
            if (bestIdx >= 0 && Number.isFinite(Number(probs[bestIdx]))) {
                return Math.max(0, Math.min(100, Number(probs[bestIdx])));
            }
        }
        return Number.isFinite(Number(probs[0])) ? Math.max(0, Math.min(100, Number(probs[0]))) : 0;
    }

    async function detectRegionFromDevice() {
        try {
            const coords = await getDeviceCoordinates();
            if (!coords) return '';
            const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}&accept-language=zh-TW`;
            const res = await fetchWithRetry(url, {}, { retries: 1, timeoutMs: 5000 });
            if (!res.ok) return '';
            const data = await res.json();
            const address = data.address || {};
            const cityRaw = address.city || address.county || address.state || address.town || '';
            return normalizeRegionName(cityRaw);
        } catch (_e) {
            return '';
        }
    }

    function getWeatherAdviceLevel(weather) {
        if (!weather) return { level: '未知', message: '無天氣資料，請更新。', color: '#ffd48a' };
        const rain = Number(weather.rainMm) || 0;
        const rainProb = Number(weather.rainProb) || 0;
        const wind = Number(weather.windKmh) || 0;
        const code = Number(weather.weatherCode) || 0;
        const badCode = [65, 75, 82, 95, 96, 99];
        if (badCode.includes(code) || rain >= 5 || rainProb >= 80 || wind >= 40) {
            return { level: '建議暫緩', message: '風雨風險高，建議延後外業。', color: '#ff9a9a' };
        }
        if (rain >= 1 || rainProb >= 50 || wind >= 28) {
            return { level: '注意施工', message: '請加強防滑、防風與儀器固定。', color: '#ffd48a' };
        }
        return { level: '可施工', message: '天氣條件穩定，可依標準流程施工。', color: '#9ef5c2' };
    }

    function resolveWeatherVisualState(weather, level) {
        const code = Number(weather && weather.weatherCode) || 0;
        const rain = Number(weather && weather.rainMm) || 0;
        const rainProb = Number(weather && weather.rainProb) || 0;
        const stormCodes = [95, 96, 99];
        const rainCodes = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82];
        const fogCodes = [45, 48];
        if (stormCodes.includes(code) || level === '建議暫緩') return 'storm';
        if (fogCodes.includes(code)) return 'fog';
        if (rainCodes.includes(code) || rain >= 0.4 || rainProb >= 50) return 'rain';
        if ([2, 3].includes(code)) return 'cloudy';
        if ([0, 1].includes(code)) return 'sun';
        if (level === '注意施工') return 'rain';
        return 'cloudy';
    }

    function applyWeatherScene(level, weather = null) {
        const body = document.body;
        if (!body) return;
        body.classList.remove(
            'weather-scene-good',
            'weather-scene-caution',
            'weather-scene-bad',
            'weather-visual-sun',
            'weather-visual-cloudy',
            'weather-visual-rain',
            'weather-visual-storm',
            'weather-visual-fog'
        );
        if (level === '可施工') body.classList.add('weather-scene-good');
        else if (level === '注意施工') body.classList.add('weather-scene-caution');
        else if (level === '建議暫緩') body.classList.add('weather-scene-bad');
        const visualState = resolveWeatherVisualState(weather, level);
        body.classList.add(`weather-visual-${visualState}`);
    }

    function createWeatherNewsBulletin(weather) {
        if (!weather) return '氣象快報：資料不足，請稍後更新。';
        const weatherLabel = WEATHER_CODE_MAP[Number(weather.weatherCode)] || '天氣變化';
        const rainProb = Math.round(Number(weather.rainProb) || 0);
        const rainMm = Number(weather.rainMm) || 0;
        const windKmh = Math.round(Number(weather.windKmh) || 0);
        const tempC = Number(weather.tempC) || 0;
        const advice = getWeatherAdviceLevel(weather);
        let phaseText = '整體天氣穩定';
        if (rainProb >= 80 || rainMm >= 5 || windKmh >= 40) phaseText = '短時風雨風險偏高';
        else if (rainProb >= 50 || rainMm >= 1 || windKmh >= 28) phaseText = '局部有雨勢變化';
        return `氣象快報：目前${weatherLabel}，${tempC.toFixed(1)}°C，降雨機率 ${rainProb}%、風速 ${windKmh} km/h；${phaseText}，施工判斷 ${advice.level}。`;
    }

    function getActiveStakingQaGate() {
        if (latestWeatherAdviceLevel === '建議暫緩') return Math.max(STAKING_EXPORT_QA_MIN_SCORE, 92);
        if (latestWeatherAdviceLevel === '注意施工') return Math.max(STAKING_EXPORT_QA_MIN_SCORE, 90);
        return STAKING_EXPORT_QA_MIN_SCORE;
    }

    function applyWeatherLinkedStakingMode(adviceLevel, weather) {
        latestWeatherAdviceLevel = adviceLevel || '未知';
        const nextConservative = adviceLevel === '注意施工' || adviceLevel === '建議暫緩';
        const changed = nextConservative !== stakingConservativeMode;
        stakingConservativeMode = nextConservative;
        if (stakingConservativeMode && bimLayoutPoints.length) {
            runBimLayoutConfidenceLayering(true, true);
        }
        if (changed) {
            const rainProb = Math.round(Number(weather && weather.rainProb) || 0);
            const wind = Math.round(Number(weather && weather.windKmh) || 0);
            const gate = getActiveStakingQaGate();
            if (stakingConservativeMode) {
                addAuditLog('天氣聯動保守模式', `啟用 / 天氣 ${adviceLevel} / 門檻 ${gate} / 雨機率 ${rainProb}% / 風速 ${wind}km/h`);
            } else {
                addAuditLog('天氣聯動保守模式', `解除 / 天氣 ${adviceLevel} / 門檻 ${gate}`);
            }
        }
    }

    function setSiteWeatherNewsText(text, color) {
        const applyText = (node) => {
            if (!node) return;
            node.innerText = text;
            if (color) node.style.color = color;
            // Restart marquee each time bulletin text changes.
            node.style.animation = 'none';
            void node.offsetWidth;
            node.style.animation = 'weather-news-marquee 16s linear infinite';
        };
        applyText(document.getElementById('siteWeatherNews'));
        applyText(document.getElementById('globalWeatherTickerText'));
    }

    function updateSiteWeatherUI(weather, errorText = '') {
        const info = document.getElementById('siteWeatherInfo');
        const safety = document.getElementById('siteWeatherSafety');
        const news = document.getElementById('siteWeatherNews');
        if (!info || !safety || !news) return;
        if (!weather) {
            applyWeatherScene('未知', null);
            applyWeatherLinkedStakingMode('未知', null);
            info.innerText = `天氣：${errorText || '暫無資料'}`;
            info.style.color = '#ffd48a';
            safety.innerText = `施工建議：天氣暫時無法更新，系統會自動重試｜放樣模式：${stakingConservativeMode ? '保守' : '標準'}（QA門檻 ${getActiveStakingQaGate()}）`;
            safety.style.color = '#ffd48a';
            setSiteWeatherNewsText('氣象快報：目前無即時資料，系統將自動重試更新。', '#ffd48a');
            return;
        }
        const weatherLabel = WEATHER_CODE_MAP[Number(weather.weatherCode)] || '天氣變化';
        const locationLabel = String(weather.locationLabel || '').trim();
        const sourceLabel = getWeatherLocationSourceLabel(weather.locationMode);
        const locationText = locationLabel ? `｜工地 ${locationLabel}（${sourceLabel}）` : `｜來源 ${sourceLabel}`;
        const accuracyText = Number.isFinite(Number(weather.locationAccuracyM)) ? `｜範圍誤差約 ${Math.round(Number(weather.locationAccuracyM))}m` : '';
        info.innerText = `天氣：${weatherLabel}${locationText}${accuracyText}｜${weather.tempC.toFixed(1)}°C（體感 ${weather.apparentC.toFixed(1)}°C）｜降雨 ${weather.rainMm.toFixed(1)}mm / ${Math.round(weather.rainProb)}%｜風速 ${Math.round(weather.windKmh)}km/h`;
        info.style.color = '#cde8ff';
        const advice = getWeatherAdviceLevel(weather);
        applyWeatherScene(advice.level, weather);
        applyWeatherLinkedStakingMode(advice.level, weather);
        safety.innerText = `施工建議：${advice.level}｜${advice.message}｜放樣模式：${stakingConservativeMode ? '保守（僅高信心）' : '標準'}｜QA門檻 ${getActiveStakingQaGate()}`;
        safety.style.color = advice.color;
        setSiteWeatherNewsText(createWeatherNewsBulletin(weather), '#cfe6ff');
    }

    async function refreshSiteWeather(silent = false, options = {}) {
        const location = await resolveWeatherLocation(options);
        if (!location) {
            updateSiteWeatherUI(null, '尚未指定工地地區，可手動選城市或按按鈕抓目前工地');
            if (!silent) showToast('請先手動選地區，或按「抓目前工地並套用」');
            return;
        }
        try {
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,apparent_temperature,weather_code,precipitation,precipitation_probability,wind_speed_10m&hourly=precipitation_probability&forecast_days=1&timezone=auto`;
            const res = await fetchWithRetry(weatherUrl, {}, { retries: 1, timeoutMs: 6500 });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const payload = await res.json();
            const current = payload && payload.current ? payload.current : {};
            const hourly = payload && payload.hourly ? payload.hourly : {};
            const rainProb = resolveOpenMeteoRainProbability(current, hourly);
            const weather = {
                tempC: Number(current.temperature_2m) || 0,
                apparentC: Number(current.apparent_temperature) || 0,
                weatherCode: Number(current.weather_code) || 0,
                rainMm: Number(current.precipitation) || 0,
                windKmh: Number(current.wind_speed_10m) || 0,
                rainProb: Number(rainProb) || 0,
                locationLabel: location.label || '',
                locationMode: location.mode || 'gps',
                locationAccuracyM: Number.isFinite(Number(location.accuracyM)) ? Number(location.accuracyM) : null
            };
            updateSiteWeatherUI(weather);
            addAuditLog('工地天氣更新', `${weather.locationLabel || '目前工地'} / ${getWeatherLocationSourceLabel(weather.locationMode)} / 溫度 ${weather.tempC}°C / 降雨機率 ${Math.round(weather.rainProb)}% / 風速 ${Math.round(weather.windKmh)}km/h`);
            if (!silent) showToast('工地即時天氣已更新');
        } catch (_e) {
            updateSiteWeatherUI(null, '天氣服務連線失敗，請稍後重試');
            if (!silent) showToast('天氣服務暫時不可用，請稍後重試');
        }
    }

    function renderMaterialOptions(items) {
        const select = document.getElementById('materialSelect');
        if (!select) return;
        select.innerHTML = '<option value="">請選擇材料項目</option>';
        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.name;
            opt.textContent = formatMaterialCatalogLabel(item);
            select.appendChild(opt);
        });
    }

    function normalizeText(text) {
        return (text || '').toLowerCase().replace(/\s+/g, '');
    }

    function filterMaterialCatalog(keyword) {
        const q = normalizeText(keyword);
        const filtered = materialCatalog.filter(item => normalizeText(item.name).includes(q));
        renderMaterialOptions(filtered);
        selectedMaterial = filtered.length === 1 ? filtered[0] : null;
        updateMaterialChips(filtered.length, selectedMaterial, materialCatalog.length);
    }

    function selectMaterialFromDropdown(name) {
        selectedMaterial = materialCatalog.find(item => item.name === name) || null;
        updateMaterialChips(materialCatalog.length, selectedMaterial);
    }

    function updateMaterialChips(count, material, totalCount) {
        const countChip = document.getElementById('materialCountChip');
        const priceChip = document.getElementById('materialPriceChip');
        const total = Number.isFinite(totalCount) ? totalCount : count;
        if (countChip) {
            if (count !== total) countChip.innerHTML = `資料筆數：<strong>${count}</strong> / <span style="color:#9bc2e5;">總 ${total}</span>`;
            else countChip.innerHTML = `資料筆數：<strong>${count}</strong>`;
        }
        if (priceChip) {
            if (material) {
                priceChip.innerHTML = `目前材料：<strong>${formatMaterialCatalogLabel(material)}</strong>`;
            } else {
                priceChip.innerHTML = '目前材料：<strong>尚未選取</strong>';
            }
        }
    }

    function applySelectedMaterialPrice() {
        if (!selectedMaterial) return showToast('請先從試算表項目選擇材料');
        const unitPriceInput = document.getElementById('unitPrice');
        const customNameInput = document.getElementById('customName');
        unitPriceInput.value = selectedMaterial.price;
        if (!customNameInput.value.trim()) customNameInput.value = selectedMaterial.name;
        previewCalc();
        showToast(`已套用「${selectedMaterial.name}」單價`);
    }
