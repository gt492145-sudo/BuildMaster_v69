// Audit log and snapshot module (v8.0).
(function attachV80AuditSnapshotModule(global) {
  function renderBimEstimateTableFromRows() {
    const body = document.getElementById('bimEstimateBody');
    if (!body) return;
    body.innerHTML = '';
    bimEstimateRows.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
                <td>${formatIfcTypeDisplay(row.ifcType)}</td>
                <td>${row.materialName}</td>
                <td>${row.qty.toLocaleString()} ${row.unit}${row.priceUnit !== row.unit ? ` → ${Math.round(row.effectiveQty * 1000) / 1000} ${row.priceUnit}` : ''}${row.unitMismatch ? ' (單位不相容)' : ''}</td>
                <td>${row.price ? row.price.toLocaleString() : '-'}</td>
                <td style="color:var(--money); font-weight:bold;">${row.subtotal ? Math.round(row.subtotal).toLocaleString() : '-'}</td>
            `;
      body.appendChild(tr);
    });
    renderUnmatchedWizard();
  }

  function loadAuditLogs() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BIM_AUDIT_STORAGE_KEY) || '[]');
      bimAuditLogs = Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      bimAuditLogs = [];
    }
  }

  function persistAuditLogs() {
    localStorage.setItem(BIM_AUDIT_STORAGE_KEY, JSON.stringify(bimAuditLogs.slice(0, 120)));
  }

  function addAuditLog(action, detail) {
    const row = {
      ts: new Date().toISOString(),
      action: String(action || '').trim(),
      detail: String(detail || '').trim()
    };
    bimAuditLogs.unshift(row);
    bimAuditLogs = bimAuditLogs.slice(0, 120);
    persistAuditLogs();
    renderAuditTable();
  }

  function renderAuditTable() {
    const body = document.getElementById('auditBody');
    if (!body) return;
    body.innerHTML = '';
    if (!bimAuditLogs.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="3" style="color:#99b2c9;">尚無操作紀錄</td>';
      body.appendChild(tr);
      return;
    }
    bimAuditLogs.slice(0, 50).forEach(log => {
      const tr = document.createElement('tr');
      const dt = new Date(log.ts);
      tr.innerHTML = `<td>${dt.toLocaleString('zh-TW')}</td><td>${log.action}</td><td>${log.detail}</td>`;
      body.appendChild(tr);
    });
  }

  function loadSnapshots() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BIM_SNAPSHOT_STORAGE_KEY) || '[]');
      bimSnapshots = Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      bimSnapshots = [];
    }
  }

  function persistSnapshots() {
    localStorage.setItem(BIM_SNAPSHOT_STORAGE_KEY, JSON.stringify(bimSnapshots.slice(0, 40)));
  }

  function snapshotSummaryText(snap) {
    const ruleCount = snap && snap.bimRuleMap ? Object.keys(snap.bimRuleMap).length : 0;
    const estimateCount = snap && Array.isArray(snap.bimEstimateRows) ? snap.bimEstimateRows.length : 0;
    const listCount = snap && Array.isArray(snap.list) ? snap.list.length : 0;
    return `規則 ${ruleCount} / 估價 ${estimateCount} / 清單 ${listCount}`;
  }

  function safeCloneJson(obj, fallback) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (_e) {
      return fallback;
    }
  }

  function createDataSnapshot(label, silent) {
    const snap = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      label: String(label || '快照').trim(),
      region: currentRegionLabel,
      bimRuleMap: safeCloneJson(bimRuleMap, {}),
      bimEstimateRows: safeCloneJson(bimEstimateRows, []),
      list: safeCloneJson(list, [])
    };
    bimSnapshots.unshift(snap);
    bimSnapshots = bimSnapshots.slice(0, 40);
    persistSnapshots();
    renderSnapshotTable();
    addAuditLog('建立快照', `${snap.label}（${snapshotSummaryText(snap)}）`);
    if (!silent) showToast(`已建立快照：${snap.label}`);
  }

  function renderSnapshotTable() {
    const body = document.getElementById('snapshotBody');
    if (!body) return;
    body.innerHTML = '';
    if (!bimSnapshots.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="4" style="color:#99b2c9;">尚無版本快照</td>';
      body.appendChild(tr);
      return;
    }
    bimSnapshots.slice(0, 30).forEach(snap => {
      const tr = document.createElement('tr');
      const dt = new Date(snap.ts);
      tr.innerHTML = `
                <td>${dt}</td>
                <td>${snap.label || '快照'}</td>
                <td>${snapshotSummaryText(snap)}</td>
                <td>
                    <button class="tool-btn" style="padding:4px 8px;" onclick="restoreSnapshotById('${snap.id}', 'all')">全部</button>
                    <button class="tool-btn" style="padding:4px 8px;" onclick="restoreSnapshotById('${snap.id}', 'rules')">規則</button>
                    <button class="tool-btn" style="padding:4px 8px;" onclick="restoreSnapshotById('${snap.id}', 'estimate')">估價</button>
                    <button class="tool-btn" style="padding:4px 8px;" onclick="restoreSnapshotById('${snap.id}', 'list')">清單</button>
                </td>
            `;
      body.appendChild(tr);
    });
  }

  function getRollbackScopeLabel(scope) {
    if (scope === 'rules') return '只回規則';
    if (scope === 'estimate') return '只回估價';
    if (scope === 'list') return '只回清單';
    return '全部回滾';
  }

  function restoreSnapshotById(snapshotId, scope = 'all') {
    const snap = bimSnapshots.find(s => s.id === snapshotId);
    if (!snap) return showToast('找不到指定快照');
    const mode = ['all', 'rules', 'estimate', 'list'].includes(scope) ? scope : 'all';
    const modeLabel = getRollbackScopeLabel(mode);
    const ok = confirm(`將回滾到：${snap.label || '快照'}\n模式：${modeLabel}\n時間：${new Date(snap.ts).toLocaleString('zh-TW')}\n${snapshotSummaryText(snap)}\n\n是否繼續？`);
    if (!ok) return;

    if (mode === 'all' || mode === 'rules') {
      bimRuleMap = safeCloneJson(snap.bimRuleMap || {}, {});
      persistBimRules();
      renderBimRuleTable();
    }
    if (mode === 'all') {
      bimEstimateRows = safeCloneJson(snap.bimEstimateRows || [], []);
      renderBimEstimateTableFromRows();
    }
    if (mode === 'estimate') {
      bimEstimateRows = safeCloneJson(snap.bimEstimateRows || [], []);
      renderBimEstimateTableFromRows();
    }
    if (mode === 'all' || mode === 'list') {
      list = safeCloneJson(snap.list || [], []);
      saveData();
      renderTable();
    }
    addAuditLog('回滾快照', `${snap.label}（${modeLabel} / ${snapshotSummaryText(snap)}）`);
    showToast(`已回滾：${snap.label || '快照'}（${modeLabel}）`);
  }

  function rollbackLatestSnapshot(scope = 'all') {
    if (!bimSnapshots.length) return showToast('目前沒有可回滾的快照');
    restoreSnapshotById(bimSnapshots[0].id, scope);
  }

  function exportSnapshots() {
    const payload = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      snapshots: bimSnapshots
    };
    triggerFileDownload(
      JSON.stringify(payload, null, 2),
      `bim-snapshots-${new Date().getTime()}.json`,
      'application/json;charset=utf-8'
    );
    addAuditLog('匯出快照', `共 ${bimSnapshots.length} 筆`);
    showToast('快照已匯出');
  }

  function triggerImportSnapshots() {
    const fileInput = document.getElementById('snapshotImportFile');
    if (fileInput) fileInput.click();
  }

  function importSnapshotsFromFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(String(e.target.result || '{}'));
        const incoming = Array.isArray(parsed.snapshots) ? parsed.snapshots : (Array.isArray(parsed) ? parsed : []);
        const normalized = incoming
          .filter(s => s && typeof s === 'object')
          .map(s => ({
            id: String(s.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
            ts: String(s.ts || new Date().toISOString()),
            label: String(s.label || '匯入快照'),
            region: String(s.region || '全台共用'),
            bimRuleMap: safeCloneJson(s.bimRuleMap || {}, {}),
            bimEstimateRows: safeCloneJson(s.bimEstimateRows || [], []),
            list: safeCloneJson(s.list || [], [])
          }));
        if (!normalized.length) return showToast('匯入失敗：沒有有效快照');
        const merged = [...normalized, ...bimSnapshots];
        const seen = new Set();
        bimSnapshots = merged.filter(s => {
          if (seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        }).slice(0, 40);
        persistSnapshots();
        renderSnapshotTable();
        addAuditLog('匯入快照', `匯入 ${normalized.length} 筆`);
        showToast(`已匯入快照 ${normalized.length} 筆`);
      } catch (_err) {
        showToast('匯入快照失敗：JSON 格式不正確');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  global.loadAuditLogs = loadAuditLogs;
  global.renderBimEstimateTableFromRows = renderBimEstimateTableFromRows;
  global.persistAuditLogs = persistAuditLogs;
  global.addAuditLog = addAuditLog;
  global.renderAuditTable = renderAuditTable;
  global.loadSnapshots = loadSnapshots;
  global.persistSnapshots = persistSnapshots;
  global.snapshotSummaryText = snapshotSummaryText;
  global.safeCloneJson = safeCloneJson;
  global.createDataSnapshot = createDataSnapshot;
  global.renderSnapshotTable = renderSnapshotTable;
  global.getRollbackScopeLabel = getRollbackScopeLabel;
  global.restoreSnapshotById = restoreSnapshotById;
  global.rollbackLatestSnapshot = rollbackLatestSnapshot;
  global.exportSnapshots = exportSnapshots;
  global.triggerImportSnapshots = triggerImportSnapshots;
  global.importSnapshotsFromFile = importSnapshotsFromFile;
})(window);
