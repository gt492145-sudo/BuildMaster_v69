// Material catalog, region source, and selection module (v8.0).
(function attachV80MaterialModule(global) {
  function normalizeMaterialItems(payload) {
    const items = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload && payload.items) ? payload.items : []);

    const parsePrice = value => {
      if (typeof value === 'number') return value;
      const text = String(value ?? '').replace(/,/g, '').trim();
      const parsed = Number(text);
      return Number.isFinite(parsed) ? parsed : NaN;
    };

    return items
      .map(item => {
        if (!item || typeof item !== 'object') return null;
        const name = String(
          item.name ??
          item.materialName ??
          item.material ??
          item['材料名稱'] ??
          item['名稱'] ??
          ''
        ).trim();
        const price = parsePrice(
          item.price ??
          item.unitPrice ??
          item['單價'] ??
          item['單價 (已取高標)'] ??
          item['單價(已取高標)']
        );
        const unit = String(item.unit ?? item['單位'] ?? '').trim();
        return { name, price, unit };
      })
      .filter(item => item && item.name && Number.isFinite(item.price) && item.price > 0);
  }

  async function loadMaterialCatalog(regionLabel = '全台共用') {
    const regionFile = REGION_FILE_MAP[regionLabel];
    const candidateFiles = regionFile ? [regionFile, PRICES_JSON_URL] : [PRICES_JSON_URL];
    const loaded = [];

    for (const file of candidateFiles) {
      try {
        const res = await fetchWithRetry(
          `${file}?v=${Date.now()}`,
          { cache: 'no-store' },
          { retries: 2, timeoutMs: 6500 }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        const normalized = normalizeMaterialItems(payload);
        if (normalized.length > 0) {
          const sourceFile = String(
            (payload && typeof payload === 'object' && payload.source) ? payload.source : file
          ).trim() || file;
          const generatedAt = String(
            (payload && typeof payload === 'object' && payload.generated_at) ? payload.generated_at : ''
          ).trim();
          const updateMode = String(
            (payload && typeof payload === 'object' && payload.price_update_mode) ? payload.price_update_mode : ''
          ).trim();
          const seasonalFactor = String(
            (payload && typeof payload === 'object' && payload.seasonal_factor !== undefined) ? payload.seasonal_factor : ''
          ).trim();
          const fallbackReason = String(
            (payload && typeof payload === 'object' && payload.fallback_reason) ? payload.fallback_reason : ''
          ).trim();
          loaded.push({ file, items: normalized, sourceFile, generatedAt, updateMode, seasonalFactor, fallbackReason });
        }
      } catch (e) {
        console.warn(`載入 ${file} 失敗`, e);
      }
    }

    if (loaded.length > 0) {
      loaded.sort((a, b) => b.items.length - a.items.length);
      const best = loaded[0];
      const isRegionFile = !!regionFile && best.file === regionFile;
      const isRegionMode = regionLabel !== '全台共用';

      // 若地區檔資料筆數偏少，優先改用全台完整檔，避免只看到少量單價。
      if (isRegionMode && isRegionFile && best.items.length < 30) {
        const fallbackGlobal = loaded.find(entry => entry.file === PRICES_JSON_URL);
        if (fallbackGlobal && fallbackGlobal.items.length > best.items.length) {
          showToast(`偵測到地區單價僅 ${best.items.length} 筆，已改用全台完整價目 ${fallbackGlobal.items.length} 筆`);
          currentMaterialSourceMeta = {
            file: fallbackGlobal.sourceFile || fallbackGlobal.file,
            generatedAt: fallbackGlobal.generatedAt || '',
            updateMode: fallbackGlobal.updateMode || '',
            seasonalFactor: fallbackGlobal.seasonalFactor || '',
            fallbackReason: fallbackGlobal.fallbackReason || ''
          };
          if (currentMaterialSourceMeta.updateMode === 'fallback_seasonal_factor') {
            const factorText = currentMaterialSourceMeta.seasonalFactor
              ? `（係數 x${currentMaterialSourceMeta.seasonalFactor}）`
              : '';
            showToast(`提醒：目前為季度估算價${factorText}，正式報價請上傳審核 CSV`);
          }
          return fallbackGlobal.items;
        }
      }

      currentMaterialSourceMeta = {
        file: best.sourceFile || best.file,
        generatedAt: best.generatedAt || '',
        updateMode: best.updateMode || '',
        seasonalFactor: best.seasonalFactor || '',
        fallbackReason: best.fallbackReason || ''
      };
      if (currentMaterialSourceMeta.updateMode === 'fallback_seasonal_factor') {
        const factorText = currentMaterialSourceMeta.seasonalFactor
          ? `（係數 x${currentMaterialSourceMeta.seasonalFactor}）`
          : '';
        showToast(`提醒：目前為季度估算價${factorText}，正式報價請上傳審核 CSV`);
      }
      showToast(`已同步${regionLabel}價格（${best.items.length} 筆）`);
      return best.items;
    }

    try {
      currentMaterialSourceMeta = {
        file: '內建預設',
        generatedAt: '',
        updateMode: '',
        seasonalFactor: '',
        fallbackReason: ''
      };
      showToast(`使用內建單價（離線模式：${DEFAULT_MATERIAL_CATALOG.length} 筆）`);
      return [...DEFAULT_MATERIAL_CATALOG];
    } catch (_e) {
      currentMaterialSourceMeta = {
        file: '內建預設',
        generatedAt: '',
        updateMode: '',
        seasonalFactor: '',
        fallbackReason: ''
      };
      return [...DEFAULT_MATERIAL_CATALOG];
    }
  }

  async function handleRegionChange(value) {
    if (value === 'auto') {
      localStorage.removeItem(REGION_STORAGE_KEY);
      const detected = await detectRegionFromDevice();
      currentRegionLabel = detected || '全台共用';
      currentRegionMode = detected ? '自動' : '預設';
    } else {
      currentRegionLabel = value;
      currentRegionMode = '手動';
      localStorage.setItem(REGION_STORAGE_KEY, value);
    }

    selectedMaterial = null;
    materialCatalog = await loadMaterialCatalog(currentRegionLabel);
    renderMaterialOptions(materialCatalog);
    renderBimRuleMaterialOptions();
    updateMaterialChips(materialCatalog.length, null);
    updateRegionChip();
    updateMaterialSourceChip();
    addAuditLog('切換地區價目', `${currentRegionLabel}（${currentRegionMode}）`);
  }

  async function autoDetectRegion() {
    localStorage.removeItem(REGION_STORAGE_KEY);
    const selector = document.getElementById('regionSelect');
    if (selector) selector.value = 'auto';
    await handleRegionChange('auto');
    await refreshSiteWeather(true);
  }

  function updateRegionChip() {
    const chip = document.getElementById('materialRegionChip');
    if (!chip) return;
    chip.innerHTML = `地區：<strong>${currentRegionLabel}</strong>（${currentRegionMode}）`;
  }

  function updateMaterialSourceChip() {
    const chip = document.getElementById('materialSourceChip');
    if (!chip) return;
    const file = String(currentMaterialSourceMeta.file || '未同步');
    const generatedAt = String(currentMaterialSourceMeta.generatedAt || '').trim();
    const timeText = generatedAt ? ` / ${generatedAt}` : '';
    const isFallback = String(currentMaterialSourceMeta.updateMode || '').trim() === 'fallback_seasonal_factor';
    const factor = String(currentMaterialSourceMeta.seasonalFactor || '').trim();
    const warningText = isFallback
      ? ` ｜ <strong>估算價模式</strong>${factor ? ` (x${factor})` : ''}`
      : '';
    chip.innerHTML = `資料來源：<strong>${file}</strong>${timeText}${warningText}`;
    chip.classList.toggle('material-chip-warning', isFallback);
  }

  function normalizeRegionName(name) {
    const text = String(name || '');
    if (text.includes('台中') || text.includes('臺中')) return '台中市';
    if (text.includes('台北') || text.includes('臺北')) return '台北市';
    if (text.includes('新北')) return '新北市';
    if (text.includes('桃園')) return '桃園市';
    if (text.includes('台南') || text.includes('臺南')) return '台南市';
    if (text.includes('高雄')) return '高雄市';
    return '';
  }

  function renderMaterialOptions(items) {
    const select = document.getElementById('materialSelect');
    if (!select) return;
    select.innerHTML = '<option value="">請選擇材料項目</option>';
    items.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.name;
      const unitText = item.unit ? ` ${item.unit}` : '';
      opt.textContent = `${item.name}  |  ${item.price.toLocaleString()}${unitText}`;
      select.appendChild(opt);
    });
  }

  function normalizeText(text) {
    return (text || '').toLowerCase().replace(/\s+/g, '');
  }

  function filterMaterialCatalog(keyword) {
    const q = normalizeText(keyword);
    const filtered = materialCatalog.filter(item => normalizeText(item.name).includes(q));
    renderMaterialOptions(filtered);
    selectedMaterial = filtered.length === 1 ? filtered[0] : null;
    updateMaterialChips(filtered.length, selectedMaterial, materialCatalog.length);
  }

  function selectMaterialFromDropdown(name) {
    selectedMaterial = materialCatalog.find(item => item.name === name) || null;
    updateMaterialChips(materialCatalog.length, selectedMaterial);
  }

  function updateMaterialChips(count, material, totalCount) {
    const countChip = document.getElementById('materialCountChip');
    const priceChip = document.getElementById('materialPriceChip');
    const total = Number.isFinite(totalCount) ? totalCount : count;
    if (countChip) {
      if (count !== total) countChip.innerHTML = `資料筆數：<strong>${count}</strong> / <span style="color:#9bc2e5;">總 ${total}</span>`;
      else countChip.innerHTML = `資料筆數：<strong>${count}</strong>`;
    }
    if (priceChip) {
      if (material) {
        const unitText = material.unit ? ` / ${material.unit}` : '';
        priceChip.innerHTML = `目前單價：<strong>${material.price.toLocaleString()}${unitText}</strong>`;
      } else {
        priceChip.innerHTML = '目前單價：<strong>尚未選取</strong>';
      }
    }
  }

  function applySelectedMaterialPrice() {
    if (!selectedMaterial) return showToast('請先從試算表項目選擇材料');
    const unitPriceInput = document.getElementById('unitPrice');
    const customNameInput = document.getElementById('customName');
    unitPriceInput.value = selectedMaterial.price;
    if (!customNameInput.value.trim()) customNameInput.value = selectedMaterial.name;
    previewCalc();
    showToast(`已套用「${selectedMaterial.name}」單價`);
  }

  global.normalizeMaterialItems = normalizeMaterialItems;
  global.loadMaterialCatalog = loadMaterialCatalog;
  global.handleRegionChange = handleRegionChange;
  global.autoDetectRegion = autoDetectRegion;
  global.updateRegionChip = updateRegionChip;
  global.updateMaterialSourceChip = updateMaterialSourceChip;
  global.normalizeRegionName = normalizeRegionName;
  global.renderMaterialOptions = renderMaterialOptions;
  global.normalizeText = normalizeText;
  global.filterMaterialCatalog = filterMaterialCatalog;
  global.selectMaterialFromDropdown = selectMaterialFromDropdown;
  global.updateMaterialChips = updateMaterialChips;
  global.applySelectedMaterialPrice = applySelectedMaterialPrice;
})(window);
