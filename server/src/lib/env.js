const fs = require('node:fs');

function parseEnvValue(rawValue) {
    const trimmed = String(rawValue || '').trim();
    if (!trimmed) return '';
    const quote = trimmed[0];
    if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return false;
    const raw = fs.readFileSync(filePath, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
        const trimmed = String(line || '').trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const idx = trimmed.indexOf('=');
        if (idx <= 0) return;
        const key = trimmed.slice(0, idx).trim();
        if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) return;
        process.env[key] = parseEnvValue(trimmed.slice(idx + 1));
    });
    return true;
}

function loadDefaultEnv(rootDir) {
    loadEnvFile(`${rootDir}/.env`);
    loadEnvFile(`${rootDir}/.env.local`);
    if (!process.env.DB_PASSWORD && process.env.DBPASS) {
        process.env.DB_PASSWORD = String(process.env.DBPASS);
        console.warn('[env] DBPASS is deprecated. Please rename to DB_PASSWORD.');
    }
}

module.exports = {
    loadDefaultEnv
};
