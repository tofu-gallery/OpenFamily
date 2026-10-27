// Tofu (2026-10-27): this file is Tofu's addition. See TOFU.md.
//
// A link to the source of the code this copy runs (AGPL-3.0, section 13), on
// pages anyone can open. The address comes from the server (GET /api/source,
// which reads the SOURCE_URL setting), so a copy links its own pinned commit
// without a rebuild; until the server answers, and if it cannot, the fork.
import { useEffect, useState, type ReactNode } from 'react';
import { apiBase } from '../../lib/serverConfig';

const FALLBACK_SOURCE_URL = 'https://github.com/tofu-gallery/OpenFamily/tree/tofu';

export function SourceCodeLink({ className, children }: { className?: string; children: ReactNode }) {
    const [href, setHref] = useState(FALLBACK_SOURCE_URL);

    useEffect(() => {
        let cancelled = false;
        fetch(`${apiBase()}/api/source`)
            .then((response) => (response.ok ? response.json() : null))
            .then((body: { data?: { url?: unknown } } | null) => {
                const url = body?.data?.url;
                if (!cancelled && typeof url === 'string' && /^https?:\/\//i.test(url)) setHref(url);
            })
            .catch(() => {
                /* keep the fork's address */
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
            {children}
        </a>
    );
}
