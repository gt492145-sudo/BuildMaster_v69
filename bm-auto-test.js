(async function BM_AutoTest() {
    'use strict';

    var gate = window.__bmAutoTestGate;
    delete window.__bmAutoTestGate;
    var gateOk = gate && gate.v === 1 && typeof gate.token === 'string' && gate.token.length > 0 &&
        typeof gate.at === 'number' && gate.at <= Date.now() + 2000 && Date.now() - gate.at < 30000;
    if (!gateOk) {
        window.alert('請透過工具箱「🤖 藍圖自動測試（15 張）」啟動；不可直接載入或貼上此腳本。');
        return;
    }

    function canRunByOwnerGuard() {
        try {
            var memberAccount = sessionStorage.getItem('bm_69:member');
            if (memberAccount) {
                window.alert('此自動測試僅限管理者，會員帳號不可執行。');
                return false;
            }
            return true;
        } catch (e) {
            window.alert('權限檢查失敗，已拒絕執行自動測試。');
            return false;
        }
    }

    if (!canRunByOwnerGuard()) return;

    if (window.__bmAutoTestRunning) {
        window.alert('自動測試正在執行中，請先停止或等待完成。');
        return;
    }
    if (typeof window.stopChaosMonkey === 'function') {
        try { window.stopChaosMonkey(true); } catch (_e) {}
    }
    if (typeof window.stopQaStressTest === 'function') {
        try { window.stopQaStressTest(true); } catch (_e) {}
    }
    window.__bmAutoTestRunning = true;

    const IMAGES = [];
    for (let i = 1; i <= 15; i += 1) IMAGES.push('/test-blueprint-' + i + '.png');

    const TARGET = 95;
    const MAX_ROUNDS = 8;

    var panel = document.getElementById('bm-autotest-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'bm-autotest-panel';
        panel.style.cssText = 'position:fixed;top:10px;right:10px;width:380px;max-height:90vh;overflow-y:auto;' +
            'background:rgba(0,0,0,0.92);border:2px solid #0ff;border-radius:12px;padding:14px;z-index:999999;' +
            'font-family:monospace;font-size:13px;color:#0ff;box-shadow:0 0 30px rgba(0,255,255,0.3);';
        document.body.appendChild(panel);
    }

    var logLines = [];
    function showLog(msg, color) {
        var c = color || '#0ff';
        logLines.push('<div style="color:' + c + ';margin:2px 0;border-bottom:1px solid rgba(255,255,255,0.05);padding:2px 0;">' + msg + '</div>');
        if (logLines.length > 80) logLines.shift();
        panel.innerHTML =
            '<div style="font-size:16px;font-weight:bold;color:#fff;margin-bottom:8px;text-align:center;">' +
            '🤖 BuildMaster 自動測試（' + IMAGES.length + '張）' +
            '<br><span id="bm-at-status" style="font-size:12px;color:#ffd166;">初始化...</span>' +
            '</div>' +
            '<div id="bm-at-scores" style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px;"></div>' +
            '<div id="bm-at-progress" style="background:#1a1a2e;border-radius:6px;height:8px;margin-bottom:8px;overflow:hidden;">' +
            '<div id="bm-at-bar" style="height:100%;background:linear-gradient(90deg,#0ff,#7fff00);width:0%;transition:width 0.5s;"></div></div>' +
            '<div style="max-height:45vh;overflow-y:auto;font-size:11px;">' + logLines.join('') + '</div>';
        panel.scrollTop = panel.scrollHeight;
    }

    function setStatus(text) {
        var el = document.getElementById('bm-at-status');
        if (el) el.textContent = text;
    }

    function setProgress(pct) {
        var el = document.getElementById('bm-at-bar');
        if (el) el.style.width = Math.min(100, pct).toFixed(1) + '%';
    }

    function updateScoreDisplay(scores) {
        var el = document.getElementById('bm-at-scores');
        if (!el) return;
        function pill(label, val) {
            var n = parseInt(val, 10);
            var bg = isNaN(n) ? '#333' : n >= 95 ? '#1b5e20' : n >= 70 ? '#4a3800' : '#4a0000';
            var tc = isNaN(n) ? '#888' : n >= 95 ? '#69f0ae' : n >= 70 ? '#ffd166' : '#ff8a80';
            return '<div style="background:' + bg + ';padding:6px 8px;border-radius:6px;text-align:center;">' +
                '<div style="font-size:10px;color:#aaa;">' + label + '</div>' +
                '<div style="font-size:18px;font-weight:bold;color:' + tc + ';">' + val + '</div></div>';
        }
        el.innerHTML = pill('BIM QA', scores.bim) + pill('放樣 QA', scores.layout) +
            pill('量圖 QA', scores.measure) + pill('整體 QA', scores.overall);
    }

    var sleep = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };

    var _prompt = window.prompt;
    var _confirm = window.confirm;
    var _alert = window.alert;
    var _setWorkMode = window.setWorkMode;
    window.prompt = function(msg, def) { showLog('⚙️ prompt → ' + (def || '0'), '#888'); return def || '0'; };
    window.confirm = function() { return true; };
    window.alert = function(msg) { showLog('⚠️ ' + msg, '#ffd166'); };

    var _ensureCalc = window.ensureCalcAdvancedPageReady;
    window.ensureCalcAdvancedPageReady = function() { return true; };
    var _focusCalc = window.focusCalcAdvancedPage;
    window.focusCalcAdvancedPage = function() { try { if (_focusCalc) _focusCalc(); } catch (e) {} };
    window.setWorkMode = function(nextMode) {
        var mode = nextMode === 'stake' ? 'stake' : 'calc';
        try { localStorage.setItem('bm_69:work_mode', mode); } catch (e) {}
        try { document.body.dataset.workMode = mode; } catch (e) {}
        try {
            if (window.navigationModule && typeof window.navigationModule.applyWorkMode === 'function') {
                window.navigationModule.applyWorkMode(mode);
            } else if (typeof window.applyWorkMode === 'function') {
                window.applyWorkMode(mode);
            }
        } catch (e) {}
        showLog('🔁 切換模式(不跳頁) → ' + mode, '#9fa8da');
        return mode;
    };

    try {
        var imgEl = document.getElementById('blueprint');
        var canvasEl = document.getElementById('blueprintCanvas') || document.getElementById('drawCanvas');
        if (!imgEl) {
            showLog('❌ 找不到 #blueprint 元素', '#ff5252');
            return;
        }

    function loadTestImage(url) {
        return new Promise(function(resolve, reject) {
            var timer = setTimeout(function() { reject(new Error('timeout')); }, 20000);
            imgEl.onload = function() {
                clearTimeout(timer);
                if (canvasEl) {
                    canvasEl.width = imgEl.naturalWidth;
                    canvasEl.height = imgEl.naturalHeight;
                }
                try { if (typeof drawMode !== 'undefined') drawMode = 'none'; } catch (e) {}
                try { if (typeof fitBlueprintToViewport === 'function') fitBlueprintToViewport(); } catch (e) {}
                try { if (typeof updateBlueprintQualityStatus === 'function') updateBlueprintQualityStatus(); } catch (e) {}
                try { if (typeof syncCanvasEmptyState === 'function') syncCanvasEmptyState(); } catch (e) {}
                try { if (typeof applyImageFilter === 'function') applyImageFilter(); } catch (e) {}
                resolve();
            };
            imgEl.onerror = function() { clearTimeout(timer); reject(new Error('load error')); };
            imgEl.src = url + '?t=' + Date.now();
        });
    }

    function getScores() {
        var txt = function(id) { var e = document.getElementById(id); return e ? e.textContent : '-'; };
        return {
            bim: txt('qaLevelBim'), layout: txt('qaLevelLayout'),
            measure: txt('qaLevelMeasure'), overall: txt('qaLevelOverall'),
            memory: txt('autoInterpretMemorySummary'), qa: txt('autoInterpretQaSummary')
        };
    }

    function allAboveTarget(s) {
        var parse = function(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
        return [parse(s.bim), parse(s.layout), parse(s.measure), parse(s.overall)].every(function(v) { return v >= TARGET; });
    }

    async function safeCall(name, fn, label) {
        try {
            if (typeof fn === 'function') {
                var result = fn();
                if (result && typeof result.then === 'function') await result;
                showLog('✅ ' + label, '#69f0ae');
            } else {
                showLog('⏭️ ' + label + ' (不可用)', '#888');
            }
        } catch (e) {
            showLog('⚠️ ' + label + ': ' + e.message, '#ffd166');
        }
    }

    function resetBusy() {
        try { autoInterpretBusy = false; } catch (e) {}
        try { edgeAiDetectBusy = false; } catch (e) {}
    }

        showLog('🚀 15張圖｜自動計算＋辨識＋放樣', '#fff');
        showLog('🎯 目標 QA ≥ ' + TARGET, '#fff');
        showLog('', '#333');
        window.setWorkMode('calc');

        var bestScores = getScores();
        updateScoreDisplay(bestScores);
        var totalSteps = MAX_ROUNDS * IMAGES.length * 7;
        var currentStep = 0;

        for (var round = 1; round <= MAX_ROUNDS; round += 1) {
            showLog('', '#333');
            showLog('══════ 第 ' + round + ' / ' + MAX_ROUNDS + ' 輪 ══════', '#fff');

            for (var i = 0; i < IMAGES.length; i += 1) {
                var url = IMAGES[i];
                var tag = '[' + round + '-' + (i + 1) + ']';
                setStatus('第' + round + '輪 圖' + (i + 1) + '/' + IMAGES.length);

                showLog('📷 ' + tag + ' 載入 ' + url.split('/').pop(), '#80d8ff');
                try {
                    await loadTestImage(url);
                    showLog('✅ ' + tag + ' ' + imgEl.naturalWidth + '×' + imgEl.naturalHeight + 'px', '#69f0ae');
                    await sleep(1200);
                } catch (e) {
                    showLog('❌ ' + tag + ' 載入失敗: ' + e.message, '#ff5252');
                    currentStep += 7;
                    setProgress(currentStep / totalSteps * 100);
                    continue;
                }

                resetBusy();
                currentStep += 1;
                setProgress(currentStep / totalSteps * 100);
                await safeCall('autoInterpret', autoInterpretBlueprintAndCalculate, tag + ' 自動判讀');
                await sleep(1800);

                currentStep += 1;
                setProgress(currentStep / totalSteps * 100);
                await safeCall('approve', approveGuidedPrecisionWithCurrentValues, tag + ' 審核→記憶');
                await sleep(800);

                resetBusy();
                currentStep += 1;
                setProgress(currentStep / totalSteps * 100);
                await safeCall('guided', runGuidedPrecisionAutoInterpret, tag + ' 精準辨識');
                await sleep(2200);

                currentStep += 1;
                setProgress(currentStep / totalSteps * 100);
                await safeCall('guidedApprove', approveGuidedPrecisionWithCurrentValues, tag + ' 精準審核→記憶');
                await sleep(800);

                resetBusy();
                currentStep += 1;
                setProgress(currentStep / totalSteps * 100);
                await safeCall('ocr', readBlueprintSizeAnnotations, tag + ' OCR 柱樑標註');
                await sleep(2000);

                resetBusy();
                currentStep += 1;
                setProgress(currentStep / totalSteps * 100);
                await safeCall('bim', runAutoBlueprintPlusBIM, tag + ' BIM 串接');
                await sleep(1800);

                currentStep += 1;
                setProgress(currentStep / totalSteps * 100);
                await safeCall('bimApprove', approveGuidedPrecisionWithCurrentValues, tag + ' BIM後存記憶');
                await sleep(600);

                if (typeof runDesktopStakingPipeline === 'function') {
                    resetBusy();
                    await safeCall('stake', runDesktopStakingPipeline, tag + ' 一鍵放樣');
                    await sleep(1800);
                    await safeCall('stakeQa', runBimLayoutQa, tag + ' 放樣 QA');
                    await sleep(800);
                }

                updateScoreDisplay(getScores());
            }

            bestScores = getScores();
            updateScoreDisplay(bestScores);
            showLog('📊 輪末 BIM=' + bestScores.bim + ' 放樣=' + bestScores.layout + ' 量圖=' + bestScores.measure + ' 整體=' + bestScores.overall, '#fff');

            if (allAboveTarget(bestScores)) {
                showLog('🎉 全部達 ' + TARGET + '！', '#69f0ae');
                setStatus('✅ 達標');
                break;
            }
            await sleep(2000);
        }

        setStatus(allAboveTarget(bestScores) ? '✅ 完成' : '⏸ 結束');
        showLog('══════ 測試結束 ══════', '#fff');
    } finally {
        window.prompt = _prompt;
        window.confirm = _confirm;
        window.alert = _alert;
        window.setWorkMode = _setWorkMode;
        if (_ensureCalc) window.ensureCalcAdvancedPageReady = _ensureCalc;
        if (_focusCalc) window.focusCalcAdvancedPage = _focusCalc;
        window.__bmAutoTestRunning = false;
    }
})();
