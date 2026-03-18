// App bootstrap, resilience, and feature-control core module (v8.0).
(function attachV80AppCoreModule(global) {
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
    const saveDataEnabled = !!(connection && connection.saveData);
    const effectiveType = connection && typeof connection.effectiveType === 'string'
      ? connection.effectiveType
      : '';
    const isSlowNetwork = saveDataEnabled || effectiveType.includes('2g') || effectiveType === 'slow-2g';

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

  async function initMaterialCatalog() {
    const savedRegion = localStorage.getItem(REGION_STORAGE_KEY);
    if (savedRegion) {
      currentRegionLabel = savedRegion;
      currentRegionMode = '手動';
      const selector = document.getElementById('regionSelect');
      if (selector) selector.value = savedRegion;
    } else {
      const detected = await detectRegionFromDevice();
      if (detected) {
        currentRegionLabel = detected;
        currentRegionMode = '自動';
        const selector = document.getElementById('regionSelect');
        if (selector) selector.value = 'auto';
      }
    }
    materialCatalog = await loadMaterialCatalog(currentRegionLabel);
    renderMaterialOptions(materialCatalog);
    updateMaterialChips(materialCatalog.length, null);
    updateRegionChip();
    updateMaterialSourceChip();
    await refreshSiteWeather(true);
    startSiteWeatherAutoRefresh();
    initBimRuleEditor();
  }

  function initUtilityWidgets() {
    initQuantumTokenField();
    if (typeof initSurveyToolkit === 'function') initSurveyToolkit();
    if (typeof renderLayoutQaProfileSummary === 'function') renderLayoutQaProfileSummary();
    if (typeof renderEnterpriseQaStatus === 'function') renderEnterpriseQaStatus(null, null);
    renderUnmatchedMaterialOptions();
    renderUnmatchedWizard();
    initUnitSelectors();
    initMemberManager();
    loadAuditLogs();
    renderAuditTable();
    loadSnapshots();
    renderSnapshotTable();
  }

  window.onload = async function onWindowLoaded() {
    applyNetworkLiteMode();
    registerServiceWorker();
    const canStart = await bootstrapSecurity();
    if (!canStart) return;
    await startApp();
  };

  global.safeToast = safeToast;
  global.updateLaserChaosChip = updateLaserChaosChip;
  global.safeStorage = safeStorage;
  global.initGlobalErrorGuards = initGlobalErrorGuards;
  global.fetchWithRetry = fetchWithRetry;
  global.enterSafeMode = enterSafeMode;
  global.startMainThreadWatchdog = startMainThreadWatchdog;
  global.bindLifecycleResilience = bindLifecycleResilience;
  global.applyNetworkLiteMode = applyNetworkLiteMode;
  global.registerServiceWorker = registerServiceWorker;
  global.runWhenIdle = runWhenIdle;
  global.startApp = startApp;
  global.runDeferredBootTasks = runDeferredBootTasks;
  global.getCurrentExpectedInput = getCurrentExpectedInput;
  global.focusNextInputField = focusNextInputField;
  global.clearUrlParam = clearUrlParam;
  global.hydrateInputFromUrlParam = hydrateInputFromUrlParam;
  global.loadDemoMode = loadDemoMode;
  global.setWorkMode = setWorkMode;
  global.applyWorkMode = applyWorkMode;
  global.loadFeatureFlags = loadFeatureFlags;
  global.saveFeatureFlags = saveFeatureFlags;
  global.loadWarRoomRowVisibility = loadWarRoomRowVisibility;
  global.applyFeatureControlStatus = applyFeatureControlStatus;
  global.toggleFeatureFlag = toggleFeatureFlag;
  global.toggleDemoMode = toggleDemoMode;
  global.stopAllRealtimeFeatures = stopAllRealtimeFeatures;
  global.runQaStressNetworkProbe = runQaStressNetworkProbe;
  global.startQaStressTest = startQaStressTest;
  global.stopQaStressTest = stopQaStressTest;
  global.toggleQaStressTest = toggleQaStressTest;
  global.runChaosMonkeyTick = runChaosMonkeyTick;
  global.startChaosMonkey = startChaosMonkey;
  global.stopChaosMonkey = stopChaosMonkey;
  global.toggleChaosMonkey = toggleChaosMonkey;
  global.resetLaserChaosStats = resetLaserChaosStats;
  global.isDevHost = isDevHost;
  global.hashTextSHA256 = hashTextSHA256;
  global.initMaterialCatalog = initMaterialCatalog;
  global.initUtilityWidgets = initUtilityWidgets;
})(window);
