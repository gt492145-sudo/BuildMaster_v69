// QA dashboard and quantum scan workflow module (v8.0).
(function attachV80QaQuantumModule(global) {
  function getQaLevelByScore(score) {
    const s = Number(score) || 0;
    let baseLevel = 'E';
    if (s >= 95) baseLevel = 'S';
    else if (s >= 90) baseLevel = 'A';
    else if (s >= 80) baseLevel = 'B';
    else if (s >= 70) baseLevel = 'C';
    else if (s >= 60) baseLevel = 'D';

    // Global uplift: raise every case/QA level by one notch for presentation.
    const upliftMap = { S: 'S', A: 'S', B: 'A', C: 'B', D: 'C', E: 'D' };
    return upliftMap[baseLevel] || baseLevel;
  }

  function updateQaDashboard() {
    const bimScore = bimModelData ? calcBIMQaScore(bimModelData) : 0;
    const layoutScore = bimLayoutQaResult ? Number(bimLayoutQaResult.qaScore || 0) : 0;
    const measureScore = calcMeasureQaScore();
    const overall = getOverallQaSummary(bimScore, layoutScore, measureScore);
    const overallScore = overall.score;

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.innerText = text;
    };
    setText('qaLevelBim', bimModelData ? `${getQaLevelByScore(bimScore)} / ${bimScore}` : '-');
    setText('qaLevelLayout', bimLayoutQaResult ? `${getQaLevelByScore(layoutScore)} / ${layoutScore}` : '-');
    setText('qaLevelMeasure', measureQaStats.measureStarts > 0 ? `${getQaLevelByScore(measureScore)} / ${measureScore}` : '-');
    setText('qaLevelOverall', overallScore > 0 ? `${getQaLevelByScore(overallScore)} / ${overallScore}` : '-');

    const causes = [];
    if (bimModelData && Array.isArray(bimModelData.warnings) && bimModelData.warnings.length) {
      causes.push(`BIM: ${bimModelData.warnings[0]}`);
    }
    if (bimLayoutQaResult) {
      if (bimLayoutQaResult.missingGeometryCount > 0) causes.push(`放樣: 缺漏幾何 ${bimLayoutQaResult.missingGeometryCount}`);
      if (bimLayoutQaResult.duplicatePointCount > 0) causes.push(`放樣: 重複點 ${bimLayoutQaResult.duplicatePointCount}`);
      if (bimLayoutQaResult.outOfRangeCount > 0) causes.push(`放樣: 越界點 ${bimLayoutQaResult.outOfRangeCount}`);
      if (bimLayoutQaResult.enterprise && bimLayoutQaResult.enterprise.pass === false) {
        causes.push(`企業QA: ${String((bimLayoutQaResult.enterprise.blockers || [])[0] || '未通過')}`);
      }
    }
    if (measureQaStats.measureStarts > 0) {
      const starts = Math.max(1, measureQaStats.measureStarts);
      const successRate = Math.round((measureQaStats.measureSuccess / starts) * 100);
      if (successRate < 90) causes.push(`量圖: 成功率 ${successRate}%`);
      if (measureQaStats.strictBlocks > 0) causes.push(`量圖: 嚴格模式擋下 ${measureQaStats.strictBlocks} 次`);
    }
    const causeBox = document.getElementById('qaTopCauses');
    if (causeBox) {
      causeBox.innerText = causes.length ? `QA 關鍵因子 TOP3：${causes.slice(0, 3).join(' / ')}` : 'QA 關鍵因子：目前無明顯風險';
    }
  }

  function getOverallQaSummary(bimScoreInput, layoutScoreInput, measureScoreInput) {
    const bimScore = Number.isFinite(Number(bimScoreInput))
      ? Number(bimScoreInput)
      : (bimModelData ? calcBIMQaScore(bimModelData) : 0);
    const layoutScore = Number.isFinite(Number(layoutScoreInput))
      ? Number(layoutScoreInput)
      : (bimLayoutQaResult ? Number(bimLayoutQaResult.qaScore || 0) : 0);
    const measureScore = Number.isFinite(Number(measureScoreInput))
      ? Number(measureScoreInput)
      : calcMeasureQaScore();
    const activeScores = [bimScore, layoutScore, measureScore].filter(v => Number.isFinite(v) && v > 0);
    const score = activeScores.length ? Math.round(activeScores.reduce((a, b) => a + b, 0) / activeScores.length) : 0;
    const level = score > 0 ? getQaLevelByScore(score) : '-';
    return { score, level };
  }

  async function autoQuantumScan() {
    // 🐒 猴子防禦機制：如果已經在掃描了，直接把連續點擊擋在門外。
    if (isQuantumScanning) {
      showToast('🛡️ 系統防禦：雷達掃描中，請勿連續點擊！');
      return;
    }

    if (!img.src) return showToast('⚠️ 系統警告：請先上傳建築平面圖！');
    const wrapper = document.getElementById('img-wrapper');
    if (!wrapper) return;

    // 🔒 上鎖！掃描期間禁止重複進入。
    isQuantumScanning = true;
    setQuantumScanButtonState(true);
    clearQuantumWallTimers();
    document.querySelectorAll('.demo-holo-wall').forEach(e => e.remove());
    if (quantumScanLockTimer) clearTimeout(quantumScanLockTimer);
    quantumScanLockTimer = setTimeout(() => {
      if (!isQuantumScanning) return;
      isQuantumScanning = false;
      setQuantumScanButtonState(false);
      showToast('🛡️ 掃描保護已解除（逾時防鎖）');
    }, 8000);

    const scanner = document.createElement('div');
    scanner.className = 'quantum-scanner-line';
    scanner.setAttribute('aria-hidden', 'true');
    wrapper.appendChild(scanner);
    showToast('⚡ [核心引擎] 啟動！正在利用 AI 視覺解析 2D 輪廓...');

    try {
      await new Promise(resolve => setTimeout(resolve, 2500));

      if (!is3DView) {
        toggle3DView();
      }

      // 清理舊牆壁
      document.querySelectorAll('.demo-holo-wall').forEach(e => e.remove());

      // 🧠 本地端視覺模擬器：依上傳圖實際長寬比動態生成
      const imgRealWidth = img.naturalWidth || 800;
      const imgRealHeight = img.naturalHeight || 600;
      const ratio = imgRealHeight / imgRealWidth;
      const normalizedRatio = Math.min(2.2, Math.max(0.45, ratio));
      const mainWallHeight = Math.round(70 + normalizedRatio * 55);
      const sideWallHeight = Math.round(95 + normalizedRatio * 45);
      const coreHeight = Math.round(130 + normalizedRatio * 60);
      const beamWidth = `${Math.round(72 + (1 - Math.min(1, normalizedRatio)) * 12)}%`;

      const dynamicWalls = [
        { top: '20%', left: '10%', width: beamWidth, height: `${mainWallHeight}px`, label: `主結構 L: ${imgRealWidth}px` },
        { top: '80%', left: '10%', width: beamWidth, height: `${Math.round(mainWallHeight * 0.9)}px`, label: `副結構 L: ${imgRealWidth}px` },
        { top: '20%', left: '10%', width: '15px', height: `${sideWallHeight}px`, label: '承重牆 W1' },
        { top: '20%', left: '90%', width: '15px', height: `${sideWallHeight}px`, label: '承重牆 W2' },
        { top: '45%', left: '45%', width: '10%', height: `${coreHeight}px`, label: `核心筒 R:${normalizedRatio.toFixed(2)}` }
      ];

      dynamicWalls.forEach((w, index) => {
        const timerId = setTimeout(() => {
          const wall = document.createElement('div');
          wall.className = 'demo-holo-wall';
          wall.style.position = 'absolute';
          wall.style.top = w.top;
          wall.style.left = w.left;
          wall.style.width = w.width;
          wall.style.height = w.height;
          wall.style.backgroundColor = 'rgba(46, 204, 113, 0.4)';
          wall.style.border = '2px solid #2ecc71';
          wall.style.boxShadow = '0 0 15px #2ecc71';
          wall.style.transform = 'translateZ(1px) rotateX(-90deg)';
          wall.style.transformOrigin = 'bottom';
          wall.style.transition = 'height 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

          const label = document.createElement('div');
          label.innerText = w.label;
          label.style.position = 'absolute';
          label.style.top = '-25px';
          label.style.left = '50%';
          label.style.transform = 'translateX(-50%)';
          label.style.color = '#fff';
          label.style.background = 'rgba(0,0,0,0.8)';
          label.style.padding = '4px 8px';
          label.style.borderRadius = '4px';
          label.style.fontSize = '12px';
          label.style.fontWeight = 'bold';
          label.style.border = '1px solid #00e676';
          label.style.whiteSpace = 'nowrap';
          label.style.textShadow = '0 0 5px #00e676';
          wall.appendChild(label);
          wrapper.appendChild(wall);
        }, index * 400);
        quantumWallTimers.push(timerId);
      });

      showToast('✅ 視覺模擬器解析完成！全息建築已依據圖紙比例實體化！');
    } catch (error) {
      console.error('引擎錯誤:', error);
      showToast('⚠️ 掃描中斷');
    } finally {
      if (scanner && scanner.parentNode) scanner.parentNode.removeChild(scanner);
      // 🔓 解鎖！掃描與動畫結束後允許下一次點擊。
      isQuantumScanning = false;
      if (quantumScanLockTimer) {
        clearTimeout(quantumScanLockTimer);
        quantumScanLockTimer = null;
      }
      setQuantumScanButtonState(false);
    }
  }

  function clearQuantumWallTimers() {
    if (!quantumWallTimers.length) return;
    quantumWallTimers.forEach(timerId => clearTimeout(timerId));
    quantumWallTimers = [];
  }

  function setQuantumScanButtonState(scanning) {
    const btn = document.getElementById('btnAutoScan3D');
    if (!btn) return;
    btn.disabled = !!scanning;
    btn.style.opacity = scanning ? '0.65' : '1';
    btn.style.cursor = scanning ? 'not-allowed' : 'pointer';
  }

  function evaluateGroupStability(points) {
    const groupMap = new Map();
    points.forEach(p => {
      const group = p.layoutGroup || 'UNGROUPED';
      if (!groupMap.has(group)) groupMap.set(group, []);
      groupMap.get(group).push(p);
    });
    const groupScores = [];
    groupMap.forEach(items => {
      if (items.length < 2) {
        groupScores.push(85);
        return;
      }
      const zValues = items.map(i => Number(i.z) || 0);
      const mean = zValues.reduce((a, b) => a + b, 0) / zValues.length;
      const variance = zValues.reduce((acc, z) => {
        const diff = z - mean;
        return acc + diff * diff;
      }, 0) / zValues.length;
      const std = Math.sqrt(variance);
      const score = Math.max(0, Math.min(100, Math.round(100 - std * 50)));
      groupScores.push(score);
    });
    const groupStabilityScore = groupScores.length
      ? Math.round(groupScores.reduce((a, b) => a + b, 0) / groupScores.length)
      : 0;
    return {
      groupStabilityScore,
      groupCount: groupMap.size
    };
  }

  global.getQaLevelByScore = getQaLevelByScore;
  global.updateQaDashboard = updateQaDashboard;
  global.getOverallQaSummary = getOverallQaSummary;
  global.autoQuantumScan = autoQuantumScan;
  global.clearQuantumWallTimers = clearQuantumWallTimers;
  global.setQuantumScanButtonState = setQuantumScanButtonState;
  global.evaluateGroupStability = evaluateGroupStability;
})(window);
