// Tofu (2026-10-27): modified for Tofu's app gallery: when JWT_SECRET is unset and
// DATABASE_URL is set, a JWT_SECRET is derived from DATABASE_URL. See TOFU.md.
import { createHmac } from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

let loaded = false;
const MIN_JWT_SECRET_LENGTH = 32;
const WEAK_JWT_SECRETS = new Set([
    'your-super-secret-jwt-key',
    'replace-me-with-a-long-random-secret',
    'CHANGE_ME_STRONG_RANDOM_SECRET_MIN_32_CHARS',
]);

/**
 * Tofu (2026-10-27): a copy made from Tofu's app gallery starts with no
 * JWT_SECRET, and the server refuses to start without one. When it is unset and
 * DATABASE_URL is set (a copy's managed database supplies it), this derives a
 * stable one from DATABASE_URL, which only the app's hosting and its owner hold:
 * 64 hexadecimal characters, the same in every process of the app. A JWT_SECRET
 * saved in the app's settings replaces it.
 *
 * The secret signs every sign-in (7 days each) and is the key the integration
 * credentials (Mealie, Tandoor, Home Assistant, Grocy, Nextcloud, Immich) and the
 * AI provider keys are encrypted with in the database. Changing it, by saving a
 * JWT_SECRET or by a DATABASE_URL that changes (a restored or different database,
 * a new database password), signs everybody out once, and those saved
 * credentials and keys have to be entered again.
 */
const deriveJwtSecretFromDatabaseUrl = () => {
    if (process.env.JWT_SECRET?.trim()) return;
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) return;
    process.env.JWT_SECRET = createHmac('sha256', databaseUrl)
        .update('tofu-gallery/OpenFamily JWT_SECRET')
        .digest('hex');
};

const validateJwtSecret = () => {
    if (process.env.NODE_ENV === 'test') {
        return;
    }

    const jwtSecret = process.env.JWT_SECRET?.trim();

    if (!jwtSecret) {
        throw new Error('JWT_SECRET is required and must be set to a secure value.');
    }

    if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
        throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters long.`);
    }

    if (WEAK_JWT_SECRETS.has(jwtSecret)) {
        throw new Error('JWT_SECRET uses an insecure placeholder value. Set a strong random secret.');
    }
};

export const loadEnv = () => {
    if (loaded) {
        return;
    }

    const candidates = [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '..', '.env'),
    ];

    for (const envPath of candidates) {
        if (fs.existsSync(envPath)) {
            dotenv.config({ path: envPath });
            loaded = true;
            deriveJwtSecretFromDatabaseUrl();
            validateJwtSecret();
            return;
        }
    }

    dotenv.config();
    loaded = true;

    deriveJwtSecretFromDatabaseUrl();
    validateJwtSecret();
};

export const getJwtSecret = (): string => {
    loadEnv();
    validateJwtSecret();
    return process.env.JWT_SECRET!.trim();
};
