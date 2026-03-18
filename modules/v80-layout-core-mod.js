// BIM layout core module (v8.0).
(function attachV80LayoutCoreModule(global) {
  function getLayoutTypeSelection() {
    return {
      column: !!(document.getElementById('layoutTypeColumn') && document.getElementById('layoutTypeColumn').checked),
      wall: !!(document.getElementById('layoutTypeWall') && document.getElementById('layoutTypeWall').checked),
      beam: !!(document.getElementById('layoutTypeBeam') && document.getElementById('layoutTypeBeam').checked)
    };
  }

  function isLayoutTargetType(type, sel) {
    const t = normalizeIfcType(type);
    if (sel.column && t.includes('IFCCOLUMN')) return true;
    if (sel.wall && t.includes('IFCWALL')) return true;
    if (sel.beam && t.includes('IFCBEAM')) return true;
    return false;
  }

  function makeSeededValue(entityId, seed, min, max) {
    const n = Number(String(entityId || '').replace('#', '')) || 0;
    const span = max - min;
    const raw = ((n * (seed * 37 + 11)) + seed * 97) % 100000;
    return min + (raw / 100000) * span;
  }

  function toPointRow(element, pointType, x, y, z, idx) {
    const floorTag = (document.getElementById('floor_tag') && document.getElementById('floor_tag').value.trim()) || 'BIM';
    return {
      id: `LP-${String(idx + 1).padStart(4, '0')}`,
      sourceElementId: element.id,
      sourceType: element.type,
      pointType,
      x: Number(x),
      y: Number(y),
      z: Number(z),
      floorTag,
      status: 'draft'
    };
  }

  function formatLayoutCoord(value, axis) {
    if (typeof formatStakeCoordValue === 'function') return formatStakeCoordValue(value, axis);
    const n = Number(value);
    if (!Number.isFinite(n)) return '-';
    return n.toFixed(axis === 'H' ? 3 : 3);
  }

  function getCoordMode() {
    if (typeof getStakeToolkitSettings === 'function') {
      const settings = getStakeToolkitSettings() || {};
      return settings.coordMode || 'twd97';
    }
    return 'twd97';
  }

  function buildCoordCell(e97, n97, axis) {
    const mode = getCoordMode();
    const e = Number(e97);
    const n = Number(n97);
    if (!Number.isFinite(e) || !Number.isFinite(n)) return '-';
    if (axis === 'H') return formatLayoutCoord(e97, 'H');
    if (mode === 'twd67' && typeof twd97ToTwd67 === 'function') {
      const converted = twd97ToTwd67(e, n);
      const value = axis === 'E' ? converted.e : converted.n;
      return formatLayoutCoord(value, axis);
    }
    if (mode === 'dual' && typeof twd97ToTwd67 === 'function') {
      const converted = twd97ToTwd67(e, n);
      const v97 = axis === 'E' ? e : n;
      const v67 = axis === 'E' ? converted.e : converted.n;
      return `${formatLayoutCoord(v97, axis)}<br><span style="opacity:0.75;font-size:0.82em;">67:${formatLayoutCoord(v67, axis)}</span>`;
    }
    return formatLayoutCoord(axis === 'E' ? e : n, axis);
  }

  function makeSeededOffset(entityId, seed, amplitude) {
    const n = Number(String(entityId || '').replace('#', '')) || 0;
    const raw = Math.sin((n + 1) * (seed * 17.371)) * 43758.5453;
    const fract = raw - Math.floor(raw);
    return (fract * 2 - 1) * amplitude;
  }

  function buildLayoutPointsSnapshot(selection, runIndex = 0, jitterAmplitude = 0) {
    if (!bimModelData || !Array.isArray(bimModelData.elements) || !bimModelData.elements.length) return [];
    const targets = bimModelData.elements.filter(el => isLayoutTargetType(el.type, selection));
    if (!targets.length) return [];
    const points = [];
    targets.forEach((el) => {
      const baseX = makeSeededValue(el.id, 1, 0, 120);
      const baseY = makeSeededValue(el.id, 2, 0, 120);
      const baseZ = makeSeededValue(el.id, 3, 0, 30);
      const dx = runIndex > 0 ? makeSeededOffset(el.id, 101 + runIndex, jitterAmplitude) : 0;
      const dy = runIndex > 0 ? makeSeededOffset(el.id, 203 + runIndex, jitterAmplitude) : 0;
      const dz = runIndex > 0 ? makeSeededOffset(el.id, 307 + runIndex, jitterAmplitude * 0.6) : 0;
      if (el.type.includes('IFCCOLUMN')) {
        points.push(toPointRow(el, 'CENTER', baseX + dx, baseY + dy, baseZ + dz, points.length));
        return;
      }
      if (el.type.includes('IFCWALL') || el.type.includes('IFCBEAM')) {
        const offset = el.type.includes('IFCBEAM') ? 1.8 : 2.4;
        points.push(toPointRow(el, 'END_A', baseX - offset + dx, baseY - 0.8 + dy, baseZ + dz, points.length));
        points.push(toPointRow(el, 'END_B', baseX + offset + dx, baseY + 0.8 + dy, baseZ + dz, points.length));
      }
    });
    const seededPoints = points.slice(0, 1200);
    return assignLayoutGroups(seededPoints).points;
  }

  function layoutPointKey(point) {
    return `${point.sourceElementId || ''}|${point.pointType || ''}`;
  }

  function analyzeLayoutStabilityRuns(runSets, thresholdM) {
    const keyDriftMap = new Map();
    if (!Array.isArray(runSets) || runSets.length < 2 || !Array.isArray(runSets[0])) {
      return { keyDriftMap, meanDrift: 0, maxDrift: 0, unstableGroups: [], unstableCount: 0 };
    }
    const base = runSets[0];
    const runMaps = runSets.map(points => {
      const map = new Map();
      points.forEach(p => map.set(layoutPointKey(p), p));
      return map;
    });
    const drifts = [];
    const unstableGroups = new Set();
    base.forEach((p) => {
      const key = layoutPointKey(p);
      const px = Number(p.x) || 0;
      const py = Number(p.y) || 0;
      const pz = Number(p.z) || 0;
      let maxDrift = 0;
      for (let i = 1; i < runMaps.length; i += 1) {
        const q = runMaps[i].get(key);
        if (!q) continue;
        const dx = (Number(q.x) || 0) - px;
        const dy = (Number(q.y) || 0) - py;
        const dz = (Number(q.z) || 0) - pz;
        const drift = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (drift > maxDrift) maxDrift = drift;
      }
      keyDriftMap.set(key, maxDrift);
      drifts.push(maxDrift);
      if (maxDrift > thresholdM && p.layoutGroup) unstableGroups.add(p.layoutGroup);
    });
    const meanDrift = drifts.length ? (drifts.reduce((a, b) => a + b, 0) / drifts.length) : 0;
    const maxDrift = drifts.length ? Math.max(...drifts) : 0;
    return {
      keyDriftMap,
      meanDrift,
      maxDrift,
      unstableGroups: Array.from(unstableGroups).sort(),
      unstableCount: drifts.filter(v => v > thresholdM).length
    };
  }

  function renderBimLayoutTable() {
    const body = document.getElementById('bimLayoutBody');
    if (!body) return;
    body.innerHTML = '';
    const pointsForView = layoutConfidenceFilterMode === 'high'
      ? bimLayoutPoints.filter(p => p.confidenceLevel === 'high')
      : bimLayoutPoints;
    if (!pointsForView.length) {
      const tr = document.createElement('tr');
      const hint = bimLayoutPoints.length && layoutConfidenceFilterMode === 'high'
        ? '目前沒有高信心放樣點，請先執行偏差熱圖/強化放樣'
        : '尚未產生放樣點';
      tr.innerHTML = `<td colspan="11" style="color:#9ab3cf;">${hint}</td>`;
      body.appendChild(tr);
      const heatBox = document.getElementById('layoutHeatmapSummary');
      if (heatBox) heatBox.innerText = '偏差熱圖：尚未分析';
      renderLayoutConfidenceSummary();
      return;
    }
    pointsForView.slice(0, 200).forEach(p => {
      const tr = document.createElement('tr');
      const deviation = Number(p.deviationScore);
      let heatText = '-';
      let heatStyle = 'color:#b3c3d6;';
      if (Number.isFinite(deviation)) {
        if (deviation <= 25) {
          heatText = `🟢 ${deviation}`;
          heatStyle = 'color:#8df0b0;font-weight:700;';
          tr.style.background = 'rgba(0, 230, 118, 0.06)';
        } else if (deviation <= 55) {
          heatText = `🟡 ${deviation}`;
          heatStyle = 'color:#ffe08a;font-weight:700;';
          tr.style.background = 'rgba(255, 202, 40, 0.08)';
        } else {
          heatText = `🔴 ${deviation}`;
          heatStyle = 'color:#ff9e9e;font-weight:700;';
          tr.style.background = 'rgba(255, 82, 82, 0.10)';
        }
      }
      const confidence = Number(p.confidenceScore);
      let confidenceText = '-';
      let confidenceStyle = 'color:#b3c3d6;';
      if (p.confidenceLevel === 'high') {
        confidenceText = `🟢 高 (${Number.isFinite(confidence) ? confidence : '-'})`;
        confidenceStyle = 'color:#93f5da;font-weight:700;';
      } else if (p.confidenceLevel === 'medium') {
        confidenceText = `🟡 中 (${Number.isFinite(confidence) ? confidence : '-'})`;
        confidenceStyle = 'color:#ffe08a;font-weight:700;';
      } else if (p.confidenceLevel === 'low') {
        confidenceText = `🔴 低 (${Number.isFinite(confidence) ? confidence : '-'})`;
        confidenceStyle = 'color:#ff9e9e;font-weight:700;';
      }
      if (p.spotCheckSelected) confidenceText = `${confidenceText}｜🧪抽驗`;
      if (p.stabilityFlag === 'unstable') {
        confidenceText = `${confidenceText}｜⚠️不穩`;
        confidenceStyle = 'color:#ff9e9e;font-weight:800;';
        tr.style.boxShadow = 'inset 0 0 0 1px rgba(255, 110, 110, 0.65)';
        if (!Number.isFinite(deviation) || deviation <= 25) {
          tr.style.background = 'rgba(255, 82, 82, 0.12)';
        }
      }
      const cellE = buildCoordCell(p.x, p.y, 'E');
      const cellN = buildCoordCell(p.x, p.y, 'N');
      const cellH = buildCoordCell(p.z, p.z, 'H');
      tr.innerHTML = `<td>${p.id}</td><td>${p.sourceElementId}</td><td>${p.sourceType}</td><td>${p.pointType}</td><td>${cellE}</td><td>${cellN}</td><td>${cellH}</td><td>${p.floorTag}</td><td>${p.layoutGroup || '-'}</td><td style="${heatStyle}">${heatText}</td><td style="${confidenceStyle}">${confidenceText}</td>`;
      body.appendChild(tr);
    });
    renderLayoutConfidenceSummary();
  }

  function classifyLayoutPointConfidence(point) {
    const deviation = Number(point.deviationScore);
    let confidenceScore;
    if (Number.isFinite(deviation)) {
      confidenceScore = Math.max(0, Math.min(100, Math.round(100 - deviation)));
    } else {
      // Fallback confidence when heatmap has not been run yet.
      const status = String(point.status || '').toLowerCase();
      if (status.includes('aligned')) confidenceScore = 82;
      else if (status.includes('precision')) confidenceScore = 76;
      else confidenceScore = 68;
    }
    if (point.layoutGroup) confidenceScore = Math.min(100, confidenceScore + 4);
    const level = confidenceScore >= 80 ? 'high' : (confidenceScore >= 60 ? 'medium' : 'low');
    return { confidenceScore, confidenceLevel: level };
  }

  function runBimLayoutConfidenceLayering(highOnly = false, silent = false) {
    if (!bimLayoutPoints.length) return showToast('請先產生放樣點');
    bimLayoutPoints = bimLayoutPoints.map((p) => {
      const conf = classifyLayoutPointConfidence(p);
      return { ...p, ...conf };
    });
    layoutConfidenceFilterMode = highOnly ? 'high' : 'all';
    renderBimLayoutTable();
    const highCount = bimLayoutPoints.filter(p => p.confidenceLevel === 'high').length;
    const mediumCount = bimLayoutPoints.filter(p => p.confidenceLevel === 'medium').length;
    const lowCount = bimLayoutPoints.filter(p => p.confidenceLevel === 'low').length;
    addAuditLog('放樣置信度分層', `高${highCount} 中${mediumCount} 低${lowCount} / 模式 ${layoutConfidenceFilterMode}`);
    if (silent) return;
    if (highOnly) showToast(`已切換高信心點模式：高 ${highCount} 筆`);
    else showToast(`置信度分層完成：高 ${highCount} / 中 ${mediumCount} / 低 ${lowCount}`);
  }

  function showAllBimLayoutPoints() {
    layoutConfidenceFilterMode = 'all';
    renderBimLayoutTable();
    showToast('已切換為顯示全部放樣點');
  }

  function renderLayoutConfidenceSummary() {
    const box = document.getElementById('layoutConfidenceSummary');
    if (!box) return;
    if (!bimLayoutPoints.length) {
      box.innerText = '置信度分層：尚未分析';
      return;
    }
    const highCount = bimLayoutPoints.filter(p => p.confidenceLevel === 'high').length;
    const mediumCount = bimLayoutPoints.filter(p => p.confidenceLevel === 'medium').length;
    const lowCount = bimLayoutPoints.filter(p => p.confidenceLevel === 'low').length;
    const modeText = layoutConfidenceFilterMode === 'high' ? '僅顯示高信心' : '顯示全部';
    box.innerText = `置信度分層：🟢 ${highCount} / 🟡 ${mediumCount} / 🔴 ${lowCount}（${modeText}）`;
  }

  function getLayoutGridLabel(row, col) {
    const rowText = ['上', '中', '下'][row] || `R${row + 1}`;
    const colText = ['左', '中', '右'][col] || `C${col + 1}`;
    return `${rowText}${colText}`;
  }

  function suggestLayoutControlPointsCoverage() {
    if (!bimLayoutPoints.length) return showToast('請先產生放樣點');
    const source = bimLayoutPoints.filter(p => p.confidenceLevel === 'high');
    const points = source.length >= 8 ? source : bimLayoutPoints;
    const xs = points.map(p => Number(p.x)).filter(Number.isFinite);
    const ys = points.map(p => Number(p.y)).filter(Number.isFinite);
    if (!xs.length || !ys.length) return showToast('座標不足，無法分析補點建議');
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = Math.max(0.001, maxX - minX);
    const spanY = Math.max(0.001, maxY - minY);
    const grid = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => 0));
    points.forEach(p => {
      const x = Number(p.x), y = Number(p.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const cx = Math.max(0, Math.min(2, Math.floor(((x - minX) / spanX) * 3)));
      const cy = Math.max(0, Math.min(2, Math.floor(((y - minY) / spanY) * 3)));
      grid[cy][cx] += 1;
    });
    const cells = [];
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        cells.push({ row: r, col: c, count: grid[r][c], label: getLayoutGridLabel(r, c) });
      }
    }
    cells.sort((a, b) => a.count - b.count);
    const suggestions = cells.slice(0, 3).map(c => `${c.label}(${c.count})`);
    const box = document.getElementById('layoutCoverageSummary');
    if (box) box.innerText = `補點建議：優先 ${suggestions.join('、')}（基於${source.length >= 8 ? '高信心點' : '全點'}覆蓋）`;
    addAuditLog('放樣補點建議', suggestions.join(' / '));
    showToast(`補點建議完成：${suggestions.join('、')}`);
  }

  function startLayoutFieldSpotCheck() {
    if (!bimLayoutPoints.length) return showToast('請先產生放樣點');
    runBimLayoutConfidenceLayering(false);
    const preferred = bimLayoutPoints.filter(p => p.confidenceLevel === 'high');
    const pool = preferred.length >= 5 ? preferred : bimLayoutPoints.slice();
    const sortedPool = pool.slice().sort((a, b) => (Number(b.confidenceScore) || 0) - (Number(a.confidenceScore) || 0));
    const byGroup = new Map();
    sortedPool.forEach(p => {
      const g = p.layoutGroup || 'UNGROUPED';
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(p);
    });

    const selected = [];
    byGroup.forEach(items => {
      if (selected.length < 5 && items.length) selected.push(items[0]);
    });
    if (selected.length < 5) {
      for (const p of sortedPool) {
        if (selected.length >= 5) break;
        if (!selected.some(s => s.id === p.id)) selected.push(p);
      }
    }
    const selectedIds = new Set(selected.slice(0, 5).map(p => p.id));
    layoutSpotCheckSelection = Array.from(selectedIds);
    bimLayoutPoints = bimLayoutPoints.map(p => ({ ...p, spotCheckSelected: selectedIds.has(p.id) }));
    renderBimLayoutTable();

    const summaryItems = bimLayoutPoints
      .filter(p => p.spotCheckSelected)
      .slice(0, 5)
      .map(p => `${p.id}(${p.x},${p.y},${p.z})`);
    const box = document.getElementById('layoutSpotCheckSummary');
    if (box) box.innerText = `現場抽驗：共 ${summaryItems.length} 點｜${summaryItems.join('、')}`;
    addAuditLog('放樣現場抽驗', summaryItems.join(' / '));
    showToast(`現場抽驗已選 ${summaryItems.length} 點（優先高信心）`);
  }

  function runBimLayoutDeviationHeatmap() {
    if (!bimLayoutPoints.length) return showToast('請先產生放樣點');
    const points = bimLayoutPoints.map(p => ({ ...p }));
    const groupMap = new Map();
    points.forEach(p => {
      const g = p.layoutGroup || 'UNGROUPED';
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g).push(p);
    });
    const groupMeanZ = {};
    groupMap.forEach((items, group) => {
      const mean = items.reduce((sum, it) => sum + (Number(it.z) || 0), 0) / Math.max(1, items.length);
      groupMeanZ[group] = mean;
    });

    const nearestDistances = [];
    const localNearest = new Array(points.length).fill(Infinity);
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const dx = points[i].x - points[j].x;
        const dy = points[i].y - points[j].y;
        const dz = points[i].z - points[j].z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < localNearest[i]) localNearest[i] = d;
        if (d < localNearest[j]) localNearest[j] = d;
      }
    }
    localNearest.forEach(d => { if (Number.isFinite(d) && d < Infinity) nearestDistances.push(d); });
    const sorted = nearestDistances.slice().sort((a, b) => a - b);
    const medianSpacing = sorted.length ? sorted[Math.floor((sorted.length - 1) * 0.5)] : 1;

    let red = 0;
    let yellow = 0;
    let green = 0;
    points.forEach((p, idx) => {
      const nearest = Number.isFinite(localNearest[idx]) ? localNearest[idx] : medianSpacing;
      const spacingDrift = Math.abs(nearest - medianSpacing) / Math.max(0.001, medianSpacing);
      const g = p.layoutGroup || 'UNGROUPED';
      const zDrift = Math.abs((Number(p.z) || 0) - (groupMeanZ[g] || 0));
      const score = Math.max(0, Math.min(100, Math.round(spacingDrift * 95 + zDrift * 24)));
      p.deviationScore = score;
      if (score > 55) red += 1;
      else if (score > 25) yellow += 1;
      else green += 1;
    });
    bimLayoutPoints = points;
    const heatBox = document.getElementById('layoutHeatmapSummary');
    if (heatBox) {
      heatBox.innerText = `偏差熱圖：🔴 ${red} / 🟡 ${yellow} / 🟢 ${green}（中位點距 ${medianSpacing.toFixed(3)}）`;
    }
    renderBimLayoutTable();
    addAuditLog('放樣偏差熱圖', `紅${red} 黃${yellow} 綠${green}`);
    showToast(`偏差熱圖完成：紅 ${red}、黃 ${yellow}、綠 ${green}`);
  }

  function runBimLayoutStabilityRetest() {
    if (!bimModelData || !Array.isArray(bimModelData.elements) || !bimModelData.elements.length) {
      return showToast('請先上傳模型檔，再執行穩定度重測');
    }
    const selection = getLayoutTypeSelection();
    const runSets = [];
    for (let i = 0; i < STAKING_STABILITY_RETEST_RUNS; i += 1) {
      const jitter = i === 0 ? 0 : 0.012; // 12mm deterministic perturbation for repeatability stress
      const points = buildLayoutPointsSnapshot(selection, i, jitter);
      if (!points.length) return showToast('目前勾選類型沒有可重測的放樣點');
      runSets.push(points);
    }
    const result = analyzeLayoutStabilityRuns(runSets, STAKING_STABILITY_DRIFT_THRESHOLD_M);
    if (!bimLayoutPoints.length) {
      bimLayoutPoints = runSets[0];
    } else if (!bimLayoutPoints.some(p => p.layoutGroup)) {
      bimLayoutPoints = assignLayoutGroups(bimLayoutPoints).points;
    }
    bimLayoutPoints = bimLayoutPoints.map(p => {
      const drift = Number(result.keyDriftMap.get(layoutPointKey(p)) || 0);
      const unstable = drift > STAKING_STABILITY_DRIFT_THRESHOLD_M;
      return {
        ...p,
        stabilityMaxDrift: Math.round(drift * 1000) / 1000,
        stabilityFlag: unstable ? 'unstable' : 'stable'
      };
    });
    const stabilityBox = document.getElementById('layoutStabilitySummary');
    if (stabilityBox) {
      const groupText = result.unstableGroups.length
        ? `｜不穩定群組 ${result.unstableGroups.slice(0, 4).join('、')}${result.unstableGroups.length > 4 ? '...' : ''}`
        : '｜群組穩定';
      stabilityBox.innerText = `穩定度重測：${STAKING_STABILITY_RETEST_RUNS} 輪｜平均漂移 ${(result.meanDrift * 1000).toFixed(1)}mm｜峰值 ${(result.maxDrift * 1000).toFixed(1)}mm｜超門檻 ${result.unstableCount} 點${groupText}`;
      stabilityBox.style.color = result.unstableCount > 0 ? '#ffb5b5' : '#9ef5c2';
    }
    renderBimLayoutTable();
    addAuditLog('放樣穩定度重測', `輪次 ${STAKING_STABILITY_RETEST_RUNS} / 超門檻 ${result.unstableCount} 點 / 峰值 ${(result.maxDrift * 1000).toFixed(1)}mm`);
    showToast(`穩定度重測完成：超門檻 ${result.unstableCount} 點，峰值 ${(result.maxDrift * 1000).toFixed(1)}mm`);
  }

  global.getLayoutTypeSelection = getLayoutTypeSelection;
  global.isLayoutTargetType = isLayoutTargetType;
  global.makeSeededValue = makeSeededValue;
  global.toPointRow = toPointRow;
  global.makeSeededOffset = makeSeededOffset;
  global.buildLayoutPointsSnapshot = buildLayoutPointsSnapshot;
  global.layoutPointKey = layoutPointKey;
  global.analyzeLayoutStabilityRuns = analyzeLayoutStabilityRuns;
  global.renderBimLayoutTable = renderBimLayoutTable;
  global.classifyLayoutPointConfidence = classifyLayoutPointConfidence;
  global.runBimLayoutConfidenceLayering = runBimLayoutConfidenceLayering;
  global.showAllBimLayoutPoints = showAllBimLayoutPoints;
  global.renderLayoutConfidenceSummary = renderLayoutConfidenceSummary;
  global.getLayoutGridLabel = getLayoutGridLabel;
  global.suggestLayoutControlPointsCoverage = suggestLayoutControlPointsCoverage;
  global.startLayoutFieldSpotCheck = startLayoutFieldSpotCheck;
  global.runBimLayoutDeviationHeatmap = runBimLayoutDeviationHeatmap;
  global.runBimLayoutStabilityRetest = runBimLayoutStabilityRetest;
})(window);
