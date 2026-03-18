// IFC core parsing and summary/search module (v8.0).
(function attachV80IfcCoreModule(global) {
  function loadIFCModel(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      const text = String(e.target.result || '');
      bimModelData = parseIFCText(text, file.name);
      bimLayoutPoints = [];
      layoutAlignmentState = null;
      layoutConfidenceFilterMode = 'all';
      bimLayoutQaResult = null;
      const heatBox = document.getElementById('layoutHeatmapSummary');
      if (heatBox) heatBox.innerText = '偏差熱圖：尚未分析';
      const confBox = document.getElementById('layoutConfidenceSummary');
      if (confBox) confBox.innerText = '置信度分層：尚未分析';
      const coverageBox = document.getElementById('layoutCoverageSummary');
      if (coverageBox) coverageBox.innerText = '補點建議：尚未分析';
      const spotBox = document.getElementById('layoutSpotCheckSummary');
      if (spotBox) spotBox.innerText = '現場抽驗：尚未抽驗';
      layoutSpotCheckSelection = [];
      renderBIMSummary(bimModelData);
      renderBimLayoutTable();
      renderBimLayoutQaSummary();
      addAuditLog('載入模型', `${file.name} / ${bimModelData.totalEntities} 筆實體`);
      const overallQa = getOverallQaSummary();
      showToast(`模型已載入：${file.name}｜整體 QA ${overallQa.level} / ${overallQa.score}`);
    };
    reader.readAsText(file);
  }

  function parseIFCText(text, fileName) {
    const data = {
      fileName,
      totalEntities: 0,
      totalElements: 0,
      typeCounts: {},
      elements: [],
      qtyLength: 0,
      qtyArea: 0,
      qtyVolume: 0,
      qtyCount: 0,
      warnings: []
    };

    if (!text.includes('ISO-10303-21') && !text.includes('IFC')) {
      data.warnings.push('檔案看起來不是標準模型文字格式，請確認來源。');
    }

    const lines = text.replace(/\r/g, '').split('\n');
    let duplicateIds = 0;
    const idSet = new Set();

    for (const lineRaw of lines) {
      const line = lineRaw.trim();
      if (!line.startsWith('#')) continue;
      const m = line.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\((.*)\);?$/i);
      if (!m) continue;

      const entityId = `#${m[1]}`;
      const type = m[2].toUpperCase();
      const body = m[3] || '';

      if (idSet.has(entityId)) duplicateIds += 1;
      idSet.add(entityId);

      data.totalEntities += 1;
      data.typeCounts[type] = (data.typeCounts[type] || 0) + 1;

      if (/^IFC(WALL|WALLSTANDARDCASE|SLAB|BEAM|COLUMN|STAIR|ROOF|DOOR|WINDOW|FOOTING|PILE|CURTAINWALL|MEMBER)/.test(type)) {
        data.totalElements += 1;
        if (data.elements.length < 500) {
          const nameMatch = body.match(/'([^']+)'/);
          data.elements.push({ id: entityId, type, name: nameMatch ? nameMatch[1] : '' });
        }
      }

      if (type === 'IFCQUANTITYLENGTH' || type === 'IFCQUANTITYAREA' || type === 'IFCQUANTITYVOLUME' || type === 'IFCQUANTITYCOUNT') {
        const nums = body.match(/-?\d+(\.\d+)?/g);
        const value = nums ? Number(nums[nums.length - 1]) : 0;
        if (Number.isFinite(value)) {
          if (type === 'IFCQUANTITYLENGTH') data.qtyLength += value;
          if (type === 'IFCQUANTITYAREA') data.qtyArea += value;
          if (type === 'IFCQUANTITYVOLUME') data.qtyVolume += value;
          if (type === 'IFCQUANTITYCOUNT') data.qtyCount += value;
        }
      }
    }

    if (data.totalEntities === 0) data.warnings.push('沒有解析到模型實體，請確認檔案內容是否完整。');
    if (data.totalElements === 0) data.warnings.push('未找到常見構件（牆/梁/柱/板），可能是非建築模型或格式版本差異。');
    if (data.qtyLength + data.qtyArea + data.qtyVolume + data.qtyCount === 0) data.warnings.push('未讀到工程量實體，建議先輸出算量屬性再匯入。');
    if (duplicateIds > 0) data.warnings.push(`偵測到重複編號：${duplicateIds} 筆`);

    return data;
  }

  function calcBIMQaScore(data) {
    let score = 40;
    if (data.totalEntities > 1000) score += 20;
    else if (data.totalEntities > 200) score += 12;
    else if (data.totalEntities > 50) score += 6;

    if (data.totalElements > 50) score += 20;
    else if (data.totalElements > 10) score += 12;
    else if (data.totalElements > 0) score += 6;

    const qtySum = data.qtyLength + data.qtyArea + data.qtyVolume + data.qtyCount;
    if (qtySum > 0) score += 20;

    const coreTypes = ['IFCWALL', 'IFCSLAB', 'IFCBEAM', 'IFCCOLUMN'];
    const hit = coreTypes.filter(t => (data.typeCounts[t] || data.typeCounts[`${t}STANDARDCASE`] || 0) > 0).length;
    score += hit * 5;

    score -= Math.min(20, data.warnings.length * 5);
    return Math.max(0, Math.min(100, score));
  }

  function renderBIMSummary(data) {
    const bimQaScore = calcBIMQaScore(data);
    const bimQaLevel = getQaLevelByScore(bimQaScore);
    document.getElementById('bimFileName').innerText = data.fileName || '未命名';
    document.getElementById('bimEntityCount').innerText = data.totalEntities.toLocaleString();
    document.getElementById('bimElementCount').innerText = data.totalElements.toLocaleString();
    document.getElementById('bimQaScore').innerText = `${bimQaLevel} / ${bimQaScore}`;
    document.getElementById('bimQtyLength').innerText = data.qtyLength.toFixed(2);
    document.getElementById('bimQtyArea').innerText = data.qtyArea.toFixed(2);
    document.getElementById('bimQtyVolume').innerText = data.qtyVolume.toFixed(2);
    document.getElementById('bimQtyCount').innerText = data.qtyCount.toFixed(2);

    const typeBody = document.getElementById('bimTypeBody');
    typeBody.innerHTML = '';
    const topTypes = Object.entries(data.typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 50);
    topTypes.forEach(([type, count]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${formatIfcTypeDisplay(type)}</td><td>${count}</td>`;
      typeBody.appendChild(tr);
    });

    const warnBox = document.getElementById('bimWarnings');
    warnBox.innerHTML = data.warnings.length
      ? data.warnings.map(w => `• ${w}`).join('<br>')
      : `QA 檢核：等級 ${bimQaLevel}，未發現明顯結構問題。`;
    updateQaDashboard();
  }

  function searchIFCEntity(keyword) {
    if (!bimModelData) return;
    const rawQ = String(keyword || '').trim();
    const q = normalizeIfcType(rawQ);
    const typeBody = document.getElementById('bimTypeBody');
    if (!rawQ) return renderBIMSummary(bimModelData);

    // If searching by #id, show closest element match.
    if (rawQ.startsWith('#')) {
      const qid = rawQ.toUpperCase();
      const found = bimModelData.elements.find(e => e.id.toUpperCase() === qid);
      typeBody.innerHTML = '';
      const tr = document.createElement('tr');
      tr.innerHTML = found
        ? `<td>${found.id} ${formatIfcTypeDisplay(found.type)}${found.name ? ` - ${found.name}` : ''}</td><td>1</td>`
        : `<td>查無 ${rawQ}</td><td>0</td>`;
      typeBody.appendChild(tr);
      return;
    }

    const filtered = Object.entries(bimModelData.typeCounts).filter(([type]) => type.includes(q)).sort((a, b) => b[1] - a[1]);
    typeBody.innerHTML = '';
    filtered.slice(0, 50).forEach(([type, count]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${formatIfcTypeDisplay(type)}</td><td>${count}</td>`;
      typeBody.appendChild(tr);
    });
    if (filtered.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>查無 ${rawQ}</td><td>0</td>`;
      typeBody.appendChild(tr);
    }
  }

  function findMaterialByKeywords(keywords) {
    const lowered = materialCatalog.map(item => ({ ...item, _k: item.name.toLowerCase() }));
    for (const k of keywords) {
      const hit = lowered.find(item => item._k.includes(k));
      if (hit) return hit;
    }
    return null;
  }

  function normalizeIfcType(type) {
    const raw = String(type || '').trim();
    if (!raw) return '';
    const upper = raw.toUpperCase();
    if (upper.startsWith('IFC')) return upper;

    // Allow user-facing Chinese terms while keeping internal codes.
    if (raw.includes('牆')) return 'IFCWALL';
    if (raw.includes('樓板') || raw.includes('板')) return 'IFCSLAB';
    if (raw.includes('梁')) return 'IFCBEAM';
    if (raw.includes('柱')) return 'IFCCOLUMN';
    if (raw.includes('樓梯')) return 'IFCSTAIR';
    if (raw.includes('屋頂')) return 'IFCROOF';
    if (raw.includes('基礎') || raw.includes('基脚')) return 'IFCFOOTING';
    if (raw.includes('樁')) return 'IFCPILE';
    if (raw.includes('門')) return 'IFCDOOR';
    if (raw.includes('窗')) return 'IFCWINDOW';
    if (raw.includes('帷幕')) return 'IFCCURTAINWALL';
    if (raw.includes('構件')) return 'IFCMEMBER';
    return upper;
  }

  function getIfcTypePlainName(type) {
    const t = normalizeIfcType(type);
    if (!t) return '未分類構件';
    if (t.includes('IFCWALL')) return '牆';
    if (t.includes('IFCSLAB')) return '樓板';
    if (t.includes('IFCBEAM')) return '梁';
    if (t.includes('IFCCOLUMN')) return '柱';
    if (t.includes('IFCSTAIR')) return '樓梯';
    if (t.includes('IFCROOF')) return '屋頂';
    if (t.includes('IFCFOOTING')) return '基礎';
    if (t.includes('IFCPILE')) return '樁';
    if (t.includes('IFCDOOR')) return '門';
    if (t.includes('IFCWINDOW')) return '窗';
    if (t.includes('IFCCURTAINWALL')) return '帷幕牆';
    if (t.includes('IFCMEMBER')) return '構件';
    if (t.includes('IFCQUANTITYLENGTH')) return '工程量-長度';
    if (t.includes('IFCQUANTITYAREA')) return '工程量-面積';
    if (t.includes('IFCQUANTITYVOLUME')) return '工程量-體積';
    if (t.includes('IFCQUANTITYCOUNT')) return '工程量-數量';
    return '其他構件';
  }

  function formatIfcTypeDisplay(type) {
    const t = normalizeIfcType(type);
    if (!t) return '-';
    return `${getIfcTypePlainName(t)}`;
  }

  function mapIfcTypeToMaterial(type) {
    const t = normalizeIfcType(type);
    const customMaterialName = bimRuleMap[t];
    if (customMaterialName) {
      const custom = materialCatalog.find(item => item.name === customMaterialName);
      if (custom) return custom;
    }
    if (t.includes('IFCBEAM')) return findMaterialByKeywords(['模板工程', '混凝土', '鋼筋']);
    if (t.includes('IFCCOLUMN')) return findMaterialByKeywords(['鋼筋', '模板工程', '混凝土']);
    if (t.includes('IFCWALL')) return findMaterialByKeywords(['模板工程', '混凝土']);
    if (t.includes('IFCSLAB')) return findMaterialByKeywords(['混凝土', '模板工程']);
    if (t.includes('IFCFOOTING')) return findMaterialByKeywords(['混凝土', '鋼筋']);
    if (t.includes('IFCSTAIR')) return findMaterialByKeywords(['混凝土', '模板工程']);
    if (t.includes('IFCPILE')) return findMaterialByKeywords(['鋼筋', '混凝土']);
    if (t.includes('IFCDOOR')) return findMaterialByKeywords(['門', '木門', '防火門']);
    if (t.includes('IFCWINDOW')) return findMaterialByKeywords(['玻璃', '門窗']);
    return findMaterialByKeywords(['模板工程', '混凝土', '鋼筋']);
  }

  function isIfcElementType(type) {
    return /^IFC(WALL|WALLSTANDARDCASE|SLAB|BEAM|COLUMN|STAIR|ROOF|DOOR|WINDOW|FOOTING|PILE|CURTAINWALL|MEMBER)/.test(type);
  }

  global.loadIFCModel = loadIFCModel;
  global.parseIFCText = parseIFCText;
  global.calcBIMQaScore = calcBIMQaScore;
  global.renderBIMSummary = renderBIMSummary;
  global.searchIFCEntity = searchIFCEntity;
  global.findMaterialByKeywords = findMaterialByKeywords;
  global.normalizeIfcType = normalizeIfcType;
  global.getIfcTypePlainName = getIfcTypePlainName;
  global.formatIfcTypeDisplay = formatIfcTypeDisplay;
  global.mapIfcTypeToMaterial = mapIfcTypeToMaterial;
  global.isIfcElementType = isIfcElementType;
})(window);
