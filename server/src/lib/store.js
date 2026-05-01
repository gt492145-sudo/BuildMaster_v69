const { Pool } = require('pg');

const { hashPassword, verifyPassword } = require('./crypto');
const { normalizeLevel, sanitizeFeatureOverrides } = require('./entitlements');
const { normalizeBimSpecPreset, normalizeQaProfile } = require('./qa');

let pool = null;
let schemaReady = false;
let schemaPromise = null;

const MEMBER_SELECT_SQL = `
    SELECT
        account,
        level,
        password_hash,
        password_salt,
        feature_overrides,
        can_manage_members,
        trial_ends_at,
        created_at,
        updated_at
    FROM app_members
`;

const WORKSPACE_SELECT_SQL = `
    SELECT
        account,
        payload,
        updated_at
    FROM app_workspaces
`;

function cloneJson(value, fallback) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_error) {
        return fallback;
    }
}

function normalizeIsoTimestamp(value, fallback = new Date().toISOString()) {
    if (!value) return String(fallback || new Date().toISOString());
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime())
        ? String(fallback || new Date().toISOString())
        : parsed.toISOString();
}

function createEmptyWorkspace() {
    const now = new Date().toISOString();
    return {
        list: [],
        bimRuleMap: {},
        bimAuditLogs: [],
        bimSnapshots: [],
        stakingRunHistory: [],
        stakingReviewMemory: [],
        measurementLogs: [],
        qaProfile: 'enterprise',
        bimSpecPreset: 'public',
        autoInterpretMemory: [],
        guidedPrecisionReviews: [],
        blueprintLearningAssets: [],
        autoInterpretLearningJobs: [],
        autoInterpretLearningReviews: [],
        updatedAt: now
    };
}

function createEmptyDbSnapshot() {
    return {
        meta: {
            version: 2,
            engine: 'postgres',
            createdAt: new Date().toISOString()
        },
        users: [],
        workspaces: {}
    };
}

function normalizeAccount(account) {
    return String(account || '').trim().toLowerCase();
}

function sanitizeWorkspace(workspace) {
    const base = workspace && typeof workspace === 'object' ? workspace : {};
    return {
        list: Array.isArray(base.list) ? cloneJson(base.list, []) : [],
        bimRuleMap: base.bimRuleMap && typeof base.bimRuleMap === 'object' ? cloneJson(base.bimRuleMap, {}) : {},
        bimAuditLogs: Array.isArray(base.bimAuditLogs) ? cloneJson(base.bimAuditLogs.slice(0, 120), []) : [],
        bimSnapshots: Array.isArray(base.bimSnapshots) ? cloneJson(base.bimSnapshots.slice(0, 40), []) : [],
        stakingRunHistory: Array.isArray(base.stakingRunHistory) ? cloneJson(base.stakingRunHistory.slice(0, 120), []) : [],
        stakingReviewMemory: Array.isArray(base.stakingReviewMemory) ? cloneJson(base.stakingReviewMemory.slice(0, 80), []) : [],
        measurementLogs: Array.isArray(base.measurementLogs) ? cloneJson(base.measurementLogs.slice(0, 200), []) : [],
        qaProfile: normalizeQaProfile(base.qaProfile),
        bimSpecPreset: normalizeBimSpecPreset(base.bimSpecPreset),
        autoInterpretMemory: Array.isArray(base.autoInterpretMemory) ? cloneJson(base.autoInterpretMemory.slice(0, 120), []) : [],
        guidedPrecisionReviews: Array.isArray(base.guidedPrecisionReviews) ? cloneJson(base.guidedPrecisionReviews.slice(0, 120), []) : [],
        blueprintLearningAssets: Array.isArray(base.blueprintLearningAssets) ? cloneJson(base.blueprintLearningAssets.slice(0, 160), []) : [],
        autoInterpretLearningJobs: Array.isArray(base.autoInterpretLearningJobs) ? cloneJson(base.autoInterpretLearningJobs.slice(0, 160), []) : [],
        autoInterpretLearningReviews: Array.isArray(base.autoInterpretLearningReviews) ? cloneJson(base.autoInterpretLearningReviews.slice(0, 160), []) : [],
        updatedAt: normalizeIsoTimestamp(base.updatedAt)
    };
}

function normalizeTrialEndsAt(value) {
    if (value == null || value === '') return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

function sanitizeUser(user) {
    const base = user && typeof user === 'object' ? user : {};
    return {
        account: normalizeAccount(base.account),
        level: normalizeLevel(base.level),
        passwordHash: String(base.passwordHash || base.password_hash || ''),
        passwordSalt: String(base.passwordSalt || base.password_salt || ''),
        featureOverrides: sanitizeFeatureOverrides(base.featureOverrides || base.feature_overrides),
        canManageMembers: !!(base.canManageMembers ?? base.can_manage_members),
        trialEndsAt: normalizeTrialEndsAt(base.trialEndsAt ?? base.trial_ends_at),
        createdAt: normalizeIsoTimestamp(base.createdAt || base.created_at),
        updatedAt: normalizeIsoTimestamp(base.updatedAt || base.updated_at)
    };
}

function sanitizeMemberView(user) {
    const sanitized = sanitizeUser(user);
    return {
        account: sanitized.account,
        level: sanitized.level,
        featureOverrides: sanitizeFeatureOverrides(sanitized.featureOverrides),
        canManageMembers: !!sanitized.canManageMembers,
        trialEndsAt: sanitized.trialEndsAt,
        updatedAt: sanitized.updatedAt
    };
}

function buildWorkspacePayload(workspace) {
    const sanitized = sanitizeWorkspace(workspace);
    const { updatedAt, ...payload } = sanitized;
    return {
        sanitized,
        payload
    };
}

function parseEnvBoolean(value, fallback = false) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return !!fallback;
    if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
    if (['0', 'false', 'no', 'off'].includes(raw)) return false;
    return !!fallback;
}

function resolveSslConfig(config) {
    const mode = String(config.dbSslMode || '').trim().toLowerCase();
    if (!mode || ['0', 'disable', 'disabled', 'false', 'no', 'off'].includes(mode)) {
        return false;
    }
    return {
        rejectUnauthorized: parseEnvBoolean(config.dbSslRejectUnauthorized, false)
    };
}

function buildPoolConfig(config) {
    const databaseUrl = String(config.databaseUrl || '').trim();
    const ssl = resolveSslConfig(config);
    const baseConfig = {
        application_name: 'buildmaster-security-api',
        connectionTimeoutMillis: Math.max(1000, Number(config.dbConnectTimeoutMs) || 10000),
        idleTimeoutMillis: Math.max(1000, Number(config.dbIdleTimeoutMs) || 30000),
        max: Math.max(1, Number(config.dbPoolMax) || 10)
    };

    if (databaseUrl) {
        return {
            ...baseConfig,
            connectionString: databaseUrl,
            ssl
        };
    }

    const host = String(config.dbHost || '').trim();
    const database = String(config.dbName || '').trim();
    const user = String(config.dbUser || '').trim();
    const password = String(config.dbPassword || '');

    if (!host || !database || !user || !password) {
        throw new Error(
            '缺少 PostgreSQL 連線設定：請在 server/.env 或 server/.env.local 設定 DATABASE_URL，'
            + '或完整設定 DB_HOST、DB_NAME、DB_USER、DB_PASSWORD。'
        );
    }

    return {
        ...baseConfig,
        host,
        port: Math.max(1, Number(config.dbPort) || 5432),
        database,
        user,
        password,
        ssl
    };
}

function getPool(config) {
    if (pool) return pool;
    pool = new Pool(buildPoolConfig(config));
    pool.on('error', (error) => {
        console.error('BuildMaster PostgreSQL idle client error', error);
    });
    return pool;
}

async function ensureStoreReady(config) {
    if (schemaReady) return;
    if (!schemaPromise) {
        schemaPromise = (async () => {
            const client = await getPool(config).connect();
            try {
                await client.query('BEGIN');
                await client.query(`
                    CREATE TABLE IF NOT EXISTS app_members (
                        account TEXT PRIMARY KEY,
                        level TEXT NOT NULL CHECK (level IN ('basic', 'standard', 'pro')),
                        password_hash TEXT NOT NULL,
                        password_salt TEXT NOT NULL,
                        feature_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
                        can_manage_members BOOLEAN NOT NULL DEFAULT FALSE,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS app_workspaces (
                        account TEXT PRIMARY KEY,
                        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                `);
                await client.query(`
                    CREATE INDEX IF NOT EXISTS app_members_updated_at_idx
                    ON app_members (updated_at DESC)
                `);
                await client.query(`
                    CREATE INDEX IF NOT EXISTS app_workspaces_updated_at_idx
                    ON app_workspaces (updated_at DESC)
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS app_shared_auto_interpret_samples (
                        id BIGSERIAL PRIMARY KEY,
                        sample JSONB NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                `);
                await client.query(`
                    CREATE INDEX IF NOT EXISTS app_shared_samples_created_idx
                    ON app_shared_auto_interpret_samples (created_at DESC)
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS app_shared_auto_interpret_sample_audit (
                        sample_id BIGINT PRIMARY KEY REFERENCES app_shared_auto_interpret_samples(id) ON DELETE CASCADE,
                        contributor_account TEXT NOT NULL DEFAULT '',
                        source_job_id TEXT NOT NULL DEFAULT '',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                `);
                await client.query(`
                    CREATE INDEX IF NOT EXISTS app_shared_samples_audit_created_idx
                    ON app_shared_auto_interpret_sample_audit (created_at DESC)
                `);
                await client.query(`
                    ALTER TABLE app_members
                    ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ
                `);
                await client.query(`
                    ALTER TABLE app_shared_auto_interpret_samples
                    DROP COLUMN IF EXISTS contributor_account
                `);
                await client.query(`
                    ALTER TABLE app_shared_auto_interpret_samples
                    DROP COLUMN IF EXISTS source_job_id
                `);
                await client.query('COMMIT');
                schemaReady = true;
            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                throw error;
            } finally {
                client.release();
            }
        })().catch((error) => {
            schemaPromise = null;
            throw error;
        });
    }
    await schemaPromise;
}

async function queryMemberRow(db, account) {
    const normalized = normalizeAccount(account);
    if (!normalized) return null;
    const result = await db.client.query(`${MEMBER_SELECT_SQL} WHERE account = $1 LIMIT 1`, [normalized]);
    return result.rows[0] || null;
}

function mapMemberRow(row) {
    return row ? sanitizeUser(row) : null;
}

function mapWorkspaceRow(row) {
    if (!row) return null;
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    return sanitizeWorkspace({
        ...payload,
        updatedAt: normalizeIsoTimestamp(row.updated_at, payload.updatedAt)
    });
}

async function upsertMemberRecord(client, user) {
    const sanitized = sanitizeUser(user);
    await client.query(`
        INSERT INTO app_members (
            account,
            level,
            password_hash,
            password_salt,
            feature_overrides,
            can_manage_members,
            trial_ends_at,
            created_at,
            updated_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::timestamptz, $8::timestamptz, $9::timestamptz)
        ON CONFLICT (account)
        DO UPDATE SET
            level = EXCLUDED.level,
            password_hash = EXCLUDED.password_hash,
            password_salt = EXCLUDED.password_salt,
            feature_overrides = EXCLUDED.feature_overrides,
            can_manage_members = EXCLUDED.can_manage_members,
            trial_ends_at = COALESCE(app_members.trial_ends_at, EXCLUDED.trial_ends_at),
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at
    `, [
        sanitized.account,
        sanitized.level,
        sanitized.passwordHash,
        sanitized.passwordSalt,
        JSON.stringify(sanitized.featureOverrides),
        sanitized.canManageMembers,
        sanitized.trialEndsAt,
        sanitized.createdAt,
        sanitized.updatedAt
    ]);
    return sanitized;
}

async function upsertWorkspaceRecord(client, account, workspace) {
    const key = normalizeAccount(account) || 'guest';
    const { sanitized, payload } = buildWorkspacePayload(workspace);
    await client.query(`
        INSERT INTO app_workspaces (
            account,
            payload,
            updated_at
        )
        VALUES ($1, $2::jsonb, $3::timestamptz)
        ON CONFLICT (account)
        DO UPDATE SET
            payload = EXCLUDED.payload,
            updated_at = EXCLUDED.updated_at
    `, [
        key,
        JSON.stringify(payload),
        sanitized.updatedAt
    ]);
    return sanitized;
}

async function ensureWorkspaceExists(client, account) {
    const key = normalizeAccount(account) || 'guest';
    const existing = await client.query('SELECT 1 FROM app_workspaces WHERE account = $1 LIMIT 1', [key]);
    if (existing.rowCount > 0) return;
    await upsertWorkspaceRecord(client, key, createEmptyWorkspace());
}

async function ensureDefaultAdmin(db, config) {
    const adminAccount = normalizeAccount(config.defaultAdminAccount);
    const adminPassword = String(config.defaultAdminPassword || '').trim();
    if (!adminAccount || !adminPassword) return;

    const existing = await findUser(db, adminAccount);
    if (existing) {
        const nextOverrides = {
            ...sanitizeFeatureOverrides(existing.featureOverrides),
            quantumStake: true
        };
        await ensureWorkspaceExists(db.client, adminAccount);
        if (JSON.stringify(nextOverrides) === JSON.stringify(sanitizeFeatureOverrides(existing.featureOverrides))) {
            return;
        }
        await upsertMemberRecord(db.client, {
            ...existing,
            featureOverrides: nextOverrides,
            updatedAt: new Date().toISOString()
        });
        return;
    }

    const passwordRecord = hashPassword(adminPassword);
    const now = new Date().toISOString();
    await upsertMemberRecord(db.client, {
        account: adminAccount,
        level: normalizeLevel(config.defaultAdminLevel || 'pro'),
        passwordHash: passwordRecord.hash,
        passwordSalt: passwordRecord.salt,
        featureOverrides: { quantumStake: true },
        canManageMembers: true,
        trialEndsAt: null,
        createdAt: now,
        updatedAt: now
    });
    await ensureWorkspaceExists(db.client, adminAccount);
}

async function withDb(config, updater) {
    await ensureStoreReady(config);
    const client = await getPool(config).connect();
    const db = { client, config };
    try {
        await client.query('BEGIN');
        await ensureDefaultAdmin(db, config);
        const result = await updater(db);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

async function initializeStore(config) {
    await withDb(config, async () => null);
}

async function closeStore() {
    if (!pool) return;
    const currentPool = pool;
    pool = null;
    schemaReady = false;
    schemaPromise = null;
    await currentPool.end();
}

async function readDb(config) {
    await ensureStoreReady(config);
    const client = await getPool(config).connect();
    try {
        await client.query('BEGIN');
        await client.query('SET TRANSACTION READ ONLY');
        const snapshot = createEmptyDbSnapshot();
        const membersResult = await client.query(`${MEMBER_SELECT_SQL} ORDER BY account ASC`);
        const workspacesResult = await client.query(`${WORKSPACE_SELECT_SQL} ORDER BY account ASC`);
        snapshot.users = membersResult.rows.map(mapMemberRow);
        workspacesResult.rows.forEach((row) => {
            snapshot.workspaces[normalizeAccount(row.account)] = mapWorkspaceRow(row);
        });
        await client.query('COMMIT');
        return snapshot;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

async function getWorkspace(db, account, options = {}) {
    const key = normalizeAccount(account) || 'guest';
    const lockClause = options.forUpdate ? ' FOR UPDATE' : '';
    let result = await db.client.query(`${WORKSPACE_SELECT_SQL} WHERE account = $1 LIMIT 1${lockClause}`, [key]);
    if (result.rows[0]) return mapWorkspaceRow(result.rows[0]);
    const workspace = createEmptyWorkspace();
    await upsertWorkspaceRecord(db.client, key, workspace);
    result = await db.client.query(`${WORKSPACE_SELECT_SQL} WHERE account = $1 LIMIT 1${lockClause}`, [key]);
    return result.rows[0] ? mapWorkspaceRow(result.rows[0]) : workspace;
}

async function listMembers(db) {
    const result = await db.client.query(`
        SELECT
            account,
            level,
            feature_overrides,
            can_manage_members,
            updated_at
        FROM app_members
        ORDER BY account ASC
    `);
    return result.rows.map((row) => sanitizeMemberView(row));
}

async function findUser(db, account) {
    return mapMemberRow(await queryMemberRow(db, account));
}

async function verifyMemberLogin(db, account, password) {
    const user = await findUser(db, account);
    if (!user) return null;
    const ok = verifyPassword(password, {
        hash: user.passwordHash,
        salt: user.passwordSalt
    });
    return ok ? user : null;
}

async function saveMember(db, payload) {
    const account = normalizeAccount(payload && payload.account);
    const password = String(payload && payload.password ? payload.password : '').trim();
    const featureOverrides = sanitizeFeatureOverrides(payload && payload.featureOverrides);
    const hasFeatureOverrides = !!(payload && Object.prototype.hasOwnProperty.call(payload, 'featureOverrides'));
    if (!account) throw new Error('會員帳號不可為空');
    if (!/^[a-z0-9_.-]{3,30}$/.test(account)) throw new Error('會員帳號格式：3-30碼，可用英文/數字/._-');

    const now = new Date().toISOString();
    const level = normalizeLevel(payload && payload.level);
    const canManageMembers = !!(payload && payload.canManageMembers);
    const existing = await findUser(db, account);

    if (existing) {
        let passwordHash = existing.passwordHash;
        let passwordSalt = existing.passwordSalt;
        if (password) {
            if (password.length < 6) throw new Error('會員密碼至少 6 碼');
            const passwordRecord = hashPassword(password);
            passwordHash = passwordRecord.hash;
            passwordSalt = passwordRecord.salt;
        }
        const nextUser = {
            account: existing.account,
            level,
            passwordHash,
            passwordSalt,
            featureOverrides: hasFeatureOverrides ? featureOverrides : existing.featureOverrides,
            canManageMembers: canManageMembers || existing.canManageMembers,
            trialEndsAt: existing.trialEndsAt,
            createdAt: existing.createdAt,
            updatedAt: now
        };
        await upsertMemberRecord(db.client, nextUser);
        return sanitizeMemberView(nextUser);
    }

    if (password.length < 6) throw new Error('會員密碼至少 6 碼');
    const passwordRecord = hashPassword(password);
    const user = {
        account,
        level,
        passwordHash: passwordRecord.hash,
        passwordSalt: passwordRecord.salt,
        featureOverrides,
        canManageMembers,
        trialEndsAt: null,
        createdAt: now,
        updatedAt: now
    };
    await upsertMemberRecord(db.client, user);
    await ensureWorkspaceExists(db.client, user.account);
    return sanitizeMemberView(user);
}

async function deleteMember(db, account, currentAccount) {
    const normalized = normalizeAccount(account);
    if (!normalized) throw new Error('會員帳號不可為空');
    if (normalized === normalizeAccount(currentAccount)) throw new Error('不可刪除目前登入帳號');
    const deletedMember = await db.client.query('DELETE FROM app_members WHERE account = $1', [normalized]);
    if (deletedMember.rowCount < 1) throw new Error('找不到此會員帳號');
    await db.client.query('DELETE FROM app_workspaces WHERE account = $1', [normalized]);
    return normalized;
}

/** 會員本人憑密碼刪除帳號（App Store 帳號刪除要求用）。 */
async function deleteOwnAccount(db, account, password) {
    const normalized = normalizeAccount(account);
    if (!normalized) throw new Error('會員帳號不可為空');
    const user = await verifyMemberLogin(db, normalized, String(password || '').trim());
    if (!user) throw new Error('帳號或密碼錯誤');
    const deletedMember = await db.client.query('DELETE FROM app_members WHERE account = $1', [normalized]);
    if (deletedMember.rowCount < 1) throw new Error('找不到此會員帳號');
    await db.client.query('DELETE FROM app_workspaces WHERE account = $1', [normalized]);
    return normalized;
}

function applyWorkspaceResource(workspace, resourceName, value) {
    const nextWorkspace = sanitizeWorkspace(workspace);
    if (resourceName === 'list') nextWorkspace.list = Array.isArray(value) ? cloneJson(value, []) : [];
    else if (resourceName === 'bimRuleMap') nextWorkspace.bimRuleMap = value && typeof value === 'object' ? cloneJson(value, {}) : {};
    else if (resourceName === 'bimAuditLogs') nextWorkspace.bimAuditLogs = Array.isArray(value) ? cloneJson(value.slice(0, 120), []) : [];
    else if (resourceName === 'bimSnapshots') nextWorkspace.bimSnapshots = Array.isArray(value) ? cloneJson(value.slice(0, 40), []) : [];
    else if (resourceName === 'stakingRunHistory') nextWorkspace.stakingRunHistory = Array.isArray(value) ? cloneJson(value.slice(0, 120), []) : [];
    else if (resourceName === 'stakingReviewMemory') nextWorkspace.stakingReviewMemory = Array.isArray(value) ? cloneJson(value.slice(0, 80), []) : [];
    else if (resourceName === 'measurementLogs') nextWorkspace.measurementLogs = Array.isArray(value) ? cloneJson(value.slice(0, 200), []) : [];
    else if (resourceName === 'qaProfile') nextWorkspace.qaProfile = normalizeQaProfile(value);
    else if (resourceName === 'bimSpecPreset') nextWorkspace.bimSpecPreset = normalizeBimSpecPreset(value);
    else if (resourceName === 'autoInterpretMemory') nextWorkspace.autoInterpretMemory = Array.isArray(value) ? cloneJson(value.slice(0, 120), []) : [];
    else if (resourceName === 'guidedPrecisionReviews') nextWorkspace.guidedPrecisionReviews = Array.isArray(value) ? cloneJson(value.slice(0, 120), []) : [];
    else if (resourceName === 'blueprintLearningAssets') nextWorkspace.blueprintLearningAssets = Array.isArray(value) ? cloneJson(value.slice(0, 160), []) : [];
    else if (resourceName === 'autoInterpretLearningJobs') nextWorkspace.autoInterpretLearningJobs = Array.isArray(value) ? cloneJson(value.slice(0, 160), []) : [];
    else if (resourceName === 'autoInterpretLearningReviews') nextWorkspace.autoInterpretLearningReviews = Array.isArray(value) ? cloneJson(value.slice(0, 160), []) : [];
    else throw new Error('不支援的資料資源');
    nextWorkspace.updatedAt = new Date().toISOString();
    return sanitizeWorkspace(nextWorkspace);
}

async function updateWorkspace(db, account, updater) {
    const workspace = await getWorkspace(db, account, { forUpdate: true });
    const draft = sanitizeWorkspace(workspace);
    const nextWorkspace = sanitizeWorkspace(await updater(draft) || draft);
    await upsertWorkspaceRecord(db.client, account, nextWorkspace);
    return nextWorkspace;
}

async function setWorkspaceResource(db, account, resourceName, value) {
    const workspace = await getWorkspace(db, account, { forUpdate: true });
    const updatedWorkspace = applyWorkspaceResource(workspace, resourceName, value);
    await upsertWorkspaceRecord(db.client, account, updatedWorkspace);
    return updatedWorkspace;
}

async function appendSharedAutoInterpretSample(client, payload) {
    const sample = payload && payload.sample && typeof payload.sample === 'object' ? payload.sample : null;
    if (!sample || !sample.vector) return false;
    const contributor = normalizeAccount(payload.contributorAccount || '');
    const sourceJobId = String(payload.sourceJobId || '').trim().slice(0, 200);
    const inserted = await client.query(
        `INSERT INTO app_shared_auto_interpret_samples (sample)
         VALUES ($1::jsonb)
         RETURNING id`,
        [JSON.stringify(sample)]
    );
    const sampleId = Number(inserted.rows && inserted.rows[0] && inserted.rows[0].id);
    if (sampleId > 0 && (contributor || sourceJobId)) {
        await client.query(
            `INSERT INTO app_shared_auto_interpret_sample_audit (sample_id, contributor_account, source_job_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (sample_id) DO UPDATE
             SET contributor_account = EXCLUDED.contributor_account,
                 source_job_id = EXCLUDED.source_job_id,
                 created_at = NOW()`,
            [sampleId, contributor || '', sourceJobId]
        );
    }
    return true;
}

async function listSharedAutoInterpretSampleRows(client, limit = 400) {
    const cap = Math.max(1, Math.min(800, Math.round(Number(limit) || 400)));
    const result = await client.query(
        `SELECT sample, created_at
         FROM app_shared_auto_interpret_samples
         ORDER BY id DESC
         LIMIT $1`,
        [cap]
    );
    return result.rows || [];
}

async function importLegacySnapshot(db, snapshot) {
    const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const users = Array.isArray(source.users)
        ? source.users.map(sanitizeUser).filter((user) => user.account && user.passwordHash && user.passwordSalt)
        : [];
    const workspaces = source.workspaces && typeof source.workspaces === 'object'
        ? source.workspaces
        : {};

    for (const user of users) {
        await upsertMemberRecord(db.client, user);
        await ensureWorkspaceExists(db.client, user.account);
    }

    let workspacesImported = 0;
    for (const [account, workspace] of Object.entries(workspaces)) {
        await upsertWorkspaceRecord(db.client, account, workspace);
        workspacesImported += 1;
    }

    return {
        usersImported: users.length,
        workspacesImported
    };
}

module.exports = {
    appendSharedAutoInterpretSample,
    closeStore,
    deleteMember,
    deleteOwnAccount,
    findUser,
    getWorkspace,
    importLegacySnapshot,
    initializeStore,
    listMembers,
    listSharedAutoInterpretSampleRows,
    readDb,
    saveMember,
    sanitizeWorkspace,
    setWorkspaceResource,
    updateWorkspace,
    verifyMemberLogin,
    withDb
};
