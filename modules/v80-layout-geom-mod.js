// Layout geometry and control-point validation helpers (v8.0).
(function attachV80LayoutGeomModule(global) {
  function normalizePointPrecision(value, step = 0.005) {
    const n = Number(value);
    if (!Number.isFinite(n)) return NaN;
    return Math.round(n / step) * step;
  }

  function readLayoutControlPair(index) {
    const dx = Number(document.getElementById(`layoutCp${index}DesignX`)?.value);
    const dy = Number(document.getElementById(`layoutCp${index}DesignY`)?.value);
    const fx = Number(document.getElementById(`layoutCp${index}FieldX`)?.value);
    const fy = Number(document.getElementById(`layoutCp${index}FieldY`)?.value);
    if (![dx, dy, fx, fy].every(Number.isFinite)) return null;
    return {
      design: { x: dx, y: dy },
      field: { x: fx, y: fy }
    };
  }

  function formatLayoutAlignmentSummary(state) {
    if (!state) return '控制點配準：尚未套用';
    const rmsText = Number.isFinite(state.rmsError) ? `、RMS ${state.rmsError.toFixed(4)}` : '';
    const maxText = Number.isFinite(state.maxError) ? `、MAX ${state.maxError.toFixed(4)}` : '';
    const adviceText = state.adviceLevel ? `、建議 ${state.adviceLevel}` : '';
    return `控制點配準：平移(${state.tx.toFixed(3)}, ${state.ty.toFixed(3)})、旋轉 ${state.rotationDeg.toFixed(2)}°、比例 ${state.scale.toFixed(5)}${rmsText}${maxText}${adviceText}`;
  }

  function getLayoutAlignmentAdvice(rmsError) {
    if (!Number.isFinite(rmsError)) return '待檢核';
    if (rmsError <= 0.02) return '可施工';
    if (rmsError <= 0.05) return '建議複核後施工';
    if (rmsError <= 0.10) return '建議補控制點再配準';
    return '不建議施工（需重新配準）';
  }

  function pointDistance2D(a, b) {
    const dx = (Number(a && a.x) || 0) - (Number(b && b.x) || 0);
    const dy = (Number(a && a.y) || 0) - (Number(b && b.y) || 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function triangleArea2D(a, b, c) {
    const ax = Number(a && a.x) || 0;
    const ay = Number(a && a.y) || 0;
    const bx = Number(b && b.x) || 0;
    const by = Number(b && b.y) || 0;
    const cx = Number(c && c.x) || 0;
    const cy = Number(c && c.y) || 0;
    return Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) * 0.5;
  }

  function evaluateControlPointQuality(pairs) {
    const validPairs = Array.isArray(pairs) ? pairs.filter(pair => pair && pair.design && pair.field) : [];
    if (validPairs.length < 2) {
      return { ok: false, reason: '控制點不足，至少需要 2 點' };
    }

    const design = validPairs.map(pair => pair.design);
    const field = validPairs.map(pair => pair.field);
    let minDesignDist = Infinity;
    let minFieldDist = Infinity;
    let maxDesignDist = 0;
    let maxFieldDist = 0;

    for (let i = 0; i < validPairs.length; i += 1) {
      for (let j = i + 1; j < validPairs.length; j += 1) {
        const dd = pointDistance2D(design[i], design[j]);
        const fd = pointDistance2D(field[i], field[j]);
        if (Number.isFinite(dd)) {
          minDesignDist = Math.min(minDesignDist, dd);
          maxDesignDist = Math.max(maxDesignDist, dd);
        }
        if (Number.isFinite(fd)) {
          minFieldDist = Math.min(minFieldDist, fd);
          maxFieldDist = Math.max(maxFieldDist, fd);
        }
      }
    }

    if (!Number.isFinite(minDesignDist) || !Number.isFinite(minFieldDist)) {
      return { ok: false, reason: '控制點資料異常，請重新輸入' };
    }
    if (minDesignDist < 0.02 || minFieldDist < 0.02) {
      return { ok: false, reason: '控制點距離過近（< 0.02），請拉開控制點距離' };
    }

    const scaleSpanRatio = maxFieldDist > 0 ? (maxDesignDist / maxFieldDist) : 0;
    if (!Number.isFinite(scaleSpanRatio) || scaleSpanRatio <= 0 || scaleSpanRatio > 20 || scaleSpanRatio < 0.05) {
      return { ok: false, reason: '控制點比例異常，請檢查設計座標與現地座標是否同單位' };
    }

    if (validPairs.length >= 3) {
      const designArea = triangleArea2D(design[0], design[1], design[2]);
      const fieldArea = triangleArea2D(field[0], field[1], field[2]);
      const designSpan = Math.max(0.001, maxDesignDist);
      const fieldSpan = Math.max(0.001, maxFieldDist);
      const designCollinearRatio = designArea / (designSpan * designSpan);
      const fieldCollinearRatio = fieldArea / (fieldSpan * fieldSpan);
      if (designCollinearRatio < 0.0025 || fieldCollinearRatio < 0.0025) {
        return { ok: false, reason: '控制點接近共線，請調整第 3 點到不同方位' };
      }
    }

    return {
      ok: true,
      qualityText: `控制點檢核通過｜最短距離 設計 ${minDesignDist.toFixed(3)} / 現地 ${minFieldDist.toFixed(3)}`
    };
  }

  function assignLayoutGroups(points) {
    const groups = new Map();
    const groupedPoints = points.map(p => {
      const xBucket = Math.floor((Number(p.x) || 0) / 10);
      const yBucket = Math.floor((Number(p.y) || 0) / 10);
      const floor = String(p.floorTag || 'BIM').trim() || 'BIM';
      const key = `${floor}|${xBucket}|${yBucket}`;
      const count = (groups.get(key) || 0) + 1;
      groups.set(key, count);
      return {
        ...p,
        layoutGroup: `G-${floor}-${xBucket}_${yBucket}`
      };
    });
    return { points: groupedPoints, groupCount: groups.size };
  }

  global.normalizePointPrecision = normalizePointPrecision;
  global.readLayoutControlPair = readLayoutControlPair;
  global.formatLayoutAlignmentSummary = formatLayoutAlignmentSummary;
  global.getLayoutAlignmentAdvice = getLayoutAlignmentAdvice;
  global.pointDistance2D = pointDistance2D;
  global.triangleArea2D = triangleArea2D;
  global.evaluateControlPointQuality = evaluateControlPointQuality;
  global.assignLayoutGroups = assignLayoutGroups;
})(window);
