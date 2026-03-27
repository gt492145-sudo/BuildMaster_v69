const crypto = require('node:crypto');

function randomId(bytes = 16) {
    return crypto.randomBytes(bytes).toString('hex');
}

function hashText(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function derivePasswordHash(secret, salt) {
    return crypto.pbkdf2Sync(String(secret || ''), String(salt || ''), 150000, 32, 'sha256').toString('hex');
}

function hashPassword(secret, salt = randomId(12)) {
    return {
        salt,
        hash: derivePasswordHash(secret, salt)
    };
}

function safeCompareHex(a, b) {
    const left = Buffer.from(String(a || ''), 'hex');
    const right = Buffer.from(String(b || ''), 'hex');
    if (!left.length || !right.length || left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

function verifyPassword(secret, record) {
    if (!record || !record.hash || !record.salt) return false;
    const computed = derivePasswordHash(secret, record.salt);
    return safeCompareHex(computed, record.hash);
}

function base64UrlEncode(input) {
    return Buffer.from(String(input || ''), 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function base64UrlDecode(input) {
    const normalized = String(input || '')
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

function signValue(value, secret) {
    return crypto
        .createHmac('sha256', String(secret || ''))
        .update(String(value || ''))
        .digest('hex');
}

function createSessionToken(payload, secret, ttlSeconds = 60 * 60 * 12) {
    const now = Math.floor(Date.now() / 1000);
    const body = {
        ...payload,
        iat: now,
        exp: now + Math.max(60, Number(ttlSeconds) || 0),
        jti: randomId(10)
    };
    const encodedPayload = base64UrlEncode(JSON.stringify(body));
    const signature = signValue(encodedPayload, secret);
    return `${encodedPayload}.${signature}`;
}

function verifySessionToken(token, secret) {
    const raw = String(token || '').trim();
    if (!raw || !raw.includes('.')) return null;
    const [encodedPayload, signature] = raw.split('.', 2);
    const expected = signValue(encodedPayload, secret);
    if (!safeCompareHex(signature, expected)) return null;
    try {
        const payload = JSON.parse(base64UrlDecode(encodedPayload));
        if (!payload || typeof payload !== 'object') return null;
        const now = Math.floor(Date.now() / 1000);
        if ((Number(payload.exp) || 0) < now) return null;
        return payload;
    } catch (_error) {
        return null;
    }
}

module.exports = {
    createSessionToken,
    hashPassword,
    hashText,
    randomId,
    verifyPassword,
    verifySessionToken
};
