    function ensureCoachEnabledByDefault() {
        // Keep coach enabled on every launch so reviewers/users do not need
        // to manually turn it on before following guided steps.
        if (localStorage.getItem(COACH_DISABLED_KEY) === '1') {
            localStorage.setItem(COACH_DISABLED_KEY, '0');
        }
        applyCoachMode();
    }

    function initTouchCoach() {
        ensureCoachEnabledByDefault();
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
            speakCoach('點任何功能框，我都會即時告訴你用途與下一步。先上傳圖紙，再開 3D 檢視操作圖面；新版固定規則：第1到3頁做計算，第4頁做放樣。');
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
            model: localStorage.getItem(AI_COACH_MODEL_KEY) || 'gpt-4.1-mini'
        };
    }

    function isAiCoachAllowedForCurrentLevel() {
        return hasFeatureEntitlement('aiCoach');
    }

    function applyAiCoachMode() {
        const allowedForLevel = isAiCoachAllowedForCurrentLevel();
        const backendConfigured = !!(backendSessionState.integrations && backendSessionState.integrations.aiCoachConfigured);
        aiCoachState.enabled = AI_API_ENABLED && backendConfigured && allowedForLevel && localStorage.getItem(AI_COACH_ENABLED_KEY) === '1';
        const btn = document.getElementById('aiCoachToggle');
        const askBtn = document.getElementById('coachAiAskBtn');
        const askInput = document.getElementById('coachAiInput');
        if (btn) btn.innerText = !allowedForLevel
            ? 'AI解說: 限會員3'
            : (!backendSessionState.integrations || !backendSessionState.integrations.aiCoachConfigured)
            ? 'AI解說: 後端未設'
            : (AI_API_ENABLED
            ? (aiCoachState.enabled ? 'AI解說: 開' : 'AI解說: 關')
            : 'AI解說: 停用');
        if (askBtn) askBtn.disabled = !aiCoachState.enabled || aiCoachState.busy;
        if (askInput) askInput.disabled = !aiCoachState.enabled;
    }

    async function toggleAiCoachMode() {
        if (!(await ensureFeatureAccess('aiCoach', 'AI 解說僅開放會員3（專家）使用'))) {
            aiCoachState.enabled = false;
            applyAiCoachMode();
            return;
        }
        if (!AI_API_ENABLED) {
            localStorage.setItem(AI_COACH_ENABLED_KEY, '0');
            aiCoachState.enabled = false;
            applyAiCoachMode();
            return showToast('AI API 已停用');
        }
        if (!backendSessionState.integrations || !backendSessionState.integrations.aiCoachConfigured) {
            localStorage.setItem(AI_COACH_ENABLED_KEY, '0');
            aiCoachState.enabled = false;
            applyAiCoachMode();
            return showToast('後端尚未設定 AI 代理金鑰');
        }
        const next = !aiCoachState.enabled;
        if (next) {
            localStorage.setItem(AI_COACH_ENABLED_KEY, '1');
            if (!localStorage.getItem(AI_COACH_MODEL_KEY)) localStorage.setItem(AI_COACH_MODEL_KEY, 'gpt-4.1-mini');
            // 開啟 AI 時同步開啟解說員，避免「AI 開了但點擊無回應」的誤解。
            if (localStorage.getItem(COACH_DISABLED_KEY) === '1') {
                localStorage.setItem(COACH_DISABLED_KEY, '0');
                applyCoachMode();
                initTouchCoach();
            }
            applyAiCoachMode();
            speakCoach('AI 解說員已開啟。你可直接在泡泡下方輸入問題。');
            return showToast('AI 解說員已開啟');
        }
        localStorage.setItem(AI_COACH_ENABLED_KEY, '0');
        applyAiCoachMode();
        showToast('AI 解說員已關閉');
    }

    async function askAiCoach(promptText) {
        if (!AI_API_ENABLED) throw new Error('AI API disabled');
        const config = getAiCoachConfig();
        const buildBimIfcAiContext = (questionText) => {
            const q = String(questionText || '').trim();
            const qaLevel = bimModelData ? getQaLevelByScore(calcBIMQaScore(bimModelData)) : '-';
            const qaScore = bimModelData ? calcBIMQaScore(bimModelData) : 0;
            const topTypes = bimModelData
                ? Object.entries(bimModelData.typeCounts || {})
                    .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
                    .slice(0, 10)
                    .map(([type, count]) => `${formatIfcTypeDisplay(type)}:${count}`)
                : [];
            const sampleElements = bimModelData
                ? (Array.isArray(bimModelData.elements) ? bimModelData.elements.slice(0, 8) : [])
                    .map(e => `${e.id}/${formatIfcTypeDisplay(e.type)}${e.name ? `(${e.name})` : ''}`)
                : [];
            const warnings = bimModelData
                ? (Array.isArray(bimModelData.warnings) ? bimModelData.warnings.slice(0, 6) : [])
                : [];
            const estimateRows = Array.isArray(bimEstimateRows) ? bimEstimateRows : [];
            const unmatched = estimateRows.filter(r => !r || !r.price || r.materialName === '未匹配').length;
            const estimatedTotal = estimateRows.reduce((sum, row) => sum + (Number(row && row.amount) || 0), 0);
            const ruleCount = Object.keys(bimRuleMap || {}).length;
            const floorTag = String((document.getElementById('floor_tag') && document.getElementById('floor_tag').value) || '').trim() || '未設定';
            const hasModel = !!bimModelData;

            return [
                '【BIM/IFC 專業上下文】',
                '你是 BIM/IFC 工程助理，優先依據以下模型資料回答；若資料不足，請明確指出缺什麼資料。',
                `目前問題：${q || '（未提供）'}`,
                `模型已載入：${hasModel ? '是' : '否'}`,
                `模型檔名：${hasModel ? (bimModelData.fileName || '未命名') : '未載入'}`,
                `IFC 實體總數：${hasModel ? (Number(bimModelData.totalEntities) || 0) : 0}`,
                `主要構件數：${hasModel ? (Number(bimModelData.totalElements) || 0) : 0}`,
                `BIM QA：${qaLevel} / ${qaScore}`,
                `工程量摘要：長度 ${hasModel ? Number(bimModelData.qtyLength || 0).toFixed(2) : '0.00'}、面積 ${hasModel ? Number(bimModelData.qtyArea || 0).toFixed(2) : '0.00'}、體積 ${hasModel ? Number(bimModelData.qtyVolume || 0).toFixed(2) : '0.00'}、數量 ${hasModel ? Number(bimModelData.qtyCount || 0).toFixed(2) : '0.00'}`,
                `Top IFC 類型：${topTypes.length ? topTypes.join(' | ') : '無'}`,
                `元素樣本：${sampleElements.length ? sampleElements.join(' | ') : '無'}`,
                `模型警告：${warnings.length ? warnings.join(' | ') : '無'}`,
                `估價筆數：${estimateRows.length}（未匹配 ${unmatched}）`,
                `BIM 估價總額(試算)：${Math.round(estimatedTotal).toLocaleString()} 元`,
                `自訂規則筆數：${ruleCount}`,
                `目前樓層/分區：${floorTag}`,
                `看圖記憶庫：${getAutoInterpretMemoryStore().length} 筆`,
                `最近看圖結果：${autoInterpretLastReport ? `${autoInterpretLastReport.type} / ${autoInterpretLastReport.quantity}件 / 信心 ${Math.round((Number(autoInterpretLastReport.overallConfidence) || 0) * 100)}%` : '尚無'}`,
                `最近記憶匹配：${autoInterpretLastReport && Number(autoInterpretLastReport.memorySimilarity || 0) > 0 ? `${Math.round(Number(autoInterpretLastReport.memorySimilarity || 0) * 100)}%` : '尚無'}`,
                `最近欄位 QA：${autoInterpretLastReport && autoInterpretLastReport.fieldConfidenceSummary ? autoInterpretLastReport.fieldConfidenceSummary : '尚無'}`,
                '回答規則：',
                '1) 先給結論（1~2句）；2) 再列依據（模型數字）；3) 最後給下一步（可執行按鈕/操作）。',
                '4) 若問題要求「數量/估價/風險」，務必列出對應 IFC 類型與影響。'
            ].join('\n');
        };
        if (!(await ensureFeatureAccess('aiCoach', 'AI 解說僅開放會員3（專家）使用'))) {
            throw new Error('AI coach denied');
        }
        aiCoachState.busy = true;
        applyAiCoachMode();
        try {
            const data = await apiRequest('/ai/coach', {
                method: 'POST',
                body: {
                    model: config.model,
                    prompt: promptText,
                    context: buildBimIfcAiContext(promptText)
                },
                retries: 0,
                timeoutMs: 20000
            });
            const text = data && data.answer ? String(data.answer || '').trim() : '';
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
            showToast('AI 回覆失敗，請檢查後端代理或網路');
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
        if (target.closest('#calcMeasureCluster')) return '這一組是第1到3頁的智慧量測工具：先做智慧定比例，再做智慧量圖，之後尺寸會回填到右側計算欄位。';
        if (target.closest('#calcAiVisionCluster')) return '這一組是第三頁 AI 看圖辨識：依序可做快速判讀、精準辨識、讀柱樑尺寸標註，再把結果送進自動估算。';
        if (target.closest('#calcIbmCluster')) return '這一組是第三頁 IBM 自動計算區：先做估算與匯入清單，第四頁放樣功能不會在這裡顯示。';
        if (target.closest('#stakeExecutionCluster')) return '這一組是第四頁放樣執行設定：先勾選柱、牆、梁與放樣高精度，再執行一鍵放樣流程或 IBM 雲端放樣。';
        if (target.closest('#stakeQaCluster')) return '這一組是第四頁放樣 QA 檢核：集中做控制點配準、偏差熱圖、穩定度重測、分群與放樣 QA。';
        if (target.closest('#stakeExportCluster')) return '這一組是第四頁放樣輸出與現場工具：完成 QA 後再匯出放樣點、QA 報告、施工包，或開啟補點建議與現場抽驗。';
        if (target.closest('#ifcInput')) return '這裡上傳模型檔，系統會做 BIM QA 解析與構件統計。';
        if (target.closest('#ifcSearch')) return '可輸入構件類型或 #ID 查詢模型，例如 牆、柱、梁、#123。';
        if (target.closest('#bimRuleIfcType')) return '先輸入構件類型，例如 牆、柱、梁。';
        if (target.closest('#bimRuleMaterial')) return '選擇要對應的材料，估價時會優先套用這條規則。';
        if (target.closest('button[onclick="saveBimRule()"]')) return '儲存規則後，BIM 自動估價會優先採用你的自訂映射。';
        if (target.closest('button[onclick="deleteBimRule()"]')) return '刪除指定構件類型的自訂規則，會回到系統預設匹配。';
        if (target.closest('button[onclick="exportBimRules()"]')) return '匯出目前 BIM 規則檔（JSON），可跨裝置共用。';
        if (target.closest('button[onclick="triggerImportBimRules()"]')) return '匯入規則檔（JSON），快速套用既有 BIM 匹配設定。';
        if (target.closest('button[onclick="resetBimRules()"]')) return '清空全部 BIM 規則，恢復系統預設匹配。';
        if (target.closest('button[onclick="generateBIMEstimate()"]')) return '依構件類型與材料單價自動產生 IBM/BIM 估價預覽表。';
        if (target.closest('button[onclick="importBIMEstimateToList()"]')) return '把 IBM/BIM 估價結果一鍵匯入主清單，直接進入總價彙整。';
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
        if (target.closest('#bimEstimateBody')) return '這裡是 IBM/BIM 估價預覽，可先確認匹配結果再匯入。';

        if (target.closest('#regionSelect')) return '可選地區價目；若地區資料筆數太少，系統會自動改用全台完整價目。';
        if (target.closest('button[onclick="autoDetectRegion()"]')) return '按這裡才會要求抓取目前工地，並把所在地區套用到價目與天氣。';
        if (target.closest('#siteWeatherInfo') || target.closest('#siteWeatherSafety') || target.closest('#siteWeatherNews')) return '這裡顯示工地即時天氣與施工建議，系統會自動更新。';
        if (target.closest('#materialSearch')) return '輸入關鍵字搜尋材料，例如：模板、混凝土、鋼筋。';
        if (target.closest('#materialSelect')) return '材料清單順序為：名稱、計價單位、價錢。';
        if (target.closest('#materialCountChip')) return '這裡顯示目前載入的價目筆數，正常應該是多筆資料。';
        if (target.closest('button[onclick="applySelectedMaterialPrice()"]')) return '把選好的材料單價帶入「單價欄」，省去手動輸入。';

        if (target.closest('#fileInput') || target.closest('#mobileBlueprintFileInput')) return '圖紙操作建議：先上傳圖片，確認畫面顯示圖紙後，先按「3D檢視」再做拖曳/縮放，之後再回到定比例與量測。';
        if (target.closest('#btn3D')) return '3D 檢視操作：先上傳圖紙後按這顆，單指可拖曳視角、雙指可縮放；需要定比例或量測時，再關閉 3D 回平面模式。';
        if (target.closest('button[onclick="changeZoom(0.2)"]')) return '放大圖面，方便點更精準的位置。';
        if (target.closest('button[onclick="changeZoom(-0.2)"]')) return '縮小圖面，方便看整體配置。';
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
        if (target.closest('#workCalcBtn')) return '計算模式：固定對應第1到3頁，包含工種試算、智慧量圖、AI 看圖辨識、IBM 自動估算與報表輸出。';
        if (target.closest('#workStakeBtn')) return '放樣模式：固定對應第4頁，包含模型解析、放樣點抽取、控制點配準、放樣 QA 與施工包輸出。';
        if (target.closest('#aiCoachToggle')) return 'AI 解說員：可在規則解說外補充更彈性的操作建議（需先完成後端代理設定）。';
        if (target.closest('#coachAiInput')) return '可直接問 BIM/IFC 問題，例如「IFC 裡柱有幾根？未匹配有哪些？」再按問AI。';
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
        if (target.closest('.calc-panel')) return '右側是主控制區：計算模式只顯示第1到3頁內容，放樣模式只顯示第四頁內容；兩邊現在已分開顯示。';

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
            speakCoach('解說員已開啟。新版固定規則：第1到3頁做計算，第4頁做放樣；點任一區塊可查看功能說明。');
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
        const entryChip = document.getElementById('warRoomEntryState');
        if (entryChip) {
            entryChip.innerText = isWarRoomActive ? 'LIVE 連線中' : '可立即加入';
            entryChip.classList.toggle('active', isWarRoomActive);
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
        if (btn) btn.textContent = box.classList.contains('collapsed') ? '紀錄' : '收合';
    }

    function clearMobileTestLog() {
        const body = document.getElementById('mobileTestLogBody');
        if (!body) return;
        body.innerHTML = '';
        appendMobileTestLog('已清除測試紀錄');
    }

    function showToast(m) {
        const t = document.getElementById("toast");
        t.innerText = m;
        t.className = "show";
        appendMobileTestLog(`Toast: ${m}`);
        setTimeout(() => t.className = "", 3000);
    }
    
    // --- 安全防護：CSV 匯出注入處理 ---
    function sanitizeCSVField(field) {
        if (typeof field !== 'string') field = field.toString();
        // 如果開頭是 =, +, -, @，前面加上單引號防止 Excel 當作公式執行
        if (/^[=+\-@]/.test(field)) {
            field = "'" + field;
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

        let csvContent = "\uFEFF樓層,工種大類,自訂項目(部位),基準數量,施工數量,調整係數,單位,發包單價,基準金額,施工金額\n";
        
        list.forEach(item => {
            let catMap = { 'CEMENT': '混凝土', 'MOLD': '模板', 'EARTH': '土方', 'STEEL': '鋼筋' };
            let catName = catMap[item.cat] || item.cat;
            
            let sFloor = sanitizeCSVField(item.floor);
            let sName = sanitizeCSVField(item.name);
            
            const adjustedQty = Number(item.res || 0);
            const baseQty = Number.isFinite(Number(item.baseRes)) ? Number(item.baseRes) : adjustedQty;
            const adjustFactor = Number.isFinite(Number(item.adjustFactor)) ? Number(item.adjustFactor) : 1;
            const adjustedCost = Number(item.totalCost || 0);
            const baseCost = Number.isFinite(Number(item.baseTotalCost)) ? Number(item.baseTotalCost) : adjustedCost;
            csvContent += `${sFloor},${catName},${sName},${baseQty.toFixed(2)},${adjustedQty.toFixed(2)},${adjustFactor.toFixed(3)},${item.unit},${item.up},${Math.round(baseCost)},${Math.round(adjustedCost)}\n`;
        });

        const totalMoney = document.getElementById('totalMoney').innerText.replace(/,/g, '');
        csvContent += `\n,,,,,,預估總計金額,${totalMoney}\n`;

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `ConstructionMaster_黑洞報表_${new Date().getTime()}.csv`;
        link.click();
        showToast('📥 報表已下載！');
    }

    function calcMeasureQaScore() {
        const starts = Math.max(1, measureQaStats.measureStarts || 0);
        const successRate = (measureQaStats.measureSuccess || 0) / starts;
        const avgTilt = measureQaStats.tiltSamples > 0 ? (measureQaStats.tiltSum / measureQaStats.tiltSamples) : 0;
        const strictBlocks = Number(measureQaStats.strictBlocks || 0);
        const smartSessions = Number(measureQaStats.smartSessions || 0);
        const smartCompleted = Number(measureQaStats.smartCompleted || 0);
        const smartSuccessRate = smartSessions > 0 ? (smartCompleted / smartSessions) : 1;
        const smartFallbacks = Number(measureQaStats.smartFallbacks || 0);
        const smartLowConfidence = Number(measureQaStats.smartLowConfidence || 0);

        let score = 100;
        score -= Math.max(0, Math.round((1 - successRate) * 40));
        score -= Math.max(0, Math.round(Math.max(0, avgTilt - 5) * 3));
        score -= Math.min(20, strictBlocks * 2);
        score -= Math.max(0, Math.round((1 - smartSuccessRate) * 12));
        score -= Math.min(8, smartFallbacks * 2);
        score -= Math.min(10, smartLowConfidence * 2);
        return Math.max(0, Math.min(100, score));
    }

    async function exportMeasureQaReport() {
        if (!(await ensureFeatureAccess('measureQaReport', '量圖 QA 匯出暫時不可用'))) {
            return;
        }
        let qaPayload;
        try {
            qaPayload = await apiRequest('/qa/measure', {
                method: 'POST',
                body: { measureQaStats },
                retries: 0,
                timeoutMs: 15000
            });
        } catch (error) {
            console.warn('量圖 QA 匯出失敗', error);
            return showToast((error && error.message) || '量圖 QA 匯出失敗');
        }
        const avgTilt = Number(qaPayload && qaPayload.avgTilt ? qaPayload.avgTilt : 0);
        const qaScore = Number(qaPayload && qaPayload.qaScore ? qaPayload.qaScore : 0);
        const qaLevel = qaPayload && qaPayload.qaLevel ? qaPayload.qaLevel : getQaLevelByScore(qaScore);
        const projectName = (document.getElementById('project_name') && document.getElementById('project_name').value) || '未命名專案';
        const reportRows = [
            ['報告時間', new Date().toLocaleString('zh-TW')],
            ['專案名稱', projectName],
            ['量圖輔助', measureAssistState.enabled ? '開' : '關'],
            ['量圖嚴格模式', measureAssistState.strict ? '開' : '關'],
            ['嚴格模式門檻(度)', String(MEASURE_STRICT_TILT_DEG)],
            ['定比例啟動次數', String(measureQaStats.calibrationStarts)],
            ['定比例成功次數', String(measureQaStats.calibrationSuccess)],
            ['測量啟動次數', String(measureQaStats.measureStarts)],
            ['測量完成次數', String(measureQaStats.measureSuccess)],
            ['智慧量圖啟動次數', String(measureQaStats.smartSessions || 0)],
            ['智慧量圖完成次數', String(measureQaStats.smartCompleted || 0)],
            ['智慧量圖吸附次數', String(measureQaStats.smartSnapUses || 0)],
            ['智慧量圖手動修正次數', String(measureQaStats.smartManualAdjusts || 0)],
            ['智慧量圖拖曳修正次數', String(measureQaStats.smartDragAdjusts || 0)],
            ['智慧量圖低信心回退次數', String(measureQaStats.smartFallbacks || 0)],
            ['智慧量圖低信心警示次數', String(measureQaStats.smartLowConfidence || 0)],
            ['傾斜樣本數', String(measureQaStats.tiltSamples)],
            ['平均傾斜角(度)', avgTilt.toFixed(2)],
            ['最大傾斜角(度)', measureQaStats.tiltMax.toFixed(2)],
            ['嚴格模式擋下次數', String(measureQaStats.strictBlocks)],
            ['QA分數', String(qaScore)],
            ['QA等級', qaLevel],
            ['目前傾斜角(度)', Number(measureAssistState.tiltDeg || 0).toFixed(2)],
            ['統計起算時間', new Date(measureQaStats.startedAt).toLocaleString('zh-TW')]
        ];

        let csvContent = '\uFEFF項目,數值\n';
        reportRows.forEach(([k, v]) => {
            const sk = sanitizeCSVField(k);
            const sv = sanitizeCSVField(v);
            csvContent += `${sk},${sv}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `ConstructionMaster_量圖QA報告_${new Date().getTime()}.csv`;
        link.click();
        if (typeof addAuditLog === 'function') {
            addAuditLog('匯出量圖QA報告', `等級 ${qaLevel} / 分數 ${qaScore} / 測量完成 ${measureQaStats.measureSuccess} 次`);
        }
        showToast(`🧪 量圖 QA 報告已匯出（${qaLevel} / ${qaScore}）`);
    }

    function isMobileViewport() {
        return window.matchMedia('(max-width: 768px)').matches;
    }

    function syncMobileBlueprintStatusCard() {
        const qualitySource = document.getElementById('blueprint-quality-info');
        const autoSource = document.getElementById('blueprint-auto-interpret-info');
        const qualityTarget = document.getElementById('mobileBlueprintQualityInfo');
        const autoTarget = document.getElementById('mobileBlueprintAutoInterpretInfo');
        const summary = document.getElementById('mobileBlueprintStatusSummary');
        if (!qualitySource || !autoSource || !qualityTarget || !autoTarget || !summary) return;
        qualityTarget.textContent = qualitySource.textContent || '圖紙品質: 待檢查';
        qualityTarget.style.color = qualitySource.style.color || '#c7d6e6';
        autoTarget.textContent = autoSource.textContent || '自動判讀: 尚未執行';
        autoTarget.style.color = autoSource.style.color || '#bfe7ff';
        const qualityShort = (qualityTarget.textContent || '')
            .replace(/^圖紙品質:\s*/, '')
            .replace(/（過暗）/g, '偏暗')
            .replace(/（過亮）/g, '偏亮')
            .replace(/可用/g, 'OK');
        const autoShort = (autoTarget.textContent || '')
            .replace(/^自動判讀:\s*/, '')
            .replace(/單一運算/g, '單算')
            .replace(/已完成/g, '完成')
            .replace(/尚未執行/g, '未執行');
        const compact = `${qualityShort || '待檢查'} / ${autoShort || '未執行'}`;
        summary.textContent = compact.length > 18 ? `${compact.slice(0, 17)}...` : compact;
    }

    function toggleMobileBlueprintStatusCard(forceOpen) {
        const card = document.getElementById('mobileBlueprintStatus');
        if (!card || !isMobileViewport()) return;
        const next = typeof forceOpen === 'boolean' ? forceOpen : card.classList.contains('collapsed');
        card.classList.toggle('collapsed', !next);
        card.setAttribute('aria-hidden', next ? 'false' : 'true');
        syncMobileBlueprintStatusCard();
    }

    function toggleMobileLeftDrawer(forceOpen) {
        const drawer = document.getElementById('mobileLeftDrawer');
        const tab = document.getElementById('mobileLeftTab');
        if (!drawer || !isMobileViewport()) return;
        const next = typeof forceOpen === 'boolean' ? forceOpen : !drawer.classList.contains('open');
        if (next) toggleMobileFuncDrawer(false);
        drawer.classList.toggle('open', next);
        drawer.setAttribute('aria-hidden', next ? 'false' : 'true');
        if (tab) tab.textContent = next ? '收合' : '對位';
    }

    function toggleMobileFuncDrawer(forceOpen) {
        const drawer = document.getElementById('mobileFuncDrawer');
        const tab = document.getElementById('mobileFuncTab');
        if (!drawer || !isMobileViewport()) return;
        const next = typeof forceOpen === 'boolean' ? forceOpen : !drawer.classList.contains('open');
        if (next) {
            toggleMobileLeftDrawer(false);
            const testLog = document.getElementById('mobileTestLog');
            if (testLog) testLog.classList.add('collapsed');
        }
        drawer.classList.toggle('open', next);
        drawer.setAttribute('aria-hidden', next ? 'false' : 'true');
        if (tab) tab.textContent = next ? '收合' : '功能';
    }

    function updateMobileFocusLabel() {
        const label = document.querySelector('#mobileFocusBtn span');
        if (!label) return;
        const mode = localStorage.getItem(MOBILE_VIEW_MODE_KEY) || 'normal';
        const modeText = mode === 'clear' ? '釋放' : (mode === 'normal' ? '一般' : '自動');
        label.textContent = `🧲 視圖模式：${modeText}`;
    }

    function applyMobileViewMode(mode, opts = {}) {
        const normalized = (mode === 'clear' || mode === 'normal' || mode === 'auto') ? mode : 'normal';
        localStorage.setItem(MOBILE_VIEW_MODE_KEY, normalized);
        const activeMeasure = typeof isMeasureInteractionMode === 'function'
            ? isMeasureInteractionMode(drawMode)
            : (drawMode === 'calibration' || drawMode === 'measure');
        if (normalized === 'clear') {
            document.body.classList.toggle('mobile-focus-mode', activeMeasure);
        } else if (normalized === 'normal') {
            document.body.classList.remove('mobile-focus-mode');
        } else {
            document.body.classList.toggle('mobile-focus-mode', activeMeasure);
        }
        updateMobileFocusLabel();
        if (!opts.silent) {
            const text = normalized === 'clear' ? '釋放畫面' : (normalized === 'normal' ? '一般模式' : '自動釋放');
            appendMobileTestLog(`視圖模式: ${text}`);
            if (normalized === 'clear' && !activeMeasure) {
                showToast('釋放畫面會在量測時自動生效');
            }
        }
    }

    function cycleMobileViewMode() {
        const current = localStorage.getItem(MOBILE_VIEW_MODE_KEY) || 'normal';
        const next = current === 'normal' ? 'auto' : (current === 'auto' ? 'clear' : 'normal');
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
            updateTouchInteractionMode();
            renderManualMeasurePad();
            renderManualPrecisionOverlay();
            return;
        }
        const activeMeasure = isMeasureInteractionMode(drawMode);
        document.body.classList.toggle('mobile-measure-mode', activeMeasure);
        const mode = localStorage.getItem(MOBILE_VIEW_MODE_KEY) || 'normal';
        if (mode === 'auto') {
            document.body.classList.toggle('mobile-focus-mode', activeMeasure);
        } else if (mode === 'clear') {
            document.body.classList.toggle('mobile-focus-mode', activeMeasure);
        } else {
            document.body.classList.remove('mobile-focus-mode');
        }
        if (activeMeasure && mode !== 'normal') {
            const box = document.getElementById('mobileTestLog');
            if (box) box.classList.add('collapsed');
        }
        updateTouchInteractionMode();
        renderManualMeasurePad();
        renderManualPrecisionOverlay();
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
        case 'start-bm-autotest':
            await startBmAutoTestFromUi();
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
        case 'fit-view':
            if (typeof fitBlueprintToViewport === 'function') fitBlueprintToViewport();
            break;
        case 'enhance-image':
            if (typeof autoEnhanceImage === 'function') autoEnhanceImage();
            break;
        case 'reset-image-filter':
            if (typeof resetImageFilter === 'function') resetImageFilter();
            break;
        case 'remove-image':
            if (typeof removeLoadedImage === 'function') removeLoadedImage();
            break;
        case 'mode-calc':
            setWorkMode('calc');
            break;
        case 'mode-stake':
            setWorkMode('stake');
            break;
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
        const leftDrawer = document.getElementById('mobileLeftDrawer');
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
        document.addEventListener('click', (event) => {
            if (!isMobileViewport() || !leftDrawer) return;
            if (!leftDrawer.classList.contains('open')) return;
            if (event.target.closest('#mobileLeftDrawer')) return;
            toggleMobileLeftDrawer(false);
        });
        window.addEventListener('resize', () => {
            if (!isMobileViewport()) {
                toggleMobileFuncDrawer(false);
                toggleMobileLeftDrawer(false);
                document.body.classList.remove('mobile-focus-mode');
                document.body.classList.remove('mobile-measure-mode');
            }
            applyMobileViewMode(localStorage.getItem(MOBILE_VIEW_MODE_KEY) || 'normal', { silent: true });
            syncMobileMeasureModeUI();
        });
        applyMobileViewMode(localStorage.getItem(MOBILE_VIEW_MODE_KEY) || 'normal', { silent: true });
        applySunlightMode();
        syncMobileMeasureModeUI();
        syncMobileBlueprintStatusCard();
        updateOwnerLockButton();
        appendMobileTestLog('手機測試紀錄面板已啟用');
    }

