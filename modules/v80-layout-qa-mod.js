// BIM layout generation and QA entry module (v8.0).
(function attachV80LayoutQaModule(global) {
  const LAYOUT_QA_PROFILE_KEY = 'bm_69:layout_qa_profile';

  function getLayoutQaProfile() {
    const profile = String(localStorage.getItem(LAYOUT_QA_PROFILE_KEY) || 'enterprise').toLowerCase();
    return profile === 'standard' ? 'standard' : 'enterprise';
  }

  function getLayoutQaProfileConfig(profile) {
    const p = profile || getLayoutQaProfile();
    if (p === 'standard') {
      return {
        profile: 'standard',
        minScore: 85,
        maxDuplicate: 1,
        maxMissing: 0,
        maxOutOfRange: 0,
        minSpacingStability: 65,
        minGroupStability: 70
      };
    }
    return {
      profile: 'enterprise',
      minScore: 92,
      maxDuplicate: 0,
      maxMissing: 0,
      maxOutOfRange: 0,
      minSpacingStability: 75,
      minGroupStability: 80
    };
  }

  function buildEnterpriseQaAssessment(qaResult) {
    const cfg = getLayoutQaProfileConfig();
    const qa = qaResult || {};
    const blockers = [];
    if (Number(qa.qaScore || 0) < cfg.minScore) blockers.push(`QA分數低於門檻 ${cfg.minScore}`);
    if (Number(qa.duplicatePointCount || 0) > cfg.maxDuplicate) blockers.push(`重複點超標（${qa.duplicatePointCount}）`);
    if (Number(qa.missingGeometryCount || 0) > cfg.maxMissing) blockers.push(`缺漏幾何超標（${qa.missingGeometryCount}）`);
    if (Number(qa.outOfRangeCount || 0) > cfg.maxOutOfRange) blockers.push(`越界點超標（${qa.outOfRangeCount}）`);
    if (Number(qa.spacingStabilityScore || 0) < cfg.minSpacingStability) blockers.push(`點距穩定度不足（${qa.spacingStabilityScore}）`);
    if (Number(qa.groupStabilityScore || 0) < cfg.minGroupStability) blockers.push(`分群穩定度不足（${qa.groupStabilityScore}）`);
    const pass = blockers.length === 0;
    return {
      profile: cfg.profile,
      gate: cfg,
      pass,
      blockers,
      reviewedAt: new Date().toISOString()
    };
  }

  function renderLayoutQaProfileSummary() {
    const box = document.getElementById('layoutQaProfileSummary');
    const select = document.getElementById('layoutQaProfileSelect');
    const cfg = getLayoutQaProfileConfig();
    if (select) select.value = cfg.profile;
    if (!box) return;
    box.innerText = `企業 QA 設定：${cfg.profile === 'enterprise' ? '企業級（嚴格）' : '標準版'}｜門檻 分數>=${cfg.minScore}、重複<=${cfg.maxDuplicate}、缺漏<=${cfg.maxMissing}、越界<=${cfg.maxOutOfRange}、點距>=${cfg.minSpacingStability}、分群>=${cfg.minGroupStability}`;
  }

  function renderEnterpriseQaStatus(assessment, qaResult) {
    const box = document.getElementById('layoutQaEnterpriseStatus');
    if (!box) return;
    if (!assessment || !qaResult) {
      box.innerText = '審核狀態：尚未執行';
      box.style.color = '#ffd8b0';
      return;
    }
    if (assessment.pass) {
      box.innerText = `審核狀態：✅ 通過（${assessment.profile}）｜分數 ${qaResult.qaScore}｜可進入施工包流程`;
      box.style.color = '#9ef5c2';
      return;
    }
    box.innerText = `審核狀態：❌ 未通過（${assessment.profile}）｜${assessment.blockers.slice(0, 4).join(' / ')}`;
    box.style.color = '#ffb5b5';
  }

  function setLayoutQaProfile(profile) {
    const p = String(profile || 'enterprise').toLowerCase();
    const normalized = p === 'standard' ? 'standard' : 'enterprise';
    localStorage.setItem(LAYOUT_QA_PROFILE_KEY, normalized);
    renderLayoutQaProfileSummary();
    if (bimLayoutQaResult) {
      const assessment = buildEnterpriseQaAssessment(bimLayoutQaResult);
      bimLayoutQaResult.enterprise = assessment;
      renderEnterpriseQaStatus(assessment, bimLayoutQaResult);
    } else {
      renderEnterpriseQaStatus(null, null);
    }
    showToast(`已切換 QA 模式：${normalized === 'enterprise' ? '企業級（嚴格）' : '標準版'}`);
  }

  function renderBimLayoutQaSummary() {
    const box = document.getElementById('bimLayoutQaSummary');
    if (!box) return;
    const alignBox = document.getElementById('layoutAlignmentSummary');
    if (!bimLayoutQaResult) {
      box.innerText = '放樣 QA：尚未執行';
      if (alignBox) {
        alignBox.innerText = formatLayoutAlignmentSummary(layoutAlignmentState);
      }
      renderLayoutQaProfileSummary();
      renderEnterpriseQaStatus(null, null);
      updateQaDashboard();
      return;
    }
    const level = getQaLevelByScore(bimLayoutQaResult.qaScore);
    box.innerText = `放樣 QA：等級 ${level}（${bimLayoutQaResult.qaScore} / 100），重複 ${bimLayoutQaResult.duplicatePointCount}，缺漏 ${bimLayoutQaResult.missingGeometryCount}，越界 ${bimLayoutQaResult.outOfRangeCount}，點距穩定度 ${bimLayoutQaResult.spacingStabilityScore || 0}，分群穩定度 ${bimLayoutQaResult.groupStabilityScore || 0}（${bimLayoutQaResult.groupCount || 0} 組），高精度修正 ${bimLayoutPrecisionPass} 次，核心自進 ${quantumStakeAutoRuns} 次`;
    if (alignBox) {
      alignBox.innerText = formatLayoutAlignmentSummary(layoutAlignmentState);
    }
    renderLayoutQaProfileSummary();
    renderEnterpriseQaStatus(bimLayoutQaResult.enterprise, bimLayoutQaResult);
    updateQaDashboard();
  }

  function generateBimLayoutPoints() {
    if (!bimModelData || !Array.isArray(bimModelData.elements) || !bimModelData.elements.length) {
      return showToast('請先上傳模型檔');
    }
    const sel = getLayoutTypeSelection();
    const targets = bimModelData.elements.filter(el => isLayoutTargetType(el.type, sel));
    if (!targets.length) return showToast('目前勾選類型沒有可抽取的構件');

    const points = [];
    targets.forEach((el, idx) => {
      const baseX = makeSeededValue(el.id, 1, 0, 120);
      const baseY = makeSeededValue(el.id, 2, 0, 120);
      const baseZ = makeSeededValue(el.id, 3, 0, 30);
      if (el.type.includes('IFCCOLUMN')) {
        points.push(toPointRow(el, 'CENTER', baseX, baseY, baseZ, points.length));
        return;
      }
      if (el.type.includes('IFCWALL') || el.type.includes('IFCBEAM')) {
        const offset = el.type.includes('IFCBEAM') ? 1.8 : 2.4;
        points.push(toPointRow(el, 'END_A', baseX - offset, baseY - 0.8, baseZ, points.length));
        points.push(toPointRow(el, 'END_B', baseX + offset, baseY + 0.8, baseZ, points.length));
      }
    });

    const seededPoints = points.slice(0, 1200);
    const grouped = assignLayoutGroups(seededPoints);
    bimLayoutPoints = grouped.points;
    layoutAlignmentState = null;
    layoutConfidenceFilterMode = 'all';
    bimLayoutQaResult = null;
    const heatBox = document.getElementById('layoutHeatmapSummary');
    if (heatBox) heatBox.innerText = '偏差熱圖：尚未分析';
    const confBox = document.getElementById('layoutConfidenceSummary');
    if (confBox) confBox.innerText = '置信度分層：尚未分析';
    const stabilityBox = document.getElementById('layoutStabilitySummary');
    if (stabilityBox) {
      stabilityBox.innerText = '穩定度重測：尚未執行';
      stabilityBox.style.color = '#ffcdcd';
    }
    const coverageBox = document.getElementById('layoutCoverageSummary');
    if (coverageBox) coverageBox.innerText = '補點建議：尚未分析';
    const spotBox = document.getElementById('layoutSpotCheckSummary');
    if (spotBox) spotBox.innerText = '現場抽驗：尚未抽驗';
    layoutSpotCheckSelection = [];
    renderBimLayoutTable();
    renderBimLayoutQaSummary();
    addAuditLog('生成放樣點', `${bimLayoutPoints.length} 筆`);
    showToast(`已生成放樣點 ${bimLayoutPoints.length} 筆（${grouped.groupCount} 組）`);
  }

  function runBimLayoutQa() {
    if (!bimLayoutPoints.length) return showToast('請先產生放樣點');
    const highPrecisionToggle = document.getElementById('layoutHighPrecisionToggle');
    const precisionEnabled = !(highPrecisionToggle && !highPrecisionToggle.checked);
    const keySet = new Set();
    let duplicatePointCount = 0;
    let missingGeometryCount = 0;
    let outOfRangeCount = 0;
    let maxDeviation = 0;
    const validPoints = [];
    bimLayoutPoints.forEach(p => {
      const valid = [p.x, p.y, p.z].every(Number.isFinite);
      if (!valid) {
        missingGeometryCount += 1;
        return;
      }
      validPoints.push(p);
      const key = `${p.x.toFixed(2)}|${p.y.toFixed(2)}|${p.z.toFixed(2)}`;
      if (keySet.has(key)) duplicatePointCount += 1;
      else keySet.add(key);
      if (Math.abs(p.x) > 10000 || Math.abs(p.y) > 10000 || Math.abs(p.z) > 10000) outOfRangeCount += 1;
      maxDeviation = Math.max(maxDeviation, Math.abs(p.z));
    });
    const nearestDistances = [];
    for (let i = 0; i < validPoints.length; i += 1) {
      let nearest = Infinity;
      for (let j = 0; j < validPoints.length; j += 1) {
        if (i === j) continue;
        const dx = validPoints[i].x - validPoints[j].x;
        const dy = validPoints[i].y - validPoints[j].y;
        const dz = validPoints[i].z - validPoints[j].z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < nearest) nearest = d;
      }
      if (Number.isFinite(nearest) && nearest < Infinity) nearestDistances.push(nearest);
    }
    const meanDist = nearestDistances.length ? (nearestDistances.reduce((a, b) => a + b, 0) / nearestDistances.length) : 0;
    const varianceDist = nearestDistances.length
      ? (nearestDistances.reduce((acc, d) => {
        const diff = d - meanDist;
        return acc + diff * diff;
      }, 0) / nearestDistances.length)
      : 0;
    const stdDist = Math.sqrt(varianceDist);
    const cv = meanDist > 0 ? (stdDist / meanDist) : 1;
    const spacingStabilityScore = Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
    const groupStats = evaluateGroupStability(validPoints);

    const penalty = duplicatePointCount * 2
      + missingGeometryCount * 5
      + outOfRangeCount * 3
      + Math.max(0, 70 - spacingStabilityScore)
      + Math.max(0, 75 - groupStats.groupStabilityScore);
    const qaScore = Math.max(0, 100 - penalty);
    bimLayoutQaResult = {
      duplicatePointCount,
      missingGeometryCount,
      outOfRangeCount,
      maxDeviation: Math.round(maxDeviation * 1000) / 1000,
      spacingStabilityScore,
      groupStabilityScore: groupStats.groupStabilityScore,
      groupCount: groupStats.groupCount,
      precisionEnabled,
      qaScore,
      checkedAt: new Date().toISOString()
    };
    bimLayoutQaResult.enterprise = buildEnterpriseQaAssessment(bimLayoutQaResult);
    renderBimLayoutQaSummary();
    const qaLevel = getQaLevelByScore(qaScore);
    addAuditLog('放樣QA檢核', `等級 ${qaLevel} / 分數 ${qaScore} / 100`);
    showToast(`放樣 QA 完成：${qaLevel}（${qaScore} 分，群組穩定度 ${groupStats.groupStabilityScore}）`);
  }

  function runEnterpriseLayoutQaReview() {
    runBimLayoutQa();
    if (!bimLayoutQaResult || !bimLayoutQaResult.enterprise) return;
    const assessment = bimLayoutQaResult.enterprise;
    if (assessment.pass) {
      addAuditLog('企業QA審核', `通過 / 模式 ${assessment.profile} / 分數 ${bimLayoutQaResult.qaScore}`);
      showToast(`企業 QA 審核通過（${assessment.profile}）`);
      return;
    }
    addAuditLog('企業QA審核', `未通過 / ${assessment.blockers.join('；')}`);
    showToast(`企業 QA 未通過：${assessment.blockers[0] || '請查看審核狀態'}`);
  }

  global.renderBimLayoutQaSummary = renderBimLayoutQaSummary;
  global.generateBimLayoutPoints = generateBimLayoutPoints;
  global.runBimLayoutQa = runBimLayoutQa;
  global.getLayoutQaProfile = getLayoutQaProfile;
  global.getLayoutQaProfileConfig = getLayoutQaProfileConfig;
  global.buildEnterpriseQaAssessment = buildEnterpriseQaAssessment;
  global.renderLayoutQaProfileSummary = renderLayoutQaProfileSummary;
  global.renderEnterpriseQaStatus = renderEnterpriseQaStatus;
  global.setLayoutQaProfile = setLayoutQaProfile;
  global.runEnterpriseLayoutQaReview = runEnterpriseLayoutQaReview;
})(window);
