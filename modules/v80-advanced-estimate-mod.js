// Advanced estimate and sensitivity analysis module (v8.0).
(function attachV80AdvancedEstimateModule(global) {
  function getVisibleCostBaseTotal() {
    const mergedList = [
      ...list.map((item, idx) => ({ item, idx, source: 'local' })),
      ...warRoomList.map((item, idx) => ({ item, idx, source: 'warroom' }))
    ];
    const visibleList = mergedList.filter(({ source }) => showWarRoomRows || source !== 'warroom');
    return visibleList.reduce((sum, row) => sum + (Number(row.item && row.item.totalCost) || 0), 0);
  }

  function formatNtd(value) {
    return `${Math.round(Number(value) || 0).toLocaleString()} 元`;
  }

  function readPercentInput(id, fallback, minValue = 0, maxValue = 100) {
    const el = document.getElementById(id);
    const raw = Number(el && el.value);
    const value = Number.isFinite(raw) ? raw : fallback;
    return Math.max(minValue, Math.min(maxValue, value));
  }

  function toMoneyCents(value) {
    return Math.round((Number(value) || 0) * 100);
  }

  function fromMoneyCents(cents) {
    return (Number(cents) || 0) / 100;
  }

  function toBasisPoints(percentValue) {
    return Math.round((Number(percentValue) || 0) * 100);
  }

  function mulDivRound(value, numerator, denominator) {
    if (!Number.isFinite(value) || !Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
    return Math.round((value * numerator) / denominator);
  }

  function calcAdvancedEstimateFromBase(baseTotal) {
    const wasteRate = readPercentInput('advWasteRate', 3, 0, 40) / 100;
    const mgmtRate = readPercentInput('advMgmtRate', 8, 0, 40) / 100;
    const taxRate = readPercentInput('advTaxRate', 5, 0, 20) / 100;
    const profitRate = readPercentInput('advProfitRate', 12, 0, 60) / 100;
    const strictMode = !!(document.getElementById('advProPrecisionMode') && document.getElementById('advProPrecisionMode').checked);
    const isPro = getCurrentUserLevel() === 'pro';

    let wasteCost;
    let mgmtCost;
    let preTaxCost;
    let taxCost;
    let costWithTax;
    let quoteTotal;
    let targetProfit;
    let auditText;

    if (strictMode && isPro) {
      const baseCents = toMoneyCents(baseTotal);
      const wasteBps = toBasisPoints(wasteRate * 100);
      const mgmtBps = toBasisPoints(mgmtRate * 100);
      const taxBps = toBasisPoints(taxRate * 100);
      const profitBps = toBasisPoints(profitRate * 100);

      const wasteCents = mulDivRound(baseCents, wasteBps, 10000);
      const mgmtCents = mulDivRound(baseCents + wasteCents, mgmtBps, 10000);
      const preTaxCents = baseCents + wasteCents + mgmtCents;
      const taxCents = mulDivRound(preTaxCents, taxBps, 10000);
      const costWithTaxCents = preTaxCents + taxCents;
      const quoteCents = profitBps < 10000
        ? mulDivRound(costWithTaxCents, 10000, 10000 - profitBps)
        : costWithTaxCents;
      const profitCents = quoteCents - costWithTaxCents;

      wasteCost = fromMoneyCents(wasteCents);
      mgmtCost = fromMoneyCents(mgmtCents);
      preTaxCost = fromMoneyCents(preTaxCents);
      taxCost = fromMoneyCents(taxCents);
      costWithTax = fromMoneyCents(costWithTaxCents);
      quoteTotal = fromMoneyCents(quoteCents);
      targetProfit = fromMoneyCents(profitCents);
      auditText = `整數分精算：base=${baseCents}c, waste=${wasteBps}bps, mgmt=${mgmtBps}bps, tax=${taxBps}bps, profit=${profitBps}bps`;
    } else {
      wasteCost = baseTotal * wasteRate;
      mgmtCost = (baseTotal + wasteCost) * mgmtRate;
      preTaxCost = baseTotal + wasteCost + mgmtCost;
      taxCost = preTaxCost * taxRate;
      costWithTax = preTaxCost + taxCost;
      quoteTotal = (1 - profitRate) > 0.0001 ? (costWithTax / (1 - profitRate)) : costWithTax;
      targetProfit = quoteTotal - costWithTax;
      auditText = strictMode && !isPro
        ? '精算模式需會員3（專家），目前回退一般試算'
        : '一般試算（浮點）';
    }

    return {
      baseTotal,
      wasteCost,
      mgmtCost,
      taxCost,
      costWithTax,
      quoteTotal,
      targetProfit,
      strictMode,
      isPro,
      auditText
    };
  }

  function refreshAdvancedEstimate(showToastMsg = false) {
    const summary = document.getElementById('advEstimateSummary');
    const sensitivity = document.getElementById('advSensitivitySummary');
    const auditBox = document.getElementById('advPrecisionAudit');
    if (!summary || !sensitivity || !auditBox) return;
    const baseTotal = getVisibleCostBaseTotal();
    if (baseTotal <= 0) {
      summary.innerText = '進階試算：目前清單為空，請先加入至少一筆計算項目。';
      sensitivity.innerText = '敏感度：待命（需有清單金額）';
      auditBox.innerText = '精算稽核：待命';
      return;
    }
    const est = calcAdvancedEstimateFromBase(baseTotal);
    summary.innerText = `進階試算：基礎成本 ${formatNtd(est.baseTotal)}｜損耗 ${formatNtd(est.wasteCost)}｜管理費 ${formatNtd(est.mgmtCost)}｜稅金 ${formatNtd(est.taxCost)}｜含稅成本 ${formatNtd(est.costWithTax)}｜建議報價 ${formatNtd(est.quoteTotal)}｜目標毛利 ${formatNtd(est.targetProfit)}`;
    auditBox.innerText = `精算稽核：${est.auditText}`;
    auditBox.style.color = est.strictMode && est.isPro ? '#9ef5c2' : (est.strictMode ? '#ffd48a' : '#c6dcff');
    const gateInput = document.getElementById('advAutoInterpretGate');
    if (gateInput && (!Number.isFinite(Number(gateInput.value)) || String(gateInput.value).trim() === '')) {
      gateInput.value = String(Math.round(AUTO_INTERPRET_GATE_DEFAULT_CONFIDENCE * 100));
    }
    runAdvancedSensitivityAnalysis(true);
    if (showToastMsg) showToast(`進階試算已更新：建議報價 ${formatNtd(est.quoteTotal)}`);
  }

  function runAdvancedSensitivityAnalysis(silent = false) {
    const sensitivity = document.getElementById('advSensitivitySummary');
    if (!sensitivity) return;
    const baseTotal = getVisibleCostBaseTotal();
    if (baseTotal <= 0) {
      sensitivity.innerText = '敏感度：待命（需有清單金額）';
      return;
    }
    const stepPercent = readPercentInput('advSensitivityStep', 10, 1, 50);
    const low = calcAdvancedEstimateFromBase(baseTotal * (1 - stepPercent / 100));
    const mid = calcAdvancedEstimateFromBase(baseTotal);
    const high = calcAdvancedEstimateFromBase(baseTotal * (1 + stepPercent / 100));
    sensitivity.innerText = `敏感度（±${stepPercent}%）：低情境報價 ${formatNtd(low.quoteTotal)}｜基準 ${formatNtd(mid.quoteTotal)}｜高情境 ${formatNtd(high.quoteTotal)}`;
    if (!silent) showToast(`敏感度已更新（±${stepPercent}%）`);
  }

  global.getVisibleCostBaseTotal = getVisibleCostBaseTotal;
  global.formatNtd = formatNtd;
  global.readPercentInput = readPercentInput;
  global.toMoneyCents = toMoneyCents;
  global.fromMoneyCents = fromMoneyCents;
  global.toBasisPoints = toBasisPoints;
  global.mulDivRound = mulDivRound;
  global.calcAdvancedEstimateFromBase = calcAdvancedEstimateFromBase;
  global.refreshAdvancedEstimate = refreshAdvancedEstimate;
  global.runAdvancedSensitivityAnalysis = runAdvancedSensitivityAnalysis;
})(window);
