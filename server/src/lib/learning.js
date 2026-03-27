const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function clampNumber(value, min, max, fallback = min) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function normalizeSourceType(sourceType, fileName = '', mimeType = '') {
    const explicit = String(sourceType || '').trim().toLowerCase();
    if (['mobile-photo', 'desktop-capture', 'clean-blueprint'].includes(explicit)) return explicit;
    const name = String(fileName || '').toLowerCase();
    const mime = String(mimeType || '').toLowerCase();
    if (mime.includes('heic') || mime.includes('heif') || /^img[_-]/.test(name) || /^dsc[_-]/.test(name)) return 'mobile-photo';
    if (name.includes('screenshot') || name.includes('screen shot') || name.startsWith('截圖') || mime.includes('webp')) return 'desktop-capture';
    return 'clean-blueprint';
}

function sanitizeFileName(fileName) {
    const fallback = `blueprint-${Date.now()}.png`;
    const raw = String(fileName || '').trim();
    const normalized = raw
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    return normalized || fallback;
}

function extFromMimeType(mimeType = '') {
    const mime = String(mimeType || '').toLowerCase();
    if (mime.includes('png')) return '.png';
    if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
    if (mime.includes('webp')) return '.webp';
    if (mime.includes('gif')) return '.gif';
    return '.png';
}

function parseDataUrl(dataUrl) {
    const raw = String(dataUrl || '').trim();
    const match = raw.match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) throw new Error('圖紙資料格式錯誤，請重新上傳');
    return {
        mimeType: String(match[1] || 'image/png').toLowerCase(),
        buffer: Buffer.from(match[2], 'base64')
    };
}

async function persistBlueprintAsset(serverRoot, account, payload) {
    const parsed = parseDataUrl(payload.dataUrl);
    const sourceType = normalizeSourceType(payload.sourceType, payload.fileName, parsed.mimeType);
    const sourceProfile = String(payload.sourceProfile || sourceType).trim() || sourceType;
    const assetId = `asset-${randomUUID()}`;
    const safeAccount = String(account || 'access').replace(/[^a-z0-9_-]+/gi, '-');
    const fileExt = path.extname(String(payload.fileName || '')) || extFromMimeType(parsed.mimeType);
    const safeName = sanitizeFileName(path.basename(String(payload.fileName || `blueprint${fileExt}`), path.extname(String(payload.fileName || ''))));
    const uploadDir = path.join(serverRoot, 'uploads', 'blueprints', safeAccount);
    await fs.mkdir(uploadDir, { recursive: true });
    const fileName = `${assetId}-${safeName}${fileExt}`;
    const absolutePath = path.join(uploadDir, fileName);
    await fs.writeFile(absolutePath, parsed.buffer);
    return {
        assetId,
        fileName,
        originalName: String(payload.fileName || fileName),
        mimeType: parsed.mimeType,
        sizeBytes: parsed.buffer.length,
        width: Math.max(0, Math.round(Number(payload.width) || 0)),
        height: Math.max(0, Math.round(Number(payload.height) || 0)),
        orientation: String(payload.orientation || (Number(payload.width) >= Number(payload.height) ? 'landscape' : 'portrait')),
        captureMode: String(payload.captureMode || 'single-image'),
        sourceType,
        sourceProfile,
        normalizedVariants: Array.isArray(payload.normalizedVariants) ? payload.normalizedVariants.slice(0, 12) : [],
        relativePath: path.relative(serverRoot, absolutePath),
        uploadedAt: new Date().toISOString()
    };
}

async function readAssetAsDataUrl(serverRoot, asset) {
    const relativePath = String(asset && asset.relativePath || '').trim();
    if (!relativePath) throw new Error('找不到圖紙檔案路徑');
    const absolutePath = path.join(serverRoot, relativePath);
    const file = await fs.readFile(absolutePath);
    const mimeType = String(asset && asset.mimeType || 'image/png').trim() || 'image/png';
    return `data:${mimeType};base64,${file.toString('base64')}`;
}

function createLearningJob(asset, options = {}) {
    const now = new Date().toISOString();
    return {
        jobId: `learn-${randomUUID()}`,
        assetId: String(asset && asset.assetId || ''),
        assetName: String(asset && asset.originalName || ''),
        sourceProfile: String(asset && asset.sourceProfile || 'clean-blueprint'),
        thresholdScore: clampNumber(options.thresholdScore, 0, 99.9, 95),
        maxAttempts: Math.max(1, Math.min(6, Math.round(Number(options.maxAttempts) || 3))),
        status: 'queued',
        attempts: [],
        bestScore: 0,
        bestLevel: 'E',
        bestAttemptNo: 0,
        bestReport: null,
        createdAt: now,
        updatedAt: now,
        startedAt: '',
        completedAt: '',
        approvedToCoreMemoryAt: '',
        reviewRequiredAt: '',
        lastError: '',
        reviewDecision: '',
        reviewDecisionAt: '',
        reviewNote: ''
    };
}

function createLearningReview(job, decision, note = '') {
    const now = new Date().toISOString();
    return {
        reviewId: `review-${randomUUID()}`,
        jobId: String(job && job.jobId || ''),
        assetId: String(job && job.assetId || ''),
        decision: String(decision || 'pending'),
        note: String(note || '').trim(),
        bestScore: clampQaScore(job && job.bestScore),
        createdAt: now
    };
}

function clampQaScore(score) {
    const normalized = clampNumber(score, 0, 99.9, 0);
    return Math.round(normalized * 10) / 10;
}

function clampOverallConfidence(confidence) {
    return Math.round(clampNumber(confidence, 0, 0.999, 0) * 1000) / 1000;
}

function parseJsonResponse(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch (_error) {
        const match = text.match(/\{[\s\S]*\}$/);
        if (!match) return null;
        try {
            return JSON.parse(match[0]);
        } catch (_innerError) {
            return null;
        }
    }
}

function buildAttemptPrompt(asset, attemptNo, maxAttempts, previousBestScore = 0) {
    const sourceProfile = String(asset && asset.sourceProfile || 'clean-blueprint');
    const profileGuide = sourceProfile === 'mobile-photo'
        ? '這是一張手機拍攝的施工圖，請特別忽略透視、陰影、反光、傾斜和背景雜訊。'
        : (sourceProfile === 'desktop-capture'
            ? '這是一張電腦截圖，請特別保留文字與線條，忽略 UI 邊界與多餘空白。'
            : '這是一張相對乾淨的正式藍圖，請優先讀取圖框、標註與構件尺寸。');
    return [
        '你是 Construction Master 的後台藍圖辨識引擎。',
        profileGuide,
        `目前是第 ${attemptNo}/${maxAttempts} 輪，前次最佳 QA 分數為 ${clampQaScore(previousBestScore)}。`,
        '請根據圖片判斷主要構件與尺寸，並只回傳 JSON，不要加說明文字。',
        'JSON 格式：',
        '{',
        '  "recognizedType": "M_WALL | M_BEAM_SIDES | M_BEAM_ALL | C_VOL | C_COL | M_COL | E_DIG | UNKNOWN",',
        '  "quantity": 1,',
        '  "longM": 0,',
        '  "shortM": 0,',
        '  "overallConfidence": 0.0,',
        '  "needsReview": true,',
        '  "reviewFields": ["尺寸/數量"],',
        '  "pendingFields": [],',
        '  "multiSourceFieldCount": 0,',
        '  "fieldConfidenceSummary": "一句話摘要",',
        '  "crossValidationSummary": "一句話摘要",',
        '  "notes": "一句話摘要"',
        '}',
        'overallConfidence 請用 0 到 0.999 之間的小數。'
    ].join('\n');
}

async function callVisionRecognition(config, dataUrl, asset, attemptNo, maxAttempts, previousBestScore = 0) {
    if (!config.openAiEnabled || !config.openAiApiKey) {
        return {
            report: {
                type: 'UNKNOWN',
                quantity: 1,
                longM: 0,
                shortM: 0,
                overallConfidence: 0.41,
                needsReview: true,
                reviewFields: [config.openAiEnabled ? 'AI 服務未設定' : 'AI 服務已停用'],
                pendingFields: ['主要尺寸'],
                multiSourceFieldCount: 0,
                fieldConfidenceSummary: config.openAiEnabled
                    ? '後台 AI 服務未設定，僅建立學習任務骨架'
                    : '後台 AI 已停用，僅建立學習任務骨架',
                crossValidationSummary: config.openAiEnabled
                    ? '待設定 OpenAI Vision 後才能做正式辨識'
                    : '已停用 OpenAI Vision，不會呼叫外部 AI API',
                notes: 'fallback'
            },
            upstreamModel: '',
            rawContent: ''
        };
    }
    const upstreamResponse = await fetch(config.openAiEndpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.openAiApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: config.openAiModel,
            temperature: 0.1,
            messages: [
                {
                    role: 'system',
                    content: '你是結構藍圖辨識引擎，輸出必須是嚴格 JSON。'
                },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: buildAttemptPrompt(asset, attemptNo, maxAttempts, previousBestScore) },
                        { type: 'image_url', image_url: { url: dataUrl } }
                    ]
                }
            ]
        })
    });
    const upstreamText = await upstreamResponse.text();
    let upstreamJson = {};
    try {
        upstreamJson = upstreamText ? JSON.parse(upstreamText) : {};
    } catch (_error) {
        upstreamJson = { raw: upstreamText };
    }
    if (!upstreamResponse.ok) {
        throw new Error(`VISION_UPSTREAM_FAILED:${upstreamResponse.status}`);
    }
    const messageContent = upstreamJson
        && upstreamJson.choices
        && upstreamJson.choices[0]
        && upstreamJson.choices[0].message
        ? upstreamJson.choices[0].message.content
        : '';
    const rawContent = Array.isArray(messageContent)
        ? messageContent.map((part) => {
            if (typeof part === 'string') return part;
            if (part && typeof part.text === 'string') return part.text;
            return '';
        }).filter(Boolean).join('\n')
        : String(messageContent || '');
    const parsed = parseJsonResponse(rawContent);
    if (!parsed) throw new Error('VISION_RESPONSE_PARSE_FAILED');
    return {
        report: {
            type: String(parsed.recognizedType || parsed.type || 'UNKNOWN').trim() || 'UNKNOWN',
            quantity: Math.max(1, Math.round(Number(parsed.quantity) || 1)),
            longM: Math.max(0, Number(parsed.longM) || 0),
            shortM: Math.max(0, Number(parsed.shortM) || 0),
            overallConfidence: clampOverallConfidence(parsed.overallConfidence),
            needsReview: parsed.needsReview !== false,
            reviewFields: Array.isArray(parsed.reviewFields) ? parsed.reviewFields.filter(Boolean).slice(0, 8) : [],
            pendingFields: Array.isArray(parsed.pendingFields) ? parsed.pendingFields.filter(Boolean).slice(0, 8) : [],
            multiSourceFieldCount: Math.max(0, Math.min(5, Math.round(Number(parsed.multiSourceFieldCount) || 0))),
            fieldConfidenceSummary: String(parsed.fieldConfidenceSummary || '').trim(),
            crossValidationSummary: String(parsed.crossValidationSummary || '').trim(),
            notes: String(parsed.notes || '').trim()
        },
        upstreamModel: String(upstreamJson.model || config.openAiModel || '').trim(),
        rawContent: String(rawContent || '').trim()
    };
}

function buildAutoInterpretMemorySample(job, asset) {
    const report = job && job.bestReport;
    if (!report || !report.type || report.type === 'UNKNOWN') return null;
    const width = Math.max(1, Number(asset && asset.width) || 1);
    const height = Math.max(1, Number(asset && asset.height) || 1);
    return {
        ts: new Date().toISOString(),
        type: String(report.type || '').trim(),
        quantity: Math.max(1, Math.round(Number(report.quantity) || 1)),
        longM: Math.max(0, Number(report.longM) || 0),
        shortM: Math.max(0, Number(report.shortM) || 0),
        quality: `後台學習/${String(asset && asset.sourceProfile || 'clean-blueprint')}`,
        vector: {
            longPx: width,
            shortPx: height,
            ratio: width / Math.max(1, height),
            coverage: 0.92,
            quality: `後台學習/${String(asset && asset.sourceProfile || 'clean-blueprint')}`,
            meanLuma: 0,
            contrastVar: 0,
            blurVar: 0
        },
        learnedFrom: 'backend-learning',
        qaScore: clampQaScore(job && job.bestScore)
    };
}

module.exports = {
    buildAutoInterpretMemorySample,
    callVisionRecognition,
    clampQaScore,
    createLearningJob,
    createLearningReview,
    normalizeSourceType,
    persistBlueprintAsset,
    readAssetAsDataUrl
};
