const OVERRIDABLE_FEATURES = ['quantumStake'];

const FEATURE_MATRIX = {
    basic: {
        aiCoach: false,
        blueprintAnnotationOcr: false,
        guidedPrecisionRefine: false,
        guidedPrecisionAuto: false,
        blueprintAutoInterpret: false,
        autoBlueprintBim: false,
        smartCalibration: false,
        smartMeasure: false,
        aiVision: false,
        advancedEstimateExport: false,
        quantumStake: false,
        stakingDesktopPipeline: false,
        bimLayoutQa: true,
        measureQaReport: true,
        calcCore: true,
        dataSync: true
    },
    standard: {
        aiCoach: false,
        blueprintAnnotationOcr: false,
        guidedPrecisionRefine: false,
        guidedPrecisionAuto: false,
        blueprintAutoInterpret: false,
        autoBlueprintBim: false,
        smartCalibration: false,
        smartMeasure: false,
        aiVision: false,
        advancedEstimateExport: false,
        quantumStake: false,
        stakingDesktopPipeline: false,
        bimLayoutQa: true,
        measureQaReport: true,
        calcCore: true,
        dataSync: true
    },
    pro: {
        aiCoach: true,
        blueprintAnnotationOcr: true,
        guidedPrecisionRefine: true,
        guidedPrecisionAuto: true,
        blueprintAutoInterpret: true,
        autoBlueprintBim: true,
        smartCalibration: true,
        smartMeasure: true,
        aiVision: true,
        advancedEstimateExport: true,
        quantumStake: false,
        stakingDesktopPipeline: true,
        bimLayoutQa: true,
        measureQaReport: true,
        calcCore: true,
        dataSync: true
    }
};

const LEVEL_ORDER = ['basic', 'standard', 'pro'];

function normalizeLevel(level) {
    const raw = String(level || '').trim().toLowerCase();
    if (raw === '3' || raw === 'pro' || raw === 'expert') return 'pro';
    if (raw === '2' || raw === 'standard' || raw === 'member') return 'standard';
    return 'basic';
}

function clampRequestedLevel(requestedLevel, grantedLevel) {
    const normalizedRequested = normalizeLevel(requestedLevel);
    const normalizedGranted = normalizeLevel(grantedLevel);
    const requestedIndex = LEVEL_ORDER.indexOf(normalizedRequested);
    const grantedIndex = LEVEL_ORDER.indexOf(normalizedGranted);
    return requestedIndex <= grantedIndex ? normalizedRequested : normalizedGranted;
}

function buildEntitlements(level, overrides = {}) {
    const normalizedLevel = normalizeLevel(level);
    return {
        ...(FEATURE_MATRIX[normalizedLevel] || FEATURE_MATRIX.basic),
        ...sanitizeFeatureOverrides(overrides)
    };
}

function sanitizeFeatureOverrides(overrides) {
    const source = overrides && typeof overrides === 'object' ? overrides : {};
    return OVERRIDABLE_FEATURES.reduce((result, featureName) => {
        if (!Object.prototype.hasOwnProperty.call(source, featureName)) return result;
        result[featureName] = !!source[featureName];
        return result;
    }, {});
}

module.exports = {
    FEATURE_MATRIX,
    OVERRIDABLE_FEATURES,
    buildEntitlements,
    clampRequestedLevel,
    normalizeLevel,
    sanitizeFeatureOverrides
};
