// A friend's address as it was typed ("example.com", "https://example.com/blog"),
// made into a link, or null while it isn't one yet. Shared by the editor and the Worker.

export function friendHref(typed: string): string | null {
    const t = typed.trim();
    if (!t) return null;
    try {
        const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(t) ? t : `https://${t}`);
        return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.') ? url.href : null;
    } catch {
        return null;
    }
}

/** An avatar the page may show: only pictures this site stores itself. */
export const avatarSrc = (typed: string): string | null => (/^\/media\/[\w./-]+$/.test(typed.trim()) ? typed.trim() : null);

/** "example.com", for a friend with no name yet. */
export const hostOf = (href: string): string => new URL(href).host.replace(/^www\./, '');
