// BIM rule editor and unmatched-fix workflow module (v8.0).
(function attachV80BimRulesModule(global) {
  function initBimRuleEditor() {
    loadBimRules();
    renderBimRuleMaterialOptions();
    renderBimRuleTable();
  }

  function renderBimRuleMaterialOptions() {
    const sel = document.getElementById('bimRuleMaterial');
    if (!sel) return;
    sel.innerHTML = '<option value="">請選擇材料</option>';
    materialCatalog.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.name;
      const unitText = item.unit ? ` / ${item.unit}` : '';
      opt.textContent = `${item.name} (${Number(item.price).toLocaleString()}${unitText})`;
      sel.appendChild(opt);
    });
    renderUnmatchedMaterialOptions();
  }

  function renderUnmatchedMaterialOptions() {
    const sel = document.getElementById('bimUnmatchedMaterial');
    if (!sel) return;
    sel.innerHTML = '<option value="">請選擇材料</option>';
    materialCatalog.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.name;
      const unitText = item.unit ? ` / ${item.unit}` : '';
      opt.textContent = `${item.name} (${Number(item.price).toLocaleString()}${unitText})`;
      sel.appendChild(opt);
    });
  }

  function inferIfcQuantityUnit(type) {
    const t = normalizeIfcType(type);
    if (t.includes('IFCWALL') || t.includes('IFCSLAB') || t.includes('IFCROOF') || t.includes('IFCCURTAINWALL')) return 'm²';
    if (t.includes('IFCBEAM') || t.includes('IFCCOLUMN') || t.includes('IFCMEMBER') || t.includes('IFCPILE')) return 'm';
    if (t.includes('IFCFOOTING')) return 'm³';
    if (t.includes('IFCDOOR') || t.includes('IFCWINDOW')) return '樘';
    return '件';
  }

  function renderUnmatchedWizard() {
    const sel = document.getElementById('bimUnmatchedType');
    if (!sel) return;
    sel.innerHTML = '';
    const unmatchedTypes = Array.from(new Set(
      bimEstimateRows.filter(row => !row.price || row.materialName === '未匹配').map(row => row.ifcType)
    ));
    if (!unmatchedTypes.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '目前沒有未匹配項目';
      sel.appendChild(opt);
      return;
    }
    unmatchedTypes.forEach(type => {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = formatIfcTypeDisplay(type);
      sel.appendChild(opt);
    });
  }

  function applyUnmatchedRuleOnce() {
    const ifcType = normalizeIfcType(document.getElementById('bimUnmatchedType').value);
    const materialName = String(document.getElementById('bimUnmatchedMaterial').value || '').trim();
    if (!ifcType) return showToast('目前沒有未匹配構件類型');
    if (!materialName) return showToast('請先選擇要套用的材料');
    createDataSnapshot('修復未匹配前', true);
    bimRuleMap[ifcType] = materialName;
    persistBimRules();
    renderBimRuleTable();
    const typeLabel = formatIfcTypeDisplay(ifcType);
    addAuditLog('修復未匹配', `${typeLabel} -> ${materialName}`);
    showToast(`已套用規則：${typeLabel} -> ${materialName}`);
    generateBIMEstimate();
  }

  function applyUnmatchedRuleAll() {
    const materialName = String(document.getElementById('bimUnmatchedMaterial').value || '').trim();
    if (!materialName) return showToast('請先選擇要批次套用的材料');
    const targets = Array.from(new Set(
      bimEstimateRows.filter(row => !row.price || row.materialName === '未匹配').map(row => normalizeIfcType(row.ifcType))
    )).filter(Boolean);
    if (!targets.length) return showToast('沒有未匹配項目可批次套用');
    createDataSnapshot('批次修復未匹配前', true);
    targets.forEach(t => { bimRuleMap[t] = materialName; });
    persistBimRules();
    renderBimRuleTable();
    addAuditLog('批次修復未匹配', `${targets.length} 筆 -> ${materialName}`);
    showToast(`已批次套用 ${targets.length} 筆規則`);
    generateBIMEstimate();
  }

  function loadBimRules() {
    bimRuleMap = {};
    try {
      const raw = localStorage.getItem(BIM_RULES_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      Object.keys(parsed).forEach(key => {
        const t = normalizeIfcType(key);
        const v = String(parsed[key] || '').trim();
        if (t && v) bimRuleMap[t] = v;
      });
    } catch (e) {
      console.warn('BIM 規則載入失敗', e);
    }
  }

  function persistBimRules() {
    localStorage.setItem(BIM_RULES_STORAGE_KEY, JSON.stringify(bimRuleMap));
  }

  function renderBimRuleTable() {
    const body = document.getElementById('bimRuleBody');
    if (!body) return;
    body.innerHTML = '';
    const entries = Object.entries(bimRuleMap).sort((a, b) => a[0].localeCompare(b[0]));
    if (!entries.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="3" style="color:#99b2c9;">尚無自訂規則</td>';
      body.appendChild(tr);
      return;
    }
    entries.forEach(([ifcType, materialName]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${formatIfcTypeDisplay(ifcType)}</td><td>${materialName}</td><td><button class="tool-btn" style="padding:4px 8px;" onclick="useBimRule('${ifcType}')">編輯</button></td>`;
      body.appendChild(tr);
    });
  }

  function useBimRule(ifcType) {
    const t = normalizeIfcType(ifcType);
    document.getElementById('bimRuleIfcType').value = formatIfcTypeDisplay(t);
    const mat = bimRuleMap[t] || '';
    document.getElementById('bimRuleMaterial').value = mat;
  }

  function saveBimRule() {
    const t = normalizeIfcType(document.getElementById('bimRuleIfcType').value);
    const mat = String(document.getElementById('bimRuleMaterial').value || '').trim();
    if (!t) return showToast('請輸入構件類型');
    if (!mat) return showToast('請選擇對應材料');
    const exists = materialCatalog.some(m => m.name === mat);
    if (!exists) return showToast('所選材料不在目前價目表中');
    createDataSnapshot('規則變更前', true);
    bimRuleMap[t] = mat;
    persistBimRules();
    renderBimRuleTable();
    const typeLabel = formatIfcTypeDisplay(t);
    addAuditLog('儲存規則', `${typeLabel} -> ${mat}`);
    showToast(`已儲存規則：${typeLabel} -> ${mat}`);
  }

  function deleteBimRule() {
    const t = normalizeIfcType(document.getElementById('bimRuleIfcType').value);
    if (!t) return showToast('請先輸入要刪除的構件類型');
    if (!bimRuleMap[t]) return showToast('此規則不存在');
    createDataSnapshot('刪除規則前', true);
    delete bimRuleMap[t];
    persistBimRules();
    renderBimRuleTable();
    const typeLabel = formatIfcTypeDisplay(t);
    addAuditLog('刪除規則', typeLabel);
    showToast(`已刪除規則：${typeLabel}`);
  }

  function exportBimRules() {
    const payload = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      rules: bimRuleMap
    };
    triggerFileDownload(
      JSON.stringify(payload, null, 2),
      `bim-rules-${new Date().getTime()}.json`,
      'application/json;charset=utf-8'
    );
    addAuditLog('匯出規則', `共 ${Object.keys(bimRuleMap).length} 筆`);
    showToast('BIM 規則已匯出');
  }

  function triggerImportBimRules() {
    const fileInput = document.getElementById('bimRuleImportFile');
    if (fileInput) fileInput.click();
  }

  function importBimRulesFromFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(String(e.target.result || '{}'));
        const rules = parsed.rules && typeof parsed.rules === 'object' ? parsed.rules : parsed;
        const nextMap = {};
        let skippedInvalid = 0;
        let skippedNoMaterial = 0;
        Object.keys(rules || {}).forEach(key => {
          const ifcType = normalizeIfcType(key);
          const materialName = String(rules[key] || '').trim();
          if (!ifcType || !materialName) {
            skippedInvalid += 1;
            return;
          }
          const exists = materialCatalog.some(m => m.name === materialName);
          if (exists) nextMap[ifcType] = materialName;
          else skippedNoMaterial += 1;
        });

        const before = bimRuleMap || {};
        let added = 0;
        let updated = 0;
        let unchanged = 0;
        Object.keys(nextMap).forEach(ifcType => {
          if (!(ifcType in before)) {
            added += 1;
            return;
          }
          if (before[ifcType] === nextMap[ifcType]) unchanged += 1;
          else updated += 1;
        });

        if (Object.keys(nextMap).length === 0) {
          return showToast('匯入失敗：沒有可用規則（請確認材料名稱與價目表一致）');
        }

        const importVersion = parsed && parsed.version ? String(parsed.version) : '未標示';
        const summary = [
          `匯入版本：${importVersion}`,
          `新增 ${added} 筆`,
          `覆蓋 ${updated} 筆`,
          `不變 ${unchanged} 筆`,
          `忽略 ${skippedInvalid + skippedNoMaterial} 筆`
        ].join('\n');

        const ok = confirm(`即將以匯入檔覆蓋目前 BIM 規則：\n\n${summary}\n\n是否繼續？`);
        if (!ok) return showToast('已取消匯入');

        createDataSnapshot('匯入規則前', true);
        bimRuleMap = nextMap;
        persistBimRules();
        renderBimRuleTable();
        addAuditLog('匯入規則', `新增 ${added} / 覆蓋 ${updated} / 不變 ${unchanged}`);
        showToast(`已匯入 BIM 規則 ${Object.keys(bimRuleMap).length} 筆（+${added} / ~${updated}）`);
      } catch (_err) {
        showToast('匯入失敗：JSON 格式不正確');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  function resetBimRules() {
    if (!confirm('確定清空所有 BIM 匹配規則嗎？')) return;
    createDataSnapshot('清空規則前', true);
    bimRuleMap = {};
    persistBimRules();
    renderBimRuleTable();
    addAuditLog('清空規則', '全部清空');
    showToast('已清空所有 BIM 規則');
  }

  global.initBimRuleEditor = initBimRuleEditor;
  global.renderBimRuleMaterialOptions = renderBimRuleMaterialOptions;
  global.renderUnmatchedMaterialOptions = renderUnmatchedMaterialOptions;
  global.inferIfcQuantityUnit = inferIfcQuantityUnit;
  global.renderUnmatchedWizard = renderUnmatchedWizard;
  global.applyUnmatchedRuleOnce = applyUnmatchedRuleOnce;
  global.applyUnmatchedRuleAll = applyUnmatchedRuleAll;
  global.loadBimRules = loadBimRules;
  global.persistBimRules = persistBimRules;
  global.renderBimRuleTable = renderBimRuleTable;
  global.useBimRule = useBimRule;
  global.saveBimRule = saveBimRule;
  global.deleteBimRule = deleteBimRule;
  global.exportBimRules = exportBimRules;
  global.triggerImportBimRules = triggerImportBimRules;
  global.importBimRulesFromFile = importBimRulesFromFile;
  global.resetBimRules = resetBimRules;
})(window);
