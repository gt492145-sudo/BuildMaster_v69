// Export/report module extracted from index.html (v8.0).
(function attachV80ExportModule(global) {
  function downloadBimCsv(filename, lines) {
    const csv = '\uFEFF' + lines.join('\n');
    triggerFileDownload(csv, filename, 'text/csv;charset=utf-8;');
  }

  function buildConstructionPackageLines(points, packageLabel, qaScore, qaLevel, exportedAtIso, qaGateScore) {
    const lines = [];
    lines.push(`# Construction Package Exported At,${exportedAtIso}`);
    lines.push(`# Package Label,${packageLabel}`);
    lines.push(`# Exported Points,${points.length}`);
    if (layoutAlignmentState) {
      lines.push(`# Alignment RMS,${Number(layoutAlignmentState.rmsError || 0).toFixed(6)}`);
      lines.push(`# Alignment Advice,${layoutAlignmentState.adviceLevel || ''}`);
    }
    if (qaScore > 0) {
      lines.push(`# QA Score,${qaScore}`);
      lines.push(`# QA Level,${qaLevel}`);
      lines.push(`# QA Gate,PASS (>=${Number(qaGateScore) || STAKING_EXPORT_QA_MIN_SCORE})`);
    }
    lines.push('point_id,source_element,source_type,point_type,x,y,z,floor,group,deviation_score,confidence_level,confidence_score,stability_flag,spot_check');
    points.forEach(p => {
      lines.push([
        sanitizeCSVField(p.id),
        sanitizeCSVField(p.sourceElementId),
        sanitizeCSVField(p.sourceType),
        sanitizeCSVField(p.pointType),
        Number(p.x) || 0,
        Number(p.y) || 0,
        Number(p.z) || 0,
        sanitizeCSVField(p.floorTag),
        sanitizeCSVField(p.layoutGroup || ''),
        Number.isFinite(Number(p.deviationScore)) ? Number(p.deviationScore) : '',
        sanitizeCSVField(p.confidenceLevel || ''),
        Number.isFinite(Number(p.confidenceScore)) ? Number(p.confidenceScore) : '',
        sanitizeCSVField(p.stabilityFlag || ''),
        p.spotCheckSelected ? 'Y' : ''
      ].join(','));
    });
    return lines;
  }

  function exportBimConstructionPackage() {
    if (!bimLayoutPoints.length) return showToast('請先產生放樣點');
    runBimLayoutConfidenceLayering(stakingConservativeMode, true);
    if (!bimLayoutQaResult) runBimLayoutQa();
    if (bimLayoutQaResult && typeof buildEnterpriseQaAssessment === 'function') {
      bimLayoutQaResult.enterprise = buildEnterpriseQaAssessment(bimLayoutQaResult);
    }
    const qaScore = bimLayoutQaResult ? Number(bimLayoutQaResult.qaScore || 0) : 0;
    const qaLevel = getQaLevelByScore(qaScore);
    const activeQaGate = getActiveStakingQaGate();
    if (qaScore < activeQaGate) {
      addAuditLog('匯出施工包阻擋', `QA ${qaScore}（${qaLevel}）未達門檻 ${activeQaGate} / 天氣模式 ${latestWeatherAdviceLevel}`);
      return showToast(`施工包已阻擋：QA ${qaScore}（${qaLevel}）未達門檻 ${activeQaGate}`);
    }
    const enterprise = bimLayoutQaResult ? bimLayoutQaResult.enterprise : null;
    if (enterprise && enterprise.profile === 'enterprise' && !enterprise.pass) {
      addAuditLog('匯出施工包阻擋', `企業QA未通過 / ${enterprise.blockers.join('；')}`);
      return showToast(`施工包已阻擋：企業QA未通過（${enterprise.blockers[0] || '請查看審核狀態'}）`);
    }
    const safeHigh = bimLayoutPoints.filter(p => p.confidenceLevel === 'high' && p.stabilityFlag !== 'unstable');
    const safeMedium = bimLayoutPoints.filter(p => p.confidenceLevel === 'medium' && p.stabilityFlag !== 'unstable');
    const blocked = bimLayoutPoints.filter(p => p.stabilityFlag === 'unstable' || p.confidenceLevel === 'low');
    const exportedAtIso = new Date().toISOString();
    const ts = Date.now();
    downloadBimCsv(
      `ConstructionMaster_施工放樣包_高信心_${ts}.csv`,
      buildConstructionPackageLines(safeHigh, `HIGH_CONFIDENCE｜WEATHER_${latestWeatherAdviceLevel}`, qaScore, qaLevel, exportedAtIso, activeQaGate)
    );
    downloadBimCsv(
      `ConstructionMaster_施工放樣包_中信心_需複核_${ts}.csv`,
      buildConstructionPackageLines(safeMedium, `MEDIUM_REVIEW｜WEATHER_${latestWeatherAdviceLevel}`, qaScore, qaLevel, exportedAtIso, activeQaGate)
    );
    downloadBimCsv(
      `ConstructionMaster_施工放樣包_禁止施工_${ts}.csv`,
      buildConstructionPackageLines(blocked, `BLOCKED_DO_NOT_BUILD｜WEATHER_${latestWeatherAdviceLevel}`, qaScore, qaLevel, exportedAtIso, activeQaGate)
    );
    addAuditLog('匯出施工包', `高 ${safeHigh.length} / 中 ${safeMedium.length} / 禁 ${blocked.length} / 總 ${bimLayoutPoints.length}`);
    showToast(`施工包已分級匯出：高 ${safeHigh.length}｜中 ${safeMedium.length}｜禁 ${blocked.length}`);
  }

  function exportBimLayoutPoints() {
    if (!bimLayoutPoints.length) return showToast('請先產生放樣點');
    let coordMode = 'twd97';
    if (typeof getStakeToolkitSettings === 'function') {
      const settings = getStakeToolkitSettings() || {};
      coordMode = settings.coordMode || 'twd97';
    }
    const hasDual = coordMode === 'dual';
    const has67 = coordMode === 'twd67' || coordMode === 'dual';
    let csv = '\uFEFF點位ID,來源構件,構件類型,點位類型,E(TWD97),N(TWD97)';
    if (has67) csv += ',E(TWD67),N(TWD67)';
    if (hasDual) csv += ',顯示座標系統';
    csv += ',H,樓層,群組,狀態\n';
    bimLayoutPoints.forEach(p => {
      const e97 = Number(p.x) || 0;
      const n97 = Number(p.y) || 0;
      const z = Number(p.z) || 0;
      const eText = typeof formatStakeCoordValue === 'function' ? formatStakeCoordValue(e97, 'E') : String(e97);
      const nText = typeof formatStakeCoordValue === 'function' ? formatStakeCoordValue(n97, 'N') : String(n97);
      let e67Text = '';
      let n67Text = '';
      if (has67 && typeof twd97ToTwd67 === 'function') {
        const p67 = twd97ToTwd67(e97, n97);
        e67Text = typeof formatStakeCoordValue === 'function' ? formatStakeCoordValue(p67.e, 'E') : String(p67.e);
        n67Text = typeof formatStakeCoordValue === 'function' ? formatStakeCoordValue(p67.n, 'N') : String(p67.n);
      }
      const hText = typeof formatStakeCoordValue === 'function' ? formatStakeCoordValue(z, 'H') : String(z);
      csv += [
        sanitizeCSVField(p.id),
        sanitizeCSVField(p.sourceElementId),
        sanitizeCSVField(p.sourceType),
        sanitizeCSVField(p.pointType),
        eText,
        nText,
        ...(has67 ? [e67Text, n67Text] : []),
        ...(hasDual ? ['DUAL'] : []),
        hText,
        sanitizeCSVField(p.floorTag),
        sanitizeCSVField(p.layoutGroup || ''),
        sanitizeCSVField(p.status)
      ].join(',') + '\n';
    });
    triggerFileDownload(
      csv,
      `ConstructionMaster_BIM放樣點_${new Date().getTime()}.csv`,
      'text/csv;charset=utf-8;'
    );
    addAuditLog('匯出放樣點', `${bimLayoutPoints.length} 筆`);
    showToast('放樣點 CSV 已匯出');
  }

  function exportBimLayoutQaReport() {
    if (!bimLayoutPoints.length) return showToast('請先產生放樣點');
    if (!bimLayoutQaResult) runBimLayoutQa();
    const qa = bimLayoutQaResult || {};
    const projectName = getCurrentProjectName();
    const qaLevel = getQaLevelByScore(qa.qaScore || 0);
    const rows = [
      ['報告時間', new Date().toLocaleString('zh-TW')],
      ['專案名稱', projectName],
      ['模型檔名', bimModelData && bimModelData.fileName ? bimModelData.fileName : '未載入'],
      ['點位總數', String(bimLayoutPoints.length)],
      ['重複點', String(qa.duplicatePointCount || 0)],
      ['缺漏幾何', String(qa.missingGeometryCount || 0)],
      ['越界點', String(qa.outOfRangeCount || 0)],
      ['最大偏差', String(qa.maxDeviation || 0)],
      ['點距穩定度', String(qa.spacingStabilityScore || 0)],
      ['分群穩定度', String(qa.groupStabilityScore || 0)],
      ['分群數', String(qa.groupCount || 0)],
      ['QA分數', String(qa.qaScore || 0)],
      ['QA等級', qaLevel],
      ['QA設定檔', qa.enterprise && qa.enterprise.profile ? qa.enterprise.profile : (typeof getLayoutQaProfile === 'function' ? getLayoutQaProfile() : 'unknown')],
      ['企業QA審核', qa.enterprise ? (qa.enterprise.pass ? 'PASS' : 'BLOCKED') : '未執行'],
      ['企業QA阻擋原因', qa.enterprise && Array.isArray(qa.enterprise.blockers) && qa.enterprise.blockers.length ? qa.enterprise.blockers.join('；') : '']
    ];
    const csv = buildKeyValueCsv(rows);
    triggerFileDownload(
      csv,
      `ConstructionMaster_BIM放樣QA_${new Date().getTime()}.csv`,
      'text/csv;charset=utf-8;'
    );
    addAuditLog('匯出放樣QA', `等級 ${qaLevel} / 分數 ${qa.qaScore || 0}`);
    showToast('放樣 QA 報告已匯出');
  }

  function exportBimLayoutEnterpriseQaReport() {
    if (!bimLayoutPoints.length) return showToast('請先產生放樣點');
    if (!bimLayoutQaResult) runBimLayoutQa();
    const qa = bimLayoutQaResult || {};
    const enterprise = typeof buildEnterpriseQaAssessment === 'function'
      ? buildEnterpriseQaAssessment(qa)
      : (qa.enterprise || null);
    if (enterprise) qa.enterprise = enterprise;
    const projectName = getCurrentProjectName();
    const qaLevel = getQaLevelByScore(qa.qaScore || 0);
    const gate = enterprise && enterprise.gate ? enterprise.gate : {};
    const rows = [
      ['報告時間', new Date().toLocaleString('zh-TW')],
      ['專案名稱', projectName],
      ['模型檔名', bimModelData && bimModelData.fileName ? bimModelData.fileName : '未載入'],
      ['QA設定檔', enterprise && enterprise.profile ? enterprise.profile : 'unknown'],
      ['企業審核結果', enterprise ? (enterprise.pass ? 'PASS' : 'BLOCKED') : '未執行'],
      ['企業阻擋原因', enterprise && enterprise.blockers && enterprise.blockers.length ? enterprise.blockers.join('；') : ''],
      ['點位總數', String(bimLayoutPoints.length)],
      ['QA分數', String(qa.qaScore || 0)],
      ['QA等級', qaLevel],
      ['重複點', String(qa.duplicatePointCount || 0)],
      ['缺漏幾何', String(qa.missingGeometryCount || 0)],
      ['越界點', String(qa.outOfRangeCount || 0)],
      ['點距穩定度', String(qa.spacingStabilityScore || 0)],
      ['分群穩定度', String(qa.groupStabilityScore || 0)],
      ['門檻-分數', String(gate.minScore || '')],
      ['門檻-重複點', String(gate.maxDuplicate || 0)],
      ['門檻-缺漏幾何', String(gate.maxMissing || 0)],
      ['門檻-越界點', String(gate.maxOutOfRange || 0)],
      ['門檻-點距穩定度', String(gate.minSpacingStability || '')],
      ['門檻-分群穩定度', String(gate.minGroupStability || '')]
    ];
    const csv = buildKeyValueCsv(rows);
    triggerFileDownload(
      csv,
      `ConstructionMaster_BIM放樣企業QA_${new Date().getTime()}.csv`,
      'text/csv;charset=utf-8;'
    );
    addAuditLog('匯出企業QA報告', `結果 ${enterprise && enterprise.pass ? 'PASS' : 'BLOCKED'} / 分數 ${qa.qaScore || 0}`);
    showToast('企業 QA 報告已匯出');
  }

  function exportAdvancedEstimateReport() {
    if (getCurrentUserLevel() !== 'pro') {
      return showToast('此報表僅限會員3（專家）匯出');
    }
    const baseTotal = getVisibleCostBaseTotal();
    if (baseTotal <= 0) {
      return showToast('目前清單為空，無法匯出第三頁精算報表');
    }

    const wasteRate = readPercentInput('advWasteRate', 3, 0, 40);
    const mgmtRate = readPercentInput('advMgmtRate', 8, 0, 40);
    const taxRate = readPercentInput('advTaxRate', 5, 0, 20);
    const profitRate = readPercentInput('advProfitRate', 12, 0, 60);
    const stepPercent = readPercentInput('advSensitivityStep', 10, 1, 50);

    const base = calcAdvancedEstimateFromBase(baseTotal);
    const low = calcAdvancedEstimateFromBase(baseTotal * (1 - stepPercent / 100));
    const high = calcAdvancedEstimateFromBase(baseTotal * (1 + stepPercent / 100));

    const projectName = getCurrentProjectName();
    const floorTag = (document.getElementById('floor_tag') && document.getElementById('floor_tag').value) || '未分層';
    const rows = [
      ['報告時間', new Date().toLocaleString('zh-TW')],
      ['專案名稱', projectName],
      ['樓層分區', floorTag],
      ['會員等級', getUserLevelLabel(getCurrentUserLevel())],
      ['精算模式', base.strictMode && base.isPro ? '整數分精算（稽核級）' : '一般試算'],
      ['稽核訊息', base.auditText],
      ['基礎成本(元)', Math.round(base.baseTotal)],
      ['損耗率(%)', wasteRate],
      ['管理費率(%)', mgmtRate],
      ['稅率(%)', taxRate],
      ['目標毛利率(%)', profitRate],
      ['損耗成本(元)', Math.round(base.wasteCost)],
      ['管理費(元)', Math.round(base.mgmtCost)],
      ['稅金(元)', Math.round(base.taxCost)],
      ['含稅成本(元)', Math.round(base.costWithTax)],
      ['建議報價(元)', Math.round(base.quoteTotal)],
      ['目標毛利(元)', Math.round(base.targetProfit)],
      ['敏感度波動(±%)', stepPercent],
      ['低情境報價(元)', Math.round(low.quoteTotal)],
      ['基準報價(元)', Math.round(base.quoteTotal)],
      ['高情境報價(元)', Math.round(high.quoteTotal)]
    ];

    const csv = buildKeyValueCsv(rows);
    triggerFileDownload(
      csv,
      `ConstructionMaster_第三頁精算報表_${new Date().getTime()}.csv`,
      'text/csv;charset=utf-8;'
    );
    addAuditLog('匯出第三頁精算報表', `專案 ${projectName} / 報價 ${Math.round(base.quoteTotal)} 元`);
    showToast('第三頁精算報表已匯出');
  }

  function exportMeasureQaReport() {
    const avgTilt = measureQaStats.tiltSamples > 0 ? (measureQaStats.tiltSum / measureQaStats.tiltSamples) : 0;
    const qaScore = calcMeasureQaScore();
    const qaLevel = getQaLevelByScore(qaScore);
    const projectName = getCurrentProjectName();
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
      ['傾斜樣本數', String(measureQaStats.tiltSamples)],
      ['平均傾斜角(度)', avgTilt.toFixed(2)],
      ['最大傾斜角(度)', measureQaStats.tiltMax.toFixed(2)],
      ['嚴格模式擋下次數', String(measureQaStats.strictBlocks)],
      ['QA分數', String(qaScore)],
      ['QA等級', qaLevel],
      ['目前傾斜角(度)', Number(measureAssistState.tiltDeg || 0).toFixed(2)],
      ['統計起算時間', new Date(measureQaStats.startedAt).toLocaleString('zh-TW')]
    ];

    const csvContent = buildKeyValueCsv(reportRows);

    triggerFileDownload(
      csvContent,
      `ConstructionMaster_量圖QA報告_${new Date().getTime()}.csv`,
      'text/csv;charset=utf-8;'
    );
    if (typeof addAuditLog === 'function') {
      addAuditLog('匯出量圖QA報告', `等級 ${qaLevel} / 分數 ${qaScore} / 測量完成 ${measureQaStats.measureSuccess} 次`);
    }
    showToast(`🧪 量圖 QA 報告已匯出（${qaLevel} / ${qaScore}）`);
  }

  global.downloadBimCsv = downloadBimCsv;
  global.buildConstructionPackageLines = buildConstructionPackageLines;
  global.exportBimConstructionPackage = exportBimConstructionPackage;
  global.exportBimLayoutPoints = exportBimLayoutPoints;
  global.exportBimLayoutQaReport = exportBimLayoutQaReport;
  global.exportBimLayoutEnterpriseQaReport = exportBimLayoutEnterpriseQaReport;
  global.exportAdvancedEstimateReport = exportAdvancedEstimateReport;
  global.exportMeasureQaReport = exportMeasureQaReport;
})(window);
