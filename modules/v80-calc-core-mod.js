// Core calculation, preview, and add-to-list module (v8.0).
(function attachV80CalcCoreModule(global) {
  function getRebarDiameter(val) {
    if (val === 3) return 9.53;
    if (val === 4) return 12.7;
    if (val === 5) return 15.9;
    if (val === 6) return 19.1;
    if (val === 7) return 22.2;
    if (val === 8) return 25.4;
    if (val === 10) return 32.2;
    return val;
  }

  // 抽出獨立的計算邏輯，確保預覽和加入清單的結果絕對一致
  function coreCalculate(type, v1, v2, v3, n, up) {
    let res = 0;
    let unit = '';
    let cat = '';

    if (type.startsWith('C_') || type.startsWith('E_')) {
      cat = type.startsWith('C_') ? 'CEMENT' : 'EARTH';
      res = v1 * v2 * v3 * n;
      if (cat === 'CEMENT') res = res * 1.05; // 水泥含損耗
      unit = 'M³';
    } else if (type.startsWith('R_')) {
      cat = 'STEEL';
      let actualD = getRebarDiameter(v1);
      let mult = (v3 === 0) ? 1 : v3;
      res = (Math.pow(actualD, 2) / 162) * v2 * mult * n * 1.10; // 鋼筋含損耗
      unit = 'Kg';
    } else if (type === 'M_COL') {
      cat = 'MOLD';
      res = (v1 + v2) * 2 * v3 * n;
      unit = 'M²';
    } else if (type === 'M_BEAM_SIDES') {
      cat = 'MOLD';
      res = v1 * v3 * 2 * n;
      unit = 'M²';
    } else if (type === 'M_BEAM_ALL') {
      cat = 'MOLD';
      res = (v3 * 2 + v2) * v1 * n;
      unit = 'M²';
    } else if (type === 'M_WALL') {
      cat = 'MOLD';
      res = v1 * v2 * n;
      unit = 'M²';
    }

    let totalCost = res * up;
    return { res, unit, cat, totalCost };
  }

  function roundCalc(v, digits = 8) {
    const n = Number(v) || 0;
    const p = Math.pow(10, digits);
    return Math.round(n * p) / p;
  }

  // Independent audit path (formula duplicated intentionally for cross-check).
  function coreCalculateAudit(type, v1, v2, v3, n, up) {
    let res = 0;
    let unit = '';
    let cat = '';
    if (type.startsWith('C_') || type.startsWith('E_')) {
      cat = type.startsWith('C_') ? 'CEMENT' : 'EARTH';
      res = roundCalc(v1 * v2 * v3 * n);
      if (cat === 'CEMENT') res = roundCalc(res * 1.05);
      unit = 'M³';
    } else if (type.startsWith('R_')) {
      cat = 'STEEL';
      const actualD = getRebarDiameter(v1);
      const mult = (v3 === 0) ? 1 : v3;
      res = roundCalc((Math.pow(actualD, 2) / 162) * v2 * mult * n * 1.10);
      unit = 'Kg';
    } else if (type === 'M_COL') {
      cat = 'MOLD';
      res = roundCalc((v1 + v2) * 2 * v3 * n);
      unit = 'M²';
    } else if (type === 'M_BEAM_SIDES') {
      cat = 'MOLD';
      res = roundCalc(v1 * v3 * 2 * n);
      unit = 'M²';
    } else if (type === 'M_BEAM_ALL') {
      cat = 'MOLD';
      res = roundCalc((v3 * 2 + v2) * v1 * n);
      unit = 'M²';
    } else if (type === 'M_WALL') {
      cat = 'MOLD';
      res = roundCalc(v1 * v2 * n);
      unit = 'M²';
    }
    const totalCost = roundCalc(res * up);
    return { res, unit, cat, totalCost };
  }

  function verifyCalculationConsistency(type, v1, v2, v3, n, up) {
    const main = coreCalculate(type, v1, v2, v3, n, up);
    const audit = coreCalculateAudit(type, v1, v2, v3, n, up);
    const eps = 0.000001;
    const ok = main.cat === audit.cat
      && main.unit === audit.unit
      && Math.abs((main.res || 0) - (audit.res || 0)) <= eps
      && Math.abs((main.totalCost || 0) - (audit.totalCost || 0)) <= eps;
    return { ok, main, audit };
  }

  function updateUI() {
    const type = document.getElementById('calcType').value;
    const l1 = document.getElementById('lbl_v1');
    const l2 = document.getElementById('lbl_v2');
    const l3 = document.getElementById('lbl_v3');
    const lq = document.getElementById('lbl_qty');
    const lp = document.getElementById('lbl_price');
    const v3Input = document.getElementById('v3');

    l1.style.color = '#888';
    l2.style.color = '#888';
    l3.style.color = '#888';
    lq.style.color = '#888';
    lq.innerText = '數量 (N)';

    if (type === 'R_SLAB') {
      l1.innerText = '鋼筋規格 (分)';
      l2.innerText = '單排長度/長向 L (m)';
      l3.innerText = '排筋層數 (雙層請打2)';
      lp.innerText = '發包單價 ($/Kg)';
      l1.style.color = '#ff9800';
      l3.style.color = '#00d2d3';
      if (!v3Input.value) v3Input.value = 1;
    } else if (type === 'R_MAIN') {
      l1.innerText = '主筋規格 (分)';
      l2.innerText = '單支長度(含搭接) L (m)';
      l3.innerText = '單柱/樑 總支數';
      lq.innerText = '柱/樑 總數量';
      lp.innerText = '發包單價 ($/Kg)';
      l1.style.color = '#ff9800';
      l3.style.color = '#00d2d3';
      lq.style.color = '#00d2d3';
    } else if (type === 'R_HOOP') {
      l1.innerText = '箍筋規格 (分)';
      l2.innerText = '單圈展開長度 L (m)';
      l3.innerText = '單柱/樑 總圈數';
      lq.innerText = '柱/樑 總數量';
      lp.innerText = '發包單價 ($/Kg)';
      l1.style.color = '#ff9800';
      l3.style.color = '#00d2d3';
      lq.style.color = '#00d2d3';
    } else if (type === 'M_BEAM_SIDES') {
      l1.innerText = '樑長 L (m)';
      l2.innerText = '樑寬 (無作用可不填)';
      l3.innerText = '樑側淨高(扣版厚) (m)';
      lp.innerText = '發包單價 ($/M²)';
      l3.style.color = '#ff9800';
    } else {
      l1.innerText = '長 / 寬A (m)';
      l2.innerText = '寬 / 寬B (m)';
      l3.innerText = '高 / 深 (m)';
      lp.innerText = (type.startsWith('M_')) ? '發包單價 ($/M²)' : '發包單價 ($/M³)';
    }
    previewCalc();
  }

  function previewCalc() {
    maybeReleaseAutoInterpretGateByManualAdjust();
    const type = document.getElementById('calcType').value;
    const typeSelector = document.getElementById('calcType');
    const selectedType = typeSelector && typeSelector.options[typeSelector.selectedIndex]
      ? String(typeSelector.options[typeSelector.selectedIndex].text || '')
      : '';
    const v1 = readInputNumber('v1', 0);
    const v2 = readInputNumber('v2', 0);
    const v3 = readInputNumber('v3', 0);
    const n = readInputNumber('qty', 0);
    const up = readInputNumber('unitPrice', 0);
    const validation = validateCalcInputs(type, v1, v2, v3, n, up);

    if (!validation.ok) {
      document.getElementById('prev_qty').innerText = '--';
      document.getElementById('prev_unit').innerText = '單位';
      document.getElementById('prev_cost').innerText = validation.msg;
      updateAddButtonState(false, validation.msg);
      return;
    }
    const gate = evaluateAutoInterpretGate();
    if (!gate.ok) {
      document.getElementById('prev_qty').innerText = '需複核';
      document.getElementById('prev_unit').innerText = 'AI判讀';
      document.getElementById('prev_cost').innerText = gate.msg;
      updateAddButtonState(false, gate.msg);
      return;
    }

    const verify = verifyCalculationConsistency(type, v1, v2, v3, n, up);
    if (!verify.ok) {
      const msg = '計算校核失敗（雙引擎不一致），已阻擋加入清單';
      document.getElementById('prev_qty').innerText = '校核失敗';
      document.getElementById('prev_unit').innerText = '請重試';
      document.getElementById('prev_cost').innerText = msg;
      updateAddButtonState(false, msg);
      return;
    }
    const result = verify.main;

    let resultDisplay = '';
    let resultUnitDisplay = '';

    if (type.startsWith('M_') || selectedType.includes('模板') || selectedType.includes('漆') || selectedType.includes('地磚')) {
      const area = result.res;
      const tsubo = area * 0.3025;
      resultDisplay = `${area.toFixed(2)} M² (${tsubo.toFixed(2)} 坪)`;
      resultUnitDisplay = '面積';
    } else if (type.startsWith('R_') || selectedType.includes('鋼筋') || selectedType.includes('鐵')) {
      const weightKg = result.res;
      const tons = weightKg / 1000;
      resultDisplay = `${weightKg.toFixed(2)} kg (${tons.toFixed(3)} t)`;
      resultUnitDisplay = '重量';
    } else if (selectedType.includes('混凝土') || selectedType.includes('水泥') || type.startsWith('C_')) {
      const volume = result.res;
      const trucks = Math.ceil(volume / 6);
      resultDisplay = `${volume.toFixed(2)} M³ (約需 ${trucks} 台預拌車 🚚)`;
      resultUnitDisplay = '體積';
    } else if (selectedType.includes('土方') || selectedType.includes('開挖') || selectedType.includes('回填') || type.startsWith('E_')) {
      const volume = result.res;
      const trucks = Math.ceil(volume / 10);
      resultDisplay = `${volume.toFixed(2)} M³ (約需 ${trucks} 台砂石車 🚛)`;
      resultUnitDisplay = '體積';
    } else {
      const volume = result.res;
      resultDisplay = `${volume.toFixed(2)} M³`;
      resultUnitDisplay = '體積';
    }

    document.getElementById('prev_qty').innerText = resultDisplay;
    document.getElementById('prev_unit').innerText = resultUnitDisplay;
    document.getElementById('prev_cost').innerText = '$ ' + Math.round(result.totalCost).toLocaleString();
    updateAddButtonState(true);
  }

  function readInputNumber(id, fallback = 0) {
    const n = parseFloat(document.getElementById(id).value);
    return Number.isFinite(n) ? n : fallback;
  }

  function validateCalcInputs(type, v1, v2, v3, n, up) {
    if (v1 < 0 || v2 < 0 || v3 < 0 || n < 0 || up < 0) {
      return { ok: false, msg: '參數不可為負' };
    }
    if (n <= 0) return { ok: false, msg: '請輸入有效數量' };

    if (type === 'M_BEAM_SIDES') {
      if (v1 <= 0 || v3 <= 0) return { ok: false, msg: '請輸入樑長與樑高' };
      return { ok: true, msg: '' };
    }
    if (type === 'M_WALL') {
      if (v1 <= 0 || v2 <= 0) return { ok: false, msg: '請輸入長與寬' };
      return { ok: true, msg: '' };
    }
    if (type.startsWith('R_')) {
      if (v1 <= 0 || v2 <= 0) return { ok: false, msg: '請輸入鋼筋規格與長度' };
      return { ok: true, msg: '' };
    }
    if (v1 <= 0 || v2 <= 0 || v3 <= 0) return { ok: false, msg: '請補齊尺寸參數' };
    return { ok: true, msg: '' };
  }

  function updateAddButtonState(enabled, reason = '') {
    const addBtn = document.getElementById('addBtn');
    if (!addBtn) return;
    addBtn.disabled = !enabled;
    addBtn.title = enabled ? '可加入計算清單' : reason;
  }

  // --- 安全防護：XSS 處理 ---
  function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g,
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  function getPriceUnitByType(type) {
    if (String(type || '').startsWith('R_')) return 'Kg';
    if (String(type || '').startsWith('M_')) return 'M²';
    return 'M³';
  }

  function buildCalcFormulaText(type, v1, v2, v3, n) {
    const nText = Number.isFinite(n) ? n : 0;
    switch (type) {
      case 'C_BASE':
        return `(${v1}×${v2}×${v3})×${nText}`;
      case 'C_STAIR':
        return `((高+寬)×深/2)×${nText}`;
      case 'E_EXC':
        return `(${v1}×${v2}×${v3})×${nText}`;
      case 'R_SLAB':
        return '單位重(分徑)×長度×層數×數量';
      case 'R_MAIN':
        return '單位重(分徑)×單支長×支數×數量';
      case 'R_HOOP':
        return '單位重(分徑)×單圈長×圈數×數量';
      case 'M_COL':
        return '((A+B)×2×高)×數量';
      case 'M_BEAM_SIDES':
        return '(樑長×樑高×2)×數量';
      case 'M_BEAM_ALL':
        return '((高×2+寬)×長)×數量';
      case 'M_WALL':
        return '(長×高)×數量';
      default:
        return `依 ${type} 計算`;
    }
  }

  function getFormulaVariableHint(type) {
    switch (type) {
      case 'C_BASE':
        return 'A=長(m), B=寬(m), 高=深(m), N=數量';
      case 'C_STAIR':
        return '高=踏階高總和, 寬=踏階水平投影, 深=樓梯寬, N=座數';
      case 'E_EXC':
        return 'A=開挖長, B=開挖寬, 高=開挖深, N=區塊數';
      case 'R_SLAB':
        return '分徑=鋼筋規格(分), 長度=單排長度, 層數=1或2, N=排數';
      case 'R_MAIN':
        return '分徑=主筋規格, 單支長=含搭接長, 支數=單構件根數, N=構件數';
      case 'R_HOOP':
        return '分徑=箍筋規格, 單圈長=展開長, 圈數=單構件圈數, N=構件數';
      case 'M_COL':
        return 'A/B=柱兩邊尺寸, 高=柱高, N=柱數';
      case 'M_BEAM_SIDES':
        return '樑長=梁長度, 樑高=側模高度, N=梁數';
      case 'M_BEAM_ALL':
        return '高=梁高, 寬=梁寬, 長=梁長, N=梁數';
      case 'M_WALL':
        return '長=牆長, 高=牆高, N=片數';
      default:
        return '變數定義請依當前欄位標籤（v1/v2/v3/N）';
    }
  }

  function calculateAndAdd() {
    const type = document.getElementById('calcType').value;
    const typeText = document.getElementById('calcType').options[document.getElementById('calcType').selectedIndex].text.split(' (')[0];
    let customName = document.getElementById('customName').value.trim();
    let floor = document.getElementById('floor_tag').value.trim() || '未分層';

    const v1 = readInputNumber('v1', 0);
    const v2 = readInputNumber('v2', 0);
    const v3 = readInputNumber('v3', 0);
    const n = readInputNumber('qty', 1);
    const up = readInputNumber('unitPrice', 0);
    const validation = validateCalcInputs(type, v1, v2, v3, n, up);
    if (!validation.ok) {
      return showToast(`⚠️ ${validation.msg}`);
    }
    const gate = evaluateAutoInterpretGate();
    if (!gate.ok) {
      return showToast(`⚠️ ${gate.msg}`);
    }

    let isDeduct = confirm('這筆是要『扣除』的項目嗎？\n(如窗戶開口請點確定，一般計算點取消)');

    const verify = verifyCalculationConsistency(type, v1, v2, v3, n, up);
    if (!verify.ok) {
      return showToast('⚠️ 計算校核失敗（雙引擎不一致），請重新輸入或回報系統');
    }
    // 呼叫統一公式引擎（已通過雙引擎校核）
    let result = verify.main;
    let res = result.res;
    let name = typeText;

    if (isDeduct) {
      res = -Math.abs(res);
      name = `扣除(${name})`;
      // 若為扣除，水泥不乘損耗率 (還原)
      if (result.cat === 'CEMENT') res = res / 1.05;
    } else if (result.cat === 'STEEL') {
      name = `${typeText}(含損耗)`;
    }

    if (customName !== '') { name = `${name} [${customName}]`; }

    const totalCost = res * up;
    const priceUnit = getPriceUnitByType(type);
    const calcFormula = buildCalcFormulaText(type, v1, v2, v3, n);
    const formulaHint = getFormulaVariableHint(type);
    const costBreakdown = `${Math.abs(res).toFixed(3)} ${priceUnit} × ${up}`;

    // 安全處理使用者輸入
    const safeName = escapeHTML(name);
    const safeFloor = escapeHTML(floor);
    const safeFormula = escapeHTML(calcFormula);
    const safeFormulaHint = escapeHTML(formulaHint);
    const safeBreakdown = escapeHTML(costBreakdown);

    list.push({
      floor: safeFloor,
      name: safeName,
      res: res,
      up: up,
      totalCost: totalCost,
      cat: result.cat,
      unit: result.unit,
      priceUnit: priceUnit,
      formula: safeFormula,
      formulaHint: safeFormulaHint,
      breakdown: safeBreakdown
    });

    saveData();
    renderTable();
    showToast(isDeduct ? '✂️ 已執行自動扣除' : '🚀 數據已吸入黑洞！');
  }

  global.getRebarDiameter = getRebarDiameter;
  global.coreCalculate = coreCalculate;
  global.roundCalc = roundCalc;
  global.coreCalculateAudit = coreCalculateAudit;
  global.verifyCalculationConsistency = verifyCalculationConsistency;
  global.updateUI = updateUI;
  global.previewCalc = previewCalc;
  global.readInputNumber = readInputNumber;
  global.validateCalcInputs = validateCalcInputs;
  global.updateAddButtonState = updateAddButtonState;
  global.escapeHTML = escapeHTML;
  global.getPriceUnitByType = getPriceUnitByType;
  global.buildCalcFormulaText = buildCalcFormulaText;
  global.getFormulaVariableHint = getFormulaVariableHint;
  global.calculateAndAdd = calculateAndAdd;
})(window);
