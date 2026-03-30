const fs = require('node:fs/promises');
const path = require('node:path');

const { loadDefaultEnv } = require('../lib/env');
const { closeStore, importLegacySnapshot, withDb } = require('../lib/store');

const serverRoot = path.resolve(__dirname, '..', '..');

loadDefaultEnv(serverRoot);

function buildConfig() {
    return {
        defaultAdminAccount: String(process.env.DEFAULT_ADMIN_ACCOUNT || 'owner').trim().toLowerCase(),
        defaultAdminPassword: String(process.env.DEFAULT_ADMIN_PASSWORD || 'ChangeMe123!').trim(),
        defaultAdminLevel: String(process.env.DEFAULT_ADMIN_LEVEL || 'pro').trim(),
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
        dbConnectTimeoutMs: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 10000
    };
}

function resolveSourcePath() {
    const rawPath = String(process.argv[2] || process.env.LEGACY_DATA_FILE || './data/app-db.json').trim();
    if (!rawPath) {
        throw new Error('請提供 legacy JSON 檔案路徑，或在 .env 設定 LEGACY_DATA_FILE。');
    }
    return path.isAbsolute(rawPath)
        ? rawPath
        : path.resolve(serverRoot, rawPath);
}

async function main() {
    const sourcePath = resolveSourcePath();
    let raw = '';
    try {
        raw = await fs.readFile(sourcePath, 'utf8');
    } catch (error) {
        throw new Error(`找不到 legacy JSON 檔案：${sourcePath}`);
    }

    const snapshot = raw ? JSON.parse(raw) : {};
    const result = await withDb(buildConfig(), async (db) => importLegacySnapshot(db, snapshot));

    console.log(`Imported ${result.usersImported} users and ${result.workspacesImported} workspaces from ${sourcePath}`);
}

(async () => {
    try {
        await main();
    } catch (error) {
        console.error('Legacy JSON import failed', error);
        process.exitCode = 1;
    } finally {
        await closeStore().catch(() => {});
    }
})();
