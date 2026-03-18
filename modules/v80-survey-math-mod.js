// Survey math/geometry helpers module (v8.0).
(function attachV80SurveyMathModule(global) {
  // Approximate conversion widely used for Taiwan plane coordinates.
  function twd97ToTwd67(e97, n97) {
    const e = Number(e97);
    const n = Number(n97);
    if (!Number.isFinite(e) || !Number.isFinite(n)) return { e: NaN, n: NaN };
    return {
      e: e - 807.8 - 0.00001549 * e - 0.000006521 * n,
      n: n + 248.6 - 0.00001549 * n - 0.000006521 * e
    };
  }

  function twd67ToTwd97(e67, n67) {
    const e = Number(e67);
    const n = Number(n67);
    if (!Number.isFinite(e) || !Number.isFinite(n)) return { e: NaN, n: NaN };
    return {
      e: e + 807.8 + 0.00001549 * e + 0.000006521 * n,
      n: n - 248.6 + 0.00001549 * n + 0.000006521 * e
    };
  }

  function decimalDegToDms(deg) {
    const normalized = ((Number(deg) % 360) + 360) % 360;
    const d = Math.floor(normalized);
    const mFloat = (normalized - d) * 60;
    const m = Math.floor(mFloat);
    const s = (mFloat - m) * 60;
    return `${d}°${String(m).padStart(2, '0')}'${s.toFixed(2).padStart(5, '0')}"`;
  }

  function toM2Units(areaM2) {
    const m2 = Number(areaM2) || 0;
    return {
      m2,
      ping: m2 / 3.305785,
      ha: m2 / 10000,
      jia: m2 / 9699.174
    };
  }

  function parsePolygonPoints(rawText) {
    const raw = String(rawText || '').replace(/\r/g, '\n');
    const rows = raw.split('\n').map(s => s.trim()).filter(Boolean);
    const points = [];
    const errors = [];
    rows.forEach((line, idx) => {
      const normalized = line.replace(/\s+/g, ',');
      const cells = normalized.split(',').map(s => s.trim()).filter(Boolean);
      if (cells.length < 2) {
        errors.push(`第 ${idx + 1} 行：欄位不足，需 E,N`);
        return;
      }
      const e = Number(cells[0]);
      const n = Number(cells[1]);
      if (!Number.isFinite(e) || !Number.isFinite(n)) {
        errors.push(`第 ${idx + 1} 行：E/N 不是數字`);
        return;
      }
      points.push({ e, n });
    });
    return { points, errors };
  }

  function signedShoelaceArea(points) {
    const ps = Array.isArray(points) ? points : [];
    if (ps.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < ps.length; i += 1) {
      const a = ps[i];
      const b = ps[(i + 1) % ps.length];
      sum += (a.e * b.n) - (b.e * a.n);
    }
    return sum / 2;
  }

  function computeDistance2D(a, b) {
    const dx = Number(a.x) - Number(b.x);
    const dy = Number(a.y) - Number(b.y);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function findNearDuplicatePairs(points, thresholdM) {
    const th = Math.max(0.0001, Number(thresholdM) || 0.02);
    const arr = Array.isArray(points) ? points : [];
    const pairs = [];
    for (let i = 0; i < arr.length; i += 1) {
      for (let j = i + 1; j < arr.length; j += 1) {
        const d = computeDistance2D({ x: arr[i].x, y: arr[i].y }, { x: arr[j].x, y: arr[j].y });
        if (d <= th) {
          pairs.push({
            a: arr[i].id || `P${i + 1}`,
            b: arr[j].id || `P${j + 1}`,
            distance: d
          });
        }
      }
    }
    return pairs;
  }

  function isWithinTaiwanTwd97Range(e, n) {
    const E = Number(e);
    const N = Number(n);
    if (!Number.isFinite(E) || !Number.isFinite(N)) return false;
    return E >= 120000 && E <= 360000 && N >= 2400000 && N <= 2800000;
  }

  function buildRangeWarnings(points) {
    const warnings = [];
    (Array.isArray(points) ? points : []).forEach((p, idx) => {
      const ok = isWithinTaiwanTwd97Range(p.x, p.y);
      if (!ok) warnings.push(`${p.id || `P${idx + 1}`}(${Number(p.x).toFixed(3)},${Number(p.y).toFixed(3)})`);
    });
    return warnings;
  }

  function getTraverseClosureGrade(closureRatio) {
    const r = Number(closureRatio);
    if (!Number.isFinite(r)) return { grade: 'A+', color: '#8ff7c0', hint: '理想（閉合差≈0）' };
    if (r >= 10000) return { grade: 'A', color: '#8ff7c0', hint: '可施工' };
    if (r >= 5000) return { grade: 'B', color: '#ffe39e', hint: '建議複核後施工' };
    if (r >= 2000) return { grade: 'C', color: '#ffc68f', hint: '建議重測部分導線' };
    return { grade: 'D', color: '#ffb2b2', hint: '不建議直接施工' };
  }

  function evaluateDistanceIntersectionGeometry(baseDist, radiusA, radiusB, heightFromChord) {
    const d = Math.max(1e-12, Number(baseDist) || 0);
    const h = Math.max(0, Number(heightFromChord) || 0);
    const sinHalf = Math.max(0, Math.min(1, h / (Math.max(1e-12, Number(radiusA) || d))));
    const angleDegApprox = Math.max(0, Math.min(180, (2 * Math.asin(sinHalf)) * 180 / Math.PI));
    const nearTangent = h / d < 0.02 || angleDegApprox < 12;
    const nearConcentric = d < Math.abs((Number(radiusA) || 0) - (Number(radiusB) || 0)) + 0.01;
    const weak = nearTangent || nearConcentric;
    return {
      weak,
      angleDegApprox,
      hint: weak ? '幾何弱化（交角過小/近相切），建議改點位或補觀測' : '幾何條件良好'
    };
  }

  function evaluateBearingIntersectionGeometry(azAdeg, azBdeg) {
    const a = (Number(azAdeg) || 0) * Math.PI / 180;
    const b = (Number(azBdeg) || 0) * Math.PI / 180;
    const ua = { x: Math.sin(a), y: Math.cos(a) };
    const ub = { x: Math.sin(b), y: Math.cos(b) };
    const dot = Math.max(-1, Math.min(1, ua.x * ub.x + ua.y * ub.y));
    const raw = Math.acos(dot) * 180 / Math.PI;
    const intersectAngle = raw > 90 ? 180 - raw : raw;
    const weak = intersectAngle < 15;
    return {
      weak,
      intersectAngle,
      hint: weak ? '幾何弱化（交角過小），建議拉開站點方位夾角' : '幾何條件良好'
    };
  }

  function parseMultiSlopeSegments(text) {
    const rows = String(text || '').replace(/\r/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
    const segments = [];
    const errors = [];
    rows.forEach((row, idx) => {
      const cols = row.split(',').map(s => s.trim()).filter(Boolean);
      if (cols.length < 2) {
        errors.push(`第 ${idx + 1} 行：需 水平距,坡度%`);
        return;
      }
      const hDist = Number(cols[0]);
      const slopePct = Number(cols[1]);
      if (!Number.isFinite(hDist) || hDist < 0 || !Number.isFinite(slopePct)) {
        errors.push(`第 ${idx + 1} 行：格式錯誤（水平距或坡度%）`);
        return;
      }
      segments.push({ hDist, slopePct });
    });
    return { segments, errors };
  }

  function parseStakeCsvText(csvText) {
    const lines = String(csvText || '').replace(/\r/g, '\n').split('\n');
    const rows = lines.map(s => s.trim()).filter(Boolean);
    const points = [];
    const errors = [];
    rows.forEach((line, idx) => {
      const cols = line.split(',').map(s => s.trim());
      if (!cols.length) return;
      // skip likely header
      if (idx === 0 && /點號|point|name|e|n/i.test(cols.join(' '))) return;
      if (cols.length < 3) {
        errors.push(`第 ${idx + 1} 行：缺欄位，至少需 點號,E,N`);
        return;
      }
      const pointId = cols[0] || `P${idx + 1}`;
      const e = Number(cols[1]);
      const n = Number(cols[2]);
      const h = cols.length >= 4 && cols[3] !== '' ? Number(cols[3]) : 0;
      if (!Number.isFinite(e) || !Number.isFinite(n)) {
        errors.push(`第 ${idx + 1} 行：E 或 N 非數字`);
        return;
      }
      if (!Number.isFinite(h)) {
        errors.push(`第 ${idx + 1} 行：H 非數字`);
        return;
      }
      points.push({ pointId, e, n, h });
    });
    return { points, errors };
  }

  function parseTraverseSegments(text) {
    const rows = String(text || '').replace(/\r/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
    const segments = [];
    const errors = [];
    rows.forEach((row, idx) => {
      const cols = row.split(',').map(s => s.trim()).filter(Boolean);
      if (cols.length < 2) {
        errors.push(`第 ${idx + 1} 行：需 方位角,距離`);
        return;
      }
      const az = Number(cols[0]);
      const dist = Number(cols[1]);
      if (!Number.isFinite(az) || !Number.isFinite(dist) || dist < 0) {
        errors.push(`第 ${idx + 1} 行：方位角或距離格式錯誤`);
        return;
      }
      segments.push({ azDeg: az, distance: dist });
    });
    return { segments, errors };
  }

  global.twd97ToTwd67 = twd97ToTwd67;
  global.twd67ToTwd97 = twd67ToTwd97;
  global.decimalDegToDms = decimalDegToDms;
  global.toM2Units = toM2Units;
  global.parsePolygonPoints = parsePolygonPoints;
  global.signedShoelaceArea = signedShoelaceArea;
  global.computeDistance2D = computeDistance2D;
  global.findNearDuplicatePairs = findNearDuplicatePairs;
  global.isWithinTaiwanTwd97Range = isWithinTaiwanTwd97Range;
  global.buildRangeWarnings = buildRangeWarnings;
  global.getTraverseClosureGrade = getTraverseClosureGrade;
  global.evaluateDistanceIntersectionGeometry = evaluateDistanceIntersectionGeometry;
  global.evaluateBearingIntersectionGeometry = evaluateBearingIntersectionGeometry;
  global.parseMultiSlopeSegments = parseMultiSlopeSegments;
  global.parseStakeCsvText = parseStakeCsvText;
  global.parseTraverseSegments = parseTraverseSegments;
})(window);
