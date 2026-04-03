const crypto = require('node:crypto');
const https = require('node:https');
const { URL } = require('node:url');

function parseEnvTrim(value) {
    return String(value ?? '').trim();
}

function buildPriceLevelMap(config) {
    const map = {};
    const basic = parseEnvTrim(config.stripePriceBasic);
    const standard = parseEnvTrim(config.stripePriceStandard);
    const pro = parseEnvTrim(config.stripePricePro);
    if (basic) map[basic] = 'basic';
    if (standard) map[standard] = 'standard';
    if (pro) map[pro] = 'pro';
    return map;
}

function buildAppleProductLevelMap(config) {
    const map = {};
    const basic = parseEnvTrim(config.appleProductBasic);
    const standard = parseEnvTrim(config.appleProductStandard);
    const pro = parseEnvTrim(config.appleProductPro);
    if (basic) map[basic] = 'basic';
    if (standard) map[standard] = 'standard';
    if (pro) map[pro] = 'pro';
    return map;
}

function buildPublicCatalog(config) {
    const tiers = [
        {
            id: 'basic',
            label: '會員 1（基礎）',
            userLevel: 'basic',
            stripePaymentLinkUrl: parseEnvTrim(config.stripePaymentLinkBasic),
            appleProductId: parseEnvTrim(config.appleProductBasic)
        },
        {
            id: 'standard',
            label: '會員 2（工程）',
            userLevel: 'standard',
            stripePaymentLinkUrl: parseEnvTrim(config.stripePaymentLinkStandard),
            appleProductId: parseEnvTrim(config.appleProductStandard)
        },
        {
            id: 'pro',
            label: '會員 3（專家）',
            userLevel: 'pro',
            stripePaymentLinkUrl: parseEnvTrim(config.stripePaymentLinkPro),
            appleProductId: parseEnvTrim(config.appleProductPro)
        }
    ];
    return {
        stripeEnabled: !!parseEnvTrim(config.stripeSecretKey),
        stripePublishableKey: parseEnvTrim(config.stripePublishableKey),
        appleIapEnabled: !!parseEnvTrim(config.appleSharedSecret),
        tiers
    };
}

function httpsRequestBuffer(urlString, options = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(urlString);
        const req = https.request(
            {
                hostname: u.hostname,
                port: u.port || 443,
                path: `${u.pathname}${u.search}`,
                method: options.method || 'GET',
                headers: options.headers || {}
            },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: Buffer.concat(chunks)
                    });
                });
            }
        );
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function stripeRetrieveCheckoutSession(secretKey, sessionId) {
    const auth = Buffer.from(`${secretKey}:`).toString('base64');
    const url = `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items&expand[]=subscription`;
    const { statusCode, body } = await httpsRequestBuffer(url, {
        method: 'GET',
        headers: {
            Authorization: `Basic ${auth}`
        }
    });
    const text = body.toString('utf8');
    let json = null;
    try {
        json = JSON.parse(text);
    } catch (_e) {
        json = { raw: text };
    }
    if (statusCode !== 200) {
        const err = new Error(json.error && json.error.message ? json.error.message : `Stripe HTTP ${statusCode}`);
        err.statusCode = statusCode;
        err.payload = json;
        throw err;
    }
    return json;
}

async function stripeRetrieveSubscription(secretKey, subscriptionId) {
    const auth = Buffer.from(`${secretKey}:`).toString('base64');
    const id = encodeURIComponent(String(subscriptionId || '').trim());
    const url = `https://api.stripe.com/v1/subscriptions/${id}`;
    const { statusCode, body } = await httpsRequestBuffer(url, {
        method: 'GET',
        headers: {
            Authorization: `Basic ${auth}`
        }
    });
    const text = body.toString('utf8');
    let json = null;
    try {
        json = JSON.parse(text);
    } catch (_e) {
        json = { raw: text };
    }
    if (statusCode !== 200) {
        const err = new Error(json.error && json.error.message ? json.error.message : `Stripe HTTP ${statusCode}`);
        err.statusCode = statusCode;
        err.payload = json;
        throw err;
    }
    return json;
}

function computeStripeBillingTtlSeconds(stripeSession, subscriptionObj, config) {
    const now = Math.floor(Date.now() / 1000);
    const maxTtl = Math.max(3600, Number(config.billingSessionMaxTtlSeconds) || 31622400);
    const fallback = Math.max(60, Number(config.billingSessionTtlSeconds) || 7776000);
    const mode = String((stripeSession && stripeSession.mode) || '');
    const sub = subscriptionObj && typeof subscriptionObj === 'object' ? subscriptionObj : null;
    if (mode === 'subscription' && sub && Number(sub.current_period_end)) {
        const end = Number(sub.current_period_end);
        const ttl = end - now;
        if (ttl < 60) {
            return {
                error: 'STRIPE_SUBSCRIPTION_PERIOD_ENDED',
                message: '目前訂閱計費週期已結束，請續訂或重新付款後再兌換。',
                ttlSeconds: 0
            };
        }
        return { ttlSeconds: Math.min(ttl, maxTtl) };
    }
    if (mode === 'subscription' && !sub) {
        return {
            error: 'STRIPE_SUBSCRIPTION_MISSING',
            message: '無法取得訂閱詳情，請稍後再試或聯絡管理員。',
            ttlSeconds: 0
        };
    }
    return { ttlSeconds: Math.min(fallback, maxTtl) };
}

function extractStripePriceIdFromSession(session) {
    const items = session && session.line_items && session.line_items.data;
    if (!Array.isArray(items) || !items.length) return '';
    const price = items[0] && items[0].price;
    return String((price && price.id) || '').trim();
}

function verifyStripeWebhookSignature(rawBodyBuffer, signatureHeader, secret) {
    if (!secret || !signatureHeader) return false;
    const parts = String(signatureHeader).split(',').map((p) => p.trim());
    let timestamp = '';
    const signatures = [];
    parts.forEach((part) => {
        const [k, v] = part.split('=');
        if (k === 't') timestamp = v;
        if (k === 'v1' && v) signatures.push(v);
    });
    if (!timestamp || !signatures.length) return false;
    const signedPayload = `${timestamp}.${rawBodyBuffer.toString('utf8')}`;
    const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
    return signatures.some((sig) => {
        try {
            const a = Buffer.from(sig, 'hex');
            const b = Buffer.from(expected, 'hex');
            return a.length === b.length && crypto.timingSafeEqual(a, b);
        } catch (_e) {
            return false;
        }
    });
}

async function postAppleVerifyReceipt(receiptBase64, sharedSecret, useProduction = true) {
    const host = useProduction ? 'buy.itunes.apple.com' : 'sandbox.itunes.apple.com';
    const payload = JSON.stringify({
        'receipt-data': receiptBase64,
        password: sharedSecret,
        'exclude-old-transactions': true
    });
    const { statusCode, body } = await httpsRequestBuffer(`https://${host}/verifyReceipt`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        },
        body: payload
    });
    const text = body.toString('utf8');
    let json = {};
    try {
        json = JSON.parse(text);
    } catch (_e) {
        json = { status: -1, raw: text };
    }
    return { statusCode, json, host };
}

function pickLatestAppleProductId(receiptJson) {
    const info = receiptJson && receiptJson.latest_receipt_info;
    if (Array.isArray(info) && info.length) {
        const sorted = [...info].sort(
            (a, b) => Number(b.purchase_date_ms || 0) - Number(a.purchase_date_ms || 0)
        );
        return String(sorted[0].product_id || '').trim();
    }
    const rec = receiptJson && receiptJson.receipt && receiptJson.receipt.in_app;
    if (Array.isArray(rec) && rec.length) {
        const sorted = [...rec].sort(
            (a, b) => Number(b.purchase_date_ms || 0) - Number(a.purchase_date_ms || 0)
        );
        return String(sorted[0].product_id || '').trim();
    }
    return '';
}

function resolveAppleEntitlement(receiptJson, productMap, config) {
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const maxTtl = Math.max(3600, Number(config.billingSessionMaxTtlSeconds) || 31622400);
    const fallbackTtl = Math.max(60, Number(config.billingSessionTtlSeconds) || 7776000);
    const fromLatest = receiptJson && receiptJson.latest_receipt_info;
    let best = null;
    if (Array.isArray(fromLatest)) {
        fromLatest.forEach((entry) => {
            const pid = String(entry.product_id || '').trim();
            const level = productMap[pid];
            if (!level) return;
            const expMs = Number(entry.expires_date_ms);
            if (Number.isFinite(expMs) && expMs > nowMs) {
                if (!best || expMs > best.expiresMs) {
                    best = { productId: pid, level, expiresMs: expMs };
                }
            }
        });
    }
    if (best) {
        const ttl = Math.min(maxTtl, Math.max(60, Math.floor(best.expiresMs / 1000) - nowSec));
        return {
            userLevel: best.level,
            productId: best.productId,
            ttlSeconds: ttl,
            hasSubscriptionExpiry: true
        };
    }
    const inApp = receiptJson && receiptJson.receipt && receiptJson.receipt.in_app;
    if (Array.isArray(inApp)) {
        const known = inApp.filter((e) => productMap[String(e.product_id || '').trim()]);
        const withExpiry = known.filter((e) => {
            const em = Number(e.expires_date_ms);
            return Number.isFinite(em) && em > nowMs;
        });
        if (withExpiry.length) {
            const sorted = [...withExpiry].sort(
                (a, b) => Number(b.expires_date_ms || 0) - Number(a.expires_date_ms || 0)
            );
            const top = sorted[0];
            const pid = String(top.product_id || '').trim();
            const expMs = Number(top.expires_date_ms);
            const ttl = Math.min(maxTtl, Math.max(60, Math.floor(expMs / 1000) - nowSec));
            return {
                userLevel: productMap[pid],
                productId: pid,
                ttlSeconds: ttl,
                hasSubscriptionExpiry: true
            };
        }
        if (known.length) {
            const sorted = [...known].sort(
                (a, b) => Number(b.purchase_date_ms || 0) - Number(a.purchase_date_ms || 0)
            );
            const top = sorted[0];
            const pid = String(top.product_id || '').trim();
            const expMs = Number(top.expires_date_ms);
            if (!Number.isFinite(expMs)) {
                return {
                    userLevel: productMap[pid],
                    productId: pid,
                    ttlSeconds: Math.min(fallbackTtl, maxTtl),
                    hasSubscriptionExpiry: false
                };
            }
        }
    }
    return {
        error: 'APPLE_ENTITLEMENT_EXPIRED',
        message: '訂閱已到期、收據無有效方案，或 product 未對應到會員等級。'
    };
}

module.exports = {
    buildAppleProductLevelMap,
    buildPriceLevelMap,
    buildPublicCatalog,
    computeStripeBillingTtlSeconds,
    extractStripePriceIdFromSession,
    httpsRequestBuffer,
    pickLatestAppleProductId,
    postAppleVerifyReceipt,
    resolveAppleEntitlement,
    stripeRetrieveCheckoutSession,
    stripeRetrieveSubscription,
    verifyStripeWebhookSignature
};
