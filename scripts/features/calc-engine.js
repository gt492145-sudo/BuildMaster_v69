    // --- 核心計算引擎 (統一公式) ---
    function getRebarDiameter(val) {
        if (val === 3) return 9.53; if (val === 4) return 12.7; if (val === 5) return 15.9; 
        if (val === 6) return 19.1; if (val === 7) return 22.2; if (val === 8) return 25.4; 
        if (val === 10) return 32.2; return val; 
    }

    function getQuantityAdjustFactor(type, cat) {
        if (cat === 'CEMENT' || String(type || '').startsWith('C_')) return 1;
        if (cat === 'STEEL' || String(type || '').startsWith('R_')) return 1.10;
        return 1;
    }

    function readOptionalNumber(id, fallback = 0) {
        const input = document.getElementById(id);
        const n = Number(input && input.value);
        return Number.isFinite(n) ? n : fallback;
    }

    function getTemplateFormulaExtras() {
        return {
            surfaceMode: document.getElementById('templateSurfaceMode') ? document.getElementById('templateSurfaceMode').value : 'wall',
            beamBottomIncludedInSlab: !!(document.getElementById('beamBottomIncludedInSlab') && document.getElementById('beamBottomIncludedInSlab').checked),
            windowWidth: readOptionalNumber('templateWindowWidth', 0),
            windowHeight: readOptionalNumber('templateWindowHeight', 0),
            windowCount: readOptionalNumber('templateWindowCount', 0),
            openingWidth: readOptionalNumber('templateOpeningWidth', 0),
            openingHeight: readOptionalNumber('templateOpeningHeight', 0),
            openingCount: readOptionalNumber('templateOpeningCount', 0),
            wallThickness: readOptionalNumber('templateWallThickness', 0),
            floorHeight: readOptionalNumber('templateFloorHeight', 0),
            beamHeight: readOptionalNumber('templateBeamHeight', 0),
            spanCount: readOptionalNumber('templateSpanCount', 0),
            beamWallJointLength: readOptionalNumber('templateBeamWallJointLength', 0),
            slabThickness: readOptionalNumber('templateSlabThickness', 0),
            slabOpeningLength: readOptionalNumber('templateSlabOpeningLength', 0),
            slabOpeningWidth: readOptionalNumber('templateSlabOpeningWidth', 0),
            slabOpeningCount: readOptionalNumber('templateSlabOpeningCount', 0),
            elevatorOpeningLength: readOptionalNumber('templateElevatorOpeningLength', 0),
            elevatorOpeningWidth: readOptionalNumber('templateElevatorOpeningWidth', 0),
            elevatorOpeningCount: readOptionalNumber('templateElevatorOpeningCount', 0),
            shaftOpeningLength: readOptionalNumber('templateShaftOpeningLength', 0),
            shaftOpeningWidth: readOptionalNumber('templateShaftOpeningWidth', 0),
            shaftOpeningCount: readOptionalNumber('templateShaftOpeningCount', 0),
            pedestalLength: readOptionalNumber('templatePedestalLength', 0),
            pedestalWidth: readOptionalNumber('templatePedestalWidth', 0),
            pedestalCount: readOptionalNumber('templatePedestalCount', 0),
            beamJointLength: readOptionalNumber('templateBeamJointLength', 0),
            beamJointWidth: readOptionalNumber('templateBeamJointWidth', 0),
            beamJointSpanCount: readOptionalNumber('templateBeamJointSpanCount', 0),
            stairMidPlatformWidth: readOptionalNumber('templateStairMidPlatformWidth', 0),
            stairPlatformLength: readOptionalNumber('templateStairPlatformLength', 0),
            stairUpperPlatformWidth: readOptionalNumber('templateStairUpperPlatformWidth', 0),
            stairFloorHeight: readOptionalNumber('templateStairFloorHeight', 0)
        };
    }

    function buildDefaultTemplateBreakdown() {
        return {
            mode: 'basic',
            windowDeduct: 0,
            openingDeduct: 0,
            columnWallJointDeduct: 0,
            beamWallJointDeduct: 0,
            slabOpeningDeduct: 0,
            elevatorOpeningDeduct: 0,
            shaftOpeningDeduct: 0,
            slabEdgeAdd: 0,
            beamBottomDeduct: 0,
            pedestalDeduct: 0,
            beamJointDeduct: 0
        };
    }

    function getTemplateDeductTotal(breakdown = {}) {
        return [
            Number(breakdown.windowDeduct || 0),
            Number(breakdown.openingDeduct || 0),
            Number(breakdown.columnWallJointDeduct || 0),
            Number(breakdown.beamWallJointDeduct || 0),
            Number(breakdown.slabOpeningDeduct || 0),
            Number(breakdown.elevatorOpeningDeduct || 0),
            Number(breakdown.shaftOpeningDeduct || 0),
            Number(breakdown.beamBottomDeduct || 0),
            Number(breakdown.pedestalDeduct || 0),
            Number(breakdown.beamJointDeduct || 0)
        ].reduce((sum, value) => sum + value, 0);
    }

    function calculateTemplateMoldAdjustment(type, v1, v2, v3, n, extras = {}) {
        const breakdown = buildDefaultTemplateBreakdown();
        if (type === 'M_WALL') {
            const mode = String(extras.surfaceMode || 'wall');
            breakdown.mode = mode;
            if (mode === 'slab') {
                const thickness = Math.max(0, Number(extras.slabThickness) || 0);
                const openingLength = Math.max(0, Number(extras.slabOpeningLength) || 0);
                const openingWidth = Math.max(0, Number(extras.slabOpeningWidth) || 0);
                const openingCount = Math.max(0, Number(extras.slabOpeningCount) || 0);
                const elevatorOpeningLength = Math.max(0, Number(extras.elevatorOpeningLength) || 0);
                const elevatorOpeningWidth = Math.max(0, Number(extras.elevatorOpeningWidth) || 0);
                const elevatorOpeningCount = Math.max(0, Number(extras.elevatorOpeningCount) || 0);
                const shaftOpeningLength = Math.max(0, Number(extras.shaftOpeningLength) || 0);
                const shaftOpeningWidth = Math.max(0, Number(extras.shaftOpeningWidth) || 0);
                const shaftOpeningCount = Math.max(0, Number(extras.shaftOpeningCount) || 0);
                const pedestalLength = Math.max(0, Number(extras.pedestalLength) || 0);
                const pedestalWidth = Math.max(0, Number(extras.pedestalWidth) || 0);
                const pedestalCount = Math.max(0, Number(extras.pedestalCount) || 0);
                const beamJointLength = Math.max(0, Number(extras.beamJointLength) || 0);
                const beamJointWidth = Math.max(0, Number(extras.beamJointWidth) || 0);
                const beamJointSpanCount = Math.max(0, Number(extras.beamJointSpanCount) || 0);
                breakdown.slabEdgeAdd = thickness > 0 ? thickness * (v1 + v2) * 2 * n : 0;
                breakdown.slabOpeningDeduct = thickness > 0 ? thickness * (openingLength * openingWidth) * openingCount * n : 0;
                breakdown.elevatorOpeningDeduct = thickness > 0 ? thickness * (elevatorOpeningLength * elevatorOpeningWidth) * elevatorOpeningCount * n : 0;
                breakdown.shaftOpeningDeduct = thickness > 0 ? thickness * (shaftOpeningLength * shaftOpeningWidth) * shaftOpeningCount * n : 0;
                breakdown.pedestalDeduct = pedestalLength * pedestalWidth * pedestalCount * n;
                breakdown.beamJointDeduct = beamJointLength * beamJointWidth * beamJointSpanCount * 2 * n;
                return breakdown;
            }
            const windowWidth = Math.max(0, (Number(extras.windowWidth) || 0) - 0.12);
            const windowHeight = Math.max(0, (Number(extras.windowHeight) || 0) - 0.12);
            const openingWidth = Math.max(0, (Number(extras.openingWidth) || 0) - 0.12);
            const openingHeight = Math.max(0, (Number(extras.openingHeight) || 0) - 0.12);
            const wallThickness = Math.max(0, Number(extras.wallThickness) || 0);
            const floorHeight = Math.max(0, Number(extras.floorHeight) || 0);
            const beamHeight = Math.max(0, Number(extras.beamHeight) || 0);
            const spanCount = Math.max(0, Number(extras.spanCount) || 0);
            const beamWallJointLength = Math.max(0, Number(extras.beamWallJointLength) || 0);
            breakdown.windowDeduct = windowWidth * windowHeight * Math.max(0, Number(extras.windowCount) || 0) * n;
            breakdown.openingDeduct = openingWidth * openingHeight * Math.max(0, Number(extras.openingCount) || 0) * n;
            breakdown.columnWallJointDeduct = wallThickness * Math.max(0, floorHeight - beamHeight) * spanCount * 2 * n;
            breakdown.beamWallJointDeduct = wallThickness * beamWallJointLength * n;
            return breakdown;
        }
        if (type === 'M_BEAM_ALL' && extras.beamBottomIncludedInSlab) {
            breakdown.beamBottomDeduct = v2 * v1 * n;
        }
        return breakdown;
    }

    function summarizeTemplateBreakdown(type, breakdown = {}) {
        if (!breakdown) return '';
        const parts = [];
        const deductTotal = getTemplateDeductTotal(breakdown);
        if (deductTotal > 0) parts.push(`扣總數 ${deductTotal.toFixed(3)} M²`);
        if (type === 'M_WALL' && breakdown.mode === 'slab') {
            if (breakdown.slabOpeningDeduct) parts.push(`扣地板開口 ${breakdown.slabOpeningDeduct.toFixed(3)} M²`);
            if (breakdown.elevatorOpeningDeduct) parts.push(`扣電梯開口 ${breakdown.elevatorOpeningDeduct.toFixed(3)} M²`);
            if (breakdown.shaftOpeningDeduct) parts.push(`扣管道開口 ${breakdown.shaftOpeningDeduct.toFixed(3)} M²`);
            if (breakdown.pedestalDeduct) parts.push(`扣柱底座 ${breakdown.pedestalDeduct.toFixed(3)} M²`);
            if (breakdown.beamJointDeduct) parts.push(`扣梁接頭 ${breakdown.beamJointDeduct.toFixed(3)} M²`);
            if (breakdown.slabEdgeAdd) parts.push(`加四周封口 ${breakdown.slabEdgeAdd.toFixed(3)} M²`);
            return parts.join('｜');
        }
        if (breakdown.windowDeduct) parts.push(`扣窗口 ${breakdown.windowDeduct.toFixed(3)} M²`);
        if (breakdown.openingDeduct) parts.push(`扣開口 ${breakdown.openingDeduct.toFixed(3)} M²`);
        if (breakdown.columnWallJointDeduct) parts.push(`扣柱牆接頭 ${breakdown.columnWallJointDeduct.toFixed(3)} M²`);
        if (breakdown.beamWallJointDeduct) parts.push(`扣梁牆接頭 ${breakdown.beamWallJointDeduct.toFixed(3)} M²`);
        if (breakdown.beamBottomDeduct) parts.push(`扣樑底 ${breakdown.beamBottomDeduct.toFixed(3)} M²`);
        return parts.join('｜');
    }

    function updatePreviewSummaryCards(baseQtyText, adjustedQtyText, deductQtyText, costText) {
        const baseCard = document.getElementById('prevBaseQtyCard');
        const adjustedCard = document.getElementById('prevAdjustedQtyCard');
        const deductCard = document.getElementById('prevDeductQtyCard');
        const costCard = document.getElementById('prevCostCard');
        if (baseCard) baseCard.innerText = baseQtyText;
        if (adjustedCard) adjustedCard.innerText = adjustedQtyText;
        if (deductCard) deductCard.innerText = deductQtyText;
        if (costCard) costCard.innerText = costText;
    }

    // 抽出獨立的計算邏輯，確保預覽和加入清單的結果絕對一致
    function coreCalculate(type, v1, v2, v3, n, up, templateExtras = {}) {
        let baseRes = 0, unit = '', cat = '';
        let templateBreakdown = buildDefaultTemplateBreakdown();
        
        if (type === 'C_STAIR') {
            cat = 'CEMENT';
            baseRes = ((v1 + v2) * v3 / 2) * n;
            unit = 'M³';
        } else if (type === 'M_STAIR') {
            cat = 'MOLD';
            baseRes = (
                v1 * v2 +
                v1 * v3 +
                (Math.max(0, Number(templateExtras.stairMidPlatformWidth) || 0) * Math.max(0, Number(templateExtras.stairPlatformLength) || 0)) +
                (Math.max(0, Number(templateExtras.stairUpperPlatformWidth) || 0) * Math.max(0, Number(templateExtras.stairPlatformLength) || 0)) +
                (v1 * Math.max(0, Number(templateExtras.stairFloorHeight) || 0))
            ) * n;
            unit = 'M²';
        } else if (type === 'M_FOOTING_EDGE') {
            cat = 'MOLD';
            baseRes = v3 * (v1 + v2) * 2 * n;
            unit = 'M²';
        } else if (type.startsWith('C_') || type.startsWith('E_')) {
            cat = type.startsWith('C_') ? 'CEMENT' : 'EARTH';
            baseRes = v1 * v2 * v3 * n;
            unit = 'M³';
        } else if (type.startsWith('R_')) {
            cat = 'STEEL';
            let actualD = getRebarDiameter(v1); 
            let mult = (v3 === 0) ? 1 : v3; 
            baseRes = (Math.pow(actualD, 2) / 162) * v2 * mult * n;
            unit = 'Kg';
        } else if (type === 'M_COL') { 
            cat = 'MOLD'; baseRes = (v1 + v2) * 2 * v3 * n; unit = 'M²';
        } else if (type === 'M_BEAM_SIDES') { 
            cat = 'MOLD'; baseRes = v1 * v3 * 2 * n; unit = 'M²';
        } else if (type === 'M_BEAM_ALL') { 
            cat = 'MOLD'; baseRes = (v3 * 2 + v2) * v1 * n; unit = 'M²';
        } else if (type === 'M_WALL') { 
            cat = 'MOLD'; baseRes = v1 * v2 * n; unit = 'M²'; 
        }

        if (cat === 'MOLD' && !['M_STAIR', 'M_FOOTING_EDGE'].includes(String(type || ''))) {
            templateBreakdown = calculateTemplateMoldAdjustment(type, v1, v2, v3, n, templateExtras);
            baseRes = baseRes
                - Number(templateBreakdown.windowDeduct || 0)
                - Number(templateBreakdown.openingDeduct || 0)
                - Number(templateBreakdown.columnWallJointDeduct || 0)
                - Number(templateBreakdown.beamWallJointDeduct || 0)
                - Number(templateBreakdown.slabOpeningDeduct || 0)
                - Number(templateBreakdown.elevatorOpeningDeduct || 0)
                - Number(templateBreakdown.shaftOpeningDeduct || 0)
                - Number(templateBreakdown.beamBottomDeduct || 0)
                - Number(templateBreakdown.pedestalDeduct || 0)
                - Number(templateBreakdown.beamJointDeduct || 0)
                + Number(templateBreakdown.slabEdgeAdd || 0);
            baseRes = Math.max(0, baseRes);
        }

        const adjustFactor = getQuantityAdjustFactor(type, cat);
        const adjustedRes = baseRes * adjustFactor;
        const baseTotalCost = baseRes * up;
        const adjustedTotalCost = adjustedRes * up;
        return {
            baseRes,
            adjustFactor,
            res: adjustedRes,
            unit,
            cat,
            templateBreakdown,
            baseTotalCost,
            totalCost: adjustedTotalCost
        };
    }

    function roundCalc(v, digits = 8) {
        const n = Number(v) || 0;
        const p = Math.pow(10, digits);
        return Math.round(n * p) / p;
    }

    function getExtraWasteRateForType(type) {
        if (!String(type || '').startsWith('C_')) return 0;
        const input = document.getElementById('extraWasteRate');
        if (!input) return 0;
        const rate = Number(input.value);
        if (!Number.isFinite(rate)) return 0;
        return Math.min(40, Math.max(0, rate));
    }

    function parseDimensionValueToMeters(rawValue, type) {
        const text = String(rawValue ?? '').trim();
        if (!text) return NaN;
        const value = parseFloat(text);
        if (!Number.isFinite(value)) return NaN;
        const normalizedType = String(type || '');
        const supportsCmShortcut = normalizedType.startsWith('M_') || normalizedType.startsWith('C_') || normalizedType.startsWith('E_');
        if (!supportsCmShortcut) return value;
        const hasDecimal = text.includes('.');
        if (!hasDecimal && value >= 10 && value <= 9999) return value / 100;
        return value;
    }

    function normalizeDimensionInputDisplay(inputId) {
        const input = document.getElementById(inputId);
        const type = document.getElementById('calcType') ? document.getElementById('calcType').value : '';
        if (!input || !['v1', 'v2', 'v3'].includes(String(inputId || ''))) return;
        const normalized = parseDimensionValueToMeters(input.value, type);
        if (!Number.isFinite(normalized)) return;
        if (String(type || '').startsWith('M_') || String(type || '').startsWith('C_') || String(type || '').startsWith('E_')) {
            input.value = normalized.toFixed(2);
            previewCalc();
        }
    }

    // Independent audit path (formula duplicated intentionally for cross-check).
    function coreCalculateAudit(type, v1, v2, v3, n, up, templateExtras = {}) {
        let baseRes = 0, unit = '', cat = '';
        let templateBreakdown = buildDefaultTemplateBreakdown();
        if (type === 'C_STAIR') {
            cat = 'CEMENT';
            baseRes = roundCalc(((v1 + v2) * v3 / 2) * n);
            unit = 'M³';
        } else if (type === 'M_STAIR') {
            cat = 'MOLD';
            baseRes = roundCalc((
                v1 * v2 +
                v1 * v3 +
                (Math.max(0, Number(templateExtras.stairMidPlatformWidth) || 0) * Math.max(0, Number(templateExtras.stairPlatformLength) || 0)) +
                (Math.max(0, Number(templateExtras.stairUpperPlatformWidth) || 0) * Math.max(0, Number(templateExtras.stairPlatformLength) || 0)) +
                (v1 * Math.max(0, Number(templateExtras.stairFloorHeight) || 0))
            ) * n);
            unit = 'M²';
        } else if (type === 'M_FOOTING_EDGE') {
            cat = 'MOLD';
            baseRes = roundCalc(v3 * (v1 + v2) * 2 * n);
            unit = 'M²';
        } else if (type.startsWith('C_') || type.startsWith('E_')) {
            cat = type.startsWith('C_') ? 'CEMENT' : 'EARTH';
            baseRes = roundCalc(v1 * v2 * v3 * n);
            unit = 'M³';
        } else if (type.startsWith('R_')) {
            cat = 'STEEL';
            const actualD = getRebarDiameter(v1);
            const mult = (v3 === 0) ? 1 : v3;
            baseRes = roundCalc((Math.pow(actualD, 2) / 162) * v2 * mult * n);
            unit = 'Kg';
        } else if (type === 'M_COL') {
            cat = 'MOLD';
            baseRes = roundCalc((v1 + v2) * 2 * v3 * n);
            unit = 'M²';
        } else if (type === 'M_BEAM_SIDES') {
            cat = 'MOLD';
            baseRes = roundCalc(v1 * v3 * 2 * n);
            unit = 'M²';
        } else if (type === 'M_BEAM_ALL') {
            cat = 'MOLD';
            baseRes = roundCalc((v3 * 2 + v2) * v1 * n);
            unit = 'M²';
        } else if (type === 'M_WALL') {
            cat = 'MOLD';
            baseRes = roundCalc(v1 * v2 * n);
            unit = 'M²';
        }
        if (cat === 'MOLD' && !['M_STAIR', 'M_FOOTING_EDGE'].includes(String(type || ''))) {
            templateBreakdown = calculateTemplateMoldAdjustment(type, v1, v2, v3, n, templateExtras);
            baseRes = roundCalc(Math.max(0, baseRes
                - Number(templateBreakdown.windowDeduct || 0)
                - Number(templateBreakdown.openingDeduct || 0)
                - Number(templateBreakdown.columnWallJointDeduct || 0)
                - Number(templateBreakdown.beamWallJointDeduct || 0)
                - Number(templateBreakdown.slabOpeningDeduct || 0)
                - Number(templateBreakdown.elevatorOpeningDeduct || 0)
                - Number(templateBreakdown.shaftOpeningDeduct || 0)
                - Number(templateBreakdown.beamBottomDeduct || 0)
                - Number(templateBreakdown.pedestalDeduct || 0)
                - Number(templateBreakdown.beamJointDeduct || 0)
                + Number(templateBreakdown.slabEdgeAdd || 0)));
        }
        const adjustFactor = getQuantityAdjustFactor(type, cat);
        const adjustedRes = roundCalc(baseRes * adjustFactor);
        const baseTotalCost = roundCalc(baseRes * up);
        const adjustedTotalCost = roundCalc(adjustedRes * up);
        return {
            baseRes,
            adjustFactor,
            res: adjustedRes,
            unit,
            cat,
            templateBreakdown,
            baseTotalCost,
            totalCost: adjustedTotalCost
        };
    }

    function verifyCalculationConsistency(type, v1, v2, v3, n, up, templateExtras = {}) {
        const main = coreCalculate(type, v1, v2, v3, n, up, templateExtras);
        const audit = coreCalculateAudit(type, v1, v2, v3, n, up, templateExtras);
        const eps = 0.000001;
        const ok = main.cat === audit.cat
            && main.unit === audit.unit
            && Math.abs((main.baseRes || 0) - (audit.baseRes || 0)) <= eps
            && Math.abs((main.adjustFactor || 0) - (audit.adjustFactor || 0)) <= eps
            && Math.abs((main.res || 0) - (audit.res || 0)) <= eps
            && Math.abs((main.baseTotalCost || 0) - (audit.baseTotalCost || 0)) <= eps
            && Math.abs((main.totalCost || 0) - (audit.totalCost || 0)) <= eps;
        return { ok, main, audit };
    }

    function syncTemplateFormulaPanel() {
        const type = document.getElementById('calcType') ? document.getElementById('calcType').value : '';
        const panel = document.getElementById('templateFormulaPanel');
        const wallSlabModeWrap = document.getElementById('templateWallSlabModeWrap');
        const wallInputs = document.getElementById('templateWallInputs');
        const slabInputs = document.getElementById('templateSlabInputs');
        const stairInputs = document.getElementById('templateStairInputs');
        if (!panel || !wallSlabModeWrap || !wallInputs || !slabInputs || !stairInputs) return;
        const isTemplate = String(type || '').startsWith('M_');
        panel.style.display = isTemplate ? '' : 'none';
        const surfaceMode = document.getElementById('templateSurfaceMode') ? document.getElementById('templateSurfaceMode').value : 'wall';
        wallSlabModeWrap.style.display = (type === 'M_WALL' || type === 'M_BEAM_ALL') ? '' : 'none';
        wallInputs.style.display = type === 'M_WALL' && surfaceMode === 'wall' ? '' : 'none';
        slabInputs.style.display = type === 'M_WALL' && surfaceMode === 'slab' ? '' : 'none';
        stairInputs.style.display = type === 'M_STAIR' ? '' : 'none';
    }

    function updateUI() {
        const type = document.getElementById('calcType').value;
        const l1 = document.getElementById('lbl_v1'), l2 = document.getElementById('lbl_v2'), l3 = document.getElementById('lbl_v3');
        const lq = document.getElementById('lbl_qty'), lp = document.getElementById('lbl_price'), v3Input = document.getElementById('v3');
        const wasteLabel = document.getElementById('lbl_extraWaste');
        const wasteInput = document.getElementById('extraWasteRate');

        l1.style.color = '#888'; l2.style.color = '#888'; l3.style.color = '#888'; lq.style.color = '#888'; lq.innerText = '數量 (N)';
        if (wasteLabel) wasteLabel.innerText = type.startsWith('C_') ? '混凝土損耗 (%)' : '額外損耗 (%)';
        if (wasteInput) {
            wasteInput.disabled = !type.startsWith('C_');
            wasteInput.placeholder = type.startsWith('C_') ? '先算基準量，再另外加損耗' : '目前僅混凝土啟用';
            wasteInput.style.opacity = type.startsWith('C_') ? '1' : '0.5';
        }

        if (type === 'R_SLAB') {
            l1.innerText = '鋼筋規格 (分)'; l2.innerText = '單排長度/長向 L (m)'; l3.innerText = '排筋層數 (雙層請打2)'; lp.innerText = '發包單價 ($/Kg)';
            l1.style.color = '#ff9800'; l3.style.color = '#00d2d3'; if (!v3Input.value) v3Input.value = 1;
        } else if (type === 'R_MAIN') {
            l1.innerText = '主筋規格 (分)'; l2.innerText = '單支長度(含搭接) L (m)'; l3.innerText = '單柱/樑 總支數'; lq.innerText = '柱/樑 總數量'; lp.innerText = '發包單價 ($/Kg)';
            l1.style.color = '#ff9800'; l3.style.color = '#00d2d3'; lq.style.color = '#00d2d3';
        } else if (type === 'R_HOOP') {
            l1.innerText = '箍筋規格 (分)'; l2.innerText = '單圈展開長度 L (m)'; l3.innerText = '單柱/樑 總圈數'; lq.innerText = '柱/樑 總數量'; lp.innerText = '發包單價 ($/Kg)';
            l1.style.color = '#ff9800'; l3.style.color = '#00d2d3'; lq.style.color = '#00d2d3';
        } else if (type === 'C_STAIR') {
            l1.innerText = '踏階高總和 (m / 整數可輸入 cm)';
            l2.innerText = '踏階水平投影 (m / 整數可輸入 cm)';
            l3.innerText = '樓梯寬 (m / 整數可輸入 cm)';
            lp.innerText = '發包單價 ($/M³)';
            l1.style.color = '#ff9800';
            l2.style.color = '#00d2d3';
            l3.style.color = '#c792ea';
        } else if (type === 'M_BEAM_SIDES') {
            l1.innerText = '樑長 L (m / 整數可輸入 cm)'; l2.innerText = '樑寬 (無作用可不填)'; l3.innerText = '樑側淨高(扣版厚) (m / 整數可輸入 cm)'; lp.innerText = '發包單價 ($/M²)'; l3.style.color = '#ff9800';
        } else if (type === 'M_STAIR') {
            l1.innerText = '梯寬 (m / 整數可輸入 cm)'; l2.innerText = '下斜長 (m / 整數可輸入 cm)'; l3.innerText = '上斜長 (m / 整數可輸入 cm)'; lp.innerText = '發包單價 ($/M²)';
        } else if (type === 'M_FOOTING_EDGE') {
            l1.innerText = '基礎長 (m / 整數可輸入 cm)'; l2.innerText = '基礎寬 (m / 整數可輸入 cm)'; l3.innerText = '版厚 (m / 整數可輸入 cm)'; lp.innerText = '發包單價 ($/M²)';
        } else {
            l1.innerText = '長 / 寬A (m / 整數可輸入 cm)'; l2.innerText = '寬 / 寬B (m / 整數可輸入 cm)'; l3.innerText = '高 / 深 (m / 整數可輸入 cm)';
            lp.innerText = (type.startsWith('M_')) ? '發包單價 ($/M²)' : '發包單價 ($/M³)';
        }
        syncTemplateFormulaPanel();
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
            document.getElementById('prev_qty').innerText = "--";
            document.getElementById('prev_unit').innerText = "單位";
            document.getElementById('prev_cost').innerText = validation.msg;
            updatePreviewSummaryCards('--', '--', '--', '$ 0');
            updateAddButtonState(false, validation.msg);
            return;
        }
        const gate = evaluateAutoInterpretGate();
        if (!gate.ok) {
            document.getElementById('prev_qty').innerText = "需複核";
            document.getElementById('prev_unit').innerText = "AI判讀";
            document.getElementById('prev_cost').innerText = gate.msg;
            updatePreviewSummaryCards('需複核', '需複核', '--', '$ 0');
            updateAddButtonState(false, gate.msg);
            return;
        }

        const templateExtras = getTemplateFormulaExtras();
        const verify = verifyCalculationConsistency(type, v1, v2, v3, n, up, templateExtras);
        if (!verify.ok) {
            const msg = '計算校核失敗（雙引擎不一致），已阻擋加入清單';
            document.getElementById('prev_qty').innerText = "校核失敗";
            document.getElementById('prev_unit').innerText = "請重試";
            document.getElementById('prev_cost').innerText = msg;
            updatePreviewSummaryCards('校核失敗', '校核失敗', '--', '$ 0');
            updateAddButtonState(false, msg);
            return;
        }
        const result = verify.main;
        const extraWasteRate = getExtraWasteRateForType(type);
        const extraWasteQty = type.startsWith('C_') ? roundCalc((result.baseRes || 0) * (extraWasteRate / 100)) : 0;
        const finalQty = type.startsWith('C_') ? roundCalc((result.baseRes || 0) + extraWasteQty) : (result.res || 0);
        const finalCost = roundCalc(finalQty * up);
        const deductTotal = getTemplateDeductTotal(result.templateBreakdown || {});

        let resultDisplay = '';
        let resultUnitDisplay = '';
        const baseQtyText = `${(result.baseRes || 0).toFixed(3)} ${result.unit}`;
        const adjustedQtyText = `${(result.res || 0).toFixed(3)} ${result.unit}`;
        const footprintArea = roundCalc(v1 * v2 * n);
        const footprintAreaText = footprintArea > 0 ? `｜底面積 ${footprintArea.toFixed(3)} M²` : '';

        if (type.startsWith('M_') || selectedType.includes('模板') || selectedType.includes('漆') || selectedType.includes('地磚')) {
            const area = result.res;
            const tsubo = area * 0.3025;
            const templateSummary = summarizeTemplateBreakdown(type, result.templateBreakdown);
            resultDisplay = `基準 ${baseQtyText}｜施工 ${adjustedQtyText}${templateSummary ? `｜${templateSummary}` : ''}（${area.toFixed(2)} M² / ${tsubo.toFixed(2)} 坪）`;
            resultUnitDisplay = '面積';
        } else if (type.startsWith('R_') || selectedType.includes('鋼筋') || selectedType.includes('鐵')) {
            const weightKg = result.res;
            const tons = weightKg / 1000;
            resultDisplay = `基準 ${baseQtyText}｜施工 ${adjustedQtyText}（${weightKg.toFixed(2)} kg / ${tons.toFixed(3)} t）`;
            resultUnitDisplay = '重量';
        } else if (selectedType.includes('混凝土') || selectedType.includes('水泥') || type.startsWith('C_')) {
            const trucks = Math.ceil(finalQty / 6);
            resultDisplay = `基準 ${(result.baseRes || 0).toFixed(3)} ${result.unit}${footprintAreaText}｜損耗 ${extraWasteQty.toFixed(3)} ${result.unit}｜合計 ${finalQty.toFixed(3)} ${result.unit}（約需 ${trucks} 台預拌車 🚚）`;
            resultUnitDisplay = '體積';
        } else if (selectedType.includes('土方') || selectedType.includes('開挖') || selectedType.includes('回填') || type.startsWith('E_')) {
            const volume = result.res;
            const trucks = Math.ceil(volume / 10);
            resultDisplay = `基準 ${baseQtyText}${footprintAreaText}｜施工 ${adjustedQtyText}（約需 ${trucks} 台砂石車 🚛）`;
            resultUnitDisplay = '體積';
        } else {
            resultDisplay = `基準 ${baseQtyText}｜施工 ${adjustedQtyText}`;
            resultUnitDisplay = '體積';
        }

        document.getElementById('prev_qty').innerText = resultDisplay;
        document.getElementById('prev_unit').innerText = resultUnitDisplay;
        if (selectedType.includes('混凝土') || selectedType.includes('水泥') || type.startsWith('C_')) {
            const baseCost = roundCalc((result.baseRes || 0) * up);
            const wasteCost = roundCalc(extraWasteQty * up);
            document.getElementById('prev_cost').innerText = `基準 $ ${Math.round(baseCost).toLocaleString()}｜損耗 $ ${Math.round(wasteCost).toLocaleString()}｜合計 $ ${Math.round(finalCost).toLocaleString()}`;
            updatePreviewSummaryCards(baseQtyText, `${finalQty.toFixed(3)} ${result.unit}`, deductTotal > 0 ? `${deductTotal.toFixed(3)} M²` : '0.000', `$ ${Math.round(finalCost).toLocaleString()}`);
        } else {
            document.getElementById('prev_cost').innerText = `基準 $ ${Math.round(result.baseTotalCost || 0).toLocaleString()}｜施工 $ ${Math.round(result.totalCost || 0).toLocaleString()}（係數 x${(result.adjustFactor || 1).toFixed(3)}）`;
            updatePreviewSummaryCards(baseQtyText, adjustedQtyText, deductTotal > 0 ? `${deductTotal.toFixed(3)} M²` : '0.000', `$ ${Math.round(result.totalCost || 0).toLocaleString()}`);
        }
        updateAddButtonState(true);
    }

    function readInputNumber(id, fallback = 0) {
        const input = document.getElementById(id);
        if (!input) return fallback;
        const type = document.getElementById('calcType') ? document.getElementById('calcType').value : '';
        const n = ['v1', 'v2', 'v3'].includes(String(id || ''))
            ? parseDimensionValueToMeters(input.value, type)
            : parseFloat(input.value);
        return Number.isFinite(n) ? n : fallback;
    }

    function validateCalcInputs(type, v1, v2, v3, n, up) {
        if (v1 < 0 || v2 < 0 || v3 < 0 || n < 0 || up < 0) {
            return { ok: false, msg: "參數不可為負" };
        }
        if (n <= 0) return { ok: false, msg: "請輸入有效數量" };

        if (type === 'M_BEAM_SIDES') {
            if (v1 <= 0 || v3 <= 0) return { ok: false, msg: "請輸入樑長與樑高" };
            return { ok: true, msg: "" };
        }
        if (type === 'M_STAIR') {
            if (v1 <= 0 || v2 <= 0 || v3 <= 0) return { ok: false, msg: "請輸入梯寬、下斜長與上斜長" };
            if (readOptionalNumber('templateStairPlatformLength', 0) <= 0) return { ok: false, msg: "請輸入平台長" };
            if (readOptionalNumber('templateStairFloorHeight', 0) <= 0) return { ok: false, msg: "請輸入樓高" };
            return { ok: true, msg: "" };
        }
        if (type === 'M_FOOTING_EDGE') {
            if (v1 <= 0 || v2 <= 0 || v3 <= 0) return { ok: false, msg: "請輸入基礎長、寬與版厚" };
            return { ok: true, msg: "" };
        }
        if (type === 'C_STAIR') {
            if (v1 <= 0 || v2 <= 0 || v3 <= 0) return { ok: false, msg: "請輸入樓梯高、踏階投影與樓梯寬" };
            return { ok: true, msg: "" };
        }
        if (type === 'M_WALL') {
            if (v1 <= 0 || v2 <= 0) return { ok: false, msg: "請輸入長與寬" };
            return { ok: true, msg: "" };
        }
        if (type.startsWith('R_')) {
            if (v1 <= 0 || v2 <= 0) return { ok: false, msg: "請輸入鋼筋規格與長度" };
            return { ok: true, msg: "" };
        }
        if (v1 <= 0 || v2 <= 0 || v3 <= 0) return { ok: false, msg: "請補齊尺寸參數" };
        return { ok: true, msg: "" };
    }

    function updateAddButtonState(enabled, reason = '') {
        const addBtn = document.getElementById('addBtn');
        if (!addBtn) return;
        addBtn.disabled = !enabled;
        addBtn.title = enabled ? '可加入計算清單' : reason;
    }

    // --- 安全防護：XSS 處理 ---
    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }

    function getPriceUnitByType(type) {
        if (String(type || '').startsWith('R_')) return 'Kg';
        if (String(type || '').startsWith('M_')) return 'M²';
        return 'M³';
    }

    function buildCalcFormulaText(type, v1, v2, v3, n, templateExtras = {}) {
        const nText = Number.isFinite(n) ? n : 0;
        switch (type) {
        case 'C_BASE':
            return `(${v1}×${v2}×${v3})×${nText}`;
        case 'C_STAIR':
            return `((高+寬)×深/2)×${nText}`;
        case 'E_EXC':
            return `(${v1}×${v2}×${v3})×${nText}`;
        case 'R_SLAB':
            return `單位重(分徑)×長度×層數×數量`;
        case 'R_MAIN':
            return `單位重(分徑)×單支長×支數×數量`;
        case 'R_HOOP':
            return `單位重(分徑)×單圈長×圈數×數量`;
        case 'M_COL':
            return `((A+B)×2×高)×數量`;
        case 'M_BEAM_SIDES':
            return `(樑長×樑高×2)×數量`;
        case 'M_BEAM_ALL':
            return templateExtras.beamBottomIncludedInSlab
                ? `((高×2+寬)×長)×數量 - (樑底寬×長)×數量`
                : `((高×2+寬)×長)×數量`;
        case 'M_STAIR':
            return `(梯寬×下斜長 + 梯寬×上斜長 + 中平台寬×平台長 + 上平台寬×平台長 + 梯寬×樓高)×數量`;
        case 'M_FOOTING_EDGE':
            return `版厚×(長+寬)×2×數量`;
        case 'M_WALL':
            return String(templateExtras.surfaceMode || 'wall') === 'slab'
                ? `版模板: (長×寬)×數量 + 版厚×(長+寬)×2×數量 - 地板開口 - 電梯開口 - 管道開口 - 柱底座(長×寬×同位數柱×數量) - 梁接頭(長×寬×跨數×2×數量)`
                : `(長×高)×數量 - 窗口扣除 - 開口扣除 - 柱牆接頭 - 梁牆接頭`;
        default:
            return `依 ${type} 計算`;
        }
    }

    function getFormulaVariableHint(type, templateExtras = {}) {
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
            return templateExtras.beamBottomIncludedInSlab
                ? '高=梁高, 寬=梁寬, 長=梁長, N=梁數；樑底面積改由版面計算'
                : '高=梁高, 寬=梁寬, 長=梁長, N=梁數';
        case 'M_STAIR':
            return 'v1=梯寬, v2=下斜長, v3=上斜長；另填中平台寬、平台長、上平台寬、樓高；梯側模板不計';
        case 'M_FOOTING_EDGE':
            return '長=基礎長, 寬=基礎寬, 高=版厚, N=座數';
        case 'M_WALL':
            return String(templateExtras.surfaceMode || 'wall') === 'slab'
                ? '長/寬=版面尺寸, 版厚=另填, 地板/電梯/管道開口都各自按版厚×長×寬×數量扣除, 柱底座=長×寬×同位數柱, 梁接頭=長×寬×跨一樑左右×2, N=片數'
                : '長=牆長, 高=牆高, 另可扣窗口/開口/柱牆接頭/梁牆接頭, N=片數';
        default:
            return '變數定義請依當前欄位標籤（v1/v2/v3/N）';
        }
    }

    async function requestServerCoreCalculation(payload) {
        return apiRequest('/calc/core', {
            method: 'POST',
            body: payload,
            retries: 0,
            timeoutMs: 15000
        });
    }

    async function requestServerAdvancedEstimate(payload) {
        return apiRequest('/calc/advanced-estimate', {
            method: 'POST',
            body: payload,
            retries: 0,
            timeoutMs: 15000
        });
    }

    async function calculateAndAdd() {
        if (typeof ensureWorkModeAccess === 'function' && !ensureWorkModeAccess('calc', '請先切到第三頁計算模式再吸入清單')) return;
        const type = document.getElementById('calcType').value;
        const typeText = document.getElementById('calcType').options[document.getElementById('calcType').selectedIndex].text.split(' (')[0]; 
        let customName = document.getElementById('customName').value.trim();
        let floor = document.getElementById('floor_tag').value.trim() || "未分層";
        
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

        let isDeduct = confirm("這筆是要『扣除』的項目嗎？\n(如窗戶開口請點確定，一般計算點取消)");
        let result;
        try {
            result = await requestServerCoreCalculation({
                type,
                v1,
                v2,
                v3,
                n,
                up,
                isDeduct,
                extraWasteRate: getExtraWasteRateForType(type),
                templateExtras: getTemplateFormulaExtras()
            });
        } catch (error) {
            console.warn('後端核心計算失敗', error);
            return showToast((error && error.message) || '後端核心計算失敗');
        }

        let baseRes = Number(result.baseRes || 0);
        let res = Number(result.res || 0);
        let adjustFactor = Number(result.adjustFactor || 1);
        let wasteRate = Number(result.wasteRate || 0);
        let wasteRes = Number(result.wasteRes || 0);
        let name = typeText;

        if (isDeduct) {
            name = `扣除(${name})`;
        } else if (result.cat === 'STEEL') {
            name = `${typeText}(含損耗)`;
        }

        if (customName !== "") { name = `${name} [${customName}]`; }

        const baseTotalCost = Number(result.baseTotalCost || (baseRes * up));
        const totalCost = Number(result.totalCost || (res * up));
        const priceUnit = getPriceUnitByType(type);
        const templateExtras = getTemplateFormulaExtras();
        const calcFormula = buildCalcFormulaText(type, v1, v2, v3, n, templateExtras);
        const formulaHint = getFormulaVariableHint(type, templateExtras);
        const templateSummary = summarizeTemplateBreakdown(type, result.templateBreakdown);
        const costBreakdown = result.cat === 'CEMENT'
            ? `基準 ${Math.abs(baseRes).toFixed(3)} ${priceUnit} + 損耗 ${Math.abs(wasteRes).toFixed(3)} ${priceUnit} = 合計 ${Math.abs(res).toFixed(3)} ${priceUnit}`
            : `基準 ${Math.abs(baseRes).toFixed(3)} ${priceUnit} × ${up}｜施工 ${Math.abs(res).toFixed(3)} ${priceUnit} × ${up}（x${adjustFactor.toFixed(3)}）${templateSummary ? `｜${templateSummary}` : ''}`;
        
        // 安全處理使用者輸入
        const safeName = escapeHTML(name);
        const safeFloor = escapeHTML(floor);
        const safeFormula = escapeHTML(calcFormula);
        const safeFormulaHint = escapeHTML(formulaHint);
        const safeBreakdown = escapeHTML(costBreakdown);

        list.push({ 
            floor: safeFloor, 
            name: safeName, 
            baseRes: baseRes,
            res: res, 
            wasteRes: wasteRes,
            wasteRate: wasteRate,
            adjustFactor: adjustFactor,
            up: up, 
            baseTotalCost: baseTotalCost,
            totalCost: totalCost, 
            cat: result.cat, 
            unit: result.unit,
            priceUnit: priceUnit,
            formula: safeFormula,
            formulaHint: safeFormulaHint,
            breakdown: safeBreakdown
        });
        
        saveData(); renderTable(); 
        showToast(isDeduct ? '✂️ 已執行自動扣除' : '🚀 數據已吸入黑洞！');
    }

    function getVisibleCostBaseTotal() {
        const mergedList = [
            ...list.map((item, idx) => ({ item, idx, source: 'local' })),
            ...warRoomList.map((item, idx) => ({ item, idx, source: 'warroom' }))
        ];
        const visibleList = mergedList.filter(({ source }) => showWarRoomRows || source !== 'warroom');
        return visibleList.reduce((sum, row) => sum + (Number(row.item && row.item.totalCost) || 0), 0);
    }

    function formatNtd(value) {
        return `${Math.round(Number(value) || 0).toLocaleString()} 元`;
    }

    function readPercentInput(id, fallback, minValue = 0, maxValue = 100) {
        const el = document.getElementById(id);
        const raw = Number(el && el.value);
        const value = Number.isFinite(raw) ? raw : fallback;
        return Math.max(minValue, Math.min(maxValue, value));
    }

    function toMoneyCents(value) {
        return Math.round((Number(value) || 0) * 100);
    }

    function fromMoneyCents(cents) {
        return (Number(cents) || 0) / 100;
    }

    function toBasisPoints(percentValue) {
        return Math.round((Number(percentValue) || 0) * 100);
    }

    function mulDivRound(value, numerator, denominator) {
        if (!Number.isFinite(value) || !Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
        return Math.round((value * numerator) / denominator);
    }

    function calcAdvancedEstimateFromBase(baseTotal) {
        const wasteRate = readPercentInput('advWasteRate', 3, 0, 40) / 100;
        const mgmtRate = readPercentInput('advMgmtRate', 8, 0, 40) / 100;
        const taxRate = readPercentInput('advTaxRate', 5, 0, 20) / 100;
        const profitRate = readPercentInput('advProfitRate', 12, 0, 60) / 100;
        const strictMode = !!(document.getElementById('advProPrecisionMode') && document.getElementById('advProPrecisionMode').checked);
        const isPro = getCurrentUserLevel() === 'pro';

        let wasteCost;
        let mgmtCost;
        let preTaxCost;
        let taxCost;
        let costWithTax;
        let quoteTotal;
        let targetProfit;
        let auditText;

        if (strictMode && isPro) {
            const baseCents = toMoneyCents(baseTotal);
            const wasteBps = toBasisPoints(wasteRate * 100);
            const mgmtBps = toBasisPoints(mgmtRate * 100);
            const taxBps = toBasisPoints(taxRate * 100);
            const profitBps = toBasisPoints(profitRate * 100);

            const wasteCents = mulDivRound(baseCents, wasteBps, 10000);
            const mgmtCents = mulDivRound(baseCents + wasteCents, mgmtBps, 10000);
            const preTaxCents = baseCents + wasteCents + mgmtCents;
            const taxCents = mulDivRound(preTaxCents, taxBps, 10000);
            const costWithTaxCents = preTaxCents + taxCents;
            const quoteCents = profitBps < 10000
                ? mulDivRound(costWithTaxCents, 10000, 10000 - profitBps)
                : costWithTaxCents;
            const profitCents = quoteCents - costWithTaxCents;

            wasteCost = fromMoneyCents(wasteCents);
            mgmtCost = fromMoneyCents(mgmtCents);
            preTaxCost = fromMoneyCents(preTaxCents);
            taxCost = fromMoneyCents(taxCents);
            costWithTax = fromMoneyCents(costWithTaxCents);
            quoteTotal = fromMoneyCents(quoteCents);
            targetProfit = fromMoneyCents(profitCents);
            auditText = `整數分精算：base=${baseCents}c, waste=${wasteBps}bps, mgmt=${mgmtBps}bps, tax=${taxBps}bps, profit=${profitBps}bps`;
        } else {
            wasteCost = baseTotal * wasteRate;
            mgmtCost = (baseTotal + wasteCost) * mgmtRate;
            preTaxCost = baseTotal + wasteCost + mgmtCost;
            taxCost = preTaxCost * taxRate;
            costWithTax = preTaxCost + taxCost;
            quoteTotal = (1 - profitRate) > 0.0001 ? (costWithTax / (1 - profitRate)) : costWithTax;
            targetProfit = quoteTotal - costWithTax;
            auditText = strictMode && !isPro
                ? '精算模式需會員3（專家），目前回退一般試算'
                : '一般試算（浮點）';
        }

        return {
            baseTotal,
            wasteCost,
            mgmtCost,
            taxCost,
            costWithTax,
            quoteTotal,
            targetProfit,
            strictMode,
            isPro,
            auditText
        };
    }

    function refreshAdvancedEstimate(showToastMsg = false) {
        const summary = document.getElementById('advEstimateSummary');
        const sensitivity = document.getElementById('advSensitivitySummary');
        const auditBox = document.getElementById('advPrecisionAudit');
        if (!summary || !sensitivity || !auditBox) return;
        const baseTotal = getVisibleCostBaseTotal();
        if (baseTotal <= 0) {
            summary.innerText = '進階試算：目前清單為空，請先加入至少一筆計算項目。';
            sensitivity.innerText = '敏感度：待命（需有清單金額）';
            auditBox.innerText = '精算稽核：待命';
            return;
        }
        const est = calcAdvancedEstimateFromBase(baseTotal);
        summary.innerText = `進階試算：基礎成本 ${formatNtd(est.baseTotal)}｜損耗 ${formatNtd(est.wasteCost)}｜管理費 ${formatNtd(est.mgmtCost)}｜稅金 ${formatNtd(est.taxCost)}｜含稅成本 ${formatNtd(est.costWithTax)}｜建議報價 ${formatNtd(est.quoteTotal)}｜目標毛利 ${formatNtd(est.targetProfit)}`;
        auditBox.innerText = `精算稽核：${est.auditText}`;
        auditBox.style.color = est.strictMode && est.isPro ? '#9ef5c2' : (est.strictMode ? '#ffd48a' : '#c6dcff');
        const gateInput = document.getElementById('advAutoInterpretGate');
        if (gateInput) {
            const minGatePercent = Math.round(AUTO_INTERPRET_GATE_DEFAULT_CONFIDENCE * 100);
            gateInput.min = String(minGatePercent);
            const raw = Number(gateInput.value);
            if (!Number.isFinite(raw) || String(gateInput.value).trim() === '' || raw < minGatePercent) {
                gateInput.value = String(minGatePercent);
            }
        }
        runAdvancedSensitivityAnalysis(true);
        if (showToastMsg) showToast(`進階試算已更新：建議報價 ${formatNtd(est.quoteTotal)}`);
    }

    function runAdvancedSensitivityAnalysis(silent = false) {
        const sensitivity = document.getElementById('advSensitivitySummary');
        if (!sensitivity) return;
        const baseTotal = getVisibleCostBaseTotal();
        if (baseTotal <= 0) {
            sensitivity.innerText = '敏感度：待命（需有清單金額）';
            return;
        }
        const stepPercent = readPercentInput('advSensitivityStep', 10, 1, 50);
        const low = calcAdvancedEstimateFromBase(baseTotal * (1 - stepPercent / 100));
        const mid = calcAdvancedEstimateFromBase(baseTotal);
        const high = calcAdvancedEstimateFromBase(baseTotal * (1 + stepPercent / 100));
        sensitivity.innerText = `敏感度（±${stepPercent}%）：低情境報價 ${formatNtd(low.quoteTotal)}｜基準 ${formatNtd(mid.quoteTotal)}｜高情境 ${formatNtd(high.quoteTotal)}`;
        if (!silent) showToast(`敏感度已更新（±${stepPercent}%）`);
    }

    async function exportAdvancedEstimateReport() {
        if (typeof ensureWorkModeAccess === 'function' && !ensureWorkModeAccess('calc', '請先切到第三頁計算模式再匯出精算報表')) return;
        if (!(await ensureFeatureAccess('advancedEstimateExport', '此報表僅限會員3（專家）匯出'))) {
            return;
        }
        const baseTotal = getVisibleCostBaseTotal();
        if (baseTotal <= 0) {
            return showToast('目前清單為空，無法匯出第三頁精算報表');
        }

        const wasteRate = readPercentInput('advWasteRate', 3, 0, 40);
        const mgmtRate = readPercentInput('advMgmtRate', 8, 0, 40);
        const taxRate = readPercentInput('advTaxRate', 5, 0, 20);
        const profitRate = readPercentInput('advProfitRate', 12, 0, 60);
        const stepPercent = readPercentInput('advSensitivityStep', 10, 1, 50);

        let base;
        let low;
        let high;
        try {
            base = await requestServerAdvancedEstimate({
                baseTotal,
                wasteRate,
                mgmtRate,
                taxRate,
                profitRate,
                strictMode: !!(document.getElementById('advProPrecisionMode') && document.getElementById('advProPrecisionMode').checked)
            });
            low = await requestServerAdvancedEstimate({
                baseTotal: baseTotal * (1 - stepPercent / 100),
                wasteRate,
                mgmtRate,
                taxRate,
                profitRate,
                strictMode: !!(document.getElementById('advProPrecisionMode') && document.getElementById('advProPrecisionMode').checked)
            });
            high = await requestServerAdvancedEstimate({
                baseTotal: baseTotal * (1 + stepPercent / 100),
                wasteRate,
                mgmtRate,
                taxRate,
                profitRate,
                strictMode: !!(document.getElementById('advProPrecisionMode') && document.getElementById('advProPrecisionMode').checked)
            });
        } catch (error) {
            console.warn('後端精算報表失敗', error);
            return showToast((error && error.message) || '後端精算報表失敗');
        }

        const projectName = (document.getElementById('project_name') && document.getElementById('project_name').value) || '未命名專案';
        const floorTag = (document.getElementById('floor_tag') && document.getElementById('floor_tag').value) || '未分層';
        const rows = [
            ['報告時間', new Date().toLocaleString('zh-TW')],
            ['專案名稱', projectName],
            ['樓層分區', floorTag],
            ['會員等級', getUserLevelLabel(getCurrentUserLevel())],
            ['精算模式', base.strictMode && base.isPro ? '整數分精算（稽核級）' : '一般試算'],
            ['稽核訊息', base.auditText],
            ['基礎成本(元)', Math.round(base.baseTotal)],
            ['損耗率(%)', wasteRate],
            ['管理費率(%)', mgmtRate],
            ['稅率(%)', taxRate],
            ['目標毛利率(%)', profitRate],
            ['損耗成本(元)', Math.round(base.wasteCost)],
            ['管理費(元)', Math.round(base.mgmtCost)],
            ['稅金(元)', Math.round(base.taxCost)],
            ['含稅成本(元)', Math.round(base.costWithTax)],
            ['建議報價(元)', Math.round(base.quoteTotal)],
            ['目標毛利(元)', Math.round(base.targetProfit)],
            ['敏感度波動(±%)', stepPercent],
            ['低情境報價(元)', Math.round(low.quoteTotal)],
            ['基準報價(元)', Math.round(base.quoteTotal)],
            ['高情境報價(元)', Math.round(high.quoteTotal)]
        ];

        let csv = '\uFEFF項目,數值\n';
        rows.forEach(([k, v]) => {
            csv += `${sanitizeCSVField(k)},${sanitizeCSVField(v)}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `ConstructionMaster_第三頁精算報表_${new Date().getTime()}.csv`;
        link.click();
        addAuditLog('匯出第三頁精算報表', `專案 ${projectName} / 報價 ${Math.round(base.quoteTotal)} 元`);
        showToast('第三頁精算報表已匯出');
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
            const adjustedQty = Number(item.res || 0);
            const baseQty = Number.isFinite(Number(item.baseRes)) ? Number(item.baseRes) : adjustedQty;
            const wasteQty = Number.isFinite(Number(item.wasteRes)) ? Number(item.wasteRes) : (item.cat === 'CEMENT' ? adjustedQty - baseQty : 0);
            const wasteRate = Number.isFinite(Number(item.wasteRate)) ? Number(item.wasteRate) : Math.max(0, (Number(item.adjustFactor || 1) - 1) * 100);
            const adjustFactor = Number.isFinite(Number(item.adjustFactor)) ? Number(item.adjustFactor) : 1;
            const adjustedCost = Number(item.totalCost || 0);
            const baseCost = Number.isFinite(Number(item.baseTotalCost)) ? Number(item.baseTotalCost) : adjustedCost;
            const isConcreteRow = item.cat === 'CEMENT';
            if (sums[item.cat] !== undefined) sums[item.cat] += adjustedQty; 
            sums.total += adjustedCost;
            const cloudTag = source === 'warroom'
                ? ' <span style="font-size:0.75em;color:#9ef3b5;">[雲端]</span>'
                : '';
            const removeBtn = source === 'warroom'
                ? '<button style="width:auto; padding:4px 8px; margin:0; background:#4b6584; border:none; border-radius:4px; cursor:not-allowed;" title="雲端同步資料不可單筆刪除">鎖</button>'
                : `<button style="width:auto; padding:4px 8px; margin:0; background:#e74c3c; border:none; border-radius:4px; cursor:pointer;" onclick="removeItem(${idx})">X</button>`;
            const qtyCell = isConcreteRow
                ? `基準 ${baseQty.toFixed(2)} + 損耗 ${wasteQty.toFixed(2)} = 合計 ${adjustedQty.toFixed(2)} <span style="font-size:0.8em;color:#888;">${item.unit || ''}</span><div style="font-size:0.75em;color:#8fb3cf;">損耗 ${wasteRate.toFixed(1)}%</div>`
                : `基準 ${baseQty.toFixed(2)}｜施工 ${adjustedQty.toFixed(2)} <span style="font-size:0.8em;color:#888;">${item.unit || ''}</span><div style="font-size:0.75em;color:#8fb3cf;">係數 x${adjustFactor.toFixed(3)}</div>`;
            const costCell = isConcreteRow
                ? `基準 ${Math.round(baseCost).toLocaleString()} + 損耗 ${Math.round(adjustedCost - baseCost).toLocaleString()} = 合計 ${Math.round(adjustedCost).toLocaleString()}<div style="font-size:0.75em;color:#8fb3cf;">${item.breakdown || ''}</div>`
                : `基準 ${Math.round(baseCost).toLocaleString()}｜施工 ${Math.round(adjustedCost).toLocaleString()}<div style="font-size:0.75em;color:#8fb3cf;">${item.breakdown || ''}</div>`;

            // 建立 DOM 元素以進一步防範 XSS
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.floor}</td>
                <td style="color:${adjustedQty < 0 ? '#ff4757' : 'white'}">${item.name}${cloudTag}</td>
                <td>${qtyCell}</td>
                <td>${item.up} <span style="font-size:0.78em;color:#9bc2e5;">/ ${item.priceUnit || item.unit || '-'}</span></td>
                <td style="font-size:0.8em;color:#cde3f5;" title="${item.formulaHint || ''}">${item.formula || '-'} <span style="color:#9bc2e5;">ⓘ</span></td>
                <td style="color:var(--money); font-weight:bold;">${costCell}</td>
                <td>${removeBtn}</td>
            `;
            tbody.appendChild(tr);
        });
        
        document.getElementById('sumC').innerText = `混凝土: ${sums.CEMENT.toFixed(2)} M³`; 
        document.getElementById('sumM').innerText = `模板: ${sums.MOLD.toFixed(2)} M²`;
        document.getElementById('sumE').innerText = `土方: ${sums.EARTH.toFixed(2)} M³`; 
        document.getElementById('sumS').innerText = `鋼筋: ${sums.STEEL.toFixed(2)} Kg`;
        document.getElementById('totalMoney').innerText = Math.round(sums.total).toLocaleString();
        updateQaDashboard();
        refreshAdvancedEstimate(false);
    }

    function removeItem(idx) { list.splice(idx, 1); saveData(); renderTable(); }
    
    function clearAll() { 
        if(confirm('⚠️ 確定要清空所有數據嗎?')) { 
            createDataSnapshot('清空清單前', true);
            list = [];
            warRoomList = [];
            saveData();
            renderTable();
            ctx.clearRect(0,0,canvas.width,canvas.height); 
            document.getElementById('scale-info').innerText = '比例: 未設定'; scalePixelsPerUnit = 0; 
            document.getElementById('customName').value = ''; 
            document.getElementById('v1').value = ''; document.getElementById('v2').value = ''; document.getElementById('v3').value = '';
            resetMeasureQaStats();
            addAuditLog('清空主清單', '全部清空');
            previewCalc(); showToast('黑洞已重置');
        } 
    }
    
    function saveData() { 
        queueWorkspacePersist('list', list);
    }

