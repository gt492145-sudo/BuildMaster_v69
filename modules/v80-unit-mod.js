// Unit conversion module (v8.0).
(function attachV80UnitModule(global) {
  function initUnitSelectors() {
    const fromSel = document.getElementById('unitFrom');
    const toSel = document.getElementById('unitTo');
    if (!fromSel || !toSel) return;
    [fromSel, toSel].forEach(sel => {
      sel.innerHTML = '';
      UNIT_OPTIONS.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = u;
        sel.appendChild(opt);
      });
    });
    fromSel.value = 'm²';
    toSel.value = '坪';
  }

  function normalizeUnitToken(unit) {
    const u = String(unit || '').trim();
    if (!u) return '';
    if (u === '呎') return '尺';
    if (u === '平方公尺') return 'm²';
    if (u === '立方公尺') return 'm³';
    return u;
  }

  function unitFamily(unit) {
    const u = normalizeUnitToken(unit);
    if (['m', '尺'].includes(u)) return 'length';
    if (['m²', '坪', '建坪', '才'].includes(u)) return 'area';
    if (['m³'].includes(u)) return 'volume';
    if (['噸'].includes(u)) return 'mass';
    if (['件', '組', '台', '戶', '樘', '只', '工', '次', '包', '塊'].includes(u)) return 'count';
    return '';
  }

  function toBaseUnit(value, unit) {
    const u = normalizeUnitToken(unit);
    const v = Number(value);
    if (!Number.isFinite(v)) return null;
    if (u === 'm') return { family: 'length', value: v };
    if (u === '尺') return { family: 'length', value: v * 0.30303 };
    if (u === 'm²') return { family: 'area', value: v };
    if (u === '坪' || u === '建坪') return { family: 'area', value: v * 3.305785 };
    if (u === '才') return { family: 'area', value: v * 0.091827 };
    if (u === 'm³') return { family: 'volume', value: v };
    if (u === '噸') return { family: 'mass', value: v };
    if (unitFamily(u) === 'count') return { family: 'count', value: v };
    return null;
  }

  function fromBaseUnit(baseValue, targetUnit) {
    const u = normalizeUnitToken(targetUnit);
    const v = Number(baseValue);
    if (!Number.isFinite(v)) return null;
    if (u === 'm') return v;
    if (u === '尺') return v / 0.30303;
    if (u === 'm²') return v;
    if (u === '坪' || u === '建坪') return v / 3.305785;
    if (u === '才') return v / 0.091827;
    if (u === 'm³') return v;
    if (u === '噸') return v;
    if (unitFamily(u) === 'count') return v;
    return null;
  }

  function convertValueBetweenUnits(value, fromUnit, toUnit) {
    const from = toBaseUnit(value, fromUnit);
    if (!from) return null;
    const toFamily = unitFamily(toUnit);
    if (!toFamily || toFamily !== from.family) return null;
    const out = fromBaseUnit(from.value, toUnit);
    return out;
  }

  function runUnitConvert() {
    const val = Number(document.getElementById('unitConvertValue').value || 0);
    const from = document.getElementById('unitFrom').value;
    const to = document.getElementById('unitTo').value;
    const resultBox = document.getElementById('unitConvertResult');
    const out = convertValueBetweenUnits(val, from, to);
    if (out === null) {
      resultBox.innerText = `結果：無法從 ${from} 換算到 ${to}`;
      return showToast('單位不相容，請確認同類型單位');
    }
    const rounded = Math.round(out * 10000) / 10000;
    resultBox.innerText = `結果：${val} ${from} = ${rounded} ${to}`;
    addAuditLog('單位換算', `${val} ${from} -> ${rounded} ${to}`);
    showToast(`單位換算完成：${rounded} ${to}`);
  }

  global.initUnitSelectors = initUnitSelectors;
  global.normalizeUnitToken = normalizeUnitToken;
  global.unitFamily = unitFamily;
  global.toBaseUnit = toBaseUnit;
  global.fromBaseUnit = fromBaseUnit;
  global.convertValueBetweenUnits = convertValueBetweenUnits;
  global.runUnitConvert = runUnitConvert;
})(window);
