const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const { loadDefaultEnv } = require('./lib/env');
const { createSessionToken, hashText, verifySessionToken } = require('./lib/crypto');
const { buildEntitlements, clampRequestedLevel, normalizeLevel } = require('./lib/entitlements');
const { calculateAdvancedEstimate, calculateCore } = require('./lib/calc');
const { buildAutoInterpretMemorySample, callVisionRecognition, clampQaScore, createLearningJob, createLearningReview, persistBlueprintAsset, readAssetAsDataUrl } = require('./lib/learning');
const { scoreAutoInterpret, scoreBimLayout, scoreMeasurementQa } = require('./lib/qa');
const {
    appendSharedAutoInterpretSample,
    deleteMember,
    deleteOwnAccount,
    getWorkspace,
    initializeStore,
    listMembers,
    listSharedAutoInterpretSampleRows,
    saveMember,
    sanitizeWorkspace,
    setWorkspaceResource,
    updateWorkspace,
    verifyMemberLogin,
    withDb
} = require('./lib/store');
const {
    buildAppleProductLevelMap,
    buildPriceLevelMap,
    buildPublicCatalog,
    computeStripeBillingTtlSeconds,
    extractStripePriceIdFromSession,
    postAppleVerifyReceipt,
    resolveAppleEntitlement,
    stripeRetrieveCheckoutSession,
    stripeRetrieveSubscription,
    verifyStripeWebhookSignature
} = require('./lib/billing');

const serverRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(serverRoot, '..');

loadDefaultEnv(serverRoot);

const config = {
    host: String(process.env.HOST || '127.0.0.1').trim() || '127.0.0.1',
    port: Number(process.env.PORT) || 8787,
    authSecret: String(process.env.AUTH_SECRET || 'buildmaster-dev-secret-change-me'),
    accessCode: String(process.env.BUILDMASTER_ACCESS_CODE || 'ChangeMe2026!').trim(),
    accessLevel: normalizeLevel(process.env.BUILDMASTER_ACCESS_LEVEL || 'standard'),
    defaultAdminAccount: String(process.env.DEFAULT_ADMIN_ACCOUNT || 'owner').trim().toLowerCase(),
    defaultAdminPassword: String(process.env.DEFAULT_ADMIN_PASSWORD || 'ChangeMe123!').trim(),
    defaultAdminLevel: normalizeLevel(process.env.DEFAULT_ADMIN_LEVEL || 'pro'),
    appReviewDemoAccount: String(process.env.APP_REVIEW_DEMO_ACCOUNT || '').trim().toLowerCase(),
    appReviewDemoPassword: String(process.env.APP_REVIEW_DEMO_PASSWORD || '').trim(),
    appReviewDemoLevel: normalizeLevel(process.env.APP_REVIEW_DEMO_LEVEL || 'pro'),
    openAiEnabled: String(process.env.OPENAI_ENABLED || 'false').trim().toLowerCase() === 'true',
    openAiApiKey: String(process.env.OPENAI_API_KEY || '').trim(),
    openAiEndpoint: String(process.env.OPENAI_ENDPOINT || 'https://api.openai.com/v1/chat/completions').trim(),
    openAiModel: String(process.env.OPENAI_MODEL || 'gpt-4.1-mini').trim(),
    ibmQuantumApiKey: String(process.env.IBM_QUANTUM_API_KEY || '').trim(),
    ibmQuantumEndpoint: String(process.env.IBM_QUANTUM_ENDPOINT || 'https://api.quantum-computing.ibm.com/v2/jobs').trim(),
    databaseUrl: String(process.env.DATABASE_URL || '').trim(),
    dbHost: String(process.env.DB_HOST || '').trim(),
    dbPort: Number(process.env.DB_PORT) || 5432,
    dbName: String(process.env.DB_NAME || '').trim(),
    dbUser: String(process.env.DB_USER || '').trim(),
    dbPassword: String(process.env.DB_PASSWORD || ''),
    dbSslMode: String(process.env.DB_SSL || process.env.PGSSLMODE || 'require').trim(),
    dbSslRejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'false').trim(),
    dbPoolMax: Number(process.env.DB_POOL_MAX) || 10,
    dbIdleTimeoutMs: Number(process.env.DB_IDLE_TIMEOUT_MS) || 30000,
    dbConnectTimeoutMs: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 10000,
    allowedOrigins: String(process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    stripeSecretKey: String(process.env.STRIPE_SECRET_KEY || '').trim(),
    stripeWebhookSecret: String(process.env.STRIPE_WEBHOOK_SECRET || '').trim(),
    stripePublishableKey: String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim(),
    stripePriceBasic: String(process.env.STRIPE_PRICE_BASIC || '').trim(),
    stripePriceStandard: String(process.env.STRIPE_PRICE_STANDARD || '').trim(),
    stripePricePro: String(process.env.STRIPE_PRICE_PRO || '').trim(),
    stripePaymentLinkBasic: String(process.env.STRIPE_PAYMENT_LINK_BASIC || '').trim(),
    stripePaymentLinkStandard: String(process.env.STRIPE_PAYMENT_LINK_STANDARD || '').trim(),
    stripePaymentLinkPro: String(process.env.STRIPE_PAYMENT_LINK_PRO || '').trim(),
    appleSharedSecret: String(process.env.APPLE_APP_STORE_SHARED_SECRET || '').trim(),
    appleProductBasic: String(process.env.APPLE_IAP_PRODUCT_BASIC || '').trim(),
    appleProductStandard: String(process.env.APPLE_IAP_PRODUCT_STANDARD || '').trim(),
    appleProductPro: String(process.env.APPLE_IAP_PRODUCT_PRO || '').trim(),
    billingSessionTtlSeconds: Math.max(3600, Number(process.env.BILLING_SESSION_TTL_SECONDS) || 60 * 60 * 24 * 90),
    billingSessionMaxTtlSeconds: Math.max(86400, Number(process.env.BILLING_SESSION_MAX_TTL_SECONDS) || 60 * 60 * 24 * 366),
    sharedLearningEnabled: String(process.env.SHARED_LEARNING_ENABLED || '1').trim() !== '0'
};

const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.webp': 'image/webp'
};

const activeLearningJobs = new Map();

function normalizeAccount(account) {
    return String(account || '').trim().toLowerCase();
}

function isAllowedOrigin(origin) {
    if (!origin) return false;
    if (config.allowedOrigins.includes(origin)) return true;
    const originStr = String(origin).trim();
    // file:// 等 opaque origin 常送 Origin: null；伺服器綁本機時放行以利雙擊 HTML 測試
    if (
        originStr === 'null'
        && (config.host === '127.0.0.1' || config.host === 'localhost' || config.host === '0.0.0.0' || config.host === '::')
    ) {
        return true;
    }
    try {
        const url = new URL(origin);
        const host = url.hostname.toLowerCase();
        // 本機任意埠（Live Server、Vite、未寫進 ALLOWED_ORIGINS 的埠）
        if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') {
            return true;
        }
        return host.endsWith('.netlify.app') || host.endsWith('.github.io');
    } catch (_error) {
        return false;
    }
}

function buildCorsHeaders(request) {
    const origin = String(request.headers.origin || '').trim();
    if (!origin || !isAllowedOrigin(origin)) return {};
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    };
}

function sendJson(response, statusCode, payload, request) {
    const headers = {
        ...buildCorsHeaders(request),
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8'
    };
    response.writeHead(statusCode, headers);
    response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text, request, contentType = 'text/plain; charset=utf-8') {
    const headers = {
        ...buildCorsHeaders(request),
        'Cache-Control': 'no-store',
        'Content-Type': contentType
    };
    response.writeHead(statusCode, headers);
    response.end(String(text || ''));
}

function createHttpError(statusCode, message, errorCode = 'REQUEST_FAILED') {
    const error = new Error(message || '請求失敗');
    error.statusCode = Number(statusCode) || 500;
    error.errorCode = String(errorCode || 'REQUEST_FAILED');
    return error;
}

function readRawBodyBuffer(request, maxBytes = 512 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        request.on('data', (chunk) => {
            size += chunk.length;
            if (size > maxBytes) {
                reject(new Error('Payload too large'));
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => resolve(Buffer.concat(chunks)));
        request.on('error', reject);
    });
}

async function readJsonBody(request, maxBytes = 2 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        let size = 0;
        let raw = '';
        request.setEncoding('utf8');
        request.on('data', (chunk) => {
            raw += chunk;
            size += Buffer.byteLength(chunk);
            if (size > maxBytes) {
                reject(new Error('Payload too large'));
                request.destroy();
            }
        });
        request.on('end', () => {
            if (!raw) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch (_error) {
                reject(new Error('Invalid JSON body'));
            }
        });
        request.on('error', reject);
    });
}

function getBearerToken(request) {
    const header = String(request.headers.authorization || '').trim();
    if (!header.toLowerCase().startsWith('bearer ')) return '';
    return header.slice(7).trim();
}

const LOGIN_SESSION_TTL_SECONDS = 60 * 60 * 12;

function sessionFromVerifiedPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const sessionType = String(payload.sessionType || 'access');
    const grantedLevel = sessionType === 'access'
        ? normalizeLevel(config.accessLevel || 'basic')
        : normalizeLevel(payload.userLevel || 'basic');
    const rawExp = Number(payload.exp);
    const tokenExp = Number.isFinite(rawExp) && rawExp > 0 ? rawExp : 0;
    return {
        account: normalizeAccount(payload.account || 'access'),
        featureOverrides: payload.featureOverrides && typeof payload.featureOverrides === 'object' ? payload.featureOverrides : {},
        sessionType,
        userLevel: grantedLevel,
        canManageMembers: !!payload.canManageMembers,
        tokenExp,
        billing: payload.billing && typeof payload.billing === 'object' ? payload.billing : null
    };
}

function getSessionFromRequest(request) {
    const token = getBearerToken(request);
    const payload = verifySessionToken(token, config.authSecret);
    if (!payload) return null;
    return sessionFromVerifiedPayload(payload);
}

function buildConfiguredDemoSession(account, password) {
    if (
        config.appReviewDemoAccount
        && config.appReviewDemoPassword
        && account === config.appReviewDemoAccount
        && hashText(password) === hashText(config.appReviewDemoPassword)
    ) {
        return {
            account: config.appReviewDemoAccount,
            canManageMembers: false,
            featureOverrides: {},
            sessionType: 'member',
            userLevel: config.appReviewDemoLevel,
            billing: {
                source: 'app_review_demo',
                hasSubscriptionExpiry: false
            }
        };
    }
    return null;
}

function buildSessionView(session) {
    const grantedLevel = normalizeLevel(session.userLevel);
    const requestedLevel = clampRequestedLevel(session.requestedLevel || grantedLevel, grantedLevel);
    const view = {
        account: normalizeAccount(session.account || 'access'),
        canManageMembers: !!session.canManageMembers,
        entitlements: buildEntitlements(grantedLevel, session.featureOverrides),
        featureOverrides: session.featureOverrides && typeof session.featureOverrides === 'object' ? session.featureOverrides : {},
        integrations: {
            aiCoachConfigured: !!(config.openAiEnabled && config.openAiApiKey),
            ibmQuantumConfigured: !!config.ibmQuantumApiKey
        },
        requestedLevel,
        sessionType: String(session.sessionType || 'access'),
        userLevel: grantedLevel
    };
    if (Number(session.tokenExp) > 0) {
        view.accessExpiresAt = new Date(session.tokenExp * 1000).toISOString();
    }
    if (session.billing && typeof session.billing === 'object') {
        view.billing = session.billing;
    }
    return view;
}

function requireAuth(request, response) {
    const session = getSessionFromRequest(request);
    if (!session) {
        sendJson(response, 401, { error: 'AUTH_REQUIRED', message: '請先登入後再使用此功能。' }, request);
        return null;
    }
    return session;
}

function requireFeature(request, response, featureName) {
    const session = requireAuth(request, response);
    if (!session) return null;
    const entitlements = buildEntitlements(session.userLevel, session.featureOverrides);
    if (!entitlements[featureName]) {
        sendJson(response, 403, { error: 'FEATURE_DENIED', feature: featureName, message: '目前帳號無法使用此功能。' }, request);
        return null;
    }
    return session;
}

async function handleLogin(request, response) {
    const body = await readJsonBody(request);
    const account = normalizeAccount(body.account);
    const password = String(body.password || '').trim();
    if (!password) {
        sendJson(response, 400, { error: 'PASSWORD_REQUIRED', message: '請輸入存取碼或會員密碼。' }, request);
        return;
    }

    let sessionPayload = null;
    // 存取碼登入不依賴資料庫；密碼與存取碼一致時一律走此路徑（避免會員帳號欄誤填導致永遠登不進）。
    if (hashText(password) === hashText(config.accessCode)) {
        sessionPayload = {
            account: 'access',
            canManageMembers: false,
            featureOverrides: {},
            sessionType: 'access',
            userLevel: config.accessLevel
        };
    } else if (account) {
        sessionPayload = buildConfiguredDemoSession(account, password);
    }

    if (!sessionPayload && account) {
        try {
            await withDb(config, async (db) => {
                const member = await verifyMemberLogin(db, account, password);
                if (member) {
                    sessionPayload = {
                        account: member.account,
                        canManageMembers: !!member.canManageMembers,
                        featureOverrides: member.featureOverrides || {},
                        sessionType: 'member',
                        userLevel: normalizeLevel(member.level)
                    };
                }
            });
        } catch (error) {
            console.error('BuildMaster login DB error', error);
            sendJson(response, 503, {
                error: 'STORE_UNAVAILABLE',
                message: '會員登入需要資料庫連線，請稍後再試或確認伺服器設定。'
            }, request);
            return;
        }
    }

    if (!sessionPayload) {
        sendJson(response, 401, { error: 'LOGIN_FAILED', message: account ? '會員帳號或密碼錯誤。' : '存取碼錯誤。' }, request);
        return;
    }

    if (!sessionPayload.billing) {
        sessionPayload.billing = {
            source: sessionPayload.sessionType === 'member' ? 'password' : 'access_code',
            hasSubscriptionExpiry: false
        };
    }
    const token = createSessionToken(sessionPayload, config.authSecret, LOGIN_SESSION_TTL_SECONDS);
    const verified = verifySessionToken(token, config.authSecret);
    const session = sessionFromVerifiedPayload(verified);
    sendJson(response, 200, {
        token,
        ...buildSessionView(session)
    }, request);
}

async function handleGetMe(request, response) {
    const session = requireAuth(request, response);
    if (!session) return;
    sendJson(response, 200, buildSessionView(session), request);
}

async function handleAuthorizeFeature(request, response) {
    const body = await readJsonBody(request);
    const feature = String(body.feature || '').trim();
    if (!feature) {
        sendJson(response, 400, { error: 'FEATURE_REQUIRED', message: '缺少功能代號。' }, request);
        return;
    }
    const session = requireFeature(request, response, feature);
    if (!session) return;
    sendJson(response, 200, { allowed: true, feature }, request);
}

function billingSubscriberAccount(emailHint, fallbackId) {
    const raw = String(emailHint || '').trim().toLowerCase();
    const cleaned = raw.replace(/[^a-z0-9@._-]+/g, '_').slice(0, 80);
    if (cleaned) return normalizeAccount(cleaned);
    return normalizeAccount(`subscriber_${fallbackId}`);
}

async function handleBillingCatalog(request, response) {
    sendJson(response, 200, buildPublicCatalog(config), request);
}

async function handleStripeRedeem(request, response) {
    if (!config.stripeSecretKey) {
        sendJson(response, 503, { error: 'STRIPE_DISABLED', message: '尚未設定 STRIPE_SECRET_KEY。' }, request);
        return;
    }
    const body = await readJsonBody(request);
    const sessionId = String(body.sessionId || '').trim();
    if (!sessionId.startsWith('cs_')) {
        sendJson(response, 400, { error: 'INVALID_SESSION', message: '請提供有效的 Stripe Checkout Session ID（cs_ 開頭）。' }, request);
        return;
    }
    const priceMap = buildPriceLevelMap(config);
    if (!Object.keys(priceMap).length) {
        sendJson(response, 503, { error: 'STRIPE_PRICES_UNSET', message: '請在環境變數設定 STRIPE_PRICE_BASIC 等 Price ID。' }, request);
        return;
    }
    let stripeSession;
    try {
        stripeSession = await stripeRetrieveCheckoutSession(config.stripeSecretKey, sessionId);
    } catch (error) {
        console.warn('Stripe session retrieve failed', error && error.message);
        sendJson(response, 400, { error: 'STRIPE_SESSION_FAILED', message: error.message || '無法向 Stripe 查詢付款狀態。' }, request);
        return;
    }
    if (String(stripeSession.payment_status || '') !== 'paid') {
        sendJson(response, 400, { error: 'NOT_PAID', message: '此筆尚未完成付款。' }, request);
        return;
    }
    const priceId = extractStripePriceIdFromSession(stripeSession);
    const userLevel = priceMap[priceId];
    if (!userLevel) {
        sendJson(response, 400, {
            error: 'UNKNOWN_PRICE',
            message: '此付款使用的價格 ID 未對應到會員等級，請檢查 Stripe Price 與環境變數。',
            priceId
        }, request);
        return;
    }
    const email =
        (stripeSession.customer_details && stripeSession.customer_details.email) ||
        stripeSession.customer_email ||
        '';
    const account = billingSubscriberAccount(email, sessionId.replace(/[^a-z0-9]/gi, '').slice(-12) || 'stripe');
    let subscriptionObj = stripeSession.subscription && typeof stripeSession.subscription === 'object'
        ? stripeSession.subscription
        : null;
    if (!subscriptionObj && typeof stripeSession.subscription === 'string' && stripeSession.subscription.startsWith('sub_')) {
        try {
            subscriptionObj = await stripeRetrieveSubscription(config.stripeSecretKey, stripeSession.subscription);
        } catch (err) {
            console.warn('Stripe subscription fetch failed', err && err.message);
        }
    }
    const ttlResult = computeStripeBillingTtlSeconds(stripeSession, subscriptionObj, config);
    if (ttlResult.error) {
        sendJson(response, 400, { error: ttlResult.error, message: ttlResult.message || '無法核發通行證。' }, request);
        return;
    }
    const ttlSeconds = ttlResult.ttlSeconds;
    const sessionPayload = {
        account,
        canManageMembers: false,
        featureOverrides: {},
        sessionType: 'member',
        userLevel: normalizeLevel(userLevel),
        billing: {
            source: 'stripe',
            mode: String(stripeSession.mode || ''),
            ttlSeconds,
            hasSubscriptionExpiry: String(stripeSession.mode || '') === 'subscription'
        }
    };
    const token = createSessionToken(sessionPayload, config.authSecret, ttlSeconds);
    const verified = verifySessionToken(token, config.authSecret);
    const session = sessionFromVerifiedPayload(verified);
    sendJson(response, 200, {
        token,
        ...buildSessionView(session)
    }, request);
}

async function handleStripeWebhook(request, response) {
    if (!config.stripeWebhookSecret) {
        sendText(response, 503, 'Webhook 未啟用', request);
        return;
    }
    const sig = String(request.headers['stripe-signature'] || '');
    let raw;
    try {
        raw = await readRawBodyBuffer(request, 512 * 1024);
    } catch (_error) {
        sendText(response, 400, 'Bad body', request);
        return;
    }
    if (!verifyStripeWebhookSignature(raw, sig, config.stripeWebhookSecret)) {
        sendText(response, 400, 'Invalid signature', request);
        return;
    }
    let event;
    try {
        event = JSON.parse(raw.toString('utf8'));
    } catch (_error) {
        sendText(response, 400, 'Invalid JSON', request);
        return;
    }
    if (event && event.type === 'checkout.session.completed') {
        const sid = event.data && event.data.object && event.data.object.id;
        console.log('[billing] checkout.session.completed', sid || '(no id)');
    }
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('ok');
}

async function handleAppleRedeem(request, response) {
    if (!config.appleSharedSecret) {
        sendJson(response, 503, { error: 'APPLE_IAP_DISABLED', message: '尚未設定 APPLE_APP_STORE_SHARED_SECRET。' }, request);
        return;
    }
    const body = await readJsonBody(request);
    const receiptBase64 = String(body.receiptBase64 || body.receiptData || '').trim();
    if (!receiptBase64) {
        sendJson(response, 400, { error: 'RECEIPT_REQUIRED', message: '請提供 receipt-base64（App 收據）。' }, request);
        return;
    }
    const productMap = buildAppleProductLevelMap(config);
    if (!Object.keys(productMap).length) {
        sendJson(response, 503, { error: 'APPLE_PRODUCTS_UNSET', message: '請設定 APPLE_IAP_PRODUCT_BASIC 等產品 ID。' }, request);
        return;
    }
    let { json } = await postAppleVerifyReceipt(receiptBase64, config.appleSharedSecret, true);
    if (Number(json.status) === 21007) {
        ({ json } = await postAppleVerifyReceipt(receiptBase64, config.appleSharedSecret, false));
    }
    if (Number(json.status) !== 0) {
        sendJson(response, 400, { error: 'APPLE_VERIFY_FAILED', status: json.status, message: 'Apple 收據驗證未通過。' }, request);
        return;
    }
    const resolved = resolveAppleEntitlement(json, productMap, config);
    if (resolved.error) {
        sendJson(response, 400, {
            error: resolved.error,
            message: resolved.message || '無法核發通行證。'
        }, request);
        return;
    }
    const userLevel = resolved.userLevel;
    const productId = resolved.productId || 'apple';
    const account = billingSubscriberAccount('', String(productId).replace(/[^a-z0-9]/gi, '').slice(-14) || 'apple');
    const ttlSeconds = resolved.ttlSeconds;
    const sessionPayload = {
        account,
        canManageMembers: false,
        featureOverrides: {},
        sessionType: 'member',
        userLevel: normalizeLevel(userLevel),
        billing: {
            source: 'apple',
            ttlSeconds,
            hasSubscriptionExpiry: resolved.hasSubscriptionExpiry === true
        }
    };
    const token = createSessionToken(sessionPayload, config.authSecret, ttlSeconds);
    const verified = verifySessionToken(token, config.authSecret);
    const session = sessionFromVerifiedPayload(verified);
    sendJson(response, 200, {
        token,
        ...buildSessionView(session)
    }, request);
}

async function handleWorkspaceBootstrap(request, response) {
    const session = requireFeature(request, response, 'dataSync');
    if (!session) return;
    const result = await withDb(config, async (db) => {
        const workspace = sanitizeWorkspace(await getWorkspace(db, session.account));
        return {
            members: session.canManageMembers ? await listMembers(db) : [],
            workspace
        };
    });
    sendJson(response, 200, result, request);
}

async function handleWorkspaceResourceUpdate(request, response, resourceName) {
    const session = requireFeature(request, response, 'dataSync');
    if (!session) return;
    const body = await readJsonBody(request);
    const result = await withDb(config, async (db) => setWorkspaceResource(db, session.account, resourceName, body.value));
    sendJson(response, 200, { ok: true, resource: resourceName, workspace: result }, request);
}

async function handleListMembers(request, response) {
    const session = requireAuth(request, response);
    if (!session) return;
    if (!session.canManageMembers) {
        sendJson(response, 403, { error: 'ADMIN_REQUIRED', message: '此功能僅限管理者。' }, request);
        return;
    }
    const result = await withDb(config, async (db) => listMembers(db));
    sendJson(response, 200, { members: result }, request);
}

async function handleSaveMember(request, response) {
    const session = requireAuth(request, response);
    if (!session) return;
    if (!session.canManageMembers) {
        sendJson(response, 403, { error: 'ADMIN_REQUIRED', message: '此功能僅限管理者。' }, request);
        return;
    }
    const body = await readJsonBody(request);
    try {
        const result = await withDb(config, async (db) => saveMember(db, {
            account: body.account,
            canManageMembers: !!body.canManageMembers,
            featureOverrides: body.featureOverrides,
            level: body.level || 'pro',
            password: body.password
        }));
        sendJson(response, 200, { member: result }, request);
    } catch (error) {
        sendJson(response, 400, { error: 'MEMBER_SAVE_FAILED', message: error.message || '會員寫入失敗。' }, request);
    }
}

async function handleDeleteMember(request, response, account) {
    const session = requireAuth(request, response);
    if (!session) return;
    if (!session.canManageMembers) {
        sendJson(response, 403, { error: 'ADMIN_REQUIRED', message: '此功能僅限管理者。' }, request);
        return;
    }
    try {
        const deleted = await withDb(config, async (db) => deleteMember(db, account, session.account));
        sendJson(response, 200, { deleted }, request);
    } catch (error) {
        sendJson(response, 400, { error: 'MEMBER_DELETE_FAILED', message: error.message || '會員刪除失敗。' }, request);
    }
}

/** POST /api/account/self-delete — 會員憑帳號+密碼刪除自己（登入頁／審核用）。 */
async function handleSelfDeleteAccount(request, response) {
    const body = await readJsonBody(request);
    const account = normalizeAccount(body.account);
    const password = String(body.password || '').trim();
    if (!account) {
        sendJson(response, 400, { error: 'ACCOUNT_REQUIRED', message: '請提供會員帳號。' }, request);
        return;
    }
    if (!password) {
        sendJson(response, 400, { error: 'PASSWORD_REQUIRED', message: '請提供會員密碼以確認刪除。' }, request);
        return;
    }
    try {
        const deleted = await withDb(config, async (db) => deleteOwnAccount(db, account, password));
        sendJson(response, 200, { ok: true, deleted }, request);
    } catch (error) {
        console.warn('Self-delete account failed', error && error.message);
        sendJson(response, 400, { error: 'SELF_DELETE_FAILED', message: error.message || '刪除失敗。' }, request);
    }
}

/**
 * POST /api/ai/coach — AI 解說員（僅後端代理，瀏覽器不直連 OpenAI）。
 * 前端通常送 { prompt, context?, model? }；此處組成 Chat Completions 請求體（model、messages、temperature），
 * 再以 Bearer OPENAI_API_KEY POST 至 OPENAI_ENDPOINT（預設 https://api.openai.com/v1/chat/completions）。
 * 上游須回傳 OpenAI 相容的 JSON（choices[0].message.content）。另需 OPENAI_ENABLED=true 才會轉發。
 */
async function handleAiCoach(request, response) {
    const session = requireFeature(request, response, 'aiCoach');
    if (!session) return;
    if (!config.openAiEnabled) {
        sendJson(response, 503, { error: 'OPENAI_DISABLED', message: '此系統已停用 OpenAI API。' }, request);
        return;
    }
    if (!config.openAiApiKey) {
        sendJson(response, 503, { error: 'OPENAI_NOT_CONFIGURED', message: '後端尚未設定 OpenAI 金鑰。' }, request);
        return;
    }
    const body = await readJsonBody(request);
    const prompt = String(body.prompt || '').trim();
    const context = String(body.context || '').trim();
    const requestedModel = String(body.model || '').trim();
    if (!prompt) {
        sendJson(response, 400, { error: 'PROMPT_REQUIRED', message: '缺少 AI 提問內容。' }, request);
        return;
    }

    const upstreamPayload = {
        model: requestedModel || config.openAiModel,
        temperature: 0.2,
        messages: Array.isArray(body.messages) && body.messages.length
            ? body.messages
            : [
                {
                    role: 'system',
                    content: '你是 Construction Master 工程估算助手，請用繁體中文、短句、可操作步驟回答。'
                },
                {
                    role: 'user',
                    content: context ? `${prompt}\n\n${context}` : prompt
                }
            ]
    };

    const upstreamResponse = await fetch(config.openAiEndpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.openAiApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(upstreamPayload)
    });
    const upstreamText = await upstreamResponse.text();
    let upstreamJson = {};
    try {
        upstreamJson = upstreamText ? JSON.parse(upstreamText) : {};
    } catch (_error) {
        upstreamJson = { raw: upstreamText };
    }
    if (!upstreamResponse.ok) {
        sendJson(response, upstreamResponse.status, {
            error: 'OPENAI_UPSTREAM_FAILED',
            message: 'AI 代理服務失敗。',
            upstream: upstreamJson
        }, request);
        return;
    }
    const answer = upstreamJson && upstreamJson.choices && upstreamJson.choices[0] && upstreamJson.choices[0].message
        ? String(upstreamJson.choices[0].message.content || '').trim()
        : '';
    sendJson(response, 200, {
        answer,
        model: upstreamPayload.model
    }, request);
}

async function handleIbmQuantum(request, response) {
    const session = requireFeature(request, response, 'quantumStake');
    if (!session) return;
    if (!config.ibmQuantumApiKey) {
        sendJson(response, 503, { error: 'IBM_NOT_CONFIGURED', message: '後端尚未設定 IBM Quantum 金鑰。' }, request);
        return;
    }
    const body = await readJsonBody(request);
    const payload = body.payload && typeof body.payload === 'object'
        ? body.payload
        : {
            program: body.program,
            backend: body.backend || 'ibmq_qasm_simulator'
        };

    const upstreamResponse = await fetch(config.ibmQuantumEndpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.ibmQuantumApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    const upstreamText = await upstreamResponse.text();
    let upstreamJson = {};
    try {
        upstreamJson = upstreamText ? JSON.parse(upstreamText) : {};
    } catch (_error) {
        upstreamJson = { raw: upstreamText };
    }
    if (!upstreamResponse.ok) {
        sendJson(response, upstreamResponse.status, {
            error: 'IBM_UPSTREAM_FAILED',
            message: 'IBM Quantum 代理服務失敗。',
            upstream: upstreamJson
        }, request);
        return;
    }
    sendJson(response, 200, {
        ok: true,
        upstream: upstreamJson
    }, request);
}

async function handleCalcCore(request, response) {
    const session = requireFeature(request, response, 'calcCore');
    if (!session) return;
    const body = await readJsonBody(request);
    const result = calculateCore(body);
    sendJson(response, 200, result, request);
}

async function handleCalcAdvancedEstimate(request, response) {
    const session = requireFeature(request, response, 'advancedEstimateExport');
    if (!session) return;
    const body = await readJsonBody(request);
    const result = calculateAdvancedEstimate({
        ...body,
        isPro: session.userLevel === 'pro'
    });
    sendJson(response, 200, result, request);
}

async function handleMeasureQa(request, response) {
    const session = requireFeature(request, response, 'measureQaReport');
    if (!session) return;
    const body = await readJsonBody(request);
    const result = scoreMeasurementQa(body);
    sendJson(response, 200, result, request);
}

async function handleBimLayoutQa(request, response) {
    const session = requireFeature(request, response, 'bimLayoutQa');
    if (!session) return;
    const body = await readJsonBody(request);
    const result = scoreBimLayout(body);
    sendJson(response, 200, result, request);
}

async function handleAutoInterpretQa(request, response) {
    const session = requireFeature(request, response, 'blueprintAutoInterpret');
    if (!session) return;
    const body = await readJsonBody(request);
    const result = scoreAutoInterpret(body);
    sendJson(response, 200, result, request);
}

function upsertByKey(list, keyName, item, limit = 160) {
    const source = Array.isArray(list) ? list.slice() : [];
    const key = String(item && item[keyName] || '');
    const index = source.findIndex((entry) => String(entry && entry[keyName] || '') === key);
    if (index >= 0) source[index] = { ...source[index], ...item };
    else source.unshift(item);
    return source.slice(0, limit);
}

function buildLearningStrategyLabel(attemptNo, sourceProfile) {
    if (attemptNo === 1) return `原始 ${sourceProfile} 圖初判`;
    if (attemptNo === 2) return `${sourceProfile} 強化提示重判`;
    return `${sourceProfile} 記憶交叉驗證重判`;
}

function mergeAutoInterpretMemory(store, sample) {
    if (!sample || !sample.vector) return Array.isArray(store) ? store.slice(0, 120) : [];
    const nextStore = Array.isArray(store) ? store.slice() : [];
    const index = nextStore.findIndex((entry) => {
        if (!entry) return false;
        const sameType = String(entry.type || '') === String(sample.type || '');
        const qtyGap = Math.abs((Number(entry.quantity) || 0) - (Number(sample.quantity) || 0));
        const longGap = Math.abs((Number(entry.longM) || 0) - (Number(sample.longM) || 0));
        const shortGap = Math.abs((Number(entry.shortM) || 0) - (Number(sample.shortM) || 0));
        return sameType && qtyGap <= 1 && longGap <= 0.05 && shortGap <= 0.05;
    });
    if (index >= 0) nextStore[index] = { ...nextStore[index], ...sample };
    else nextStore.unshift(sample);
    return nextStore.slice(0, 120);
}

async function handleBlueprintLearningUpload(request, response) {
    const session = requireFeature(request, response, 'blueprintAutoInterpret');
    if (!session) return;
    const body = await readJsonBody(request, 12 * 1024 * 1024);
    const fileName = String(body.fileName || '').trim();
    const dataUrl = String(body.dataUrl || '').trim();
    if (!fileName || !dataUrl) {
        throw createHttpError(400, '缺少圖紙檔名或圖紙資料。', 'UPLOAD_PAYLOAD_REQUIRED');
    }
    const asset = await persistBlueprintAsset(serverRoot, session.account, body);
    await withDb(config, async (db) => updateWorkspace(db, session.account, (workspace) => {
        workspace.blueprintLearningAssets = upsertByKey(workspace.blueprintLearningAssets, 'assetId', asset, 160);
        return workspace;
    }));
    sendJson(response, 200, { ok: true, asset }, request);
}

async function updateLearningJobSnapshot(account, jobId, mutate) {
    return withDb(config, async (db) => updateWorkspace(db, account, (workspace) => {
        const jobs = Array.isArray(workspace.autoInterpretLearningJobs) ? workspace.autoInterpretLearningJobs.slice() : [];
        const jobIndex = jobs.findIndex((item) => String(item && item.jobId || '') === String(jobId || ''));
        if (jobIndex < 0) throw createHttpError(404, '找不到學習任務', 'LEARNING_JOB_NOT_FOUND');
        const assets = Array.isArray(workspace.blueprintLearningAssets) ? workspace.blueprintLearningAssets.slice() : [];
        const job = { ...jobs[jobIndex] };
        const asset = assets.find((item) => String(item && item.assetId || '') === String(job.assetId || '')) || null;
        const next = mutate({ workspace, job, asset });
        const nextJob = next && next.job ? next.job : job;
        jobs[jobIndex] = { ...nextJob, updatedAt: new Date().toISOString() };
        workspace.autoInterpretLearningJobs = jobs.slice(0, 160);
        if (next && next.asset) {
            workspace.blueprintLearningAssets = upsertByKey(assets, 'assetId', next.asset, 160);
        }
        if (next && next.review) {
            workspace.autoInterpretLearningReviews = upsertByKey(workspace.autoInterpretLearningReviews, 'reviewId', next.review, 160);
        }
        if (next && next.memorySample) {
            workspace.autoInterpretMemory = mergeAutoInterpretMemory(workspace.autoInterpretMemory, next.memorySample);
        }
        return workspace;
    }));
}

async function runAutoInterpretLearningJob(account, jobId) {
    const key = `${account}:${jobId}`;
    if (activeLearningJobs.has(key)) return activeLearningJobs.get(key);
    const task = (async () => {
        try {
            let snapshot = await updateLearningJobSnapshot(account, jobId, ({ job }) => ({
                job: {
                    ...job,
                    status: 'running',
                    startedAt: job.startedAt || new Date().toISOString(),
                    lastError: ''
                }
            }));
            let jobs = snapshot.autoInterpretLearningJobs || [];
            let currentJob = jobs.find((item) => String(item && item.jobId || '') === String(jobId)) || null;
            const asset = (snapshot.blueprintLearningAssets || []).find((item) => String(item && item.assetId || '') === String(currentJob && currentJob.assetId || ''));
            if (!currentJob || !asset) throw new Error('找不到學習任務或圖紙資產');
            const dataUrl = await readAssetAsDataUrl(serverRoot, asset);
            for (let attemptNo = (currentJob.attempts || []).length + 1; attemptNo <= currentJob.maxAttempts; attemptNo += 1) {
                const previousBest = Number(currentJob.bestScore) || 0;
                const recognition = await callVisionRecognition(config, dataUrl, asset, attemptNo, currentJob.maxAttempts, previousBest);
                const report = {
                    ...recognition.report,
                    precisionMode: 'backend-learning',
                    sourceProfile: asset.sourceProfile,
                    sourceType: asset.sourceType,
                    reviewGateState: recognition.report.needsReview ? 'review' : 'ready'
                };
                const qa = scoreAutoInterpret({ report });
                const attempt = {
                    attemptNo,
                    strategyLabel: buildLearningStrategyLabel(attemptNo, asset.sourceProfile),
                    createdAt: new Date().toISOString(),
                    qaScore: clampQaScore(qa.qaScore),
                    qaLevel: qa.qaLevel,
                    report: {
                        ...report,
                        serverQaScore: clampQaScore(qa.qaScore),
                        serverQaLevel: qa.qaLevel
                    },
                    upstreamModel: recognition.upstreamModel,
                    rawContent: recognition.rawContent
                };
                snapshot = await updateLearningJobSnapshot(account, jobId, ({ job: latestJob }) => {
                    const attempts = Array.isArray(latestJob.attempts) ? latestJob.attempts.slice() : [];
                    attempts.push(attempt);
                    const isBest = clampQaScore(attempt.qaScore) >= clampQaScore(latestJob.bestScore);
                    const nextJob = {
                        ...latestJob,
                        attempts,
                        bestScore: isBest ? clampQaScore(attempt.qaScore) : clampQaScore(latestJob.bestScore),
                        bestLevel: isBest ? attempt.qaLevel : String(latestJob.bestLevel || 'E'),
                        bestAttemptNo: isBest ? attempt.attemptNo : Number(latestJob.bestAttemptNo) || 0,
                        bestReport: isBest ? attempt.report : latestJob.bestReport,
                        lastError: '',
                        status: 'running'
                    };
                    if (clampQaScore(attempt.qaScore) >= clampQaScore(latestJob.thresholdScore)) {
                        nextJob.status = 'completed';
                        nextJob.completedAt = new Date().toISOString();
                        nextJob.approvedToCoreMemoryAt = new Date().toISOString();
                        return {
                            job: nextJob,
                            memorySample: buildAutoInterpretMemorySample(nextJob, asset)
                        };
                    }
                    if (attempt.attemptNo >= latestJob.maxAttempts) {
                        nextJob.status = 'review_required';
                        nextJob.completedAt = new Date().toISOString();
                        nextJob.reviewRequiredAt = new Date().toISOString();
                        return {
                            job: nextJob,
                            review: createLearningReview(nextJob, 'pending', '已達重跑上限，待人工審核（審核通過後才會寫入核心記憶；可選發布至全站共用池）')
                        };
                    }
                    return { job: nextJob };
                });
                jobs = snapshot.autoInterpretLearningJobs || [];
                currentJob = jobs.find((item) => String(item && item.jobId || '') === String(jobId)) || currentJob;
                if (currentJob && currentJob.status === 'completed' && currentJob.publishToSharedOnSuccess && config.sharedLearningEnabled) {
                    const shareAsset = (snapshot.blueprintLearningAssets || []).find((item) => String(item && item.assetId || '') === String(currentJob.assetId || '')) || asset;
                    const shareSample = buildAutoInterpretMemorySample(currentJob, shareAsset);
                    if (shareSample && shareSample.vector) {
                        try {
                            await withDb(config, async (db) => {
                                await appendSharedAutoInterpretSample(db.client, {
                                    sample: shareSample,
                                    contributorAccount: account,
                                    sourceJobId: String(jobId || '')
                                });
                            });
                        } catch (shareErr) {
                            console.warn('[learning] shared pool append (auto) failed', shareErr && shareErr.message);
                        }
                    }
                }
                if (currentJob.status !== 'running') break;
            }
        } catch (error) {
            await updateLearningJobSnapshot(account, jobId, ({ job }) => ({
                job: {
                    ...job,
                    status: 'failed',
                    completedAt: new Date().toISOString(),
                    lastError: error && error.message ? error.message : 'BACKEND_LEARNING_FAILED'
                }
            })).catch(() => {});
        } finally {
            activeLearningJobs.delete(key);
        }
    })();
    activeLearningJobs.set(key, task);
    return task;
}

async function handleGetSharedAutoInterpretMemory(request, response) {
    const session = requireFeature(request, response, 'blueprintAutoInterpret');
    if (!session) return;
    if (!config.sharedLearningEnabled) {
        sendJson(response, 200, { samples: [], sharedLearningEnabled: false }, request);
        return;
    }
    const rows = await withDb(config, async (db) => listSharedAutoInterpretSampleRows(db.client, 500));
    const chronological = rows.slice().reverse();
    let merged = [];
    chronological.forEach((row) => {
        const sample = row && row.sample && typeof row.sample === 'object' ? row.sample : null;
        if (sample) merged = mergeAutoInterpretMemory(merged, sample);
    });
    sendJson(response, 200, {
        samples: merged,
        sharedLearningEnabled: true,
        sourceRows: rows.length
    }, request);
}

async function handleCreateAutoInterpretLearningJob(request, response) {
    const session = requireFeature(request, response, 'blueprintAutoInterpret');
    if (!session) return;
    const body = await readJsonBody(request);
    const assetId = String(body.assetId || '').trim();
    if (!assetId) {
        throw createHttpError(400, '缺少圖紙資產編號。', 'ASSET_ID_REQUIRED');
    }
    let createdJob = null;
    const workspace = await withDb(config, async (db) => updateWorkspace(db, session.account, (current) => {
        const asset = (current.blueprintLearningAssets || []).find((item) => String(item && item.assetId || '') === assetId);
        if (!asset) throw createHttpError(404, '找不到對應圖紙資產', 'LEARNING_ASSET_NOT_FOUND');
        createdJob = createLearningJob(asset, {
            thresholdScore: body.thresholdScore,
            maxAttempts: body.maxAttempts,
            publishToSharedOnSuccess: !!body.publishToSharedOnSuccess && config.sharedLearningEnabled
        });
        current.autoInterpretLearningJobs = upsertByKey(current.autoInterpretLearningJobs, 'jobId', createdJob, 160);
        return current;
    }));
    runAutoInterpretLearningJob(session.account, createdJob.jobId).catch(() => {});
    sendJson(response, 200, {
        ok: true,
        job: (workspace.autoInterpretLearningJobs || []).find((item) => String(item && item.jobId || '') === createdJob.jobId) || createdJob
    }, request);
}

async function handleGetAutoInterpretLearningJob(request, response, jobId) {
    const session = requireFeature(request, response, 'blueprintAutoInterpret');
    if (!session) return;
    const result = await withDb(config, async (db) => {
        const workspace = sanitizeWorkspace(await getWorkspace(db, session.account));
        const job = (workspace.autoInterpretLearningJobs || []).find((item) => String(item && item.jobId || '') === String(jobId || ''));
        if (!job) throw createHttpError(404, '找不到學習任務', 'LEARNING_JOB_NOT_FOUND');
        const asset = (workspace.blueprintLearningAssets || []).find((item) => String(item && item.assetId || '') === String(job.assetId || '')) || null;
        const reviews = (workspace.autoInterpretLearningReviews || []).filter((item) => String(item && item.jobId || '') === String(jobId || ''));
        return { job, asset, reviews };
    });
    sendJson(response, 200, result, request);
}

async function handleReviewAutoInterpretLearningJob(request, response, jobId) {
    const session = requireFeature(request, response, 'blueprintAutoInterpret');
    if (!session) return;
    const body = await readJsonBody(request);
    const decision = String(body.decision || '').trim().toLowerCase();
    if (!['approved', 'rejected'].includes(decision)) {
        throw createHttpError(400, '審核決策僅支援 approved 或 rejected。', 'INVALID_REVIEW_DECISION');
    }
    const publishToSharedPool = !!body.publishToSharedPool && config.sharedLearningEnabled;
    let sharedSampleToPublish = null;
    const workspace = await updateLearningJobSnapshot(session.account, jobId, ({ job, asset }) => {
        const overrideReport = {
            ...(job.bestReport || {}),
            type: String(body.type || (job.bestReport && job.bestReport.type) || 'UNKNOWN'),
            quantity: Math.max(1, Math.round(Number(body.quantity || (job.bestReport && job.bestReport.quantity) || 1))),
            longM: Math.max(0, Number(body.longM || (job.bestReport && job.bestReport.longM) || 0)),
            shortM: Math.max(0, Number(body.shortM || (job.bestReport && job.bestReport.shortM) || 0)),
            needsReview: decision !== 'approved'
        };
        const nextJob = {
            ...job,
            bestReport: overrideReport,
            reviewDecision: decision,
            reviewDecisionAt: new Date().toISOString(),
            reviewNote: String(body.note || '').trim(),
            status: decision === 'approved' ? 'approved_manual' : 'rejected',
            completedAt: job.completedAt || new Date().toISOString()
        };
        const nextReview = createLearningReview(nextJob, decision, String(body.note || '').trim());
        const mem = decision === 'approved' ? buildAutoInterpretMemorySample(nextJob, asset) : null;
        if (mem && mem.vector && publishToSharedPool) {
            sharedSampleToPublish = mem;
        }
        return {
            job: nextJob,
            review: nextReview,
            memorySample: mem
        };
    });
    if (sharedSampleToPublish) {
        try {
            await withDb(config, async (db) => {
                await appendSharedAutoInterpretSample(db.client, {
                    sample: sharedSampleToPublish,
                    contributorAccount: session.account,
                    sourceJobId: String(jobId || '')
                });
            });
        } catch (shareErr) {
            console.warn('[learning] shared pool append (review) failed', shareErr && shareErr.message);
        }
    }
    const job = (workspace.autoInterpretLearningJobs || []).find((item) => String(item && item.jobId || '') === String(jobId || '')) || null;
    sendJson(response, 200, { ok: true, job, publishedToSharedPool: !!sharedSampleToPublish }, request);
}

function isAllowedStaticPath(pathname) {
    return pathname === '/' ||
        pathname === '/index.html' ||
        pathname === '/stake.html' ||
        pathname === '/app.css' ||
        pathname === '/site.webmanifest' ||
        pathname === '/service-worker.js' ||
        pathname === '/favicon.ico' ||
        pathname === '/favicon-32.png' ||
        pathname === '/apple-touch-icon.png' ||
        pathname === '/icon-192.png' ||
        pathname === '/icon-512.png' ||
        pathname === '/logo.png' ||
        pathname === '/logo-app.png' ||
        pathname === '/app-wallpaper.jpg' ||
        /^\/test-blueprint-(?:[1-9]|1[0-5])\.png$/.test(pathname) ||
        pathname === '/bm-auto-test.js' ||
        pathname.startsWith('/scripts/') ||
        pathname.startsWith('/styles/') ||
        /^\/prices(?:-[a-z]+)?\.json$/i.test(pathname);
}

async function serveStatic(request, response, pathname) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return false;
    if (!isAllowedStaticPath(pathname)) return false;

    const normalizedPath = pathname === '/' ? '/index.html' : pathname;
    const absolutePath = path.normalize(path.join(projectRoot, normalizedPath));
    if (!absolutePath.startsWith(projectRoot)) {
        sendText(response, 403, 'Forbidden', request);
        return true;
    }

    try {
        const data = await fs.readFile(absolutePath);
        response.writeHead(200, {
            ...buildCorsHeaders(request),
            'Cache-Control': absolutePath.endsWith('service-worker.js') ? 'no-cache' : 'public, max-age=300',
            'Content-Type': MIME_TYPES[path.extname(absolutePath)] || 'application/octet-stream'
        });
        if (request.method === 'HEAD') {
            response.end();
            return true;
        }
        response.end(data);
        return true;
    } catch (_error) {
        sendText(response, 404, 'Not Found', request);
        return true;
    }
}

async function routeRequest(request, response) {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (request.method === 'OPTIONS') {
        response.writeHead(204, buildCorsHeaders(request));
        response.end();
        return;
    }

    if (pathname === '/api/health' && request.method === 'GET') {
        sendJson(response, 200, { ok: true, service: 'buildmaster-api' }, request);
        return;
    }

    if (pathname === '/api/auth/login' && request.method === 'POST') {
        await handleLogin(request, response);
        return;
    }
    if (pathname === '/api/account/self-delete' && request.method === 'POST') {
        await handleSelfDeleteAccount(request, response);
        return;
    }
    if (pathname === '/api/me' && request.method === 'GET') {
        await handleGetMe(request, response);
        return;
    }
    if (pathname === '/api/features/authorize' && request.method === 'POST') {
        await handleAuthorizeFeature(request, response);
        return;
    }
    if (pathname === '/api/billing/catalog' && request.method === 'GET') {
        await handleBillingCatalog(request, response);
        return;
    }
    if (pathname === '/api/billing/stripe/redeem' && request.method === 'POST') {
        await handleStripeRedeem(request, response);
        return;
    }
    if (pathname === '/api/billing/stripe/webhook' && request.method === 'POST') {
        await handleStripeWebhook(request, response);
        return;
    }
    if (pathname === '/api/billing/apple/redeem' && request.method === 'POST') {
        await handleAppleRedeem(request, response);
        return;
    }
    if (pathname === '/api/data/bootstrap' && request.method === 'GET') {
        await handleWorkspaceBootstrap(request, response);
        return;
    }
    if (pathname.startsWith('/api/data/resource/') && request.method === 'PUT') {
        const resourceName = decodeURIComponent(pathname.slice('/api/data/resource/'.length));
        await handleWorkspaceResourceUpdate(request, response, resourceName);
        return;
    }
    if (pathname === '/api/admin/members' && request.method === 'GET') {
        await handleListMembers(request, response);
        return;
    }
    if (pathname === '/api/admin/members' && request.method === 'POST') {
        await handleSaveMember(request, response);
        return;
    }
    if (pathname.startsWith('/api/admin/members/') && request.method === 'DELETE') {
        const account = decodeURIComponent(pathname.slice('/api/admin/members/'.length));
        await handleDeleteMember(request, response, account);
        return;
    }
    if (pathname === '/api/ai/coach' && request.method === 'POST') {
        await handleAiCoach(request, response);
        return;
    }
    if (pathname === '/api/ibm/quantum-job' && request.method === 'POST') {
        await handleIbmQuantum(request, response);
        return;
    }
    if (pathname === '/api/calc/core' && request.method === 'POST') {
        await handleCalcCore(request, response);
        return;
    }
    if (pathname === '/api/calc/advanced-estimate' && request.method === 'POST') {
        await handleCalcAdvancedEstimate(request, response);
        return;
    }
    if (pathname === '/api/qa/measure' && request.method === 'POST') {
        await handleMeasureQa(request, response);
        return;
    }
    if (pathname === '/api/qa/bim-layout' && request.method === 'POST') {
        await handleBimLayoutQa(request, response);
        return;
    }
    if (pathname === '/api/qa/auto-interpret' && request.method === 'POST') {
        await handleAutoInterpretQa(request, response);
        return;
    }
    if (pathname === '/api/learning/shared-memory' && request.method === 'GET') {
        await handleGetSharedAutoInterpretMemory(request, response);
        return;
    }
    if (pathname === '/api/learning/blueprints/upload' && request.method === 'POST') {
        await handleBlueprintLearningUpload(request, response);
        return;
    }
    if (pathname === '/api/learning/auto-interpret/jobs' && request.method === 'POST') {
        await handleCreateAutoInterpretLearningJob(request, response);
        return;
    }
    if (pathname.startsWith('/api/learning/auto-interpret/jobs/') && pathname.endsWith('/review') && request.method === 'POST') {
        const jobId = decodeURIComponent(pathname.slice('/api/learning/auto-interpret/jobs/'.length, -'/review'.length));
        await handleReviewAutoInterpretLearningJob(request, response, jobId);
        return;
    }
    if (pathname.startsWith('/api/learning/auto-interpret/jobs/') && request.method === 'GET') {
        const jobId = decodeURIComponent(pathname.slice('/api/learning/auto-interpret/jobs/'.length));
        await handleGetAutoInterpretLearningJob(request, response, jobId);
        return;
    }

    if (await serveStatic(request, response, pathname)) return;
    sendText(response, 404, 'Not Found', request);
}

const server = http.createServer(async (request, response) => {
    try {
        await routeRequest(request, response);
    } catch (error) {
        console.error('BuildMaster API error', error);
        sendJson(response, Number(error && error.statusCode) || 500, {
            error: error && error.errorCode ? error.errorCode : 'INTERNAL_SERVER_ERROR',
            message: error && error.message ? error.message : '後端發生未預期錯誤。'
        }, request);
    }
});

server.listen(config.port, config.host, () => {
    const origin = `http://${config.host}:${config.port}`;
    console.log(`BuildMaster security API listening on ${origin}`);
    console.log(`Open ${origin}/index.html in your browser.`);
    initializeStore(config)
        .then(() => {
            console.log('[buildmaster] PostgreSQL 已連線，工作區同步可用。');
        })
        .catch((error) => {
            console.error(
                '[buildmaster] PostgreSQL 尚未就緒（伺服器仍運行中）。存取碼登入可用；/api/data/bootstrap 與會員功能需資料庫：',
                error && error.message ? error.message : error
            );
        });
});
