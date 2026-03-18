// AI coach, UI modes, war room, and mobile utility module (v8.0).
(function attachV80UiCoachModule(global) {
  function initTouchCoach() {
    applyCoachMode();
    applyAiCoachMode();
    if (localStorage.getItem(COACH_DISABLED_KEY) === '1') return;
    if (!coachBound) {
      document.addEventListener('click', handleCoachInteraction, true);
      document.addEventListener('touchstart', handleCoachInteraction, { passive: true, capture: true });
      const aiInput = document.getElementById('coachAiInput');
      if (aiInput) {
        aiInput.addEventListener('keydown', ev => {
          if (ev.key === 'Enter') askAiCoachManual();
        });
      }
      coachBound = true;
    }
    setTimeout(() => {
      speakCoach('點任何功能框，我都會即時告訴你用途與下一步。');
    }, 550);
  }

  function maybeStartCoachGuide() {
    const disabled = localStorage.getItem(COACH_DISABLED_KEY) === '1';
    const done = localStorage.getItem(COACH_GUIDE_DONE_KEY) === '1';
    if (disabled || done) return;
    setTimeout(() => startCoachGuide(false), 1000);
  }

  function getAiCoachConfig() {
    return {
      endpoint: localStorage.getItem(AI_COACH_ENDPOINT_KEY) || 'https://api.openai.com/v1/chat/completions',
      model: localStorage.getItem(AI_COACH_MODEL_KEY) || 'gpt-4o-mini',
      apiKey: localStorage.getItem(AI_COACH_API_KEY) || ''
    };
  }

  function isAiCoachAllowedForCurrentLevel() {
    const level = getCurrentUserLevel();
    return level === 'standard' || level === 'pro';
  }

  function applyAiCoachMode() {
    const allowedForLevel = isAiCoachAllowedForCurrentLevel();
    aiCoachState.enabled = AI_API_ENABLED && allowedForLevel && localStorage.getItem(AI_COACH_ENABLED_KEY) === '1';
    const btn = document.getElementById('aiCoachToggle');
    const askBtn = document.getElementById('coachAiAskBtn');
    const askInput = document.getElementById('coachAiInput');
    if (btn) btn.innerText = !allowedForLevel
      ? 'AI解說: 限會員2/3'
      : (AI_API_ENABLED
        ? (aiCoachState.enabled ? 'AI解說: 開' : 'AI解說: 關')
        : 'AI解說: 停用');
    if (askBtn) askBtn.disabled = !aiCoachState.enabled || aiCoachState.busy;
    if (askInput) askInput.disabled = !aiCoachState.enabled;
  }

  async function toggleAiCoachMode() {
    if (!isAiCoachAllowedForCurrentLevel()) {
      aiCoachState.enabled = false;
      applyAiCoachMode();
      return showToast('AI 解說僅開放會員2/會員3使用');
    }
    if (!AI_API_ENABLED) {
      localStorage.setItem(AI_COACH_ENABLED_KEY, '0');
      aiCoachState.enabled = false;
      applyAiCoachMode();
      return showToast('AI API 已停用');
    }
    const next = !aiCoachState.enabled;
    if (next) {
      localStorage.setItem(AI_COACH_ENABLED_KEY, '1');
      if (!localStorage.getItem(AI_COACH_MODEL_KEY)) localStorage.setItem(AI_COACH_MODEL_KEY, 'gpt-4o-mini');
      // 開啟 AI 時同步開啟解說員，避免「AI 開了但點擊無回應」的誤解。
      if (localStorage.getItem(COACH_DISABLED_KEY) === '1') {
        localStorage.setItem(COACH_DISABLED_KEY, '0');
        applyCoachMode();
        initTouchCoach();
      }
      applyAiCoachMode();
      speakCoach('AI 解說員已開啟（免解鎖模式）。你可直接在泡泡下方輸入問題。');
      return showToast('AI 解說員已開啟（免解鎖）');
    }
    localStorage.setItem(AI_COACH_ENABLED_KEY, '0');
    applyAiCoachMode();
    showToast('AI 解說員已關閉');
  }

  async function askAiCoach(promptText) {
    if (!AI_API_ENABLED) throw new Error('AI API disabled');
    const config = getAiCoachConfig();
    if (!config.apiKey) {
      // 免解鎖模式：未設定 API Key 時，回退到本機提示，不阻斷操作流程。
      return '目前為免解鎖模式（未設定 API Key）。已切換為本機解說：請先確認地區價目、再輸入尺寸與數量，最後檢查即時小計。';
    }
    aiCoachState.busy = true;
    applyAiCoachMode();
    try {
      const res = await fetchWithRetry(
        config.endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
          },
          body: JSON.stringify({
            model: config.model,
            temperature: 0.2,
            messages: [
              {
                role: 'system',
                content: '你是 Construction Master 工程估算助手，請用繁體中文、短句、可操作步驟回答。'
              },
              {
                role: 'user',
                content: promptText
              }
            ]
          })
        },
        { retries: 1, timeoutMs: 15000 }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const text = data && data.choices && data.choices[0] && data.choices[0].message
        ? String(data.choices[0].message.content || '').trim()
        : '';
      if (!text) throw new Error('AI 回應為空');
      return text;
    } finally {
      aiCoachState.busy = false;
      applyAiCoachMode();
    }
  }

  function getTargetBrief(target) {
    const id = target.id ? `#${target.id}` : '';
    const tag = String(target.tagName || '').toLowerCase();
    const text = String((target.innerText || target.value || target.placeholder || '')).trim().slice(0, 40);
    return `${tag}${id}${text ? ` (${text})` : ''}`;
  }

  async function askAiCoachFromTarget(target) {
    if (!aiCoachState.enabled || aiCoachState.busy) return;
    const brief = getTargetBrief(target);
    const promptText = `使用者剛點擊介面元素：${brief}。請用 2~4 句說明用途、何時用、下一步。`;
    speakCoach('AI 解說中，請稍候...');
    try {
      const answer = await askAiCoach(promptText);
      speakCoach(answer);
    } catch (e) {
      console.warn('AI 解說失敗', e);
      showToast('AI 解說暫時不可用（可先用內建解說）');
    }
  }

  async function askAiCoachManual() {
    if (!aiCoachState.enabled) return showToast('請先開啟 AI 解說員');
    if (aiCoachState.busy) return showToast('AI 正在回覆中，請稍候');
    const input = document.getElementById('coachAiInput');
    const q = String((input && input.value) || '').trim();
    if (!q) return showToast('請先輸入你想問的問題');
    speakCoach('AI 回覆中...');
    try {
      const answer = await askAiCoach(`使用者問題：${q}`);
      speakCoach(answer);
      if (input) input.value = '';
    } catch (e) {
      console.warn('AI 手動提問失敗', e);
      showToast('AI 回覆失敗，請檢查 API Key 或網路');
    }
  }

  function handleCoachInteraction(e) {
    if (localStorage.getItem(COACH_DISABLED_KEY) === '1') return;
    if (coachGuideState.active) return;
    const now = Date.now();
    if (e.type === 'touchstart') coachLastTouchAt = now;
    if (e.type === 'click' && now - coachLastTouchAt < COACH_TOUCH_TO_CLICK_GUARD_MS) return;
    if (now - coachLastInteractionAt < COACH_CLICK_THROTTLE_MS) return;
    const target = e.target;
    if (!target || !target.closest) return;
    if (target.closest('#touchCoach')) return;
    const targetSig = getTargetBrief(target);
    if (targetSig && targetSig === coachLastTargetSig && now - coachLastInteractionAt < COACH_DUPLICATE_TARGET_MS) return;
    coachLastInteractionAt = now;
    coachLastTargetSig = targetSig;

    const message = resolveCoachMessage(target);
    if (message) return speakCoach(message);
    askAiCoachFromTarget(target);
  }

  function resolveCoachMessage(target) {
    if (target.closest('#ifcInput')) return '這裡上傳模型檔，系統會做 BIM QA 解析與構件統計。';
    if (target.closest('#ifcSearch')) return '可輸入構件類型或 #ID 查詢模型，例如 牆、柱、梁、#123。';
    if (target.closest('#bimRuleIfcType')) return '先輸入構件類型，例如 牆、柱、梁。';
    if (target.closest('#bimRuleMaterial')) return '選擇要對應的材料，估價時會優先套用這條規則。';
    if (target.closest('button[onclick="saveBimRule()"]')) return '儲存規則後，BIM 自動估價會優先採用你的自訂映射。';
    if (target.closest('button[onclick="deleteBimRule()"]')) return '刪除指定構件類型的自訂規則，會回到系統預設匹配。';
    if (target.closest('button[onclick="exportBimRules()"]')) return '匯出目前 BIM 規則檔（JSON），可跨裝置共用。';
    if (target.closest('button[onclick="triggerImportBimRules()"]')) return '匯入規則檔（JSON），快速套用既有 BIM 匹配設定。';
    if (target.closest('button[onclick="resetBimRules()"]')) return '清空全部 BIM 規則，恢復系統預設匹配。';
    if (target.closest('button[onclick="generateBIMEstimate()"]')) return '依構件類型與材料單價自動產生估價預覽表。';
    if (target.closest('button[onclick="importBIMEstimateToList()"]')) return '把 BIM 估價結果一鍵匯入主清單，直接進入總價彙整。';
    if (target.closest('button[onclick="runQuantumAutoStakeLayout()"]')) return '核心自進放樣：自動執行生成點位、高精度修正、分群 QA 與放樣 QA。';
    if (target.closest('button[onclick="generateBimLayoutPoints()"]')) return '從模型自動抽取放樣點（柱心、牆端點、梁端點）。';
    if (target.closest('button[onclick="runBimLayoutQa()"]')) return '執行放樣 QA，檢查重複點、缺漏與越界，產生分數。';
    if (target.closest('button[onclick="exportBimLayoutPoints()"]')) return '匯出放樣點 CSV，可交給儀器或現場施工使用。';
    if (target.closest('button[onclick="exportBimLayoutQaReport()"]')) return '匯出放樣 QA 報告 CSV，作為交付與稽核依據。';
    if (target.closest('#bimLayoutBody')) return '這裡是放樣點預覽表，最多先顯示前 200 筆。';
    if (target.closest('#bimLayoutQaSummary')) return '這裡會顯示放樣 QA 的分數與關鍵指標。';
    if (target.closest('#bimUnmatchedType')) return '這裡列出尚未匹配的構件類型，先選一個要修正的類型。';
    if (target.closest('#bimUnmatchedMaterial')) return '這裡選要套用的材料，選好後可單筆或批次修復。';
    if (target.closest('button[onclick="applyUnmatchedRuleOnce()"]')) return '把選定材料套用到目前這個未匹配構件類型，並立即重算。';
    if (target.closest('button[onclick="applyUnmatchedRuleAll()"]')) return '把同一材料批次套用到所有未匹配構件類型，適合快速補齊規則。';
    if (target.closest('#unitFrom') || target.closest('#unitTo')) return '先選來源與目標單位，再按換算。若單位不同類型會提示不相容。';
    if (target.closest('button[onclick="runUnitConvert()"]')) return '單位換算器：先選來源/目標單位，快速核對數值是否一致。';
    if (target.closest('button[onclick="createDataSnapshot(\'手動快照\')"]')) return '手動建立版本快照，會保存規則、估價與清單狀態。';
    if (target.closest('button[onclick="rollbackLatestSnapshot()"]')) return '一鍵回到最近快照，適合誤操作後立即復原。';
    if (target.closest('button[onclick="rollbackLatestSnapshot(\'rules\')"]')) return '只回滾最近快照中的 BIM 規則，不影響主清單。';
    if (target.closest('button[onclick="rollbackLatestSnapshot(\'list\')"]')) return '只回滾最近快照中的主清單，不影響 BIM 規則。';
    if (target.closest('button[onclick="rollbackLatestSnapshot(\'estimate\')"]')) return '只回滾最近快照中的 BIM 估價表，不會改動規則與主清單。';
    if (target.closest('button[onclick="exportSnapshots()"]')) return '匯出所有快照為 JSON，可做備份或跨裝置還原。';
    if (target.closest('button[onclick="triggerImportSnapshots()"]')) return '匯入快照 JSON，把歷史版本帶回本機。';
    if (target.closest('#bimEstimateBody')) return '這裡是 BIM 估價預覽，可先確認匹配結果再匯入。';
    if (target.closest('#regionSelect')) return '可選地區價目；若地區資料筆數太少，系統會自動改用全台完整價目。';
    if (target.closest('button[onclick="autoDetectRegion()"]')) return '按這裡用定位自動判斷地區並套用價目。';
    if (target.closest('#siteWeatherInfo') || target.closest('#siteWeatherSafety') || target.closest('#siteWeatherNews')) return '這裡顯示工地即時天氣與施工建議，系統會自動更新。';
    if (target.closest('#materialSearch')) return '輸入關鍵字搜尋材料，例如：模板、混凝土、鋼筋。';
    if (target.closest('#materialSelect')) return '從清單挑選材料，右側會顯示目前單價與單位。';
    if (target.closest('#materialCountChip')) return '這裡顯示目前載入的價目筆數，正常應該是多筆資料。';
    if (target.closest('button[onclick="applySelectedMaterialPrice()"]')) return '把選好的材料單價帶入「單價欄」，省去手動輸入。';
    if (target.closest('#fileInput')) return '這格是圖紙上傳框：先選圖片，再做定比例與量測。';
    if (target.closest('button[onclick="changeZoom(0.2)"]')) return '放大圖面，方便點更精準的位置。';
    if (target.closest('button[onclick="changeZoom(-0.2)"]')) return '縮小圖面，方便看整體配置。';
    if (target.closest('#canvasGridSpacing') || target.closest('#canvasGridToggleBtn')) return '這裡可切換格網間距（5/10/20m）與開關，方便對照實地尺度。';
    if (target.closest('#canvasScaleLegend')) return '左下角比例尺會隨定比例與縮放更新，截圖時也可辨識尺度。';
    if (target.closest('button[onclick="toggleMeasureAssist()"]')) return '量圖輔助：只在定比例與測量時提示手機傾斜，幫你提高量圖穩定度。';
    if (target.closest('button[onclick="calibrateMeasureAssist()"]')) return '量圖校正：開始量圖前先校正，可降低手持角度偏差。';
    if (target.closest('button[onclick="toggleMeasureStrictMode()"]')) return '量圖嚴格模式：傾斜角超過門檻會暫停取點，避免誤測。';
    if (target.closest('#measureAssistInfo')) return '這裡顯示量圖輔助狀態與目前傾斜角度。';
    if (target.closest('button[onclick="toggleGyroMode()"]')) return '陀螺儀輔助：手機傾斜可控制 3D 視角，提升操作穩定度。';
    if (target.closest('button[onclick="calibrateGyroBaseline()"]')) return '校正陀螺儀：啟用後先保持手機不動 1 秒，能降低漂移誤差。';
    if (target.closest('#gyroInfo')) return '這裡顯示陀螺儀狀態：未啟用、啟用中或追蹤中。';
    if (target.closest('button[onclick="startCalibration()"]')) return '定比例功能：先點兩點，再輸入真實長度，系統就知道比例。';
    if (target.closest('button[onclick="startMeasure()"]')) return '量測功能：點起點和終點，距離會自動填入欄位。';
    if (target.closest('button[onclick="clearCanvas()"]')) return '清空目前標註線段與點位，不會刪掉你的清單資料。';
    if (target.closest('#stakePrecisionE') || target.closest('#stakePrecisionN') || target.closest('#stakePrecisionH')) return '先設定 E/N/H 小數位，可符合不同儀器與規範精度。';
    if (target.closest('#stakeCoordSystem')) return '這裡切換 TWD97 / TWD67 / 並列，方便新舊圖資對照。';
    if (target.closest('#drawingUnitSelect')) return '圖面單位可選 m 或 cm，避免比例與單位混淆。';
    if (target.closest('button[onclick="solveCoordinateInverse()"]')) return '輸入 E/N 反算圖面 X/Y，若已有控制點配準會自動套用反算矩陣。';
    if (target.closest('button[onclick="solveDistanceAndAzimuth()"]')) return '已知兩點 E/N 可算水平距離與方位角（十進制度 + DMS）。';
    if (target.closest('button[onclick="solvePolarStakeout()"]')) return '站點 + 距離 + 方位角可直接算目標點，適合全站儀流程。';
    if (target.closest('button[onclick="appendPolarResultToLayoutPoints()"]')) return '把剛算出的極座標結果加入放樣點表，後續可直接 QA/匯出。';
    if (target.closest('button[onclick="exportStakeOffsetRecord()"]')) return '匯出最新一筆支距/交會結果，含 TWD97/TWD67 對照。';
    if (target.closest('button[onclick="saveStakeProjectLocal()"]') || target.closest('button[onclick="loadStakeProjectLocal()"]')) return '可把放樣設定與點表存到本機，之後一鍵續作。';
    if (target.closest('button[onclick="exportStakeProjectJson()"]') || target.closest('button[onclick="triggerImportStakeProject()"]')) return '用 JSON 匯出/匯入完整放樣專案，可跨裝置移轉。';
    if (target.closest('#stakePointCsvFile')) return '支援匯入 點號,E,N,H CSV，若有錯會顯示行號與原因。';
    if (target.closest('button[onclick="exportStakePointsInstrument(\'leica\')"]') || target.closest('button[onclick="exportStakePointsInstrument(\'trimble\')"]') || target.closest('button[onclick="exportStakePointsInstrument(\'topcon\')"]')) return '可匯出 Leica/Trimble/Topcon 點位格式，便於儀器上機。';
    if (target.closest('#polygonPointsInput') || target.closest('button[onclick="calcPolygonAreaFromInput()"]')) return '多邊形面積會顯示順逆時針與 signed 面積，避免頂點順序誤判。';
    if (target.closest('button[onclick="solveSlopeConversion()"]')) return '坡度互算支援 1:N、% 與角度三種表示。';
    if (target.closest('button[onclick="solveSlopeTriangle()"]')) return '斜距/水平距/高差可任二求第三，對應現場量測。';
    if (target.closest('button[onclick="solveMultiSegmentSlope()"]')) return '多段坡度可一次連算各段終點高程，適合道路/排水線檢核。';
    if (target.closest('button[onclick="solveIntersectionPoint()"]')) return '交會法支援距離交會與方位交會，並提示幾何弱化風險。';
    if (target.closest('button[onclick="solveTraverseClosure()"]')) return '導線閉合差會給等級（A~D）與 Bowditch 配賦建議。';
    if (target.closest('button[onclick="runStakePointQualityChecks()"]')) return '可檢查重複點與超出台灣 TWD97 合理範圍的座標。';
    if (target.closest('button[onclick="deleteLastLayoutPoint()"]') || target.closest('button[onclick="undoLastLayoutPointDeletion()"]')) return '誤刪雷達點可復原，另支援 Ctrl+Z / Cmd+Z 快捷鍵。';
    if (target.closest('#surveyEnhancementNotes')) return '這裡列出測量加強版重點；可用新手導覽快速走一輪。';
    if (target.closest('#scale-info')) return '這裡顯示比例狀態；看到「已設」就可以開始量測。';
    if (target.closest('#project_name')) return '專案名稱欄：用來識別這次工程。';
    if (target.closest('#floor_tag')) return '樓層/分區欄：每筆項目會帶入這個位置標籤。';
    if (target.closest('#memberAccountInput')) return '輸入會員帳號（英文/數字），可為不同使用者設定各自密碼。';
    if (target.closest('#memberPasswordInput')) return '輸入會員密碼後按儲存，之後可用該帳號+密碼登入。';
    if (target.closest('button[onclick="saveMemberCode()"]')) return '儲存會員密碼（本機），建立或更新會員登入資料。';
    if (target.closest('button[onclick="deleteMemberCodeFromInput()"]')) return '刪除指定會員帳號，刪除後將不能用該帳號登入。';
    if (target.closest('#memberCodeBody')) return '這裡是目前可登入的會員帳號清單（本機儲存）。';
    if (target.closest('#coachToggle')) return '可在這裡一鍵開關解說員；開啟後點擊任何功能區都會出現說明。';
    if (target.closest('#levelBasicBtn')) return '會員1（基礎）：保留最必要功能，適合快速上手。';
    if (target.closest('#levelStandardBtn')) return '會員2（工程）：開啟量圖輔助、QA 報告與部分進階工具。';
    if (target.closest('#levelProBtn')) return '會員3（專家）：顯示完整 BIM/規則/快照等高階模組。';
    if (target.closest('#workCalcBtn')) return '計算模式：聚焦工種試算、價目套用、清單與報表輸出。';
    if (target.closest('#workStakeBtn')) return '放樣模式：聚焦模型解析、放樣點抽取、QA 檢核與放樣輸出。';
    if (target.closest('#aiCoachToggle')) return 'AI 解說員：可在規則解說外補充更彈性的操作建議（需先設定 API Key）。';
    if (target.closest('#coachAiInput')) return '你可以直接輸入問題，例如「這個按鈕怎麼用？」再按問AI。';
    if (target.closest('#coachAiAskBtn')) return '送出你輸入的問題給 AI 解說員，回覆會顯示在氣泡中。';
    if (target.closest('#coachGuideBtn')) return '點這裡可重跑新手導覽，系統會一步一步帶你操作。';
    if (target.closest('#calcType')) return '工種公式選擇區：不同工種會套不同計算公式。';
    if (target.closest('#customName')) return '自訂部位名稱：例如 C2柱、外牆A區。';
    if (target.closest('#v1')) return '尺寸欄 v1：通常是長度或規格。';
    if (target.closest('#v2')) return '尺寸欄 v2：通常是寬度或單排長度。';
    if (target.closest('#v3')) return '尺寸欄 v3：通常是高度、深度或層數。';
    if (target.closest('#qty')) return '數量欄：同一構件的重複數量。';
    if (target.closest('#unitPrice')) return '單價欄：輸入後會即時計算每筆小計。';
    if (target.closest('.preview-bar')) return '即時預覽區：顯示目前算出的數量與金額。';
    if (target.closest('.btn-add')) return '主按鈕：把目前資料加入計算清單。';
    if (target.closest('#listBody')) return '明細清單：可檢查每筆數量、單價與金額。';
    if (target.closest('.btn-export')) return '匯出按鈕：下載 Excel/CSV 報表。';
    if (target.closest('button[onclick="exportMeasureQaReport()"]')) return '匯出量圖 QA 報告：包含平均傾斜角、最大傾斜與嚴格模式擋下次數。';
    if (target.closest('.btn-clear')) return '重置按鈕：清空所有資料並重新開始。';
    if (target.closest('.footer-bar')) return '底部總覽：顯示各工種加總與總預算。';
    if (target.closest('.drawing-panel')) return '左側是圖紙操作區：上傳、定比例、量測都在這裡。';
    if (target.closest('.calc-panel')) return '右側是參數與預算區：輸入尺寸、單價並產生清單。';

    return '';
  }

  function speakCoach(message, keepOpen) {
    const coach = document.getElementById('touchCoach');
    const coachText = document.getElementById('coachText');
    if (!coach || !coachText) return;
    if (coachText.innerText !== message) coachText.innerText = message;
    coach.classList.remove('hide');

    if (coachTimer) clearTimeout(coachTimer);
    const shouldKeepOpen = !!keepOpen || coachGuideState.active;
    if (!shouldKeepOpen) {
      coachTimer = setTimeout(() => {
        coach.classList.add('hide');
      }, 4600);
    }
  }

  function hideCoach(remember) {
    const coach = document.getElementById('touchCoach');
    if (coach) coach.classList.add('hide');
    coachGuideState.active = false;
    setCoachGuidePanelVisible(false);
    if (remember) {
      localStorage.setItem(COACH_DISABLED_KEY, '1');
      applyCoachMode();
    }
  }

  function applyCoachMode() {
    const disabled = localStorage.getItem(COACH_DISABLED_KEY) === '1';
    const btn = document.getElementById('coachToggle');
    const guideBtn = document.getElementById('coachGuideBtn');
    if (btn) btn.innerText = disabled ? '解說員: 關' : '解說員: 開';
    if (guideBtn) guideBtn.disabled = disabled;
    if (disabled) {
      const coach = document.getElementById('touchCoach');
      if (coach) coach.classList.add('hide');
      coachGuideState.active = false;
      setCoachGuidePanelVisible(false);
    }
  }

  function toggleCoachMode() {
    const disabled = localStorage.getItem(COACH_DISABLED_KEY) === '1';
    localStorage.setItem(COACH_DISABLED_KEY, disabled ? '0' : '1');
    applyCoachMode();
    if (disabled) {
      initTouchCoach();
      speakCoach('解說員已開啟，點任一區塊可查看功能說明。');
      showToast('解說員已開啟');
    } else {
      showToast('解說員已關閉');
    }
  }

  function setCoachGuidePanelVisible(visible) {
    const panel = document.getElementById('coachGuidePanel');
    if (!panel) return;
    panel.classList.toggle('hide', !visible);
  }

  function getCoachGuideTarget(stepIndex) {
    const step = COACH_GUIDE_STEPS[stepIndex];
    if (!step) return null;
    return document.querySelector(step.selector);
  }

  function renderCoachGuideStep() {
    const step = COACH_GUIDE_STEPS[coachGuideState.stepIndex];
    if (!step) return;
    const stepText = document.getElementById('coachGuideStep');
    const prevBtn = document.getElementById('coachGuidePrev');
    const nextBtn = document.getElementById('coachGuideNext');
    const doneBtn = document.getElementById('coachGuideDone');
    if (stepText) stepText.innerText = `新手導覽 ${coachGuideState.stepIndex + 1}/${COACH_GUIDE_STEPS.length}`;
    if (prevBtn) prevBtn.disabled = coachGuideState.stepIndex <= 0;
    if (nextBtn) nextBtn.disabled = coachGuideState.stepIndex >= COACH_GUIDE_STEPS.length - 1;
    if (doneBtn) doneBtn.disabled = coachGuideState.stepIndex < COACH_GUIDE_STEPS.length - 1;

    speakCoach(step.message, true);
    const target = getCoachGuideTarget(coachGuideState.stepIndex);
    if (target && target.scrollIntoView) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function startCoachGuide(force) {
    if (localStorage.getItem(COACH_DISABLED_KEY) === '1') {
      if (force) showToast('請先開啟解說員，再啟動導覽');
      return;
    }
    coachGuideState.active = true;
    coachGuideState.stepIndex = 0;
    setCoachGuidePanelVisible(true);
    renderCoachGuideStep();
    if (force) showToast('已啟動新手導覽');
  }

  function prevCoachGuideStep() {
    if (!coachGuideState.active) return;
    coachGuideState.stepIndex = Math.max(0, coachGuideState.stepIndex - 1);
    renderCoachGuideStep();
  }

  function nextCoachGuideStep() {
    if (!coachGuideState.active) return;
    coachGuideState.stepIndex = Math.min(COACH_GUIDE_STEPS.length - 1, coachGuideState.stepIndex + 1);
    renderCoachGuideStep();
  }

  function finishCoachGuide() {
    coachGuideState.active = false;
    setCoachGuidePanelVisible(false);
    localStorage.setItem(COACH_GUIDE_DONE_KEY, '1');
    speakCoach('導覽完成！之後可從右上角「新手導覽」隨時重跑。');
    showToast('新手導覽已完成');
  }

  function applyContrastMode() {
    const autoEnabled = localStorage.getItem(CONTRAST_AUTO_KEY) === '1';
    if (autoEnabled) {
      const hour = new Date().getHours();
      const shouldEnable = (hour >= 18 || hour < 6);
      document.body.classList.toggle('high-contrast', shouldEnable);
      const btnAuto = document.getElementById('contrastAutoToggle');
      if (btnAuto) btnAuto.innerText = '自動: 開';
      const btnManual = document.getElementById('contrastToggle');
      if (btnManual) btnManual.innerText = shouldEnable ? '高對比: 夜間' : '高對比: 白天';
      return;
    }

    const enabled = localStorage.getItem(CONTRAST_MODE_KEY) === '1';
    document.body.classList.toggle('high-contrast', enabled);
    const btn = document.getElementById('contrastToggle');
    if (btn) btn.innerText = enabled ? '高對比: 開' : '高對比: 關';
    const btnAuto = document.getElementById('contrastAutoToggle');
    if (btnAuto) btnAuto.innerText = '自動: 關';
  }

  function toggleContrastMode() {
    localStorage.setItem(CONTRAST_AUTO_KEY, '0');
    const isEnabled = localStorage.getItem(CONTRAST_MODE_KEY) === '1';
    localStorage.setItem(CONTRAST_MODE_KEY, isEnabled ? '0' : '1');
    applyContrastMode();
    showToast(isEnabled ? '高對比模式已關閉' : '高對比模式已啟用');
  }

  function applyAutoContrastMode() {
    const autoEnabled = localStorage.getItem(CONTRAST_AUTO_KEY) === '1';
    if (!autoEnabled && localStorage.getItem(CONTRAST_AUTO_KEY) === null) {
      localStorage.setItem(CONTRAST_AUTO_KEY, '1');
    }
  }

  function toggleAutoContrastMode() {
    const autoEnabled = localStorage.getItem(CONTRAST_AUTO_KEY) === '1';
    localStorage.setItem(CONTRAST_AUTO_KEY, autoEnabled ? '0' : '1');
    applyContrastMode();
    showToast(autoEnabled ? '自動高對比已關閉' : '自動高對比已啟用（18:00-06:00）');
  }

  function applySunlightMode() {
    const enabled = localStorage.getItem(SUNLIGHT_MODE_KEY) === '1';
    document.body.classList.toggle('sunlight-readable', enabled);
    const btn = document.querySelector('#sunlightToggle span');
    if (btn) btn.textContent = `☀️ 戶外高亮：${enabled ? '開' : '關'}`;
  }

  function toggleSunlightMode() {
    const enabled = localStorage.getItem(SUNLIGHT_MODE_KEY) === '1';
    localStorage.setItem(SUNLIGHT_MODE_KEY, enabled ? '0' : '1');
    applySunlightMode();
    showToast(enabled ? '☀️ 戶外高亮已關閉' : '☀️ 戶外高亮已啟用');
  }

  function applyWarRoomStatus() {
    const btn = document.getElementById('btnWarRoom');
    if (!btn) return;
    isWarRoomActive = localStorage.getItem(WAR_ROOM_KEY) === '1';
    if (!demoModeEnabled) {
      isWarRoomActive = false;
      localStorage.setItem(WAR_ROOM_KEY, '0');
    }
    if (isWarRoomActive) {
      btn.innerText = '🌐 戰情室: LIVE';
      btn.style.color = '#fff';
      btn.style.background = '#00c853';
      btn.style.boxShadow = '0 0 15px #00e676';
      if (!warRoomTimer) startMockRemoteDataStream();
      return;
    }
    btn.innerText = '🌐 戰情室: 離線';
    btn.style.background = '';
    btn.style.color = '#00e676';
    btn.style.boxShadow = 'none';
    btn.style.borderColor = '#00e676';
  }

  function toggleWarRoom() {
    if (!featureFlags.warRoom) {
      return showToast('戰情室功能目前已停用（請先到總控開啟）');
    }
    if (!demoModeEnabled) {
      return showToast('Demo 模式已關閉，戰情室模擬協作不可啟用');
    }
    isWarRoomActive = !isWarRoomActive;
    localStorage.setItem(WAR_ROOM_KEY, isWarRoomActive ? '1' : '0');
    const btn = document.getElementById('btnWarRoom');
    if (!btn) return;

    if (isWarRoomActive) {
      btn.innerText = '🌐 連線中...';
      btn.style.background = 'rgba(0, 230, 118, 0.2)';
      btn.style.color = '#00e676';
      btn.style.boxShadow = 'none';
      showToast('🔗 正在建立 WebSocket 加密連線，連接總部伺服器...');

      if (warRoomConnectTimer) clearTimeout(warRoomConnectTimer);
      warRoomConnectTimer = setTimeout(() => {
        if (!isWarRoomActive) return;
        btn.innerText = '🌐 戰情室: LIVE';
        btn.style.color = '#fff';
        btn.style.background = '#00c853';
        btn.style.boxShadow = '0 0 15px #00e676';
        showToast('✅ 已進入數位雙生多人協作模式！等待遠端資料...');
        startMockRemoteDataStream();
        applyFeatureControlStatus();
      }, 1500);
      return;
    }

    if (warRoomConnectTimer) {
      clearTimeout(warRoomConnectTimer);
      warRoomConnectTimer = null;
    }
    if (warRoomTimer) {
      clearInterval(warRoomTimer);
      warRoomTimer = null;
    }
    warRoomList = [];
    renderTable();
    btn.innerText = '🌐 戰情室: 離線';
    btn.style.background = '';
    btn.style.color = '#00e676';
    btn.style.boxShadow = 'none';
    btn.style.borderColor = '#00e676';
    applyFeatureControlStatus();
    showToast('已中斷雲端連線，恢復單機模式');
  }

  function startMockRemoteDataStream() {
    if (!featureFlags.warRoom || !demoModeEnabled) return;
    if (warRoomTimer) clearInterval(warRoomTimer);

    const colleagues = ['B1-機電組 老王', '2F-泥作組 陳主任', '總部-採購部', 'A棟-鋼筋班 阿明'];
    const mockItems = ['預拌混凝土_3000psi', '竹節鋼筋(SD420W)', '模板工程(大樓)', '開挖土方'];

    warRoomTimer = setInterval(() => {
      if (!isWarRoomActive) return;

      const colleague = colleagues[Math.floor(Math.random() * colleagues.length)];
      const item = mockItems[Math.floor(Math.random() * mockItems.length)];
      const qty = Math.floor(Math.random() * 50) + 10;
      const price = Math.floor(Math.random() * 3000) + 500;

      const pushData = {
        floor: '☁️ 雲端',
        name: `[${colleague}] ${item}`,
        res: qty,
        up: price,
        totalCost: qty * price,
        cat: inferCategoryFromName(item),
        unit: 'M³/Kg',
        source: 'warroom'
      };

      warRoomList.unshift(pushData);
      renderTable();

      document.body.style.boxShadow = 'inset 0 0 30px rgba(0, 230, 118, 0.4)';
      setTimeout(() => { document.body.style.boxShadow = 'none'; }, 500);
      showToast(`📡 【即時同步】${colleague} 剛剛新增了 ${qty} 單位 ${item}！`);
    }, 6000);
  }

  function appendMobileTestLog(message) {
    if (!isMobileViewport()) return;
    const body = document.getElementById('mobileTestLogBody');
    if (!body) return;
    const row = document.createElement('div');
    row.className = 'mobile-test-log-item';
    const stamp = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    row.textContent = `[${stamp}] ${message}`;
    body.prepend(row);
    while (body.children.length > 24) {
      body.removeChild(body.lastChild);
    }
  }

  function toggleMobileTestLog() {
    const box = document.getElementById('mobileTestLog');
    if (!box) return;
    box.classList.toggle('collapsed');
    const btn = box.querySelector('.mobile-test-log-actions .mobile-test-log-btn');
    if (btn) btn.textContent = box.classList.contains('collapsed') ? '展開' : '收合';
  }

  function clearMobileTestLog() {
    const body = document.getElementById('mobileTestLogBody');
    if (!body) return;
    body.innerHTML = '';
    appendMobileTestLog('已清除測試紀錄');
  }

  function showToast(m) {
    const t = document.getElementById('toast');
    t.innerText = m;
    t.className = 'show';
    appendMobileTestLog(`Toast: ${m}`);
    setTimeout(() => { t.className = ''; }, 3000);
  }

  // --- 安全防護：CSV 匯出注入處理 ---
  function sanitizeCSVField(field) {
    if (typeof field !== 'string') field = String(field);
    // 如果開頭是 =, +, -, @，前面加上單引號防止 Excel 當作公式執行
    if (/^[=+\-@]/.test(field)) {
      field = `'${field}`;
    }
    // 如果內容有逗號，用雙引號包起來
    if (field.includes(',')) {
      field = `"${field}"`;
    }
    return field;
  }

  function exportToCSV() {
    if (list.length === 0) {
      return showToast('⚠️ 尚無資料可匯出！');
    }

    let csvContent = '\uFEFF樓層,工種大類,自訂項目(部位),計算數量,單位,發包單價,小計總額\n';

    list.forEach(item => {
      let catMap = { CEMENT: '混凝土', MOLD: '模板', EARTH: '土方', STEEL: '鋼筋' };
      let catName = catMap[item.cat] || item.cat;

      let sFloor = sanitizeCSVField(item.floor);
      let sName = sanitizeCSVField(item.name);

      csvContent += `${sFloor},${catName},${sName},${item.res.toFixed(2)},${item.unit},${item.up},${Math.round(item.totalCost)}\n`;
    });

    const totalMoney = document.getElementById('totalMoney').innerText.replace(/,/g, '');
    csvContent += `\n,,,,,,預估總計金額,${totalMoney}\n`;

    triggerFileDownload(
      csvContent,
      `ConstructionMaster_黑洞報表_${new Date().getTime()}.csv`,
      'text/csv;charset=utf-8;'
    );
    showToast('📥 報表已下載！');
  }

  function calcMeasureQaScore() {
    const starts = Math.max(1, measureQaStats.measureStarts || 0);
    const successRate = (measureQaStats.measureSuccess || 0) / starts;
    const avgTilt = measureQaStats.tiltSamples > 0 ? (measureQaStats.tiltSum / measureQaStats.tiltSamples) : 0;
    const strictBlocks = Number(measureQaStats.strictBlocks || 0);

    let score = 100;
    score -= Math.max(0, Math.round((1 - successRate) * 40));
    score -= Math.max(0, Math.round(Math.max(0, avgTilt - 5) * 3));
    score -= Math.min(20, strictBlocks * 2);
    return Math.max(0, Math.min(100, score));
  }

  function isMobileViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function toggleMobileFuncDrawer(forceOpen) {
    const drawer = document.getElementById('mobileFuncDrawer');
    if (!drawer || !isMobileViewport()) return;
    const next = typeof forceOpen === 'boolean' ? forceOpen : !drawer.classList.contains('open');
    drawer.classList.toggle('open', next);
    drawer.setAttribute('aria-hidden', next ? 'false' : 'true');
  }

  function updateMobileFocusLabel() {
    const label = document.querySelector('#mobileFocusBtn span');
    if (!label) return;
    const mode = localStorage.getItem(MOBILE_VIEW_MODE_KEY) || 'auto';
    const modeText = mode === 'clear' ? '釋放' : (mode === 'normal' ? '一般' : '自動');
    label.textContent = `🧲 視圖模式：${modeText}`;
  }

  function applyMobileViewMode(mode, opts = {}) {
    const normalized = (mode === 'clear' || mode === 'normal' || mode === 'auto') ? mode : 'auto';
    localStorage.setItem(MOBILE_VIEW_MODE_KEY, normalized);
    const activeMeasure = (drawMode === 'calibration' || drawMode === 'measure');
    if (normalized === 'clear') {
      document.body.classList.add('mobile-focus-mode');
    } else if (normalized === 'normal') {
      document.body.classList.remove('mobile-focus-mode');
    } else {
      document.body.classList.toggle('mobile-focus-mode', activeMeasure);
    }
    updateMobileFocusLabel();
    if (!opts.silent) {
      const text = normalized === 'clear' ? '釋放畫面' : (normalized === 'normal' ? '一般模式' : '自動釋放');
      appendMobileTestLog(`視圖模式: ${text}`);
    }
  }

  function cycleMobileViewMode() {
    const current = localStorage.getItem(MOBILE_VIEW_MODE_KEY) || 'auto';
    const next = current === 'normal' ? 'clear' : (current === 'clear' ? 'auto' : 'normal');
    applyMobileViewMode(next);
  }

  function updateMobileChaosLabel() {
    const btn = document.querySelector('#monkeyBtn span');
    if (!btn) return;
    btn.textContent = `🐒 混沌猴子：${chaosMonkeyMode ? '開' : '關'}`;
  }

  function toggleAutoMeasure() {
    if (!scalePixelsPerUnit) {
      startCalibration();
      return showToast('先完成定比例，再自動進入量測');
    }
    if (!measureAssistState.enabled) {
      toggleMeasureAssist();
    }
    startMeasure();
    showToast('📏 已啟動自動量測流程');
    toggleMobileFuncDrawer(false);
  }

  function syncMobileMeasureModeUI() {
    if (!isMobileViewport()) {
      document.body.classList.remove('mobile-measure-mode');
      return;
    }
    const activeMeasure = (drawMode === 'calibration' || drawMode === 'measure');
    document.body.classList.toggle('mobile-measure-mode', activeMeasure);
    const mode = localStorage.getItem(MOBILE_VIEW_MODE_KEY) || 'auto';
    if (mode === 'auto') {
      document.body.classList.toggle('mobile-focus-mode', activeMeasure);
    } else if (mode === 'clear') {
      document.body.classList.add('mobile-focus-mode');
    } else {
      document.body.classList.remove('mobile-focus-mode');
    }
    if (activeMeasure && mode !== 'normal') {
      const box = document.getElementById('mobileTestLog');
      if (box) box.classList.add('collapsed');
    }
  }

  function getUserLevelGuideLines(level) {
    if (level === 'pro') {
      return [
        '【會員3（專家）｜放樣說明與排查】',
        '',
        'A. 推薦操作順序',
        '1) 匯入模型檔 -> 生成放樣點',
        '2) 控制點配準（建議 3 點）',
        '3) 跑偏差熱圖 + 置信度分層',
        '4) 產生補點建議 -> 現場抽驗 -> 匯出施工包',
        '',
        'B. 專家頁常見問題',
        '• 配準後 RMS 偏高：補第3控制點，並重做配準',
        '• 熱圖偏紅偏多：先跑「強化放樣」再重跑熱圖',
        '• 高信心點太少：先做高精度修正 + 分群 QA',
        '',
        'C. 驗收門檻',
        '• RMS <= 0.05 再進場',
        '• 高信心點比例建議 >= 60%',
        '• 抽驗 5 點至少 4 點通過'
      ];
    }
    if (level === 'standard') {
      return [
        '【會員2（工程）｜放樣說明與排查】',
        '',
        'A. 推薦操作順序',
        '1) 先生成放樣點',
        '2) 做高精度修正 + 自動分群',
        '3) 執行放樣 QA',
        '4) 需要時再做控制點配準',
        '',
        'B. 工程頁常見問題',
        '• 放樣點重複：先做高精度修正',
        '• QA 分數低：先分群，再重跑 QA',
        '• 匯出前不放心：先跑偏差熱圖看紅黃綠',
        '',
        'C. 驗收門檻',
        '• QA 建議 >= A',
        '• 紅色偏差點需先處理再施工'
      ];
    }
    return [
      '【會員1（基礎）｜放樣說明與排查】',
      '',
      'A. 推薦操作順序',
      '1) 先按「產生放樣點」',
      '2) 再按「強化放樣」',
      '3) 最後按「執行放樣 QA」',
      '',
      'B. 新手頁常見問題',
      '• 沒有放樣點：先確認模型檔已載入',
      '• 點太亂：先按強化放樣',
      '• 不知道能不能施工：看 QA 等級與偏差熱圖',
      '',
      'C. 新手檢查',
      '• QA 至少 B',
      '• 紅點不多再出圖'
    ];
  }

  function showCalcResetGuide() {
    const level = getCurrentUserLevel();
    alert(getUserLevelGuideLines(level).join('\n'));
  }

  async function runMobileQuickAction(action) {
    appendMobileTestLog(`觸發功能: ${action}`);
    switch (action) {
      case 'scan':
        await autoQuantumScan();
        break;
      case 'toggle-focus':
        cycleMobileViewMode();
        break;
      case 'toggle-chaos':
        await toggleChaosMonkey();
        break;
      case 'usage-guide':
        showCalcResetGuide();
        break;
      case 'owner-lock':
        await handleOwnerLockAction();
        break;
      case 'owner-pass-change':
        await changeOwnerPassword();
        break;
      case 'measure':
        if (typeof startMeasure === 'function') startMeasure();
        break;
      case 'scale':
        if (typeof startCalibration === 'function') startCalibration();
        break;
      case 'clear':
        if (typeof clearCanvas === 'function') clearCanvas();
        break;
      case 'mode-calc':
        window.location.href = 'index.html';
        return;
      case 'mode-stake':
        window.location.href = 'stake.html';
        return;
      case 'top':
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      default:
        break;
    }
    toggleMobileFuncDrawer(false);
  }

  function initMobileFuncDrawer() {
    const drawer = document.getElementById('mobileFuncDrawer');
    if (!drawer) return;
    drawer.addEventListener('click', (event) => {
      const target = event.target.closest('[data-mobile-action]');
      if (!target) return;
      const action = target.getAttribute('data-mobile-action');
      runMobileQuickAction(action);
    });
    document.addEventListener('click', (event) => {
      if (!isMobileViewport()) return;
      if (!drawer.classList.contains('open')) return;
      if (event.target.closest('#mobileFuncDrawer')) return;
      toggleMobileFuncDrawer(false);
    });
    window.addEventListener('resize', () => {
      if (!isMobileViewport()) {
        toggleMobileFuncDrawer(false);
        document.body.classList.remove('mobile-focus-mode');
        document.body.classList.remove('mobile-measure-mode');
      }
      applyMobileViewMode(localStorage.getItem(MOBILE_VIEW_MODE_KEY) || 'auto', { silent: true });
      syncMobileMeasureModeUI();
    });
    applyMobileViewMode(localStorage.getItem(MOBILE_VIEW_MODE_KEY) || 'auto', { silent: true });
    applySunlightMode();
    syncMobileMeasureModeUI();
    updateOwnerLockButton();
    appendMobileTestLog('手機測試紀錄面板已啟用');
  }

  global.initTouchCoach = initTouchCoach;
  global.maybeStartCoachGuide = maybeStartCoachGuide;
  global.getAiCoachConfig = getAiCoachConfig;
  global.isAiCoachAllowedForCurrentLevel = isAiCoachAllowedForCurrentLevel;
  global.applyAiCoachMode = applyAiCoachMode;
  global.toggleAiCoachMode = toggleAiCoachMode;
  global.askAiCoach = askAiCoach;
  global.getTargetBrief = getTargetBrief;
  global.askAiCoachFromTarget = askAiCoachFromTarget;
  global.askAiCoachManual = askAiCoachManual;
  global.handleCoachInteraction = handleCoachInteraction;
  global.resolveCoachMessage = resolveCoachMessage;
  global.speakCoach = speakCoach;
  global.hideCoach = hideCoach;
  global.applyCoachMode = applyCoachMode;
  global.toggleCoachMode = toggleCoachMode;
  global.setCoachGuidePanelVisible = setCoachGuidePanelVisible;
  global.getCoachGuideTarget = getCoachGuideTarget;
  global.renderCoachGuideStep = renderCoachGuideStep;
  global.startCoachGuide = startCoachGuide;
  global.prevCoachGuideStep = prevCoachGuideStep;
  global.nextCoachGuideStep = nextCoachGuideStep;
  global.finishCoachGuide = finishCoachGuide;
  global.applyContrastMode = applyContrastMode;
  global.toggleContrastMode = toggleContrastMode;
  global.applyAutoContrastMode = applyAutoContrastMode;
  global.toggleAutoContrastMode = toggleAutoContrastMode;
  global.applySunlightMode = applySunlightMode;
  global.toggleSunlightMode = toggleSunlightMode;
  global.applyWarRoomStatus = applyWarRoomStatus;
  global.toggleWarRoom = toggleWarRoom;
  global.startMockRemoteDataStream = startMockRemoteDataStream;
  global.appendMobileTestLog = appendMobileTestLog;
  global.toggleMobileTestLog = toggleMobileTestLog;
  global.clearMobileTestLog = clearMobileTestLog;
  global.showToast = showToast;
  global.sanitizeCSVField = sanitizeCSVField;
  global.exportToCSV = exportToCSV;
  global.calcMeasureQaScore = calcMeasureQaScore;
  global.isMobileViewport = isMobileViewport;
  global.toggleMobileFuncDrawer = toggleMobileFuncDrawer;
  global.updateMobileFocusLabel = updateMobileFocusLabel;
  global.applyMobileViewMode = applyMobileViewMode;
  global.cycleMobileViewMode = cycleMobileViewMode;
  global.updateMobileChaosLabel = updateMobileChaosLabel;
  global.toggleAutoMeasure = toggleAutoMeasure;
  global.syncMobileMeasureModeUI = syncMobileMeasureModeUI;
  global.getUserLevelGuideLines = getUserLevelGuideLines;
  global.showCalcResetGuide = showCalcResetGuide;
  global.runMobileQuickAction = runMobileQuickAction;
  global.initMobileFuncDrawer = initMobileFuncDrawer;
})(window);
