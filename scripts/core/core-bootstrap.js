    // 1.0 資料隔離與相容性設定
    const STORAGE_KEY = 'bm_69:list';
    const SCHEMA_VERSION = '8.0.0';
    const SECURITY_UNLOCK_KEY = 'bm_69:security_unlocked';
    const OWNER_LOCK_HASH_KEY = 'cm_owner_lock_hash_v1';
    const OWNER_UNLOCK_SESSION_KEY = 'cm_owner_lock_unlocked_v1';
    const MEMBER_CODES_STORAGE_KEY = 'bm_69:member_codes';
    const SECURITY_CONFIG = {
        // 預設存取碼：BuildMaster@2026!
        accessHash: '78e098f0bd34f7c3246e9c0d0b91cc6f78b1fe0321bc7bfc5c58215d838dc663',
        allowedHosts: ['gt492145-sudo.github.io', 'localhost', '127.0.0.1']
    };
    const SECURITY_PASSWORD_ENABLED = false; // temporary: bypass login password during network-edition edits
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
    let currentQaProfile = localStorage.getItem(QA_PROFILE_STORAGE_KEY) || 'enterprise';
    let currentBimSpecPreset = localStorage.getItem(BIM_SPEC_PRESET_STORAGE_KEY) || 'public';
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
    
    // 載入資料並檢查版本 (降級策略)
    let list = [];
    try {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            const parsed = JSON.parse(storedData);
            // 簡單的版本檢查，若結構大改可在此處寫轉換邏輯
            if (parsed.version && (parsed.version.startsWith('8.0') || parsed.version.startsWith('7.0') || parsed.version.startsWith('6.9'))) {
                list = (parsed.data || []).filter(item => item && item.source !== 'warroom');
            } else {
                console.warn("偵測到舊版資料，嘗試載入...");
                list = (Array.isArray(parsed) ? parsed : []).filter(item => item && item.source !== 'warroom');
            }
        }
    } catch (e) {
        console.error("資料解析失敗", e);
        list = [];
    }

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
    let smartMeasureState = createDefaultSmartMeasureState();
    const COACH_GUIDE_STEPS = [
        { selector: '#regionSelect', message: '第 1 步：先選地區價目來源，確保抓到正確單價。' },
        { selector: '#materialSearch', message: '第 2 步：輸入關鍵字搜尋材料，例如模板、混凝土、鋼筋。' },
        { selector: 'button[onclick="applySelectedMaterialPrice()"]', message: '第 3 步：把材料單價套用到單價欄，省去手動輸入。' },
        { selector: '#fileInput', message: '第 4 步：上傳圖紙，接著用定比例與量測取得尺寸。' },
        { selector: '.btn-add', message: '第 5 步：確認預覽後按加入清單，最後可匯出報表。' }
    ];
    let coachTimer = null;
    let coachBound = false;
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
    let featureFlags = { aiVision: true, voice: true, laser: true, warRoom: true };
    let showWarRoomRows = true;
    let demoModeEnabled = true;
    let warRoomList = [];
    let resilienceGuardsBound = false;
    const resilienceState = { globalErrors: 0, storageErrors: 0, networkErrors: 0, lastToastAt: 0 };
    let watchdogTimer = null;
    let lifecycleGuardsBound = false;
    let watchdogLagStrikes = 0;
    let watchdogLastTickAt = 0;
    let safeModeActive = false;
    let last3DMoveAt = 0;
    let qaStressMode = false;
    let qaStressRenderTimer = null;
    let qaStressNetworkTimer = null;
    let isQuantumScanning = false;
    let quantumScanLockTimer = null;
    let quantumWallTimers = [];
    let chaosMonkeyMode = false;
    let chaosMonkeyTimer = null;
    let chaosMonkeyTickCount = 0;
    let siteWeatherAutoRefreshTimer = null;
    const CHAOS_MONKEY_ENABLED = false;
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
        watchdogTimer = setInterval(() => {
            const now = Date.now();
            const drift = now - watchdogLastTickAt - 1500;
            watchdogLastTickAt = now;
            if (drift > 2200) {
                watchdogLagStrikes += 1;
                console.warn(`主執行緒卡頓偵測：${Math.round(drift)}ms`);
            } else if (watchdogLagStrikes > 0) {
                watchdogLagStrikes -= 1;
            }
            if (!safeModeActive && watchdogLagStrikes >= 2) {
                enterSafeMode(`event-loop lag ${Math.round(drift)}ms`);
            }
        }, 1500);
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
        navigator.serviceWorker.register('./service-worker.js')
            .catch(err => console.warn('Service worker 註冊失敗:', err));
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
        appBootstrapped = true;
        initGlobalErrorGuards();
        bindLifecycleResilience();
        startMainThreadWatchdog();
        loadDemoMode();
        loadFeatureFlags();
        loadWarRoomRowVisibility();
        applyUserLevel();
        applyWorkMode();
        applyAutoContrastMode();
        applyContrastMode();
        applySunlightMode();
        applyFeatureControlStatus();
        applyWarRoomStatus();
        window.addEventListener('online', applyWarRoomStatus);
        window.addEventListener('offline', applyWarRoomStatus);
        await initMaterialCatalog();
        updateUI();
        renderTable();
        applyAiCoachMode();
        hydrateInputFromUrlParam();
        runDeferredBootTasks();
    }

    function runDeferredBootTasks() {
        runWhenIdle(() => {
            initTouchCoach();
            initUtilityWidgets();
        }, 800);

        runWhenIdle(() => {
            restoreMeasureAssistMode();
            restoreGyroMode();
            maybeStartCoachGuide();
        }, 1500);
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
        return normalizeUserLevel(safeStorage.get(localStorage, USER_LEVEL_KEY, 'basic'));
    }

    function setUserLevel(level) {
        const normalized = normalizeUserLevel(level);
        safeStorage.set(localStorage, USER_LEVEL_KEY, normalized);
        applyUserLevel();
        showToast(`已切換：${getUserLevelLabel(normalized)}`);
    }

    function applyUserLevel() {
        const normalized = getCurrentUserLevel();
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
        applyAiCoachMode();
    }

    function setWorkMode(mode) {
        const normalized = (mode === 'stake') ? 'stake' : 'calc';
        localStorage.setItem(WORK_MODE_KEY, normalized);
        applyWorkMode();
        if (normalized === 'stake') {
            const level = getCurrentUserLevel();
            if (level !== 'pro') {
                showToast('已切換放樣模式（部分進階功能需會員3）');
                return;
            }
            showToast('已切換放樣模式');
            return;
        }
        showToast('已切換計算模式');
    }

    function applyWorkMode() {
        const mode = localStorage.getItem(WORK_MODE_KEY) || 'calc';
        document.body.setAttribute('data-work-mode', mode);
        const calcBtn = document.getElementById('workCalcBtn');
        const stakeBtn = document.getElementById('workStakeBtn');
        if (calcBtn) calcBtn.classList.toggle('active', mode === 'calc');
        if (stakeBtn) stakeBtn.classList.toggle('active', mode === 'stake');
    }

    function loadFeatureFlags() {
        try {
            const parsed = JSON.parse(localStorage.getItem(FEATURE_FLAGS_KEY) || '{}');
            featureFlags = {
                aiVision: parsed.aiVision !== false,
                voice: parsed.voice !== false,
                laser: parsed.laser !== false,
                warRoom: parsed.warRoom !== false
            };
        } catch (_e) {
            featureFlags = { aiVision: true, voice: true, laser: true, warRoom: true };
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
        const chaosBtn = document.getElementById('btnChaosMonkey');
        if (chaosBtn) {
            chaosBtn.innerText = `🐒 混沌猴子: ${chaosMonkeyMode ? '開' : '關'}`;
            chaosBtn.style.borderColor = chaosMonkeyMode ? '#ff7675' : '#ff9f43';
            chaosBtn.style.color = chaosMonkeyMode ? '#ffd0ce' : '#ffd6aa';
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
        qaStressMode = true;
        createDataSnapshot('QA壓力測試前', true);

        qaStressRenderTimer = setInterval(() => {
            if (!qaStressMode) return;
            try {
                renderTable();
                previewCalc();
                applyFeatureControlStatus();
            } catch (err) {
                console.warn('QA render stress tick failed', err);
            }
        }, 900);

        qaStressNetworkTimer = setInterval(() => {
            if (!qaStressMode) return;
            runQaStressNetworkProbe();
        }, 1800);

        applyFeatureControlStatus();
        showToast('QA 壓力測試已啟動（含網路抖動與高頻重繪）');
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
            { name: '自動優化圖面', run: () => autoEnhanceImage() },
            {
                name: '切換工作模式',
                run: () => setWorkMode(document.body.dataset.workMode === 'calc' ? 'stake' : 'calc')
            },
            {
                name: '切換3D檢視',
                run: () => {
                    if (!img.src) return;
                    toggle3DView();
                }
            }
        ];
        const selected = actions[Math.floor(Math.random() * actions.length)];
        chaosMonkeyTickCount += 1;
        appendMobileTestLog(`猴子動作 #${chaosMonkeyTickCount}: ${selected.name}`);
        try {
            selected.run();
        } catch (error) {
            console.warn('Chaos monkey action failed', error);
            appendMobileTestLog(`猴子動作失敗: ${selected.name}`);
        }
    }

    function startChaosMonkey() {
        if (!CHAOS_MONKEY_ENABLED) return;
        if (chaosMonkeyMode) return;
        chaosMonkeyMode = true;
        chaosMonkeyTickCount = 0;
        chaosMonkeyTimer = setInterval(runChaosMonkeyTick, 2600);
        applyFeatureControlStatus();
        showToast('🐒 混沌猴子已放出（每 2.6 秒隨機壓測）');
    }

    function stopChaosMonkey(silent) {
        if (chaosMonkeyTimer) {
            clearInterval(chaosMonkeyTimer);
            chaosMonkeyTimer = null;
        }
        if (!chaosMonkeyMode) return;
        chaosMonkeyMode = false;
        applyFeatureControlStatus();
        if (!silent) showToast('🐒 混沌猴子已收回');
    }

    async function toggleChaosMonkey() {
        const unlocked = await ensureOwnerUnlocked('混沌猴子');
        if (!unlocked) return;
        if (!CHAOS_MONKEY_ENABLED) {
            stopChaosMonkey(true);
            return showToast('🐒 混沌猴子已暫時收掉');
        }
        if (chaosMonkeyMode) return stopChaosMonkey(false);
        startChaosMonkey();
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

    function isDevHost() {
        return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
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
        return normalizeMemberAccount(sessionStorage.getItem('bm_69:member') || '');
    }

    function isMemberSession() {
        return !!currentMemberAccount();
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
        if (!mobileMonkeyBtn) return;
        const visible = !isMemberSession() && hasOwnerPassword() && isOwnerUnlocked();
        mobileMonkeyBtn.style.display = visible ? '' : 'none';
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

    async function bootstrapSecurity() {
        setupSecurityWatermark();
        bindClientDeterrence();

        if (window.top !== window.self) {
            showSecurityLock('偵測到外部框架嵌入，已阻擋顯示。');
            return false;
        }

        const hostAllowed =
            SECURITY_CONFIG.allowedHosts.includes(location.hostname) ||
            location.hostname.endsWith('.netlify.app') ||
            location.hostname.endsWith('.github.io');
        if (!hostAllowed) {
            showSecurityLock(`未授權網域：${location.hostname}`);
            return false;
        }

        if (!SECURITY_PASSWORD_ENABLED) {
            sessionStorage.setItem(SECURITY_UNLOCK_KEY, '1');
            hideSecurityLock();
            return true;
        }

        const unlocked = sessionStorage.getItem(SECURITY_UNLOCK_KEY) === '1';
        if (unlocked || isDevHost()) {
            hideSecurityLock();
            return true;
        }

        showSecurityLock('請輸入存取碼以啟用系統。');
        const input = document.getElementById('securityCodeInput');
        const memberInput = document.getElementById('securityMemberInput');
        if (input) {
            input.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') submitSecurityCode();
            }, { once: true });
        }
        if (memberInput) {
            memberInput.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') submitSecurityCode();
            }, { once: true });
        }
        return false;
    }

    async function submitSecurityCode() {
        loadMemberCodes();
        const memberInput = document.getElementById('securityMemberInput');
        const input = document.getElementById('securityCodeInput');
        const hint = document.getElementById('securityHint');
        const account = normalizeMemberAccount((memberInput && memberInput.value) || '');
        const code = String((input && input.value) || '').trim();
        if (!code) {
            if (hint) hint.innerText = '請先輸入存取碼';
            return;
        }
        const hashed = await hashTextSHA256(code);
        const memberHash = account ? memberCodeMap[account] : '';
        const isMemberLogin = !!memberHash;
        const ok = isMemberLogin ? (hashed === memberHash) : (hashed === SECURITY_CONFIG.accessHash);
        if (!ok) {
            if (hint) hint.innerText = '存取碼錯誤，請重試';
            if (input) input.value = '';
            return;
        }
        sessionStorage.setItem(SECURITY_UNLOCK_KEY, '1');
        if (account) sessionStorage.setItem('bm_69:member', account);
        if (isMemberLogin) {
            localStorage.setItem(USER_LEVEL_KEY, 'pro');
            document.body.setAttribute('data-user-level', 'pro');
        }
        hideSecurityLock();
        if (hint) hint.innerText = '';
        if (memberInput) memberInput.value = '';
        if (input) input.value = '';
        await startApp();
        showToast(isMemberLogin ? `會員「${account}」驗證成功` : '保護模式驗證成功');
    }

