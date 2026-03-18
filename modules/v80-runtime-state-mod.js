// Runtime state and shared constants bootstrap (v8.0).
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
let zoomLevel = 1;
let imageFilterState = { contrast: 1, brightness: 1 };
let selectedMaterial = null;
const PRICES_JSON_URL = 'prices.json';
const REGION_STORAGE_KEY = 'bm_69:region_pref';
const GYRO_MODE_KEY = 'bm_69:gyro_mode';
const MEASURE_ASSIST_KEY = 'bm_69:measure_assist';
const MEASURE_STRICT_KEY = 'bm_69:measure_strict';
const MEASURE_STRICT_TILT_DEG = 8;
const REGION_FILE_MAP = {
  '台北市': 'prices-taipei.json',
  '新北市': 'prices-newtaipei.json',
  '桃園市': 'prices-taoyuan.json',
  '台中市': 'prices-taichung.json',
  '台南市': 'prices-tainan.json',
  '高雄市': 'prices-kaohsiung.json'
};
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
  strictBlocks: 0
};

// 載入資料（保留 8.0 / 7.0 相容）
let list = [];
try {
  const storedData = localStorage.getItem(STORAGE_KEY);
  if (storedData) {
    const parsed = JSON.parse(storedData);
    if (parsed && parsed.version && (parsed.version.startsWith('8.0') || parsed.version.startsWith('7.0'))) {
      list = (parsed.data || []).filter(item => item && item.source !== 'warroom');
    } else {
      // 舊格式：直接儲存陣列
      list = (Array.isArray(parsed) ? parsed : []).filter(item => item && item.source !== 'warroom');
    }
  }
} catch (e) {
  console.error('資料解析失敗', e);
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
const COACH_GUIDE_STEPS = [
  { selector: '#regionSelect', message: '第 1 步：先選地區價目來源，確保抓到正確單價。' },
  { selector: '#materialSearch', message: '第 2 步：輸入關鍵字搜尋材料，例如模板、混凝土、鋼筋。' },
  { selector: 'button[onclick="applySelectedMaterialPrice()"]', message: '第 3 步：把材料單價套用到單價欄，省去手動輸入。' },
  { selector: '#fileInput', message: '第 4 步：上傳圖紙，接著用定比例與量測取得尺寸。' },
  { selector: '#stakePrecisionE', message: '第 5 步：設定 E/N/H 小數位與座標系統（TWD97/67）。' },
  { selector: 'button[onclick="solveDistanceAndAzimuth()"]', message: '第 6 步：先跑兩點距離/方位角，快速做放樣檢核。' },
  { selector: 'button[onclick="solvePolarStakeout()"]', message: '第 7 步：用極座標放樣算目標點，再加入放樣點表。' },
  { selector: 'button[onclick="solveIntersectionPoint()"]', message: '第 8 步：需要時可用交會法解第三點，再檢查幾何弱化提示。' },
  { selector: 'button[onclick="solveTraverseClosure()"]', message: '第 9 步：跑導線閉合差，查看等級與配賦建議。' },
  { selector: '.btn-add', message: '第 10 步：計算確認後加入清單，最後匯出報表。' }
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
let blueprintPanState = { active: false, lastX: 0, lastY: 0, moved: false };
let blueprintPinchState = { active: false, startDistance: 0, startZoom: 1 };
let blueprintTapState = { lastAt: 0, lastX: 0, lastY: 0 };
let aiCoachState = { enabled: false, busy: false };
let bluetoothDevice = null;
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

// --- 圖紙測量模組 ---
const AUTO_INTERPRET_GATE_DEFAULT_CONFIDENCE = 0.6;
let autoInterpretBusy = false;
let autoInterpretRunSeq = 0;
let autoInterpretLastReport = null;
let autoInterpretNeedsReview = false;
let autoInterpretGateReason = '';

// ==========================================
// 👁️ 終極黑科技二：邊緣 AI 視覺自動點料 (TensorFlow.js)
// ==========================================
let edgeAiVisionRunning = false;
let edgeAiCocoModel = null;
let edgeAiDetectBusy = false;
let edgeAiSafetyTimer = null;

initV80BootstrapBindings();
