// Tofu (2026-10-27): this file is Tofu's addition. Tofu's own versioned
// migrations, in their own namespace and their own list, as registry.ts asks of
// a downstream build. db.ts runs them after the core list, under the same lock.
// The same rules hold: append only, never edit or rename one once shipped.

import type { Migration } from './runner';

export const tofuMigrations: readonly Migration[] = [
    {
        // A new account starts in English and US dollars instead of French and
        // euros. The language follows the browser when an account is made (see
        // routes/auth.ts), and anyone can change both in Settings.
        id: 'tofu/0001-english-defaults',
        statements: [
            "ALTER TABLE users ALTER COLUMN language SET DEFAULT 'en'",
            "ALTER TABLE users ALTER COLUMN currency SET DEFAULT 'USD'",
        ],
    },
];
