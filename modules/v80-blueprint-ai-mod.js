// Blueprint loading, quality analysis, and auto-interpret module (v8.0).
(function attachV80BlueprintAiModule(global) {
  function loadImg(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function onLoad(event) {
      img.src = event.target.result;
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        imageFilterState = { contrast: 1, brightness: 1 };
        syncImageFilterUI();
        applyImageFilter();
        reset3DView(true);
        fitBlueprintToViewport();
        const qualityReport = updateBlueprintQualityStatus();
        if (qualityReport && qualityReport.quality === '待重拍') {
          showToast(`圖紙品質偏低（${qualityReport.issues.join('、')}），建議重拍再量測`);
        } else if (qualityReport && qualityReport.quality === '可用') {
          showToast(`圖紙已載入（${qualityReport.issues.join('、')}，可先量測）`);
        } else {
          showToast('圖紙載入完成，可拖曳/縮放（雙擊可回適配視圖）');
        }
      };
    };
    reader.readAsDataURL(file);
  }

  function changeZoom(delta) {
    if (!img.src) return showToast('請先上傳圖紙！');
    zoomLevel = Math.max(0.2, Math.min(5, zoomLevel + delta));
    applyZoom();
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
    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const zoomInfo = document.getElementById('zoom-info');
    if (zoomInfo) zoomInfo.innerText = `縮放: ${Math.round(zoomLevel * 100)}%`;
    if (typeof updateCanvasVisualAids === 'function') updateCanvasVisualAids();
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
  }

  function qualityToScore(qualityText) {
    if (qualityText === '良好') return 1.0;
    if (qualityText === '可用') return 0.72;
    if (qualityText === '待重拍') return 0.45;
    return 0.55;
  }

  function getAutoInterpretGateThreshold() {
    const gateInput = document.getElementById('advAutoInterpretGate');
    const gatePercent = Number(gateInput && gateInput.value);
    const normalizedPercent = Number.isFinite(gatePercent) ? Math.max(40, Math.min(95, gatePercent)) : (AUTO_INTERPRET_GATE_DEFAULT_CONFIDENCE * 100);
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
      updateBlueprintAutoInterpretStatus('自動判讀: 已手動調整參數，解除複核鎖定', '#bfe7ff');
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

  async function autoInterpretBlueprintAndCalculate() {
    if (autoInterpretBusy) return showToast('單一運算進行中，請稍候完成');
    if (!img.src) return showToast('請先上傳圖紙再做自動判讀');
    autoInterpretBusy = true;
    autoInterpretNeedsReview = false;
    autoInterpretGateReason = '';
    const runId = ++autoInterpretRunSeq;
    try {
      updateBlueprintAutoInterpretStatus(`自動判讀: 單一運算啟動 #${runId}（主體辨識中）`, '#bfe7ff');
      const qualityReport = updateBlueprintQualityStatus();
      const bounds = detectBlueprintPrimaryBounds();
      if (!bounds) {
        updateBlueprintAutoInterpretStatus('自動判讀: 偵測失敗（請先提升對比或框選量測）', '#ffd48a');
        return showToast('未偵測到明顯主體輪廓，建議先用✨自動優化後重試');
      }

      let scale = scalePixelsPerUnit;
      if (!Number.isFinite(scale) || scale <= 0) {
        const knownLong = prompt(
          `已抓到主體長邊約 ${Math.round(bounds.longPx)} px。\n請輸入這條邊的實際長度（m）來自動定比例：`,
          '1'
        );
        const knownLongMeters = parseFloat(knownLong);
        if (Number.isFinite(knownLongMeters) && knownLongMeters > 0) {
          scalePixelsPerUnit = bounds.longPx / knownLongMeters;
          scale = scalePixelsPerUnit;
          document.getElementById('scale-info').innerText = '✅ 比例已設（自動判讀）';
        } else {
          updateBlueprintAutoInterpretStatus(`自動判讀: 僅像素(${Math.round(bounds.widthPx)}×${Math.round(bounds.heightPx)} px)`, '#ffd48a');
          return showToast('尚未設定比例，已提供像素判讀；輸入實際尺寸後可自動換算公尺');
        }
      }

      updateBlueprintAutoInterpretStatus(`自動判讀: 單一運算 #${runId}（尺寸/數量解算中）`, '#bfe7ff');
      const longM = bounds.longPx / scale;
      const shortM = bounds.shortPx / scale;
      const type = String(document.getElementById('calcType').value || '');
      const v1El = document.getElementById('v1');
      const v2El = document.getElementById('v2');
      const v3El = document.getElementById('v3');
      const qtyEl = document.getElementById('qty');
      const prevQty = Math.max(1, Number(qtyEl.value) || 1);

      const countResult = estimateBlueprintObjectCount(bounds);
      const shouldAutoCount = !type.startsWith('R_');
      const pickedQty = (shouldAutoCount && countResult.confidence >= 0.55)
        ? Math.max(1, Math.min(999, countResult.count))
        : prevQty;
      const geometryConfidence = Math.max(0.25, Math.min(0.95, Number(bounds.coverage || 0) * 2.4));
      const qualityConfidence = qualityToScore(qualityReport && qualityReport.quality);
      const countConfidence = shouldAutoCount ? Number(countResult.confidence || 0) : 0.7;
      const overallConfidence = Math.max(0, Math.min(1, geometryConfidence * 0.45 + qualityConfidence * 0.35 + countConfidence * 0.20));

      if (type.startsWith('R_')) {
        v2El.value = longM.toFixed(2);
        if (!Number(v3El.value)) v3El.value = '1';
        if (!Number(qtyEl.value)) qtyEl.value = '1';
      } else if (type === 'M_BEAM_SIDES') {
        v1El.value = longM.toFixed(2);
        v3El.value = shortM.toFixed(2);
        qtyEl.value = String(pickedQty);
      } else if (type === 'M_WALL') {
        v1El.value = longM.toFixed(2);
        v2El.value = shortM.toFixed(2);
        qtyEl.value = String(pickedQty);
      } else {
        v1El.value = longM.toFixed(2);
        v2El.value = shortM.toFixed(2);
        if (!Number(v3El.value)) v3El.value = '1.00';
        qtyEl.value = String(pickedQty);
      }
      previewCalc();

      const qualityNote = qualityReport ? `｜品質${qualityReport.quality}` : '';
      const countNote = shouldAutoCount
        ? `｜數量 ${pickedQty}（信心 ${(countResult.confidence * 100).toFixed(0)}%）`
        : '｜鋼筋類數量維持手動';
      const gateThreshold = getAutoInterpretGateThreshold();
      if (!type.startsWith('R_') && overallConfidence < gateThreshold) {
        autoInterpretNeedsReview = true;
        autoInterpretGateReason = `自動判讀信心 ${(overallConfidence * 100).toFixed(0)}% 低於門檻 ${(gateThreshold * 100).toFixed(0)}%，請手動複核尺寸/數量`;
      }
      updateBlueprintAutoInterpretStatus(
        `自動判讀: 單一運算 #${runId} 完成｜${bounds.widthPx.toFixed(0)}×${bounds.heightPx.toFixed(0)} px → ${longM.toFixed(2)}×${shortM.toFixed(2)} m${countNote}｜總信心 ${(overallConfidence * 100).toFixed(0)}%${qualityNote}${autoInterpretNeedsReview ? '｜需複核' : ''}`,
        autoInterpretNeedsReview ? '#ffd48a' : '#9fffc0'
      );
      autoInterpretLastReport = {
        runId,
        type,
        longM,
        shortM,
        quantity: pickedQty,
        countConfidence: countResult.confidence,
        quality: qualityReport ? qualityReport.quality : '未知',
        overallConfidence,
        inputSignature: `${type}|${String(v1El.value || '')}|${String(v2El.value || '')}|${String(v3El.value || '')}|${String(qtyEl.value || '')}`
      };
      previewCalc();
      if (type.startsWith('R_')) {
        showToast(`已完成單一運算：長邊 ${longM.toFixed(2)}m（鋼筋規格仍需手動填 v1）`);
      } else if (autoInterpretNeedsReview) {
        showToast(`自動判讀完成但信心偏低（${(overallConfidence * 100).toFixed(0)}%），請先複核後再吸入清單`);
      } else {
        showToast(`已完成單一運算：${longM.toFixed(2)}m × ${shortM.toFixed(2)}m，數量 ${pickedQty}`);
      }
    } finally {
      autoInterpretBusy = false;
    }
  }

  async function runAutoBlueprintPlusBIM() {
    if (getCurrentUserLevel() !== 'pro') {
      return showToast('此功能僅限會員3（專家）');
    }
    if (autoInterpretBusy || edgeAiDetectBusy) {
      return showToast('AI 流程執行中，請稍候');
    }
    if (!img.src) {
      return showToast('請先上傳圖紙再執行「自動看圖計算+3BIM」');
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

    updateBlueprintAutoInterpretStatus('一鍵流程：步驟2/2 BIM 技術自動計算中...', '#bfe7ff');
    runBimTechAutoCalculation();
    updateBlueprintAutoInterpretStatus('一鍵流程完成：看圖判讀 + BIM 技術自動計算已完成', '#9fffc0');
    const infoBox = document.getElementById('bimAutoCalcInfo');
    if (infoBox) infoBox.innerText = `一鍵流程完成：圖紙自動判讀 + BIM 自動計算｜執行時間 ${new Date().toLocaleTimeString('zh-TW')}`;
    showToast('✅ 一鍵完成：自動看圖計算 + 3BIM');
  }

  function fitBlueprintToViewport() {
    if (!img.src || !canvasContainer || !img.naturalWidth || !img.naturalHeight) return;
    const padding = 12;
    const viewW = Math.max(120, canvasContainer.clientWidth - padding);
    const viewH = Math.max(120, canvasContainer.clientHeight - padding);
    const ratioW = viewW / img.naturalWidth;
    const ratioH = viewH / img.naturalHeight;
    zoomLevel = Math.max(0.2, Math.min(5, Math.min(ratioW, ratioH)));
    applyZoom();
    const contentW = img.naturalWidth * zoomLevel;
    const contentH = img.naturalHeight * zoomLevel;
    canvasContainer.scrollLeft = Math.max(0, (contentW - canvasContainer.clientWidth) / 2);
    canvasContainer.scrollTop = Math.max(0, (contentH - canvasContainer.clientHeight) / 2);
    if (typeof updateCanvasVisualAids === 'function') updateCanvasVisualAids();
  }

  global.loadImg = loadImg;
  global.changeZoom = changeZoom;
  global.setZoomAt = setZoomAt;
  global.applyZoom = applyZoom;
  global.analyzeBlueprintImageQuality = analyzeBlueprintImageQuality;
  global.updateBlueprintQualityStatus = updateBlueprintQualityStatus;
  global.detectBlueprintPrimaryBounds = detectBlueprintPrimaryBounds;
  global.updateBlueprintAutoInterpretStatus = updateBlueprintAutoInterpretStatus;
  global.qualityToScore = qualityToScore;
  global.getAutoInterpretGateThreshold = getAutoInterpretGateThreshold;
  global.evaluateAutoInterpretGate = evaluateAutoInterpretGate;
  global.maybeReleaseAutoInterpretGateByManualAdjust = maybeReleaseAutoInterpretGateByManualAdjust;
  global.estimateBlueprintObjectCount = estimateBlueprintObjectCount;
  global.autoInterpretBlueprintAndCalculate = autoInterpretBlueprintAndCalculate;
  global.runAutoBlueprintPlusBIM = runAutoBlueprintPlusBIM;
  global.fitBlueprintToViewport = fitBlueprintToViewport;
})(window);
