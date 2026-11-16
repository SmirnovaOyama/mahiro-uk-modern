// Link previews for the projects page: what a repository or a website says
// about itself, fetched once when a project is saved and refreshed now and
// then, so the page itself never waits on GitHub, GitLab or anyone's site.
import type { LinkPreview, Project, ProjectLink } from '../src/shared/api.ts';
import { linkPlace } from '../src/shared/links.ts';

/** Previews older than this are fetched again when the page is next read. */
export const STALE_MS = 12 * 3_600_000;
/** A link just asked about isn't asked about again for this long, whatever the answer was. */
const RECENT_MS = 10 * 60_000;

const HEADERS = { 'user-agent': 'link-preview (Cloudflare Worker)', accept: 'application/json' };

/** Attribute values come back from HTMLRewriter as written, entities and all. */
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
const unescape = (s: string): string =>
    s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
        if (code[0] !== '#') return NAMED[code.toLowerCase()] ?? all;
        const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
    });

const clip = (s: unknown, max: number): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const time = (s: unknown): number | null => {
    const t = typeof s === 'string' ? Date.parse(s) : NaN;
    return Number.isFinite(t) ? t : null;
};

async function getJson(url: string): Promise<Record<string, unknown> | null> {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(5000) });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
}

async function github(repo: string): Promise<LinkPreview | null> {
    const r = await getJson(`https://api.github.com/repos/${repo}`);
    if (!r) return null;
    return {
        title: clip(r.description, 300),
        description: '',
        image: '',
        language: clip(r.language, 40),
        stars: typeof r.stargazers_count === 'number' ? r.stargazers_count : null,
        updated: time(r.pushed_at),
    };
}

async function gitlab(origin: string, repo: string): Promise<LinkPreview | null> {
    const r = await getJson(`${origin}/api/v4/projects/${encodeURIComponent(repo)}`);
    if (!r) return null;
    return {
        title: clip(r.description, 300),
        description: '',
        image: '',
        language: '',
        stars: typeof r.star_count === 'number' ? r.star_count : null,
        updated: time(r.last_activity_at),
    };
}

/** A website's own title, description and picture, from the <head> of its page. */
async function site(href: string): Promise<LinkPreview | null> {
    const res = await fetch(href, {
        headers: { 'user-agent': HEADERS['user-agent'], accept: 'text/html' },
        redirect: 'follow',
        signal: AbortSignal.timeout(5000),
    });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html')) return null;
    const meta: Record<string, string> = {};
    let title = '';
    await new HTMLRewriter()
        .on('meta', {
            element: e => {
                const key = (e.getAttribute('property') ?? e.getAttribute('name') ?? '').toLowerCase();
                const content = e.getAttribute('content');
                if (key && content && !(key in meta)) meta[key] = unescape(content);
            },
        })
        .on('head > title', { text: t => void (title += t.text) })
        .transform(res)
        .arrayBuffer();
    const image = meta['og:image'] || meta['twitter:image'] || '';
    let imageHref = '';
    try {
        const u = image ? new URL(image, res.url || href) : null;
        if (u && (u.protocol === 'https:' || u.protocol === 'http:')) imageHref = u.href;
    } catch {}
    const preview: LinkPreview = {
        title: clip(meta['og:title'] || meta['twitter:title'] || unescape(title), 200),
        description: clip(meta['og:description'] || meta['description'] || meta['twitter:description'], 400),
        image: imageHref,
        language: '',
        stars: null,
        updated: null,
    };
    return preview.title || preview.description || preview.image ? preview : null;
}

export async function fetchPreview(typed: string): Promise<LinkPreview | null> {
    const place = linkPlace(typed);
    if (!place) return null;
    try {
        // A repository asks the forge's API; a profile, a group or anything else is read as a page.
        if (place.kind === 'github' && place.repo) return (await github(place.repo)) ?? (await site(place.href));
        if (place.kind === 'gitlab' && place.repo) return (await gitlab(new URL(place.href).origin, place.repo)) ?? (await site(place.href));
        return await site(place.href);
    } catch {
        return null;
    }
}

/**
 * Fills in the previews a list of projects is missing, or has had too long,
 * reusing what `known` already holds for the same address. Links are asked
 * about all at once, each given a few seconds at most.
 */
export async function withPreviews(projects: Project[], known: Project[], now: number, maxAge = STALE_MS): Promise<Project[]> {
    const had = new Map<string, ProjectLink>();
    for (const p of known) for (const l of p.links) had.set(l.url.trim(), l);
    const asked = new Map<string, Promise<LinkPreview | null>>();
    const ask = (url: string): Promise<LinkPreview | null> => {
        if (!asked.has(url)) asked.set(url, fetchPreview(url));
        return asked.get(url)!;
    };
    return Promise.all(
        projects.map(async p => ({
            ...p,
            links: await Promise.all(
                p.links.map(async (l): Promise<ProjectLink> => {
                    const url = l.url.trim();
                    const old = had.get(url);
                    const age = now - (old?.fetchedAt ?? 0);
                    // Kept: fresh enough, or asked about a moment ago (an address still being typed fails once, not on every keystroke).
                    if (old && (age < (old.preview ? maxAge : RECENT_MS) || !linkPlace(url))) return { url: l.url, preview: old.preview, fetchedAt: old.fetchedAt };
                    if (!linkPlace(url)) return { url: l.url, preview: null, fetchedAt: now };
                    const preview = (await ask(url)) ?? old?.preview ?? null;
                    return { url: l.url, preview, fetchedAt: now };
                }),
            ),
        })),
    );
}

/** True when any link on the page has a preview due for another look. */
export const anyStale = (projects: Project[], now: number): boolean =>
    projects.some(p => p.links.some(l => linkPlace(l.url) && now - (l.fetchedAt ?? 0) > (l.preview ? STALE_MS : RECENT_MS * 6)));
