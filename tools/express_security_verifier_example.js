/**
 * BuildMaster security verifier middleware example (Express).
 *
 * Covers:
 * - X-Client-Timestamp window check
 * - X-Client-Nonce replay protection
 * - X-Body-SHA256 raw body integrity check
 * - X-DeviceCheck-Token verification hook
 *
 * Usage:
 * 1) Keep raw body via express.json({ verify: rawBodySaver })
 * 2) Plug createSecurityVerificationMiddleware(...) before protected routes
 * 3) Replace InMemoryNonceStore with Redis in production
 */

const crypto = require("crypto");

function sendError(res, httpStatus, code, message, requestId) {
  return res.status(httpStatus).json({
    ok: false,
    code,
    message,
    request_id: requestId,
  });
}

function getRequestId(req) {
  return (
    req.headers["x-request-id"] ||
    crypto.randomUUID()
  );
}

function parseUnixSeconds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (!Number.isInteger(parsed)) return null;
  return parsed;
}

function normalizeHeaderValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function shouldVerifyBodyHash(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(String(method || "").toUpperCase());
}

function computeBodyHashBase64(rawBodyBuffer) {
  const digest = crypto
    .createHash("sha256")
    .update(rawBodyBuffer)
    .digest();
  return digest.toString("base64");
}

/**
 * Capture raw request bytes for body hash verification.
 * Use with express.json({ verify: rawBodySaver })
 */
function rawBodySaver(req, _res, buf) {
  req.rawBody = Buffer.from(buf || []);
}

class InMemoryNonceStore {
  constructor() {
    this.store = new Map();
  }

  cleanup(nowSeconds) {
    for (const [key, expiresAt] of this.store.entries()) {
      if (expiresAt <= nowSeconds) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Returns true if nonce is new and stored.
   * Returns false if nonce already exists (replay).
   */
  async putIfAbsent(scopeKey, nonce, ttlSeconds) {
    const now = Math.floor(Date.now() / 1000);
    this.cleanup(now);
    const key = `${scopeKey}:${nonce}`;
    if (this.store.has(key)) return false;
    this.store.set(key, now + ttlSeconds);
    return true;
  }
}

/**
 * @param {Object} options
 * @param {Object} options.nonceStore must provide putIfAbsent(scopeKey, nonce, ttlSeconds)
 * @param {number} [options.allowedSkewSeconds=60]
 * @param {number} [options.nonceTtlSeconds=300]
 * @param {boolean} [options.requireDeviceCheck=true]
 * @param {(req) => Promise<{ok:boolean,userId?:string,code?:string,message?:string,httpStatus?:number}>} [options.validateAuth]
 * @param {(token:string, req) => Promise<boolean>} [options.validateDeviceCheckToken]
 * @returns Express middleware
 */
function createSecurityVerificationMiddleware(options) {
  const {
    nonceStore,
    allowedSkewSeconds = 60,
    nonceTtlSeconds = 300,
    requireDeviceCheck = true,
    validateAuth,
    validateDeviceCheckToken,
  } = options || {};

  if (!nonceStore || typeof nonceStore.putIfAbsent !== "function") {
    throw new Error("nonceStore with putIfAbsent(...) is required");
  }

  return async function securityVerificationMiddleware(req, res, next) {
    const requestId = getRequestId(req);

    try {
      // 1) Authorization
      let scopeUserId = "anonymous";
      if (validateAuth) {
        const authResult = await validateAuth(req);
        if (!authResult || authResult.ok !== true) {
          return sendError(
            res,
            authResult?.httpStatus || 401,
            authResult?.code || "UNAUTHORIZED",
            authResult?.message || "Authorization failed",
            requestId
          );
        }
        scopeUserId = String(authResult.userId || "anonymous");
      }

      // 2) Timestamp
      const timestampRaw = normalizeHeaderValue(req.headers["x-client-timestamp"]);
      const ts = parseUnixSeconds(timestampRaw);
      if (ts === null) {
        return sendError(res, 401, "INVALID_TIMESTAMP", "Missing or invalid X-Client-Timestamp", requestId);
      }

      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - ts) > allowedSkewSeconds) {
        return sendError(res, 401, "INVALID_TIMESTAMP", "Timestamp out of allowed window", requestId);
      }

      // 3) Nonce replay guard
      const nonce = normalizeHeaderValue(req.headers["x-client-nonce"]);
      if (!nonce) {
        return sendError(res, 401, "INVALID_NONCE", "Missing X-Client-Nonce", requestId);
      }

      const nonceOk = await nonceStore.putIfAbsent(scopeUserId, nonce, nonceTtlSeconds);
      if (!nonceOk) {
        return sendError(res, 409, "REPLAY_DETECTED", "Nonce already used", requestId);
      }

      // 4) Body hash integrity
      if (shouldVerifyBodyHash(req.method)) {
        const providedHash = normalizeHeaderValue(req.headers["x-body-sha256"]);
        if (!providedHash) {
          return sendError(res, 422, "BODY_HASH_MISMATCH", "Missing X-Body-SHA256", requestId);
        }

        const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from("");
        const expectedHash = computeBodyHashBase64(rawBody);
        if (expectedHash !== providedHash) {
          return sendError(res, 422, "BODY_HASH_MISMATCH", "Body hash mismatch", requestId);
        }
      }

      // 5) DeviceCheck token validation
      if (requireDeviceCheck) {
        const deviceToken = normalizeHeaderValue(req.headers["x-devicecheck-token"]);
        if (!deviceToken) {
          return sendError(res, 401, "DEVICE_NOT_TRUSTED", "Missing X-DeviceCheck-Token", requestId);
        }
        if (typeof validateDeviceCheckToken !== "function") {
          return sendError(
            res,
            500,
            "SECURITY_CONFIG_ERROR",
            "validateDeviceCheckToken is not configured",
            requestId
          );
        }
        const trusted = await validateDeviceCheckToken(deviceToken, req);
        if (!trusted) {
          return sendError(res, 401, "DEVICE_NOT_TRUSTED", "DeviceCheck verification failed", requestId);
        }
      }

      return next();
    } catch (error) {
      return sendError(res, 500, "INTERNAL_ERROR", "Security verification failed", requestId);
    }
  };
}

module.exports = {
  rawBodySaver,
  InMemoryNonceStore,
  createSecurityVerificationMiddleware,
};

/**
 * Example wiring:
 *
 * const express = require("express");
 * const {
 *   rawBodySaver,
 *   InMemoryNonceStore,
 *   createSecurityVerificationMiddleware,
 * } = require("./express_security_verifier_example");
 *
 * const app = express();
 * app.use(express.json({ verify: rawBodySaver }));
 *
 * const nonceStore = new InMemoryNonceStore(); // replace with Redis store in production
 *
 * const securityMiddleware = createSecurityVerificationMiddleware({
 *   nonceStore,
 *   allowedSkewSeconds: 60,
 *   nonceTtlSeconds: 300,
 *   requireDeviceCheck: true,
 *   validateAuth: async (req) => {
 *     // TODO: parse and validate bearer token
 *     // return { ok: true, userId: "user-123" };
 *     return { ok: true, userId: "demo-user" };
 *   },
 *   validateDeviceCheckToken: async (token, req) => {
 *     // TODO: call Apple DeviceCheck server API here
 *     // return true only when verification passes
 *     return token.length > 20;
 *   },
 * });
 *
 * app.post("/api/secure/measurement", securityMiddleware, async (req, res) => {
 *   res.json({ ok: true });
 * });
 */
