// What kind of place a project's link points to, from its address alone.
// Shared by the editor and the Worker.
import { friendHref } from './friends.ts';

export type LinkKind = 'github' | 'gitlab' | 'site';

export interface LinkPlace {
    kind: LinkKind;
    href: string;
    /** "github.com/SmirnovaOyama/parley", "hrt.mahiro.uk": how the page writes it. */
    where: string;
    /** For a repository: "SmirnovaOyama/parley", or a GitLab group path. A profile or group page has none. */
    repo?: string;
}

/** The link as typed, understood; null while it isn't an address yet. */
export function linkPlace(typed: string): LinkPlace | null {
    const href = friendHref(typed);
    if (!href) return null;
    const url = new URL(href);
    const host = url.host.replace(/^www\./, '');
    const parts = url.pathname.split('/').filter(Boolean);
    const where = (host + url.pathname).replace(/\/+$/, '');
    if (host === 'github.com') return { kind: 'github', href, where, repo: parts.length >= 2 ? `${parts[0]}/${parts[1]!.replace(/\.git$/, '')}` : undefined };
    // gitlab.com, or a GitLab of one's own (gitlab.example.org). Subgroups nest; "/-/" starts the project's own pages.
    if (host === 'gitlab.com' || host.startsWith('gitlab.')) {
        const end = parts.indexOf('-');
        const path = (end < 0 ? parts : parts.slice(0, end)).join('/').replace(/\.git$/, '');
        return { kind: 'gitlab', href, where, repo: path.includes('/') ? path : undefined };
    }
    return { kind: 'site', href, where };
}

export const KIND_LABEL: Record<LinkKind, string> = { github: 'GitHub', gitlab: 'GitLab', site: 'Website' };
