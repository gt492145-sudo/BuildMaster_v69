// Survey toolkit module (v8.0): precision, coordinate conversion, inverse, azimuth, polar stakeout, project save/load.
(function attachV80SurveyToolkitModule(global) {
  const STAKE_PRECISION_KEY = 'bm_69:stake_precision';
  const STAKE_COORD_MODE_KEY = 'bm_69:stake_coord_mode';
  const DRAWING_UNIT_KEY = 'bm_69:drawing_unit';
  const STAKE_PROJECT_LOCAL_KEY = 'bm_69:stake_project_local';
  const AREA_UNIT_MODE_KEY = 'bm_69:area_unit_mode';
  const CANVAS_GRID_SPACING_KEY = 'bm_69:canvas_grid_spacing';
  const CANVAS_GRID_ENABLED_KEY = 'bm_69:canvas_grid_enabled';

  const state = {
    precision: { E: 3, N: 3, H: 3 },
    coordMode: 'twd97',
    drawingUnit: 'm',
    areaUnitMode: 'all',
    gridSpacingM: 0,
    gridEnabled: false,
    polygonHistory: [],
    deletedLayoutPoints: [],
    shortcutsBound: false,
    lastIntersectionResult: null,
    lastTraverseResult: null,
    lastOffsetRecord: null,
    lastMultiSlopeResult: null,
    lastPolarResult: null
  };

  function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function normalizePrecision(value) {
    return clampInt(value, 3, 5, 3);
  }

  function getAxisPrecision(axis) {
    const key = String(axis || 'E').toUpperCase();
    if (key === 'N') return normalizePrecision(state.precision.N);
    if (key === 'H' || key === 'Z') return normalizePrecision(state.precision.H);
    return normalizePrecision(state.precision.E);
  }

  function formatStakeCoordValue(value, axis = 'E') {
    const n = Number(value);
    if (!Number.isFinite(n)) return '-';
    return n.toFixed(getAxisPrecision(axis));
  }

  // Approximate conversion widely used for Taiwan plane coordinates.
  function twd97ToTwd67(e97, n97) {
    const e = Number(e97);
    const n = Number(n97);
    if (!Number.isFinite(e) || !Number.isFinite(n)) return { e: NaN, n: NaN };
    return {
      e: e - 807.8 - 0.00001549 * e - 0.000006521 * n,
      n: n + 248.6 - 0.00001549 * n - 0.000006521 * e
    };
  }

  function twd67ToTwd97(e67, n67) {
    const e = Number(e67);
    const n = Number(n67);
    if (!Number.isFinite(e) || !Number.isFinite(n)) return { e: NaN, n: NaN };
    return {
      e: e + 807.8 + 0.00001549 * e + 0.000006521 * n,
      n: n - 248.6 + 0.00001549 * n + 0.000006521 * e
    };
  }

  function convertByMode(e, n, mode) {
    const m = String(mode || state.coordMode || 'twd97').toLowerCase();
    if (m === 'twd67') return twd97ToTwd67(e, n);
    return { e: Number(e), n: Number(n) };
  }

  function decimalDegToDms(deg) {
    const normalized = ((Number(deg) % 360) + 360) % 360;
    const d = Math.floor(normalized);
    const mFloat = (normalized - d) * 60;
    const m = Math.floor(mFloat);
    const s = (mFloat - m) * 60;
    return `${d}°${String(m).padStart(2, '0')}'${s.toFixed(2).padStart(5, '0')}"`;
  }

  function readNumber(id) {
    const el = document.getElementById(id);
    if (!el) return NaN;
    return Number(el.value);
  }

  function writeText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  }

  function readControlPairs() {
    const pairs = [];
    for (let i = 1; i <= 3; i += 1) {
      const dx = Number(document.getElementById(`layoutCp${i}DesignX`)?.value);
      const dy = Number(document.getElementById(`layoutCp${i}DesignY`)?.value);
      const fx = Number(document.getElementById(`layoutCp${i}FieldX`)?.value);
      const fy = Number(document.getElementById(`layoutCp${i}FieldY`)?.value);
      if ([dx, dy, fx, fy].every(Number.isFinite)) {
        pairs.push({ design: { x: dx, y: dy }, field: { x: fx, y: fy } });
      }
    }
    return pairs;
  }

  function saveSettingsToStorage() {
    try {
      localStorage.setItem(STAKE_PRECISION_KEY, JSON.stringify(state.precision));
      localStorage.setItem(STAKE_COORD_MODE_KEY, state.coordMode);
      localStorage.setItem(DRAWING_UNIT_KEY, state.drawingUnit);
      localStorage.setItem(AREA_UNIT_MODE_KEY, state.areaUnitMode);
      localStorage.setItem(CANVAS_GRID_SPACING_KEY, String(state.gridSpacingM));
      localStorage.setItem(CANVAS_GRID_ENABLED_KEY, state.gridEnabled ? '1' : '0');
    } catch (_e) {}
  }

  function toM2Units(areaM2) {
    const m2 = Number(areaM2) || 0;
    return {
      m2,
      ping: m2 / 3.305785,
      ha: m2 / 10000,
      jia: m2 / 9699.174
    };
  }

  function formatAreaByMode(areaM2) {
    const v = toM2Units(areaM2);
    if (state.areaUnitMode === 'm2') return `${v.m2.toFixed(4)} m²`;
    if (state.areaUnitMode === 'ping') return `${v.ping.toFixed(4)} 坪`;
    if (state.areaUnitMode === 'ha') return `${v.ha.toFixed(6)} 公頃`;
    if (state.areaUnitMode === 'jia') return `${v.jia.toFixed(6)} 甲`;
    return `${v.m2.toFixed(4)} m²｜${v.ping.toFixed(4)} 坪｜${v.ha.toFixed(6)} 公頃｜${v.jia.toFixed(6)} 甲`;
  }

  function parsePolygonPoints(rawText) {
    const raw = String(rawText || '').replace(/\r/g, '\n');
    const rows = raw.split('\n').map(s => s.trim()).filter(Boolean);
    const points = [];
    const errors = [];
    rows.forEach((line, idx) => {
      const normalized = line.replace(/\s+/g, ',');
      const cells = normalized.split(',').map(s => s.trim()).filter(Boolean);
      if (cells.length < 2) {
        errors.push(`第 ${idx + 1} 行：欄位不足，需 E,N`);
        return;
      }
      const e = Number(cells[0]);
      const n = Number(cells[1]);
      if (!Number.isFinite(e) || !Number.isFinite(n)) {
        errors.push(`第 ${idx + 1} 行：E/N 不是數字`);
        return;
      }
      points.push({ e, n });
    });
    return { points, errors };
  }

  function signedShoelaceArea(points) {
    const ps = Array.isArray(points) ? points : [];
    if (ps.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < ps.length; i += 1) {
      const a = ps[i];
      const b = ps[(i + 1) % ps.length];
      sum += (a.e * b.n) - (b.e * a.n);
    }
    return sum / 2;
  }

  function computeDistance2D(a, b) {
    const dx = Number(a.x) - Number(b.x);
    const dy = Number(a.y) - Number(b.y);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function findNearDuplicatePairs(points, thresholdM) {
    const th = Math.max(0.0001, Number(thresholdM) || 0.02);
    const arr = Array.isArray(points) ? points : [];
    const pairs = [];
    for (let i = 0; i < arr.length; i += 1) {
      for (let j = i + 1; j < arr.length; j += 1) {
        const d = computeDistance2D({ x: arr[i].x, y: arr[i].y }, { x: arr[j].x, y: arr[j].y });
        if (d <= th) {
          pairs.push({
            a: arr[i].id || `P${i + 1}`,
            b: arr[j].id || `P${j + 1}`,
            distance: d
          });
        }
      }
    }
    return pairs;
  }

  function isWithinTaiwanTwd97Range(e, n) {
    const E = Number(e);
    const N = Number(n);
    if (!Number.isFinite(E) || !Number.isFinite(N)) return false;
    return E >= 120000 && E <= 360000 && N >= 2400000 && N <= 2800000;
  }

  function buildRangeWarnings(points) {
    const warnings = [];
    (Array.isArray(points) ? points : []).forEach((p, idx) => {
      const ok = isWithinTaiwanTwd97Range(p.x, p.y);
      if (!ok) warnings.push(`${p.id || `P${idx + 1}`}(${Number(p.x).toFixed(3)},${Number(p.y).toFixed(3)})`);
    });
    return warnings;
  }

  function setHintColor(elementId, color) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.style.color = color;
  }

  function getTraverseClosureGrade(closureRatio) {
    const r = Number(closureRatio);
    if (!Number.isFinite(r)) return { grade: 'A+', color: '#8ff7c0', hint: '理想（閉合差≈0）' };
    if (r >= 10000) return { grade: 'A', color: '#8ff7c0', hint: '可施工' };
    if (r >= 5000) return { grade: 'B', color: '#ffe39e', hint: '建議複核後施工' };
    if (r >= 2000) return { grade: 'C', color: '#ffc68f', hint: '建議重測部分導線' };
    return { grade: 'D', color: '#ffb2b2', hint: '不建議直接施工' };
  }

  function evaluateDistanceIntersectionGeometry(baseDist, radiusA, radiusB, heightFromChord) {
    const d = Math.max(1e-12, Number(baseDist) || 0);
    const h = Math.max(0, Number(heightFromChord) || 0);
    const sinHalf = Math.max(0, Math.min(1, h / (Math.max(1e-12, Number(radiusA) || d))));
    const angleDegApprox = Math.max(0, Math.min(180, (2 * Math.asin(sinHalf)) * 180 / Math.PI));
    const nearTangent = h / d < 0.02 || angleDegApprox < 12;
    const nearConcentric = d < Math.abs((Number(radiusA) || 0) - (Number(radiusB) || 0)) + 0.01;
    const weak = nearTangent || nearConcentric;
    return {
      weak,
      angleDegApprox,
      hint: weak ? '幾何弱化（交角過小/近相切），建議改點位或補觀測' : '幾何條件良好'
    };
  }

  function evaluateBearingIntersectionGeometry(azAdeg, azBdeg) {
    const a = (Number(azAdeg) || 0) * Math.PI / 180;
    const b = (Number(azBdeg) || 0) * Math.PI / 180;
    const ua = { x: Math.sin(a), y: Math.cos(a) };
    const ub = { x: Math.sin(b), y: Math.cos(b) };
    const dot = Math.max(-1, Math.min(1, ua.x * ub.x + ua.y * ub.y));
    const raw = Math.acos(dot) * 180 / Math.PI;
    const intersectAngle = raw > 90 ? 180 - raw : raw;
    const weak = intersectAngle < 15;
    return {
      weak,
      intersectAngle,
      hint: weak ? '幾何弱化（交角過小），建議拉開站點方位夾角' : '幾何條件良好'
    };
  }

  function updateStakeSummary() {
    writeText(
      'stakePrecisionSummary',
      `座標精度：E/N/H = ${getAxisPrecision('E')}/${getAxisPrecision('N')}/${getAxisPrecision('H')} 位；座標系統 ${state.coordMode.toUpperCase()}；圖面單位 ${state.drawingUnit}`
    );
    const scaleInfo = document.getElementById('scale-info');
    if (scaleInfo) {
      const raw = String(scaleInfo.innerText || '');
      if (raw.includes('（圖面單位：')) {
        scaleInfo.innerText = raw.replace(/（圖面單位：[^）]+）/, `（圖面單位：${state.drawingUnit}）`);
      } else {
        scaleInfo.innerText = `${raw}（圖面單位：${state.drawingUnit}）`;
      }
    }
  }

  function updateCanvasScaleLegend() {
    const legend = document.getElementById('canvasScaleLegend');
    if (!legend) return;
    const bar = legend.querySelector('.legend-bar');
    if (!bar) return;
    if (!img || !img.src || !scalePixelsPerUnit || !Number.isFinite(scalePixelsPerUnit) || scalePixelsPerUnit <= 0) {
      legend.childNodes[0].nodeValue = '比例尺：待定比例';
      bar.style.width = '100px';
      return;
    }
    const displayPx = 120;
    const lengthM = displayPx / scalePixelsPerUnit;
    legend.childNodes[0].nodeValue = `比例尺：${lengthM.toFixed(2)} m`;
    bar.style.width = `${displayPx}px`;
  }

  function updateCanvasGridSetting() {
    const sel = document.getElementById('canvasGridSpacing');
    const spacing = Math.max(0, Number(sel ? sel.value : state.gridSpacingM));
    state.gridSpacingM = spacing;
    if (spacing <= 0) state.gridEnabled = false;
    saveSettingsToStorage();
    updateCanvasVisualAids();
  }

  function toggleCanvasGrid() {
    if (state.gridSpacingM <= 0) {
      state.gridSpacingM = 10;
      const sel = document.getElementById('canvasGridSpacing');
      if (sel) sel.value = '10';
    }
    state.gridEnabled = !state.gridEnabled;
    saveSettingsToStorage();
    updateCanvasVisualAids();
    showToast(state.gridEnabled ? '圖面格網已開啟' : '圖面格網已關閉');
  }

  function updateCanvasVisualAids() {
    const overlay = document.getElementById('canvasGridOverlay');
    const btn = document.getElementById('canvasGridToggleBtn');
    if (btn) btn.innerText = `🧱 格網: ${state.gridEnabled ? '開' : '關'}`;
    if (overlay) {
      let px = 80;
      if (scalePixelsPerUnit > 0 && state.gridSpacingM > 0) {
        px = Math.max(12, Math.min(600, scalePixelsPerUnit * state.gridSpacingM * Math.max(0.2, Number(zoomLevel) || 1)));
      }
      overlay.style.backgroundSize = `${px}px ${px}px`;
      overlay.style.opacity = state.gridEnabled && state.gridSpacingM > 0 ? '1' : '0';
    }
    updateCanvasScaleLegend();
  }

  function deleteLastLayoutPoint() {
    if (!Array.isArray(bimLayoutPoints) || !bimLayoutPoints.length) return showToast('目前沒有可刪除的雷達點');
    const removed = bimLayoutPoints.pop();
    state.deletedLayoutPoints.push(removed);
    if (state.deletedLayoutPoints.length > 30) state.deletedLayoutPoints.shift();
    if (typeof renderBimLayoutTable === 'function') renderBimLayoutTable();
    runStakePointQualityChecks();
    showToast(`已刪除最後雷達點：${removed.id || '-'}`);
  }

  function undoLastLayoutPointDeletion() {
    if (!state.deletedLayoutPoints.length) return showToast('沒有可復原的刪除');
    if (!Array.isArray(bimLayoutPoints)) bimLayoutPoints = [];
    const recovered = state.deletedLayoutPoints.pop();
    bimLayoutPoints.push(recovered);
    if (typeof renderBimLayoutTable === 'function') renderBimLayoutTable();
    runStakePointQualityChecks();
    showToast(`已復原雷達點：${recovered.id || '-'}`);
  }

  function bindStakeKeyboardShortcuts() {
    if (state.shortcutsBound) return;
    state.shortcutsBound = true;
    document.addEventListener('keydown', (event) => {
      const target = event.target;
      const tag = target && target.tagName ? String(target.tagName).toLowerCase() : '';
      const editable = target && (target.isContentEditable || tag === 'textarea');
      if (event.key === 'Escape') {
        clickPoints = [];
        drawMode = 'none';
        if (typeof syncMobileMeasureModeUI === 'function') syncMobileMeasureModeUI();
        showToast('已取消目前量測/定比例流程');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoLastLayoutPointDeletion();
        return;
      }
      if (event.key === 'Enter' && !editable && !event.shiftKey) {
        const inInput = tag === 'input' || tag === 'select';
        if (!inInput) return;
        event.preventDefault();
        if (state.lastIntersectionResult) return appendIntersectionResultToLayoutPoints();
        if (state.lastPolarResult) return appendPolarResultToLayoutPoints();
      }
    });
  }

  function updateStakePrecisionSettings() {
    state.precision.E = normalizePrecision(document.getElementById('stakePrecisionE')?.value);
    state.precision.N = normalizePrecision(document.getElementById('stakePrecisionN')?.value);
    state.precision.H = normalizePrecision(document.getElementById('stakePrecisionH')?.value);
    saveSettingsToStorage();
    updateStakeSummary();
    if (typeof renderBimLayoutTable === 'function') renderBimLayoutTable();
    showToast('已更新 E/N/H 小數位設定');
  }

  function updateStakeCoordSystemMode() {
    const mode = String(document.getElementById('stakeCoordSystem')?.value || 'twd97').toLowerCase();
    state.coordMode = (mode === 'twd67' || mode === 'dual') ? mode : 'twd97';
    saveSettingsToStorage();
    updateStakeSummary();
    if (typeof renderBimLayoutTable === 'function') renderBimLayoutTable();
    showToast(`座標系統已切換：${state.coordMode.toUpperCase()}`);
  }

  function updateDrawingUnitSetting() {
    const unit = String(document.getElementById('drawingUnitSelect')?.value || 'm').toLowerCase();
    state.drawingUnit = unit === 'cm' ? 'cm' : 'm';
    saveSettingsToStorage();
    updateStakeSummary();
    showToast(`圖面單位已設定為 ${state.drawingUnit}`);
  }

  function solveCoordinateInverse() {
    const inputE = readNumber('coordInverseE');
    const inputN = readNumber('coordInverseN');
    if (![inputE, inputN].every(Number.isFinite)) {
      return showToast('請輸入有效的 E / N 座標');
    }

    // Inputs follow selected coordinate mode. Convert to TWD97 before inverse solve.
    const en97 = state.coordMode === 'twd67' ? twd67ToTwd97(inputE, inputN) : { e: inputE, n: inputN };
    if (![en97.e, en97.n].every(Number.isFinite)) {
      return showToast('座標系統轉換失敗，請檢查輸入值');
    }

    let solvedX = en97.e;
    let solvedY = en97.n;
    const tf = layoutAlignmentState && Number.isFinite(layoutAlignmentState.scale) ? layoutAlignmentState : null;
    if (tf) {
      const scale = Number(tf.scale);
      const rot = Number(tf.rotationRad);
      const tx = Number(tf.tx);
      const ty = Number(tf.ty);
      if (Number.isFinite(scale) && Math.abs(scale) > 1e-9 && [rot, tx, ty].every(Number.isFinite)) {
        const ex = en97.e - tx;
        const ey = en97.n - ty;
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        solvedX = (c * ex + s * ey) / scale;
        solvedY = (-s * ex + c * ey) / scale;
      }
    }

    writeText(
      'coordInverseResult',
      `座標反算：X=${formatStakeCoordValue(solvedX, 'E')}、Y=${formatStakeCoordValue(solvedY, 'N')}（${tf ? '已套用控制點配準反算' : '未套用配準，使用同坐標解讀'}）`
    );
    return showToast('座標反算完成');
  }

  function solveDistanceAndAzimuth() {
    const e1 = readNumber('distAzE1');
    const n1 = readNumber('distAzN1');
    const e2 = readNumber('distAzE2');
    const n2 = readNumber('distAzN2');
    if (![e1, n1, e2, n2].every(Number.isFinite)) {
      return showToast('請先輸入兩點 E/N 座標');
    }
    const dE = e2 - e1;
    const dN = n2 - n1;
    const distance = Math.sqrt(dE * dE + dN * dN);
    // Azimuth in surveying convention: clockwise from north.
    const azimuthDeg = ((Math.atan2(dE, dN) * 180 / Math.PI) + 360) % 360;
    const dms = decimalDegToDms(azimuthDeg);
    writeText(
      'distAzResult',
      `兩點距離/方位角：距離 ${distance.toFixed(4)} m｜方位角 ${azimuthDeg.toFixed(6)}°（${dms}）｜ΔE ${formatStakeCoordValue(dE, 'E')}、ΔN ${formatStakeCoordValue(dN, 'N')}`
    );
    return showToast('兩點距離與方位角計算完成');
  }

  function solvePolarStakeout() {
    const stationE = readNumber('polarStationE');
    const stationN = readNumber('polarStationN');
    const distance = readNumber('polarDistance');
    const azimuthDeg = readNumber('polarAzimuthDeg');
    if (![stationE, stationN, distance, azimuthDeg].every(Number.isFinite) || distance < 0) {
      return showToast('請輸入有效的站點、距離、方位角');
    }
    const azimuthRad = azimuthDeg * Math.PI / 180;
    const targetE = stationE + distance * Math.sin(azimuthRad);
    const targetN = stationN + distance * Math.cos(azimuthRad);
    const modePoint = convertByMode(targetE, targetN, state.coordMode);
    state.lastPolarResult = {
      targetE97: targetE,
      targetN97: targetN,
      targetEView: modePoint.e,
      targetNView: modePoint.n,
      distance,
      azimuthDeg
    };
    state.lastOffsetRecord = {
      type: 'polar',
      source: 'POLAR_STAKEOUT',
      e97: targetE,
      n97: targetN,
      h: 0,
      note: `Station(${stationE},${stationN}) D=${distance} Az=${azimuthDeg}`
    };
    writeText(
      'polarStakeoutResult',
      `極座標放樣：目標 E=${formatStakeCoordValue(modePoint.e, 'E')}、N=${formatStakeCoordValue(modePoint.n, 'N')}（系統 ${state.coordMode.toUpperCase()}）`
    );
    return showToast('極座標放樣計算完成');
  }

  function appendPolarResultToLayoutPoints() {
    if (!state.lastPolarResult) {
      return showToast('請先執行極座標放樣');
    }
    if (!Array.isArray(bimLayoutPoints)) bimLayoutPoints = [];
    const idx = bimLayoutPoints.length + 1;
    const floorTag = (document.getElementById('floor_tag')?.value || 'BIM').trim() || 'BIM';
    const row = {
      id: `LP-${String(idx).padStart(4, '0')}`,
      sourceElementId: 'MANUAL',
      sourceType: 'POLAR_STAKEOUT',
      pointType: 'TARGET',
      x: Number(state.lastPolarResult.targetE97),
      y: Number(state.lastPolarResult.targetN97),
      z: 0,
      floorTag,
      status: 'manual'
    };
    bimLayoutPoints.push(row);
    if (typeof renderBimLayoutTable === 'function') renderBimLayoutTable();
    if (typeof renderBimLayoutQaSummary === 'function') renderBimLayoutQaSummary();
    runStakePointQualityChecks();
    showToast('極座標結果已加入放樣點表');
  }

  function exportStakeOffsetRecord() {
    if (!state.lastOffsetRecord) return showToast('目前沒有可匯出的支距結果');
    const e97 = Number(state.lastOffsetRecord.e97);
    const n97 = Number(state.lastOffsetRecord.n97);
    const h = Number(state.lastOffsetRecord.h || 0);
    const p67 = twd97ToTwd67(e97, n97);
    let csv = '\uFEFFtype,source,e_twd97,n_twd97,e_twd67,n_twd67,h,note,exported_at\n';
    csv += [
      sanitizeCSVField(state.lastOffsetRecord.type || ''),
      sanitizeCSVField(state.lastOffsetRecord.source || ''),
      formatStakeCoordValue(e97, 'E'),
      formatStakeCoordValue(n97, 'N'),
      formatStakeCoordValue(p67.e, 'E'),
      formatStakeCoordValue(p67.n, 'N'),
      formatStakeCoordValue(h, 'H'),
      sanitizeCSVField(state.lastOffsetRecord.note || ''),
      new Date().toISOString()
    ].join(',') + '\n';
    triggerFileDownload(csv, `ConstructionMaster_支距結果_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
    showToast('支距結果一筆已匯出');
  }

  function updateAreaUnitMode() {
    const mode = String(document.getElementById('areaUnitSelect')?.value || 'all').toLowerCase();
    state.areaUnitMode = ['all', 'm2', 'ping', 'ha', 'jia'].includes(mode) ? mode : 'all';
    saveSettingsToStorage();
    showToast('面積顯示單位已更新');
  }

  function calcPolygonAreaFromInput() {
    const input = document.getElementById('polygonPointsInput');
    const raw = input ? input.value : '';
    const parsed = parsePolygonPoints(raw);
    if (parsed.errors.length) {
      writeText('polygonAreaResult', `多邊形面積：資料錯誤｜${parsed.errors.slice(0, 3).join('；')}`);
      return showToast('角點資料有誤，請檢查格式');
    }
    if (parsed.points.length < 3) {
      return showToast('至少需要 3 個角點');
    }
    const signed = signedShoelaceArea(parsed.points);
    const absArea = Math.abs(signed);
    const orientation = signed > 0 ? '逆時針(CCW)' : (signed < 0 ? '順時針(CW)' : '共線/無面積');
    const signText = signed >= 0 ? '+' : '-';
    const detail = formatAreaByMode(absArea);
    writeText('polygonAreaResult', `多邊形面積：${detail}｜頂點方向 ${orientation}｜鞋帶法 signed=${signText}${Math.abs(signed).toFixed(4)}`);

    state.polygonHistory.unshift({
      createdAt: new Date().toISOString(),
      points: parsed.points,
      signedArea: signed,
      areaM2: absArea,
      orientation
    });
    if (state.polygonHistory.length > 60) state.polygonHistory.length = 60;
    return showToast('多邊形面積計算完成');
  }

  function exportPolygonAreaHistoryCsv() {
    if (!state.polygonHistory.length) return showToast('尚無可匯出的面積結果');
    let csv = '\uFEFF時間,角點數,方向,signed_area_m2,area_m2,area_ping,area_ha,area_jia,角點串列(E N)\n';
    state.polygonHistory.forEach(item => {
      const area = toM2Units(item.areaM2);
      const pointsText = item.points.map(p => `${p.e} ${p.n}`).join(' | ');
      csv += [
        sanitizeCSVField(item.createdAt),
        item.points.length,
        sanitizeCSVField(item.orientation),
        Number(item.signedArea).toFixed(6),
        area.m2.toFixed(6),
        area.ping.toFixed(6),
        area.ha.toFixed(8),
        area.jia.toFixed(8),
        sanitizeCSVField(pointsText)
      ].join(',') + '\n';
    });
    triggerFileDownload(csv, `ConstructionMaster_多邊形面積_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
    showToast('多邊形面積清單已匯出');
  }

  function solveSlopeConversion() {
    const ratioN = readNumber('slopeRatioN');
    const percent = readNumber('slopePercent');
    const angleDeg = readNumber('slopeAngleDeg');
    let slopePercent = NaN;
    if (Number.isFinite(ratioN) && ratioN > 0) slopePercent = 100 / ratioN;
    else if (Number.isFinite(percent)) slopePercent = percent;
    else if (Number.isFinite(angleDeg)) slopePercent = Math.tan(angleDeg * Math.PI / 180) * 100;
    if (!Number.isFinite(slopePercent)) return showToast('請至少輸入一個有效坡度值');

    const outRatioN = Math.abs(slopePercent) < 1e-12 ? Infinity : 100 / slopePercent;
    const outAngle = Math.atan(slopePercent / 100) * 180 / Math.PI;
    const ratioEl = document.getElementById('slopeRatioN');
    const percentEl = document.getElementById('slopePercent');
    const angleEl = document.getElementById('slopeAngleDeg');
    if (ratioEl && Number.isFinite(outRatioN)) ratioEl.value = Number(outRatioN).toFixed(6);
    if (percentEl) percentEl.value = Number(slopePercent).toFixed(6);
    if (angleEl) angleEl.value = Number(outAngle).toFixed(6);
    writeText(
      'slopeConvertResult',
      `坡度互算：1:${Number.isFinite(outRatioN) ? outRatioN.toFixed(6) : '∞'}｜${slopePercent.toFixed(6)}%｜${outAngle.toFixed(6)}°`
    );
    return showToast('坡度互算完成');
  }

  function solveSlopeTriangle() {
    let s = readNumber('triSlantDist');
    let h = readNumber('triHorizontalDist');
    let v = readNumber('triVerticalDiff');
    const angleDeg = readNumber('triSlopeAngleDeg');
    const known = [s, h, v].filter(Number.isFinite).length;
    if (known < 2 && !Number.isFinite(angleDeg)) {
      return showToast('請輸入 S/H/V 任兩項，或提供角度輔助');
    }

    if (!Number.isFinite(s) && Number.isFinite(h) && Number.isFinite(v)) s = Math.sqrt(h * h + v * v);
    if (!Number.isFinite(h) && Number.isFinite(s) && Number.isFinite(v)) {
      const hh = s * s - v * v;
      if (hh < 0) return showToast('輸入不合理：S² < V²');
      h = Math.sqrt(hh);
    }
    if (!Number.isFinite(v) && Number.isFinite(s) && Number.isFinite(h)) {
      const vv = s * s - h * h;
      if (vv < 0) return showToast('輸入不合理：S² < H²');
      v = Math.sqrt(vv);
    }

    if (Number.isFinite(angleDeg) && Number.isFinite(h) && !Number.isFinite(v)) {
      v = h * Math.tan(angleDeg * Math.PI / 180);
    } else if (Number.isFinite(angleDeg) && Number.isFinite(v) && !Number.isFinite(h)) {
      const t = Math.tan(angleDeg * Math.PI / 180);
      if (Math.abs(t) < 1e-12) return showToast('角度過小，無法由 V 反算 H');
      h = v / t;
    } else if (Number.isFinite(angleDeg) && Number.isFinite(s) && !Number.isFinite(h)) {
      h = s * Math.cos(angleDeg * Math.PI / 180);
    } else if (Number.isFinite(angleDeg) && Number.isFinite(s) && !Number.isFinite(v)) {
      v = s * Math.sin(angleDeg * Math.PI / 180);
    }

    if (!(Number.isFinite(s) && Number.isFinite(h) && Number.isFinite(v))) {
      return showToast('仍不足以求解，請補更多條件');
    }
    const solvedAngle = Math.atan2(v, h) * 180 / Math.PI;
    const slopePercent = (v / Math.max(1e-12, h)) * 100;
    const sEl = document.getElementById('triSlantDist');
    const hEl = document.getElementById('triHorizontalDist');
    const vEl = document.getElementById('triVerticalDiff');
    const aEl = document.getElementById('triSlopeAngleDeg');
    if (sEl) sEl.value = s.toFixed(6);
    if (hEl) hEl.value = h.toFixed(6);
    if (vEl) vEl.value = v.toFixed(6);
    if (aEl) aEl.value = solvedAngle.toFixed(6);
    writeText(
      'slopeTriangleResult',
      `斜距三角解：S=${s.toFixed(6)}｜H=${h.toFixed(6)}｜V=${v.toFixed(6)}｜角度=${solvedAngle.toFixed(6)}°｜坡度=${slopePercent.toFixed(6)}%`
    );
    return showToast('斜距/水平距/高差解算完成');
  }

  function parseMultiSlopeSegments(text) {
    const rows = String(text || '').replace(/\r/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
    const segments = [];
    const errors = [];
    rows.forEach((row, idx) => {
      const cols = row.split(',').map(s => s.trim()).filter(Boolean);
      if (cols.length < 2) {
        errors.push(`第 ${idx + 1} 行：需 水平距,坡度%`);
        return;
      }
      const hDist = Number(cols[0]);
      const slopePct = Number(cols[1]);
      if (!Number.isFinite(hDist) || hDist < 0 || !Number.isFinite(slopePct)) {
        errors.push(`第 ${idx + 1} 行：格式錯誤（水平距或坡度%）`);
        return;
      }
      segments.push({ hDist, slopePct });
    });
    return { segments, errors };
  }

  function solveMultiSegmentSlope() {
    const startH = readNumber('multiSlopeStartH');
    if (!Number.isFinite(startH)) return showToast('請輸入多段起始高程 H0');
    const parsed = parseMultiSlopeSegments(document.getElementById('multiSlopeSegmentsInput')?.value || '');
    if (parsed.errors.length) {
      writeText('multiSlopeResult', `多段坡度：資料錯誤｜${parsed.errors.slice(0, 3).join('；')}`);
      return showToast('多段坡度資料有誤');
    }
    if (!parsed.segments.length) return showToast('請至少輸入一段多段坡度');

    let chain = 0;
    let elev = startH;
    const rows = [];
    parsed.segments.forEach((seg, idx) => {
      const dH = seg.hDist * (seg.slopePct / 100);
      chain += seg.hDist;
      elev += dH;
      rows.push({
        index: idx + 1,
        hDist: seg.hDist,
        slopePct: seg.slopePct,
        dH,
        chain,
        endH: elev
      });
    });
    state.lastMultiSlopeResult = {
      startH,
      endH: elev,
      totalHorizontal: chain,
      rows
    };
    writeText(
      'multiSlopeResult',
      `多段坡度：共 ${rows.length} 段｜總水平距 ${chain.toFixed(4)}｜起點H ${startH.toFixed(4)} → 終點H ${elev.toFixed(4)}`
    );
    showToast('多段坡度連算完成');
  }

  function exportMultiSlopeCsv() {
    if (!state.lastMultiSlopeResult) return showToast('請先執行多段坡度連算');
    const r = state.lastMultiSlopeResult;
    let csv = '\uFEFF項目,數值\n';
    csv += `起始高程,${r.startH}\n終點高程,${r.endH}\n總水平距,${r.totalHorizontal}\n`;
    csv += '\n段次,水平距,坡度%,高差,累積水平距,段終點高程\n';
    r.rows.forEach(row => {
      csv += [row.index, row.hDist, row.slopePct, row.dH, row.chain, row.endH].join(',') + '\n';
    });
    triggerFileDownload(csv, `ConstructionMaster_多段坡度_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
    showToast('多段坡度結果已匯出');
  }

  function parseStakeCsvText(csvText) {
    const lines = String(csvText || '').replace(/\r/g, '\n').split('\n');
    const rows = lines.map(s => s.trim()).filter(Boolean);
    const points = [];
    const errors = [];
    rows.forEach((line, idx) => {
      const cols = line.split(',').map(s => s.trim());
      if (!cols.length) return;
      // skip likely header
      if (idx === 0 && /點號|point|name|e|n/i.test(cols.join(' '))) return;
      if (cols.length < 3) {
        errors.push(`第 ${idx + 1} 行：缺欄位，至少需 點號,E,N`);
        return;
      }
      const pointId = cols[0] || `P${idx + 1}`;
      const e = Number(cols[1]);
      const n = Number(cols[2]);
      const h = cols.length >= 4 && cols[3] !== '' ? Number(cols[3]) : 0;
      if (!Number.isFinite(e) || !Number.isFinite(n)) {
        errors.push(`第 ${idx + 1} 行：E 或 N 非數字`);
        return;
      }
      if (!Number.isFinite(h)) {
        errors.push(`第 ${idx + 1} 行：H 非數字`);
        return;
      }
      points.push({ pointId, e, n, h });
    });
    return { points, errors };
  }

  async function importStakePointsCsv(event) {
    const file = event && event.target && event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseStakeCsvText(text);
      if (parsed.errors.length) {
        writeText('stakeCsvImportStatus', `CSV 匯入錯誤：${parsed.errors.slice(0, 5).join('；')}`);
        return showToast(`CSV 匯入失敗，共 ${parsed.errors.length} 行錯誤`);
      }
      if (!Array.isArray(bimLayoutPoints)) bimLayoutPoints = [];
      const floorTag = (document.getElementById('floor_tag')?.value || 'BIM').trim() || 'BIM';
      parsed.points.forEach((p, i) => {
        bimLayoutPoints.push({
          id: `LP-${String(bimLayoutPoints.length + 1).padStart(4, '0')}`,
          sourceElementId: p.pointId,
          sourceType: 'CSV_IMPORT',
          pointType: 'TARGET',
          x: p.e,
          y: p.n,
          z: p.h,
          floorTag,
          status: 'imported'
        });
      });
      if (typeof renderBimLayoutTable === 'function') renderBimLayoutTable();
      runStakePointQualityChecks();
      writeText('stakeCsvImportStatus', `CSV 匯入完成：${parsed.points.length} 筆`);
      showToast(`CSV 匯入成功：${parsed.points.length} 筆`);
    } catch (error) {
      console.error('CSV 匯入失敗', error);
      showToast('CSV 匯入失敗：檔案讀取錯誤');
    }
  }

  function exportStakePointsInstrument(format) {
    if (!Array.isArray(bimLayoutPoints) || !bimLayoutPoints.length) {
      return showToast('目前沒有可匯出的放樣點');
    }
    const fmt = String(format || '').toLowerCase();
    let lines = [];
    if (fmt === 'leica') {
      lines.push('POINT_ID,E,N,H');
      bimLayoutPoints.forEach(p => {
        lines.push([p.id, formatStakeCoordValue(p.x, 'E'), formatStakeCoordValue(p.y, 'N'), formatStakeCoordValue(p.z, 'H')].join(','));
      });
    } else if (fmt === 'trimble') {
      lines.push('PNT,Northing,Easting,Elevation,Code');
      bimLayoutPoints.forEach(p => {
        lines.push([sanitizeCSVField(p.id), formatStakeCoordValue(p.y, 'N'), formatStakeCoordValue(p.x, 'E'), formatStakeCoordValue(p.z, 'H'), sanitizeCSVField(p.pointType || '')].join(','));
      });
    } else if (fmt === 'topcon') {
      lines.push('ID,E,N,H,NOTE');
      bimLayoutPoints.forEach(p => {
        lines.push([sanitizeCSVField(p.id), formatStakeCoordValue(p.x, 'E'), formatStakeCoordValue(p.y, 'N'), formatStakeCoordValue(p.z, 'H'), sanitizeCSVField(p.sourceType || '')].join(','));
      });
    } else {
      return showToast('未知儀器格式');
    }
    const text = '\uFEFF' + lines.join('\n');
    triggerFileDownload(text, `ConstructionMaster_${fmt.toUpperCase()}_Points_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
    showToast(`${fmt.toUpperCase()} 點位格式已匯出`);
  }

  function runStakePointQualityChecks() {
    if (!Array.isArray(bimLayoutPoints) || !bimLayoutPoints.length) {
      writeText('stakeQualityCheckResult', '點位檢查：目前無點位資料');
      return showToast('目前沒有可檢查的點位');
    }
    const threshold = Number(document.getElementById('pointDupThreshold')?.value) || 0.02;
    const dupPairs = findNearDuplicatePairs(bimLayoutPoints, threshold);
    const rangeWarnings = buildRangeWarnings(bimLayoutPoints);
    const dupText = dupPairs.length
      ? `重複點 ${dupPairs.length} 對（例：${dupPairs.slice(0, 3).map(p => `${p.a}/${p.b}@${p.distance.toFixed(3)}m`).join('、')}）`
      : '重複點 0 對';
    const rangeText = rangeWarnings.length
      ? `超出 TWD97 合理範圍 ${rangeWarnings.length} 筆（例：${rangeWarnings.slice(0, 3).join('、')}）`
      : '座標範圍正常';
    writeText('stakeQualityCheckResult', `點位檢查：${dupText}｜${rangeText}`);
    if (dupPairs.length || rangeWarnings.length) {
      showToast(`檢查完成：重複 ${dupPairs.length} 對 / 範圍警示 ${rangeWarnings.length} 筆`);
    } else {
      showToast('檢查完成：未發現重複點與範圍異常');
    }
  }

  function solveIntersectionPoint() {
    const mode = String(document.getElementById('intersectionMode')?.value || 'distance').toLowerCase();
    const ax = readNumber('interA_E');
    const ay = readNumber('interA_N');
    const bx = readNumber('interB_E');
    const by = readNumber('interB_N');
    const pa = readNumber('interA_Param');
    const pb = readNumber('interB_Param');
    if (![ax, ay, bx, by, pa, pb].every(Number.isFinite)) {
      return showToast('請先輸入完整交會參數');
    }
    if (mode === 'bearing') {
      // two-ray intersection: A + t*u, B + s*v.
      const a1 = pa * Math.PI / 180;
      const a2 = pb * Math.PI / 180;
      const u = { x: Math.sin(a1), y: Math.cos(a1) };
      const v = { x: Math.sin(a2), y: Math.cos(a2) };
      const denom = u.x * (-v.y) - u.y * (-v.x);
      if (Math.abs(denom) < 1e-10) return showToast('兩方位近乎平行，無法交會');
      const dx = bx - ax;
      const dy = by - ay;
      const t = (dx * (-v.y) - dy * (-v.x)) / denom;
      const ix = ax + t * u.x;
      const iy = ay + t * u.y;
      const geo = evaluateBearingIntersectionGeometry(pa, pb);
      state.lastIntersectionResult = { x: ix, y: iy, mode: 'bearing', meta: { azA: pa, azB: pb } };
      state.lastOffsetRecord = {
        type: 'intersection',
        source: 'BEARING_INTERSECTION',
        e97: ix,
        n97: iy,
        h: 0,
        note: `Aaz=${pa.toFixed(6)} BAz=${pb.toFixed(6)} | ${geo.hint}`
      };
      setHintColor('intersectionResult', geo.weak ? '#ffb5b5' : '#d6e8ff');
      writeText(
        'intersectionResult',
        `方位交會：E=${formatStakeCoordValue(ix, 'E')}、N=${formatStakeCoordValue(iy, 'N')}｜A方位 ${pa.toFixed(6)}°，B方位 ${pb.toFixed(6)}°｜交角 ${geo.intersectAngle.toFixed(3)}°｜${geo.hint}`
      );
      return showToast('方位交會解算完成');
    }

    // distance-distance intersection
    const r0 = pa;
    const r1 = pb;
    if (r0 < 0 || r1 < 0) return showToast('距離不可為負值');
    const dx = bx - ax;
    const dy = by - ay;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-10) return showToast('A、B 兩點重疊，無法距離交會');
    if (d > r0 + r1 || d < Math.abs(r0 - r1)) {
      return showToast('兩圓無交點，請檢查兩距離');
    }
    const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
    const h2 = r0 * r0 - a * a;
    const h = Math.sqrt(Math.max(0, h2));
    const xm = ax + (a * dx) / d;
    const ym = ay + (a * dy) / d;
    const rx = -dy * (h / d);
    const ry = dx * (h / d);
    const p1 = { x: xm + rx, y: ym + ry };
    const p2 = { x: xm - rx, y: ym - ry };
    const geo = evaluateDistanceIntersectionGeometry(d, r0, r1, h);
    const pick = String(document.getElementById('intersectionSolutionPick')?.value || '1') === '2' ? 2 : 1;
    const chosen = pick === 2 ? p2 : p1;
    state.lastIntersectionResult = { x: chosen.x, y: chosen.y, mode: 'distance', alt: pick === 2 ? p1 : p2, meta: { rA: r0, rB: r1 } };
    state.lastOffsetRecord = {
      type: 'intersection',
      source: 'DISTANCE_INTERSECTION',
      e97: chosen.x,
      n97: chosen.y,
      h: 0,
      note: `rA=${r0} rB=${r1} | ${geo.hint}`
    };
    setHintColor('intersectionResult', geo.weak ? '#ffb5b5' : '#d6e8ff');
    writeText(
      'intersectionResult',
      `距離交會：解1(E=${formatStakeCoordValue(p1.x, 'E')},N=${formatStakeCoordValue(p1.y, 'N')})｜解2(E=${formatStakeCoordValue(p2.x, 'E')},N=${formatStakeCoordValue(p2.y, 'N')})｜採用解${pick}｜估計交角 ${geo.angleDegApprox.toFixed(3)}°｜${geo.hint}`
    );
    return showToast('距離交會解算完成');
  }

  function appendIntersectionResultToLayoutPoints() {
    if (!state.lastIntersectionResult) return showToast('請先完成交會解算');
    if (!Array.isArray(bimLayoutPoints)) bimLayoutPoints = [];
    const floorTag = (document.getElementById('floor_tag')?.value || 'BIM').trim() || 'BIM';
    bimLayoutPoints.push({
      id: `LP-${String(bimLayoutPoints.length + 1).padStart(4, '0')}`,
      sourceElementId: 'INTERSECTION',
      sourceType: state.lastIntersectionResult.mode === 'bearing' ? 'BEARING_INTERSECTION' : 'DISTANCE_INTERSECTION',
      pointType: 'TARGET',
      x: Number(state.lastIntersectionResult.x),
      y: Number(state.lastIntersectionResult.y),
      z: 0,
      floorTag,
      status: 'intersection'
    });
    if (typeof renderBimLayoutTable === 'function') renderBimLayoutTable();
    runStakePointQualityChecks();
    showToast('交會結果已加入放樣點表');
  }

  function parseTraverseSegments(text) {
    const rows = String(text || '').replace(/\r/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
    const segments = [];
    const errors = [];
    rows.forEach((row, idx) => {
      const cols = row.split(',').map(s => s.trim()).filter(Boolean);
      if (cols.length < 2) {
        errors.push(`第 ${idx + 1} 行：需 方位角,距離`);
        return;
      }
      const az = Number(cols[0]);
      const dist = Number(cols[1]);
      if (!Number.isFinite(az) || !Number.isFinite(dist) || dist < 0) {
        errors.push(`第 ${idx + 1} 行：方位角或距離格式錯誤`);
        return;
      }
      segments.push({ azDeg: az, distance: dist });
    });
    return { segments, errors };
  }

  function solveTraverseClosure() {
    const startE = readNumber('travStartE');
    const startN = readNumber('travStartN');
    if (![startE, startN].every(Number.isFinite)) return showToast('請輸入導線起點 E/N');
    const targetEInput = readNumber('travTargetE');
    const targetNInput = readNumber('travTargetN');
    const targetE = Number.isFinite(targetEInput) ? targetEInput : startE;
    const targetN = Number.isFinite(targetNInput) ? targetNInput : startN;

    const parsed = parseTraverseSegments(document.getElementById('travSegmentsInput')?.value || '');
    if (parsed.errors.length) {
      writeText('traverseClosureResult', `導線閉合：資料錯誤｜${parsed.errors.slice(0, 3).join('；')}`);
      return showToast('導線資料有誤，請檢查格式');
    }
    if (!parsed.segments.length) return showToast('請至少輸入一段導線');

    let e = startE;
    let n = startN;
    let sumLen = 0;
    const rows = [];
    parsed.segments.forEach((seg, idx) => {
      const rad = seg.azDeg * Math.PI / 180;
      const dE = seg.distance * Math.sin(rad);
      const dN = seg.distance * Math.cos(rad);
      e += dE;
      n += dN;
      sumLen += seg.distance;
      rows.push({
        index: idx + 1,
        azDeg: seg.azDeg,
        distance: seg.distance,
        dE,
        dN
      });
    });
    const closureE = e - targetE;
    const closureN = n - targetN;
    const closure = Math.sqrt(closureE * closureE + closureN * closureN);
    const ratio = closure > 0 ? (sumLen / closure) : Infinity;

    rows.forEach(r => {
      const w = sumLen > 0 ? (r.distance / sumLen) : 0;
      r.corrE = -closureE * w;
      r.corrN = -closureN * w;
      r.adjDE = r.dE + r.corrE;
      r.adjDN = r.dN + r.corrN;
    });

    const gradeInfo = getTraverseClosureGrade(ratio);

    state.lastTraverseResult = {
      startE,
      startN,
      targetE,
      targetN,
      endE: e,
      endN: n,
      closureE,
      closureN,
      closure,
      totalLength: sumLen,
      closureRatio: ratio,
      grade: gradeInfo.grade,
      gradeHint: gradeInfo.hint,
      rows
    };
    const ratioText = Number.isFinite(ratio) ? `1:${Math.round(ratio)}` : '∞';
    setHintColor('traverseClosureResult', gradeInfo.color);
    writeText(
      'traverseClosureResult',
      `導線閉合：終點(E=${formatStakeCoordValue(e, 'E')},N=${formatStakeCoordValue(n, 'N')})｜閉合差 ΔE=${closureE.toFixed(4)}、ΔN=${closureN.toFixed(4)}、f=${closure.toFixed(4)}m｜閉合比 ${ratioText}｜等級 ${gradeInfo.grade}（${gradeInfo.hint}）｜配賦：Bowditch`
    );
    return showToast('導線閉合差計算完成');
  }

  function exportTraverseClosureCsv() {
    if (!state.lastTraverseResult) return showToast('請先執行導線閉合差計算');
    const r = state.lastTraverseResult;
    let csv = '\uFEFF項目,數值\n';
    csv += `起點E,${r.startE}\n起點N,${r.startN}\n目標E,${r.targetE}\n目標N,${r.targetN}\n`;
    csv += `終點E,${r.endE}\n終點N,${r.endN}\n`;
    csv += `閉合差ΔE,${r.closureE}\n閉合差ΔN,${r.closureN}\n線性閉合差f,${r.closure}\n總長,${r.totalLength}\n`;
    csv += `閉合比,${Number.isFinite(r.closureRatio) ? `1:${Math.round(r.closureRatio)}` : '∞'}\n`;
    csv += `等級,${r.grade || ''}\n等級建議,${sanitizeCSVField(r.gradeHint || '')}\n`;
    csv += '\n段次,方位角(°),距離,dE,dN,Bowditch修正dE,Bowditch修正dN,配賦後dE,配賦後dN\n';
    r.rows.forEach(seg => {
      csv += [
        seg.index,
        seg.azDeg,
        seg.distance,
        seg.dE,
        seg.dN,
        seg.corrE,
        seg.corrN,
        seg.adjDE,
        seg.adjDN
      ].join(',') + '\n';
    });
    triggerFileDownload(csv, `ConstructionMaster_導線閉合_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
    showToast('導線閉合報表已匯出');
  }

  function collectStakeProjectPayload() {
    return {
      version: '8.0-stake-project',
      exportedAt: new Date().toISOString(),
      projectName: getCurrentProjectName(),
      floorTag: (document.getElementById('floor_tag')?.value || '').trim(),
      settings: {
        precision: { ...state.precision },
        coordMode: state.coordMode,
        drawingUnit: state.drawingUnit,
        areaUnitMode: state.areaUnitMode,
        gridSpacingM: state.gridSpacingM,
        gridEnabled: state.gridEnabled
      },
      polygonHistory: state.polygonHistory.slice(0, 60),
      controlPoints: readControlPairs(),
      radarPoints: Array.isArray(bimLayoutPoints) ? bimLayoutPoints : [],
      layoutAlignmentState: layoutAlignmentState || null
    };
  }

  function applyStakeProjectPayload(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('專案檔格式錯誤');
    const settings = payload.settings || {};
    const precision = settings.precision || {};
    state.precision = {
      E: normalizePrecision(precision.E),
      N: normalizePrecision(precision.N),
      H: normalizePrecision(precision.H)
    };
    state.coordMode = (settings.coordMode === 'twd67' || settings.coordMode === 'dual') ? settings.coordMode : 'twd97';
    state.drawingUnit = settings.drawingUnit === 'cm' ? 'cm' : 'm';
    state.areaUnitMode = ['all', 'm2', 'ping', 'ha', 'jia'].includes(settings.areaUnitMode) ? settings.areaUnitMode : state.areaUnitMode;
    state.gridSpacingM = Number.isFinite(Number(settings.gridSpacingM)) ? Math.max(0, Number(settings.gridSpacingM)) : state.gridSpacingM;
    state.gridEnabled = !!settings.gridEnabled && state.gridSpacingM > 0;
    state.polygonHistory = Array.isArray(payload.polygonHistory) ? payload.polygonHistory.slice(0, 60) : [];

    const projectNameInput = document.getElementById('project_name');
    if (projectNameInput && typeof payload.projectName === 'string') projectNameInput.value = payload.projectName;
    const floorTagInput = document.getElementById('floor_tag');
    if (floorTagInput && typeof payload.floorTag === 'string') floorTagInput.value = payload.floorTag;

    if (Array.isArray(payload.radarPoints)) {
      bimLayoutPoints = payload.radarPoints
        .map(p => ({ ...p }))
        .filter(p => Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)));
    }
    layoutAlignmentState = payload.layoutAlignmentState || null;

    // restore control points (up to 3)
    const cp = Array.isArray(payload.controlPoints) ? payload.controlPoints.slice(0, 3) : [];
    for (let i = 1; i <= 3; i += 1) {
      const pair = cp[i - 1] || {};
      const d = pair.design || {};
      const f = pair.field || {};
      const setVal = (id, v) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = Number.isFinite(Number(v)) ? String(v) : '';
      };
      setVal(`layoutCp${i}DesignX`, d.x);
      setVal(`layoutCp${i}DesignY`, d.y);
      setVal(`layoutCp${i}FieldX`, f.x);
      setVal(`layoutCp${i}FieldY`, f.y);
    }

    const eSel = document.getElementById('stakePrecisionE');
    const nSel = document.getElementById('stakePrecisionN');
    const hSel = document.getElementById('stakePrecisionH');
    const cSel = document.getElementById('stakeCoordSystem');
    const uSel = document.getElementById('drawingUnitSelect');
    const areaSel = document.getElementById('areaUnitSelect');
    const gridSel = document.getElementById('canvasGridSpacing');
    if (eSel) eSel.value = String(state.precision.E);
    if (nSel) nSel.value = String(state.precision.N);
    if (hSel) hSel.value = String(state.precision.H);
    if (cSel) cSel.value = state.coordMode;
    if (uSel) uSel.value = state.drawingUnit;
    if (areaSel) areaSel.value = state.areaUnitMode;
    if (gridSel) gridSel.value = String(state.gridSpacingM || 0);

    saveSettingsToStorage();
    updateStakeSummary();
    if (typeof renderBimLayoutTable === 'function') renderBimLayoutTable();
    if (typeof renderBimLayoutQaSummary === 'function') renderBimLayoutQaSummary();
    if (typeof renderTable === 'function') renderTable();
    const summary = document.getElementById('layoutAlignmentSummary');
    if (summary && typeof formatLayoutAlignmentSummary === 'function') {
      summary.innerText = formatLayoutAlignmentSummary(layoutAlignmentState);
    }
    updateCanvasVisualAids();
  }

  function exportStakeProjectJson() {
    const payload = collectStakeProjectPayload();
    const content = JSON.stringify(payload, null, 2);
    triggerFileDownload(content, `ConstructionMaster_放樣專案_${Date.now()}.json`, 'application/json;charset=utf-8;');
    writeText('stakeProjectStatus', `專案存載：已匯出 JSON（${new Date().toLocaleString('zh-TW')}）`);
    showToast('放樣專案 JSON 已匯出');
  }

  function triggerImportStakeProject() {
    const fileInput = document.getElementById('stakeProjectImportFile');
    if (!fileInput) return;
    fileInput.value = '';
    fileInput.click();
  }

  async function importStakeProjectFromFile(event) {
    const file = event && event.target && event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      applyStakeProjectPayload(payload);
      writeText('stakeProjectStatus', `專案存載：已匯入 ${file.name}`);
      showToast('放樣專案已匯入');
    } catch (error) {
      console.error('匯入放樣專案失敗', error);
      showToast('匯入失敗：JSON 格式不正確或資料不完整');
    }
  }

  function saveStakeProjectLocal() {
    const payload = collectStakeProjectPayload();
    try {
      localStorage.setItem(STAKE_PROJECT_LOCAL_KEY, JSON.stringify(payload));
      writeText('stakeProjectStatus', `專案存載：已存到本機（${new Date().toLocaleString('zh-TW')}）`);
      showToast('已儲存到本機專案');
    } catch (error) {
      console.error('本機儲存失敗', error);
      showToast('本機儲存失敗，請確認瀏覽器儲存空間');
    }
  }

  function loadStakeProjectLocal() {
    try {
      const raw = localStorage.getItem(STAKE_PROJECT_LOCAL_KEY);
      if (!raw) return showToast('本機尚無可載入的放樣專案');
      const payload = JSON.parse(raw);
      applyStakeProjectPayload(payload);
      writeText('stakeProjectStatus', `專案存載：已從本機載入（${new Date().toLocaleString('zh-TW')}）`);
      showToast('已從本機載入放樣專案');
    } catch (error) {
      console.error('本機載入失敗', error);
      showToast('本機專案載入失敗，資料可能損毀');
    }
  }

  function initSurveyToolkit() {
    try {
      const storedPrecision = JSON.parse(localStorage.getItem(STAKE_PRECISION_KEY) || '{}');
      state.precision = {
        E: normalizePrecision(storedPrecision.E),
        N: normalizePrecision(storedPrecision.N),
        H: normalizePrecision(storedPrecision.H)
      };
    } catch (_e) {
      state.precision = { E: 3, N: 3, H: 3 };
    }
    const storedMode = String(localStorage.getItem(STAKE_COORD_MODE_KEY) || 'twd97').toLowerCase();
    state.coordMode = (storedMode === 'twd67' || storedMode === 'dual') ? storedMode : 'twd97';
    state.drawingUnit = String(localStorage.getItem(DRAWING_UNIT_KEY) || 'm').toLowerCase() === 'cm' ? 'cm' : 'm';
    const storedAreaMode = String(localStorage.getItem(AREA_UNIT_MODE_KEY) || 'all').toLowerCase();
    state.areaUnitMode = ['all', 'm2', 'ping', 'ha', 'jia'].includes(storedAreaMode) ? storedAreaMode : 'all';
    const storedGridSpacing = Number(localStorage.getItem(CANVAS_GRID_SPACING_KEY));
    state.gridSpacingM = Number.isFinite(storedGridSpacing) ? Math.max(0, storedGridSpacing) : 0;
    state.gridEnabled = localStorage.getItem(CANVAS_GRID_ENABLED_KEY) === '1' && state.gridSpacingM > 0;

    const eSel = document.getElementById('stakePrecisionE');
    const nSel = document.getElementById('stakePrecisionN');
    const hSel = document.getElementById('stakePrecisionH');
    const cSel = document.getElementById('stakeCoordSystem');
    const uSel = document.getElementById('drawingUnitSelect');
    const areaSel = document.getElementById('areaUnitSelect');
    const gridSel = document.getElementById('canvasGridSpacing');
    if (eSel) eSel.value = String(state.precision.E);
    if (nSel) nSel.value = String(state.precision.N);
    if (hSel) hSel.value = String(state.precision.H);
    if (cSel) cSel.value = state.coordMode;
    if (uSel) uSel.value = state.drawingUnit;
    if (areaSel) areaSel.value = state.areaUnitMode;
    if (gridSel) gridSel.value = String(state.gridSpacingM || 0);
    updateStakeSummary();
    bindStakeKeyboardShortcuts();
    setTimeout(() => {
      updateCanvasVisualAids();
    }, 0);
  }

  function getStakeToolkitSettings() {
    return {
      precision: { ...state.precision },
      coordMode: state.coordMode,
      drawingUnit: state.drawingUnit,
      gridSpacingM: state.gridSpacingM,
      gridEnabled: state.gridEnabled
    };
  }

  global.getAxisPrecision = getAxisPrecision;
  global.formatStakeCoordValue = formatStakeCoordValue;
  global.twd97ToTwd67 = twd97ToTwd67;
  global.twd67ToTwd97 = twd67ToTwd97;
  global.convertByMode = convertByMode;
  global.decimalDegToDms = decimalDegToDms;
  global.updateStakePrecisionSettings = updateStakePrecisionSettings;
  global.updateStakeCoordSystemMode = updateStakeCoordSystemMode;
  global.updateDrawingUnitSetting = updateDrawingUnitSetting;
  global.updateCanvasGridSetting = updateCanvasGridSetting;
  global.toggleCanvasGrid = toggleCanvasGrid;
  global.updateCanvasVisualAids = updateCanvasVisualAids;
  global.solveCoordinateInverse = solveCoordinateInverse;
  global.solveDistanceAndAzimuth = solveDistanceAndAzimuth;
  global.solvePolarStakeout = solvePolarStakeout;
  global.appendPolarResultToLayoutPoints = appendPolarResultToLayoutPoints;
  global.deleteLastLayoutPoint = deleteLastLayoutPoint;
  global.undoLastLayoutPointDeletion = undoLastLayoutPointDeletion;
  global.exportStakeOffsetRecord = exportStakeOffsetRecord;
  global.updateAreaUnitMode = updateAreaUnitMode;
  global.calcPolygonAreaFromInput = calcPolygonAreaFromInput;
  global.exportPolygonAreaHistoryCsv = exportPolygonAreaHistoryCsv;
  global.solveSlopeConversion = solveSlopeConversion;
  global.solveSlopeTriangle = solveSlopeTriangle;
  global.solveMultiSegmentSlope = solveMultiSegmentSlope;
  global.exportMultiSlopeCsv = exportMultiSlopeCsv;
  global.importStakePointsCsv = importStakePointsCsv;
  global.exportStakePointsInstrument = exportStakePointsInstrument;
  global.runStakePointQualityChecks = runStakePointQualityChecks;
  global.solveIntersectionPoint = solveIntersectionPoint;
  global.appendIntersectionResultToLayoutPoints = appendIntersectionResultToLayoutPoints;
  global.solveTraverseClosure = solveTraverseClosure;
  global.exportTraverseClosureCsv = exportTraverseClosureCsv;
  global.exportStakeProjectJson = exportStakeProjectJson;
  global.triggerImportStakeProject = triggerImportStakeProject;
  global.importStakeProjectFromFile = importStakeProjectFromFile;
  global.saveStakeProjectLocal = saveStakeProjectLocal;
  global.loadStakeProjectLocal = loadStakeProjectLocal;
  global.initSurveyToolkit = initSurveyToolkit;
  global.getStakeToolkitSettings = getStakeToolkitSettings;
})(window);
