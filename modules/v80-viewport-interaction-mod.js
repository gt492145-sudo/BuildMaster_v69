// 3D viewport, gyro/measure assist, and gesture interaction module (v8.0).
(function attachV80ViewportInteractionModule(global) {
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
    const allow3DDrag = is3DView && !is360Spinning && !gyroState.enabled;

    if (wrapper) {
      wrapper.style.touchAction = allow3DDrag ? 'none' : 'auto';
    }
    if (canvasEl) {
      canvasEl.style.touchAction = allow3DDrag ? 'none' : 'auto';
    }
    if (canvasContainer) {
      canvasContainer.style.touchAction = allow3DDrag ? 'none' : 'auto';
    }
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
      strictBlocks: 0
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
    if (!is3DView) {
      stop360Spin();
      if (gyroState.enabled) stopGyroMode(true);
      const overlay = document.getElementById('aiVisionOverlay');
      if (overlay) overlay.style.transform = '';
    }
    update3DButtons();
    apply3DTransform();
    showToast(is3DView ? '3D 模式已開啟（拖曳可旋轉）' : '已返回 2D 模式');
  }

  function toggle360Spin() {
    if (!img.src) return showToast('請先上傳圖紙！');
    if (!is3DView) {
      is3DView = true;
      update3DButtons();
    }
    if (gyroState.enabled) stopGyroMode(true);
    if (is360Spinning) {
      is360Spinning = false;
      if (spinTimer) {
        clearInterval(spinTimer);
        spinTimer = null;
      }
      update3DButtons();
      showToast('360° 自轉已停止');
      return;
    }
    is360Spinning = true;
    spinTimer = setInterval(() => {
      rotation3D.y += 2;
      apply3DTransform();
    }, 30);
    update3DButtons();
    showToast('360° 自轉中（可再按一次停止）');
  }

  function stop360Spin() {
    is360Spinning = false;
    if (spinTimer) {
      clearInterval(spinTimer);
      spinTimer = null;
    }
  }

  function reset3DView(silent = false) {
    stop360Spin();
    rotation3D = { x: -12, y: 18 };
    if (gyroState.enabled) stopGyroMode(true);
    is3DView = false;
    update3DButtons();
    apply3DTransform();
    if (!silent) showToast('3D 視角已重置');
  }

  function update3DButtons() {
    const btn3D = document.getElementById('btn3D');
    const btnSpin = document.getElementById('btn360');
    if (btn3D) btn3D.innerText = is3DView ? '🧊 退出3D' : '🧊 3D檢視';
    if (btnSpin) btnSpin.innerText = is360Spinning ? '🛑 停止360' : '🌪️ 360°自轉';
  }

  function syncImageFilterUI() {
    const c = document.getElementById('contrastRange');
    const b = document.getElementById('brightnessRange');
    if (c) c.value = String(imageFilterState.contrast);
    if (b) b.value = String(imageFilterState.brightness);
  }

  function applyImageFilter() {
    img.style.filter = `contrast(${imageFilterState.contrast}) brightness(${imageFilterState.brightness})`;
  }

  function updateImageFilter(type, value) {
    imageFilterState[type] = parseFloat(value);
    applyImageFilter();
  }

  function autoEnhanceImage() {
    if (!img.src) return showToast('請先上傳圖紙');
    imageFilterState = { contrast: 1.35, brightness: 1.05 };
    syncImageFilterUI();
    applyImageFilter();
    const report = updateBlueprintQualityStatus();
    showToast(report && report.quality === '良好' ? '已自動優化圖面（品質良好）' : '已自動優化圖面，請確認線條是否更清晰');
  }

  function resetImageFilter() {
    imageFilterState = { contrast: 1, brightness: 1 };
    syncImageFilterUI();
    applyImageFilter();
    updateBlueprintQualityStatus();
    showToast('已還原圖面濾鏡');
  }

  function startCalibration() {
    if (!img.src) return showToast('請先上傳圖紙！');
    clickPoints = [];
    drawMode = 'calibration';
    measureQaStats.calibrationStarts += 1;
    updateQaDashboard();
    syncMobileMeasureModeUI();
    showToast('請點選圖上兩點來定比例');
  }

  function startMeasure() {
    if (!scalePixelsPerUnit) return showToast('請先定比例！');
    clickPoints = [];
    drawMode = 'measure';
    measureQaStats.measureStarts += 1;
    updateQaDashboard();
    syncMobileMeasureModeUI();
    showToast('請點選圖上兩點來測量距離');
  }

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
    if (canvasContainer) {
      canvasContainer.scrollLeft -= dx;
      canvasContainer.scrollTop -= dy;
    }
  }

  function endBlueprintPanMouse() {
    if (!blueprintPanState.active) return;
    if (blueprintPanState.moved) suppressNextCanvasClick = true;
    blueprintPanState.active = false;
  }

  function onBlueprintTouchStart(e) {
    if (!canUseBlueprintGestures()) return;
    if (!e.target.closest('#img-wrapper')) return;
    if (e.touches.length >= 2) {
      blueprintPinchState.active = true;
      blueprintPinchState.startDistance = touchDistance(e.touches[0], e.touches[1]);
      blueprintPinchState.startZoom = zoomLevel;
      blueprintPanState.active = false;
      if (e.cancelable) e.preventDefault();
      return;
    }
    if (e.touches.length === 1) {
      blueprintPanState.active = true;
      blueprintPanState.lastX = e.touches[0].clientX;
      blueprintPanState.lastY = e.touches[0].clientY;
      blueprintPanState.moved = false;
    }
  }

  function onBlueprintTouchMove(e) {
    if (!canUseBlueprintGestures()) return;
    if (blueprintPinchState.active && e.touches.length >= 2) {
      const dist = touchDistance(e.touches[0], e.touches[1]);
      const center = touchCenter(e.touches[0], e.touches[1]);
      const ratio = blueprintPinchState.startDistance > 0 ? dist / blueprintPinchState.startDistance : 1;
      const targetZoom = blueprintPinchState.startZoom * ratio;
      setZoomAt(center.x, center.y, targetZoom);
      suppressNextCanvasTouch = true;
      if (e.cancelable) e.preventDefault();
      return;
    }
    if (!blueprintPanState.active || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - blueprintPanState.lastX;
    const dy = e.touches[0].clientY - blueprintPanState.lastY;
    blueprintPanState.lastX = e.touches[0].clientX;
    blueprintPanState.lastY = e.touches[0].clientY;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) blueprintPanState.moved = true;
    if (canvasContainer) {
      canvasContainer.scrollLeft -= dx;
      canvasContainer.scrollTop -= dy;
    }
    if (blueprintPanState.moved) suppressNextCanvasTouch = true;
    if (e.cancelable) e.preventDefault();
  }

  function onBlueprintTouchEnd() {
    if (blueprintPinchState.active) {
      blueprintPinchState.active = false;
    }
    if (blueprintPanState.active && blueprintPanState.moved) {
      suppressNextCanvasTouch = true;
    }
    blueprintPanState.active = false;
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

  function handleCanvasPointInput(clientX, clientY) {
    if (drawMode === 'none') return;
    const activeMeasure = (drawMode === 'calibration' || drawMode === 'measure');
    if (activeMeasure && measureAssistState.enabled && measureAssistState.strict && measureAssistState.tiltDeg > MEASURE_STRICT_TILT_DEG) {
      measureQaStats.strictBlocks += 1;
      return showToast(`量圖已暫停：傾斜 ${measureAssistState.tiltDeg.toFixed(1)}°，請先校正或放穩手機`);
    }
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / zoomLevel;
    const y = (clientY - rect.top) / zoomLevel;

    clickPoints.push({ x, y });
    ctx.fillStyle = 'orange';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();

    if (clickPoints.length === 2) {
      const p1 = clickPoints[0];
      const p2 = clickPoints[1];
      ctx.strokeStyle = '#ff4757';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      if (drawMode === 'calibration') {
        let actualLen = prompt('這條線實際是幾公尺？(m)', '1');
        if (actualLen && !isNaN(actualLen) && actualLen > 0) {
          scalePixelsPerUnit = dist / parseFloat(actualLen);
          measureQaStats.calibrationSuccess += 1;
          updateQaDashboard();
          document.getElementById('scale-info').innerText = '✅ 比例已設';
          if (typeof updateCanvasVisualAids === 'function') updateCanvasVisualAids();
          showToast('比例設定完成！可以開始測量了');
        } else {
          showToast('比例設定取消或無效');
        }
      } else if (drawMode === 'measure') {
        let m = dist / scalePixelsPerUnit;
        measureQaStats.measureSuccess += 1;
        updateQaDashboard();
        if (!document.getElementById('v2').value && document.getElementById('calcType').value.startsWith('R_')) {
          document.getElementById('v2').value = m.toFixed(2);
        } else if (!document.getElementById('v1').value) {
          document.getElementById('v1').value = m.toFixed(2);
        } else {
          document.getElementById('v2').value = m.toFixed(2);
        }
        showToast(`📏 測量結果: ${m.toFixed(2)}m`);
        previewCalc();
      }
      clickPoints = [];
      drawMode = 'none';
      syncMobileMeasureModeUI();
    }
  }

  global.apply3DTransform = apply3DTransform;
  global.updateTouchInteractionMode = updateTouchInteractionMode;
  global.updateGyroUI = updateGyroUI;
  global.updateMeasureAssistUI = updateMeasureAssistUI;
  global.resetMeasureQaStats = resetMeasureQaStats;
  global.updateMeasureQaFromTilt = updateMeasureQaFromTilt;
  global.requestGyroPermission = requestGyroPermission;
  global.handleDeviceOrientation = handleDeviceOrientation;
  global.toggleMeasureAssist = toggleMeasureAssist;
  global.calibrateMeasureAssist = calibrateMeasureAssist;
  global.toggleMeasureStrictMode = toggleMeasureStrictMode;
  global.restoreMeasureAssistMode = restoreMeasureAssistMode;
  global.startGyroMode = startGyroMode;
  global.stopGyroMode = stopGyroMode;
  global.toggleGyroMode = toggleGyroMode;
  global.calibrateGyroBaseline = calibrateGyroBaseline;
  global.restoreGyroMode = restoreGyroMode;
  global.toggle3DView = toggle3DView;
  global.toggle360Spin = toggle360Spin;
  global.stop360Spin = stop360Spin;
  global.reset3DView = reset3DView;
  global.update3DButtons = update3DButtons;
  global.syncImageFilterUI = syncImageFilterUI;
  global.applyImageFilter = applyImageFilter;
  global.updateImageFilter = updateImageFilter;
  global.autoEnhanceImage = autoEnhanceImage;
  global.resetImageFilter = resetImageFilter;
  global.startCalibration = startCalibration;
  global.startMeasure = startMeasure;
  global.begin3DDrag = begin3DDrag;
  global.on3DDragMove = on3DDragMove;
  global.end3DDrag = end3DDrag;
  global.canUseBlueprintGestures = canUseBlueprintGestures;
  global.touchDistance = touchDistance;
  global.touchCenter = touchCenter;
  global.beginBlueprintPanMouse = beginBlueprintPanMouse;
  global.moveBlueprintPanMouse = moveBlueprintPanMouse;
  global.endBlueprintPanMouse = endBlueprintPanMouse;
  global.onBlueprintTouchStart = onBlueprintTouchStart;
  global.onBlueprintTouchMove = onBlueprintTouchMove;
  global.onBlueprintTouchEnd = onBlueprintTouchEnd;
  global.onBlueprintWheelZoom = onBlueprintWheelZoom;
  global.onBlueprintDoubleClick = onBlueprintDoubleClick;
  global.onBlueprintTapForFit = onBlueprintTapForFit;
  global.handleCanvasPointInput = handleCanvasPointInput;
})(window);
