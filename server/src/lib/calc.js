function roundCalc(value, digits = 8) {
    const n = Number(value) || 0;
    const p = Math.pow(10, digits);
    return Math.round(n * p) / p;
}

function clampPercent(value, minValue, maxValue, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(minValue, Math.min(maxValue, n));
}

function getRebarDiameter(value) {
    if (value === 3) return 9.53;
    if (value === 4) return 12.7;
    if (value === 5) return 15.9;
    if (value === 6) return 19.1;
    if (value === 7) return 22.2;
    if (value === 8) return 25.4;
    if (value === 10) return 32.2;
    return value;
}

function getQuantityAdjustFactor(type, category) {
    if (category === 'CEMENT' || String(type || '').startsWith('C_')) return 1;
    if (category === 'STEEL' || String(type || '').startsWith('R_')) return 1.10;
    return 1;
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

function normalizeTemplateExtras(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
        surfaceMode: String(source.surfaceMode || 'wall'),
        beamBottomIncludedInSlab: !!source.beamBottomIncludedInSlab,
        windowWidth: Number(source.windowWidth) || 0,
        windowHeight: Number(source.windowHeight) || 0,
        windowCount: Number(source.windowCount) || 0,
        openingWidth: Number(source.openingWidth) || 0,
        openingHeight: Number(source.openingHeight) || 0,
        openingCount: Number(source.openingCount) || 0,
        wallThickness: Number(source.wallThickness) || 0,
        floorHeight: Number(source.floorHeight) || 0,
        beamHeight: Number(source.beamHeight) || 0,
        spanCount: Number(source.spanCount) || 0,
        beamWallJointLength: Number(source.beamWallJointLength) || 0,
        slabThickness: Number(source.slabThickness) || 0,
        slabOpeningLength: Number(source.slabOpeningLength) || 0,
        slabOpeningWidth: Number(source.slabOpeningWidth) || 0,
        slabOpeningCount: Number(source.slabOpeningCount) || 0,
        elevatorOpeningLength: Number(source.elevatorOpeningLength) || 0,
        elevatorOpeningWidth: Number(source.elevatorOpeningWidth) || 0,
        elevatorOpeningCount: Number(source.elevatorOpeningCount) || 0,
        shaftOpeningLength: Number(source.shaftOpeningLength) || 0,
        shaftOpeningWidth: Number(source.shaftOpeningWidth) || 0,
        shaftOpeningCount: Number(source.shaftOpeningCount) || 0,
        pedestalLength: Number(source.pedestalLength) || 0,
        pedestalWidth: Number(source.pedestalWidth) || 0,
        pedestalCount: Number(source.pedestalCount) || 0,
        beamJointLength: Number(source.beamJointLength) || 0,
        beamJointWidth: Number(source.beamJointWidth) || 0,
        beamJointSpanCount: Number(source.beamJointSpanCount) || 0,
        stairMidPlatformWidth: Number(source.stairMidPlatformWidth) || 0,
        stairPlatformLength: Number(source.stairPlatformLength) || 0,
        stairUpperPlatformWidth: Number(source.stairUpperPlatformWidth) || 0,
        stairFloorHeight: Number(source.stairFloorHeight) || 0
    };
}

function calculateTemplateMoldAdjustment(type, v1, v2, v3, quantity, rawExtras) {
    const extras = normalizeTemplateExtras(rawExtras);
    const breakdown = buildDefaultTemplateBreakdown();
    if (type === 'M_WALL') {
        breakdown.mode = extras.surfaceMode === 'slab' ? 'slab' : 'wall';
        if (breakdown.mode === 'slab') {
            const thickness = Math.max(0, extras.slabThickness);
            breakdown.slabEdgeAdd = thickness > 0 ? thickness * (v1 + v2) * 2 * quantity : 0;
            breakdown.slabOpeningDeduct = thickness > 0
                ? thickness * (Math.max(0, extras.slabOpeningLength) * Math.max(0, extras.slabOpeningWidth)) * Math.max(0, extras.slabOpeningCount) * quantity
                : 0;
            breakdown.elevatorOpeningDeduct = thickness > 0
                ? thickness * (Math.max(0, extras.elevatorOpeningLength) * Math.max(0, extras.elevatorOpeningWidth)) * Math.max(0, extras.elevatorOpeningCount) * quantity
                : 0;
            breakdown.shaftOpeningDeduct = thickness > 0
                ? thickness * (Math.max(0, extras.shaftOpeningLength) * Math.max(0, extras.shaftOpeningWidth)) * Math.max(0, extras.shaftOpeningCount) * quantity
                : 0;
            breakdown.pedestalDeduct = Math.max(0, extras.pedestalLength) * Math.max(0, extras.pedestalWidth) * Math.max(0, extras.pedestalCount) * quantity;
            breakdown.beamJointDeduct = Math.max(0, extras.beamJointLength) * Math.max(0, extras.beamJointWidth) * Math.max(0, extras.beamJointSpanCount) * 2 * quantity;
            return breakdown;
        }
        const windowWidth = Math.max(0, extras.windowWidth - 0.12);
        const windowHeight = Math.max(0, extras.windowHeight - 0.12);
        const openingWidth = Math.max(0, extras.openingWidth - 0.12);
        const openingHeight = Math.max(0, extras.openingHeight - 0.12);
        const wallThickness = Math.max(0, extras.wallThickness);
        const floorHeight = Math.max(0, extras.floorHeight);
        const beamHeight = Math.max(0, extras.beamHeight);
        breakdown.windowDeduct = windowWidth * windowHeight * Math.max(0, extras.windowCount) * quantity;
        breakdown.openingDeduct = openingWidth * openingHeight * Math.max(0, extras.openingCount) * quantity;
        breakdown.columnWallJointDeduct = wallThickness * Math.max(0, floorHeight - beamHeight) * Math.max(0, extras.spanCount) * 2 * quantity;
        breakdown.beamWallJointDeduct = wallThickness * Math.max(0, extras.beamWallJointLength) * quantity;
        return breakdown;
    }
    if (type === 'M_BEAM_ALL' && extras.beamBottomIncludedInSlab) {
        breakdown.beamBottomDeduct = v2 * v1 * quantity;
    }
    return breakdown;
}

function calculateBaseCore(type, v1, v2, v3, quantity, unitPrice, templateExtras = {}) {
    let baseRes = 0;
    let unit = '';
    let cat = '';
    let templateBreakdown = buildDefaultTemplateBreakdown();

    if (type === 'C_STAIR') {
        cat = 'CEMENT';
        baseRes = ((v1 + v2) * v3 / 2) * quantity;
        unit = 'M³';
    } else if (type === 'M_STAIR') {
        cat = 'MOLD';
        baseRes = (
            v1 * v2 +
            v1 * v3 +
            (Math.max(0, templateExtras.stairMidPlatformWidth) * Math.max(0, templateExtras.stairPlatformLength)) +
            (Math.max(0, templateExtras.stairUpperPlatformWidth) * Math.max(0, templateExtras.stairPlatformLength)) +
            (v1 * Math.max(0, templateExtras.stairFloorHeight))
        ) * quantity;
        unit = 'M²';
    } else if (type === 'M_FOOTING_EDGE') {
        cat = 'MOLD';
        baseRes = v3 * (v1 + v2) * 2 * quantity;
        unit = 'M²';
    } else if (type.startsWith('C_') || type.startsWith('E_')) {
        cat = type.startsWith('C_') ? 'CEMENT' : 'EARTH';
        baseRes = v1 * v2 * v3 * quantity;
        unit = 'M³';
    } else if (type.startsWith('R_')) {
        cat = 'STEEL';
        const actualDiameter = getRebarDiameter(v1);
        const multiplier = v3 === 0 ? 1 : v3;
        baseRes = (Math.pow(actualDiameter, 2) / 162) * v2 * multiplier * quantity;
        unit = 'Kg';
    } else if (type === 'M_COL') {
        cat = 'MOLD';
        baseRes = (v1 + v2) * 2 * v3 * quantity;
        unit = 'M²';
    } else if (type === 'M_BEAM_SIDES') {
        cat = 'MOLD';
        baseRes = v1 * v3 * 2 * quantity;
        unit = 'M²';
    } else if (type === 'M_BEAM_ALL') {
        cat = 'MOLD';
        baseRes = (v3 * 2 + v2) * v1 * quantity;
        unit = 'M²';
    } else if (type === 'M_WALL') {
        cat = 'MOLD';
        baseRes = v1 * v2 * quantity;
        unit = 'M²';
    }

    if (cat === 'MOLD' && !['M_STAIR', 'M_FOOTING_EDGE'].includes(String(type || ''))) {
        templateBreakdown = calculateTemplateMoldAdjustment(type, v1, v2, v3, quantity, templateExtras);
        baseRes = Math.max(0, baseRes
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
            + Number(templateBreakdown.slabEdgeAdd || 0));
    }

    const adjustFactor = getQuantityAdjustFactor(type, cat);
    const adjustedRes = baseRes * adjustFactor;
    return {
        baseRes,
        adjustFactor,
        res: adjustedRes,
        unit,
        cat,
        templateBreakdown,
        baseTotalCost: baseRes * unitPrice,
        totalCost: adjustedRes * unitPrice
    };
}

function calculateCore(input) {
    const type = String(input && input.type ? input.type : '').trim();
    const v1 = Number(input && input.v1) || 0;
    const v2 = Number(input && input.v2) || 0;
    const v3 = Number(input && input.v3) || 0;
    const quantity = Number(input && input.n) || 0;
    const unitPrice = Number(input && input.up) || 0;
    const isDeduct = !!(input && input.isDeduct);
    const extraWasteRate = clampPercent(input && input.extraWasteRate, 0, 40, 0);
    const templateExtras = normalizeTemplateExtras(input && input.templateExtras);

    const base = calculateBaseCore(type, v1, v2, v3, quantity, unitPrice, templateExtras);
    let baseRes = Number(base.baseRes || 0);
    let res = Number(base.res || 0);
    let adjustFactor = Number(base.adjustFactor || 1);
    let wasteRate = 0;
    let wasteRes = 0;

    if (isDeduct) {
        const baseAbs = Math.abs(baseRes);
        baseRes = -baseAbs;
        res = -baseAbs;
        adjustFactor = 1;
    } else if (base.cat === 'CEMENT') {
        wasteRate = extraWasteRate;
        wasteRes = roundCalc(baseRes * (wasteRate / 100));
        res = roundCalc(baseRes + wasteRes);
        adjustFactor = baseRes !== 0 ? roundCalc(res / baseRes, 6) : 1;
    }

    return {
        ...base,
        baseRes: roundCalc(baseRes),
        res: roundCalc(res),
        wasteRes: roundCalc(wasteRes),
        wasteRate,
        adjustFactor: roundCalc(adjustFactor, 6),
        baseTotalCost: roundCalc(baseRes * unitPrice),
        totalCost: roundCalc(res * unitPrice),
        templateBreakdown: base.templateBreakdown || buildDefaultTemplateBreakdown(),
        isDeduct
    };
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

function calculateAdvancedEstimate(input) {
    const baseTotal = Number(input && input.baseTotal) || 0;
    const wasteRate = clampPercent(input && input.wasteRate, 0, 40, 3) / 100;
    const mgmtRate = clampPercent(input && input.mgmtRate, 0, 40, 8) / 100;
    const taxRate = clampPercent(input && input.taxRate, 0, 20, 5) / 100;
    const profitRate = clampPercent(input && input.profitRate, 0, 60, 12) / 100;
    const strictMode = !!(input && input.strictMode);
    const isPro = !!(input && input.isPro);

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
        baseTotal: roundCalc(baseTotal),
        wasteCost: roundCalc(wasteCost),
        mgmtCost: roundCalc(mgmtCost),
        preTaxCost: roundCalc(preTaxCost),
        taxCost: roundCalc(taxCost),
        costWithTax: roundCalc(costWithTax),
        quoteTotal: roundCalc(quoteTotal),
        targetProfit: roundCalc(targetProfit),
        strictMode,
        isPro,
        auditText
    };
}

module.exports = {
    calculateAdvancedEstimate,
    calculateCore,
    roundCalc
};
