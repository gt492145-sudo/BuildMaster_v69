const QA_PROFILE_CONFIGS = {
    standard: {
        label: '標準',
        thresholds: { S: 95, A: 90, B: 80, C: 70, D: 60 },
        warningPenalty: 5,
        missingTypePenalty: 6,
        noQuantityPenalty: 5,
        entityPenalty: 18,
        elementPenalty: 18,
        layoutDuplicatePenalty: 2,
        layoutMissingPenalty: 5,
        layoutRangePenalty: 3,
        namingPenalty: 2,
        floorPenalty: 2,
        clusterPenalty: 1
    },
    strict: {
        label: '嚴格',
        thresholds: { S: 97, A: 93, B: 85, C: 75, D: 65 },
        warningPenalty: 6,
        missingTypePenalty: 8,
        noQuantityPenalty: 8,
        entityPenalty: 22,
        elementPenalty: 22,
        layoutDuplicatePenalty: 3,
        layoutMissingPenalty: 6,
        layoutRangePenalty: 4,
        namingPenalty: 3,
        floorPenalty: 3,
        clusterPenalty: 2
    },
    enterprise: {
        label: '企業',
        thresholds: { S: 99, A: 95, B: 90, C: 80, D: 70 },
        warningPenalty: 7,
        missingTypePenalty: 10,
        noQuantityPenalty: 10,
        entityPenalty: 26,
        elementPenalty: 26,
        layoutDuplicatePenalty: 4,
        layoutMissingPenalty: 7,
        layoutRangePenalty: 5,
        namingPenalty: 4,
        floorPenalty: 4,
        clusterPenalty: 3
    }
};

const BIM_SPEC_PRESETS = {
    general: {
        label: 'BuildMaster 通用',
        requireFloorTag: false,
        pointIdPattern: /^(LP|P|PT|COL|WALL|BEAM|SLAB)[-_A-Z0-9]+$/i,
        duplicateToleranceM: 0.01,
        maxAbsCoord: 10000
    },
    public: {
        label: '公共工程 BIM',
        requireFloorTag: true,
        pointIdPattern: /^(COL|WALL|BEAM|SLAB|LP)-[A-Z0-9_-]+$/i,
        duplicateToleranceM: 0.01,
        maxAbsCoord: 6000
    },
    structure: {
        label: '結構施工 BIM',
        requireFloorTag: true,
        pointIdPattern: /^(COL|BEAM|SLAB|WALL|LP)-[A-Z0-9_-]+$/i,
        duplicateToleranceM: 0.008,
        maxAbsCoord: 8000
    }
};

function normalizeQaProfile(profile) {
    return QA_PROFILE_CONFIGS[profile] ? profile : 'enterprise';
}

function normalizeBimSpecPreset(preset) {
    return BIM_SPEC_PRESETS[preset] ? preset : 'public';
}

function getQaLevelByScore(score, profile = 'enterprise') {
    const normalizedProfile = normalizeQaProfile(profile);
    const thresholds = QA_PROFILE_CONFIGS[normalizedProfile].thresholds;
    const n = Number(score) || 0;
    if (n >= thresholds.S) return 'S';
    if (n >= thresholds.A) return 'A';
    if (n >= thresholds.B) return 'B';
    if (n >= thresholds.C) return 'C';
    if (n >= thresholds.D) return 'D';
    return 'E';
}

function evaluateGroupStability(points) {
    const groupMap = new Map();
    points.forEach((point) => {
        const group = point.layoutGroup || 'UNGROUPED';
        if (!groupMap.has(group)) groupMap.set(group, []);
        groupMap.get(group).push(point);
    });

    const groupScores = [];
    groupMap.forEach((items) => {
        if (items.length < 2) {
            groupScores.push(85);
            return;
        }
        const zValues = items.map((item) => Number(item.z) || 0);
        const mean = zValues.reduce((sum, value) => sum + value, 0) / zValues.length;
        const variance = zValues.reduce((sum, value) => {
            const diff = value - mean;
            return sum + diff * diff;
        }, 0) / zValues.length;
        const std = Math.sqrt(variance);
        groupScores.push(Math.max(0, Math.min(100, Math.round(100 - std * 50))));
    });

    return {
        groupCount: groupMap.size,
        groupStabilityScore: groupScores.length
            ? Math.round(groupScores.reduce((sum, value) => sum + value, 0) / groupScores.length)
            : 0
    };
}

function scoreMeasurementQa(input) {
    const stats = input && input.measureQaStats ? input.measureQaStats : {};
    const starts = Math.max(1, Number(stats.measureStarts) || 0);
    const successRate = (Number(stats.measureSuccess) || 0) / starts;
    const avgTilt = Number(stats.tiltSamples) > 0
        ? ((Number(stats.tiltSum) || 0) / Number(stats.tiltSamples))
        : 0;
    const strictBlocks = Number(stats.strictBlocks) || 0;
    const smartSessions = Number(stats.smartSessions) || 0;
    const smartCompleted = Number(stats.smartCompleted) || 0;
    const smartSuccessRate = smartSessions > 0 ? (smartCompleted / smartSessions) : 1;
    const smartFallbacks = Number(stats.smartFallbacks) || 0;
    const smartLowConfidence = Number(stats.smartLowConfidence) || 0;

    let score = 100;
    score -= Math.max(0, Math.round((1 - successRate) * 40));
    score -= Math.max(0, Math.round(Math.max(0, avgTilt - 5) * 3));
    score -= Math.min(20, strictBlocks * 2);
    score -= Math.max(0, Math.round((1 - smartSuccessRate) * 12));
    score -= Math.min(8, smartFallbacks * 2);
    score -= Math.min(10, smartLowConfidence * 2);
    const qaScore = Math.max(0, Math.min(100, score));

    return {
        avgTilt,
        qaLevel: getQaLevelByScore(qaScore),
        qaScore
    };
}

function scoreBimLayout(input) {
    const points = Array.isArray(input && input.points) ? input.points : [];
    const normalizedProfile = normalizeQaProfile(input && input.qaProfile);
    const normalizedSpec = normalizeBimSpecPreset(input && input.bimSpecPreset);
    const profile = QA_PROFILE_CONFIGS[normalizedProfile];
    const spec = BIM_SPEC_PRESETS[normalizedSpec];

    const keySet = new Set();
    let duplicatePointCount = 0;
    let missingGeometryCount = 0;
    let outOfRangeCount = 0;
    let namingInvalidCount = 0;
    let missingFloorTagCount = 0;
    let duplicateClusterCount = 0;
    let maxDeviation = 0;
    const validPoints = [];

    points.forEach((point) => {
        const valid = [point.x, point.y, point.z].every(Number.isFinite);
        if (!valid) {
            missingGeometryCount += 1;
            return;
        }
        validPoints.push(point);
        const key = `${Number(point.x).toFixed(2)}|${Number(point.y).toFixed(2)}|${Number(point.z).toFixed(2)}`;
        if (keySet.has(key)) duplicatePointCount += 1;
        else keySet.add(key);
        if (Math.abs(Number(point.x) || 0) > spec.maxAbsCoord || Math.abs(Number(point.y) || 0) > spec.maxAbsCoord || Math.abs(Number(point.z) || 0) > spec.maxAbsCoord) outOfRangeCount += 1;
        if (spec.pointIdPattern && !spec.pointIdPattern.test(String(point.id || ''))) namingInvalidCount += 1;
        if (spec.requireFloorTag && !String(point.floorTag || '').trim()) missingFloorTagCount += 1;
        maxDeviation = Math.max(maxDeviation, Math.abs(Number(point.z) || 0));
    });

    const nearestDistances = [];
    for (let i = 0; i < validPoints.length; i += 1) {
        let nearest = Infinity;
        for (let j = 0; j < validPoints.length; j += 1) {
            if (i === j) continue;
            const dx = (Number(validPoints[i].x) || 0) - (Number(validPoints[j].x) || 0);
            const dy = (Number(validPoints[i].y) || 0) - (Number(validPoints[j].y) || 0);
            const dz = (Number(validPoints[i].z) || 0) - (Number(validPoints[j].z) || 0);
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (distance < nearest) nearest = distance;
            if (j > i && distance < spec.duplicateToleranceM) duplicateClusterCount += 1;
        }
        if (Number.isFinite(nearest) && nearest < Infinity) nearestDistances.push(nearest);
    }

    const meanDist = nearestDistances.length
        ? (nearestDistances.reduce((sum, value) => sum + value, 0) / nearestDistances.length)
        : 0;
    const varianceDist = nearestDistances.length
        ? (nearestDistances.reduce((sum, value) => {
            const diff = value - meanDist;
            return sum + diff * diff;
        }, 0) / nearestDistances.length)
        : 0;
    const stdDist = Math.sqrt(varianceDist);
    const cv = meanDist > 0 ? (stdDist / meanDist) : 1;
    const spacingStabilityScore = Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
    const groupStats = evaluateGroupStability(validPoints);

    const penalty = duplicatePointCount * profile.layoutDuplicatePenalty
        + duplicateClusterCount * profile.clusterPenalty
        + missingGeometryCount * profile.layoutMissingPenalty
        + outOfRangeCount * profile.layoutRangePenalty
        + namingInvalidCount * profile.namingPenalty
        + missingFloorTagCount * profile.floorPenalty
        + Math.max(0, 72 - spacingStabilityScore)
        + Math.max(0, 78 - groupStats.groupStabilityScore);
    const qaScore = Math.max(0, 100 - penalty);

    return {
        duplicatePointCount,
        duplicateClusterCount,
        missingGeometryCount,
        outOfRangeCount,
        namingInvalidCount,
        missingFloorTagCount,
        maxDeviation: Math.round(maxDeviation * 1000) / 1000,
        spacingStabilityScore,
        groupStabilityScore: groupStats.groupStabilityScore,
        groupCount: groupStats.groupCount,
        precisionEnabled: !!(input && input.precisionEnabled),
        qaProfile: normalizedProfile,
        bimSpecPreset: normalizedSpec,
        qaLevel: getQaLevelByScore(qaScore, normalizedProfile),
        qaScore,
        checkedAt: new Date().toISOString()
    };
}

function scoreAutoInterpret(input) {
    const report = input && input.report ? input.report : {};
    const overallConfidence = Number(report.overallConfidence);
    const needsReview = !!report.needsReview;
    const reviewFields = Array.isArray(report.reviewFields) && report.reviewFields.length
        ? report.reviewFields.filter(Boolean)
        : (Array.isArray(report.pendingFields) ? report.pendingFields.filter(Boolean) : []);
    const reviewGateState = String(report.reviewGateState || (needsReview ? 'review' : 'ready'));
    const reviewFieldCount = Math.max(
        reviewFields.length,
        Number.isFinite(Number(report.reviewFieldCount)) ? Number(report.reviewFieldCount) : 0
    );
    const multiSourceFieldCount = Number.isFinite(Number(report.multiSourceFieldCount))
        ? Math.max(0, Number(report.multiSourceFieldCount))
        : 0;
    const confidenceScore = Number.isFinite(overallConfidence)
        ? Math.max(0, Math.min(99.9, Math.round(overallConfidence * 1000) / 10))
        : 0;
    const reviewPenalty = reviewGateState === 'pending'
        ? 18
        : (reviewGateState === 'review' || needsReview ? 12 : 0);
    const fieldPenalty = Math.min(24, reviewFieldCount * 6);
    const multiSourceBonus = Math.min(10, multiSourceFieldCount * 2);
    const qaScore = Math.round(Math.max(0, Math.min(99.9, confidenceScore - reviewPenalty - fieldPenalty + multiSourceBonus)) * 10) / 10;
    return {
        qaLevel: getQaLevelByScore(qaScore),
        qaScore,
        needsReview,
        reviewFields,
        reviewGateState,
        reviewFieldCount,
        multiSourceFieldCount
    };
}

module.exports = {
    BIM_SPEC_PRESETS,
    QA_PROFILE_CONFIGS,
    getQaLevelByScore,
    normalizeBimSpecPreset,
    normalizeQaProfile,
    scoreAutoInterpret,
    scoreBimLayout,
    scoreMeasurementQa
};
