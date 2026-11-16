// Moving between the site's pages without leaving the page. The Worker still
// writes every page whole, so a first visit, a search engine or a reader
// without scripts gets the same thing as ever. Once this has loaded, a click
// on a link to another of the site's pages asks for that page in the
// background and changes into it in place, with the same soft handover as
// before; the address, Back and Forward, the scroll position and the tab's
// title all keep up.
//
// The editor at /admin/ is its own app and is still opened the ordinary way.

/** Sets a page up once it's on screen, and returns how to take it down again. */
export type Mount = () => () => void;

interface Loaded {
    url: string;
    html: string | null;
}

type Kind = 'push' | 'replace' | 'traverse';

/** The pages this can show: the sentence, the blog, its articles and collections, friends and projects. */
const SITE = /^\/(?:|writing\/?|writing\/(?!feed\.xml$)[^/]+\/?|collections\/[^/]+\/?|friends\/?|projects\/?)$/;
const isSite = (url: URL): boolean => url.origin === location.origin && SITE.test(url.pathname);

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const pathOf = (url: URL | Location): string => url.pathname + url.search;
const depth = (path: string): number => path.split('/').filter(Boolean).length;

// ── where each history entry was scrolled to ─────────────────────────────

const SCROLLS = 'site-scrolls';
let scrolls: Record<number, number> = {};
try {
    scrolls = JSON.parse(sessionStorage.getItem(SCROLLS) ?? '{}') as Record<number, number>;
} catch {}
let index = 0;

// ── asking for pages ─────────────────────────────────────────────────────

/** Pages asked for a moment early (a pointer resting on a link), kept briefly. */
const early = new Map<string, { at: number; loaded: Promise<Loaded> }>();

function load(url: URL): Promise<Loaded> {
    const key = pathOf(url);
    const kept = early.get(key);
    if (kept && performance.now() - kept.at < 30_000) {
        early.delete(key);
        return kept.loaded;
    }
    return fetch(key, { headers: { accept: 'text/html' }, credentials: 'same-origin' }).then(async res => ({
        url: res.url,
        html: (res.headers.get('content-type') ?? '').includes('text/html') ? await res.text() : null,
    }));
}

function warm(url: URL): void {
    const save = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const key = pathOf(url);
    if (save || key === pathOf(location) || early.has(key)) return;
    const loaded = load(url);
    loaded.catch(() => early.delete(key));
    early.set(key, { at: performance.now(), loaded });
}

// ── changing pages ───────────────────────────────────────────────────────

/** The scripts a page runs. A page from a newer deploy runs others, and is opened the ordinary way. */
const scripts = (doc: Document): string =>
    [...doc.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')].map(s => new URL(s.getAttribute('src')!, location.href).pathname).join(' ');

/** What each page says about itself in <head>; the rest (the theme script, the icons, the styles) stays put. */
const OWN = 'meta:not([charset]):not([name="viewport"]):not([name="color-scheme"]), link[rel="canonical"], link[rel="alternate"], script[type="application/ld+json"]';

/** Styles the next page needs that this one hasn't loaded (KaTeX, say), in place before it shows. */
function styles(doc: Document): Promise<unknown> {
    const have = new Set([...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(l => l.href));
    const adding = [...doc.querySelectorAll<HTMLLinkElement>('head link[rel="stylesheet"]')]
        .filter(l => !have.has(new URL(l.getAttribute('href')!, location.href).href))
        .map(l => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = l.getAttribute('href')!;
            const ready = new Promise(done => {
                link.onload = link.onerror = done;
                setTimeout(done, 3000);
            });
            document.head.append(link);
            return ready;
        });
    return Promise.all(adding);
}

/** Copies the attributes of one element onto another, keeping the reader's theme. */
function attributes(from: Element, to: Element, keep: string[] = []): void {
    for (const { name } of [...to.attributes]) if (!keep.includes(name) && !from.hasAttribute(name)) to.removeAttribute(name);
    for (const { name, value } of [...from.attributes]) if (!keep.includes(name)) to.setAttribute(name, value);
}

/**
 * The next page's body, ready to go in. A new <img> shows blank (white) until
 * it's decoded, so a picture the next page shares with this one (the avatar
 * in the header) is carried across as the same element, and any others are
 * decoded first, for a moment at most.
 */
async function prepare(doc: Document): Promise<{ nodes: Node[]; keep: [HTMLImageElement, HTMLImageElement][] }> {
    const nodes = [...doc.body.childNodes].map(n => document.adoptNode(n));
    const here = [...document.body.querySelectorAll('img')];
    const keep: [HTMLImageElement, HTMLImageElement][] = [];
    const decoding: Promise<unknown>[] = [];
    for (const node of nodes) {
        if (!(node instanceof Element)) continue;
        for (const img of node.querySelectorAll('img')) {
            const same = here.findIndex(old => old.outerHTML === img.outerHTML);
            if (same >= 0) keep.push([img, here.splice(same, 1)[0]!]);
            else if (img.loading !== 'lazy') decoding.push(img.decode().catch(() => {}));
        }
    }
    await Promise.race([Promise.all(decoding), new Promise(done => setTimeout(done, 400))]);
    return { nodes, keep };
}

function replaceDocument(doc: Document, { nodes, keep }: Awaited<ReturnType<typeof prepare>>): void {
    document.title = doc.title;
    document.head.querySelectorAll(OWN).forEach(el => el.remove());
    document.head.append(...[...doc.head.querySelectorAll(OWN)].map(el => document.adoptNode(el)));
    attributes(doc.documentElement, document.documentElement, ['data-theme']);
    attributes(doc.body, document.body);
    for (const [fresh, old] of keep) fresh.replaceWith(old);
    document.body.replaceChildren(...nodes);
}

/** The direction a page comes in from: deeper, or the next part, is forward. */
function direction(from: string, to: URL, doc: Document): 'forward' | 'back' | undefined {
    const parts = doc.documentElement.dataset;
    if (from === parts.prev) return 'forward';
    if (from === parts.next) return 'back';
    const a = depth(from);
    const b = depth(to.pathname);
    return b > a ? 'forward' : b < a ? 'back' : undefined;
}

/** Changes the page with the soft, out-of-focus handover (motion.css), where the browser can. */
function softly(update: () => void, type?: string): Promise<void> {
    let done = false;
    const run = (): void => {
        if (done) return;
        done = true;
        update();
    };
    type Start = (arg: (() => void) | { update: () => void; types: string[] }) => { updateCallbackDone: Promise<void>; ready: Promise<void> };
    const start = (document as Document & { startViewTransition?: Start }).startViewTransition?.bind(document);
    if (!start || reduced.matches || document.visibilityState === 'hidden') {
        run();
        return Promise.resolve();
    }
    // If the browser never gets round to it, change anyway.
    setTimeout(run, 1000);
    const typed = typeof ViewTransition !== 'undefined' && 'types' in ViewTransition.prototype;
    const shift = start(typed ? { update: run, types: type ? [type] : [] } : run);
    // A quicker click cuts the handover short; that's expected, not an error.
    shift.ready.catch(() => {});
    return shift.updateCallbackDone.catch(() => {});
}

/** Where the reader lands: where they were, for Back and Forward; the part linked to; or the top. */
function land(url: URL, kind: Kind): void {
    if (kind === 'traverse') return scrollTo(0, scrolls[index] ?? 0);
    const target = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (target) target.scrollIntoView();
    else scrollTo(0, 0);
    // Keyboards and screen readers start at the new page's heading, not where the link was.
    const heading = document.querySelector<HTMLElement>('main h1, h1');
    if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
    }
}

export function startSite(mountFor: () => Mount): void {
    let unmount = mountFor()();
    let shown = new URL(location.href);
    let latest = 0;

    history.scrollRestoration = 'manual';
    const state = history.state as { index?: number } | null;
    if (typeof state?.index === 'number') index = state.index;
    else history.replaceState({ ...state, index }, '');
    // A reload, or coming back to the site from elsewhere, picks up where the reader was.
    if (scrolls[index]) requestAnimationFrame(() => scrollTo(0, scrolls[index]!));

    const remember = (): void => void (scrolls[index] = scrollY);
    addEventListener('scroll', remember, { passive: true });
    addEventListener('pagehide', () => {
        remember();
        try {
            sessionStorage.setItem(SCROLLS, JSON.stringify(scrolls));
        } catch {}
    });

    async function go(url: URL, kind: Kind, type?: 'forward' | 'back'): Promise<void> {
        const mine = ++latest;
        let loaded: Loaded;
        try {
            loaded = await load(url);
        } catch {
            if (mine === latest) location.assign(url);
            return;
        }
        if (mine !== latest) return;
        const doc = loaded.html ? new DOMParser().parseFromString(loaded.html, 'text/html') : null;
        if (!doc || scripts(doc) !== scripts(document)) return void (kind === 'traverse' ? location.reload() : location.assign(url));
        const [, body] = await Promise.all([styles(doc), prepare(doc)]);
        if (mine !== latest) return;

        // The page may have answered from a newer address (a renamed article).
        const at = new URL(loaded.url || url.href);
        at.hash = url.hash;
        const from = shown.pathname;
        if (kind === 'push') {
            remember();
            index += 1;
            history.pushState({ index }, '', at);
        } else if (kind === 'replace' || at.href !== location.href) history.replaceState({ ...history.state, index }, '', at);
        shown = at;

        await softly(() => {
            unmount();
            replaceDocument(doc, body);
            unmount = mountFor()();
            land(at, kind);
        }, type ?? direction(from, at, doc));
    }

    document.addEventListener('click', event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = (event.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href]');
        if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
        const url = new URL(link.href);
        if (!isSite(url)) return;
        // A part of this same page: the browser already does that.
        if (pathOf(url) === pathOf(location) && url.hash) return;
        event.preventDefault();
        void go(url, pathOf(url) === pathOf(location) ? 'replace' : 'push');
    });

    addEventListener('popstate', event => {
        const url = new URL(location.href);
        const to = (event.state as { index?: number } | null)?.index ?? 0;
        const type = to < index ? 'back' : 'forward';
        remember();
        index = to;
        // Only the part of the page changed: the browser scrolls there itself.
        if (pathOf(url) === pathOf(shown)) {
            shown = url;
            return;
        }
        if (!isSite(url)) return location.reload();
        void go(url, 'traverse', type);
    });

    // A pointer resting on a link, or a finger coming down on one, starts asking for the page.
    let resting = 0;
    const linkIn = (event: Event): URL | null => {
        const link = (event.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href]');
        if (!link || (link.target && link.target !== '_self')) return null;
        const url = new URL(link.href);
        return isSite(url) && pathOf(url) !== pathOf(location) ? url : null;
    };
    document.addEventListener('pointerover', event => {
        const url = linkIn(event);
        clearTimeout(resting);
        if (url) resting = window.setTimeout(() => warm(url), 80);
    });
    document.addEventListener('pointerdown', event => {
        const url = linkIn(event);
        if (url) warm(url);
    });
    document.addEventListener('focusin', event => {
        const url = linkIn(event);
        if (url) warm(url);
    });
}
