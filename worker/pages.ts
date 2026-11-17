// The reader's pages. Each is the built page.html (so it carries the site's own
// hashed CSS and theme script) with its title, description and <main> filled in.
import config from '../src/config.ts';
import { githubMark, gitlabMark, icon } from '../src/icons.ts';
import katex from 'katex';
import { escapeHtml as esc, hasHan, hasMath, renderMarkdown } from '../src/shared/markdown.ts';
import type { Friend, Project, ProjectLink } from '../src/shared/api.ts';
import { KIND_LABEL, linkPlace } from '../src/shared/links.ts';
import { avatarSrc, friendHref, hostOf } from '../src/shared/friends.ts';

const KATEX_VERSION = katex.version;
import type { LiveArticle, LiveCollection, LiveListing } from './db.ts';
import type { Env } from './env.ts';

export interface Page {
    title: string;
    description: string;
    /** The path this page lives at; made absolute against the request. */
    path: string;
    main: string;
    status?: number;
    /** Kept out of search engines: previews and missing pages. */
    hidden?: boolean;
    type?: 'website' | 'article';
    /** For an article: when it first went out and when it last changed. */
    published?: number;
    modified?: number;
    /** Its own link preview picture, instead of the site's; made absolute against the request. */
    image?: string;
    /** Holds LaTeX, so it needs the math styles. */
    math?: boolean;
    /** The parts either side in its collection, so the page knows which way it was turned. */
    prev?: string;
    next?: string;
}


/** "13 November 2026", on the site's own clock. */
export const formatDate = (ms: number): string =>
    new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(ms + config.utcOffsetHours * 3_600_000),
    );

const isoDate = (ms: number): string => new Date(ms).toISOString();

const time = (ms: number): string => `<time datetime="${isoDate(ms)}">${formatDate(ms)}</time>`;

const articleHref = (a: LiveListing): string => `/writing/${encodeURIComponent(a.slug)}`;

/** Titles and nothing else, set large and light like the sentence on the home page. */
const titles = (items: { href: string; title: string }[], ordered = false): string => {
    const tag = ordered ? 'ol' : 'ul';
    return `<${tag} class="titles">${items.map(i => `<li><a href="${i.href}">${esc(i.title)}</a></li>`).join('')}</${tag}>`;
};

export function writingIndex(articles: LiveListing[], collections: LiveCollection[]): Page {
    const series = collections.length
        ? `<h2 class="section-heading">Collections</h2>
${titles(collections.map(c => ({ href: `/collections/${encodeURIComponent(c.slug)}`, title: c.title })))}`
        : '';
    return {
        title: 'Anya’s Blog',
        description: 'Writing by Smirnova Anya.',
        path: '/writing',
        main: `<h1 class="sr-only">Anya’s Blog</h1>
${titles(articles.map(a => ({ href: articleHref(a), title: a.title })))}
${series}`,
    };
}

/**
 * The collection an article belongs to, frozen to the bottom of the screen
 * like the bar under the sentence on the home page: where you are in it, and
 * the way to the parts either side.
 */
function seriesBar(c: LiveCollection, articleId: number): string {
    const at = c.articles.findIndex(a => a.id === articleId);
    // A draft being previewed isn't one of the collection's live parts yet.
    if (at < 0) return '';
    const step = (a: LiveListing | undefined, rel: 'prev' | 'next'): string => {
        const glyph = icon(rel === 'prev' ? 'arrowLeft' : 'arrowRight', 18);
        if (!a) return `<span class="btn-ghost btn-icon is-off" aria-hidden="true">${glyph}</span>`;
        const label = `${rel === 'prev' ? 'Previous' : 'Next'}: ${a.title}`;
        return `<a class="btn-ghost btn-icon" rel="${rel}" href="${articleHref(a)}" aria-label="${esc(label)}" title="${esc(label)}">${glyph}</a>`;
    };
    return `<nav class="controls series-bar" aria-label="${esc(c.title)}">
    <p class="hint">Part ${at + 1} of ${c.articles.length} in <a class="link" href="/collections/${encodeURIComponent(c.slug)}">${esc(c.title)}</a></p>
    <span class="series-steps">${step(c.articles[at - 1], 'prev')}${step(c.articles[at + 1], 'next')}</span>
</nav>`;
}

/**
 * The article's own sections, from the ids its headings were given when the
 * Markdown was turned into HTML. Only second- and third-level headings count,
 * and only when there are at least two, so a short piece carries no list.
 */
function contents(html: string): string {
    const entries = [...html.matchAll(/<h([23]) id="([^"]+)">([\s\S]*?)<a class="anchor"/g)].map(([, level, id, inner]) => ({
        level,
        id: id!,
        // The heading's words as already escaped HTML, without its inline tags.
        text: inner!.replace(/<[^>]+>/g, '').trim(),
    }));
    if (entries.length < 2) return '';
    return `<nav class="toc" aria-label="Contents">
        <div class="toc-list">
            <p class="toc-label">Contents</p>
            <ol>${entries.map(e => `<li class="toc-h${e.level}"><a href="#${e.id}">${e.text}</a></li>`).join('')}</ol>
        </div>
    </nav>`;
}

export function articlePage(article: LiveArticle, collections: LiveCollection[], preview = false): Page {
    // An article in more than one collection is shown in the first; the others still list it.
    const bar = collections.map(c => seriesBar(c, article.id)).find(Boolean) ?? '';
    const series = collections.find(c => c.articles.some(a => a.id === article.id));
    const at = series?.articles.findIndex(a => a.id === article.id) ?? -1;
    const neighbour = (i: number): string | undefined => {
        const a = series?.articles[i];
        return a && at >= 0 ? articleHref(a) : undefined;
    };
    return {
        title: article.title,
        description: article.summary || article.title,
        path: `/writing/${article.slug}`,
        type: 'article',
        hidden: preview,
        math: hasMath(article.html),
        prev: neighbour(at - 1),
        next: neighbour(at + 1),
        published: article.publishedAt,
        modified: article.republishedAt,
        main: `${preview ? '<p class="preview-note">Preview</p>' : ''}
<article class="article">
    <header class="page-head">
        <h1 class="page-title">${esc(article.title) || 'Untitled'}</h1>
        ${article.summary ? `<p class="page-summary">${esc(article.summary)}</p>` : ''}
        <p class="page-meta">${time(article.publishedAt)}</p>
    </header>
    ${contents(article.html)}
    <div class="prose">${article.html}</div>
</article>
${bar}`,
    };
}

export function collectionPage(c: LiveCollection): Page {
    return {
        title: c.title,
        description: c.description || c.title,
        path: `/collections/${c.slug}`,
        main: `<header class="page-head">
    <h1 class="page-title">${esc(c.title)}</h1>
    ${c.description ? `<p class="page-summary">${esc(c.description)}</p>` : ''}
</header>
${titles(c.articles.map(a => ({ href: articleHref(a), title: a.title })), true)}`,
    };
}

/** The people the blog points to, or null while there's nobody to show. */
/**
 * A friend's picture after their name, round like mine on the home page; with
 * none set, a soft circle holding the first letter of their name.
 */
function friendFace(f: { name: string; avatar: string | null }): string {
    if (f.avatar) return `<img class="friend-avatar" src="${esc(f.avatar)}" alt="" width="96" height="96" loading="lazy" decoding="async">`;
    const initial = [...f.name.trim()][0]?.toLocaleUpperCase() ?? '';
    return `<span class="friend-avatar friend-initial" aria-hidden="true">${esc(initial)}</span>`;
}

export function friendsPage(friends: Friend[]): Page | null {
    const shown = friends.flatMap(f => {
        const href = friendHref(f.url);
        return href ? [{ href, name: f.name.trim() || hostOf(href), note: f.note.trim() || hostOf(href), avatar: avatarSrc(f.avatar ?? '') }] : [];
    });
    if (!shown.length) return null;
    return {
        title: 'Friends',
        description: 'Friends of Anya’s Blog.',
        path: '/friends',
        main: `<header class="page-head"><h1 class="page-title">Friends</h1></header>
<ul class="titles friends">${shown
            .map(f => `<li><a href="${esc(f.href)}" rel="friend noopener">${esc(f.name)}${friendFace(f)}</a><span class="friend-note">${esc(f.note)}</span></li>`)
            .join('')}</ul>`,
    };
}

/** "1.2k" for a count of stars past a thousand. */
const count = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n));

/** "Nov 2026": when a repository last changed, as briefly as that can be said. */
const monthYear = (ms: number): string =>
    new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(ms + config.utcOffsetHours * 3_600_000));

/**
 * One of a project's links, as a quiet card: where it is, then what that place
 * says about itself. A repository gives its description, language, stars and
 * when it last changed; a website its title and description, and its picture
 * set small beside them. Without a preview it is simply the address.
 */
function linkCard(link: ProjectLink): string {
    const place = linkPlace(link.url);
    if (!place) return '';
    const p = link.preview;
    const mark = place.kind === 'github' ? githubMark('link-mark', 14) : place.kind === 'gitlab' ? gitlabMark('link-mark', 14) : icon('globe', 14);
    const meta = p
        ? [p.language, p.stars && place.kind !== 'site' ? `★ ${count(p.stars)}` : '', p.updated ? `Updated ${monthYear(p.updated)}` : '']
              .filter(Boolean)
              .map(esc)
              .join('<span aria-hidden="true"> · </span>')
        : '';
    const image = p?.image && place.kind === 'site'
        ? `<img class="link-card-image" src="${esc(p.image)}" alt="" width="120" height="63" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
        : '';
    return `<li><a class="link-card is-${place.kind}${image ? ' has-image' : ''}" href="${esc(place.href)}" rel="noopener">
    <span class="link-card-text">
        <span class="link-card-where">${mark}<span>${esc(place.where)}</span></span>
        ${p?.title ? `<span class="link-card-title">${esc(p.title)}</span>` : `<span class="link-card-title is-quiet">${KIND_LABEL[place.kind]}</span>`}
        ${p?.description ? `<span class="link-card-about">${esc(p.description)}</span>` : ''}
        ${meta ? `<span class="link-card-meta">${meta}</span>` : ''}
    </span>
    ${image}
</a></li>`;
}

/**
 * What I make, each led by the one rule it keeps rather than by its name: the
 * rule is set large, like the titles everywhere else, the name and a line
 * about it follow small, and then its links, each with what it says about
 * itself. Null while there's nothing to show.
 */
export function projectsPage(projects: Project[]): Page | null {
    const shown = projects.filter(p => p.rule.trim() || p.name.trim());
    if (!shown.length) return null;
    return {
        title: 'Projects',
        description: 'Software by Smirnova Anya, each piece held to one rule.',
        path: '/projects',
        main: `<header class="page-head">
    <h1 class="page-title">Projects</h1>
</header>
<ol class="projects">${shown
            .map(p => {
                const cards = p.links.map(linkCard).join('');
                return `<li class="project">
    <h2 class="project-rule">${esc(p.rule.trim() || p.name.trim())}</h2>
    ${p.rule.trim() && p.name.trim() ? `<p class="project-name">${esc(p.name.trim())}</p>` : ''}
    ${p.about.trim() ? `<p class="project-about">${esc(p.about.trim())}</p>` : ''}
    ${cards ? `<ul class="link-cards">${cards}</ul>` : ''}
</li>`;
            })
            .join('')}</ol>`,
    };
}

export const notFound = (): Page => ({
    title: 'Not found',
    description: 'Not found.',
    path: '/writing',
    status: 404,
    hidden: true,
    main: '<h1 class="page-title">Not found</h1>',
});

/** Fills the built page.html. */
export async function respond(env: Env, request: Request, page: Page): Promise<Response> {
    const url = new URL(request.url);
    const [template, friends, projects] = await Promise.all([
        env.ASSETS.fetch(new URL('/page', url)),
        // The ways to the friends and projects pages appear once there's something on them.
        env.DB.prepare('SELECT url FROM friends')
            .all<{ url: string }>()
            .then(r => r.results.some(f => friendHref(f.url)))
            .catch(() => false),
        env.DB.prepare("SELECT 1 FROM projects WHERE trim(name) != '' OR trim(rule) != '' LIMIT 1")
            .first()
            .then(Boolean)
            .catch(() => false),
    ]);
    if (!template.ok) return new Response('The page template is missing. Run `npm run build`.', { status: 500 });
    const canonical = new URL(page.path, url).href;

    const isZh = hasHan(page.title) || hasHan(page.description);

    const rewritten = new HTMLRewriter()
        .on('html', {
            element: e => {
                if (isZh) e.setAttribute('lang', 'zh');
                if (page.prev) e.setAttribute('data-prev', page.prev);
                if (page.next) e.setAttribute('data-next', page.next);
            },
        })
        .on('.nav-links', {
            element: e => {
                // A missing page borrows /writing's path without being it.
                const here = (href: string): string => (page.path === href && !page.status ? ' aria-current="page"' : '');
                const link = (href: string, label: string): string => `<a class="btn-ghost" href="${href}"${here(href)}>${label}</a>`;
                const tdor = `<a class="btn-ghost" href="${esc(config.tdor.href)}" title="${esc(config.tdor.title)}">${esc(config.tdor.label)}</a>`;
                e.prepend(link('/writing', 'Writing') + (friends ? link('/friends', 'Friends') : '') + (projects ? link('/projects', 'Projects') : '') + tdor, { html: true });
            },
        })
        .on('title', { element: e => void e.setInnerContent(page.title) })
        .on('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]', {
            element: e => void e.setAttribute('content', page.description),
        })
        .on('meta[property="og:title"], meta[name="twitter:title"]', { element: e => void e.setAttribute('content', page.title) })
        .on('meta[property="og:url"]', { element: e => void e.setAttribute('content', canonical) })
        .on('meta[property="og:image"], meta[name="twitter:image"]', {
            element: e => void (page.image && e.setAttribute('content', new URL(page.image, url).href)),
        })
        .on('meta[property="og:type"]', { element: e => void e.setAttribute('content', page.type ?? 'website') })
        .on('link[rel="canonical"]', { element: e => void e.setAttribute('href', canonical) })
        .on('meta[name="robots"]', { element: e => void (page.hidden ? e.setAttribute('content', 'noindex') : e.remove()) })
        .on('head', {
            element: e => {
                // KaTeX's type, on the pages that need it (copied there by vite.config.ts).
                if (page.math) e.append(`<link rel="stylesheet" href="/vendor/katex/katex.min.css?v=${KATEX_VERSION}">`, { html: true });
                if (page.published === undefined) return;
                const ld = JSON.stringify({
                    '@context': 'https://schema.org',
                    '@type': 'BlogPosting',
                    headline: page.title,
                    description: page.description,
                    url: canonical,
                    datePublished: isoDate(page.published),
                    dateModified: isoDate(page.modified ?? page.published),
                    author: { '@type': 'Person', name: 'Smirnova Anya', url: new URL('/', url).href },
                }).replace(/</g, '\\u003c');
                e.append(
                    `<meta property="article:published_time" content="${isoDate(page.published)}">` +
                        `<meta property="article:modified_time" content="${isoDate(page.modified ?? page.published)}">` +
                        `<script type="application/ld+json">${ld}</script>`,
                    { html: true },
                );
            },
        })
        .on('main#page', { element: e => void e.setInnerContent(page.main, { html: true }) })
        .transform(template);

    return new Response(rewritten.body, {
        status: page.status ?? 200,
        headers: {
            'content-type': 'text/html; charset=utf-8',
            // Always asked for afresh: a cached page would point at CSS a newer deploy has replaced.
            'cache-control': page.hidden ? 'no-store' : 'no-cache',
        },
    });
}

export function feed(origin: string, articles: LiveArticle[]): Response {
    const updated = Math.max(0, ...articles.map(a => a.republishedAt));
    const entries = articles
        .map(a => {
            // Feed readers bring no styles, so math goes as MathML, which they can draw themselves.
            const href = `${origin}/writing/${encodeURIComponent(a.slug)}`;
            return `<entry>
    <title>${esc(a.title)}</title>
    <link rel="alternate" type="text/html" href="${esc(href)}"/>
    <id>${esc(`${origin}/writing/${a.id}`)}</id>
    <published>${isoDate(a.publishedAt)}</published>
    <updated>${isoDate(a.republishedAt)}</updated>
    ${a.summary ? `<summary>${esc(a.summary)}</summary>` : ''}
    <content type="html">${esc(hasMath(a.html) ? renderMarkdown(a.body, { math: 'mathml' }) : a.html)}</content>
</entry>`;
        })
        .join('\n');
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>Anya’s Blog</title>
<link rel="alternate" type="text/html" href="${origin}/writing"/>
<link rel="self" type="application/atom+xml" href="${origin}/writing/feed.xml"/>
<id>${origin}/writing</id>
<updated>${isoDate(updated || Date.now())}</updated>
<author><name>Smirnova Anya</name></author>
${entries}
</feed>`;
    return new Response(xml, { headers: { 'content-type': 'application/atom+xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}

export function sitemap(origin: string, articles: LiveListing[], collections: LiveCollection[], friends: boolean, projects: boolean): Response {
    const entry = (path: string, modified?: number): string =>
        `<url><loc>${esc(origin + path)}</loc>${modified ? `<lastmod>${isoDate(modified)}</lastmod>` : ''}</url>`;
    const newest = (list: LiveListing[]): number => Math.max(0, ...list.map(a => a.republishedAt));
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[
    entry('/'),
    entry('/writing', newest(articles) || undefined),
    ...articles.map(a => entry(articleHref(a), a.republishedAt)),
    ...collections.map(c => entry(`/collections/${encodeURIComponent(c.slug)}`, newest(c.articles))),
    friends && entry('/friends'),
    projects && entry('/projects'),
]
    .filter(Boolean)
    .join('\n')}
</urlset>`;
    return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
