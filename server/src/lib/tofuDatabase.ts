// Tofu (2026-10-27): this file is Tofu's addition, used by db.ts. See TOFU.md.
import { rootCertificates } from 'tls';
import type { PoolConfig } from 'pg';

// The connection-string parameters node-postgres takes its TLS settings from.
// Any of them in the URL replaces an `ssl` object passed beside it.
const URL_TLS_PARAMETERS = ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'];

/** True when the server connects through DATABASE_URL instead of the POSTGRES_* settings. */
export const usesDatabaseUrl = (): boolean => Boolean(process.env.DATABASE_URL?.trim());

/**
 * Where the pool connects when DATABASE_URL is set, as it is for a copy made on
 * Tofu, whose managed database supplies it. Without DATABASE_URL the caller keeps
 * upstream's POSTGRES_* settings.
 *
 * Tofu's DATABASE_URL carries `sslmode=require`, which node-postgres reads as
 * full verification, and the database's certificate chains to a root Node does
 * not ship (Tofu supplies it as SUPABASE_CA_CERT), so the URL on its own fails
 * with SELF_SIGNED_CERT_IN_CHAIN. When SUPABASE_CA_CERT is set, the URL's own
 * TLS parameters are removed and the server is verified against that root as
 * well as Node's own. Verification is never turned off.
 */
export function databaseUrlConfig(): PoolConfig {
    const databaseUrl = process.env.DATABASE_URL!.trim();
    const caCert = process.env.SUPABASE_CA_CERT;
    if (!caCert?.trim()) return { connectionString: databaseUrl };

    let url: URL;
    try {
        url = new URL(databaseUrl);
    } catch {
        // Not the parser's own error, which would carry the URL and its password.
        throw new Error('DATABASE_URL must be a PostgreSQL URL.');
    }
    for (const name of URL_TLS_PARAMETERS) url.searchParams.delete(name);
    return {
        connectionString: url.toString(),
        ssl: { ca: [...rootCertificates, caCert], rejectUnauthorized: true },
    };
}
