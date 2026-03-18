// Device integration and edge AI utilities (v8.0).
(function attachV80DeviceAiModule(global) {
  async function connectLaserRuler() {
    if (!featureFlags.laser) {
      return showToast('雷射尺功能目前已停用（請先到總控開啟）');
    }
    if (laserConnectInProgress) return showToast('雷射尺連線中，請稍候');

    // 1. 檢查瀏覽器是否支援
    if (!navigator.bluetooth) {
      return showToast('⚠️ 你的瀏覽器不支援藍牙 API（建議使用 Android Chrome）');
    }

    try {
      laserConnectInProgress = true;
      showToast('🔍 尋找藍牙設備中...（請在彈出視窗選擇設備）');

      // 2. 喚起藍牙配對視窗
      bluetoothDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['generic_access']
      });

      const deviceName = bluetoothDevice && bluetoothDevice.name ? bluetoothDevice.name : '未知設備';
      laserRulerMode = 'real';
      stopLaserRuler(false);
      showToast(`🔗 已連線雷射尺：${deviceName}（真機模式待接通訊協定）`);
      applyFeatureControlStatus();
    } catch (error) {
      console.error('藍牙連線錯誤:', error);
      showToast('❌ 藍牙連線取消或失敗');
    } finally {
      laserConnectInProgress = false;
    }
  }

  function stopLaserRuler(withToast = true) {
    if (bluetoothDevice && bluetoothDevice.gatt && bluetoothDevice.gatt.connected) {
      try { bluetoothDevice.gatt.disconnect(); } catch (_e) {}
    }
    laserRulerMode = 'real';
    if (withToast) showToast('雷射尺連線已中斷');
    applyFeatureControlStatus();
  }

  function startVoiceAgent() {
    if (!featureFlags.voice) {
      return showToast('語音助理目前已停用（請先到總控開啟）');
    }
    // 1. 喚醒瀏覽器語音辨識引擎
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return showToast('⚠️ 你的瀏覽器不支援語音辨識（建議使用手機版 Chrome 或 Safari）');
    }
    if (voiceAgentListening) {
      return showToast('🎙️ 語音助理正在聆聽中...');
    }

    if (!voiceRecognition) voiceRecognition = new SpeechRecognition();
    const recognition = voiceRecognition;
    recognition.lang = 'zh-TW';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = function () {
      voiceAgentListening = true;
      showToast('🎙️ 助理聆聽中...（請說：長度 5 寬度 3 高度 2）');
    };

    // 2. 聽完後把句子交給 AI 幽靈之手
    recognition.onresult = function (event) {
      const speechResult = String(event && event.results && event.results[0] && event.results[0][0]
        ? event.results[0][0].transcript
        : '').trim();
      if (!speechResult) return showToast('⚠️ 沒有辨識到語音內容');
      showToast(`🗣️ 你說了：「${speechResult}」`);
      parseSpeechToDimensions(speechResult);
    };

    recognition.onerror = function (event) {
      showToast(`❌ 語音辨識錯誤：${event && event.error ? event.error : 'unknown'}`);
    };

    recognition.onend = function () {
      voiceAgentListening = false;
      if (voiceGuardTimer) {
        clearTimeout(voiceGuardTimer);
        voiceGuardTimer = null;
      }
    };

    // 啟動麥克風
    try {
      recognition.start();
      if (voiceGuardTimer) clearTimeout(voiceGuardTimer);
      voiceGuardTimer = setTimeout(() => {
        if (!voiceAgentListening) return;
        try { recognition.stop(); } catch (_e) {}
        voiceAgentListening = false;
        showToast('⚠️ 語音聆聽逾時，請再試一次');
      }, 12000);
    } catch (_e) {
      showToast('⚠️ 語音助理忙碌中，請稍候重試');
    }
  }

  // 3. AI 幽靈之手：拆解語句並自動填入尺寸
  function parseSpeechToDimensions(text) {
    const speech = String(text || '');
    const numbers = speech.match(/\d+(\.\d+)?/g) || [];
    const extractByKeywords = (keys) => {
      for (const key of keys) {
        const match = speech.match(new RegExp(`${key}\\s*(\\d+(?:\\.\\d+)?)`, 'i'));
        if (match && match[1]) return match[1];
      }
      return '';
    };

    const v1Value = extractByKeywords(['長', '長度', '長邊', 'A']);
    const v2Value = extractByKeywords(['寬', '寬度', '短邊', '寬邊', 'B']);
    const v3Value = extractByKeywords(['高', '高度', '深', '厚', '厚度', 'H']);
    const qtyValue = extractByKeywords(['數量', '幾個', '幾支', '幾條', 'N']);

    if (numbers.length >= 1 || v1Value || v2Value || v3Value || qtyValue) {
      const v1 = document.getElementById('v1');
      const v2 = document.getElementById('v2');
      const v3 = document.getElementById('v3');
      const qty = document.getElementById('qty');

      // 優先採關鍵詞映射，沒有才依序回填
      if (v1) v1.value = v1Value || numbers[0] || v1.value;
      if (v2) v2.value = v2Value || numbers[1] || v2.value;
      if (v3) v3.value = v3Value || numbers[2] || v3.value;
      if (qty && qtyValue) qty.value = qtyValue;
      setTimeout(() => {
        showToast('✨ AI 代理已幫您填妥尺寸！');
        previewCalc();
      }, 800);
      return;
    }
    setTimeout(() => {
      showToast('⚠️ 聽不懂裡面的數字，請再試一次（例如：長度 3.5 寬 2）');
    }, 800);
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    clickPoints = [];
    drawMode = 'none';
    syncMobileMeasureModeUI();
    if (typeof updateCanvasVisualAids === 'function') updateCanvasVisualAids();
    showToast('🧽 畫布已擦乾淨！');
  }

  function removeLoadedImage() {
    if (!img.src) return showToast('目前沒有已上傳圖紙');
    img.removeAttribute('src');
    img.style.width = '';
    img.style.height = '';
    img.style.filter = '';
    canvas.width = 0;
    canvas.height = 0;
    canvas.style.width = '';
    canvas.style.height = '';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    clickPoints = [];
    drawMode = 'none';
    syncMobileMeasureModeUI();
    scalePixelsPerUnit = 0;
    document.getElementById('scale-info').innerText = '比例: 未設定';
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
    const zoomInfo = document.getElementById('zoom-info');
    if (zoomInfo) zoomInfo.innerText = '縮放: 100%';
    const qualityInfo = document.getElementById('blueprint-quality-info');
    if (qualityInfo) {
      qualityInfo.innerText = '圖紙品質: 待檢查';
      qualityInfo.style.color = '#c7d6e6';
    }
    updateBlueprintAutoInterpretStatus('自動判讀: 尚未執行', '#bfe7ff');
    reset3DView(true);
    if (typeof updateCanvasVisualAids === 'function') updateCanvasVisualAids();
    showToast('已移除上傳圖紙');
  }

  async function startEdgeAIVision() {
    if (!featureFlags.aiVision) {
      return showToast('AI 視覺盤點目前已停用（請先到總控開啟）');
    }
    if (edgeAiVisionRunning) return showToast('AI 視覺已啟動中');
    edgeAiVisionRunning = true;
    edgeAiDetectBusy = false;
    showToast('⚙️ 正在呼叫 Google AI 視覺神經網路 (初次載入需數秒)...');

    // 1. 動態將 TensorFlow.js 與 COCO-SSD 視覺模型注入到你的網頁中
    try {
      if (!window.cocoSsd) {
        await loadExternalScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs');
        await loadExternalScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd');
      }

      showToast('👁️ AI 模型就緒！正在啟動視覺掃描...');

      // 2. 開啟手機後置鏡頭
      const aiVideo = document.createElement('video');
      aiVideo.id = 'aiVisionVideo';
      aiVideo.setAttribute('playsinline', 'true');
      aiVideo.autoplay = true;
      aiVideo.muted = true;
      aiVideo.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; object-fit:cover; z-index:99998;';
      document.body.appendChild(aiVideo);

      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      aiVideo.srcObject = stream;
      await aiVideo.play();

      // 3. 建立科幻感十足的掃描 UI
      const overlay = document.createElement('div');
      overlay.id = 'aiVisionOverlay';
      overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; background: rgba(156, 39, 176, 0.15); backdrop-filter: blur(2px);';
      overlay.innerHTML = `
                <div style="border: 3px dashed #e040fb; width: 80%; height: 50%; display:flex; align-items:center; justify-content:center; box-shadow: 0 0 30px #e040fb inset; position: relative;">
                    <div style="position:absolute; top:-15px; background:#e040fb; color:#fff; padding:5px 15px; border-radius:10px; font-weight:bold; letter-spacing:1px;">AI 點料區域</div>
                </div>
                <button id="captureAIBtn" style="margin-top: 40px; padding: 15px 40px; background: #e040fb; color: #fff; font-size: 1.3em; border-radius: 50px; font-weight:900; border:none; box-shadow: 0 4px 20px rgba(224, 64, 251, 0.6);">📸 鎖定並盤點數量</button>
                <button onclick="stopEdgeAIVision()" style="margin-top: 20px; padding: 10px 30px; background: rgba(0,0,0,0.6); color: white; border-radius: 50px; border:1px solid #fff;">取消</button>
            `;
      document.body.appendChild(overlay);

      // 4. 喚醒 AI 模型
      if (!edgeAiCocoModel) edgeAiCocoModel = await cocoSsd.load();

      // 5. 按下拍照鈕，AI 瞬間運算
      const captureBtn = document.getElementById('captureAIBtn');
      if (captureBtn) {
        captureBtn.onclick = async () => {
          if (edgeAiDetectBusy) return showToast('AI 盤點運算中，請稍候...');
          edgeAiDetectBusy = true;
          try {
            showToast('🧠 本機 AI 算力飆升中，分析畫面...');
            const predictions = await edgeAiCocoModel.detect(aiVideo);
            const classFilterInput = document.getElementById('aiVisionClassFilter');
            const classWhiteList = String(classFilterInput && classFilterInput.value ? classFilterInput.value : '')
              .split(',')
              .map(s => s.trim().toLowerCase())
              .filter(Boolean);

            // 統計畫面中的物件數量（信心門檻 + 可選白名單）
            const filtered = (Array.isArray(predictions) ? predictions : []).filter(p => {
              const okScore = Number(p && p.score) >= EDGE_AI_MIN_SCORE;
              if (!okScore) return false;
              if (!classWhiteList.length && !EDGE_AI_ALLOWED_CLASSES.length) return true;
              const cls = String(p.class || '').toLowerCase();
              const sourceList = classWhiteList.length ? classWhiteList : EDGE_AI_ALLOWED_CLASSES;
              return sourceList.includes(cls);
            });
            const objectCount = filtered.length;
            if (objectCount > 0) {
              showToast(`✅ AI 盤點完成：畫面中共有 ${objectCount} 個物件（門檻 ${EDGE_AI_MIN_SCORE}）！`);
              const qtyInput = document.getElementById('qty');
              if (qtyInput) qtyInput.value = objectCount;
              previewCalc();
              stopEdgeAIVision();
            } else {
              showToast('⚠️ 畫面中未偵測到明顯物件，請稍微拉遠或靠近重試');
            }
          } finally {
            edgeAiDetectBusy = false;
          }
        };
      }
      if (edgeAiSafetyTimer) clearTimeout(edgeAiSafetyTimer);
      edgeAiSafetyTimer = setTimeout(() => {
        if (!edgeAiVisionRunning) return;
        showToast('⚠️ AI 視覺逾時自動關閉，請重試');
        stopEdgeAIVision();
      }, 120000);
    } catch (err) {
      console.error('相機啟動失敗:', err);
      showToast('❌ 無法啟動相機，請確認瀏覽器已允許相機權限');
      stopEdgeAIVision();
    }
  }

  // 關閉相機模組的清理程式
  function stopEdgeAIVision() {
    const video = document.getElementById('aiVisionVideo');
    if (video && video.srcObject) {
      const tracks = video.srcObject.getTracks ? video.srcObject.getTracks() : [];
      tracks.forEach(t => t.stop());
    }
    if (video) video.remove();
    const overlay = document.getElementById('aiVisionOverlay');
    if (overlay) overlay.remove();
    edgeAiVisionRunning = false;
    edgeAiDetectBusy = false;
    if (edgeAiSafetyTimer) {
      clearTimeout(edgeAiSafetyTimer);
      edgeAiSafetyTimer = null;
    }
  }

  // 工具函數：動態載入外部腳本
  function loadExternalScript(src) {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  global.connectLaserRuler = connectLaserRuler;
  global.stopLaserRuler = stopLaserRuler;
  global.startVoiceAgent = startVoiceAgent;
  global.parseSpeechToDimensions = parseSpeechToDimensions;
  global.clearCanvas = clearCanvas;
  global.removeLoadedImage = removeLoadedImage;
  global.startEdgeAIVision = startEdgeAIVision;
  global.stopEdgeAIVision = stopEdgeAIVision;
  global.loadExternalScript = loadExternalScript;
})(window);
