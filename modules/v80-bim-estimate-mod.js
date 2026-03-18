// BIM estimate and import workflow module (v8.0).
(function attachV80BimEstimateModule(global) {
  function generateBIMEstimate() {
    if (!bimModelData || !bimModelData.totalEntities) {
      return showToast('請先上傳模型檔');
    }
    if (!materialCatalog.length) {
      return showToast('尚未載入材料價格資料');
    }

    const entries = Object.entries(bimModelData.typeCounts)
      .filter(([type, count]) => isIfcElementType(type) && count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);

    bimEstimateRows = entries.map(([type, count]) => {
      const material = mapIfcTypeToMaterial(type);
      const price = material ? Number(material.price) || 0 : 0;
      const sourceUnit = inferIfcQuantityUnit(type);
      const priceUnit = material && material.unit ? normalizeUnitToken(material.unit) : sourceUnit;
      const convertedQty = convertValueBetweenUnits(count, sourceUnit, priceUnit);
      const effectiveQty = Number.isFinite(convertedQty) ? convertedQty : count;
      const subtotal = effectiveQty * price;
      return {
        ifcType: type,
        materialName: material ? material.name : '未匹配',
        qty: count,
        unit: sourceUnit,
        priceUnit,
        effectiveQty,
        price,
        subtotal,
        unitMismatch: !!material && sourceUnit !== priceUnit && !Number.isFinite(convertedQty)
      };
    });

    renderBimEstimateTableFromRows();

    const unmatched = bimEstimateRows.filter(r => !r.price).length;
    const mismatch = bimEstimateRows.filter(r => r.unitMismatch).length;
    addAuditLog('生成 BIM 估價', `${bimEstimateRows.length} 筆，未匹配 ${unmatched}，單位不相容 ${mismatch}`);
    if (unmatched > 0) {
      showToast(`BIM 估價完成（${bimEstimateRows.length} 筆，${unmatched} 筆未匹配）`);
    } else {
      showToast(`BIM 估價完成（${bimEstimateRows.length} 筆）`);
    }
  }

  function inferCategoryFromName(name) {
    const n = String(name || '');
    if (n.includes('鋼筋') || n.includes('綁紮')) return 'STEEL';
    if (n.includes('模板')) return 'MOLD';
    if (n.includes('混凝土')) return 'CEMENT';
    if (n.includes('土') || n.includes('挖掘')) return 'EARTH';
    return 'MOLD';
  }

  function setBimAutoCalcInfo(text, color) {
    const box = document.getElementById('bimAutoCalcInfo');
    if (!box) return;
    box.innerText = text;
    if (color) box.style.color = color;
  }

  function runBimTechAutoCalculation() {
    if (!bimModelData || !bimModelData.totalEntities) {
      setBimAutoCalcInfo('BIM 技術自動計算：請先上傳模型檔', '#ffd48a');
      return showToast('請先上傳模型檔');
    }
    if (!materialCatalog.length) {
      setBimAutoCalcInfo('BIM 技術自動計算：尚未載入材料價格', '#ffd48a');
      return showToast('尚未載入材料價格資料');
    }

    generateBIMEstimate();
    if (!bimEstimateRows.length) {
      setBimAutoCalcInfo('BIM 技術自動計算：估價筆數為 0', '#ffd48a');
      return showToast('目前沒有可計算的 BIM 估價項目');
    }

    createDataSnapshot('BIM技術自動計算前', true);
    const floor = (document.getElementById('floor_tag') && document.getElementById('floor_tag').value.trim()) || 'BIM-AUTO';
    const before = list.length;
    const cleaned = list.filter(item => !String(item && item.name ? item.name : '').includes('[BIM-AUTO]'));
    const removedAuto = before - cleaned.length;
    list = cleaned;

    let imported = 0;
    for (const row of bimEstimateRows) {
      if (!row.price || row.qty <= 0) continue;
      list.push({
        floor: escapeHTML(floor),
        name: escapeHTML(`BIM-${formatIfcTypeDisplay(row.ifcType)} [${row.materialName}] [BIM-AUTO]`),
        res: row.qty,
        up: row.price,
        totalCost: row.subtotal,
        cat: inferCategoryFromName(row.materialName),
        unit: row.unit
      });
      imported += 1;
    }

    if (!imported) {
      setBimAutoCalcInfo('BIM 技術自動計算：沒有可匯入項目（請補齊材料對應）', '#ffd48a');
      return showToast('沒有可匯入的 BIM 估價項目');
    }

    saveData();
    renderTable();
    const unmatched = bimEstimateRows.filter(r => !r.price).length;
    const estimatedTotal = bimEstimateRows.reduce((sum, row) => sum + (Number(row.subtotal) || 0), 0);
    addAuditLog('BIM技術自動計算', `估價 ${bimEstimateRows.length} 筆、匯入 ${imported} 筆、替換舊自動 ${removedAuto} 筆`);
    setBimAutoCalcInfo(
      `BIM 技術自動計算完成：估價 ${bimEstimateRows.length} 筆｜匯入 ${imported} 筆｜未匹配 ${unmatched} 筆｜預估 ${Math.round(estimatedTotal).toLocaleString()} 元`,
      '#9ef5c2'
    );
    showToast(`BIM 技術自動計算完成：已匯入 ${imported} 筆（已替換舊自動 ${removedAuto} 筆）`);
  }

  function importBIMEstimateToList() {
    if (!bimEstimateRows.length) {
      return showToast('請先執行 BIM 自動估價預覽');
    }
    createDataSnapshot('匯入估價前', true);
    const floor = document.getElementById('floor_tag').value.trim() || 'BIM';
    let imported = 0;
    for (const row of bimEstimateRows) {
      if (!row.price || row.qty <= 0) continue;
      list.push({
        floor: escapeHTML(floor),
        name: escapeHTML(`BIM-${formatIfcTypeDisplay(row.ifcType)} [${row.materialName}]`),
        res: row.qty,
        up: row.price,
        totalCost: row.subtotal,
        cat: inferCategoryFromName(row.materialName),
        unit: row.unit
      });
      imported += 1;
    }
    if (!imported) return showToast('沒有可匯入的 BIM 估價項目');
    saveData();
    renderTable();
    addAuditLog('匯入 BIM 估價', `匯入 ${imported} 筆`);
    showToast(`已匯入 ${imported} 筆 BIM 估價到清單`);
  }

  global.generateBIMEstimate = generateBIMEstimate;
  global.inferCategoryFromName = inferCategoryFromName;
  global.setBimAutoCalcInfo = setBimAutoCalcInfo;
  global.runBimTechAutoCalculation = runBimTechAutoCalculation;
  global.importBIMEstimateToList = importBIMEstimateToList;
})(window);
