// List core rendering/storage workflow module (v8.0).
(function attachV80ListCoreModule(global) {
  function toggleWarRoomRows() {
    showWarRoomRows = !showWarRoomRows;
    localStorage.setItem(SHOW_WAR_ROOM_ROWS_KEY, showWarRoomRows ? '1' : '0');
    applyFeatureControlStatus();
    renderTable();
    showToast(showWarRoomRows ? '已顯示雲端資料' : '已隱藏雲端資料');
  }

  function renderTable() {
    const tbody = document.getElementById('listBody');
    tbody.innerHTML = '';
    let sums = { CEMENT: 0, MOLD: 0, EARTH: 0, STEEL: 0, total: 0 };
    const mergedList = [
      ...list.map((item, idx) => ({ item, idx, source: 'local' })),
      ...warRoomList.map((item, idx) => ({ item, idx, source: 'warroom' }))
    ];
    const visibleList = mergedList.filter(({ source }) => showWarRoomRows || source !== 'warroom');

    visibleList.forEach(({ item, idx, source }) => {
      if (sums[item.cat] !== undefined) sums[item.cat] += item.res;
      sums.total += item.totalCost;
      const cloudTag = source === 'warroom'
        ? ' <span style="font-size:0.75em;color:#9ef3b5;">[雲端]</span>'
        : '';
      const removeBtn = source === 'warroom'
        ? '<button style="width:auto; padding:4px 8px; margin:0; background:#4b6584; border:none; border-radius:4px; cursor:not-allowed;" title="雲端同步資料不可單筆刪除">鎖</button>'
        : `<button style="width:auto; padding:4px 8px; margin:0; background:#e74c3c; border:none; border-radius:4px; cursor:pointer;" onclick="removeItem(${idx})">X</button>`;

      // 建立 DOM 元素以進一步防範 XSS
      const tr = document.createElement('tr');
      tr.innerHTML = `
                <td>${item.floor}</td>
                <td style="color:${item.res < 0 ? '#ff4757' : 'white'}">${item.name}${cloudTag}</td>
                <td>${item.res.toFixed(2)} <span style="font-size:0.8em;color:#888;">${item.unit || ''}</span></td>
                <td>${item.up} <span style="font-size:0.78em;color:#9bc2e5;">/ ${item.priceUnit || item.unit || '-'}</span></td>
                <td style="font-size:0.8em;color:#cde3f5;" title="${item.formulaHint || ''}">${item.formula || '-'} <span style="color:#9bc2e5;">ⓘ</span></td>
                <td style="color:var(--money); font-weight:bold;">${Math.round(item.totalCost).toLocaleString()}<div style="font-size:0.75em;color:#8fb3cf;">${item.breakdown || ''}</div></td>
                <td>${removeBtn}</td>
            `;
      tbody.appendChild(tr);
    });

    document.getElementById('sumC').innerText = `水泥: ${sums.CEMENT.toFixed(2)} M³`;
    document.getElementById('sumM').innerText = `模板: ${sums.MOLD.toFixed(2)} M²`;
    document.getElementById('sumE').innerText = `土方: ${sums.EARTH.toFixed(2)} M³`;
    document.getElementById('sumS').innerText = `鋼筋: ${sums.STEEL.toFixed(2)} Kg`;
    document.getElementById('totalMoney').innerText = Math.round(sums.total).toLocaleString();
    updateQaDashboard();
    refreshAdvancedEstimate(false);
  }

  function removeItem(idx) {
    list.splice(idx, 1);
    saveData();
    renderTable();
  }

  function clearAll() {
    if (confirm('⚠️ 確定要清空所有數據嗎?')) {
      createDataSnapshot('清空清單前', true);
      list = [];
      warRoomList = [];
      saveData();
      renderTable();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      document.getElementById('scale-info').innerText = '比例: 未設定';
      scalePixelsPerUnit = 0;
      document.getElementById('customName').value = '';
      document.getElementById('v1').value = '';
      document.getElementById('v2').value = '';
      document.getElementById('v3').value = '';
      resetMeasureQaStats();
      addAuditLog('清空主清單', '全部清空');
      previewCalc();
      showToast('黑洞已重置');
    }
  }

  function saveData() {
    const payload = {
      version: SCHEMA_VERSION,
      data: list,
      timestamp: new Date().toISOString()
    };
    const ok = safeStorage.set(localStorage, STORAGE_KEY, JSON.stringify(payload));
    if (!ok) console.warn('saveData: 已跳過本機儲存，維持記憶體中的最新資料。');
  }

  global.toggleWarRoomRows = toggleWarRoomRows;
  global.renderTable = renderTable;
  global.removeItem = removeItem;
  global.clearAll = clearAll;
  global.saveData = saveData;
})(window);
