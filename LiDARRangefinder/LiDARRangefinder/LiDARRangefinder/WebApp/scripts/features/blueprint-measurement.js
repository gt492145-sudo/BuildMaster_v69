    // --- 圖紙測量模組 (保留 V6.8 完整邏輯) ---
    var blueprintAutoCalcAfterUploadTimer = null;
    var BLUEPRINT_AUTO_CALC_AFTER_UPLOAD_KEY = 'bm_69:blueprint_auto_calc_after_upload';

    function applyBlueprintAutoCalcAfterUploadPref() {
        var el = document.getElementById('blueprintAutoCalcAfterUpload');
        if (!el) return;
        try {
            var stored = localStorage.getItem(BLUEPRINT_AUTO_CALC_AFTER_UPLOAD_KEY);
            // Default to enabled so upload immediately triggers auto calculation.
            if (stored === null) {
                el.checked = true;
                localStorage.setItem(BLUEPRINT_AUTO_CALC_AFTER_UPLOAD_KEY, '1');
            } else {
                el.checked = stored === '1';
            }
        } catch (_e) {}
    }

    function syncBlueprintAutoCalcAfterUploadPref() {
        var el = document.getElementById('blueprintAutoCalcAfterUpload');
        if (!el) return;
        try {
            localStorage.setItem(BLUEPRINT_AUTO_CALC_AFTER_UPLOAD_KEY, el.checked ? '1' : '0');
        } catch (_e) {}
    }

    function runBlueprintUploadStep(label, fn) {
        try {
            if (typeof fn === 'function') return fn();
        } catch (error) {
            console.warn('圖紙上傳後續步驟失敗', label, error);
        }
        return null;
    }

    function scheduleAutoBlueprintAutoCalcIfEnabled() {
        var toggle = document.getElementById('blueprintAutoCalcAfterUpload');
        if (!toggle || !toggle.checked) return;
        // Use both dataset and localStorage so this still works
        // even when getCurrentWorkMode is not in current scope.
        var mode = 'calc';
        try {
            if (document.body && document.body.dataset && document.body.dataset.workMode) {
                mode = document.body.dataset.workMode;
            } else if (localStorage.getItem('bm_69:work_mode')) {
                mode = localStorage.getItem('bm_69:work_mode');
            }
        } catch (_e) {}
        if (mode !== 'calc') return;
        if (blueprintAutoCalcAfterUploadTimer) clearTimeout(blueprintAutoCalcAfterUploadTimer);
        blueprintAutoCalcAfterUploadTimer = setTimeout(function() {
            blueprintAutoCalcAfterUploadTimer = null;
            // Prefer full one-click pipeline (Blueprint + IBM),
            // fallback to blueprint-only auto calc when BIM model is missing.
            if (typeof runAutoBlueprintPlusBIM === 'function') {
                Promise.resolve(runAutoBlueprintPlusBIM()).catch(function(error) {
                    console.warn('上傳後自動計算失敗', error);
                    showToast('圖紙已載入；自動計算暫時無法執行，仍可手動量測。');
                });
                return;
            }
            if (typeof autoInterpretBlueprintAndCalculate === 'function') {
                Promise.resolve(autoInterpretBlueprintAndCalculate()).catch(function(error) {
                    console.warn('上傳後自動判讀失敗', error);
                    showToast('圖紙已載入；自動判讀暫時無法執行，仍可手動量測。');
                });
            }
        }, 700);
    }

    function loadImg(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(event) {
            const dataUrl = String(event && event.target && event.target.result || '');
            if (!dataUrl) {
                showToast('照片讀取失敗，請重新選擇圖片');
                return;
            }
            currentBlueprintUploadState = {
                fileName: String(file.name || 'blueprint.png'),
                mimeType: String(file.type || 'image/png'),
                sizeBytes: Number(file.size) || 0,
                dataUrl,
                sourceType: detectBlueprintSourceType(file),
                captureMode: 'single-image'
            };
            img.onerror = function() {
                console.warn('圖紙照片解碼失敗', file);
                showToast('照片格式無法載入，請改用 JPG/PNG 或重新拍照後再上傳。');
            };
            img.src = dataUrl;
            img.onload = () => {
                try {
                    if (!img.naturalWidth || !img.naturalHeight) {
                        throw new Error('IMAGE_DIMENSION_UNAVAILABLE');
                    }
                    // Always reset interaction state on new upload to avoid being stuck
                    // in calibration/measure mode where pan gestures are disabled.
                    drawMode = 'none';
                    clickPoints = [];
                    calibrationPendingPoint = null;
                    if (manualPrecisionState) manualPrecisionState.active = false;
                    runBlueprintUploadStep('resetSmartMeasureSession', () => resetSmartMeasureSession({ preserveLastResult: false }));
                    if (blueprintPanState) blueprintPanState.active = false;
                    if (blueprintPinchState) blueprintPinchState.active = false;
                    suppressNextCanvasClick = false;
                    suppressNextCanvasTouch = false;
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    imageFilterState = { contrast: 1, brightness: 1 };
                    runBlueprintUploadStep('syncImageFilterUI', syncImageFilterUI);
                    runBlueprintUploadStep('applyImageFilter', applyImageFilter);
                    runBlueprintUploadStep('reset3DView', () => reset3DView(true));
                    runBlueprintUploadStep('syncCanvasEmptyState', syncCanvasEmptyState);
                    runBlueprintUploadStep('updateTouchInteractionMode', updateTouchInteractionMode);
                    runBlueprintUploadStep('syncMobileMeasureModeUI', syncMobileMeasureModeUI);
                    runBlueprintUploadStep('renderManualMeasurePad', renderManualMeasurePad);
                    runBlueprintUploadStep('fitBlueprintToViewport', fitBlueprintToViewport);
                    const qualityReport = runBlueprintUploadStep('updateBlueprintQualityStatus', updateBlueprintQualityStatus);
                    currentBlueprintUploadState = {
                        ...(currentBlueprintUploadState || {}),
                        width: Number(img.naturalWidth) || 0,
                        height: Number(img.naturalHeight) || 0,
                        orientation: img.naturalWidth >= img.naturalHeight ? 'landscape' : 'portrait',
                        sourceType: currentBlueprintUploadState && currentBlueprintUploadState.sourceType
                            ? currentBlueprintUploadState.sourceType
                            : detectBlueprintSourceType(file)
                    };
                    runBlueprintUploadStep('updateAutoInterpretLearningSummary', () => updateAutoInterpretLearningSummary(`後台學習：已載入 ${currentBlueprintUploadState.sourceType || 'clean-blueprint'}｜待建立任務`, '#d7e9ff'));
                    if (qualityReport && qualityReport.quality === '待重拍') {
                        showToast(`圖紙品質偏低（${qualityReport.issues.join('、')}），建議重拍再量測`);
                    } else if (qualityReport && qualityReport.quality === '可用') {
                        showToast(`圖紙已載入（${qualityReport.issues.join('、')}，可先量測）`);
                    } else {
                        showToast('圖紙載入完成，可拖曳/縮放（雙擊可回適配視圖）');
                    }
                    runBlueprintUploadStep('scheduleAutoBlueprintAutoCalcIfEnabled', scheduleAutoBlueprintAutoCalcIfEnabled);
                } catch (error) {
                    console.warn('圖紙載入後初始化失敗', error);
                    showToast('照片已載入，但部分輔助功能暫時無法初始化；仍可手動量測。');
                }
            };
        };
        reader.onerror = function() {
            console.warn('照片讀取失敗', reader.error);
            showToast('照片讀取失敗，請重新選擇圖片。');
        };
        try {
            reader.readAsDataURL(file);
        } catch (error) {
            console.warn('照片上傳啟動失敗', error);
            showToast('照片上傳失敗，請重新選擇 JPG/PNG 圖片。');
        }
    }

    function changeZoom(delta) {
        if (!img.src) return showToast('請先上傳圖紙！');
        zoomLevel = Math.max(0.2, Math.min(5, zoomLevel + delta));
        applyZoom();
    }

    function focusCalcAdvancedPage() {
        const navigationModule = window.BuildMasterNavigationModule;
        if (navigationModule && typeof navigationModule.writeStoredWorkMode === 'function') {
            navigationModule.writeStoredWorkMode('bm_69:work_mode', 'calc');
        } else {
            try {
                localStorage.setItem('bm_69:work_mode', 'calc');
            } catch (_e) {}
        }
        if (typeof applyWorkMode === 'function') applyWorkMode();
        if (typeof scrollToWorkModeSection === 'function') scrollToWorkModeSection('calc');
    }

    function ensureCalcAdvancedPageReady(missingMessage) {
        if (!document.getElementById('advAutoInterpretGate')) {
            showToast(missingMessage || '第三頁計算區尚未載入');
            return false;
        }
        focusCalcAdvancedPage();
        return true;
    }

    function setZoomAt(clientX, clientY, targetZoom) {
        if (!img.src || !canvasContainer) return;
        const oldZoom = Math.max(0.001, zoomLevel);
        const nextZoom = Math.max(0.2, Math.min(5, targetZoom));
        if (Math.abs(nextZoom - oldZoom) < 0.0001) return;
        const rect = canvasContainer.getBoundingClientRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        const anchorNaturalX = (canvasContainer.scrollLeft + localX) / oldZoom;
        const anchorNaturalY = (canvasContainer.scrollTop + localY) / oldZoom;

        zoomLevel = nextZoom;
        applyZoom();
        canvasContainer.scrollLeft = anchorNaturalX * nextZoom - localX;
        canvasContainer.scrollTop = anchorNaturalY * nextZoom - localY;
    }

    function applyZoom() {
        if (!img.src) return;
        const w = img.naturalWidth * zoomLevel;
        const h = img.naturalHeight * zoomLevel;
        img.style.width = w + 'px'; img.style.height = h + 'px';
        canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
        const smartOverlay = document.getElementById('smartMeasureOverlay');
        if (smartOverlay) {
            smartOverlay.style.width = w + 'px';
            smartOverlay.style.height = h + 'px';
        }
        const zoomInfo = document.getElementById('zoom-info');
        if (zoomInfo) zoomInfo.innerText = `縮放: ${Math.round(zoomLevel * 100)}%`;
        renderSmartMeasureOverlay();
        updateTouchInteractionMode();
    }

    function analyzeBlueprintImageQuality() {
        if (!img.src || !img.naturalWidth || !img.naturalHeight) return null;
        const maxSide = 240;
        const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(48, Math.round(img.naturalWidth * ratio));
        const h = Math.max(48, Math.round(img.naturalHeight * ratio));
        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const offCtx = off.getContext('2d', { willReadFrequently: true });
        if (!offCtx) return null;
        offCtx.drawImage(img, 0, 0, w, h);
        const imageData = offCtx.getImageData(0, 0, w, h).data;
        const gray = new Float32Array(w * h);
        let sum = 0;
        for (let i = 0, j = 0; i < imageData.length; i += 4, j += 1) {
            const g = imageData[i] * 0.299 + imageData[i + 1] * 0.587 + imageData[i + 2] * 0.114;
            gray[j] = g;
            sum += g;
        }
        const mean = sum / gray.length;
        let variance = 0;
        for (let i = 0; i < gray.length; i += 1) {
            const d = gray[i] - mean;
            variance += d * d;
        }
        variance /= gray.length;

        // Blur score by Laplacian variance: lower value means blurrier image.
        let lapSum = 0;
        let lapSqSum = 0;
        let lapCount = 0;
        for (let y = 1; y < h - 1; y += 1) {
            for (let x = 1; x < w - 1; x += 1) {
                const idx = y * w + x;
                const lap = (
                    gray[idx - w] +
                    gray[idx - 1] -
                    4 * gray[idx] +
                    gray[idx + 1] +
                    gray[idx + w]
                );
                lapSum += lap;
                lapSqSum += lap * lap;
                lapCount += 1;
            }
        }
        const lapMean = lapCount ? lapSum / lapCount : 0;
        const lapVar = lapCount ? (lapSqSum / lapCount) - lapMean * lapMean : 0;

        const tooDark = mean < 55;
        const tooBright = mean > 205;
        const lowContrast = variance < 420;
        const blurry = lapVar < 130;
        const issues = [];
        if (tooDark) issues.push('過暗');
        if (tooBright) issues.push('過曝');
        if (lowContrast) issues.push('對比不足');
        if (blurry) issues.push('模糊');
        const quality = issues.length === 0 ? '良好' : (issues.length === 1 ? '可用' : '待重拍');
        return { quality, issues, meanLuma: mean, contrastVar: variance, blurVar: lapVar };
    }

    function updateBlueprintQualityStatus() {
        const box = document.getElementById('blueprint-quality-info');
        const report = analyzeBlueprintImageQuality();
        if (!box) return report;
        if (!report) {
            box.innerText = '圖紙品質: 待檢查';
            box.style.color = '#c7d6e6';
            syncMobileBlueprintStatusCard();
            return null;
        }
        if (report.quality === '良好') {
            box.innerText = '圖紙品質: 良好 ✅';
            box.style.color = '#90f0b2';
        } else if (report.quality === '可用') {
            box.innerText = `圖紙品質: 可用（${report.issues.join('、')}）`;
            box.style.color = '#ffd48a';
        } else {
            box.innerText = `圖紙品質: 待重拍（${report.issues.join('、')}）`;
            box.style.color = '#ff9a9a';
        }
        syncMobileBlueprintStatusCard();
        return report;
    }

    function detectBlueprintPrimaryBounds() {
        if (!img.src || !img.naturalWidth || !img.naturalHeight) return null;
        const maxSide = 360;
        const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(72, Math.round(img.naturalWidth * ratio));
        const h = Math.max(72, Math.round(img.naturalHeight * ratio));
        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const offCtx = off.getContext('2d', { willReadFrequently: true });
        if (!offCtx) return null;
        offCtx.drawImage(img, 0, 0, w, h);
        const imageData = offCtx.getImageData(0, 0, w, h).data;
        const gray = new Float32Array(w * h);
        for (let i = 0, j = 0; i < imageData.length; i += 4, j += 1) {
            gray[j] = imageData[i] * 0.299 + imageData[i + 1] * 0.587 + imageData[i + 2] * 0.114;
        }

        const grad = new Float32Array(w * h);
        let gradSum = 0;
        let gradSq = 0;
        let gradCount = 0;
        for (let y = 1; y < h - 1; y += 1) {
            for (let x = 1; x < w - 1; x += 1) {
                const i = y * w + x;
                const gx = (
                    -gray[i - w - 1] + gray[i - w + 1] +
                    -2 * gray[i - 1] + 2 * gray[i + 1] +
                    -gray[i + w - 1] + gray[i + w + 1]
                );
                const gy = (
                    gray[i - w - 1] + 2 * gray[i - w] + gray[i - w + 1] -
                    gray[i + w - 1] - 2 * gray[i + w] - gray[i + w + 1]
                );
                const g = Math.sqrt(gx * gx + gy * gy);
                grad[i] = g;
                gradSum += g;
                gradSq += g * g;
                gradCount += 1;
            }
        }
        if (!gradCount) return null;
        const gradMean = gradSum / gradCount;
        const gradStd = Math.sqrt(Math.max(0, gradSq / gradCount - gradMean * gradMean));
        const edgeThreshold = Math.max(20, gradMean + gradStd * 1.15);
        const rowEnergy = new Float32Array(h);
        const colEnergy = new Float32Array(w);
        let edgePixels = 0;
        for (let y = 1; y < h - 1; y += 1) {
            for (let x = 1; x < w - 1; x += 1) {
                const i = y * w + x;
                if (grad[i] >= edgeThreshold) {
                    rowEnergy[y] += 1;
                    colEnergy[x] += 1;
                    edgePixels += 1;
                }
            }
        }
        if (edgePixels < 50) return null;

        const rowMax = Math.max(...rowEnergy);
        const colMax = Math.max(...colEnergy);
        if (rowMax <= 0 || colMax <= 0) return null;
        const rowCut = Math.max(2, rowMax * 0.2);
        const colCut = Math.max(2, colMax * 0.2);

        let top = 0;
        let bottom = h - 1;
        let left = 0;
        let right = w - 1;
        while (top < h && rowEnergy[top] < rowCut) top += 1;
        while (bottom > top && rowEnergy[bottom] < rowCut) bottom -= 1;
        while (left < w && colEnergy[left] < colCut) left += 1;
        while (right > left && colEnergy[right] < colCut) right -= 1;
        if (top >= bottom || left >= right) return null;

        const boxW = right - left + 1;
        const boxH = bottom - top + 1;
        const areaRatio = (boxW * boxH) / Math.max(1, w * h);
        if (areaRatio < 0.025) return null;

        const scaleBack = 1 / ratio;
        const widthPx = boxW * scaleBack;
        const heightPx = boxH * scaleBack;
        return {
            x: left * scaleBack,
            y: top * scaleBack,
            widthPx,
            heightPx,
            longPx: Math.max(widthPx, heightPx),
            shortPx: Math.min(widthPx, heightPx),
            coverage: areaRatio
        };
    }

    function updateBlueprintAutoInterpretStatus(text, color = '#bfe7ff') {
        const box = document.getElementById('blueprint-auto-interpret-info');
        if (!box) return;
        box.innerText = text;
        box.style.color = color;
        syncMobileBlueprintStatusCard();
    }

    const AUTO_INTERPRET_GATE_DEFAULT_CONFIDENCE = 0.9;
    const AUTO_INTERPRET_MEMORY_STORAGE_KEY = 'bm_69:auto_interpret_memory';
    const AUTO_INTERPRET_MEMORY_MAX = 48;
    const GUIDED_PRECISION_REVIEW_MAX = 80;
    let autoInterpretBusy = false;
    let autoInterpretRunSeq = 0;
    let autoInterpretLastReport = null;
    let autoInterpretNeedsReview = false;
    let autoInterpretGateReason = '';
    let autoInterpretMemoryCache = null;
    let guidedPrecisionReviewCache = null;
    let blueprintLearningAssetCache = null;
    let autoInterpretLearningJobCache = null;
    let autoInterpretLearningReviewCache = null;
    let currentBlueprintUploadState = null;
    let backendLearningPollTimer = null;
    let autoInterpretQaStats = createDefaultAutoInterpretQaStats();
    let guidedPrecisionCalcState = createDefaultGuidedPrecisionCalcState();

    function createDefaultAutoInterpretQaStats() {
        return {
            quickRuns: 0,
            quickNeedsReview: 0,
            guidedRuns: 0,
            guidedNeedsReview: 0,
            guidedApplied: 0,
            memoryHits: 0,
            ocrHits: 0,
            lastSummary: '看圖 QA：待命'
        };
    }

    function createDefaultGuidedPrecisionCalcState() {
        return {
            active: false,
            applied: false,
            runId: 0,
            baseAnalysis: null,
            typeCandidates: [],
            recommendedType: '',
            memoryMatch: null,
            schema: [],
            fields: {},
            pendingRequiredFields: [],
            consensusScore: 0,
            qualityLabel: '未知',
            summaryText: '',
            statusText: '',
            crossValidationSummary: '',
            reviewGateState: 'pending',
            reviewGateReasons: [],
            reviewFieldCount: 0,
            multiSourceFieldCount: 0
        };
    }

    function qualityToScore(qualityText) {
        if (qualityText === '良好') return 1.0;
        if (qualityText === '可用') return 0.72;
        if (qualityText === '待重拍') return 0.45;
        return 0.55;
    }

    function detectBlueprintSourceType(file) {
        const name = String(file && file.name || '').toLowerCase();
        const mime = String(file && file.type || '').toLowerCase();
        if (mime.includes('heic') || mime.includes('heif') || /^img[_-]/.test(name) || /^dsc[_-]/.test(name)) return 'mobile-photo';
        if (name.includes('screenshot') || name.includes('screen shot') || name.startsWith('截圖') || mime.includes('webp')) return 'desktop-capture';
        return 'clean-blueprint';
    }

    function clampBlueprintImageValue(value) {
        return Math.max(0, Math.min(255, value));
    }

    function buildBlurredBlueprintCanvas(sourceCanvas, scale = 0.08) {
        if (!sourceCanvas) return null;
        const width = Math.max(1, Number(sourceCanvas.width) || 1);
        const height = Math.max(1, Number(sourceCanvas.height) || 1);
        const sample = document.createElement('canvas');
        sample.width = Math.max(24, Math.round(width * scale));
        sample.height = Math.max(24, Math.round(height * scale));
        const sampleCtx = sample.getContext('2d');
        if (!sampleCtx) return null;
        sampleCtx.imageSmoothingEnabled = true;
        sampleCtx.filter = 'blur(6px)';
        sampleCtx.drawImage(sourceCanvas, 0, 0, sample.width, sample.height);
        sampleCtx.filter = 'none';
        const output = document.createElement('canvas');
        output.width = width;
        output.height = height;
        const outputCtx = output.getContext('2d');
        if (!outputCtx) return null;
        outputCtx.imageSmoothingEnabled = true;
        outputCtx.drawImage(sample, 0, 0, output.width, output.height);
        return output;
    }

    function buildMobilePhotoEnhancedCanvas(sourceCanvas) {
        if (!sourceCanvas) return null;
        const width = Math.max(1, Number(sourceCanvas.width) || 1);
        const height = Math.max(1, Number(sourceCanvas.height) || 1);
        const output = document.createElement('canvas');
        output.width = width;
        output.height = height;
        const outputCtx = output.getContext('2d', { willReadFrequently: true });
        if (!outputCtx) return null;
        outputCtx.drawImage(sourceCanvas, 0, 0, width, height);
        const imageData = outputCtx.getImageData(0, 0, width, height);
        const pixels = imageData.data;
        const blurred = buildBlurredBlueprintCanvas(sourceCanvas, 0.06);
        let blurPixels = null;
        if (blurred) {
            const blurCtx = blurred.getContext('2d', { willReadFrequently: true });
            if (blurCtx) {
                blurPixels = blurCtx.getImageData(0, 0, width, height).data;
            }
        }
        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const luma = r * 0.299 + g * 0.587 + b * 0.114;
            const bgR = blurPixels ? blurPixels[i] : r;
            const bgG = blurPixels ? blurPixels[i + 1] : g;
            const bgB = blurPixels ? blurPixels[i + 2] : b;
            const bgLuma = bgR * 0.299 + bgG * 0.587 + bgB * 0.114;
            const detail = luma - bgLuma;
            const glareLike = luma > 225 && Math.abs(r - g) < 14 && Math.abs(g - b) < 14;
            const normalizedLuma = clampBlueprintImageValue(184 + detail * 2.2 + (luma - bgLuma) * 0.35 - (glareLike ? 18 : 0));
            const lineBoost = clampBlueprintImageValue(176 + detail * 3.4);
            const merged = clampBlueprintImageValue(normalizedLuma * 0.7 + lineBoost * 0.3);
            pixels[i] = merged;
            pixels[i + 1] = merged;
            pixels[i + 2] = merged;
        }
        outputCtx.putImageData(imageData, 0, 0);
        return output;
    }

    function buildOcrBoostBlueprintCanvas(sourceCanvas) {
        if (!sourceCanvas) return null;
        const width = Math.max(1, Number(sourceCanvas.width) || 1);
        const height = Math.max(1, Number(sourceCanvas.height) || 1);
        const output = document.createElement('canvas');
        output.width = width;
        output.height = height;
        const outputCtx = output.getContext('2d', { willReadFrequently: true });
        if (!outputCtx) return null;
        outputCtx.drawImage(sourceCanvas, 0, 0, width, height);
        const imageData = outputCtx.getImageData(0, 0, width, height);
        const pixels = imageData.data;
        let sum = 0;
        for (let i = 0; i < pixels.length; i += 4) {
            sum += pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
        }
        const mean = sum / Math.max(1, pixels.length / 4);
        const threshold = Math.max(118, Math.min(210, mean + 10));
        for (let i = 0; i < pixels.length; i += 4) {
            const luma = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
            const value = luma >= threshold ? 244 : 38;
            pixels[i] = value;
            pixels[i + 1] = value;
            pixels[i + 2] = value;
        }
        outputCtx.putImageData(imageData, 0, 0);
        return output;
    }

    function buildNormalizedBlueprintCanvas(sourceType) {
        if (!img.src || !img.naturalWidth || !img.naturalHeight) return null;
        const normalizedType = String(sourceType || 'clean-blueprint').trim() || 'clean-blueprint';
        const bounds = (normalizedType === 'mobile-photo' || normalizedType === 'desktop-capture')
            ? detectBlueprintPrimaryBounds()
            : null;
        const cropPaddingRatio = normalizedType === 'mobile-photo' ? 0.06 : 0.03;
        const cropX = bounds ? Math.max(0, Math.floor(bounds.x - bounds.widthPx * cropPaddingRatio)) : 0;
        const cropY = bounds ? Math.max(0, Math.floor(bounds.y - bounds.heightPx * cropPaddingRatio)) : 0;
        const cropRight = bounds
            ? Math.min(img.naturalWidth, Math.ceil(bounds.x + bounds.widthPx * (1 + cropPaddingRatio)))
            : img.naturalWidth;
        const cropBottom = bounds
            ? Math.min(img.naturalHeight, Math.ceil(bounds.y + bounds.heightPx * (1 + cropPaddingRatio)))
            : img.naturalHeight;
        const cropWidth = Math.max(1, cropRight - cropX);
        const cropHeight = Math.max(1, cropBottom - cropY);
        const canvasOut = document.createElement('canvas');
        canvasOut.width = cropWidth;
        canvasOut.height = cropHeight;
        const ctxOut = canvasOut.getContext('2d', { willReadFrequently: true });
        if (!ctxOut) return null;
        ctxOut.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        const imageData = ctxOut.getImageData(0, 0, cropWidth, cropHeight);
        const pixels = imageData.data;
        let lumaSum = 0;
        let lumaSqSum = 0;
        for (let i = 0; i < pixels.length; i += 4) {
            const luma = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
            lumaSum += luma;
            lumaSqSum += luma * luma;
        }
        const sampleCount = Math.max(1, pixels.length / 4);
        const meanLuma = lumaSum / sampleCount;
        const variance = Math.max(0, lumaSqSum / sampleCount - meanLuma * meanLuma);
        const stdLuma = Math.sqrt(variance);
        const targetMean = normalizedType === 'mobile-photo' ? 188 : (normalizedType === 'desktop-capture' ? 176 : 166);
        const contrastBoost = normalizedType === 'mobile-photo'
            ? (stdLuma < 52 ? 1.34 : 1.2)
            : (normalizedType === 'desktop-capture' ? 1.08 : 1.03);
        const brightnessOffset = targetMean - meanLuma;
        const grayscaleBlend = normalizedType === 'mobile-photo' ? 0.14 : 0.05;
        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const luma = r * 0.299 + g * 0.587 + b * 0.114;
            const boostedR = (r - meanLuma) * contrastBoost + meanLuma + brightnessOffset;
            const boostedG = (g - meanLuma) * contrastBoost + meanLuma + brightnessOffset;
            const boostedB = (b - meanLuma) * contrastBoost + meanLuma + brightnessOffset;
            pixels[i] = clampBlueprintImageValue(boostedR * (1 - grayscaleBlend) + luma * grayscaleBlend);
            pixels[i + 1] = clampBlueprintImageValue(boostedG * (1 - grayscaleBlend) + luma * grayscaleBlend);
            pixels[i + 2] = clampBlueprintImageValue(boostedB * (1 - grayscaleBlend) + luma * grayscaleBlend);
        }
        ctxOut.putImageData(imageData, 0, 0);
        return {
            canvas: canvasOut,
            meta: {
                sourceProfile: normalizedType === 'mobile-photo'
                    ? 'mobile-photo-normalized'
                    : (normalizedType === 'desktop-capture' ? 'desktop-capture-normalized' : 'clean-blueprint-normalized'),
                boundsApplied: !!bounds,
                crop: { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
                originalSize: { width: img.naturalWidth, height: img.naturalHeight },
                outputSize: { width: cropWidth, height: cropHeight },
                meanLumaBefore: Math.round(meanLuma),
                contrastBoost: Math.round(contrastBoost * 100) / 100
            }
        };
    }

    function getBlueprintLearningAssetStore() {
        if (Array.isArray(blueprintLearningAssetCache)) return blueprintLearningAssetCache;
        blueprintLearningAssetCache = [];
        return blueprintLearningAssetCache;
    }

    function getAutoInterpretLearningJobStore() {
        if (Array.isArray(autoInterpretLearningJobCache)) return autoInterpretLearningJobCache;
        autoInterpretLearningJobCache = [];
        return autoInterpretLearningJobCache;
    }

    function getAutoInterpretLearningReviewStore() {
        if (Array.isArray(autoInterpretLearningReviewCache)) return autoInterpretLearningReviewCache;
        autoInterpretLearningReviewCache = [];
        return autoInterpretLearningReviewCache;
    }

    function updateAutoInterpretLearningSummary(text, color = '#d7e9ff') {
        const box = document.getElementById('autoInterpretLearningSummary');
        if (!box) return;
        box.innerText = text;
        box.style.color = color;
    }

    function getAutoInterpretLearningStatusMeta(status) {
        const key = String(status || '').trim();
        if (key === 'completed') return { label: '已達標', color: '#9fffc0' };
        if (key === 'approved_manual') return { label: '人工通過', color: '#bfe7ff' };
        if (key === 'review_required') return { label: '待人工審核', color: '#ffd48a' };
        if (key === 'rejected') return { label: '已退回', color: '#ff9a9a' };
        if (key === 'failed') return { label: '執行失敗', color: '#ff9a9a' };
        if (key === 'running') return { label: '學習中', color: '#8be9fd' };
        return { label: '排隊中', color: '#d7e9ff' };
    }

    function getBlueprintSourceTypeLabel(sourceType) {
        const key = String(sourceType || '').trim();
        if (key === 'mobile-photo') return '手機拍照';
        if (key === 'desktop-capture') return '電腦截圖';
        return '正式藍圖';
    }

    function getBlueprintSourceProfileLabel(sourceProfile) {
        const key = String(sourceProfile || '').trim();
        if (key === 'mobile-photo-normalized') return '手機圖基礎校正';
        if (key === 'mobile-photo-shadowfix') return '手機圖陰影壓平';
        if (key === 'mobile-photo-ocr-boost') return '手機圖文字強化';
        if (key === 'desktop-capture-normalized') return '截圖線條優化';
        if (key === 'clean-blueprint-normalized') return '藍圖標準化';
        return key;
    }

    function renderAutoInterpretLearningPanel() {
        const body = document.getElementById('autoInterpretLearningBody');
        const jobs = getAutoInterpretLearningJobStore();
        const assets = getBlueprintLearningAssetStore();
        if (!body) return;
        if (!jobs.length) {
            body.innerHTML = '<tr><td colspan="6" style="color:#99b2c9;">尚無後台自動學習任務</td></tr>';
            updateAutoInterpretLearningSummary('後台學習：尚未建立任務', '#d7e9ff');
            return;
        }
        body.innerHTML = '';
        const running = jobs.filter((item) => String(item && item.status || '') === 'running').length;
        const review = jobs.filter((item) => String(item && item.status || '') === 'review_required').length;
        const completed = jobs.filter((item) => ['completed', 'approved_manual'].includes(String(item && item.status || ''))).length;
        updateAutoInterpretLearningSummary(`後台學習：執行中 ${running}｜待審核 ${review}｜已達標 ${completed}`, running ? '#8be9fd' : (review ? '#ffd48a' : '#d7e9ff'));
        jobs.slice(0, 10).forEach((job) => {
            const tr = document.createElement('tr');
            const statusMeta = getAutoInterpretLearningStatusMeta(job.status);
            const asset = assets.find((item) => String(item && item.assetId || '') === String(job.assetId || '')) || {};
            const bestReport = job.bestReport || {};
            const attempts = Array.isArray(job.attempts) ? job.attempts.length : 0;
            const dimensionText = Number(bestReport.longM || 0) > 0 && Number(bestReport.shortM || 0) > 0
                ? `${Number(bestReport.longM || 0).toFixed(2)}×${Number(bestReport.shortM || 0).toFixed(2)}m`
                : '';
            const summaryText = [
                asset.sourceType ? `來源 ${getBlueprintSourceTypeLabel(asset.sourceType)}` : '',
                asset.sourceProfile && asset.sourceProfile !== asset.sourceType ? `前處理 ${getBlueprintSourceProfileLabel(asset.sourceProfile)}` : '',
                attempts ? `重跑 ${attempts}/${Number(job.maxAttempts) || 3}` : '尚未重跑',
                bestReport.type ? `類型 ${bestReport.type}` : '',
                dimensionText,
                Number(bestReport.quantity) ? `數量 ${bestReport.quantity}` : '',
                bestReport.notes ? String(bestReport.notes) : '',
                job.lastError ? `錯誤 ${job.lastError}` : ''
            ].filter(Boolean).join('｜');
            const actionHtml = String(job.status || '') === 'review_required'
                ? `<button class="tool-btn" style="padding:4px 8px; border-color:#9fffc0; color:#dfffea;" onclick="reviewAutoInterpretLearningJob('${String(job.jobId || '')}', 'approved')">通過</button> <button class="tool-btn" style="padding:4px 8px; border-color:#ffcc80; color:#ffe9c7;" onclick="reviewAutoInterpretLearningJob('${String(job.jobId || '')}', 'rejected')">退回</button>`
                : `<button class="tool-btn" style="padding:4px 8px;" onclick="refreshAutoInterpretLearningJob('${String(job.jobId || '')}')">更新</button>`;
            tr.innerHTML = `<td>${new Date(job.createdAt || Date.now()).toLocaleString('zh-TW')}</td><td>${escapeHTML(getBlueprintSourceTypeLabel(String(asset.sourceType || job.sourceProfile || '')))}</td><td style="color:${statusMeta.color};">${escapeHTML(statusMeta.label)}</td><td>${Number(job.bestScore || 0).toFixed(1)} / 99.9</td><td>${escapeHTML(summaryText || '-')}</td><td>${actionHtml}</td>`;
            body.appendChild(tr);
        });
    }

    async function buildBackendLearningUploadPayload() {
        if (!currentBlueprintUploadState || !currentBlueprintUploadState.dataUrl) return null;
        const maxSide = 1800;
        const sourceType = String(currentBlueprintUploadState.sourceType || 'clean-blueprint').trim() || 'clean-blueprint';
        const normalized = buildNormalizedBlueprintCanvas(sourceType);
        const normalizedVariants = [];
        let width = Number(currentBlueprintUploadState.width) || Number(img.naturalWidth) || 0;
        let height = Number(currentBlueprintUploadState.height) || Number(img.naturalHeight) || 0;
        let outputCanvas = null;
        let sourceProfile = sourceType;
        if (normalized && normalized.canvas) {
            outputCanvas = normalized.canvas;
            width = Number(normalized.meta && normalized.meta.outputSize && normalized.meta.outputSize.width) || width;
            height = Number(normalized.meta && normalized.meta.outputSize && normalized.meta.outputSize.height) || height;
            sourceProfile = String(normalized.meta && normalized.meta.sourceProfile || sourceType);
            normalizedVariants.push({
                stage: 'client-normalize',
                sourceType,
                sourceProfile,
                boundsApplied: !!(normalized.meta && normalized.meta.boundsApplied),
                crop: normalized.meta && normalized.meta.crop ? normalized.meta.crop : null,
                meanLumaBefore: normalized.meta && normalized.meta.meanLumaBefore,
                contrastBoost: normalized.meta && normalized.meta.contrastBoost,
                outputWidth: width,
                outputHeight: height
            });
        }
        if (!outputCanvas) {
            outputCanvas = document.createElement('canvas');
            outputCanvas.width = Math.max(1, width);
            outputCanvas.height = Math.max(1, height);
            const fallbackCtx = outputCanvas.getContext('2d');
            if (fallbackCtx) {
                fallbackCtx.drawImage(img, 0, 0, outputCanvas.width, outputCanvas.height);
            }
        }
        if (sourceType === 'mobile-photo') {
            const shadowCorrected = buildMobilePhotoEnhancedCanvas(outputCanvas);
            if (shadowCorrected) {
                outputCanvas = shadowCorrected;
                width = shadowCorrected.width;
                height = shadowCorrected.height;
                sourceProfile = 'mobile-photo-shadowfix';
                normalizedVariants.push({
                    stage: 'mobile-shadow-fix',
                    sourceType,
                    sourceProfile,
                    outputWidth: width,
                    outputHeight: height
                });
                const ocrBoost = buildOcrBoostBlueprintCanvas(shadowCorrected);
                if (ocrBoost) {
                    outputCanvas = ocrBoost;
                    width = ocrBoost.width;
                    height = ocrBoost.height;
                    sourceProfile = 'mobile-photo-ocr-boost';
                    normalizedVariants.push({
                        stage: 'mobile-ocr-boost',
                        sourceType,
                        sourceProfile,
                        outputWidth: width,
                        outputHeight: height
                    });
                }
            }
        }
        let finalCanvas = outputCanvas;
        let dataUrl = finalCanvas.toDataURL(sourceType === 'desktop-capture' ? 'image/png' : 'image/jpeg', 0.92);
        if (width > maxSide || height > maxSide || dataUrl.length > 5_500_000) {
            const scale = Math.min(1, maxSide / Math.max(width || 1, height || 1));
            const resized = document.createElement('canvas');
            resized.width = Math.max(1, Math.round((width || 1) * scale));
            resized.height = Math.max(1, Math.round((height || 1) * scale));
            const resizedCtx = resized.getContext('2d');
            if (resizedCtx) {
                resizedCtx.drawImage(finalCanvas, 0, 0, resized.width, resized.height);
                finalCanvas = resized;
                width = resized.width;
                height = resized.height;
                normalizedVariants.push({
                    stage: 'client-resize',
                    sourceType,
                    sourceProfile,
                    outputWidth: width,
                    outputHeight: height
                });
                dataUrl = finalCanvas.toDataURL(sourceType === 'desktop-capture' ? 'image/png' : 'image/jpeg', 0.9);
            }
        }
        return {
            ...currentBlueprintUploadState,
            dataUrl,
            width,
            height,
            sourceType,
            sourceProfile,
            normalizedVariants,
            orientation: currentBlueprintUploadState.orientation || (width >= height ? 'landscape' : 'portrait')
        };
    }

    function syncAutoInterpretLearningCaches(jobPayload, assetPayload, reviewsPayload) {
        if (assetPayload) {
            const assets = getBlueprintLearningAssetStore().slice();
            const assetId = String(assetPayload.assetId || '');
            const index = assets.findIndex((item) => String(item && item.assetId || '') === assetId);
            if (index >= 0) assets[index] = { ...assets[index], ...assetPayload };
            else assets.unshift(assetPayload);
            blueprintLearningAssetCache = assets.slice(0, 160);
        }
        if (jobPayload) {
            const jobs = getAutoInterpretLearningJobStore().slice();
            const jobId = String(jobPayload.jobId || '');
            const index = jobs.findIndex((item) => String(item && item.jobId || '') === jobId);
            if (index >= 0) jobs[index] = { ...jobs[index], ...jobPayload };
            else jobs.unshift(jobPayload);
            autoInterpretLearningJobCache = jobs.slice(0, 160);
        }
        if (Array.isArray(reviewsPayload) && reviewsPayload.length) {
            const reviews = getAutoInterpretLearningReviewStore().slice();
            reviewsPayload.forEach((review) => {
                const reviewId = String(review && review.reviewId || '');
                const index = reviews.findIndex((item) => String(item && item.reviewId || '') === reviewId);
                if (index >= 0) reviews[index] = { ...reviews[index], ...review };
                else reviews.unshift(review);
            });
            autoInterpretLearningReviewCache = reviews.slice(0, 160);
        }
    }

    function getAutoInterpretMemoryStore() {
        if (Array.isArray(autoInterpretMemoryCache)) return autoInterpretMemoryCache;
        autoInterpretMemoryCache = [];
        return autoInterpretMemoryCache;
    }

    function persistAutoInterpretMemoryStore(store) {
        autoInterpretMemoryCache = Array.isArray(store) ? store.slice(0, AUTO_INTERPRET_MEMORY_MAX) : [];
        autoInterpretMemoryHiddenLocally = false;
        autoInterpretMemoryLocalHiddenKeys = new Set();
        queueWorkspacePersist('autoInterpretMemory', autoInterpretMemoryCache);
    }

    async function enrichAutoInterpretServerQa(report) {
        if (!report) return report;
        try {
            const payload = await apiRequest('/qa/auto-interpret', {
                method: 'POST',
                body: { report },
                retries: 0,
                timeoutMs: 12000
            });
            report.serverQaScore = Number(payload && payload.qaScore ? payload.qaScore : 0);
            report.serverQaLevel = payload && payload.qaLevel ? payload.qaLevel : '';
        } catch (error) {
            console.warn('看圖 QA 後端評分失敗', error);
        }
        return report;
    }

    function buildBlueprintFeatureVector(bounds, qualityReport) {
        const longPx = Number(bounds && bounds.longPx) || 0;
        const shortPx = Number(bounds && bounds.shortPx) || 0;
        const ratio = shortPx > 0 ? longPx / shortPx : 1;
        return {
            longPx,
            shortPx,
            ratio,
            coverage: Number(bounds && bounds.coverage) || 0,
            quality: String(qualityReport && qualityReport.quality || '未知'),
            meanLuma: Number(qualityReport && qualityReport.meanLuma) || 0,
            contrastVar: Number(qualityReport && qualityReport.contrastVar) || 0,
            blurVar: Number(qualityReport && qualityReport.blurVar) || 0
        };
    }

    function calcBlueprintMemorySimilarity(currentVector, sample) {
        if (!currentVector || !sample || !sample.vector) return 0;
        const vector = sample.vector;
        const ratioGap = Math.abs((currentVector.ratio || 1) - (Number(vector.ratio) || 1));
        const coverageGap = Math.abs((currentVector.coverage || 0) - (Number(vector.coverage) || 0));
        const lumaGap = Math.min(1, Math.abs((currentVector.meanLuma || 0) - (Number(vector.meanLuma) || 0)) / 255);
        const contrastGap = Math.min(1, Math.abs((currentVector.contrastVar || 0) - (Number(vector.contrastVar) || 0)) / 2000);
        const blurGap = Math.min(1, Math.abs((currentVector.blurVar || 0) - (Number(vector.blurVar) || 0)) / 600);
        const qualityPenalty = currentVector.quality === String(vector.quality || '') ? 0 : 0.08;
        const weightedGap = ratioGap * 0.42 + coverageGap * 0.22 + lumaGap * 0.12 + contrastGap * 0.12 + blurGap * 0.12 + qualityPenalty;
        return Math.max(0, Math.min(1, 1 - weightedGap));
    }

    function findAutoInterpretMemoryMatch(bounds, qualityReport, preferredType = '') {
        const store = getAutoInterpretMemoryStore();
        if (!store.length) return null;
        const currentVector = buildBlueprintFeatureVector(bounds, qualityReport);
        const preferred = String(preferredType || '').trim();
        const pool = preferred
            ? store.filter(item => String(item.type || '').trim() === preferred)
            : store;
        const scored = pool
            .map(item => ({ item, score: calcBlueprintMemorySimilarity(currentVector, item) }))
            .filter(entry => entry.score >= (preferred ? 0.5 : 0.55))
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
        if (!scored.length) return null;
        const best = scored[0];
        return {
            best: best.item,
            similarity: best.score,
            sampleCount: scored.length,
            preferredType: preferred,
            summary: scored.slice(0, 3).map(entry => `${entry.item.type}/${entry.item.quantity}件/${Math.round(entry.score * 100)}%`).join('｜')
        };
    }

    let autoInterpretMemoryHiddenLocally = false;
    let autoInterpretMemoryLocalHiddenKeys = new Set();
    let autoInterpretMemoryVisibleRows = [];
    let guidedPrecisionReviewHiddenLocally = false;

    function getAutoInterpretMemoryLocalKey(item) {
        return [
            String(item && item.ts || ''),
            String(item && item.type || ''),
            String(item && item.quantity || ''),
            String(item && item.longM || ''),
            String(item && item.shortM || '')
        ].join('|');
    }

    function renderAutoInterpretMemoryPanel() {
        const body = document.getElementById('autoInterpretMemoryBody');
        const summary = document.getElementById('autoInterpretMemorySummary');
        const store = getAutoInterpretMemoryStore();
        if (!body || !summary) return;
        body.innerHTML = '';
        autoInterpretMemoryVisibleRows = [];
        if (autoInterpretMemoryHiddenLocally) {
            body.innerHTML = '<tr><td colspan="6" style="color:#99b2c9;">本機畫面已清空，AI 看圖記憶仍保留；重新整理頁面後可再顯示。</td></tr>';
            summary.innerText = `記憶庫：本機畫面已清空｜實際保留 ${store.length} 筆`;
            return;
        }
        if (!store.length) {
            body.innerHTML = '<tr><td colspan="6" style="color:#99b2c9;">尚無已學習案例</td></tr>';
            summary.innerText = '記憶庫：尚未建立';
            return;
        }
        const visibleStore = store.filter(item => !autoInterpretMemoryLocalHiddenKeys.has(getAutoInterpretMemoryLocalKey(item)));
        autoInterpretMemoryVisibleRows = visibleStore.slice();
        if (!visibleStore.length) {
            body.innerHTML = '<tr><td colspan="6" style="color:#99b2c9;">本機畫面已隱藏所有案例，記憶仍保留；重新整理頁面後可再顯示。</td></tr>';
            summary.innerText = `記憶庫：本機已隱藏｜實際保留 ${store.length} 筆`;
            return;
        }
        const typeCounts = visibleStore.reduce((acc, item) => {
            const key = String(item.type || '未分類');
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([type, count]) => `${type}:${count}`).join(' / ');
        summary.innerText = `記憶庫：畫面 ${visibleStore.length} 筆｜實際保留 ${store.length} 筆｜類型分佈 ${topTypes || '無'}${autoInterpretLastReport && autoInterpretLastReport.memoryStoreSize ? `｜最近套用後總數 ${autoInterpretLastReport.memoryStoreSize}` : ''}`;
        visibleStore.slice(0, 12).forEach((item, idx) => {
            const tr = document.createElement('tr');
            const ratio = item && item.vector ? Number(item.vector.ratio || 0) : 0;
            tr.innerHTML = `<td>${new Date(item.ts || Date.now()).toLocaleString('zh-TW')}</td><td>${item.type || '-'}</td><td>${item.quantity || '-'}</td><td>${Number(item.longM || 0).toFixed(2)} × ${Number(item.shortM || 0).toFixed(2)} m</td><td>${item.quality || '未知'} / 比例 ${ratio.toFixed(2)}</td><td><button class="tool-btn" style="padding:4px 8px;" onclick="deleteAutoInterpretMemory(${idx})">刪除</button></td>`;
            body.appendChild(tr);
        });
    }

    function deleteAutoInterpretMemory(index) {
        const removed = autoInterpretMemoryVisibleRows[index];
        if (!removed) return;
        autoInterpretMemoryLocalHiddenKeys.add(getAutoInterpretMemoryLocalKey(removed));
        renderAutoInterpretMemoryPanel();
        showToast(`已從本機畫面隱藏記憶：${removed && removed.type ? removed.type : '案例'}（雲端記憶仍保留）`);
    }

    function clearAutoInterpretMemory() {
        if (!confirm('確定清空 AI 看圖學習記憶庫嗎？')) return;
        autoInterpretMemoryHiddenLocally = true;
        renderAutoInterpretMemoryPanel();
        showToast('已清空本機畫面，AI 看圖記憶仍保留');
    }

    function getGuidedPrecisionReviewStore() {
        if (Array.isArray(guidedPrecisionReviewCache)) return guidedPrecisionReviewCache;
        guidedPrecisionReviewCache = [];
        return guidedPrecisionReviewCache;
    }

    function persistGuidedPrecisionReviewStore(store) {
        guidedPrecisionReviewCache = Array.isArray(store) ? store.slice(0, GUIDED_PRECISION_REVIEW_MAX) : [];
        guidedPrecisionReviewHiddenLocally = false;
        queueWorkspacePersist('guidedPrecisionReviews', guidedPrecisionReviewCache);
    }

    function getGuidedPrecisionConfidenceRoute(report = autoInterpretLastReport) {
        const overallConfidence = Number(report && report.overallConfidence) || 0;
        const needsReview = !!(report && report.needsReview);
        if (needsReview || overallConfidence < 0.72) {
            return {
                key: 'manual',
                label: '人工把關',
                note: '需人工確認後才能進核心記憶',
                color: '#ffb88a'
            };
        }
        if (overallConfidence < 0.86) {
            return {
                key: 'review',
                label: '研究複核',
                note: '建議先複核再決定是否進核心記憶',
                color: '#ffd48a'
            };
        }
        return {
            key: 'candidate',
            label: '核心候選',
            note: '結果穩定，可由管理者審核通過後進核心記憶',
            color: '#9fffc0'
        };
    }

    function attachGuidedPrecisionReviewMeta(report, overrides = {}) {
        const nextReport = {
            ...(report && typeof report === 'object' ? report : {}),
            ...overrides
        };
        const route = getGuidedPrecisionConfidenceRoute(nextReport);
        nextReport.confidenceRouteKey = route.key;
        nextReport.confidenceRouteLabel = route.label;
        nextReport.confidenceRouteNote = route.note;
        return nextReport;
    }

    function buildGuidedPrecisionReviewRecord(report, status, options = {}) {
        const valueSet = options.valueSet || report.valueSet || buildCurrentCalcValueSet();
        const route = getGuidedPrecisionConfidenceRoute(report);
        const reviewedAt = status === 'pending' ? '' : new Date().toISOString();
        const quantity = Math.max(1, Number(valueSet.qty || report.quantity) || 1);
        const id = String(options.id || report.reviewRecordId || `guided-${Number(report.runId) || 0}-${String(report.inputSignature || 'draft')}`);
        return {
            id,
            ts: String(options.ts || new Date().toISOString()),
            runId: Number(report.runId) || 0,
            status: String(status || 'pending'),
            routeKey: route.key,
            routeLabel: route.label,
            overallConfidence: Number(report.overallConfidence) || 0,
            type: String(valueSet.type || report.type || '').trim(),
            quantity,
            valueSet: {
                type: String(valueSet.type || '').trim(),
                v1: String(valueSet.v1 || ''),
                v2: String(valueSet.v2 || ''),
                v3: String(valueSet.v3 || ''),
                qty: String(valueSet.qty || quantity)
            },
            needsReview: !!report.needsReview,
            reviewFields: Array.isArray(report.reviewFields) ? report.reviewFields.slice() : [],
            pendingFields: Array.isArray(report.pendingFields) ? report.pendingFields.slice() : [],
            fieldConfidenceSummary: String(report.fieldConfidenceSummary || ''),
            crossValidationSummary: String(report.crossValidationSummary || ''),
            memorySimilarity: Number(report.memorySimilarity) || 0,
            decisionNote: String(options.decisionNote || '').trim(),
            reviewedAt,
            inputSignature: String(report.inputSignature || ''),
            sourceLabel: String(options.sourceLabel || '極強精準辨識')
        };
    }

    function upsertGuidedPrecisionReviewRecord(record) {
        if (!record || !record.id) return null;
        const store = getGuidedPrecisionReviewStore().slice();
        const index = store.findIndex(item => String(item && item.id || '') === String(record.id));
        if (index >= 0) {
            const previous = store[index] || {};
            store[index] = {
                ...previous,
                ...record,
                ts: String(previous.ts || record.ts || new Date().toISOString())
            };
        } else {
            store.unshift(record);
        }
        persistGuidedPrecisionReviewStore(store);
        return store.find(item => String(item && item.id || '') === String(record.id)) || record;
    }

    function getGuidedPrecisionReviewStatusLabel(status) {
        if (status === 'approved') return '已通過';
        if (status === 'corrected') return '修正通過';
        if (status === 'rejected') return '已退回';
        return '待審核';
    }

    function renderGuidedPrecisionReviewPanel() {
        const summary = document.getElementById('guidedPrecisionReviewSummary');
        const body = document.getElementById('guidedPrecisionReviewBody');
        const store = getGuidedPrecisionReviewStore();
        if (!summary || !body) return;
        if (guidedPrecisionReviewHiddenLocally) {
            summary.innerText = `極強審核：本機畫面已清空｜實際保留 ${store.length} 筆`;
            body.innerHTML = '<tr><td colspan="5" style="color:#99b2c9;">本機畫面已清空，審核研究紀錄仍保留；重新整理頁面後可再顯示。</td></tr>';
            return;
        }
        if (!store.length) {
            summary.innerText = '極強審核：尚無待審核或研究紀錄';
            body.innerHTML = '<tr><td colspan="5" style="color:#99b2c9;">尚無極強審核紀錄</td></tr>';
            return;
        }
        const counts = store.reduce((acc, item) => {
            const key = String(item && item.status || 'pending');
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        summary.innerText = `極強審核：待審核 ${counts.pending || 0}｜已通過 ${counts.approved || 0}｜修正通過 ${counts.corrected || 0}｜已退回 ${counts.rejected || 0}`;
        body.innerHTML = '';
        store.slice(0, 10).forEach((item) => {
            const tr = document.createElement('tr');
            const valueText = [item.type || '-', item.valueSet && item.valueSet.v1 ? `${item.valueSet.v1}×${item.valueSet.v2 || '-'}` : '', item.quantity ? `數量 ${item.quantity}` : '']
                .filter(Boolean)
                .join(' / ');
            const reviewedText = item.reviewedAt ? `｜${new Date(item.reviewedAt).toLocaleString('zh-TW')}` : '';
            tr.innerHTML = `<td>${new Date(item.ts || Date.now()).toLocaleString('zh-TW')}</td><td>${escapeHTML(getGuidedPrecisionReviewStatusLabel(item.status))}</td><td>${escapeHTML(String(item.routeLabel || '-'))}</td><td>${escapeHTML(valueText || '-')}</td><td>${escapeHTML([item.fieldConfidenceSummary, item.crossValidationSummary, item.decisionNote, reviewedText].filter(Boolean).join('｜') || '-')}</td>`;
            body.appendChild(tr);
        });
    }

    async function refreshAutoInterpretLearningJob(jobId, options = {}) {
        const id = String(jobId || '').trim();
        if (!id) return null;
        try {
            const payload = await apiRequest(`/learning/auto-interpret/jobs/${encodeURIComponent(id)}`, {
                method: 'GET',
                retries: 0,
                timeoutMs: 15000
            });
            syncAutoInterpretLearningCaches(payload.job, payload.asset, payload.reviews);
            renderAutoInterpretLearningPanel();
            if (options.reloadBootstrap && typeof loadWorkspaceBootstrap === 'function') {
                await loadWorkspaceBootstrap();
                renderAutoInterpretLearningPanel();
                renderAutoInterpretMemoryPanel();
            }
            return payload;
        } catch (error) {
            updateAutoInterpretLearningSummary(`後台學習：讀取任務失敗｜${error && error.message ? error.message : '請稍後再試'}`, '#ff9a9a');
            throw error;
        }
    }

    async function pollAutoInterpretLearningJob(jobId) {
        if (backendLearningPollTimer) {
            clearTimeout(backendLearningPollTimer);
            backendLearningPollTimer = null;
        }
        const poll = async () => {
            try {
                const payload = await refreshAutoInterpretLearningJob(jobId);
                const status = String(payload && payload.job && payload.job.status || '');
                const bestScore = Number(payload && payload.job && payload.job.bestScore || 0).toFixed(1);
                const statusMeta = getAutoInterpretLearningStatusMeta(status);
                updateAutoInterpretLearningSummary(`後台學習：${statusMeta.label}｜最佳 ${bestScore} / 99.9`, statusMeta.color);
                if (status === 'running' || status === 'queued') {
                    backendLearningPollTimer = setTimeout(poll, 3000);
                    return;
                }
                if (typeof loadWorkspaceBootstrap === 'function') {
                    await loadWorkspaceBootstrap();
                    renderAutoInterpretLearningPanel();
                    renderAutoInterpretMemoryPanel();
                }
                if (status === 'completed' || status === 'approved_manual') {
                    showToast(`後台學習已完成，最佳分數 ${bestScore} / 99.9`);
                } else if (status === 'review_required') {
                    showToast(`後台學習已跑完 ${payload.job.maxAttempts} 輪，最佳 ${bestScore} / 99.9，請人工審核`);
                } else if (status === 'failed') {
                    showToast(`後台學習失敗：${payload.job.lastError || '請稍後再試'}`);
                }
            } catch (error) {
                updateAutoInterpretLearningSummary(`後台學習：更新失敗｜${error && error.message ? error.message : '請稍後再試'}`, '#ff9a9a');
            }
        };
        await poll();
    }

    async function startBackendAutoInterpretLearning() {
        if (!ensureCalcAdvancedPageReady('第三頁 AI 看圖區尚未載入')) return;
        if (!(await ensureFeatureAccess('blueprintAutoInterpret', '後台自動學習僅開放會員3（專家）'))) return;
        if (!img.src || !currentBlueprintUploadState || !currentBlueprintUploadState.dataUrl) {
            return showToast('請先上傳手機圖、電腦截圖或正式藍圖，再啟動後台學習');
        }
        try {
            const payload = await buildBackendLearningUploadPayload();
            if (!payload) return showToast('目前沒有可上傳的圖紙資料');
            updateAutoInterpretLearningSummary('後台學習：上傳圖紙中...', '#8be9fd');
            const upload = await apiRequest('/learning/blueprints/upload', {
                method: 'POST',
                body: payload,
                retries: 0,
                timeoutMs: 30000
            });
            syncAutoInterpretLearningCaches(null, upload.asset, []);
            updateAutoInterpretLearningSummary(`後台學習：已接收 ${getBlueprintSourceTypeLabel(upload.asset.sourceType)}，已做校正，建立任務中...`, '#8be9fd');
            const created = await apiRequest('/learning/auto-interpret/jobs', {
                method: 'POST',
                body: {
                    assetId: upload.asset.assetId,
                    thresholdScore: 95,
                    maxAttempts: 3
                },
                retries: 0,
                timeoutMs: 15000
            });
            syncAutoInterpretLearningCaches(created.job, upload.asset, []);
            renderAutoInterpretLearningPanel();
            updateAutoInterpretLearningSummary(`後台學習：已建立任務，開始重跑辨識 #${created.job.jobId}`, '#8be9fd');
            showToast(`後台學習已建立，來源 ${getBlueprintSourceTypeLabel(upload.asset.sourceType)}，已先校正再開始自動重跑`);
            await pollAutoInterpretLearningJob(created.job.jobId);
        } catch (error) {
            updateAutoInterpretLearningSummary(`後台學習：建立失敗｜${error && error.message ? error.message : '請稍後再試'}`, '#ff9a9a');
            showToast(`後台學習啟動失敗：${error && error.message ? error.message : '請稍後再試'}`);
        }
    }

    async function reviewAutoInterpretLearningJob(jobId, decision) {
        const id = String(jobId || '').trim();
        if (!id) return;
        const normalizedDecision = String(decision || '').trim().toLowerCase();
        if (normalizedDecision === 'approved' && !confirm('確定要把這筆後台學習結果加入核心記憶嗎？')) return;
        if (normalizedDecision === 'rejected' && !confirm('確定要退回這筆後台學習結果嗎？')) return;
        const note = prompt(
            normalizedDecision === 'approved'
                ? '可選填審核備註（例如：手機圖已人工確認）'
                : '可選填退回原因（例如：尺寸與現場不符）',
            ''
        );
        try {
            const payload = await apiRequest(`/learning/auto-interpret/jobs/${encodeURIComponent(id)}/review`, {
                method: 'POST',
                body: {
                    decision: normalizedDecision,
                    note: String(note || '').trim()
                },
                retries: 0,
                timeoutMs: 15000
            });
            syncAutoInterpretLearningCaches(payload.job, null, []);
            if (typeof loadWorkspaceBootstrap === 'function') {
                await loadWorkspaceBootstrap();
                renderAutoInterpretMemoryPanel();
            }
            renderAutoInterpretLearningPanel();
            showToast(normalizedDecision === 'approved' ? '已人工通過並加入核心記憶' : '已退回此筆後台學習結果');
        } catch (error) {
            updateAutoInterpretLearningSummary(`後台學習：審核失敗｜${error && error.message ? error.message : '請稍後再試'}`, '#ff9a9a');
            showToast(`後台學習審核失敗：${error && error.message ? error.message : '請稍後再試'}`);
        }
    }

    function clearGuidedPrecisionReviewHistory() {
        if (!confirm('確定清空極強審核研究紀錄嗎？')) return;
        guidedPrecisionReviewHiddenLocally = true;
        renderGuidedPrecisionReviewPanel();
        showToast('已清空本機畫面，極強審核研究紀錄仍保留');
    }

    function syncGuidedPrecisionReviewRecord(status, options = {}) {
        if (!autoInterpretLastReport || String(autoInterpretLastReport.precisionMode || '') !== 'guided') return null;
        const valueSet = options.valueSet || buildCurrentCalcValueSet();
        const nextReport = attachGuidedPrecisionReviewMeta(autoInterpretLastReport, {
            type: String(valueSet.type || autoInterpretLastReport.type || '').trim(),
            quantity: Math.max(1, Number(valueSet.qty || autoInterpretLastReport.quantity) || 1),
            valueSet,
            needsReview: status === 'pending' ? !!autoInterpretLastReport.needsReview : false,
            pendingFields: status === 'pending' ? (Array.isArray(autoInterpretLastReport.pendingFields) ? autoInterpretLastReport.pendingFields.slice() : []) : [],
            reviewFields: status === 'pending' ? (Array.isArray(autoInterpretLastReport.reviewFields) ? autoInterpretLastReport.reviewFields.slice() : []) : [],
            decisionStatus: status,
            reviewDecisionLabel: getGuidedPrecisionReviewStatusLabel(status)
        });
        const record = upsertGuidedPrecisionReviewRecord(buildGuidedPrecisionReviewRecord(nextReport, status, {
            id: nextReport.reviewRecordId,
            valueSet,
            decisionNote: options.decisionNote || '',
            ts: options.ts
        }));
        if (!record) return null;
        autoInterpretLastReport = {
            ...nextReport,
            reviewRecordId: record.id
        };
        renderGuidedPrecisionReviewPanel();
        updateAutoInterpretQaSummary(autoInterpretLastReport);
        return record;
    }

    function approveGuidedPrecisionToCoreMemory() {
        if (!autoInterpretLastReport || String(autoInterpretLastReport.precisionMode || '') !== 'guided') {
            return showToast('目前沒有可審核的極強精準結果');
        }
        if (autoInterpretLastReport.needsReview) {
            return showToast('這筆極強結果仍需複核；若已手動確認，請用「修正後通過」');
        }
        const valueSet = buildCurrentCalcValueSet();
        const missing = getGuidedPrecisionMissingValueLabels(valueSet);
        if (missing.length) return showToast(`請先補齊：${missing.join('、')}`);
        const memorySample = buildGuidedPrecisionMemorySampleFromValueSet(valueSet);
        const learnResult = learnAutoInterpretMemory(memorySample || {});
        const record = syncGuidedPrecisionReviewRecord('approved', {
            valueSet,
            decisionNote: '欄位已確認，審核通過後納入核心記憶'
        });
        if (record) {
            autoInterpretLastReport = attachGuidedPrecisionReviewMeta(autoInterpretLastReport, {
                memoryStoreSize: learnResult.count,
                needsReview: false,
                pendingFields: [],
                reviewFields: []
            });
            renderAutoInterpretMemoryPanel();
            updateBlueprintAutoInterpretStatus(`極強精準: 已審核通過並寫入核心記憶｜${record.routeLabel}`, '#9fffc0');
            recordAutoInterpretLog('guided-auto-interpret', '極強精準', autoInterpretLastReport, '審核通過後加入核心記憶');
            showToast('極強結果已審核通過，並加入核心記憶');
        }
    }

    function approveGuidedPrecisionWithCurrentValues() {
        if (!autoInterpretLastReport || String(autoInterpretLastReport.precisionMode || '') !== 'guided') {
            return showToast('目前沒有可修正的極強精準結果');
        }
        const valueSet = buildCurrentCalcValueSet();
        const missing = getGuidedPrecisionMissingValueLabels(valueSet);
        if (missing.length) return showToast(`修正後仍缺少：${missing.join('、')}`);
        const memorySample = buildGuidedPrecisionMemorySampleFromValueSet(valueSet);
        const learnResult = learnAutoInterpretMemory(memorySample || {});
        const record = syncGuidedPrecisionReviewRecord('corrected', {
            valueSet,
            decisionNote: '以目前欄位值修正後通過，並納入核心記憶'
        });
        if (record) {
            autoInterpretLastReport = attachGuidedPrecisionReviewMeta(autoInterpretLastReport, {
                type: String(valueSet.type || autoInterpretLastReport.type || ''),
                quantity: Math.max(1, Number(valueSet.qty || autoInterpretLastReport.quantity) || 1),
                valueSet,
                memoryStoreSize: learnResult.count,
                needsReview: false,
                pendingFields: [],
                reviewFields: []
            });
            renderAutoInterpretMemoryPanel();
            updateBlueprintAutoInterpretStatus(`極強精準: 已依目前欄位修正通過｜${record.routeLabel}`, '#bfe7ff');
            recordAutoInterpretLog('guided-auto-interpret', '極強精準', autoInterpretLastReport, '人工修正後通過並加入核心記憶');
            showToast('極強結果已依目前欄位修正通過，並加入核心記憶');
        }
    }

    function rejectGuidedPrecisionResult() {
        if (!autoInterpretLastReport || String(autoInterpretLastReport.precisionMode || '') !== 'guided') {
            return showToast('目前沒有可退回的極強精準結果');
        }
        const record = syncGuidedPrecisionReviewRecord('rejected', {
            valueSet: buildCurrentCalcValueSet(),
            decisionNote: '本次極強結果退回，保留研究但不進核心記憶'
        });
        if (record) {
            updateBlueprintAutoInterpretStatus('極強精準: 本次結果已退回，僅保留研究紀錄', '#ffb0b0');
            recordAutoInterpretLog('guided-auto-interpret', '極強精準', autoInterpretLastReport, '審核退回，不進核心記憶');
            showToast('本次極強結果已退回，不會進入核心記憶');
        }
    }

    function learnAutoInterpretMemory(sample) {
        if (!sample || !sample.vector) return { count: getAutoInterpretMemoryStore().length, updated: false };
        const store = getAutoInterpretMemoryStore().slice();
        const next = {
            ts: new Date().toISOString(),
            type: String(sample.type || '').trim(),
            quantity: Math.max(1, Number(sample.quantity) || 1),
            longM: Number(sample.longM) || 0,
            shortM: Number(sample.shortM) || 0,
            quality: String(sample.quality || '未知'),
            vector: sample.vector
        };
        let updated = false;
        for (let i = 0; i < store.length; i += 1) {
            const sameType = String(store[i].type || '') === next.type;
            const score = calcBlueprintMemorySimilarity(next.vector, store[i]);
            if (sameType && score >= 0.9) {
                store[i] = { ...store[i], ...next };
                updated = true;
                break;
            }
        }
        if (!updated) {
            store.unshift(next);
        }
        persistAutoInterpretMemoryStore(store);
        return { count: getAutoInterpretMemoryStore().length, updated };
    }

    function getAutoInterpretMemoryHint(match) {
        if (!match || !match.best) return '';
        return `記憶參考 ${match.best.type} / ${match.best.quantity} 件 / 相似度 ${Math.round(match.similarity * 100)}%`;
    }

    function getAutoInterpretGateThreshold() {
        const gateInput = document.getElementById('advAutoInterpretGate');
        const gatePercent = Number(gateInput && gateInput.value);
        const minGatePercent = Math.round(AUTO_INTERPRET_GATE_DEFAULT_CONFIDENCE * 100);
        const normalizedPercent = Number.isFinite(gatePercent) ? Math.max(minGatePercent, Math.min(99, gatePercent)) : minGatePercent;
        return normalizedPercent / 100;
    }

    function evaluateAutoInterpretGate() {
        if (!autoInterpretNeedsReview) return { ok: true, msg: '' };
        return {
            ok: false,
            msg: autoInterpretGateReason || '自動判讀信心不足，請先複核或重跑判讀'
        };
    }

    function maybeReleaseAutoInterpretGateByManualAdjust() {
        if (!autoInterpretNeedsReview || !autoInterpretLastReport) return;
        const type = String(document.getElementById('calcType').value || '');
        const v1 = String(document.getElementById('v1').value || '');
        const v2 = String(document.getElementById('v2').value || '');
        const v3 = String(document.getElementById('v3').value || '');
        const qty = String(document.getElementById('qty').value || '');
        const currentSignature = `${type}|${v1}|${v2}|${v3}|${qty}`;
        if (currentSignature !== String(autoInterpretLastReport.inputSignature || '')) {
            autoInterpretNeedsReview = false;
            autoInterpretGateReason = '';
            if (String(autoInterpretLastReport.precisionMode || '') === 'guided' && guidedPrecisionCalcState.baseAnalysis) {
                syncGuidedPrecisionStateFromCurrentInputs('手動修正');
                const nextNeedsReview = guidedPrecisionCalcState.reviewGateState !== 'ready';
                autoInterpretNeedsReview = nextNeedsReview;
                autoInterpretGateReason = nextNeedsReview ? buildGuidedPrecisionReviewGateReason(guidedPrecisionCalcState) : '';
                autoInterpretLastReport = attachGuidedPrecisionReviewMeta({
                    ...buildGuidedPrecisionReportPayload(autoInterpretLastReport),
                    type,
                    quantity: Math.max(1, Number(qty) || 1),
                    overallConfidence: guidedPrecisionCalcState.consensusScore,
                    fieldConfidence: buildGuidedPrecisionFieldConfidenceMap(),
                    fieldConfidenceSummary: buildGuidedPrecisionFieldConfidenceSummary(
                        buildGuidedPrecisionFieldConfidenceMap(),
                        guidedPrecisionCalcState.schema
                    ),
                    pendingFields: guidedPrecisionCalcState.pendingRequiredFields.slice(),
                    valueSet: buildCurrentCalcValueSet(),
                    needsReview: nextNeedsReview,
                    decisionStatus: 'pending',
                    reviewDecisionLabel: getGuidedPrecisionReviewStatusLabel('pending'),
                    inputSignature: currentSignature
                });
                renderGuidedPrecisionPanel();
                updateAutoInterpretQaSummary(autoInterpretLastReport);
                updateBlueprintAutoInterpretStatus(
                    nextNeedsReview
                        ? `極強精準: 已手動調整欄位，但仍需複核 ${autoInterpretLastReport.reviewFields.join('、') || '候選一致性'}`
                        : '極強精準: 已手動調整欄位並同步候選卡',
                    nextNeedsReview ? '#ffd48a' : '#bfe7ff'
                );
                return;
            }
            updateBlueprintAutoInterpretStatus('自動判讀: 已手動調整參數，解除複核鎖定', '#bfe7ff');
            autoInterpretLastReport = attachGuidedPrecisionReviewMeta({
                ...autoInterpretLastReport,
                type,
                quantity: Math.max(1, Number(qty) || 1),
                pendingFields: [],
                valueSet: buildCurrentCalcValueSet(),
                reviewFields: [],
                needsReview: false,
                decisionStatus: 'pending',
                reviewDecisionLabel: getGuidedPrecisionReviewStatusLabel('pending'),
                inputSignature: currentSignature
            });
            updateAutoInterpretQaSummary(autoInterpretLastReport);
        }
    }

    function isAutoInterpretPlanOnlyModeEnabled() {
        const checkbox = document.getElementById('advAutoInterpretPlanOnly');
        return !checkbox || !!checkbox.checked;
    }

    function shouldAutoInterpretPreserveManualDepth(type) {
        if (!isAutoInterpretPlanOnlyModeEnabled()) return false;
        return ['C_VOL', 'C_COL', 'M_COL', 'M_BEAM_SIDES', 'M_BEAM_ALL', 'E_DIG'].includes(String(type || ''));
    }

    function applyAutoInterpretValuesToInputs(type, longM, shortM, finalQty) {
        const v1El = document.getElementById('v1');
        const v2El = document.getElementById('v2');
        const v3El = document.getElementById('v3');
        const qtyEl = document.getElementById('qty');
        const preserveManualDepth = shouldAutoInterpretPreserveManualDepth(type);
        const depthLabel = document.getElementById('lbl_v3') ? document.getElementById('lbl_v3').innerText : '高 / 深 (m)';
        let planSummary = `${longM.toFixed(2)}×${shortM.toFixed(2)} m`;

        if (type.startsWith('R_')) {
            if (v2El) v2El.value = longM.toFixed(2);
            if (v3El && !Number(v3El.value)) v3El.value = '1';
            if (qtyEl && !Number(qtyEl.value)) qtyEl.value = '1';
            return { preserveManualDepth: false, depthMissing: false, depthLabel, planSummary: `${longM.toFixed(2)} m`, manualDepthValue: Number(v3El && v3El.value) || 0 };
        }

        if (v1El) v1El.value = longM.toFixed(2);
        if (qtyEl) qtyEl.value = String(finalQty);

        if (type === 'M_WALL') {
            if (v2El) v2El.value = shortM.toFixed(2);
            return { preserveManualDepth: false, depthMissing: false, depthLabel, planSummary, manualDepthValue: Number(v3El && v3El.value) || 0 };
        }

        if (type === 'M_BEAM_SIDES') {
            if (v2El && !Number(v2El.value)) v2El.value = shortM.toFixed(2);
            if (v3El && !preserveManualDepth) v3El.value = shortM.toFixed(2);
            planSummary = `${longM.toFixed(2)} m（樑長）`;
        } else {
            if (v2El) v2El.value = shortM.toFixed(2);
            if (v3El && !preserveManualDepth && !Number(v3El.value)) v3El.value = '1.00';
        }

        const manualDepthValue = Number(v3El && v3El.value) || 0;
        return {
            preserveManualDepth,
            depthMissing: preserveManualDepth && !manualDepthValue,
            depthLabel,
            planSummary,
            manualDepthValue
        };
    }

    async function ensureBlueprintOcrLoaded() {
        if (window.Tesseract) return true;
        updateBlueprintAutoInterpretStatus('自動判讀: 載入尺寸標註辨識引擎中...', '#bfe7ff');
        await loadExternalScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
        return !!window.Tesseract;
    }

    function normalizeOcrDimensionText(text) {
        return String(text || '')
            .replace(/[ＯＯ]/g, '0')
            .replace(/[ｘX＊*]/g, 'x')
            .replace(/×/g, 'x')
            .replace(/[－—–]/g, '-')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function inferOcrDimensionUnitMultiplier(line, a, b) {
        const text = String(line || '').toLowerCase();
        if (/(mm|公釐)/.test(text)) return 0.001;
        if (/(cm|公分)/.test(text)) return 0.01;
        if (/(m|米|公尺)/.test(text)) return 1;
        const maxVal = Math.max(Math.abs(Number(a) || 0), Math.abs(Number(b) || 0));
        if (maxVal >= 100) return 0.001;
        if (maxVal >= 10) return 0.01;
        return 1;
    }

    function extractBlueprintOcrDimensionCandidates(text) {
        const lines = String(text || '')
            .split(/\n+/)
            .map(line => normalizeOcrDimensionText(line))
            .filter(Boolean);
        const candidates = [];
        const pattern = /(?:\b([BC]\d{1,3}[A-Z]?)\b)?\s*(柱|樑|梁|beam|column|col)?[^\d]{0,6}(\d{1,4}(?:\.\d+)?)\s*x\s*(\d{1,4}(?:\.\d+)?)/ig;
        lines.forEach(line => {
            let match;
            while ((match = pattern.exec(line)) !== null) {
                const tag = String(match[1] || '').trim();
                const kindText = String(match[2] || '').trim().toLowerCase();
                const a = parseFloat(match[3]);
                const b = parseFloat(match[4]);
                if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) continue;
                const multiplier = inferOcrDimensionUnitMultiplier(line, a, b);
                const firstM = a * multiplier;
                const secondM = b * multiplier;
                const upperLine = line.toUpperCase();
                let kind = '';
                if (/樑|梁|BEAM/.test(kindText) || /^B\d/.test(tag) || /\bB\d/.test(upperLine)) kind = 'beam';
                else if (/柱|COLUMN|COL/.test(kindText) || /^C\d/.test(tag) || /\bC\d/.test(upperLine)) kind = 'column';
                candidates.push({
                    raw: line,
                    tag,
                    kind,
                    firstM,
                    secondM,
                    score: (kind ? 0.4 : 0) + (tag ? 0.25 : 0) + (/x/.test(line) ? 0.2 : 0)
                });
            }
        });
        return candidates
            .filter(item => item.firstM > 0 && item.secondM > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);
    }

    function mapOcrCandidateToCalcType(candidate, currentType) {
        const current = String(currentType || '');
        if (candidate && candidate.kind === 'column') {
            if (current.startsWith('R_')) return current;
            if (current.startsWith('C_')) return 'C_COL';
            return 'M_COL';
        }
        if (candidate && candidate.kind === 'beam') {
            if (current === 'M_BEAM_ALL') return 'M_BEAM_ALL';
            if (current.startsWith('R_')) return current;
            if (current.startsWith('M_')) return 'M_BEAM_SIDES';
            return 'M_BEAM_SIDES';
        }
        return current;
    }

    function applyBlueprintOcrDimensionCandidate(candidate) {
        if (!candidate) return false;
        const typeEl = document.getElementById('calcType');
        const customNameEl = document.getElementById('customName');
        const v1El = document.getElementById('v1');
        const v2El = document.getElementById('v2');
        const v3El = document.getElementById('v3');
        let type = typeEl ? String(typeEl.value || '') : '';
        const suggestedType = mapOcrCandidateToCalcType(candidate, type);
        if (typeEl && suggestedType && suggestedType !== type) {
            typeEl.value = suggestedType;
            type = suggestedType;
            updateUI();
        }
        if (customNameEl && !customNameEl.value.trim() && candidate.tag) {
            customNameEl.value = `${candidate.tag}${candidate.kind === 'column' ? '柱' : candidate.kind === 'beam' ? '梁' : ''}`;
        }
        if (type === 'M_COL' || type === 'C_COL') {
            if (v1El) v1El.value = candidate.firstM.toFixed(2);
            if (v2El) v2El.value = candidate.secondM.toFixed(2);
        } else if (type === 'M_BEAM_SIDES' || type === 'M_BEAM_ALL') {
            if (v2El) v2El.value = candidate.firstM.toFixed(2);
            if (v3El && !Number(v3El.value)) v3El.value = candidate.secondM.toFixed(2);
        } else {
            if (v1El && !Number(v1El.value)) v1El.value = candidate.firstM.toFixed(2);
            if (v2El && !Number(v2El.value)) v2El.value = candidate.secondM.toFixed(2);
        }
        previewCalc();
        return true;
    }

    async function readBlueprintSizeAnnotations() {
        focusCalcAdvancedPage();
        if (!(await ensureFeatureAccess('blueprintAnnotationOcr', '尺寸標註辨識僅開放會員3（專家）'))) return;
        if (!img.src) return showToast('請先上傳圖紙再讀尺寸標註');
        try {
            await ensureBlueprintOcrLoaded();
            if (!window.Tesseract) return showToast('OCR 引擎載入失敗，請稍後重試');
            updateBlueprintAutoInterpretStatus('自動判讀: 正在讀取柱/樑尺寸標註...', '#bfe7ff');
            const off = document.createElement('canvas');
            const maxSide = 1800;
            const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
            off.width = Math.max(240, Math.round((img.naturalWidth || 1) * ratio));
            off.height = Math.max(240, Math.round((img.naturalHeight || 1) * ratio));
            const offCtx = off.getContext('2d', { willReadFrequently: true });
            if (!offCtx) return showToast('暫時無法建立 OCR 畫布');
            offCtx.drawImage(img, 0, 0, off.width, off.height);
            const result = await window.Tesseract.recognize(off, 'eng+chi_tra');
            const text = String(result && result.data && result.data.text ? result.data.text : '');
            const candidates = extractBlueprintOcrDimensionCandidates(text);
            if (!candidates.length) {
                updateBlueprintAutoInterpretStatus('自動判讀: 未讀到明顯柱/樑尺寸標註（可試更高對比）', '#ffd48a');
                return showToast('沒有讀到像 B3 30x70 / C1 40x60 這類尺寸標註');
            }
            const optionsText = candidates
                .slice(0, 5)
                .map((item, idx) => `${idx + 1}=${item.tag || '未命名'} ${item.kind === 'column' ? '柱' : item.kind === 'beam' ? '梁' : '尺寸'} ${item.firstM.toFixed(2)}x${item.secondM.toFixed(2)}m`)
                .join('\n');
            const picked = prompt(`已讀到以下尺寸標註，請選擇要套用的項目：\n${optionsText}\n0=取消`, '1');
            const pickedIndex = Math.max(0, parseInt(String(picked || '0').trim(), 10) - 1);
            if (!Number.isInteger(pickedIndex) || pickedIndex < 0 || pickedIndex >= candidates.length) {
                updateBlueprintAutoInterpretStatus(`自動判讀: 已讀到 ${candidates.length} 筆尺寸標註，等待手動選擇`, '#ffd48a');
                return showToast('已取消套用尺寸標註');
            }
            const selected = candidates[pickedIndex];
            if (!applyBlueprintOcrDimensionCandidate(selected)) {
                return showToast('尺寸標註套用失敗，請手動確認欄位');
            }
            updateBlueprintAutoInterpretStatus(
                `自動判讀: 已讀取尺寸標註 ${selected.tag || '未命名'} ${selected.kind === 'column' ? '柱' : selected.kind === 'beam' ? '梁' : ''} ${selected.firstM.toFixed(2)}×${selected.secondM.toFixed(2)} m`,
                '#9fffc0'
            );
            showToast(`已套用尺寸標註：${selected.tag || '未命名'} ${selected.firstM.toFixed(2)}×${selected.secondM.toFixed(2)}m`);
        } catch (err) {
            console.error('OCR 標註辨識失敗:', err);
            updateBlueprintAutoInterpretStatus('自動判讀: 尺寸標註辨識失敗（請重試）', '#ffd48a');
            showToast('尺寸標註辨識失敗，請先提升對比或換一張較清晰的圖');
        }
    }

    function estimateBlueprintObjectCount(bounds) {
        if (!img.src || !img.naturalWidth || !img.naturalHeight || !bounds) {
            return { count: 1, confidence: 0, sampleCount: 0 };
        }
        const maxSide = 360;
        const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(80, Math.round(img.naturalWidth * ratio));
        const h = Math.max(80, Math.round(img.naturalHeight * ratio));
        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const offCtx = off.getContext('2d', { willReadFrequently: true });
        if (!offCtx) return { count: 1, confidence: 0, sampleCount: 0 };
        offCtx.drawImage(img, 0, 0, w, h);
        const data = offCtx.getImageData(0, 0, w, h).data;

        const x0 = Math.max(0, Math.min(w - 1, Math.floor(bounds.x * ratio)));
        const y0 = Math.max(0, Math.min(h - 1, Math.floor(bounds.y * ratio)));
        const x1 = Math.max(x0 + 1, Math.min(w, Math.ceil((bounds.x + bounds.widthPx) * ratio)));
        const y1 = Math.max(y0 + 1, Math.min(h, Math.ceil((bounds.y + bounds.heightPx) * ratio)));
        const roiW = Math.max(1, x1 - x0);
        const roiH = Math.max(1, y1 - y0);
        const roiSize = roiW * roiH;
        if (roiSize < 400) return { count: 1, confidence: 0.12, sampleCount: 0 };

        let sum = 0;
        const gray = new Uint8Array(roiSize);
        let gi = 0;
        for (let y = y0; y < y1; y += 1) {
            for (let x = x0; x < x1; x += 1) {
                const i = (y * w + x) * 4;
                const g = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
                gray[gi] = g;
                sum += g;
                gi += 1;
            }
        }
        const mean = sum / gray.length;
        const threshold = Math.max(35, Math.min(210, mean * 0.82));
        const mask = new Uint8Array(gray.length);
        for (let i = 0; i < gray.length; i += 1) mask[i] = gray[i] < threshold ? 1 : 0;

        const visited = new Uint8Array(mask.length);
        const queue = new Int32Array(mask.length);
        const minArea = Math.max(8, Math.floor(roiSize * 0.00022));
        const maxArea = Math.max(minArea + 1, Math.floor(roiSize * 0.06));
        let components = 0;
        let acceptedSamples = 0;
        for (let i = 0; i < mask.length; i += 1) {
            if (!mask[i] || visited[i]) continue;
            let head = 0;
            let tail = 0;
            queue[tail++] = i;
            visited[i] = 1;
            let area = 0;
            while (head < tail) {
                const cur = queue[head++];
                area += 1;
                const cx = cur % roiW;
                const cy = Math.floor(cur / roiW);
                const left = cx > 0 ? cur - 1 : -1;
                const right = cx < roiW - 1 ? cur + 1 : -1;
                const up = cy > 0 ? cur - roiW : -1;
                const down = cy < roiH - 1 ? cur + roiW : -1;
                if (left >= 0 && mask[left] && !visited[left]) { visited[left] = 1; queue[tail++] = left; }
                if (right >= 0 && mask[right] && !visited[right]) { visited[right] = 1; queue[tail++] = right; }
                if (up >= 0 && mask[up] && !visited[up]) { visited[up] = 1; queue[tail++] = up; }
                if (down >= 0 && mask[down] && !visited[down]) { visited[down] = 1; queue[tail++] = down; }
            }
            if (area >= minArea && area <= maxArea) {
                components += 1;
                acceptedSamples += area;
            }
        }
        if (components <= 0) return { count: 1, confidence: 0.18, sampleCount: 0 };
        const density = acceptedSamples / roiSize;
        const confidence = Math.max(0.2, Math.min(0.94, 0.42 + Math.min(0.4, components / 80) + Math.min(0.12, density)));
        return { count: Math.max(1, components), confidence, sampleCount: components };
    }

    function readAutoInterpretCurrentInputs() {
        return {
            currentType: String(document.getElementById('calcType') ? document.getElementById('calcType').value : ''),
            currentInputs: {
                v1: readInputNumber('v1', 0),
                v2: readInputNumber('v2', 0),
                v3: readInputNumber('v3', 0)
            },
            currentQty: Math.max(1, readInputNumber('qty', 1))
        };
    }

    function resolveAutoInterpretScale(bounds, options = {}) {
        let scale = scalePixelsPerUnit;
        if (Number.isFinite(scale) && scale > 0) return { ok: true, scale };
        const promptText = String(options.promptText || `已抓到主體長邊約 ${Math.round(Number(bounds && bounds.longPx) || 0)} px。\n請輸入這條邊的實際長度（m）：`);
        const knownLong = prompt(promptText, String(options.defaultValue || '1'));
        const knownLongMeters = parseFloat(knownLong);
        if (Number.isFinite(knownLongMeters) && knownLongMeters > 0) {
            scalePixelsPerUnit = Number(bounds && bounds.longPx) / knownLongMeters;
            scale = scalePixelsPerUnit;
            const scaleInfo = document.getElementById('scale-info');
            if (scaleInfo) scaleInfo.innerText = String(options.scaleInfoText || '✅ 比例已設');
            return { ok: true, scale };
        }
        return {
            ok: false,
            reason: options.blockWithoutScale ? 'scale-required' : 'scale-missing',
            scale: 0
        };
    }

    async function collectAutoInterpretStageSignals(options = {}) {
        const qualityReport = updateBlueprintQualityStatus();
        const bounds = detectBlueprintPrimaryBounds();
        if (!bounds) {
            return {
                ok: false,
                reason: 'bounds-missing',
                qualityReport,
                message: String(options.missingBoundsMessage || '未偵測到明顯主體輪廓')
            };
        }
        const scaleResult = resolveAutoInterpretScale(bounds, {
            promptText: options.scalePromptText,
            defaultValue: options.scalePromptDefault,
            scaleInfoText: options.scaleInfoText,
            blockWithoutScale: options.blockWithoutScale
        });
        if (!scaleResult.ok) {
            return {
                ok: false,
                reason: scaleResult.reason,
                qualityReport,
                bounds,
                message: String(options.missingScaleMessage || '缺少比例')
            };
        }
        const inputState = readAutoInterpretCurrentInputs();
        const countResult = estimateBlueprintObjectCount(bounds);
        const memoryTypeMatch = findAutoInterpretMemoryMatch(bounds, qualityReport, '');
        const geometryConfidence = clampNumber(
            qualityToScore(qualityReport && qualityReport.quality) * 0.45 + Math.min(0.55, Number(bounds.coverage || 0) * 1.2),
            0.25,
            0.95
        );
        const ocrCandidates = options.includeOcr ? await collectGuidedPrecisionOcrCandidates() : [];
        return {
            ok: true,
            qualityReport,
            bounds,
            scale: scaleResult.scale,
            longM: Number(bounds.longPx || 0) / scaleResult.scale,
            shortM: Number(bounds.shortPx || 0) / scaleResult.scale,
            countResult,
            memoryTypeMatch,
            geometryConfidence,
            ocrCandidates,
            ...inputState
        };
    }

    function buildCurrentCalcValueSet() {
        return {
            type: String(document.getElementById('calcType') ? document.getElementById('calcType').value : ''),
            v1: String(document.getElementById('v1') ? document.getElementById('v1').value : ''),
            v2: String(document.getElementById('v2') ? document.getElementById('v2').value : ''),
            v3: String(document.getElementById('v3') ? document.getElementById('v3').value : ''),
            qty: String(document.getElementById('qty') ? document.getElementById('qty').value : '')
        };
    }

    function getGuidedPrecisionMissingValueLabels(valueSet) {
        const source = valueSet && typeof valueSet === 'object' ? valueSet : {};
        const missing = [];
        if (!String(source.type || '').trim()) missing.push('工種');
        if (!String(source.v1 || '').trim()) missing.push('v1');
        if (!String(source.v2 || '').trim()) missing.push('v2');
        if (!String(source.qty || '').trim()) missing.push('數量');
        return missing;
    }

    function buildGuidedPrecisionMemorySampleFromValueSet(valueSet) {
        if (!guidedPrecisionCalcState.baseAnalysis) return null;
        const vector = buildBlueprintFeatureVector(guidedPrecisionCalcState.baseAnalysis.bounds, guidedPrecisionCalcState.baseAnalysis.qualityReport);
        return {
            type: String(valueSet.type || '').trim(),
            quantity: Math.max(1, Number(valueSet.qty) || 1),
            longM: Number(valueSet.v1) || Number(guidedPrecisionCalcState.baseAnalysis.longM || 0),
            shortM: Number(valueSet.v2) || Number(guidedPrecisionCalcState.baseAnalysis.shortM || 0),
            quality: guidedPrecisionCalcState.qualityLabel,
            vector
        };
    }

    function buildGuidedPrecisionFieldConfidenceSummary(fieldConfidence, schema = []) {
        const labels = new Map((Array.isArray(schema) ? schema : []).map(item => [item.id, item.label]));
        const parts = Object.entries(fieldConfidence || {})
            .filter(([, score]) => Number.isFinite(Number(score)) && Number(score) > 0)
            .map(([fieldId, score]) => `${labels.get(fieldId) || fieldId} ${Math.round(Number(score) * 100)}%`);
        return parts.join(' / ');
    }

    function getGuidedPrecisionConflictText(fieldId, candidates) {
        const list = Array.isArray(candidates) ? candidates.slice().sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0)) : [];
        if (list.length < 2) return '';
        const first = list[0];
        const second = list[1];
        if (fieldId === 'type') {
            return String(first.value || '') !== String(second.value || '')
                ? `候選衝突：${getCalcTypeDisplayName(first.value)} / ${getCalcTypeDisplayName(second.value)}`
                : '';
        }
        const firstVal = Number(first.value || 0);
        const secondVal = Number(second.value || 0);
        if (!Number.isFinite(firstVal) || !Number.isFinite(secondVal)) return '';
        const diff = Math.abs(firstVal - secondVal);
        if (fieldId === 'qty') {
            return diff >= 1 ? `候選衝突：${Math.round(firstVal)} / ${Math.round(secondVal)}` : '';
        }
        return diff >= Math.max(0.08, Math.max(Math.abs(firstVal), Math.abs(secondVal)) * 0.12)
            ? `候選衝突：${firstVal.toFixed(2)}m / ${secondVal.toFixed(2)}m`
            : '';
    }

    function createGuidedPrecisionCandidateEvidence(candidate) {
        return {
            source: String(candidate && candidate.source || '候選'),
            confidence: clampNumber(Number(candidate && candidate.confidence) || 0, 0.18, 0.98),
            detail: String(candidate && candidate.detail || '')
        };
    }

    function getGuidedPrecisionCandidateSourceList(candidate) {
        const list = Array.isArray(candidate && candidate.sourceList) ? candidate.sourceList : [];
        if (list.length) {
            return Array.from(new Set(list.map(item => String(item || '').trim()).filter(Boolean)));
        }
        const single = String(candidate && candidate.source || '').trim();
        return single ? [single] : [];
    }

    function getGuidedPrecisionCandidateSourceSummary(candidate) {
        const sourceList = getGuidedPrecisionCandidateSourceList(candidate);
        return sourceList.length ? sourceList.join(' + ') : '未標記來源';
    }

    function mergeGuidedPrecisionCandidateEvidence(existingCandidate, nextCandidate) {
        const evidenceList = Array.isArray(existingCandidate && existingCandidate.evidenceList)
            ? existingCandidate.evidenceList.slice()
            : [];
        const nextEvidenceList = Array.isArray(nextCandidate && nextCandidate.evidenceList) && nextCandidate.evidenceList.length
            ? nextCandidate.evidenceList
            : [createGuidedPrecisionCandidateEvidence(nextCandidate)];
        nextEvidenceList.forEach(entry => {
            const source = String(entry && entry.source || '').trim();
            const detail = String(entry && entry.detail || '');
            const duplicate = evidenceList.some(item => String(item.source || '').trim() === source && String(item.detail || '') === detail);
            if (!duplicate) evidenceList.push(createGuidedPrecisionCandidateEvidence(entry));
        });
        const sourceList = Array.from(new Set(evidenceList.map(item => String(item.source || '').trim()).filter(Boolean)));
        const baseConfidence = Math.max(
            Number(existingCandidate && (existingCandidate.baseConfidence || existingCandidate.confidence) || 0),
            Number(nextCandidate && (nextCandidate.baseConfidence || nextCandidate.confidence) || 0)
        );
        const supportBonus = Math.min(0.16, Math.max(0, sourceList.length - 1) * 0.05);
        return {
            ...existingCandidate,
            confidence: clampNumber(baseConfidence + supportBonus, 0.18, 0.98),
            baseConfidence,
            source: sourceList[0] || String(existingCandidate && existingCandidate.source || nextCandidate && nextCandidate.source || '候選'),
            sourceList,
            supportingSourceCount: sourceList.length,
            evidenceList
        };
    }

    function buildGuidedPrecisionFieldCrossValidation(fieldId, spec, fieldState, selected) {
        const candidates = fieldState && Array.isArray(fieldState.candidates) ? fieldState.candidates : [];
        const conflictText = getGuidedPrecisionConflictText(fieldId, candidates);
        const supportingSourceCount = selected
            ? Math.max(1, Number(selected.supportingSourceCount || getGuidedPrecisionCandidateSourceList(selected).length || 1))
            : 0;
        const reviewReasons = [];
        if (spec && spec.required && !selected) reviewReasons.push('缺少已確認候選');
        if (selected && Number(selected.confidence || 0) < 0.72) reviewReasons.push('選定候選信心偏低');
        if (conflictText && supportingSourceCount < 2) reviewReasons.push(conflictText);
        const sourceSummary = selected ? getGuidedPrecisionCandidateSourceSummary(selected) : '';
        const summaryParts = [];
        if (selected) summaryParts.push(`交叉驗證 ${supportingSourceCount} 源`);
        else summaryParts.push('尚未選定候選');
        summaryParts.push(`候選 ${candidates.length} 筆`);
        if (sourceSummary) summaryParts.push(sourceSummary);
        return {
            candidateCount: candidates.length,
            supportingSourceCount,
            sourceSummary,
            reviewRequired: reviewReasons.length > 0,
            reviewReasons,
            summaryText: summaryParts.join('｜')
        };
    }

    function buildGuidedPrecisionCrossValidationSummary(state) {
        const nextState = state || guidedPrecisionCalcState;
        const reviewReasons = [];
        let reviewFieldCount = 0;
        let multiSourceFieldCount = 0;
        (Array.isArray(nextState.schema) ? nextState.schema : []).forEach(spec => {
            const fieldState = nextState.fields && nextState.fields[spec.id] ? nextState.fields[spec.id] : null;
            const crossValidation = fieldState && fieldState.crossValidation ? fieldState.crossValidation : null;
            if (!crossValidation) return;
            if (crossValidation.supportingSourceCount >= 2) multiSourceFieldCount += 1;
            if (crossValidation.reviewRequired) {
                reviewFieldCount += 1;
                crossValidation.reviewReasons.forEach(reason => {
                    reviewReasons.push(`${spec.label}：${reason}`);
                });
            }
        });
        nextState.multiSourceFieldCount = multiSourceFieldCount;
        nextState.reviewFieldCount = reviewFieldCount;
        nextState.reviewGateReasons = reviewReasons.slice(0, 6);
        nextState.reviewGateState = nextState.pendingRequiredFields.length
            ? 'pending'
            : (reviewFieldCount > 0 ? 'review' : 'ready');
        nextState.crossValidationSummary = `多來源候選交叉驗證：${multiSourceFieldCount}/${(nextState.schema || []).length} 欄達雙源支持｜欄位級複核 ${reviewFieldCount} 欄`;
        return nextState;
    }

    function buildGuidedPrecisionFieldCrossValidationReport(state = guidedPrecisionCalcState) {
        const result = {};
        (Array.isArray(state && state.schema) ? state.schema : []).forEach(spec => {
            const fieldState = state && state.fields ? state.fields[spec.id] : null;
            const crossValidation = fieldState && fieldState.crossValidation ? fieldState.crossValidation : null;
            if (!crossValidation) return;
            result[spec.id] = {
                label: spec.label,
                candidateCount: crossValidation.candidateCount,
                supportingSourceCount: crossValidation.supportingSourceCount,
                sourceSummary: crossValidation.sourceSummary,
                reviewRequired: crossValidation.reviewRequired,
                reviewReasons: crossValidation.reviewReasons.slice()
            };
        });
        return result;
    }

    function getGuidedPrecisionReviewFieldLabels(state = guidedPrecisionCalcState) {
        const labels = [];
        (Array.isArray(state && state.schema) ? state.schema : []).forEach(spec => {
            const fieldState = state && state.fields ? state.fields[spec.id] : null;
            const crossValidation = fieldState && fieldState.crossValidation ? fieldState.crossValidation : null;
            if (crossValidation && crossValidation.reviewRequired) labels.push(spec.label);
        });
        return labels;
    }

    function buildGuidedPrecisionReviewGateReason(state = guidedPrecisionCalcState) {
        if (!state) return '';
        if (Array.isArray(state.pendingRequiredFields) && state.pendingRequiredFields.length) {
            return `極強精準模式仍有待補欄位：${state.pendingRequiredFields.join('、')}`;
        }
        if (Array.isArray(state.reviewGateReasons) && state.reviewGateReasons.length) {
            return `極強精準模式仍需欄位級複核：${state.reviewGateReasons.join('｜')}`;
        }
        return '';
    }

    function buildGuidedPrecisionReportPayload(baseReport = {}) {
        const reviewFields = getGuidedPrecisionReviewFieldLabels(guidedPrecisionCalcState);
        return attachGuidedPrecisionReviewMeta({
            ...baseReport,
            crossValidationReport: buildGuidedPrecisionFieldCrossValidationReport(guidedPrecisionCalcState),
            crossValidationSummary: String(guidedPrecisionCalcState.crossValidationSummary || ''),
            multiSourceFieldCount: Number(guidedPrecisionCalcState.multiSourceFieldCount || 0),
            reviewFieldCount: Number(guidedPrecisionCalcState.reviewFieldCount || 0),
            reviewFields,
            reviewGateState: String(guidedPrecisionCalcState.reviewGateState || 'pending'),
            reviewGateReasons: Array.isArray(guidedPrecisionCalcState.reviewGateReasons) ? guidedPrecisionCalcState.reviewGateReasons.slice() : []
        });
    }

    function updateAutoInterpretQaSummary(report = autoInterpretLastReport) {
        const box = document.getElementById('autoInterpretQaSummary');
        if (!box) return;
        if (!report) {
            box.innerText = '看圖 QA：待命';
            box.style.color = '#d8ebff';
            autoInterpretQaStats.lastSummary = box.innerText;
            updateQaDashboard();
            return;
        }
        const overall = Math.round((Number(report.overallConfidence) || 0) * 100);
        const fieldSummary = String(report.fieldConfidenceSummary || '').trim();
        const pending = Array.isArray(report.pendingFields) && report.pendingFields.length
            ? `｜待補 ${report.pendingFields.join('、')}`
            : '';
        const review = report.needsReview
            ? `｜需複核${Array.isArray(report.reviewFields) && report.reviewFields.length ? ` ${report.reviewFields.join('、')}` : ''}`
            : '';
        const crossValidation = String(report.crossValidationSummary || '').trim();
        const serverQa = Number.isFinite(Number(report.serverQaScore))
            ? `｜後端QA ${String(report.serverQaLevel || '').trim() || '待評'} ${Math.round(Number(report.serverQaScore) || 0)}`
            : '';
        const modeLabel = String(report.precisionMode || '') === 'guided' ? '極強精準' : '快速版';
        const routeText = String(report.confidenceRouteLabel || '').trim();
        const decisionText = String(report.reviewDecisionLabel || '').trim();
        box.innerText = `看圖 QA：${modeLabel}｜總信心 ${overall}%${routeText ? `｜分流 ${routeText}` : ''}${decisionText ? `｜審核 ${decisionText}` : ''}${fieldSummary ? `｜${fieldSummary}` : ''}${crossValidation ? `｜${crossValidation}` : ''}${pending}${review}${serverQa}`;
        box.style.color = String(report.decisionStatus || '') === 'rejected'
            ? '#ff9a9a'
            : (report.needsReview ? '#ffd48a' : (String(report.precisionMode || '') === 'guided' ? '#fff1b8' : '#d8ebff'));
        autoInterpretQaStats.lastSummary = box.innerText;
        updateQaDashboard();
    }

    function trackAutoInterpretQaStats(mode, report, options = {}) {
        const key = String(mode || '');
        const needsReview = !!(options.needsReview || (report && report.needsReview));
        const shouldCountRun = options.incrementRun !== false;
        if (key === 'guided') {
            autoInterpretQaStats.guidedRuns += shouldCountRun ? 1 : 0;
            if (needsReview) autoInterpretQaStats.guidedNeedsReview += 1;
            if (options.applied) autoInterpretQaStats.guidedApplied += 1;
        } else {
            autoInterpretQaStats.quickRuns += shouldCountRun ? 1 : 0;
            if (needsReview) autoInterpretQaStats.quickNeedsReview += 1;
        }
        if (shouldCountRun && report && Number(report.memorySimilarity || 0) > 0) autoInterpretQaStats.memoryHits += 1;
        if (shouldCountRun && report && Number(report.ocrCandidateCount || 0) > 0) autoInterpretQaStats.ocrHits += 1;
        updateAutoInterpretQaSummary(report);
    }

    function getCalcTypeDisplayName(type) {
        const select = document.getElementById('calcType');
        const options = select ? Array.from(select.options || []) : [];
        const match = options.find(option => String(option.value || '') === String(type || ''));
        return match ? String(match.textContent || '').split(' (')[0] : String(type || '未指定');
    }

    function getGuidedPrecisionTone(score) {
        const normalized = clampNumber(Number(score) || 0, 0, 1);
        if (normalized >= 0.86) return { label: '高信心', className: '' };
        if (normalized >= 0.72) return { label: '可複核', className: 'warn' };
        if (normalized > 0) return { label: '低信心', className: 'bad' };
        return { label: '待補值', className: 'bad' };
    }

    function getGuidedPrecisionFieldSchema(type) {
        switch (String(type || '')) {
        case 'M_WALL':
            return [
                { id: 'type', label: '構件類型', required: true },
                { id: 'v1', label: '牆長', required: true },
                { id: 'v2', label: '牆高/版短邊', required: true },
                { id: 'qty', label: '數量', required: true }
            ];
        case 'M_COL':
            return [
                { id: 'type', label: '構件類型', required: true },
                { id: 'v1', label: '柱寬 A', required: true },
                { id: 'v2', label: '柱寬 B', required: true },
                { id: 'v3', label: '柱高', required: true },
                { id: 'qty', label: '數量', required: true }
            ];
        case 'M_BEAM_SIDES':
            return [
                { id: 'type', label: '構件類型', required: true },
                { id: 'v1', label: '樑長', required: true },
                { id: 'v3', label: '樑側高', required: true },
                { id: 'v2', label: '樑寬（選填）', required: false },
                { id: 'qty', label: '數量', required: true }
            ];
        case 'M_BEAM_ALL':
            return [
                { id: 'type', label: '構件類型', required: true },
                { id: 'v1', label: '樑長', required: true },
                { id: 'v2', label: '樑寬', required: true },
                { id: 'v3', label: '樑高', required: true },
                { id: 'qty', label: '數量', required: true }
            ];
        case 'C_COL':
            return [
                { id: 'type', label: '構件類型', required: true },
                { id: 'v1', label: '柱長 A', required: true },
                { id: 'v2', label: '柱寬 B', required: true },
                { id: 'v3', label: '柱高', required: true },
                { id: 'qty', label: '數量', required: true }
            ];
        case 'R_SLAB':
            return [
                { id: 'type', label: '構件類型', required: true },
                { id: 'v2', label: '單排長度', required: true },
                { id: 'qty', label: '數量', required: true }
            ];
        case 'R_MAIN':
            return [
                { id: 'type', label: '構件類型', required: true },
                { id: 'v2', label: '主筋單支長度', required: true },
                { id: 'qty', label: '數量', required: true }
            ];
        case 'R_HOOP':
            return [
                { id: 'type', label: '構件類型', required: true },
                { id: 'v2', label: '箍筋單圈長度', required: true },
                { id: 'qty', label: '數量', required: true }
            ];
        case 'E_DIG':
            return [
                { id: 'type', label: '構件類型', required: true },
                { id: 'v1', label: '開挖長度', required: true },
                { id: 'v2', label: '開挖寬度', required: true },
                { id: 'v3', label: '開挖深度', required: true },
                { id: 'qty', label: '數量', required: true }
            ];
        case 'C_VOL':
        default:
            return [
                { id: 'type', label: '構件類型', required: true },
                { id: 'v1', label: '長度', required: true },
                { id: 'v2', label: '寬度', required: true },
                { id: 'v3', label: '高度/深度', required: true },
                { id: 'qty', label: '數量', required: true }
            ];
        }
    }

    function pushGuidedPrecisionCandidate(fieldBuckets, fieldId, candidate) {
        if (!fieldBuckets[fieldId]) fieldBuckets[fieldId] = [];
        if (!candidate) return;
        const isTypeField = fieldId === 'type';
        if (!isTypeField && !Number.isFinite(Number(candidate.value))) return;
        const nextValue = isTypeField
            ? String(candidate.value || '')
            : (fieldId === 'qty'
                ? Math.max(1, Math.round(Number(candidate.value) || 0))
                : Number(candidate.value));
        if (!isTypeField && !Number.isFinite(nextValue)) return;
        const normalizedValue = isTypeField
            ? String(nextValue)
            : (fieldId === 'qty' ? String(nextValue) : Number(nextValue).toFixed(3));
        const listRef = fieldBuckets[fieldId];
        const evidence = createGuidedPrecisionCandidateEvidence(candidate);
        const next = {
            id: `${fieldId}_${listRef.length + 1}`,
            fieldId,
            value: nextValue,
            source: String(candidate.source || '候選'),
            confidence: evidence.confidence,
            baseConfidence: evidence.confidence,
            detail: String(candidate.detail || ''),
            normalizedValue,
            sourceList: [String(candidate.source || '候選')],
            supportingSourceCount: 1,
            evidenceList: [evidence]
        };
        const existingIndex = listRef.findIndex(item => item.normalizedValue === normalizedValue);
        if (existingIndex >= 0) {
            const merged = mergeGuidedPrecisionCandidateEvidence(listRef[existingIndex], next);
            if (Number(next.confidence || 0) >= Number(listRef[existingIndex].confidence || 0)) {
                merged.detail = next.detail || listRef[existingIndex].detail || '';
                merged.value = next.value;
                merged.source = next.source || listRef[existingIndex].source;
            }
            listRef[existingIndex] = { ...merged, id: listRef[existingIndex].id };
            return;
        }
        listRef.push(next);
    }

    function mapGuidedPrecisionPlanDimensions(type, longM, shortM) {
        const mapped = {};
        switch (String(type || '')) {
        case 'M_WALL':
        case 'M_COL':
        case 'C_COL':
        case 'C_VOL':
        case 'E_DIG':
            mapped.v1 = longM;
            mapped.v2 = shortM;
            break;
        case 'M_BEAM_SIDES':
            mapped.v1 = longM;
            mapped.v2 = shortM;
            break;
        case 'M_BEAM_ALL':
            mapped.v1 = longM;
            mapped.v2 = shortM;
            break;
        case 'R_SLAB':
        case 'R_MAIN':
        case 'R_HOOP':
            mapped.v2 = longM;
            break;
        default:
            mapped.v1 = longM;
            mapped.v2 = shortM;
            break;
        }
        return mapped;
    }

    async function collectGuidedPrecisionOcrCandidates() {
        if (!img.src) return [];
        try {
            await ensureBlueprintOcrLoaded();
            if (!window.Tesseract) return [];
            const off = document.createElement('canvas');
            const maxSide = 1800;
            const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
            off.width = Math.max(240, Math.round((img.naturalWidth || 1) * ratio));
            off.height = Math.max(240, Math.round((img.naturalHeight || 1) * ratio));
            const offCtx = off.getContext('2d', { willReadFrequently: true });
            if (!offCtx) return [];
            offCtx.drawImage(img, 0, 0, off.width, off.height);
            const result = await window.Tesseract.recognize(off, 'eng+chi_tra');
            const text = String(result && result.data && result.data.text ? result.data.text : '');
            return extractBlueprintOcrDimensionCandidates(text);
        } catch (err) {
            console.error('極強精準 OCR 失敗:', err);
            return [];
        }
    }

    function buildGuidedPrecisionTypeCandidates(baseAnalysis) {
        const fieldBuckets = { type: [] };
        const currentType = String(baseAnalysis && baseAnalysis.currentType || '');
        if (currentType) {
            pushGuidedPrecisionCandidate(fieldBuckets, 'type', {
                value: currentType,
                source: '目前工種',
                confidence: 0.58,
                detail: '沿用目前工種設定'
            });
        }
        const memoryTypeMatch = baseAnalysis && baseAnalysis.memoryTypeMatch;
        if (memoryTypeMatch && memoryTypeMatch.best && memoryTypeMatch.best.type) {
            pushGuidedPrecisionCandidate(fieldBuckets, 'type', {
                value: String(memoryTypeMatch.best.type || ''),
                source: '記憶比對',
                confidence: 0.58 + Math.min(0.32, Number(memoryTypeMatch.similarity || 0) * 0.32),
                detail: getAutoInterpretMemoryHint(memoryTypeMatch)
            });
        }
        (Array.isArray(baseAnalysis && baseAnalysis.ocrCandidates) ? baseAnalysis.ocrCandidates : []).slice(0, 5).forEach(candidate => {
            const mappedType = mapOcrCandidateToCalcType(candidate, currentType || 'C_VOL');
            if (!mappedType) return;
            pushGuidedPrecisionCandidate(fieldBuckets, 'type', {
                value: mappedType,
                source: 'OCR標註',
                confidence: 0.56 + Math.min(0.34, Number(candidate.score || 0) * 0.34) + (candidate.tag ? 0.04 : 0),
                detail: `${candidate.tag || '未命名'} ${candidate.firstM.toFixed(2)}×${candidate.secondM.toFixed(2)}m`
            });
        });
        return (fieldBuckets.type || []).sort((a, b) => b.confidence - a.confidence);
    }

    function buildGuidedPrecisionFieldCandidates(baseAnalysis, type, memoryMatch) {
        const fieldBuckets = {};
        const geometryMap = mapGuidedPrecisionPlanDimensions(type, Number(baseAnalysis.longM || 0), Number(baseAnalysis.shortM || 0));
        const geometryConfidence = clampNumber(Number(baseAnalysis.geometryConfidence) || 0.45, 0.25, 0.95);
        Object.entries(geometryMap).forEach(([fieldId, value]) => {
            pushGuidedPrecisionCandidate(fieldBuckets, fieldId, {
                value,
                source: '幾何輪廓',
                confidence: 0.46 + geometryConfidence * 0.36,
                detail: `主體外框 ${Number(baseAnalysis.longM || 0).toFixed(2)}×${Number(baseAnalysis.shortM || 0).toFixed(2)}m`
            });
        });

        const currentInputs = baseAnalysis.currentInputs || {};
        ['v1', 'v2', 'v3'].forEach(fieldId => {
            if (!Number.isFinite(Number(currentInputs[fieldId])) || Number(currentInputs[fieldId]) <= 0) return;
            pushGuidedPrecisionCandidate(fieldBuckets, fieldId, {
                value: Number(currentInputs[fieldId]),
                source: '目前欄位',
                confidence: fieldId === 'v3' ? 0.82 : 0.68,
                detail: '保留目前手填值'
            });
        });
        if (Number.isFinite(Number(baseAnalysis.currentQty)) && Number(baseAnalysis.currentQty) > 0) {
            pushGuidedPrecisionCandidate(fieldBuckets, 'qty', {
                value: Number(baseAnalysis.currentQty),
                source: '目前欄位',
                confidence: 0.66,
                detail: '保留目前數量'
            });
        }

        const memorySim = memoryMatch ? clampNumber(Number(memoryMatch.similarity) || 0, 0, 1) : 0;
        if (memoryMatch && memoryMatch.best) {
            const best = memoryMatch.best;
            const longConfidence = 0.40 + memorySim * 0.32;
            const shortConfidence = 0.38 + memorySim * 0.28;
            if (['M_WALL', 'M_COL', 'C_COL', 'C_VOL', 'E_DIG'].includes(String(type || ''))) {
                pushGuidedPrecisionCandidate(fieldBuckets, 'v1', {
                    value: Number(best.longM || 0),
                    source: '記憶案例',
                    confidence: longConfidence,
                    detail: getAutoInterpretMemoryHint(memoryMatch)
                });
                pushGuidedPrecisionCandidate(fieldBuckets, 'v2', {
                    value: Number(best.shortM || 0),
                    source: '記憶案例',
                    confidence: shortConfidence,
                    detail: getAutoInterpretMemoryHint(memoryMatch)
                });
            } else if (['M_BEAM_SIDES', 'M_BEAM_ALL'].includes(String(type || ''))) {
                pushGuidedPrecisionCandidate(fieldBuckets, 'v1', {
                    value: Number(best.longM || 0),
                    source: '記憶案例',
                    confidence: longConfidence,
                    detail: getAutoInterpretMemoryHint(memoryMatch)
                });
                pushGuidedPrecisionCandidate(fieldBuckets, 'v2', {
                    value: Number(best.shortM || 0),
                    source: '記憶案例',
                    confidence: shortConfidence - 0.08,
                    detail: '記憶中的平面短邊'
                });
            }
            pushGuidedPrecisionCandidate(fieldBuckets, 'qty', {
                value: Number(best.quantity || 1),
                source: '記憶案例',
                confidence: 0.42 + memorySim * 0.34,
                detail: getAutoInterpretMemoryHint(memoryMatch)
            });
        }

        (Array.isArray(baseAnalysis.ocrCandidates) ? baseAnalysis.ocrCandidates : []).slice(0, 5).forEach(candidate => {
            const mappedType = mapOcrCandidateToCalcType(candidate, type);
            const allowGeneric = ['M_WALL', 'C_VOL', 'E_DIG'].includes(String(type || '')) && !candidate.kind;
            if (mappedType !== type && !allowGeneric) return;
            const ocrConfidence = 0.50 + Math.min(0.34, Number(candidate.score || 0) * 0.34) + (candidate.tag ? 0.04 : 0);
            const detail = `${candidate.tag || '未命名'} ${candidate.firstM.toFixed(2)}×${candidate.secondM.toFixed(2)}m`;
            if (type === 'M_COL' || type === 'C_COL') {
                pushGuidedPrecisionCandidate(fieldBuckets, 'v1', { value: candidate.firstM, source: 'OCR標註', confidence: ocrConfidence, detail });
                pushGuidedPrecisionCandidate(fieldBuckets, 'v2', { value: candidate.secondM, source: 'OCR標註', confidence: ocrConfidence, detail });
            } else if (type === 'M_BEAM_SIDES' || type === 'M_BEAM_ALL') {
                pushGuidedPrecisionCandidate(fieldBuckets, 'v2', { value: candidate.firstM, source: 'OCR標註', confidence: ocrConfidence, detail: `${detail}（樑寬）` });
                pushGuidedPrecisionCandidate(fieldBuckets, 'v3', { value: candidate.secondM, source: 'OCR標註', confidence: ocrConfidence, detail: `${detail}（樑高）` });
            } else if (allowGeneric) {
                pushGuidedPrecisionCandidate(fieldBuckets, 'v1', { value: candidate.firstM, source: 'OCR標註', confidence: ocrConfidence - 0.08, detail });
                pushGuidedPrecisionCandidate(fieldBuckets, 'v2', { value: candidate.secondM, source: 'OCR標註', confidence: ocrConfidence - 0.08, detail });
            }
        });

        if (!String(type || '').startsWith('R_') && baseAnalysis.countResult && Number(baseAnalysis.countResult.count) > 0) {
            pushGuidedPrecisionCandidate(fieldBuckets, 'qty', {
                value: Number(baseAnalysis.countResult.count || 1),
                source: '輪廓數量',
                confidence: 0.34 + clampNumber(Number(baseAnalysis.countResult.confidence) || 0, 0, 1) * 0.46,
                detail: `畫面樣本 ${Number(baseAnalysis.countResult.sampleCount || 0)} 組`
            });
        }
        return fieldBuckets;
    }

    function getGuidedPrecisionCurrentSignature() {
        const type = String(document.getElementById('calcType') ? document.getElementById('calcType').value : '');
        const v1 = String(document.getElementById('v1') ? document.getElementById('v1').value : '');
        const v2 = String(document.getElementById('v2') ? document.getElementById('v2').value : '');
        const v3 = String(document.getElementById('v3') ? document.getElementById('v3').value : '');
        const qty = String(document.getElementById('qty') ? document.getElementById('qty').value : '');
        return `${type}|${v1}|${v2}|${v3}|${qty}`;
    }

    function recomputeGuidedPrecisionState(state) {
        const nextState = state || guidedPrecisionCalcState;
        const pending = [];
        let confidenceSum = 0;
        let confidenceCount = 0;
        (Array.isArray(nextState.schema) ? nextState.schema : []).forEach(spec => {
            const fieldState = nextState.fields && nextState.fields[spec.id] ? nextState.fields[spec.id] : null;
            const selected = fieldState && Array.isArray(fieldState.candidates)
                ? fieldState.candidates.find(item => item.id === fieldState.selectedCandidateId)
                : null;
            fieldState.selectedConfidence = selected ? Number(selected.confidence || 0) : 0;
            fieldState.crossValidation = buildGuidedPrecisionFieldCrossValidation(spec.id, spec, fieldState, selected);
            if (spec.required) {
                if (!selected) pending.push(spec.label);
                else {
                    confidenceSum += Number(selected.confidence || 0);
                    confidenceCount += 1;
                }
            }
        });
        nextState.pendingRequiredFields = pending;
        nextState.consensusScore = confidenceCount > 0 ? (confidenceSum / confidenceCount) : 0;
        buildGuidedPrecisionCrossValidationSummary(nextState);
        return nextState;
    }

    function getGuidedPrecisionSelectedCandidate(fieldId) {
        const fieldState = guidedPrecisionCalcState.fields ? guidedPrecisionCalcState.fields[fieldId] : null;
        if (!fieldState || !Array.isArray(fieldState.candidates)) return null;
        return fieldState.candidates.find(item => item.id === fieldState.selectedCandidateId) || null;
    }

    function buildGuidedPrecisionStateFromAnalysis(baseAnalysis, forcedType = '') {
        const nextState = createDefaultGuidedPrecisionCalcState();
        nextState.active = true;
        nextState.runId = Number(baseAnalysis && baseAnalysis.runId) || 0;
        nextState.baseAnalysis = baseAnalysis;
        nextState.qualityLabel = String(baseAnalysis && baseAnalysis.qualityReport && baseAnalysis.qualityReport.quality || '未知');
        const typeCandidates = buildGuidedPrecisionTypeCandidates(baseAnalysis);
        const preferredType = String(forcedType || '').trim();
        if (preferredType && !typeCandidates.some(item => String(item.value || '') === preferredType)) {
            typeCandidates.unshift({
                id: 'type_manual',
                fieldId: 'type',
                value: preferredType,
                source: '手動切換',
                confidence: 0.72,
                detail: '由使用者強制切換類型',
                normalizedValue: preferredType
            });
        }
        nextState.typeCandidates = typeCandidates.sort((a, b) => b.confidence - a.confidence);
        nextState.recommendedType = preferredType || (nextState.typeCandidates[0] ? String(nextState.typeCandidates[0].value || '') : String(baseAnalysis.currentType || 'C_VOL'));
        nextState.memoryMatch = findAutoInterpretMemoryMatch(baseAnalysis.bounds, baseAnalysis.qualityReport, nextState.recommendedType);
        nextState.schema = getGuidedPrecisionFieldSchema(nextState.recommendedType);
        const fieldBuckets = buildGuidedPrecisionFieldCandidates(baseAnalysis, nextState.recommendedType, nextState.memoryMatch);

        nextState.schema.forEach(spec => {
            let candidates = [];
            if (spec.id === 'type') {
                candidates = nextState.typeCandidates.map((item, idx) => ({
                    ...item,
                    id: `type_${idx + 1}`
                }));
            } else {
                candidates = (fieldBuckets[spec.id] || []).slice().sort((a, b) => b.confidence - a.confidence);
            }
            const selectedCandidate = spec.id === 'type'
                ? (candidates.find(item => String(item.value || '') === nextState.recommendedType) || candidates[0] || null)
                : (candidates[0] || null);
            nextState.fields[spec.id] = {
                label: spec.label,
                required: !!spec.required,
                candidates,
                selectedCandidateId: selectedCandidate ? selectedCandidate.id : '',
                selectedConfidence: selectedCandidate ? Number(selectedCandidate.confidence || 0) : 0,
                conflictText: getGuidedPrecisionConflictText(spec.id, candidates)
            };
        });

        recomputeGuidedPrecisionState(nextState);
        const ocrText = `OCR ${Array.isArray(baseAnalysis.ocrCandidates) ? baseAnalysis.ocrCandidates.length : 0} 筆`;
        const countText = baseAnalysis.countResult
            ? `數量信心 ${Math.round((Number(baseAnalysis.countResult.confidence) || 0) * 100)}%`
            : '數量未判定';
        const memoryText = nextState.memoryMatch
            ? `同類記憶 ${Math.round((Number(nextState.memoryMatch.similarity) || 0) * 100)}%`
            : (baseAnalysis.memoryTypeMatch ? `跨類記憶 ${Math.round((Number(baseAnalysis.memoryTypeMatch.similarity) || 0) * 100)}%` : '記憶未命中');
        nextState.summaryText = '已建立多來源候選交叉驗證卡，整合幾何輪廓、尺寸標註、記憶案例與數量估算；通過欄位級複核後才會解除 gate。';
        nextState.statusText = `品質 ${nextState.qualityLabel}｜${ocrText}｜${countText}｜${memoryText}`;
        return nextState;
    }

    function formatGuidedPrecisionCandidateValue(fieldId, candidate) {
        if (!candidate) return '未設定';
        if (fieldId === 'type') return getCalcTypeDisplayName(candidate.value);
        if (fieldId === 'qty') return `${Math.max(1, Math.round(Number(candidate.value) || 0))}`;
        return `${Number(candidate.value || 0).toFixed(2)} m`;
    }

    function syncGuidedPrecisionStateFromCurrentInputs(source = '手動修正') {
        if (!guidedPrecisionCalcState.baseAnalysis) return;
        const snapshot = readAutoInterpretCurrentInputs();
        const sourceText = String(source || '手動修正');
        const nextBaseAnalysis = {
            ...guidedPrecisionCalcState.baseAnalysis,
            currentType: snapshot.currentType,
            currentInputs: { ...snapshot.currentInputs },
            currentQty: snapshot.currentQty
        };
        const shouldRebuild = String(snapshot.currentType || '') !== String(guidedPrecisionCalcState.recommendedType || '');
        guidedPrecisionCalcState = shouldRebuild
            ? buildGuidedPrecisionStateFromAnalysis(nextBaseAnalysis, snapshot.currentType)
            : { ...guidedPrecisionCalcState, baseAnalysis: nextBaseAnalysis };

        const typeField = guidedPrecisionCalcState.fields && guidedPrecisionCalcState.fields.type ? guidedPrecisionCalcState.fields.type : null;
        if (typeField && snapshot.currentType) {
            const typeBucket = { type: typeField.candidates || [] };
            pushGuidedPrecisionCandidate(typeBucket, 'type', {
                value: snapshot.currentType,
                source: sourceText,
                confidence: 0.95,
                detail: `${sourceText}後鎖定目前工種`
            });
            typeField.candidates = typeBucket.type.slice().sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0));
            const typeSelected = typeField.candidates.find(item => String(item.value || '') === snapshot.currentType);
            typeField.selectedCandidateId = typeSelected ? typeSelected.id : typeField.selectedCandidateId;
            typeField.conflictText = getGuidedPrecisionConflictText('type', typeField.candidates);
        }

        ['v1', 'v2', 'v3', 'qty'].forEach(fieldId => {
            const fieldState = guidedPrecisionCalcState.fields && guidedPrecisionCalcState.fields[fieldId] ? guidedPrecisionCalcState.fields[fieldId] : null;
            if (!fieldState) return;
            const rawValue = fieldId === 'qty' ? snapshot.currentQty : Number(snapshot.currentInputs[fieldId]);
            if (!Number.isFinite(Number(rawValue)) || Number(rawValue) <= 0) return;
            const bucket = { [fieldId]: fieldState.candidates || [] };
            pushGuidedPrecisionCandidate(bucket, fieldId, {
                value: rawValue,
                source: sourceText,
                confidence: fieldId === 'qty' ? 0.94 : 0.97,
                detail: `${sourceText}後已同步目前欄位`
            });
            fieldState.candidates = bucket[fieldId].slice().sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0));
            const normalizedValue = fieldId === 'qty'
                ? String(Math.max(1, Math.round(Number(rawValue) || 0)))
                : Number(rawValue).toFixed(3);
            const selected = fieldState.candidates.find(item => item.normalizedValue === normalizedValue);
            fieldState.selectedCandidateId = selected ? selected.id : fieldState.selectedCandidateId;
            fieldState.conflictText = getGuidedPrecisionConflictText(fieldId, fieldState.candidates);
        });
        guidedPrecisionCalcState.recommendedType = snapshot.currentType || guidedPrecisionCalcState.recommendedType;
        guidedPrecisionCalcState.summaryText = '已同步目前欄位值，並重新寫回多來源候選交叉驗證卡；可直接套用，也可保留其他候選交叉比對。';
        guidedPrecisionCalcState.statusText = `${guidedPrecisionCalcState.statusText}｜已同步${sourceText}`;
        recomputeGuidedPrecisionState(guidedPrecisionCalcState);
    }

    function canGuidedPrecisionSmartMeasureField(fieldId) {
        if (!['v1', 'v2', 'v3'].includes(String(fieldId || ''))) return false;
        const type = String(document.getElementById('calcType') ? document.getElementById('calcType').value : guidedPrecisionCalcState.recommendedType || '');
        return getSmartMeasurePlan(type).some(task => task && task.field === fieldId);
    }

    async function startGuidedPrecisionSmartMeasure(fieldId) {
        if (!(await ensureFeatureAccess('guidedPrecisionRefine', '智慧量圖精修僅開放會員3（專家）'))) return;
        if (is3DView) return showToast('請先關閉 3D 檢視再做智慧量圖精修');
        if (!img.src) return showToast('請先上傳圖紙再做智慧量圖精修');
        if (!scalePixelsPerUnit) return showToast('請先完成比例校正，再做欄位精修');
        const type = String(document.getElementById('calcType') ? document.getElementById('calcType').value : guidedPrecisionCalcState.recommendedType || '');
        const task = getSmartMeasurePlan(type).find(item => item && item.field === fieldId);
        if (!task) return focusGuidedPrecisionField(fieldId);
        const qualityReport = updateBlueprintQualityStatus();
        let bounds = detectBlueprintPrimaryBounds();
        let fallbackUsed = false;
        if (!bounds) {
            bounds = getBlueprintFallbackBounds();
            fallbackUsed = true;
        }
        if (!bounds) return showToast('智慧量圖暫時無法分析圖紙，請改用手動輸入');
        const componentType = inferSmartMeasureComponentType();
        const suggestion = buildSmartMeasureSuggestion('smart-measure', componentType, bounds, task);
        if (!suggestion || !suggestion.suggestionLine) return showToast(`目前無法替「${task.label}」生成智慧量圖建議`);
        clickPoints = [];
        calibrationPendingPoint = null;
        drawMode = 'smart-measure';
        measureQaStats.measureStarts += 1;
        if (measureAssistState.enabled) calibrateMeasureAssist();
        measureQaStats.smartSessions += 1;
        if (fallbackUsed) measureQaStats.smartFallbacks += 1;
        const qualityScore = computeSmartMeasureQualityScore(qualityReport, bounds, fallbackUsed);
        if (qualityScore < 72) measureQaStats.smartLowConfidence += 1;
        smartMeasureState = {
            active: true,
            mode: 'smart-measure',
            step: 'confirm-start',
            componentType,
            measurePlan: [task],
            currentTaskIndex: 0,
            bounds,
            suggestionLine: suggestion.suggestionLine,
            guidePoints: suggestion.guidePoints,
            confirmedPoints: [],
            qualityScore,
            fallbackUsed,
            lastSnapUsed: false,
            lastManualAdjust: false,
            dragAdjustCount: 0,
            nudgeAdjustCount: 0,
            message: `極強精準補量：請確認${task.label}起點`,
            lastResult: smartMeasureState.lastResult || '',
            lastQaSummary: ''
        };
        syncSmartMeasureStepMessage();
        renderSmartMeasureOverlay();
        updateSmartMeasureUI();
        updateSmartMeasureQualityStatus();
        syncMobileMeasureModeUI();
        updateBlueprintAutoInterpretStatus(`極強精準: 正在精修 ${task.label}，完成後會同步候選卡`, '#ffd166');
        showToast(`已切到智慧量圖精修「${task.label}」`);
    }

    function renderGuidedPrecisionPanel() {
        const panel = document.getElementById('guidedPrecisionPanel');
        if (!panel) return;
        if (!guidedPrecisionCalcState.active) {
            panel.hidden = true;
            panel.innerHTML = '';
            return;
        }
        const tone = getGuidedPrecisionTone(guidedPrecisionCalcState.consensusScore);
        const pendingText = guidedPrecisionCalcState.pendingRequiredFields.length
            ? `待補 ${guidedPrecisionCalcState.pendingRequiredFields.join('、')}`
            : (guidedPrecisionCalcState.applied ? '已套用到計算欄位' : '可直接套用目前預選');
        const gateText = guidedPrecisionCalcState.reviewGateState === 'ready'
            ? '欄位級複核通過，可直接進入計算'
            : (guidedPrecisionCalcState.reviewGateState === 'review'
                ? `欄位級複核中：${guidedPrecisionCalcState.reviewFieldCount} 欄仍需確認`
                : pendingText);
        const gateReasonText = guidedPrecisionCalcState.reviewGateReasons.length
            ? `複核原因：${guidedPrecisionCalcState.reviewGateReasons.join('｜')}`
            : '';
        const reviewMeta = getGuidedPrecisionConfidenceRoute(autoInterpretLastReport);
        const reviewDecisionText = autoInterpretLastReport && autoInterpretLastReport.reviewDecisionLabel
            ? `｜審核狀態：${autoInterpretLastReport.reviewDecisionLabel}`
            : '';
        const fieldsHtml = (guidedPrecisionCalcState.schema || []).map(spec => {
            const fieldState = guidedPrecisionCalcState.fields[spec.id];
            const selected = getGuidedPrecisionSelectedCandidate(spec.id);
            const fieldTone = getGuidedPrecisionTone(fieldState && fieldState.selectedConfidence);
            const actionButtons = (fieldState && Array.isArray(fieldState.candidates) ? fieldState.candidates : []).map(candidate => {
                const activeClass = fieldState.selectedCandidateId === candidate.id ? ' active' : '';
                const sourceSummary = getGuidedPrecisionCandidateSourceSummary(candidate);
                const buttonText = `${formatGuidedPrecisionCandidateValue(spec.id, candidate)}｜${sourceSummary}｜${candidate.supportingSourceCount || 1} 源｜${Math.round((Number(candidate.confidence) || 0) * 100)}%`;
                const handler = spec.id === 'type'
                    ? `chooseGuidedPrecisionType('${String(candidate.value || '')}')`
                    : `selectGuidedPrecisionCandidate('${spec.id}','${candidate.id}')`;
                return `<button type="button" class="precision-review-btn${activeClass}" onclick="${handler}">${escapeHTML(buttonText)}</button>`;
            }).join('');
            const assistButtons = [];
            if (spec.id !== 'type' && canGuidedPrecisionSmartMeasureField(spec.id) && (!selected || Number(fieldState.selectedConfidence || 0) < 0.72)) {
                assistButtons.push(`<button type="button" class="precision-review-btn" onclick="startGuidedPrecisionSmartMeasure('${spec.id}')">智慧量圖精修</button>`);
            }
            if (spec.id !== 'type' && (!selected || Number(fieldState.selectedConfidence || 0) < 0.72)) {
                assistButtons.push(`<button type="button" class="precision-review-btn" onclick="focusGuidedPrecisionField('${spec.id}')">手動補這一欄</button>`);
            }
            const crossValidation = fieldState && fieldState.crossValidation ? fieldState.crossValidation : null;
            const detailText = selected
                ? [
                    `${getGuidedPrecisionCandidateSourceSummary(selected)}${selected.detail ? `｜${selected.detail}` : ''}`,
                    crossValidation && crossValidation.summaryText ? crossValidation.summaryText : '',
                    crossValidation && crossValidation.reviewReasons.length ? `待複核：${crossValidation.reviewReasons.join('、')}` : '',
                    fieldState && fieldState.conflictText ? fieldState.conflictText : ''
                ].filter(Boolean).join('｜')
                : (spec.required ? '目前沒有可直接套用的候選，請先手填或重新辨識。' : '目前沒有候選，可保留空白。');
            const noteText = selected
                ? `${fieldTone.label} ${Math.round((Number(selected.confidence) || 0) * 100)}%｜${crossValidation && crossValidation.supportingSourceCount ? `${crossValidation.supportingSourceCount} 源` : '1 源'}`
                : (spec.required ? '需補值' : '選填');
            const candidateButtons = [actionButtons, assistButtons.join('')].filter(Boolean).join('');
            return `<div class="precision-review-field"><div class="precision-review-field-head"><span class="precision-review-field-label">${escapeHTML(spec.label)}</span><span class="precision-review-field-note ${fieldTone.className}">${escapeHTML(noteText)}</span></div><div class="precision-review-candidates">${candidateButtons || `<button type="button" class="precision-review-btn" onclick="focusGuidedPrecisionField('${spec.id}')">手動補這一欄</button>`}</div><div class="precision-review-detail">${escapeHTML(detailText)}</div></div>`;
        }).join('');
        panel.hidden = false;
        panel.innerHTML = `<div class="precision-review-head"><span class="precision-review-title">極強精準模式 #${guidedPrecisionCalcState.runId}｜${escapeHTML(getCalcTypeDisplayName(guidedPrecisionCalcState.recommendedType))}</span><span class="precision-review-badge">${escapeHTML(tone.label)} ${Math.round(guidedPrecisionCalcState.consensusScore * 100)}%</span></div><div class="precision-review-summary">${escapeHTML(guidedPrecisionCalcState.summaryText)}<br>${escapeHTML(guidedPrecisionCalcState.statusText)}<br>${escapeHTML(guidedPrecisionCalcState.crossValidationSummary || '')}<br>${escapeHTML(gateText)}${gateReasonText ? `<br>${escapeHTML(gateReasonText)}` : ''}<br>${escapeHTML(`信心分流：${reviewMeta.label}｜${reviewMeta.note}${reviewDecisionText}`)}</div><div class="precision-review-grid">${fieldsHtml}</div><div class="precision-review-actions"><button class="tool-btn" type="button" style="border-color:#ffd166; color:#fff1b8;" onclick="applyGuidedPrecisionSelections()">套用目前選擇</button><button class="tool-btn" type="button" style="border-color:#9fffc0; color:#eaffef;" onclick="approveGuidedPrecisionToCoreMemory()">審核通過入核心</button><button class="tool-btn" type="button" style="border-color:#90caf9; color:#dceeff;" onclick="approveGuidedPrecisionWithCurrentValues()">以目前欄位修正後通過</button><button class="tool-btn" type="button" style="border-color:#ffb0b0; color:#ffe3e3;" onclick="rejectGuidedPrecisionResult()">退回本次結果</button><button class="tool-btn" type="button" style="border-color:#90caf9; color:#dceeff;" onclick="runGuidedPrecisionAutoInterpret()">重新分析</button><button class="tool-btn" type="button" style="border-color:#9bc2e5; color:#d7ebff;" onclick="clearGuidedPrecisionCalcState()">關閉高精度卡</button></div>`;
    }

    function focusGuidedPrecisionField(fieldId) {
        const input = document.getElementById(fieldId);
        if (input && typeof input.focus === 'function') input.focus();
        const fieldState = guidedPrecisionCalcState.fields && guidedPrecisionCalcState.fields[fieldId] ? guidedPrecisionCalcState.fields[fieldId] : null;
        showToast(`請補「${fieldState ? fieldState.label : fieldId}」；可手填，必要時再用智慧量圖/尺寸標註輔助確認`);
    }

    function chooseGuidedPrecisionType(type) {
        if (!guidedPrecisionCalcState.baseAnalysis) return;
        guidedPrecisionCalcState = buildGuidedPrecisionStateFromAnalysis(guidedPrecisionCalcState.baseAnalysis, type);
        renderGuidedPrecisionPanel();
        updateBlueprintAutoInterpretStatus(`極強精準: 已改用 ${getCalcTypeDisplayName(type)} 重新建立候選，請逐欄確認`, '#ffd166');
    }

    function selectGuidedPrecisionCandidate(fieldId, candidateId) {
        const fieldState = guidedPrecisionCalcState.fields && guidedPrecisionCalcState.fields[fieldId] ? guidedPrecisionCalcState.fields[fieldId] : null;
        if (!fieldState) return;
        fieldState.selectedCandidateId = candidateId;
        recomputeGuidedPrecisionState(guidedPrecisionCalcState);
        renderGuidedPrecisionPanel();
    }

    function clearGuidedPrecisionCalcState(silent = false) {
        const keepReviewGate = !silent
            && !!(autoInterpretLastReport
                && String(autoInterpretLastReport.precisionMode || '') === 'guided'
                && autoInterpretLastReport.needsReview);
        guidedPrecisionCalcState = createDefaultGuidedPrecisionCalcState();
        if (!keepReviewGate && autoInterpretNeedsReview && String(autoInterpretGateReason || '').includes('極強精準')) {
            autoInterpretNeedsReview = false;
            autoInterpretGateReason = '';
        }
        renderGuidedPrecisionPanel();
        if (!silent) {
            updateBlueprintAutoInterpretStatus(
                keepReviewGate
                    ? '自動判讀: 已關閉極強精準卡，但複核 gate 仍保留'
                    : '自動判讀: 已關閉極強精準模式',
                keepReviewGate ? '#ffd48a' : '#bfe7ff'
            );
            showToast(keepReviewGate ? '已關閉候選卡，但仍需先完成複核' : '已關閉極強精準模式');
        }
    }

    function buildGuidedPrecisionFieldConfidenceMap() {
        const result = {};
        Object.keys(guidedPrecisionCalcState.fields || {}).forEach(fieldId => {
            const selected = getGuidedPrecisionSelectedCandidate(fieldId);
            result[fieldId] = selected ? Number(selected.confidence || 0) : 0;
        });
        return result;
    }

    function buildGuidedPrecisionSelectedValueSet() {
        const valueSet = {
            type: String(guidedPrecisionCalcState.recommendedType || ''),
            v1: '',
            v2: '',
            v3: '',
            qty: ''
        };
        ['v1', 'v2', 'v3', 'qty'].forEach(fieldId => {
            const selected = getGuidedPrecisionSelectedCandidate(fieldId);
            if (!selected) return;
            valueSet[fieldId] = fieldId === 'qty'
                ? String(Math.max(1, Math.round(Number(selected.value) || 0)))
                : Number(selected.value || 0).toFixed(2);
        });
        return valueSet;
    }

    function buildQuickAutoInterpretFieldConfidence(type, fillResult, metrics = {}) {
        const geometryConfidence = clampNumber(Number(metrics.geometryConfidence) || 0, 0, 1);
        const countConfidence = clampNumber(Number(metrics.countConfidence) || 0, 0, 1);
        const memoryConfidence = clampNumber(Number(metrics.memoryConfidence) || 0, 0, 1);
        const typeConfidence = clampNumber(0.56 + memoryConfidence * 0.24, 0.45, 0.93);
        const fieldConfidence = { type: typeConfidence };
        if (String(type || '').startsWith('R_')) {
            fieldConfidence.v2 = clampNumber(geometryConfidence * 0.84 + memoryConfidence * 0.08, 0.34, 0.92);
            fieldConfidence.qty = clampNumber(0.72 + memoryConfidence * 0.08, 0.7, 0.92);
            return fieldConfidence;
        }
        fieldConfidence.v1 = clampNumber(geometryConfidence * 0.88 + memoryConfidence * 0.06, 0.36, 0.94);
        fieldConfidence.v2 = clampNumber(geometryConfidence * 0.84 + memoryConfidence * 0.08, 0.34, 0.93);
        if (fillResult && fillResult.preserveManualDepth) {
            fieldConfidence.v3 = fillResult.depthMissing ? 0 : 0.88;
        } else {
            fieldConfidence.v3 = clampNumber(geometryConfidence * 0.7 + memoryConfidence * 0.12, 0.3, 0.9);
        }
        fieldConfidence.qty = clampNumber(countConfidence * 0.7 + memoryConfidence * 0.16 + 0.12, 0.28, 0.94);
        return fieldConfidence;
    }

    function recordAutoInterpretLog(mode, modeLabel, report, summaryText = '') {
        if (!report) return;
        const reviewFields = Array.isArray(report.reviewFields) && report.reviewFields.length
            ? report.reviewFields.slice()
            : (Array.isArray(report.pendingFields) ? report.pendingFields.slice() : []);
        const summaryParts = [
            String(summaryText || report.summaryText || report.fieldConfidenceSummary || '').trim(),
            String(report.crossValidationSummary || '').trim()
        ].filter(Boolean);
        recordMeasurementLog({
            mode,
            modeLabel,
            targetField: '',
            targetLabel: String(report.needsReview ? '待複核' : '已套用'),
            valueM: null,
            actualLenM: null,
            scalePixelsPerUnit,
            distancePx: null,
            componentType: '',
            smart: true,
            snapped: false,
            manualAdjust: false,
            dragAdjustCount: 0,
            nudgeAdjustCount: 0,
            qualityScore: Math.round((Number(report.overallConfidence) || 0) * 100),
            fallbackUsed: false,
            summary: summaryParts.join('｜'),
            precisionMode: String(report.precisionMode || ''),
            overallConfidence: Number(report.overallConfidence) || 0,
            fieldConfidence: report.fieldConfidence || {},
            fieldConfidenceSummary: String(report.fieldConfidenceSummary || ''),
            crossValidationSummary: String(report.crossValidationSummary || ''),
            crossValidationReport: report.crossValidationReport || {},
            valueSet: report.valueSet || buildCurrentCalcValueSet(),
            reviewFields,
            reviewGateState: String(report.reviewGateState || ''),
            reviewGateReasons: Array.isArray(report.reviewGateReasons) ? report.reviewGateReasons.slice() : [],
            reviewFieldCount: Number(report.reviewFieldCount) || reviewFields.length,
            multiSourceFieldCount: Number(report.multiSourceFieldCount) || 0,
            needsReview: !!report.needsReview
        });
    }

    async function applyGuidedPrecisionSelections() {
        if (!guidedPrecisionCalcState.active) return showToast('目前沒有極強精準候選可套用');
        const typeEl = document.getElementById('calcType');
        const targetType = String(guidedPrecisionCalcState.recommendedType || '');
        if (typeEl && targetType) {
            typeEl.value = targetType;
            updateUI();
        }

        const missing = [];
        (guidedPrecisionCalcState.schema || []).forEach(spec => {
            if (spec.id === 'type') return;
            const input = document.getElementById(spec.id);
            if (!input) return;
            const selected = getGuidedPrecisionSelectedCandidate(spec.id);
            if (selected && Number.isFinite(Number(selected.value))) {
                input.value = spec.id === 'qty'
                    ? String(Math.max(1, Math.round(Number(selected.value) || 0)))
                    : Number(selected.value).toFixed(2);
                return;
            }
            if (spec.required && !String(input.value || '').trim()) missing.push(spec.label);
        });

        const finalType = String(typeEl ? typeEl.value : targetType);
        const qtyInput = document.getElementById('qty');
        const quantity = Math.max(1, Number(qtyInput && qtyInput.value) || 1);
        const fieldConfidence = buildGuidedPrecisionFieldConfidenceMap();
        const fieldConfidenceSummary = buildGuidedPrecisionFieldConfidenceSummary(fieldConfidence, guidedPrecisionCalcState.schema);
        const guidedReportBase = buildGuidedPrecisionReportPayload({
            runId: guidedPrecisionCalcState.runId,
            type: finalType,
            quantity,
            overallConfidence: guidedPrecisionCalcState.consensusScore,
            precisionMode: 'guided',
            fieldConfidence,
            fieldConfidenceSummary,
            memorySimilarity: guidedPrecisionCalcState.memoryMatch ? Number(guidedPrecisionCalcState.memoryMatch.similarity || 0) : 0,
            memoryStoreSize: getAutoInterpretMemoryStore().length,
            valueSet: buildGuidedPrecisionSelectedValueSet(),
            ocrCandidateCount: Array.isArray(guidedPrecisionCalcState.baseAnalysis && guidedPrecisionCalcState.baseAnalysis.ocrCandidates)
                ? guidedPrecisionCalcState.baseAnalysis.ocrCandidates.length
                : 0,
            inputSignature: getGuidedPrecisionCurrentSignature()
        });
        if (missing.length > 0) {
            autoInterpretNeedsReview = true;
            autoInterpretGateReason = `極強精準模式仍有待補欄位：${missing.join('、')}`;
            autoInterpretLastReport = {
                ...guidedReportBase,
                pendingFields: missing.slice(),
                needsReview: true,
                reviewFields: getGuidedPrecisionReviewFieldLabels(guidedPrecisionCalcState)
            };
            await enrichAutoInterpretServerQa(autoInterpretLastReport);
            guidedPrecisionCalcState.applied = false;
            updateBlueprintAutoInterpretStatus(`極強精準: 已套用部分候選，仍待補 ${missing.join('、')}`, '#ffd48a');
            previewCalc();
            renderGuidedPrecisionPanel();
            updateAutoInterpretQaSummary(autoInterpretLastReport);
            recordAutoInterpretLog('guided-auto-interpret', '極強精準', autoInterpretLastReport, `逐欄候選仍待補 ${missing.join('、')}`);
            return showToast(`請補齊：${missing.join('、')}`);
        }

        guidedPrecisionCalcState.applied = true;
        const reviewStillRequired = guidedPrecisionCalcState.reviewGateState !== 'ready';
        autoInterpretNeedsReview = reviewStillRequired;
        autoInterpretGateReason = reviewStillRequired ? buildGuidedPrecisionReviewGateReason(guidedPrecisionCalcState) : '';
        autoInterpretLastReport = attachGuidedPrecisionReviewMeta(buildGuidedPrecisionReportPayload({
            ...guidedReportBase,
            memoryStoreSize: getAutoInterpretMemoryStore().length,
            pendingFields: guidedPrecisionCalcState.pendingRequiredFields.slice(),
            needsReview: reviewStillRequired,
            decisionStatus: 'pending',
            reviewDecisionLabel: getGuidedPrecisionReviewStatusLabel('pending')
        }));
        const queuedRecord = syncGuidedPrecisionReviewRecord('pending', {
            valueSet: buildCurrentCalcValueSet(),
            decisionNote: reviewStillRequired
                ? '已套用極強結果，仍待審核後才能進核心記憶'
                : '已套用極強結果，待管理者確認是否進核心記憶'
        });
        await enrichAutoInterpretServerQa(autoInterpretLastReport);
        updateBlueprintAutoInterpretStatus(
            reviewStillRequired
                ? `極強精準: 已套用 ${getCalcTypeDisplayName(finalType)}，但仍需欄位級複核 ${autoInterpretLastReport.reviewFields.join('、') || '候選一致性'}｜已送審核研究區`
                : `極強精準: 已套用 ${getCalcTypeDisplayName(finalType)}｜欄位共識 ${Math.round(guidedPrecisionCalcState.consensusScore * 100)}%｜${queuedRecord ? queuedRecord.routeLabel : autoInterpretLastReport.confidenceRouteLabel}｜待審核後進核心記憶`,
            reviewStillRequired ? '#ffd48a' : '#9fffc0'
        );
        previewCalc();
        renderAutoInterpretMemoryPanel();
        renderGuidedPrecisionPanel();
        trackAutoInterpretQaStats('guided', autoInterpretLastReport, { incrementRun: false, applied: true });
        recordAutoInterpretLog(
            'guided-auto-interpret',
            '極強精準',
            autoInterpretLastReport,
            reviewStillRequired
                ? `已套用但仍需複核，且已送審核研究區｜${fieldConfidenceSummary || '候選已套用'}`
                : `已套用極強精準結果，待審核通過後才進核心記憶｜${fieldConfidenceSummary || '欄位已確認'}`
        );
        showToast(
            reviewStillRequired
                ? `已套用 ${getCalcTypeDisplayName(finalType)}，但仍需複核後再進核心記憶`
                : `極強精準結果已套用，待審核通過後再進核心記憶`
        );
    }

    async function runGuidedPrecisionAutoInterpret() {
        if (!ensureCalcAdvancedPageReady('第三頁精準辨識區尚未載入')) return;
        if (!(await ensureFeatureAccess('guidedPrecisionAuto', '極強精準辨識僅開放會員3（專家）'))) return;
        if (autoInterpretBusy) return showToast('單一運算進行中，請稍候完成');
        if (!img.src) return showToast('請先上傳圖紙再做極強精準辨識');
        autoInterpretBusy = true;
        autoInterpretNeedsReview = false;
        autoInterpretGateReason = '';
        const runId = ++autoInterpretRunSeq;
        try {
            updateBlueprintAutoInterpretStatus(`極強精準: 啟動 #${runId}（幾何/OCR/記憶交叉驗證中）`, '#ffd166');
            const stage = await collectAutoInterpretStageSignals({
                includeOcr: true,
                blockWithoutScale: true,
                scalePromptText: '已抓到主體長邊對應像素，請輸入這條邊的實際長度（m）來完成高精度比例：',
                scaleInfoText: '✅ 比例已設（極強精準）',
                missingBoundsMessage: '未偵測到明顯主體輪廓，建議先優化圖紙或重新定比例',
                missingScaleMessage: '請先完成比例校正，再啟動極強精準辨識'
            });
            if (!stage.ok && stage.reason === 'bounds-missing') {
                updateBlueprintAutoInterpretStatus('極強精準: 偵測失敗（請先提升對比或補定比例）', '#ffd48a');
                clearGuidedPrecisionCalcState(true);
                return showToast(stage.message);
            }
            if (!stage.ok) {
                updateBlueprintAutoInterpretStatus('極強精準: 缺少比例，無法換算實際尺寸', '#ffd48a');
                clearGuidedPrecisionCalcState(true);
                return showToast(stage.message);
            }
            const baseAnalysis = {
                runId,
                qualityReport: stage.qualityReport,
                bounds: stage.bounds,
                longM: stage.longM,
                shortM: stage.shortM,
                currentType: stage.currentType,
                currentInputs: stage.currentInputs,
                currentQty: stage.currentQty,
                memoryTypeMatch: stage.memoryTypeMatch,
                countResult: stage.countResult,
                ocrCandidates: stage.ocrCandidates,
                geometryConfidence: stage.geometryConfidence
            };
            guidedPrecisionCalcState = buildGuidedPrecisionStateFromAnalysis(baseAnalysis);
            const fieldConfidence = buildGuidedPrecisionFieldConfidenceMap();
            const fieldConfidenceSummary = buildGuidedPrecisionFieldConfidenceSummary(fieldConfidence, guidedPrecisionCalcState.schema);
            autoInterpretNeedsReview = true;
            autoInterpretGateReason = buildGuidedPrecisionReviewGateReason(guidedPrecisionCalcState)
                || '極強精準模式已產生逐欄候選，請確認後按「套用目前選擇」或直接手動修正';
            autoInterpretLastReport = attachGuidedPrecisionReviewMeta(buildGuidedPrecisionReportPayload({
                runId,
                type: guidedPrecisionCalcState.recommendedType,
                quantity: stage.currentQty,
                longM: stage.longM,
                shortM: stage.shortM,
                overallConfidence: guidedPrecisionCalcState.consensusScore,
                precisionMode: 'guided',
                fieldConfidence,
                fieldConfidenceSummary,
                memorySimilarity: guidedPrecisionCalcState.memoryMatch
                    ? Number(guidedPrecisionCalcState.memoryMatch.similarity || 0)
                    : (stage.memoryTypeMatch ? Number(stage.memoryTypeMatch.similarity || 0) : 0),
                memoryStoreSize: getAutoInterpretMemoryStore().length,
                pendingFields: guidedPrecisionCalcState.pendingRequiredFields.slice(),
                valueSet: buildGuidedPrecisionSelectedValueSet(),
                needsReview: true,
                decisionStatus: 'pending',
                reviewDecisionLabel: getGuidedPrecisionReviewStatusLabel('pending'),
                ocrCandidateCount: Array.isArray(stage.ocrCandidates) ? stage.ocrCandidates.length : 0,
                inputSignature: getGuidedPrecisionCurrentSignature()
            }));
            await enrichAutoInterpretServerQa(autoInterpretLastReport);
            renderGuidedPrecisionPanel();
            updateBlueprintAutoInterpretStatus(
                `極強精準: #${runId} 已建立逐欄候選｜${stage.longM.toFixed(2)}×${stage.shortM.toFixed(2)} m｜OCR ${stage.ocrCandidates.length} 筆｜${guidedPrecisionCalcState.crossValidationSummary}｜待確認`,
                '#ffd166'
            );
            trackAutoInterpretQaStats('guided', autoInterpretLastReport);
            recordAutoInterpretLog('guided-auto-interpret', '極強精準', autoInterpretLastReport, `已建立逐欄候選待確認｜${fieldConfidenceSummary || '候選已產生'}`);
            showToast('極強精準模式已完成初判，請逐欄確認後再套用');
        } finally {
            autoInterpretBusy = false;
        }
    }

    async function autoInterpretBlueprintAndCalculate() {
        if (typeof ensureWorkModeAccess === 'function' && !ensureWorkModeAccess('calc', '請先切到第三頁計算模式再做看圖自動判讀')) return;
        if (!ensureCalcAdvancedPageReady('第三頁自動計算區尚未載入')) return;
        if (!(await ensureFeatureAccess('blueprintAutoInterpret', '看圖自動判讀僅開放會員3（專家）'))) return;
        if (autoInterpretBusy) return showToast('單一運算進行中，請稍候完成');
        if (!img.src) return showToast('請先上傳圖紙再做自動判讀');
        clearGuidedPrecisionCalcState(true);
        autoInterpretBusy = true;
        autoInterpretNeedsReview = false;
        autoInterpretGateReason = '';
        const runId = ++autoInterpretRunSeq;
        try {
            updateBlueprintAutoInterpretStatus(`自動判讀: 單一運算啟動 #${runId}（主體辨識中）`, '#bfe7ff');
            const stage = await collectAutoInterpretStageSignals({
                includeOcr: false,
                blockWithoutScale: false,
                scalePromptText: '已抓到主體長邊約對應像素，請輸入這條邊的實際長度（m）來自動定比例：',
                scaleInfoText: '✅ 比例已設（自動判讀）',
                missingBoundsMessage: '未偵測到明顯主體輪廓，建議先用✨自動優化後重試',
                missingScaleMessage: '尚未設定比例，已提供像素判讀；輸入實際尺寸後可自動換算公尺'
            });
            if (!stage.ok && stage.reason === 'bounds-missing') {
                updateBlueprintAutoInterpretStatus('自動判讀: 偵測失敗（請先提升對比或框選量測）', '#ffd48a');
                return showToast(stage.message);
            }
            if (!stage.ok) {
                updateBlueprintAutoInterpretStatus(`自動判讀: 僅像素(${Math.round(stage.bounds.widthPx)}×${Math.round(stage.bounds.heightPx)} px)`, '#ffd48a');
                return showToast(stage.message);
            }

            updateBlueprintAutoInterpretStatus(`自動判讀: 單一運算 #${runId}（尺寸/數量解算中）`, '#bfe7ff');
            const qualityReport = stage.qualityReport;
            const bounds = stage.bounds;
            const longM = stage.longM;
            const shortM = stage.shortM;
            const currentType = stage.currentType;
            const memoryTypeMatch = stage.memoryTypeMatch;
            let type = currentType;
            if (!type.startsWith('R_')) {
                const memoryDefault = memoryTypeMatch && memoryTypeMatch.best && memoryTypeMatch.similarity >= 0.72
                    ? String(memoryTypeMatch.best.type || type)
                    : type;
                const picked = prompt(
                    `請確認本次判讀構件類型（目前：${type}）
` +
                    `1=牆模板(M_WALL)
` +
                    `2=樑模板雙側(M_BEAM_SIDES)
` +
                    `3=樑模板三面(M_BEAM_ALL)
` +
                    `4=樓板/地坪體積(C_VOL)
` +
                    `5=柱體積(C_COL)
` +
                    `6=獨立柱模(M_COL)
` +
                    `7=開挖/回填(E_DIG)
` +
                    `0=維持目前
` +
                    `${memoryTypeMatch ? `記憶建議：${memoryDefault}｜${getAutoInterpretMemoryHint(memoryTypeMatch)}` : '記憶建議：目前尚無相似案例'}`,
                    memoryDefault === 'M_WALL' ? '1'
                        : memoryDefault === 'M_BEAM_SIDES' ? '2'
                        : memoryDefault === 'M_BEAM_ALL' ? '3'
                        : memoryDefault === 'C_VOL' ? '4'
                        : memoryDefault === 'C_COL' ? '5'
                        : memoryDefault === 'M_COL' ? '6'
                        : memoryDefault === 'E_DIG' ? '7'
                        : '0'
                );
                const pickMap = {
                    '1': 'M_WALL',
                    '2': 'M_BEAM_SIDES',
                    '3': 'M_BEAM_ALL',
                    '4': 'C_VOL',
                    '5': 'C_COL',
                    '6': 'M_COL',
                    '7': 'E_DIG',
                    '0': type
                };
                const nextType = pickMap[String(picked == null ? '0' : picked).trim()] || type;
                if (nextType !== type) {
                    const typeEl = document.getElementById('calcType');
                    if (typeEl) {
                        typeEl.value = nextType;
                        type = nextType;
                        updateUI();
                    }
                }
            }
            const v1El = document.getElementById('v1');
            const v2El = document.getElementById('v2');
            const v3El = document.getElementById('v3');
            const qtyEl = document.getElementById('qty');
            const prevQty = Math.max(1, Number(qtyEl.value) || 1);
            const memoryMatch = findAutoInterpretMemoryMatch(bounds, qualityReport, type);
            const countResult = stage.countResult;
            const shouldAutoCount = !type.startsWith('R_');
            const memoryQty = memoryMatch && memoryMatch.best ? Math.max(1, Number(memoryMatch.best.quantity) || prevQty) : prevQty;
            let pickedQty = (shouldAutoCount && countResult.confidence >= 0.55)
                ? Math.max(1, Math.min(999, countResult.count))
                : prevQty;
            if (shouldAutoCount && memoryMatch && memoryMatch.similarity >= 0.76) {
                pickedQty = Math.max(1, Math.min(999, Math.round(pickedQty * 0.55 + memoryQty * 0.45)));
            }
            const useAutoQty = shouldAutoCount
                ? confirm(
                    `AI 建議數量 ${pickedQty}（信心 ${(countResult.confidence * 100).toFixed(0)}%）` +
                    `${memoryMatch ? `
相似案例：${memoryQty}（${Math.round(memoryMatch.similarity * 100)}%）` : ''}` +
                    `
按「確定」套用，按「取消」保留目前數量 ${prevQty}。`
                )
                : false;
            const finalQty = useAutoQty ? pickedQty : prevQty;
            const geometryConfidence = Math.max(0.25, Math.min(0.95, Number(bounds.coverage || 0) * 2.4));
            const qualityConfidence = qualityToScore(qualityReport && qualityReport.quality);
            const countConfidence = shouldAutoCount ? Number(countResult.confidence || 0) : 0.7;
            const memoryConfidence = memoryMatch ? Math.min(0.96, memoryMatch.similarity) : 0;
            const overallConfidence = Math.max(0, Math.min(1, geometryConfidence * 0.38 + qualityConfidence * 0.28 + countConfidence * 0.18 + memoryConfidence * 0.16));
            const fillResult = applyAutoInterpretValuesToInputs(type, longM, shortM, finalQty);
            const fieldConfidence = buildQuickAutoInterpretFieldConfidence(type, fillResult, {
                geometryConfidence,
                countConfidence,
                memoryConfidence
            });
            const fieldConfidenceSummary = buildGuidedPrecisionFieldConfidenceSummary(fieldConfidence, getGuidedPrecisionFieldSchema(type));
            if (fillResult.preserveManualDepth && fillResult.depthMissing) {
                autoInterpretNeedsReview = true;
                autoInterpretGateReason = `已完成平面判讀，請手動輸入「${fillResult.depthLabel}」後再吸入清單`;
            }
            previewCalc();

            const qualityNote = qualityReport ? `｜品質${qualityReport.quality}` : '';
            const memoryNote = memoryMatch
                ? `｜同類型記憶 ${getAutoInterpretMemoryHint(memoryMatch)}`
                : (memoryTypeMatch ? `｜跨類型記憶 ${getAutoInterpretMemoryHint(memoryTypeMatch)}` : '｜記憶尚未建立');
            const countNote = shouldAutoCount
                ? `｜數量建議 ${pickedQty}（信心 ${(countResult.confidence * 100).toFixed(0)}%）→ 套用 ${finalQty}`
                : '｜鋼筋類數量維持手動';
            const manualDepthNote = fillResult.preserveManualDepth
                ? `｜平面已回填 ${fillResult.planSummary}｜${fillResult.depthMissing ? `待手填 ${fillResult.depthLabel}` : `${fillResult.depthLabel}沿用 ${Number(fillResult.manualDepthValue || 0).toFixed(2)} m`}`
                : '';
            const gateThreshold = getAutoInterpretGateThreshold();
            if (!type.startsWith('R_') && !autoInterpretNeedsReview && overallConfidence < gateThreshold) {
                autoInterpretNeedsReview = true;
                autoInterpretGateReason = `自動判讀信心 ${(overallConfidence * 100).toFixed(0)}% 低於門檻 ${(gateThreshold * 100).toFixed(0)}%，請手動複核尺寸/數量`;
            }
            const learnResult = autoInterpretNeedsReview
                ? { count: getAutoInterpretMemoryStore().length, updated: false }
                : learnAutoInterpretMemory({
                    type,
                    quantity: finalQty,
                    longM,
                    shortM,
                    quality: qualityReport ? qualityReport.quality : '未知',
                    vector: buildBlueprintFeatureVector(bounds, qualityReport)
                });
            updateBlueprintAutoInterpretStatus(
                `自動判讀: 單一運算 #${runId} 完成｜${bounds.widthPx.toFixed(0)}×${bounds.heightPx.toFixed(0)} px → ${longM.toFixed(2)}×${shortM.toFixed(2)} m${manualDepthNote}${countNote}${memoryNote}｜總信心 ${(overallConfidence * 100).toFixed(0)}%${qualityNote}${autoInterpretNeedsReview ? '｜需複核｜暫不寫入核心記憶' : ''}｜已學習 ${learnResult.count} 筆`,
                autoInterpretNeedsReview ? '#ffd48a' : '#9fffc0'
            );
            renderAutoInterpretMemoryPanel();
            autoInterpretLastReport = {
                runId,
                type,
                longM,
                shortM,
                preserveManualDepth: fillResult.preserveManualDepth,
                depthMissing: fillResult.depthMissing,
                depthLabel: fillResult.depthLabel,
                quantity: finalQty,
                suggestedQuantity: pickedQty,
                countConfidence: countResult.confidence,
                memorySimilarity: memoryMatch ? memoryMatch.similarity : (memoryTypeMatch ? memoryTypeMatch.similarity : 0),
                memoryQuantity: memoryMatch && memoryMatch.best ? memoryMatch.best.quantity : (memoryTypeMatch && memoryTypeMatch.best ? memoryTypeMatch.best.quantity : null),
                quality: qualityReport ? qualityReport.quality : '未知',
                overallConfidence,
                precisionMode: 'quick',
                fieldConfidence,
                fieldConfidenceSummary,
                memoryStoreSize: learnResult.count,
                memoryMatchedType: memoryMatch && memoryMatch.best ? memoryMatch.best.type : (memoryTypeMatch && memoryTypeMatch.best ? memoryTypeMatch.best.type : null),
                pendingFields: fillResult.depthMissing ? [fillResult.depthLabel] : [],
                valueSet: buildCurrentCalcValueSet(),
                needsReview: autoInterpretNeedsReview,
                reviewFields: fillResult.depthMissing ? [fillResult.depthLabel] : (autoInterpretNeedsReview ? ['尺寸/數量'] : []),
                ocrCandidateCount: 0,
                inputSignature: `${type}|${String(v1El.value || '')}|${String(v2El.value || '')}|${String(v3El.value || '')}|${String(qtyEl.value || '')}`
            };
            await enrichAutoInterpretServerQa(autoInterpretLastReport);
            trackAutoInterpretQaStats('quick', autoInterpretLastReport);
            recordAutoInterpretLog('auto-interpret', '快速看圖', autoInterpretLastReport, `快速看圖完成｜${fieldConfidenceSummary || '已完成欄位估計'}`);
            previewCalc();
            if (type.startsWith('R_')) {
                showToast(`已完成單一運算：長邊 ${longM.toFixed(2)}m（鋼筋規格仍需手動填 v1）`);
            } else if (fillResult.preserveManualDepth && fillResult.depthMissing) {
                showToast(`已抓到平面尺寸 ${fillResult.planSummary}，請手動輸入「${fillResult.depthLabel}」後再計算`);
            } else if (autoInterpretNeedsReview) {
                showToast(`自動判讀完成但信心偏低（${(overallConfidence * 100).toFixed(0)}%），本次不會寫入核心記憶，請先複核`);
            } else if (fillResult.preserveManualDepth) {
                showToast(`已抓到平面尺寸 ${fillResult.planSummary}，並保留手填 ${fillResult.depthLabel}`);
            } else {
                showToast(`已完成單一運算：${longM.toFixed(2)}m × ${shortM.toFixed(2)}m，數量建議 ${pickedQty}，套用 ${finalQty}，記憶庫 ${learnResult.count} 筆`);
            }
        } finally {
            autoInterpretBusy = false;
        }
    }

    async function runAutoBlueprintPlusBIM() {
        if (typeof ensureWorkModeAccess === 'function' && !ensureWorkModeAccess('calc', '請先切到第三頁計算模式再做 IBM 自動計算')) return;
        if (!ensureCalcAdvancedPageReady('第三頁自動計算區尚未載入')) return;
        if (!(await ensureFeatureAccess('autoBlueprintBim', '此功能僅限會員3（專家）'))) {
            return;
        }
        if (autoInterpretBusy || edgeAiDetectBusy) {
            return showToast('AI 流程執行中，請稍候');
        }
        if (!img.src) {
            return showToast('請先上傳圖紙再執行「自動看圖計算+BIM」');
        }

        updateBlueprintAutoInterpretStatus('一鍵流程：步驟1/2 看圖自動判讀中...', '#bfe7ff');
        await autoInterpretBlueprintAndCalculate();
        if (autoInterpretNeedsReview) {
            const reason = autoInterpretGateReason || '自動判讀需複核';
            const infoBox = document.getElementById('bimAutoCalcInfo');
            if (infoBox) infoBox.innerText = `一鍵流程中止：${reason}`;
            return showToast(`一鍵流程中止：${reason}`);
        }

        if (!bimModelData || !Array.isArray(bimModelData.elements) || !bimModelData.elements.length) {
            const infoBox = document.getElementById('bimAutoCalcInfo');
            if (infoBox) infoBox.innerText = '一鍵流程完成：圖紙判讀成功（未載入 BIM 模型，已跳過 BIM 自動計算）';
            return showToast('流程完成：已自動看圖計算（未載入 BIM，跳過 BIM 自動計算）');
        }

        updateBlueprintAutoInterpretStatus('一鍵流程：步驟2/2 IBM 自動計算中...', '#bfe7ff');
        runBimTechAutoCalculation();
        updateBlueprintAutoInterpretStatus('一鍵流程完成：看圖判讀 + IBM 自動計算已完成', '#9fffc0');
        const infoBox = document.getElementById('bimAutoCalcInfo');
        if (infoBox) infoBox.innerText = `一鍵流程完成：圖紙自動判讀 + IBM 自動計算｜執行時間 ${new Date().toLocaleTimeString('zh-TW')}`;
        showToast('✅ 一鍵完成：自動看圖計算 + IBM 自動計算');
    }

    function fitBlueprintToViewport() {
        if (!img.src || !canvasContainer || !img.naturalWidth || !img.naturalHeight) return;
        const viewportMetrics = getBlueprintViewportMetrics();
        if (!viewportMetrics) return;
        zoomLevel = viewportMetrics.fitZoom;
        applyZoom();
        const contentW = img.naturalWidth * zoomLevel;
        const contentH = img.naturalHeight * zoomLevel;
        canvasContainer.scrollLeft = Math.max(0, (contentW - canvasContainer.clientWidth) / 2);
        canvasContainer.scrollTop = Math.max(0, (contentH - canvasContainer.clientHeight) / 2);
        updateTouchInteractionMode();
    }

    function getBlueprintViewportMetrics(targetZoom = zoomLevel) {
        if (!img.src || !canvasContainer || !img.naturalWidth || !img.naturalHeight) return null;
        const padding = 12;
        const viewW = Math.max(120, canvasContainer.clientWidth - padding);
        const viewH = Math.max(120, canvasContainer.clientHeight - padding);
        const ratioW = viewW / img.naturalWidth;
        const ratioH = viewH / img.naturalHeight;
        let fitZoom = Math.min(ratioW, ratioH);
        if (isMobileViewport()) {
            // Keep a small overflow margin on mobile so the drawing can pan
            // in both axes instead of feeling locked after upload.
            fitZoom *= 1.08;
        }
        fitZoom = Math.max(0.2, Math.min(5, fitZoom));
        const resolvedZoom = Math.max(0.2, Math.min(5, Number(targetZoom) || fitZoom));
        const contentW = img.naturalWidth * resolvedZoom;
        const contentH = img.naturalHeight * resolvedZoom;
        return {
            fitZoom,
            resolvedZoom,
            overflowX: Math.max(0, contentW - canvasContainer.clientWidth),
            overflowY: Math.max(0, contentH - canvasContainer.clientHeight)
        };
    }

    function canSingleFingerPanBlueprint() {
        if (!canUseBlueprintGestures()) return false;
        const metrics = getBlueprintViewportMetrics();
        if (!metrics) return false;
        const zoomedPastFit = zoomLevel > metrics.fitZoom + 0.018;
        const hasOverflow = metrics.overflowX > 18 || metrics.overflowY > 18;
        const isScrolled = (canvasContainer && (canvasContainer.scrollLeft > 6 || canvasContainer.scrollTop > 6));
        return zoomedPastFit || hasOverflow || isScrolled;
    }

    function getBlueprintTouchMode() {
        const hasBlueprint = !!(img && img.getAttribute('src'));
        const allow3DDrag = is3DView && !is360Spinning && !gyroState.enabled;
        const activeMeasure = isMeasureInteractionMode(drawMode);
        if (!hasBlueprint) return 'idle';
        if (allow3DDrag) return '3d';
        if (activeMeasure) return 'measure';
        return canSingleFingerPanBlueprint() ? 'pan' : 'page';
    }

    function updateBlueprintTouchHint(mode = getBlueprintTouchMode()) {
        const touchHint = document.getElementById('touchGestureInfo');
        const mobileTouchHint = document.getElementById('mobileBlueprintTouchInfo');
        const hintText = mode === 'measure'
            ? '量圖模式：單指取點 / 拖曳微調'
            : mode === '3d'
                ? '3D 模式：單指拖曳視角 / 雙指縮放'
                : mode === 'pan'
                    ? '圖面已放大：單指拖圖 / 雙指縮放'
                    : mode === 'page'
                        ? '一般瀏覽：單指滑頁 / 雙指縮放'
                        : '上傳圖後可縮放與滑動';
        if (touchHint) touchHint.innerText = hintText;
        if (mobileTouchHint) mobileTouchHint.innerText = hintText;
    }

    function apply3DTransform() {
        const wrapper = document.getElementById('img-wrapper');
        updateTouchInteractionMode();
        if (!wrapper) return;
        if (!is3DView) {
            wrapper.style.transform = 'none';
            wrapper.classList.remove('viewer-3d', 'dragging');
            return;
        }
        wrapper.classList.add('viewer-3d');
        wrapper.style.transform = `perspective(1300px) rotateX(${rotation3D.x}deg) rotateY(${rotation3D.y}deg)`;
    }

    function updateTouchInteractionMode() {
        const wrapper = document.getElementById('img-wrapper');
        const canvasEl = document.getElementById('drawCanvas');
        const hasBlueprint = !!(img && img.getAttribute('src'));
        const touchMode = getBlueprintTouchMode();
        const relaxedTouchAction = hasBlueprint ? 'pan-y pinch-zoom' : 'auto';
        const lockedTouchAction = 'none';
        const surfaceTouchAction = touchMode === 'measure' || touchMode === '3d' || touchMode === 'pan'
            ? lockedTouchAction
            : relaxedTouchAction;

        if (wrapper) {
            wrapper.style.touchAction = surfaceTouchAction;
        }
        if (canvasEl) {
            canvasEl.style.touchAction = surfaceTouchAction;
        }
        if (canvasContainer) {
            canvasContainer.style.touchAction = surfaceTouchAction;
            canvasContainer.style.overscrollBehavior = (touchMode === 'pan' || touchMode === 'measure' || touchMode === '3d') ? 'contain' : 'auto';
            canvasContainer.dataset.touchMode = touchMode;
        }
        updateBlueprintTouchHint(touchMode);
    }

    function updateGyroUI() {
        const btn = document.getElementById('btnGyro');
        const info = document.getElementById('gyroInfo');
        if (btn) btn.innerText = gyroState.enabled ? '🧭 陀螺儀: 開' : '🧭 陀螺儀: 關';
        if (!info) return;
        if (!gyroState.enabled) info.innerText = '陀螺儀: 未啟用';
        else if (!gyroState.ready) info.innerText = '陀螺儀: 啟用中（請稍候）';
        else info.innerText = '陀螺儀: 追蹤中';
    }

    function updateMeasureAssistUI() {
        const btn = document.getElementById('btnMeasureAssist');
        const strictBtn = document.getElementById('btnMeasureStrict');
        const info = document.getElementById('measureAssistInfo');
        if (btn) btn.innerText = measureAssistState.enabled ? '📏 量圖輔助: 開' : '📏 量圖輔助: 關';
        if (strictBtn) strictBtn.innerText = measureAssistState.strict ? '🛡 量圖嚴格: 開' : '🛡 量圖嚴格: 關';
        if (!info) return;
        if (!measureAssistState.enabled) info.innerText = '量圖輔助: 未啟用';
        else if (measureAssistState.baselineBeta === null) info.innerText = '量圖輔助: 待校正';
        else info.innerText = `量圖輔助: 傾斜 ${measureAssistState.tiltDeg.toFixed(1)}°${measureAssistState.strict ? '（嚴格）' : ''}`;
    }

    function createDefaultSmartMeasureState() {
        return {
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
    }

    function isSmartMeasureMode(mode = drawMode) {
        return SMART_MEASURE_DRAW_MODES.includes(mode);
    }

    function isMeasureInteractionMode(mode = drawMode) {
        return mode === 'calibration' || mode === 'measure' || isSmartMeasureMode(mode);
    }

    function resetSmartMeasureSession(options = {}) {
        const preserveLastResult = options.preserveLastResult !== false;
        const lastResult = preserveLastResult ? smartMeasureState.lastResult : '';
        const lastQaSummary = preserveLastResult ? smartMeasureState.lastQaSummary : '';
        smartMeasureDragState = { active: false, pointIndex: -1, moved: false };
        smartMeasureState = createDefaultSmartMeasureState();
        smartMeasureState.lastResult = lastResult;
        smartMeasureState.lastQaSummary = lastQaSummary;
        renderSmartMeasureOverlay();
        updateSmartMeasureUI();
        updateSmartMeasureQualityStatus();
    }

    function clampNumber(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function describeSmartMeasureQuality(score) {
        if (score >= 88) return '高';
        if (score >= 72) return '中';
        return '低';
    }

    function getSmartMeasureQaTone(score) {
        if (score >= 88) return { label: '穩定', color: '#9fffc0' };
        if (score >= 72) return { label: '可複核', color: '#ffd48a' };
        return { label: '低信心', color: '#ffb5b5' };
    }

    function buildSmartMeasureQaSummary() {
        const qa = getSmartMeasureQaTone(smartMeasureState.qualityScore);
        const parts = [
            `等級 ${qa.label}`,
            `信心 ${smartMeasureState.qualityScore}`
        ];
        parts.push(smartMeasureState.lastSnapUsed ? '已使用吸附' : '未吸附');
        if (smartMeasureState.lastManualAdjust) parts.push('有手動修正');
        if (smartMeasureState.dragAdjustCount > 0) parts.push(`拖曳 ${smartMeasureState.dragAdjustCount} 次`);
        if (smartMeasureState.nudgeAdjustCount > 0) parts.push(`微調 ${smartMeasureState.nudgeAdjustCount} 次`);
        if (smartMeasureState.fallbackUsed) parts.push('低信心回退');
        return {
            text: `智慧量圖 QA：${parts.join(' / ')}`,
            color: qa.color,
            label: qa.label
        };
    }

    function updateSmartMeasureQualityStatus() {
        const qa = buildSmartMeasureQaSummary();
        smartMeasureState.lastQaSummary = qa.text;
        const qualityBox = document.getElementById('blueprint-quality-info');
        if (smartMeasureState.active) {
            if (qualityBox) {
                qualityBox.innerText = qa.text;
                qualityBox.style.color = qa.color;
            }
            syncMobileBlueprintStatusCard();
            return;
        }
        const report = analyzeBlueprintImageQuality();
        if (!qualityBox) return;
        if (!report) {
            qualityBox.innerText = smartMeasureState.lastQaSummary || '圖紙品質: 待檢查';
            qualityBox.style.color = smartMeasureState.lastQaSummary ? qa.color : '#c7d6e6';
            syncMobileBlueprintStatusCard();
            return;
        }
        if (smartMeasureState.lastQaSummary) {
            qualityBox.innerText = `${smartMeasureState.lastQaSummary}｜圖紙 ${report.quality}`;
            qualityBox.style.color = qa.color;
            syncMobileBlueprintStatusCard();
            return;
        }
        updateBlueprintQualityStatus();
    }

    function getBlueprintFallbackBounds() {
        if (!img.naturalWidth || !img.naturalHeight) return null;
        const padX = Math.max(24, Math.round(img.naturalWidth * 0.08));
        const padY = Math.max(24, Math.round(img.naturalHeight * 0.08));
        const widthPx = Math.max(80, img.naturalWidth - padX * 2);
        const heightPx = Math.max(80, img.naturalHeight - padY * 2);
        return {
            x: padX,
            y: padY,
            widthPx,
            heightPx,
            longPx: Math.max(widthPx, heightPx),
            shortPx: Math.min(widthPx, heightPx),
            coverage: 0.58
        };
    }

    function computeSmartMeasureQualityScore(qualityReport, bounds, fallbackUsed) {
        const qualityText = qualityReport && qualityReport.quality ? qualityReport.quality : '';
        const qualityScore = qualityToScore(qualityText || '可用');
        const coverageScore = clampNumber((bounds && bounds.coverage ? bounds.coverage : 0.24) / 0.72, 0.28, 1);
        const fallbackFactor = fallbackUsed ? 0.84 : 1;
        return Math.max(35, Math.round((qualityScore * 0.62 + coverageScore * 0.38) * 100 * fallbackFactor));
    }

    function getNextMeasureTargetField() {
        const type = document.getElementById('calcType') ? document.getElementById('calcType').value : '';
        const v1 = document.getElementById('v1');
        const v2 = document.getElementById('v2');
        if (type.startsWith('R_') && v2 && !String(v2.value || '').trim()) return 'v2';
        if (v1 && !String(v1.value || '').trim()) return 'v1';
        return 'v2';
    }

    function getSmartMeasurePlan(type) {
        switch (type) {
        case 'M_WALL':
            return [
                { field: 'v1', axis: 'long', label: '牆長', optional: false },
                { field: 'v2', axis: 'short', label: '牆高/版短邊', optional: false }
            ];
        case 'M_COL':
            return [
                { field: 'v1', axis: 'long', label: '柱寬 A', optional: false },
                { field: 'v2', axis: 'short', label: '柱寬 B', optional: false },
                { field: 'v3', axis: 'height', label: '柱高', optional: false }
            ];
        case 'M_BEAM_SIDES':
            return [
                { field: 'v1', axis: 'long', label: '樑長', optional: false },
                { field: 'v3', axis: 'height', label: '樑側高', optional: false },
                { field: 'v2', axis: 'short', label: '樑寬', optional: true }
            ];
        case 'M_BEAM_ALL':
            return [
                { field: 'v1', axis: 'long', label: '樑長', optional: false },
                { field: 'v2', axis: 'short', label: '樑寬', optional: false },
                { field: 'v3', axis: 'height', label: '樑高', optional: false }
            ];
        case 'R_SLAB':
            return [
                { field: 'v2', axis: 'long', label: '單排長度', optional: false }
            ];
        case 'R_MAIN':
            return [
                { field: 'v2', axis: 'long', label: '主筋單支長度', optional: false }
            ];
        case 'R_HOOP':
            return [
                { field: 'v2', axis: 'loop', label: '箍筋單圈展開長度', optional: false }
            ];
        case 'C_COL':
            return [
                { field: 'v1', axis: 'long', label: '柱長 A', optional: false },
                { field: 'v2', axis: 'short', label: '柱寬 B', optional: false },
                { field: 'v3', axis: 'height', label: '柱高', optional: false }
            ];
        case 'C_VOL':
        case 'E_DIG':
        default:
            return [
                { field: 'v1', axis: 'long', label: '長度', optional: false },
                { field: 'v2', axis: 'short', label: '寬度', optional: false },
                { field: 'v3', axis: 'height', label: '高度/深度', optional: false }
            ];
        }
    }

    function getSmartMeasureTaskValue(task) {
        if (!task || !task.field) return '';
        const input = document.getElementById(task.field);
        return input ? String(input.value || '').trim() : '';
    }

    function getNextSmartMeasureTaskIndex(plan, startIndex = 0) {
        const tasks = Array.isArray(plan) ? plan : [];
        for (let i = startIndex; i < tasks.length; i += 1) {
            if (!getSmartMeasureTaskValue(tasks[i])) return i;
        }
        return -1;
    }

    function getCurrentSmartMeasureTask() {
        if (!Array.isArray(smartMeasureState.measurePlan)) return null;
        if (!Number.isInteger(smartMeasureState.currentTaskIndex) || smartMeasureState.currentTaskIndex < 0) return null;
        return smartMeasureState.measurePlan[smartMeasureState.currentTaskIndex] || null;
    }

    function applySmartMeasureResultToInputs(distanceM) {
        const task = getCurrentSmartMeasureTask();
        if (!task || !task.field) {
            autofillMeasuredDistance(distanceM);
            return null;
        }
        const input = document.getElementById(task.field);
        if (input) input.value = distanceM.toFixed(2);
        previewCalc();
        setTimeout(() => focusNextInputField(task.field), 0);
        return task;
    }

    function continueSmartMeasureToNextTask() {
        const nextTaskIndex = getNextSmartMeasureTaskIndex(smartMeasureState.measurePlan, smartMeasureState.currentTaskIndex + 1);
        if (nextTaskIndex < 0) return false;
        const nextTask = smartMeasureState.measurePlan[nextTaskIndex];
        const suggestion = buildSmartMeasureSuggestion('smart-measure', smartMeasureState.componentType, smartMeasureState.bounds, nextTask);
        if (!suggestion || !suggestion.suggestionLine) return false;
        smartMeasureState.currentTaskIndex = nextTaskIndex;
        smartMeasureState.suggestionLine = suggestion.suggestionLine;
        smartMeasureState.guidePoints = suggestion.guidePoints;
        smartMeasureState.confirmedPoints = [];
        clickPoints = [];
        calibrationPendingPoint = null;
        drawMode = 'smart-measure';
        syncSmartMeasureStepMessage();
        renderSmartMeasureOverlay();
        updateSmartMeasureUI();
        return true;
    }

    function inferSmartMeasureComponentType() {
        const type = document.getElementById('calcType') ? document.getElementById('calcType').value : '';
        if (type === 'M_COL') return 'column';
        if (type === 'M_BEAM_SIDES' || type === 'M_BEAM_ALL' || type === 'R_MAIN' || type === 'R_HOOP') return 'beam';
        if (type === 'M_WALL') return 'wall';
        return 'slab';
    }

    function uniqueSmartGuidePoints(points) {
        const map = new Map();
        (Array.isArray(points) ? points : []).forEach(point => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
            const key = `${Math.round(point.x)}:${Math.round(point.y)}`;
            if (!map.has(key)) map.set(key, point);
        });
        return Array.from(map.values());
    }

    function projectPointToSegment(point, start, end) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq <= 0.0001) return { x: start.x, y: start.y };
        const t = clampNumber(((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq, 0, 1);
        return {
            x: start.x + dx * t,
            y: start.y + dy * t
        };
    }

    function sampleBlueprintLocalFeatures(point) {
        if (!img.src || !img.naturalWidth || !img.naturalHeight) return null;
        const radius = Math.round(clampNumber(30 / Math.max(0.5, zoomLevel), 16, 34));
        const sx = Math.max(0, Math.min(img.naturalWidth - 1, Math.round(point.x) - radius));
        const sy = Math.max(0, Math.min(img.naturalHeight - 1, Math.round(point.y) - radius));
        const sw = Math.max(8, Math.min(img.naturalWidth - sx, radius * 2 + 1));
        const sh = Math.max(8, Math.min(img.naturalHeight - sy, radius * 2 + 1));
        const off = document.createElement('canvas');
        off.width = sw;
        off.height = sh;
        const offCtx = off.getContext('2d', { willReadFrequently: true });
        if (!offCtx) return null;
        offCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        const imageData = offCtx.getImageData(0, 0, sw, sh).data;
        const gray = new Float32Array(sw * sh);
        for (let i = 0, j = 0; i < imageData.length; i += 4, j += 1) {
            gray[j] = imageData[i] * 0.299 + imageData[i + 1] * 0.587 + imageData[i + 2] * 0.114;
        }
        const rowScores = new Float32Array(sh);
        const colScores = new Float32Array(sw);
        const centerX = clampNumber(point.x - sx, 0, sw - 1);
        const centerY = clampNumber(point.y - sy, 0, sh - 1);
        let bestEdge = null;
        let bestEdgeScore = 0;
        for (let y = 1; y < sh - 1; y += 1) {
            for (let x = 1; x < sw - 1; x += 1) {
                const i = y * sw + x;
                const gx = (
                    -gray[i - sw - 1] + gray[i - sw + 1] +
                    -2 * gray[i - 1] + 2 * gray[i + 1] +
                    -gray[i + sw - 1] + gray[i + sw + 1]
                );
                const gy = (
                    gray[i - sw - 1] + 2 * gray[i - sw] + gray[i - sw + 1] -
                    gray[i + sw - 1] - 2 * gray[i + sw] - gray[i + sw + 1]
                );
                const mag = Math.sqrt(gx * gx + gy * gy);
                rowScores[y] += Math.abs(gy);
                colScores[x] += Math.abs(gx);
                const dist = Math.hypot(x - centerX, y - centerY);
                const weighted = mag / (1 + dist * 0.65);
                if (weighted > bestEdgeScore) {
                    bestEdgeScore = weighted;
                    bestEdge = { x: sx + x, y: sy + y, score: mag };
                }
            }
        }
        let bestColIndex = -1;
        let bestColWeighted = 0;
        let colSum = 0;
        for (let x = 1; x < sw - 1; x += 1) {
            colSum += colScores[x];
            const weighted = colScores[x] / (1 + Math.abs(x - centerX) * 0.45);
            if (weighted > bestColWeighted) {
                bestColWeighted = weighted;
                bestColIndex = x;
            }
        }
        let bestRowIndex = -1;
        let bestRowWeighted = 0;
        let rowSum = 0;
        for (let y = 1; y < sh - 1; y += 1) {
            rowSum += rowScores[y];
            const weighted = rowScores[y] / (1 + Math.abs(y - centerY) * 0.45);
            if (weighted > bestRowWeighted) {
                bestRowWeighted = weighted;
                bestRowIndex = y;
            }
        }
        const colMean = colSum / Math.max(1, sw - 2);
        const rowMean = rowSum / Math.max(1, sh - 2);
        const verticalEdge = bestColIndex >= 0 && bestColWeighted > colMean * 1.12
            ? { x: sx + bestColIndex, y: point.y, score: bestColWeighted }
            : null;
        const horizontalEdge = bestRowIndex >= 0 && bestRowWeighted > rowMean * 1.12
            ? { x: point.x, y: sy + bestRowIndex, score: bestRowWeighted }
            : null;
        const corner = verticalEdge && horizontalEdge
            ? { x: verticalEdge.x, y: horizontalEdge.y, score: (verticalEdge.score + horizontalEdge.score) / 2 }
            : null;
        return {
            bestEdge,
            verticalEdge,
            horizontalEdge,
            corner
        };
    }

    function buildSmartMeasureSuggestion(mode, componentType, bounds, task = null) {
        if (!bounds) return null;
        const marginX = Math.max(18, Math.min(bounds.widthPx * 0.08, 54));
        const marginY = Math.max(18, Math.min(bounds.heightPx * 0.08, 54));
        const left = bounds.x + marginX;
        const right = bounds.x + bounds.widthPx - marginX;
        const top = bounds.y + marginY;
        const bottom = bounds.y + bounds.heightPx - marginY;
        const centerX = (left + right) / 2;
        const centerY = (top + bottom) / 2;
        const longHorizontal = bounds.widthPx >= bounds.heightPx;
        const taskAxis = task && task.axis ? task.axis : '';
        const targetField = mode === 'smart-calibration' ? 'scale' : (task && task.field ? task.field : getNextMeasureTargetField());
        let suggestionLine = null;

        if (mode === 'smart-calibration') {
            suggestionLine = longHorizontal
                ? { start: { x: left, y: centerY }, end: { x: right, y: centerY }, label: '建議比例長邊' }
                : { start: { x: centerX, y: top }, end: { x: centerX, y: bottom }, label: '建議比例長邊' };
        } else if (componentType === 'column') {
            suggestionLine = (taskAxis === 'height')
                ? { start: { x: centerX, y: top }, end: { x: centerX, y: bottom }, label: `${task && task.label ? task.label : '柱高'}建議線` }
                : (targetField === 'v2'
                    ? { start: { x: centerX, y: top }, end: { x: centerX, y: bottom }, label: `${task && task.label ? task.label : '柱深'}建議線` }
                    : { start: { x: left, y: centerY }, end: { x: right, y: centerY }, label: `${task && task.label ? task.label : '柱寬'}建議線` });
        } else if (componentType === 'beam') {
            if (taskAxis === 'height') {
                suggestionLine = longHorizontal
                    ? { start: { x: centerX, y: top }, end: { x: centerX, y: bottom }, label: `${task && task.label ? task.label : '樑高'}建議線` }
                    : { start: { x: left, y: centerY }, end: { x: right, y: centerY }, label: `${task && task.label ? task.label : '樑高'}建議線` };
            } else if (targetField === 'v2') {
                suggestionLine = longHorizontal
                    ? { start: { x: centerX, y: top }, end: { x: centerX, y: bottom }, label: `${task && task.label ? task.label : '樑寬'}建議線` }
                    : { start: { x: left, y: centerY }, end: { x: right, y: centerY }, label: `${task && task.label ? task.label : '樑寬'}建議線` };
            } else {
                suggestionLine = longHorizontal
                    ? { start: { x: left, y: centerY }, end: { x: right, y: centerY }, label: `${task && task.label ? task.label : '樑長'}建議線` }
                    : { start: { x: centerX, y: top }, end: { x: centerX, y: bottom }, label: `${task && task.label ? task.label : '樑長'}建議線` };
            }
        } else if (componentType === 'wall') {
            suggestionLine = targetField === 'v2' || taskAxis === 'height'
                ? (longHorizontal
                    ? { start: { x: centerX, y: top }, end: { x: centerX, y: bottom }, label: `${task && task.label ? task.label : '牆高/厚'}建議線` }
                    : { start: { x: left, y: centerY }, end: { x: right, y: centerY }, label: `${task && task.label ? task.label : '牆高/厚'}建議線` })
                : (longHorizontal
                    ? { start: { x: left, y: centerY }, end: { x: right, y: centerY }, label: `${task && task.label ? task.label : '牆長'}建議線` }
                    : { start: { x: centerX, y: top }, end: { x: centerX, y: bottom }, label: `${task && task.label ? task.label : '牆長'}建議線` });
        } else {
            suggestionLine = (targetField === 'v2' || taskAxis === 'short')
                ? (longHorizontal
                    ? { start: { x: centerX, y: top }, end: { x: centerX, y: bottom }, label: `${task && task.label ? task.label : '短邊'}建議線` }
                    : { start: { x: left, y: centerY }, end: { x: right, y: centerY }, label: `${task && task.label ? task.label : '短邊'}建議線` })
                : (taskAxis === 'height'
                    ? { start: { x: centerX, y: top }, end: { x: centerX, y: bottom }, label: `${task && task.label ? task.label : '高度'}建議線` }
                    : (longHorizontal
                        ? { start: { x: left, y: centerY }, end: { x: right, y: centerY }, label: `${task && task.label ? task.label : '長邊'}建議線` }
                        : { start: { x: centerX, y: top }, end: { x: centerX, y: bottom }, label: `${task && task.label ? task.label : '長邊'}建議線` }));
        }

        const guidePoints = uniqueSmartGuidePoints([
            { x: left, y: top, label: '左上角' },
            { x: right, y: top, label: '右上角' },
            { x: left, y: bottom, label: '左下角' },
            { x: right, y: bottom, label: '右下角' },
            suggestionLine ? { x: suggestionLine.start.x, y: suggestionLine.start.y, label: '建議起點' } : null,
            suggestionLine ? { x: suggestionLine.end.x, y: suggestionLine.end.y, label: '建議終點' } : null
        ]);
        return { suggestionLine, guidePoints };
    }

    function updateSmartMeasureUI() {
        const info = document.getElementById('smartMeasureInfo');
        if (!info) return;
        if (smartMeasureState.active) {
            const modeLabel = SMART_MEASURE_MODE_LABELS[smartMeasureState.mode] || '智慧量圖';
            const componentLabel = SMART_MEASURE_COMPONENT_LABELS[smartMeasureState.componentType] || '構件';
            const task = getCurrentSmartMeasureTask();
            const taskLabel = task && task.label ? ` / 目標 ${task.label}` : '';
            const qa = buildSmartMeasureQaSummary();
            info.innerText = `智慧量圖: ${modeLabel} / ${componentLabel}${taskLabel} / ${smartMeasureState.message} / ${qa.text.replace('智慧量圖 QA：', '')}`;
            info.style.color = qa.color;
            return;
        }
        info.innerText = smartMeasureState.lastResult ? `智慧量圖: ${smartMeasureState.lastResult}` : '智慧量圖: 未啟動';
        info.style.color = smartMeasureState.lastResult ? '#d8f3ff' : '#bfe7ff';
    }

    function renderSmartMeasureOverlay() {
        const overlay = document.getElementById('smartMeasureOverlay');
        if (!overlay) return;
        if (!smartMeasureState.active) {
            overlay.innerHTML = '';
            return;
        }
        const bounds = smartMeasureState.bounds;
        const suggestionLine = smartMeasureState.suggestionLine;
        const confirmedPoints = Array.isArray(smartMeasureState.confirmedPoints) ? smartMeasureState.confirmedPoints : [];
        const guidePoints = Array.isArray(smartMeasureState.guidePoints) ? smartMeasureState.guidePoints : [];
        let html = '';

        if (bounds) {
            html += `<div class="smart-measure-box" style="left:${(bounds.x * zoomLevel).toFixed(1)}px; top:${(bounds.y * zoomLevel).toFixed(1)}px; width:${(bounds.widthPx * zoomLevel).toFixed(1)}px; height:${(bounds.heightPx * zoomLevel).toFixed(1)}px;"></div>`;
        }
        if (suggestionLine) {
            const dx = suggestionLine.end.x - suggestionLine.start.x;
            const dy = suggestionLine.end.y - suggestionLine.start.y;
            const length = Math.hypot(dx, dy) * zoomLevel;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const midX = ((suggestionLine.start.x + suggestionLine.end.x) / 2) * zoomLevel;
            const midY = ((suggestionLine.start.y + suggestionLine.end.y) / 2) * zoomLevel;
            html += `<div class="smart-measure-line" style="left:${(suggestionLine.start.x * zoomLevel).toFixed(1)}px; top:${(suggestionLine.start.y * zoomLevel).toFixed(1)}px; width:${length.toFixed(1)}px; transform: translateY(-50%) rotate(${angle.toFixed(2)}deg);"></div>`;
            html += `<div class="smart-measure-tag" style="left:${midX.toFixed(1)}px; top:${midY.toFixed(1)}px;">${suggestionLine.label}</div>`;
        }
        guidePoints.forEach(point => {
            const alreadyConfirmed = confirmedPoints.some(item => Math.hypot(item.x - point.x, item.y - point.y) < 1);
            html += `<div class="smart-measure-point${alreadyConfirmed ? ' confirmed' : ''}" style="left:${(point.x * zoomLevel).toFixed(1)}px; top:${(point.y * zoomLevel).toFixed(1)}px;"></div>`;
        });
        confirmedPoints.forEach((point, index) => {
            const draggingClass = smartMeasureDragState.active && smartMeasureDragState.pointIndex === index ? ' dragging' : '';
            html += `<div class="smart-measure-point confirmed${draggingClass}" data-confirmed-index="${index}" style="left:${(point.x * zoomLevel).toFixed(1)}px; top:${(point.y * zoomLevel).toFixed(1)}px;"></div>`;
            html += `<div class="smart-measure-tag" style="left:${(point.x * zoomLevel).toFixed(1)}px; top:${(point.y * zoomLevel).toFixed(1)}px;">${index === 0 ? '已確認起點' : '已確認終點'}</div>`;
        });
        html += `<div class="smart-measure-card"><strong>${SMART_MEASURE_MODE_LABELS[smartMeasureState.mode] || '智慧量圖'}｜${SMART_MEASURE_COMPONENT_LABELS[smartMeasureState.componentType] || '構件'}</strong><span>${smartMeasureState.message}</span><span>建議信心：${describeSmartMeasureQuality(smartMeasureState.qualityScore)} ${smartMeasureState.qualityScore}${smartMeasureState.fallbackUsed ? '｜低信心回退' : ''}</span><span>${smartMeasureState.lastSnapUsed ? '本次取點: 已吸附建議點/局部邊線' : '本次取點: 可手動微調確認'}</span><div class="smart-measure-actions"><button class="smart-measure-btn warn" type="button" onclick="acceptSmartSuggestedPoint()">套用目前建議點</button><button class="smart-measure-btn subtle" type="button" onclick="undoSmartMeasurePoint()">重選上一點</button><button class="smart-measure-btn" type="button" onclick="nudgeSmartMeasurePoint(-1, 0)">←</button><button class="smart-measure-btn" type="button" onclick="nudgeSmartMeasurePoint(0, -1)">↑</button><button class="smart-measure-btn" type="button" onclick="nudgeSmartMeasurePoint(0, 1)">↓</button><button class="smart-measure-btn" type="button" onclick="nudgeSmartMeasurePoint(1, 0)">→</button></div></div>`;
        overlay.innerHTML = html;
    }

    function getSmartMeasureSnap(point) {
        const tolerance = 34 / Math.max(0.35, zoomLevel);
        const suggestionLine = smartMeasureState.suggestionLine;
        const candidates = [];
        (smartMeasureState.guidePoints || []).forEach(candidate => {
            candidates.push({
                x: candidate.x,
                y: candidate.y,
                label: candidate.label || '建議點',
                maxTolerance: tolerance,
                priority: 0.28
            });
        });
        const localFeature = sampleBlueprintLocalFeatures(point);
        if (localFeature && localFeature.corner) {
            candidates.push({
                x: localFeature.corner.x,
                y: localFeature.corner.y,
                label: '局部角點',
                maxTolerance: tolerance * 0.92,
                priority: 0.38
            });
        }
        if (localFeature && localFeature.bestEdge) {
            candidates.push({
                x: localFeature.bestEdge.x,
                y: localFeature.bestEdge.y,
                label: '局部高對比邊',
                maxTolerance: tolerance * 0.82,
                priority: 0.2
            });
        }
        if (suggestionLine) {
            const projected = projectPointToSegment(point, suggestionLine.start, suggestionLine.end);
            candidates.push({
                x: projected.x,
                y: projected.y,
                label: '建議測線',
                maxTolerance: tolerance * 0.72,
                priority: 0.14
            });
            const horizontal = Math.abs(suggestionLine.end.x - suggestionLine.start.x) >= Math.abs(suggestionLine.end.y - suggestionLine.start.y);
            if (horizontal && localFeature && localFeature.verticalEdge) {
                const edgeProjected = projectPointToSegment({ x: localFeature.verticalEdge.x, y: point.y }, suggestionLine.start, suggestionLine.end);
                candidates.push({
                    x: edgeProjected.x,
                    y: edgeProjected.y,
                    label: '局部垂直邊',
                    maxTolerance: tolerance * 0.86,
                    priority: 0.32
                });
            }
            if (!horizontal && localFeature && localFeature.horizontalEdge) {
                const edgeProjected = projectPointToSegment({ x: point.x, y: localFeature.horizontalEdge.y }, suggestionLine.start, suggestionLine.end);
                candidates.push({
                    x: edgeProjected.x,
                    y: edgeProjected.y,
                    label: '局部水平邊',
                    maxTolerance: tolerance * 0.86,
                    priority: 0.32
                });
            }
        }
        let best = null;
        let bestScore = Infinity;
        candidates.forEach(candidate => {
            const dist = Math.hypot(point.x - candidate.x, point.y - candidate.y);
            const maxTolerance = candidate.maxTolerance || tolerance;
            if (dist > maxTolerance) return;
            const score = dist / Math.max(1, maxTolerance) - (candidate.priority || 0);
            if (score < bestScore) {
                bestScore = score;
                best = candidate;
            }
        });
        if (best) {
            return {
                point: { x: best.x, y: best.y },
                snapped: true,
                snapTarget: best.label || '建議點'
            };
        }
        return {
            point,
            snapped: false,
            snapTarget: '手動點位'
        };
    }

    function getSmartMeasureCurrentSuggestedPoint() {
        if (!smartMeasureState.suggestionLine) return null;
        if ((smartMeasureState.confirmedPoints || []).length === 0) return smartMeasureState.suggestionLine.start;
        return smartMeasureState.suggestionLine.end;
    }

    function syncSmartMeasureStepMessage() {
        if (!smartMeasureState.active) return;
        const pointCount = (smartMeasureState.confirmedPoints || []).length;
        const task = getCurrentSmartMeasureTask();
        const taskLabel = task && task.label ? task.label : '目前尺寸';
        if (pointCount <= 0) {
            smartMeasureState.step = 'confirm-start';
            smartMeasureState.message = smartMeasureState.mode === 'smart-calibration'
                ? '請先確認建議比例線起點，可直接套用或手動微調'
                : `已生成${smartMeasureState.suggestionLine ? smartMeasureState.suggestionLine.label : '建議測線'}，準備量${taskLabel}，請確認起點`;
            return;
        }
        smartMeasureState.step = 'confirm-end';
        smartMeasureState.message = `正在量${taskLabel}，請確認終點，必要時可用箭頭微調上一點`;
    }

    function commitSmartMeasurePoint(point, meta = {}) {
        if (!smartMeasureState.active) return;
        clickPoints.push({ x: point.x, y: point.y });
        smartMeasureState.confirmedPoints = clickPoints.slice();
        smartMeasureState.lastSnapUsed = smartMeasureState.lastSnapUsed || !!meta.snapped;
        smartMeasureState.lastManualAdjust = smartMeasureState.lastManualAdjust || !meta.snapped;
        updateSmartMeasureQualityStatus();
        if (clickPoints.length === 1) {
            syncSmartMeasureStepMessage();
            renderSmartMeasureOverlay();
            updateSmartMeasureUI();
            showToast(meta.snapped ? `已吸附起點：${meta.snapTarget || '建議點'}` : '起點已記錄，請確認終點');
            return;
        }
        const p1 = clickPoints[0];
        const p2 = clickPoints[1];
        if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 2) {
            clickPoints = [p1];
            smartMeasureState.confirmedPoints = clickPoints.slice();
            smartMeasureState.message = '終點太接近起點，請重新確認終點';
            renderSmartMeasureOverlay();
            updateSmartMeasureUI();
            return showToast('終點太接近起點，請重新點選終點');
        }
        smartMeasureState.message = '已完成智慧取點，正在回填尺寸';
        renderSmartMeasureOverlay();
        updateSmartMeasureUI();
        finalizeMeasurementFromPoints(drawMode, p1, p2);
    }

    function acceptSmartSuggestedPoint() {
        if (!smartMeasureState.active) return;
        const point = getSmartMeasureCurrentSuggestedPoint();
        if (!point) return showToast('目前沒有可套用的建議點');
        commitSmartMeasurePoint(point, { snapped: true, snapTarget: '目前建議點' });
    }

    function undoSmartMeasurePoint() {
        if (!smartMeasureState.active) return;
        if (!clickPoints.length) return showToast('目前沒有已確認的點位');
        clickPoints.pop();
        smartMeasureState.confirmedPoints = clickPoints.slice();
        syncSmartMeasureStepMessage();
        renderSmartMeasureOverlay();
        updateSmartMeasureUI();
        updateSmartMeasureQualityStatus();
        showToast('已退回上一個確認點');
    }

    function nudgeSmartMeasurePoint(dx, dy) {
        if (!smartMeasureState.active) return;
        if (!clickPoints.length) return showToast('請先確認一個點，再進行微調');
        const step = clampNumber(5 / Math.max(0.35, zoomLevel), 1.5, 8);
        const lastIndex = clickPoints.length - 1;
        const nextPoint = {
            x: clampNumber(clickPoints[lastIndex].x + dx * step, 0, img.naturalWidth),
            y: clampNumber(clickPoints[lastIndex].y + dy * step, 0, img.naturalHeight)
        };
        clickPoints[lastIndex] = nextPoint;
        smartMeasureState.confirmedPoints = clickPoints.slice();
        smartMeasureState.lastManualAdjust = true;
        smartMeasureState.nudgeAdjustCount += 1;
        smartMeasureState.message = lastIndex === 0 ? '起點已微調，請確認終點' : '終點已微調，可直接完成量測';
        renderSmartMeasureOverlay();
        updateSmartMeasureUI();
        updateSmartMeasureQualityStatus();
        showToast(`已微調${lastIndex === 0 ? '起點' : '終點'}`);
    }

    function getCanvasNaturalPointFromClient(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) / zoomLevel,
            y: (clientY - rect.top) / zoomLevel
        };
    }

    function getEventClientPoint(event) {
        if (event && event.touches && event.touches.length) {
            return { x: event.touches[0].clientX, y: event.touches[0].clientY };
        }
        if (event && event.changedTouches && event.changedTouches.length) {
            return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
        }
        return { x: event ? event.clientX : 0, y: event ? event.clientY : 0 };
    }

    function beginSmartMeasureDrag(event) {
        if (!smartMeasureState.active) return;
        const target = event.target && event.target.closest ? event.target.closest('.smart-measure-point.confirmed[data-confirmed-index]') : null;
        if (!target) return;
        const pointIndex = parseInt(target.getAttribute('data-confirmed-index'), 10);
        if (!Number.isInteger(pointIndex) || pointIndex < 0) return;
        smartMeasureDragState.active = true;
        smartMeasureDragState.pointIndex = pointIndex;
        smartMeasureDragState.moved = false;
        suppressNextCanvasClick = true;
        suppressNextCanvasTouch = true;
        canvasLastTouchAt = Date.now();
        if (event.cancelable) event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();
        renderSmartMeasureOverlay();
    }

    function moveSmartMeasureDrag(event) {
        if (!smartMeasureDragState.active) return;
        if (event.cancelable) event.preventDefault();
        const client = getEventClientPoint(event);
        const nextPoint = getCanvasNaturalPointFromClient(client.x, client.y);
        const pointIndex = smartMeasureDragState.pointIndex;
        if (pointIndex < 0 || pointIndex >= clickPoints.length) return;
        clickPoints[pointIndex] = {
            x: clampNumber(nextPoint.x, 0, img.naturalWidth),
            y: clampNumber(nextPoint.y, 0, img.naturalHeight)
        };
        smartMeasureState.confirmedPoints = clickPoints.slice();
        smartMeasureState.lastManualAdjust = true;
        smartMeasureDragState.moved = true;
        smartMeasureState.message = pointIndex === 0 ? '起點拖曳微調中，放開後再確認終點' : '終點拖曳微調中，放開後可直接完成';
        renderSmartMeasureOverlay();
        updateSmartMeasureUI();
        updateSmartMeasureQualityStatus();
    }

    function endSmartMeasureDrag(event) {
        if (!smartMeasureDragState.active) return;
        const pointIndex = smartMeasureDragState.pointIndex;
        const moved = smartMeasureDragState.moved;
        smartMeasureDragState.active = false;
        smartMeasureDragState.pointIndex = -1;
        smartMeasureDragState.moved = false;
        suppressNextCanvasClick = true;
        suppressNextCanvasTouch = true;
        canvasLastTouchAt = Date.now();
        if (event && event.cancelable) event.preventDefault();
        if (moved) {
            smartMeasureState.dragAdjustCount += 1;
            smartMeasureState.message = pointIndex === 0 ? '起點已拖曳微調，請確認終點' : '終點已拖曳微調，可直接完成量測';
            showToast(`已拖曳微調${pointIndex === 0 ? '起點' : '終點'}`);
        }
        renderSmartMeasureOverlay();
        updateSmartMeasureUI();
        updateSmartMeasureQualityStatus();
    }

    function drawMeasurementPoint(point, color = 'orange', radius = 6) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawMeasurementPendingPoint(point) {
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(point.x - 8, point.y);
        ctx.lineTo(point.x + 8, point.y);
        ctx.moveTo(point.x, point.y - 8);
        ctx.lineTo(point.x, point.y + 8);
        ctx.stroke();
    }

    function redrawManualMeasurementCanvas() {
        if (!canvas.width || !canvas.height) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        clickPoints.forEach(point => drawMeasurementPoint(point));
        if (clickPoints.length >= 2) {
            drawMeasurementLine(clickPoints[0], clickPoints[1]);
        }
        if (calibrationPendingPoint) {
            if (clickPoints.length === 1) {
                ctx.save();
                ctx.strokeStyle = 'rgba(255, 209, 102, 0.72)';
                ctx.lineWidth = 2;
                ctx.setLineDash([8, 6]);
                ctx.beginPath();
                ctx.moveTo(clickPoints[0].x, clickPoints[0].y);
                ctx.lineTo(calibrationPendingPoint.x, calibrationPendingPoint.y);
                ctx.stroke();
                ctx.restore();
            }
            drawMeasurementPendingPoint(calibrationPendingPoint);
        }
    }

    function isMobileManualMeasureMode() {
        return isMobileViewport() && img.src && (drawMode === 'calibration' || drawMode === 'measure');
    }

    function hideManualPrecisionOverlay() {
        const overlay = document.getElementById('manualPrecisionOverlay');
        if (!overlay) return;
        overlay.innerHTML = '';
        overlay.setAttribute('aria-hidden', 'true');
    }

    function getManualPrecisionTargetClientPoint(clientX, clientY) {
        const verticalOffsetPx = isMobileViewport() ? 76 : 0;
        const horizontalOffsetPx = 0;
        return {
            x: clientX + horizontalOffsetPx,
            y: clientY - verticalOffsetPx
        };
    }

    function renderManualPrecisionOverlay() {
        const overlay = document.getElementById('manualPrecisionOverlay');
        if (!overlay) return;
        if (!isMobileManualMeasureMode() || !calibrationPendingPoint || !canvasContainer) {
            hideManualPrecisionOverlay();
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const overlayRect = canvasContainer.getBoundingClientRect();
        const fallbackClientX = rect.left + calibrationPendingPoint.x * zoomLevel;
        const fallbackClientY = rect.top + calibrationPendingPoint.y * zoomLevel;
        const fingerClientX = manualPrecisionState.clientX || fallbackClientX;
        const fingerClientY = manualPrecisionState.clientY || fallbackClientY;
        const targetClientX = manualPrecisionState.targetClientX || fallbackClientX;
        const targetClientY = manualPrecisionState.targetClientY || fallbackClientY;
        const localFingerX = fingerClientX - overlayRect.left;
        const localFingerY = fingerClientY - overlayRect.top;
        const localTargetX = targetClientX - overlayRect.left;
        const localTargetY = targetClientY - overlayRect.top;
        const guideDx = localTargetX - localFingerX;
        const guideDy = localTargetY - localFingerY;
        const guideLength = Math.hypot(guideDx, guideDy);
        const guideAngle = Math.atan2(guideDy, guideDx) * 180 / Math.PI;
        const overlayWidth = 126;
        const overlayHeight = 142;
        const preferRight = localTargetX < overlayRect.width * 0.58;
        let cardLeft = preferRight ? localTargetX + 18 : localTargetX - overlayWidth - 18;
        let cardTop = localTargetY - overlayHeight / 2;
        cardLeft = clampNumber(cardLeft, 8, Math.max(8, overlayRect.width - overlayWidth - 8));
        cardTop = clampNumber(cardTop, 8, Math.max(8, overlayRect.height - overlayHeight - 8));

        overlay.innerHTML = `<div class="manual-precision-guide-line" style="left:${localFingerX.toFixed(1)}px; top:${localFingerY.toFixed(1)}px; width:${guideLength.toFixed(1)}px; transform: rotate(${guideAngle.toFixed(2)}deg);"></div><div class="manual-precision-finger-dot" style="left:${localFingerX.toFixed(1)}px; top:${localFingerY.toFixed(1)}px;"></div><div class="manual-precision-target" style="left:${localTargetX.toFixed(1)}px; top:${localTargetY.toFixed(1)}px;"><span class="manual-precision-target-ring"></span></div><div class="manual-precision-card" style="left:${cardLeft.toFixed(1)}px; top:${cardTop.toFixed(1)}px;"><span class="manual-precision-title">${manualPrecisionState.active ? '拖曳手指，下方控制，上方小十字取點' : '已對位，可再拖曳或直接確認'}</span><canvas id="manualPrecisionCanvas" class="manual-precision-canvas" width="112" height="112"></canvas></div>`;
        overlay.setAttribute('aria-hidden', 'false');
        overlay.style.left = '0px';
        overlay.style.top = '0px';

        const loupeCanvas = document.getElementById('manualPrecisionCanvas');
        if (!loupeCanvas) return;
        const loupeCtx = loupeCanvas.getContext('2d');
        if (!loupeCtx) return;
        const size = loupeCanvas.width;
        const zoom = 3.9;
        const sampleSize = size / zoom;
        const sx = clampNumber(calibrationPendingPoint.x - sampleSize / 2, 0, Math.max(0, img.naturalWidth - sampleSize));
        const sy = clampNumber(calibrationPendingPoint.y - sampleSize / 2, 0, Math.max(0, img.naturalHeight - sampleSize));
        const scale = size / sampleSize;
        const offsetX = -sx * scale;
        const offsetY = -sy * scale;
        const mapPoint = (point) => ({
            x: point.x * scale + offsetX,
            y: point.y * scale + offsetY
        });

        loupeCtx.clearRect(0, 0, size, size);
        loupeCtx.save();
        loupeCtx.beginPath();
        loupeCtx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
        loupeCtx.clip();
        loupeCtx.drawImage(img, sx, sy, sampleSize, sampleSize, 0, 0, size, size);
        loupeCtx.fillStyle = 'rgba(4, 10, 18, 0.06)';
        loupeCtx.fillRect(0, 0, size, size);
        if (clickPoints.length >= 2) {
            const p1 = mapPoint(clickPoints[0]);
            const p2 = mapPoint(clickPoints[1]);
            loupeCtx.strokeStyle = '#ff6b7a';
            loupeCtx.lineWidth = 2;
            loupeCtx.beginPath();
            loupeCtx.moveTo(p1.x, p1.y);
            loupeCtx.lineTo(p2.x, p2.y);
            loupeCtx.stroke();
        }
        if (clickPoints.length === 1) {
            const p1 = mapPoint(clickPoints[0]);
            const p2 = mapPoint(calibrationPendingPoint);
            loupeCtx.save();
            loupeCtx.strokeStyle = 'rgba(255, 209, 102, 0.8)';
            loupeCtx.lineWidth = 2;
            loupeCtx.setLineDash([6, 4]);
            loupeCtx.beginPath();
            loupeCtx.moveTo(p1.x, p1.y);
            loupeCtx.lineTo(p2.x, p2.y);
            loupeCtx.stroke();
            loupeCtx.restore();
        }
        clickPoints.forEach(point => {
            const mapped = mapPoint(point);
            loupeCtx.fillStyle = '#ff9f43';
            loupeCtx.beginPath();
            loupeCtx.arc(mapped.x, mapped.y, 4.5, 0, Math.PI * 2);
            loupeCtx.fill();
        });
        loupeCtx.restore();

        loupeCtx.save();
        loupeCtx.strokeStyle = 'rgba(255,255,255,0.96)';
        loupeCtx.lineWidth = 1.2;
        loupeCtx.beginPath();
        loupeCtx.moveTo(size / 2, 10);
        loupeCtx.lineTo(size / 2, size - 10);
        loupeCtx.moveTo(10, size / 2);
        loupeCtx.lineTo(size - 10, size / 2);
        loupeCtx.stroke();
        loupeCtx.strokeStyle = '#ffd166';
        loupeCtx.lineWidth = 2;
        loupeCtx.beginPath();
        loupeCtx.arc(size / 2, size / 2, 7, 0, Math.PI * 2);
        loupeCtx.stroke();
        loupeCtx.restore();
    }

    function updateManualPrecisionPointFromClient(clientX, clientY) {
        if (!canvas.width || !canvas.height) return;
        const targetClientPoint = getManualPrecisionTargetClientPoint(clientX, clientY);
        const rect = canvas.getBoundingClientRect();
        calibrationPendingPoint = {
            x: clampNumber((targetClientPoint.x - rect.left) / zoomLevel, 0, img.naturalWidth),
            y: clampNumber((targetClientPoint.y - rect.top) / zoomLevel, 0, img.naturalHeight)
        };
        manualPrecisionState.clientX = clientX;
        manualPrecisionState.clientY = clientY;
        manualPrecisionState.targetClientX = targetClientPoint.x;
        manualPrecisionState.targetClientY = targetClientPoint.y;
        redrawManualMeasurementCanvas();
        renderManualMeasurePad();
        renderManualPrecisionOverlay();
    }

    function beginManualPrecisionPlacement(event) {
        if (!isMobileManualMeasureMode()) return false;
        if (!event.touches || !event.touches.length) return false;
        const touch = event.touches[0];
        manualPrecisionState.active = true;
        suppressNextCanvasClick = true;
        suppressNextCanvasTouch = true;
        canvasLastTouchAt = Date.now();
        updateManualPrecisionPointFromClient(touch.clientX, touch.clientY);
        if (event.cancelable) event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();
        return true;
    }

    function moveManualPrecisionPlacement(event) {
        if (!manualPrecisionState.active || !isMobileManualMeasureMode()) return;
        if (!event.touches || !event.touches.length) return;
        const touch = event.touches[0];
        updateManualPrecisionPointFromClient(touch.clientX, touch.clientY);
        suppressNextCanvasTouch = true;
        suppressNextCanvasClick = true;
        if (event.cancelable) event.preventDefault();
    }

    function endManualPrecisionPlacement(event) {
        if (!manualPrecisionState.active) return;
        manualPrecisionState.active = false;
        suppressNextCanvasTouch = true;
        suppressNextCanvasClick = true;
        canvasLastTouchAt = Date.now();
        renderManualPrecisionOverlay();
        renderManualMeasurePad();
        if (event && event.cancelable) event.preventDefault();
    }

    function renderManualMeasurePad() {
        const pad = document.getElementById('manualMeasurePad');
        if (!pad) return;
        const activeManualMode = isMobileViewport() && img.src && (drawMode === 'calibration' || drawMode === 'measure');
        if (!activeManualMode) {
            pad.innerHTML = '';
            pad.setAttribute('aria-hidden', 'true');
            toggleMobileLeftDrawer(false);
            return;
        }
        const hasPending = !!calibrationPendingPoint;
        const hasConfirmed = clickPoints.length > 0;
        const targetLabel = clickPoints.length === 0 ? '起點' : '終點';
        const currentLabel = hasPending ? `暫存${targetLabel}` : (hasConfirmed ? '上一個確認點' : '尚未選點');
        const hint = manualPrecisionState.active
            ? `拖曳中：把十字準星對到線上，放手後再確認。`
            : hasPending
            ? `已選 ${targetLabel}，可用箭頭微調後按確認。`
            : (hasConfirmed ? '可用箭頭修正上一個點，或直接點圖選下一點。' : '先點圖放置點位，再用箭頭微調。');
        pad.innerHTML = `<div class="manual-measure-pad-card"><span class="manual-measure-pad-title">手動微調｜${currentLabel}</span><span class="manual-measure-pad-hint">${hint}</span><div class="manual-measure-pad-actions"><button class="manual-measure-pad-btn warn" type="button" onclick="confirmManualMeasurePendingPoint()"${hasPending ? '' : ' disabled'}>確認目前點位</button><button class="manual-measure-pad-btn" type="button" onclick="undoManualMeasurePoint()"${(hasPending || hasConfirmed) ? '' : ' disabled'}>回上一步</button></div><div class="manual-measure-pad-grid"><span></span><button class="manual-measure-pad-btn" type="button" onclick="nudgeManualMeasurePoint(0, -1)"${(hasPending || hasConfirmed) ? '' : ' disabled'}>↑</button><span></span><button class="manual-measure-pad-btn" type="button" onclick="nudgeManualMeasurePoint(-1, 0)"${(hasPending || hasConfirmed) ? '' : ' disabled'}>←</button><button class="manual-measure-pad-btn" type="button" onclick="nudgeManualMeasurePoint(0, 1)"${(hasPending || hasConfirmed) ? '' : ' disabled'}>↓</button><button class="manual-measure-pad-btn" type="button" onclick="nudgeManualMeasurePoint(1, 0)"${(hasPending || hasConfirmed) ? '' : ' disabled'}>→</button></div></div>`;
        pad.setAttribute('aria-hidden', 'false');
        toggleMobileLeftDrawer(true);
    }

    function confirmManualMeasurePendingPoint() {
        if (!(drawMode === 'calibration' || drawMode === 'measure')) return;
        if (!calibrationPendingPoint) return showToast('請先點圖放置點位');
        clickPoints.push({ x: calibrationPendingPoint.x, y: calibrationPendingPoint.y });
        calibrationPendingPoint = null;
        manualPrecisionState.active = false;
        redrawManualMeasurementCanvas();
        renderManualMeasurePad();
        renderManualPrecisionOverlay();
        if (clickPoints.length === 1) {
            showToast('起點已確認，請點終點後可再用箭頭微調');
            return;
        }
        if (clickPoints.length === 2) {
            finalizeMeasurementFromPoints(drawMode, clickPoints[0], clickPoints[1]);
        }
    }

    function undoManualMeasurePoint() {
        if (!(drawMode === 'calibration' || drawMode === 'measure')) return;
        if (calibrationPendingPoint) {
            calibrationPendingPoint = null;
            manualPrecisionState.active = false;
            redrawManualMeasurementCanvas();
            renderManualMeasurePad();
            renderManualPrecisionOverlay();
            showToast('已取消目前暫存點');
            return;
        }
        if (!clickPoints.length) return showToast('目前沒有可退回的點位');
        clickPoints.pop();
        redrawManualMeasurementCanvas();
        renderManualMeasurePad();
        showToast('已退回上一個確認點');
    }

    function nudgeManualMeasurePoint(dx, dy) {
        if (!(drawMode === 'calibration' || drawMode === 'measure')) return;
        const step = clampNumber(5 / Math.max(0.35, zoomLevel), 1.5, 8);
        if (calibrationPendingPoint) {
            calibrationPendingPoint = {
                x: clampNumber(calibrationPendingPoint.x + dx * step, 0, img.naturalWidth),
                y: clampNumber(calibrationPendingPoint.y + dy * step, 0, img.naturalHeight)
            };
        } else if (clickPoints.length) {
            const lastIndex = clickPoints.length - 1;
            clickPoints[lastIndex] = {
                x: clampNumber(clickPoints[lastIndex].x + dx * step, 0, img.naturalWidth),
                y: clampNumber(clickPoints[lastIndex].y + dy * step, 0, img.naturalHeight)
            };
        } else {
            return showToast('請先點圖放置點位');
        }
        redrawManualMeasurementCanvas();
        renderManualMeasurePad();
        renderManualPrecisionOverlay();
    }

    function drawMeasurementLine(p1, p2) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 110, 150, 0.48)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.restore();
    }

    function autofillMeasuredDistance(m) {
        let targetField = 'v2';
        let targetLabel = '寬 / 寬B';
        if (!document.getElementById('v2').value && document.getElementById('calcType').value.startsWith('R_')) {
            document.getElementById('v2').value = m.toFixed(2);
            targetField = 'v2';
            targetLabel = document.getElementById('lbl_v2') ? document.getElementById('lbl_v2').innerText : 'v2';
        } else if (!document.getElementById('v1').value) {
            document.getElementById('v1').value = m.toFixed(2);
            targetField = 'v1';
            targetLabel = document.getElementById('lbl_v1') ? document.getElementById('lbl_v1').innerText : 'v1';
        } else {
            document.getElementById('v2').value = m.toFixed(2);
            targetField = 'v2';
            targetLabel = document.getElementById('lbl_v2') ? document.getElementById('lbl_v2').innerText : 'v2';
        }
        previewCalc();
        return { field: targetField, label: targetLabel };
    }

    function finalizeSmartMeasureResult(summary) {
        smartMeasureDragState = { active: false, pointIndex: -1, moved: false };
        measureQaStats.smartCompleted += 1;
        if (smartMeasureState.lastSnapUsed) measureQaStats.smartSnapUses += 1;
        if (smartMeasureState.lastManualAdjust) measureQaStats.smartManualAdjusts += 1;
        if (smartMeasureState.dragAdjustCount > 0) measureQaStats.smartDragAdjusts += smartMeasureState.dragAdjustCount;
        smartMeasureState.active = false;
        smartMeasureState.message = '已完成';
        smartMeasureState.confirmedPoints = [];
        smartMeasureState.lastResult = summary;
        smartMeasureState.lastQaSummary = buildSmartMeasureQaSummary().text;
        updateQaDashboard();
        renderSmartMeasureOverlay();
        updateSmartMeasureUI();
        updateSmartMeasureQualityStatus();
    }

    function finalizeMeasurementFromPoints(mode, p1, p2) {
        drawMeasurementLine(p1, p2);
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (mode === 'calibration' || mode === 'smart-calibration') {
            const actualLen = prompt('這條線實際是幾公尺？(m)', '1');
            if (actualLen && !isNaN(actualLen) && actualLen > 0) {
                scalePixelsPerUnit = dist / parseFloat(actualLen);
                measureQaStats.calibrationSuccess += 1;
                updateQaDashboard();
                document.getElementById('scale-info').innerText = '✅ 比例已設';
                recordMeasurementLog({
                    mode,
                    modeLabel: mode === 'smart-calibration' ? '智慧定比例' : '定比例',
                    targetField: 'scale',
                    targetLabel: '比例校正',
                    actualLenM: parseFloat(actualLen),
                    scalePixelsPerUnit,
                    distancePx: dist,
                    componentType: mode === 'smart-calibration' ? smartMeasureState.componentType : '',
                    smart: mode === 'smart-calibration',
                    snapped: mode === 'smart-calibration' ? smartMeasureState.lastSnapUsed : false,
                    manualAdjust: mode === 'smart-calibration' ? smartMeasureState.lastManualAdjust : false,
                    dragAdjustCount: mode === 'smart-calibration' ? smartMeasureState.dragAdjustCount : 0,
                    nudgeAdjustCount: mode === 'smart-calibration' ? smartMeasureState.nudgeAdjustCount : 0,
                    qualityScore: mode === 'smart-calibration' ? smartMeasureState.qualityScore : 0,
                    fallbackUsed: mode === 'smart-calibration' ? smartMeasureState.fallbackUsed : false,
                    summary: mode === 'smart-calibration'
                        ? `智慧比例校正｜${buildSmartMeasureQaSummary().text.replace('智慧量圖 QA：', '')}`
                        : `手動比例校正｜比例 ${scalePixelsPerUnit.toFixed(2)} px/m`,
                    p1,
                    p2
                });
                showToast(mode === 'smart-calibration' ? '智慧定比例完成！可以開始量測了' : '比例設定完成！可以開始測量了');
                if (mode === 'smart-calibration') {
                    finalizeSmartMeasureResult(`最近完成智慧定比例｜吸附${smartMeasureState.lastSnapUsed ? '有' : '無'}｜信心 ${smartMeasureState.qualityScore}`);
                }
            } else {
                showToast('比例設定取消或無效');
                if (mode === 'smart-calibration') finalizeSmartMeasureResult('智慧定比例已取消，可改用手動模式');
            }
        } else if (mode === 'measure' || mode === 'smart-measure') {
            const m = dist / scalePixelsPerUnit;
            measureQaStats.measureSuccess += 1;
            updateQaDashboard();
            if (mode === 'smart-measure') {
                const filledTask = applySmartMeasureResultToInputs(m);
                const snapText = smartMeasureState.lastSnapUsed ? '已吸附' : '手動微調';
                const taskLabel = filledTask && filledTask.label ? filledTask.label : '尺寸';
                recordMeasurementLog({
                    mode,
                    modeLabel: '智慧量圖',
                    targetField: filledTask && filledTask.field ? filledTask.field : '',
                    targetLabel: taskLabel,
                    valueM: m,
                    scalePixelsPerUnit,
                    distancePx: dist,
                    componentType: smartMeasureState.componentType,
                    smart: true,
                    snapped: smartMeasureState.lastSnapUsed,
                    manualAdjust: smartMeasureState.lastManualAdjust,
                    dragAdjustCount: smartMeasureState.dragAdjustCount,
                    nudgeAdjustCount: smartMeasureState.nudgeAdjustCount,
                    qualityScore: smartMeasureState.qualityScore,
                    fallbackUsed: smartMeasureState.fallbackUsed,
                    summary: `${taskLabel}｜${snapText}｜${buildSmartMeasureQaSummary().text.replace('智慧量圖 QA：', '')}`,
                    p1,
                    p2
                });
                if (continueSmartMeasureToNextTask()) {
                    showToast(`📏 已回填${taskLabel}: ${m.toFixed(2)}m，繼續下一個尺寸`);
                    return;
                }
                showToast(`📏 測量結果: ${m.toFixed(2)}m`);
                finalizeSmartMeasureResult(`最近完成智慧量圖 ${taskLabel} ${m.toFixed(2)}m｜${snapText}｜信心 ${smartMeasureState.qualityScore}`);
            } else {
                const filledTask = autofillMeasuredDistance(m);
                recordMeasurementLog({
                    mode,
                    modeLabel: '手動量測',
                    targetField: filledTask && filledTask.field ? filledTask.field : '',
                    targetLabel: filledTask && filledTask.label ? filledTask.label : '尺寸',
                    valueM: m,
                    scalePixelsPerUnit,
                    distancePx: dist,
                    componentType: '',
                    smart: false,
                    snapped: false,
                    manualAdjust: false,
                    dragAdjustCount: 0,
                    nudgeAdjustCount: 0,
                    qualityScore: 0,
                    fallbackUsed: false,
                    summary: `手動量測｜回填 ${filledTask && filledTask.label ? filledTask.label : '尺寸'}`,
                    p1,
                    p2
                });
                showToast(`📏 測量結果: ${m.toFixed(2)}m`);
            }
        }
        clickPoints = [];
        calibrationPendingPoint = null;
        manualPrecisionState.active = false;
        drawMode = 'none';
        syncMobileMeasureModeUI();
        renderManualMeasurePad();
        renderManualPrecisionOverlay();
    }

    function prepareSmartMeasure(mode) {
        const qualityReport = updateBlueprintQualityStatus();
        let bounds = detectBlueprintPrimaryBounds();
        let fallbackUsed = false;
        if (!bounds) {
            bounds = getBlueprintFallbackBounds();
            fallbackUsed = true;
        }
        if (!bounds) return showToast('智慧量圖暫時無法分析圖紙，請改用手動模式');
        const componentType = mode === 'smart-calibration' ? 'slab' : inferSmartMeasureComponentType();
        const measurePlan = mode === 'smart-measure'
            ? getSmartMeasurePlan(document.getElementById('calcType') ? document.getElementById('calcType').value : '')
            : [];
        const currentTaskIndex = mode === 'smart-measure' ? getNextSmartMeasureTaskIndex(measurePlan, 0) : -1;
        if (mode === 'smart-measure' && currentTaskIndex < 0) {
            return showToast('智慧量圖可量的尺寸都已填入，可先清空欄位再重量');
        }
        const currentTask = currentTaskIndex >= 0 ? measurePlan[currentTaskIndex] : null;
        const suggestion = buildSmartMeasureSuggestion(mode, componentType, bounds, currentTask);
        if (!suggestion || !suggestion.suggestionLine) {
            return showToast('智慧量圖暫時無法生成建議，請改用手動模式');
        }
        clickPoints = [];
        calibrationPendingPoint = null;
        drawMode = mode;
        const qualityScore = computeSmartMeasureQualityScore(qualityReport, bounds, fallbackUsed);
        measureQaStats.smartSessions += 1;
        if (fallbackUsed) measureQaStats.smartFallbacks += 1;
        if (qualityScore < 72) measureQaStats.smartLowConfidence += 1;
        smartMeasureState = {
            active: true,
            mode,
            step: 'confirm-start',
            componentType,
            measurePlan,
            currentTaskIndex,
            bounds,
            suggestionLine: suggestion.suggestionLine,
            guidePoints: suggestion.guidePoints,
            confirmedPoints: [],
            qualityScore,
            fallbackUsed,
            lastSnapUsed: false,
            lastManualAdjust: false,
            dragAdjustCount: 0,
            nudgeAdjustCount: 0,
            message: mode === 'smart-calibration'
                ? '請先確認建議比例線起點'
                : `已生成${suggestion.suggestionLine.label}，請確認起點`,
            lastResult: smartMeasureState.lastResult || '',
            lastQaSummary: ''
        };
        syncSmartMeasureStepMessage();
        renderSmartMeasureOverlay();
        updateSmartMeasureUI();
        updateSmartMeasureQualityStatus();
        syncMobileMeasureModeUI();
        showToast(fallbackUsed ? '智慧量圖已啟動（低信心建議，可隨時切回手動）' : '智慧量圖已啟動，請依提示確認測點');
    }

    async function startSmartCalibration() {
        if (typeof ensureWorkModeAccess === 'function' && !ensureWorkModeAccess('calc', '請先切到第三頁計算模式再做智慧定比例')) return;
        if (!(await ensureFeatureAccess('smartCalibration', '智慧定比例僅開放會員3（專家）第三頁使用'))) return;
        if (is3DView) return showToast('請先關閉 3D 檢視再做智慧定比例');
        if (!img.src) return showToast('請先上傳圖紙再做智慧定比例');
        measureQaStats.calibrationStarts += 1;
        if (measureAssistState.enabled) calibrateMeasureAssist();
        prepareSmartMeasure('smart-calibration');
    }

    async function startSmartMeasure() {
        if (typeof ensureWorkModeAccess === 'function' && !ensureWorkModeAccess('calc', '請先切到第三頁計算模式再做智慧量圖')) return;
        if (!(await ensureFeatureAccess('smartMeasure', '智慧量圖僅開放會員3（專家）第三頁使用'))) return;
        if (is3DView) return showToast('請先關閉 3D 檢視再做智慧量圖');
        if (!img.src) return showToast('請先上傳圖紙再做智慧量圖');
        if (!scalePixelsPerUnit) return showToast('請先設定比例！');
        measureQaStats.measureStarts += 1;
        if (measureAssistState.enabled) calibrateMeasureAssist();
        prepareSmartMeasure('smart-measure');
    }

    function resetMeasureQaStats() {
        measureQaStats = {
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
        updateQaDashboard();
    }

    function updateMeasureQaFromTilt(tiltDeg) {
        if (!Number.isFinite(tiltDeg)) return;
        measureQaStats.tiltSamples += 1;
        measureQaStats.tiltSum += tiltDeg;
        measureQaStats.tiltMax = Math.max(measureQaStats.tiltMax, tiltDeg);
        updateQaDashboard();
    }

    async function requestGyroPermission() {
        try {
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                const result = await DeviceOrientationEvent.requestPermission();
                return result === 'granted';
            }
            return true;
        } catch (_e) {
            return false;
        }
    }

    function handleDeviceOrientation(event) {
        const beta = Number(event && event.beta);
        const gamma = Number(event && event.gamma);
        if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return;

        if (measureAssistState.enabled) {
            if (measureAssistState.baselineBeta === null || measureAssistState.baselineGamma === null) {
                measureAssistState.baselineBeta = beta;
                measureAssistState.baselineGamma = gamma;
                measureAssistState.warned = false;
            } else {
                const d1 = beta - measureAssistState.baselineBeta;
                const d2 = gamma - measureAssistState.baselineGamma;
                measureAssistState.tiltDeg = Math.sqrt(d1 * d1 + d2 * d2);
                const activeMeasure = (drawMode === 'calibration' || drawMode === 'measure');
                if (activeMeasure) updateMeasureQaFromTilt(measureAssistState.tiltDeg);
                if (activeMeasure && measureAssistState.tiltDeg > 10 && !measureAssistState.warned) {
                    measureAssistState.warned = true;
                    showToast('量圖提醒：手機傾斜較大，建議先校正或保持穩定');
                }
                if (measureAssistState.tiltDeg <= 6) {
                    measureAssistState.warned = false;
                }
            }
            updateMeasureAssistUI();
        }

        if (!gyroState.enabled || !is3DView || is360Spinning) return;

        if (gyroState.baselineBeta === null || gyroState.baselineGamma === null) {
            gyroState.baselineBeta = beta;
            gyroState.baselineGamma = gamma;
            gyroState.ready = true;
            updateGyroUI();
            return;
        }

        const deltaX = Math.max(-45, Math.min(45, beta - gyroState.baselineBeta));
        const deltaY = Math.max(-60, Math.min(60, gamma - gyroState.baselineGamma));
        const targetX = -deltaX * 0.8;
        const targetY = deltaY * 1.1;

        // Exponential smoothing to reduce sensor jitter.
        gyroState.smoothX += (targetX - gyroState.smoothX) * 0.18;
        gyroState.smoothY += (targetY - gyroState.smoothY) * 0.18;
        rotation3D.x = Math.max(-80, Math.min(80, gyroState.smoothX));
        rotation3D.y = gyroState.smoothY;
        apply3DTransform();
    }

    async function toggleMeasureAssist() {
        const nextEnabled = !measureAssistState.enabled;
        if (nextEnabled) {
            const granted = await requestGyroPermission();
            if (!granted) return showToast('未取得感測器權限，無法啟用量圖輔助');
            measureAssistState.enabled = true;
            measureAssistState.baselineBeta = null;
            measureAssistState.baselineGamma = null;
            measureAssistState.tiltDeg = 0;
            measureAssistState.warned = false;
            localStorage.setItem(MEASURE_ASSIST_KEY, '1');
            updateMeasureAssistUI();
            showToast('量圖輔助已啟用（定比例/測量時會提示傾斜）');
            return;
        }
        measureAssistState.enabled = false;
        measureAssistState.baselineBeta = null;
        measureAssistState.baselineGamma = null;
        measureAssistState.tiltDeg = 0;
        measureAssistState.warned = false;
        localStorage.setItem(MEASURE_ASSIST_KEY, '0');
        updateMeasureAssistUI();
        showToast('量圖輔助已關閉');
    }

    function calibrateMeasureAssist() {
        if (!measureAssistState.enabled) return showToast('請先開啟量圖輔助');
        measureAssistState.baselineBeta = null;
        measureAssistState.baselineGamma = null;
        measureAssistState.tiltDeg = 0;
        measureAssistState.warned = false;
        updateMeasureAssistUI();
        showToast('量圖基準已重置，請保持手機短暫不動完成校正');
    }

    function toggleMeasureStrictMode() {
        measureAssistState.strict = !measureAssistState.strict;
        localStorage.setItem(MEASURE_STRICT_KEY, measureAssistState.strict ? '1' : '0');
        updateMeasureAssistUI();
        showToast(measureAssistState.strict ? '量圖嚴格模式已開啟（傾斜過大會暫停取點）' : '量圖嚴格模式已關閉');
    }

    function restoreMeasureAssistMode() {
        measureAssistState.enabled = localStorage.getItem(MEASURE_ASSIST_KEY) === '1';
        measureAssistState.strict = localStorage.getItem(MEASURE_STRICT_KEY) === '1';
        measureAssistState.baselineBeta = null;
        measureAssistState.baselineGamma = null;
        measureAssistState.tiltDeg = 0;
        measureAssistState.warned = false;
        updateMeasureAssistUI();
    }

    async function startGyroMode(silent) {
        if (!img.src) {
            if (!silent) showToast('請先上傳圖紙，再啟用陀螺儀');
            return;
        }
        const granted = await requestGyroPermission();
        if (!granted) {
            localStorage.setItem(GYRO_MODE_KEY, '0');
            gyroState.enabled = false;
            updateGyroUI();
            if (!silent) showToast('陀螺儀權限未授權，無法啟用');
            return;
        }
        if (!is3DView) is3DView = true;
        stop360Spin();
        gyroState.enabled = true;
        gyroState.ready = false;
        gyroState.baselineBeta = null;
        gyroState.baselineGamma = null;
        gyroState.smoothX = rotation3D.x;
        gyroState.smoothY = rotation3D.y;
        localStorage.setItem(GYRO_MODE_KEY, '1');
        update3DButtons();
        updateGyroUI();
        apply3DTransform();
        if (!silent) showToast('已啟用陀螺儀輔助（可按校正提高穩定度）');
    }

    function stopGyroMode(silent) {
        gyroState.enabled = false;
        gyroState.ready = false;
        localStorage.setItem(GYRO_MODE_KEY, '0');
        updateGyroUI();
        if (!silent) showToast('已關閉陀螺儀輔助');
    }

    async function toggleGyroMode() {
        if (!img.src) return showToast('請先上傳圖紙！');
        if (gyroState.enabled) return stopGyroMode(false);
        await startGyroMode(false);
    }

    function calibrateGyroBaseline() {
        if (!gyroState.enabled) return showToast('請先啟用陀螺儀');
        gyroState.baselineBeta = null;
        gyroState.baselineGamma = null;
        gyroState.ready = false;
        updateGyroUI();
        showToast('請保持手機 1 秒不動，正在重新校正陀螺儀');
    }

    function restoreGyroMode() {
        updateGyroUI();
        window.addEventListener('deviceorientation', handleDeviceOrientation, true);
        if (localStorage.getItem(GYRO_MODE_KEY) === '1') {
            startGyroMode(true);
        }
    }

    function toggle3DView() {
        if (!img.src) return showToast('請先上傳圖紙！');
        is3DView = !is3DView;
        if (is3DView) {
            drawMode = 'none';
            clickPoints = [];
            showToast('🧊 3D 檢視開啟，可拖曳圖紙旋轉角度');
        } else {
            if (gyroState.enabled) stopGyroMode(true);
            stop360Spin();
            rotation3D = { x: 0, y: 0 };
            showToast('已關閉 3D 檢視，回到平面模式');
        }
        update3DButtons();
        apply3DTransform();
    }

    function toggle360Spin() {
        if (!img.src) return showToast('請先上傳圖紙！');
        if (gyroState.enabled) return showToast('請先關閉陀螺儀，再使用 360 翻轉');
        if (!is3DView) {
            is3DView = true;
            showToast('已自動切到 3D 模式');
        }

        if (is360Spinning) {
            stop360Spin();
            showToast('已停止 360 翻轉');
            return;
        }

        is360Spinning = true;
        spinTimer = setInterval(() => {
            rotation3D.y = (rotation3D.y + 2.5) % 360;
            apply3DTransform();
        }, 40);
        update3DButtons();
        apply3DTransform();
        showToast('🌀 360 度翻轉啟動');
    }

    function stop360Spin() {
        if (spinTimer) clearInterval(spinTimer);
        spinTimer = null;
        is360Spinning = false;
        update3DButtons();
    }

    function reset3DView(silent = false) {
        stop360Spin();
        is3DView = false;
        rotation3D = { x: 0, y: 0 };
        dragState3D = { active: false, x: 0, y: 0 };
        gyroState.smoothX = 0;
        gyroState.smoothY = 0;
        apply3DTransform();
        update3DButtons();
        if (!silent) showToast('視角已重設');
    }

    function update3DButtons() {
        const btn3D = document.getElementById('btn3D');
        const btn360 = document.getElementById('btn360');
        if (btn3D) btn3D.innerText = is3DView ? '🧊 3D中' : '🧊 3D檢視';
        if (btn360) btn360.innerText = is360Spinning ? '⏸ 停止翻轉' : '🌀 360翻轉';
    }

    function syncImageFilterUI() {
        const c = document.getElementById('imgContrast');
        const b = document.getElementById('imgBrightness');
        if (c) c.value = imageFilterState.contrast.toFixed(2);
        if (b) b.value = imageFilterState.brightness.toFixed(2);
    }

    function applyImageFilter() {
        img.style.filter = `contrast(${imageFilterState.contrast}) brightness(${imageFilterState.brightness})`;
    }

    function updateImageFilter(type, value) {
        imageFilterState[type] = parseFloat(value) || 1;
        applyImageFilter();
    }

    function autoEnhanceImage() {
        if (!img.src) return showToast('請先上傳圖紙再優化畫質');
        imageFilterState = { contrast: 1.18, brightness: 1.05 };
        syncImageFilterUI();
        applyImageFilter();
        updateBlueprintQualityStatus();
        showToast('✨ 圖面已自動優化（更清楚）');
    }

    function resetImageFilter() {
        if (!img.src) return showToast('目前尚未載入圖紙');
        imageFilterState = { contrast: 1, brightness: 1 };
        syncImageFilterUI();
        applyImageFilter();
        updateBlueprintQualityStatus();
        showToast('已重設圖面畫質');
    }

    function startCalibration() {
        if (is3DView) return showToast('請先關閉 3D 檢視再做定比例');
        measureQaStats.calibrationStarts += 1;
        if (measureAssistState.enabled) calibrateMeasureAssist();
        resetSmartMeasureSession();
        drawMode = 'calibration';
        clickPoints = [];
        calibrationPendingPoint = null;
        manualPrecisionState.active = false;
        renderManualMeasurePad();
        renderManualPrecisionOverlay();
        showToast(isMobileViewport() ? '定比例模式：手機改成拖曳對線，不用雙點確認；放手後按確認點位' : '定比例模式：每個點都要再點一次確認');
        syncMobileMeasureModeUI();
    }
    function startMeasure() {
        if (is3DView) return showToast('請先關閉 3D 檢視再做量測');
        if (!scalePixelsPerUnit) return showToast('請先設定比例！');
        measureQaStats.measureStarts += 1;
        if (measureAssistState.enabled) calibrateMeasureAssist();
        resetSmartMeasureSession();
        drawMode = 'measure';
        clickPoints = [];
        calibrationPendingPoint = null;
        manualPrecisionState.active = false;
        renderManualMeasurePad();
        renderManualPrecisionOverlay();
        showToast(isMobileViewport() ? '量測模式：手機改成拖曳對線，不用雙點確認；放手後按確認點位' : '點擊你要測量的【起點】與【終點】');
        syncMobileMeasureModeUI();
    }

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

    // 4. 接收數據並自動填入目前作用中的數值欄位（資料清洗）
    function handleLaserData(rawData) {
        const activeInput = document.activeElement;
        // 資料清洗（僅接受正數）
        const cleanMatch = String(rawData).match(/^-?\d+(\.\d+)?/);
        const distance = cleanMatch ? parseFloat(cleanMatch[0]) : NaN;
        if (Number.isNaN(distance) || distance <= 0) {
            laserChaosStats.dirtyBlocked += 1;
            updateLaserChaosChip();
            return showToast(`⚠️ 收到無效雷射數據：「${rawData}」，系統已自動擋下`);
        }

        if (activeInput && activeInput.type === 'number') {
            activeInput.value = distance;
            laserChaosStats.successWrites += 1;
            updateLaserChaosChip();
            showToast(`📏 成功寫入數據：${distance}m`);
            previewCalc();
            setTimeout(() => {
                if (activeInput.id === 'v1') {
                    focusNextInputField('v1');
                    showToast('➡️ 自動切換至：寬度 (等候雷射數據...)');
                } else if (activeInput.id === 'v2') {
                    focusNextInputField('v2');
                    showToast('➡️ 自動切換至：高度 (等候雷射數據...)');
                } else if (activeInput.id === 'v3') {
                    focusNextInputField('v3');
                    showToast('➡️ 自動切換至：數量');
                }
            }, 500);
            return;
        }
        console.log(`收到有效雷射數據 ${distance}m，但游標未停留在數值輸入框`);
    }

    function stopLaserRuler(withToast = true) {
        if (fakeLaserTimer) {
            clearInterval(fakeLaserTimer);
            fakeLaserTimer = null;
        }
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

        recognition.onstart = function() {
            voiceAgentListening = true;
            showToast('🎙️ 助理聆聽中...（請說：長度 5 寬度 3 高度 2）');
        };

        // 2. 聽完後把句子交給 AI 幽靈之手
        recognition.onresult = function(event) {
            const speechResult = String(event && event.results && event.results[0] && event.results[0][0]
                ? event.results[0][0].transcript
                : '').trim();
            if (!speechResult) return showToast('⚠️ 沒有辨識到語音內容');
            showToast(`🗣️ 你說了：「${speechResult}」`);
            parseSpeechToDimensions(speechResult);
        };

        recognition.onerror = function(event) {
            showToast(`❌ 語音辨識錯誤：${event && event.error ? event.error : 'unknown'}`);
        };

        recognition.onend = function() {
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
        calibrationPendingPoint = null;
        manualPrecisionState.active = false;
        drawMode = 'none';
        clearGuidedPrecisionCalcState(true);
        autoInterpretNeedsReview = false;
        autoInterpretGateReason = '';
        autoInterpretLastReport = null;
        updateAutoInterpretQaSummary(null);
        resetSmartMeasureSession({ preserveLastResult: false });
        syncMobileMeasureModeUI();
        renderManualMeasurePad();
        renderManualPrecisionOverlay();
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
        calibrationPendingPoint = null;
        manualPrecisionState.active = false;
        drawMode = 'none';
        clearGuidedPrecisionCalcState(true);
        autoInterpretNeedsReview = false;
        autoInterpretGateReason = '';
        autoInterpretLastReport = null;
        updateAutoInterpretQaSummary(null);
        resetSmartMeasureSession({ preserveLastResult: false });
        syncMobileMeasureModeUI();
        renderManualMeasurePad();
        renderManualPrecisionOverlay();
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
        currentBlueprintUploadState = null;
        updateAutoInterpretLearningSummary('後台學習：尚未建立任務', '#d7e9ff');
        updateBlueprintAutoInterpretStatus('自動判讀: 尚未執行', '#bfe7ff');
        reset3DView(true);
        syncCanvasEmptyState();
        updateTouchInteractionMode();
        showToast('已移除上傳圖紙');
    }

    // ==========================================
    // 👁️ 終極黑科技二：邊緣 AI 視覺自動點料 (TensorFlow.js)
    // ==========================================
    let edgeAiVisionRunning = false;
    let edgeAiCocoModel = null;
    let edgeAiDetectBusy = false;
    let edgeAiSafetyTimer = null;

    async function startEdgeAIVision() {
        if (!(await ensureFeatureAccess('aiVision', 'AI 視覺點料僅開放會員3（專家）'))) return;
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
                <div style="border: 3px dashed #e040fb; width: calc(100vw - 24px); height: calc(100vh - 200px); max-height: 82vh; display:flex; align-items:center; justify-content:center; box-shadow: 0 0 30px #e040fb inset; border-radius: 14px; position: relative;">
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

    const canvasContainer = document.getElementById('canvas-container');
    function syncCanvasEmptyState() {
        if (!canvasContainer) return;
        const hasBlueprint = !!(img && img.getAttribute('src'));
        canvasContainer.dataset.empty = hasBlueprint ? 'false' : 'true';
        canvasContainer.setAttribute('aria-label', hasBlueprint ? '圖紙畫布' : '尚未上傳圖紙');
    }
    canvasContainer.addEventListener('mousedown', begin3DDrag);
    canvasContainer.addEventListener('touchstart', begin3DDrag, { passive: true });
    window.addEventListener('mousemove', on3DDragMove);
    window.addEventListener('touchmove', on3DDragMove, { passive: false });
    window.addEventListener('mouseup', end3DDrag);
    window.addEventListener('touchend', end3DDrag);
    window.addEventListener('touchcancel', end3DDrag);

    function begin3DDrag(e) {
        if (gyroState.enabled) return;
        if (!is3DView || is360Spinning) return;
        const wrapper = document.getElementById('img-wrapper');
        if (!wrapper || !e.target.closest('#img-wrapper')) return;
        const p = e.touches ? e.touches[0] : e;
        dragState3D.active = true;
        dragState3D.x = p.clientX;
        dragState3D.y = p.clientY;
        wrapper.classList.add('dragging');
    }

    function on3DDragMove(e) {
        if (!dragState3D.active || !is3DView || is360Spinning) return;
        if (e.touches && e.touches.length === 0) {
            end3DDrag();
            return;
        }
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (now - last3DMoveAt < 16) return;
        last3DMoveAt = now;
        // Only block default scrolling while actively dragging in 3D mode.
        if (e.touches && e.cancelable) e.preventDefault();
        const p = e.touches ? e.touches[0] : e;
        const dx = p.clientX - dragState3D.x;
        const dy = p.clientY - dragState3D.y;
        dragState3D.x = p.clientX;
        dragState3D.y = p.clientY;

        rotation3D.y += dx * 0.35;
        rotation3D.x -= dy * 0.25;
        rotation3D.x = Math.max(-80, Math.min(80, rotation3D.x));
        apply3DTransform();
    }

    function end3DDrag() {
        dragState3D.active = false;
        const wrapper = document.getElementById('img-wrapper');
        if (wrapper) wrapper.classList.remove('dragging');
    }

    function canUseBlueprintGestures() {
        return !!img.src && !is3DView && drawMode === 'none';
    }

    function touchDistance(t1, t2) {
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function touchCenter(t1, t2) {
        return {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2
        };
    }

    function requestBlueprintFrame(callback) {
        if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
        return setTimeout(callback, 16);
    }

    function cancelBlueprintFrame(frameId) {
        if (!frameId) return;
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameId);
        else clearTimeout(frameId);
    }

    function flushBlueprintPanFrame() {
        blueprintPanState.frameId = 0;
        if (!canvasContainer) return;
        const dx = blueprintPanState.pendingDx || 0;
        const dy = blueprintPanState.pendingDy || 0;
        blueprintPanState.pendingDx = 0;
        blueprintPanState.pendingDy = 0;
        if (!dx && !dy) return;
        canvasContainer.scrollLeft -= dx;
        canvasContainer.scrollTop -= dy;
    }

    function scheduleBlueprintPan(dx, dy) {
        blueprintPanState.pendingDx = (blueprintPanState.pendingDx || 0) + dx;
        blueprintPanState.pendingDy = (blueprintPanState.pendingDy || 0) + dy;
        if (!blueprintPanState.frameId) {
            blueprintPanState.frameId = requestBlueprintFrame(flushBlueprintPanFrame);
        }
    }

    function flushBlueprintPinchFrame() {
        blueprintPinchState.frameId = 0;
        const pending = blueprintPinchState.pending;
        blueprintPinchState.pending = null;
        if (!pending || !blueprintPinchState.active) return;
        setZoomAt(pending.centerX, pending.centerY, pending.targetZoom);
        if (canvasContainer && blueprintPinchState.startCenter) {
            canvasContainer.scrollLeft = (blueprintPinchState.startScrollLeft || 0) - pending.dx;
            canvasContainer.scrollTop = (blueprintPinchState.startScrollTop || 0) - pending.dy;
        }
    }

    function scheduleBlueprintPinch(center, targetZoom) {
        blueprintPinchState.pending = {
            centerX: center.x,
            centerY: center.y,
            targetZoom,
            dx: blueprintPinchState.startCenter ? center.x - blueprintPinchState.startCenter.x : 0,
            dy: blueprintPinchState.startCenter ? center.y - blueprintPinchState.startCenter.y : 0
        };
        if (!blueprintPinchState.frameId) {
            blueprintPinchState.frameId = requestBlueprintFrame(flushBlueprintPinchFrame);
        }
    }

    function cancelPendingBlueprintGestureFrames() {
        cancelBlueprintFrame(blueprintPanState.frameId);
        cancelBlueprintFrame(blueprintPinchState.frameId);
        blueprintPanState.frameId = 0;
        blueprintPanState.pendingDx = 0;
        blueprintPanState.pendingDy = 0;
        blueprintPinchState.frameId = 0;
        blueprintPinchState.pending = null;
    }

    function beginBlueprintPanMouse(e) {
        if (!canUseBlueprintGestures()) return;
        if (!e.target.closest('#img-wrapper')) return;
        blueprintPanState.active = true;
        blueprintPanState.lastX = e.clientX;
        blueprintPanState.lastY = e.clientY;
        blueprintPanState.moved = false;
    }

    function moveBlueprintPanMouse(e) {
        if (!blueprintPanState.active || !canUseBlueprintGestures()) return;
        const dx = e.clientX - blueprintPanState.lastX;
        const dy = e.clientY - blueprintPanState.lastY;
        blueprintPanState.lastX = e.clientX;
        blueprintPanState.lastY = e.clientY;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) blueprintPanState.moved = true;
        scheduleBlueprintPan(dx, dy);
    }

    function endBlueprintPanMouse() {
        if (!blueprintPanState.active) return;
        flushBlueprintPanFrame();
        if (blueprintPanState.moved) suppressNextCanvasClick = true;
        blueprintPanState.active = false;
    }

    function onBlueprintTouchStart(e) {
        if (!canUseBlueprintGestures()) return;
        if (!e.target.closest('#img-wrapper')) return;
        if (e.touches.length >= 2) {
            if (e.cancelable) e.preventDefault();
            cancelPendingBlueprintGestureFrames();
            blueprintPinchState.active = true;
            blueprintPinchState.startDistance = touchDistance(e.touches[0], e.touches[1]);
            blueprintPinchState.startZoom = zoomLevel;
            blueprintPinchState.startCenter = touchCenter(e.touches[0], e.touches[1]);
            blueprintPinchState.startScrollLeft = canvasContainer ? canvasContainer.scrollLeft : 0;
            blueprintPinchState.startScrollTop = canvasContainer ? canvasContainer.scrollTop : 0;
            blueprintPanState.active = false;
            blueprintPanState.moved = false;
            return;
        }
        blueprintPinchState.active = false;
        blueprintPanState.active = canSingleFingerPanBlueprint();
        if (blueprintPanState.active) {
            blueprintPanState.lastX = e.touches[0].clientX;
            blueprintPanState.lastY = e.touches[0].clientY;
            if (e.cancelable) e.preventDefault();
        }
        blueprintPanState.moved = false;
    }

    function onBlueprintTouchMove(e) {
        if (!canUseBlueprintGestures()) return;
        if (blueprintPinchState.active && e.touches.length >= 2) {
            const dist = touchDistance(e.touches[0], e.touches[1]);
            const center = touchCenter(e.touches[0], e.touches[1]);
            const ratio = blueprintPinchState.startDistance > 0 ? dist / blueprintPinchState.startDistance : 1;
            const targetZoom = blueprintPinchState.startZoom * ratio;
            scheduleBlueprintPinch(center, targetZoom);
            suppressNextCanvasTouch = true;
            if (e.cancelable) e.preventDefault();
            return;
        }
        if (blueprintPanState.active && e.touches.length === 1) {
            const touch = e.touches[0];
            const dx = touch.clientX - blueprintPanState.lastX;
            const dy = touch.clientY - blueprintPanState.lastY;
            blueprintPanState.lastX = touch.clientX;
            blueprintPanState.lastY = touch.clientY;
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) blueprintPanState.moved = true;
            scheduleBlueprintPan(dx, dy);
            if (e.cancelable) e.preventDefault();
        }
    }

    function onBlueprintTouchEnd() {
        flushBlueprintPanFrame();
        flushBlueprintPinchFrame();
        if (blueprintPanState.moved || blueprintPinchState.active) {
            suppressNextCanvasTouch = true;
            suppressNextCanvasClick = true;
            blueprintTapState.lastAt = 0;
        }
        if (blueprintPinchState.active) {
            blueprintPinchState.active = false;
        }
        blueprintPanState.active = false;
        blueprintPanState.moved = false;
        updateTouchInteractionMode();
    }

    function onBlueprintWheelZoom(e) {
        if (!canUseBlueprintGestures()) return;
        const step = Math.exp(-e.deltaY * 0.0015);
        setZoomAt(e.clientX, e.clientY, zoomLevel * step);
        if (e.cancelable) e.preventDefault();
    }

    function onBlueprintDoubleClick(e) {
        if (!canUseBlueprintGestures()) return;
        fitBlueprintToViewport();
        suppressNextCanvasClick = true;
        showToast('已回到適配視圖');
    }

    function onBlueprintTapForFit(e) {
        if (!canUseBlueprintGestures()) return;
        if (suppressNextCanvasTouch) {
            suppressNextCanvasTouch = false;
            return;
        }
        if (!e.changedTouches || e.changedTouches.length !== 1) return;
        const t = e.changedTouches[0];
        const now = Date.now();
        const dt = now - blueprintTapState.lastAt;
        const dx = t.clientX - blueprintTapState.lastX;
        const dy = t.clientY - blueprintTapState.lastY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dt > 0 && dt < 320 && dist < 26) {
            fitBlueprintToViewport();
            suppressNextCanvasTouch = true;
            showToast('已回到適配視圖');
            blueprintTapState.lastAt = 0;
            return;
        }
        blueprintTapState.lastAt = now;
        blueprintTapState.lastX = t.clientX;
        blueprintTapState.lastY = t.clientY;
    }

    canvasContainer.addEventListener('mousedown', beginBlueprintPanMouse);
    window.addEventListener('mousemove', moveBlueprintPanMouse);
    window.addEventListener('mouseup', endBlueprintPanMouse);
    canvasContainer.addEventListener('touchstart', onBlueprintTouchStart, { passive: false });
    canvasContainer.addEventListener('touchmove', onBlueprintTouchMove, { passive: false });
    canvasContainer.addEventListener('touchend', onBlueprintTouchEnd, { passive: true });
    canvasContainer.addEventListener('touchcancel', onBlueprintTouchEnd, { passive: true });
    canvasContainer.addEventListener('wheel', onBlueprintWheelZoom, { passive: false });
    canvasContainer.addEventListener('dblclick', onBlueprintDoubleClick);
    canvasContainer.addEventListener('touchend', onBlueprintTapForFit, { passive: true });
    const imgWrapperEl = document.getElementById('img-wrapper');
    const smartMeasureOverlayEl = document.getElementById('smartMeasureOverlay');

    if (smartMeasureOverlayEl) {
        smartMeasureOverlayEl.addEventListener('mousedown', beginSmartMeasureDrag, true);
        smartMeasureOverlayEl.addEventListener('touchstart', beginSmartMeasureDrag, { passive: false, capture: true });
    }
    window.addEventListener('mousemove', moveSmartMeasureDrag);
    window.addEventListener('touchmove', moveSmartMeasureDrag, { passive: false });
    window.addEventListener('mouseup', endSmartMeasureDrag);
    window.addEventListener('touchend', endSmartMeasureDrag, { passive: false });
    window.addEventListener('touchcancel', endSmartMeasureDrag, { passive: false });

    function handleWrapperPointTap(clientX, clientY, evt) {
        if (drawMode === 'none') return;
        if (evt && evt.target && evt.target.closest && evt.target.closest('.smart-measure-point.confirmed, .smart-measure-card, .smart-measure-btn')) return;
        if (evt && evt.cancelable) evt.preventDefault();
        if (evt && evt.stopPropagation) evt.stopPropagation();
        canvasLastTouchAt = Date.now();
        handleCanvasPointInput(clientX, clientY);
    }

    function blockNativeGestureOnBlueprint(e) {
        if (!canUseBlueprintGestures()) return;
        if (e.cancelable) e.preventDefault();
    }

    if (imgWrapperEl) {
        imgWrapperEl.addEventListener('gesturestart', blockNativeGestureOnBlueprint, { passive: false });
        imgWrapperEl.addEventListener('gesturechange', blockNativeGestureOnBlueprint, { passive: false });
        imgWrapperEl.addEventListener('gestureend', blockNativeGestureOnBlueprint, { passive: false });
        imgWrapperEl.addEventListener('touchstart', function(e) {
            if (beginManualPrecisionPlacement(e)) return;
            if (!e.touches || !e.touches.length) return;
            const t = e.touches[0];
            handleWrapperPointTap(t.clientX, t.clientY, e);
        }, { passive: false, capture: true });
        imgWrapperEl.addEventListener('touchmove', moveManualPrecisionPlacement, { passive: false, capture: true });
        imgWrapperEl.addEventListener('touchend', endManualPrecisionPlacement, { passive: false, capture: true });
        imgWrapperEl.addEventListener('touchcancel', endManualPrecisionPlacement, { passive: false, capture: true });

        imgWrapperEl.addEventListener('click', function(e) {
            if (Date.now() - canvasLastTouchAt < CANVAS_TOUCH_CLICK_GUARD_MS) return;
            handleWrapperPointTap(e.clientX, e.clientY, e);
        }, true);
    }

    syncCanvasEmptyState();
    updateTouchInteractionMode();

    function handleCanvasPointInput(clientX, clientY) {
        if (drawMode === 'none') return;
        const activeMeasure = isMeasureInteractionMode(drawMode);
        if (activeMeasure && measureAssistState.enabled && measureAssistState.strict && measureAssistState.tiltDeg > MEASURE_STRICT_TILT_DEG) {
            measureQaStats.strictBlocks += 1;
            return showToast(`量圖已暫停：傾斜 ${measureAssistState.tiltDeg.toFixed(1)}°，請先校正或放穩手機`);
        }
        const rect = canvas.getBoundingClientRect();
        const x = (clientX - rect.left) / zoomLevel;
        const y = (clientY - rect.top) / zoomLevel;

        if (isSmartMeasureMode(drawMode)) {
            const snapped = getSmartMeasureSnap({ x, y });
            const point = { x: snapped.point.x, y: snapped.point.y };
            commitSmartMeasurePoint(point, snapped);
            return;
        }

        if (isMobileViewport() && (drawMode === 'calibration' || drawMode === 'measure')) {
            calibrationPendingPoint = { x, y };
            redrawManualMeasurementCanvas();
            renderManualMeasurePad();
            showToast(`${clickPoints.length === 0 ? '起點' : '終點'}已暫存，可用小箭頭微調後按確認`);
            return;
        }

        if (drawMode === 'calibration') {
            const confirmTolerance = 20 / Math.max(0.2, zoomLevel);
            if (!calibrationPendingPoint) {
                calibrationPendingPoint = { x, y };
                drawMeasurementPendingPoint(calibrationPendingPoint);
                showToast(clickPoints.length === 0
                    ? '已選起點（待確認），請在同位置再點一次'
                    : '已選終點（待確認），請在同位置再點一次');
                return;
            }
            const distToPending = Math.hypot(x - calibrationPendingPoint.x, y - calibrationPendingPoint.y);
            if (distToPending > confirmTolerance) {
                calibrationPendingPoint = { x, y };
                drawMeasurementPendingPoint(calibrationPendingPoint);
                showToast('位置已更新，請再點一次確認這個點');
                return;
            }
            clickPoints.push({ x: calibrationPendingPoint.x, y: calibrationPendingPoint.y });
            drawMeasurementPoint(calibrationPendingPoint);
            calibrationPendingPoint = null;
            if (clickPoints.length === 1) {
                showToast('起點已確認，請點終點（同樣要再點一次確認）');
                return;
            }
        } else {
            clickPoints.push({x, y});
            drawMeasurementPoint({ x, y });
        }

        if (clickPoints.length === 2) {
            const p1 = clickPoints[0];
            const p2 = clickPoints[1];
            finalizeMeasurementFromPoints(drawMode, p1, p2);
        }
    }

    canvas.addEventListener('click', function(e) {
        if (suppressNextCanvasClick) {
            suppressNextCanvasClick = false;
            return;
        }
        if (Date.now() - canvasLastTouchAt < CANVAS_TOUCH_CLICK_GUARD_MS) return;
        handleCanvasPointInput(e.clientX, e.clientY);
    });

    canvas.addEventListener('touchend', function(e) {
        if (suppressNextCanvasTouch) {
            suppressNextCanvasTouch = false;
            return;
        }
        if (!e.changedTouches || !e.changedTouches.length) return;
        canvasLastTouchAt = Date.now();
        const t = e.changedTouches[0];
        handleCanvasPointInput(t.clientX, t.clientY);
    }, { passive: true });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyBlueprintAutoCalcAfterUploadPref);
    } else {
        applyBlueprintAutoCalcAfterUploadPref();
    }
