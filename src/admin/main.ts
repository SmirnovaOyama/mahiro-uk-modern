// The editor at /admin/: sign in, then a list on the left and the piece being
// written on the right. Routes live in the hash: #/articles/12, #/collections/3.
import '../styles/tokens.css';
import '../styles/site.css';
import '../styles/writing.css';
import '../styles/admin.css';
import '../styles/motion.css';

import { icon } from '../icons.ts';
import type { ArticleSummary, CollectionSummary } from '../shared/api.ts';
import { mountThemeButton } from '../theme.ts';
import { api, ApiFailure, onSignedOut } from './api.ts';
import { articleView, type View } from './article-view.ts';
import { collectionView } from './collection-view.ts';
import { contextMenu, copy, MOD, type MenuEntry } from '../menu.ts';
import { h, svg } from './dom.ts';

type Kind = 'articles' | 'collections';

const app = document.getElementById('app')!;
const labels = () => ({ toDark: 'Switch to the dark theme', toLight: 'Switch to the light theme' });
const home = () => h('a', { class: 'home', href: '/writing' }, h('img', { class: 'home-avatar', src: '/avatar.jpg', alt: '', width: 64, height: 64 }), 'Anya’s Blog');

// ── signing in

function signIn(configured: boolean): void {
    if (!configured) {
        app.replaceChildren(h('div', { class: 'signin-wrap' }, h('div', { class: 'signin' }, home(), h('p', { class: 'muted' }, 'ADMIN_PASSWORD is not set.'))));
        return;
    }
    const password = h('input', { class: 'password', type: 'password', autocomplete: 'current-password', placeholder: 'Password', 'aria-label': 'Password', required: true });
    const error = h('p', { class: 'save-error small', hidden: true, role: 'alert' });
    const form = h(
        'form',
        {
            class: 'signin',
            onsubmit: async (e: Event) => {
                e.preventDefault();
                error.hidden = true;
                try {
                    await api.signIn(password.value);
                    void start();
                } catch (err) {
                    error.textContent = err instanceof ApiFailure ? err.message : 'Couldn’t sign in.';
                    error.hidden = false;
                    password.select();
                }
            },
        },
        home(),
        password,
        error,
    );
    app.replaceChildren(h('div', { class: 'signin-wrap' }, form));
    password.focus();
}

// ── the desk

let articles: ArticleSummary[] = [];
let collections: CollectionSummary[] = [];
let current: { kind: Kind; id: number; view: View } | null = null;

const articleList = h('ul', { class: 'side-list' });
const collectionList = h('ul', { class: 'side-list' });
const work = h('section', { class: 'work' });
const themeButton = h('button', { class: 'btn-ghost btn-icon', type: 'button' });

const group = (label: string, list: HTMLElement, add: () => Promise<void>) =>
    h(
        'div',
        { class: 'side-group' },
        h(
            'div',
            { class: 'side-label' },
            h('span', null, label),
            h('button', { class: 'btn-ghost btn-icon', type: 'button', 'aria-label': `New ${label.toLowerCase().replace(/s$/, '')}`, onclick: () => void add() }, svg(icon('plus', 16))),
        ),
        list,
    );

async function newArticle(): Promise<void> {
    const a = await api.createArticle();
    articles = [a, ...articles];
    location.hash = `#/articles/${a.id}`;
}
async function newCollection(): Promise<void> {
    const c = await api.createCollection();
    collections = [...collections, c];
    location.hash = `#/collections/${c.id}`;
}

const shell = h(
    'div',
    { class: 'shell' },
    h(
        'aside',
        { class: 'side' },
        h('div', { class: 'side-head' }, home(), themeButton),
        h(
            'nav',
            { class: 'side-scroll' },
            group('Articles', articleList, newArticle),
            group('Collections', collectionList, newCollection),
        ),
        h(
            'footer',
            { class: 'side-foot' },
            h(
                'button',
                {
                    class: 'btn-ghost',
                    type: 'button',
                    onclick: async () => {
                        if (!(await leave())) return;
                        await api.signOut().catch(() => {});
                        location.hash = '';
                        signIn(true);
                    },
                },
                'Sign out',
            ),
        ),
    ),
    work,
);
mountThemeButton(themeButton, labels);

// ⌘\ puts the list away, leaving only the page; it stays that way until asked back.
const WIDE = 'editor-wide';
try {
    shell.classList.toggle('is-wide', localStorage.getItem(WIDE) === '1');
} catch {}
function toggleList(): void {
    const wide = shell.classList.toggle('is-wide');
    try {
        localStorage.setItem(WIDE, wide ? '1' : '0');
    } catch {}
}
document.addEventListener('keydown', e => {
    if (!(e.metaKey || e.ctrlKey) || e.key !== '\\') return;
    e.preventDefault();
    toggleList();
});

function paintList(): void {
    const item = (kind: Kind, id: number, title: string, draft: boolean) =>
        h(
            'li',
            null,
            h(
                'a',
                { class: `side-item${draft ? ' is-draft' : ''}`, href: `#/${kind}/${id}`, 'aria-current': current?.kind === kind && current.id === id ? 'page' : undefined },
                title || 'Untitled',
            ),
        );
    articleList.replaceChildren(...articles.map(a => item('articles', a.id, a.title, a.state === 'draft')));
    collectionList.replaceChildren(...collections.map(c => item('collections', c.id, c.title, false)));
}

/** Saves the open piece before leaving it. False if it couldn't be saved and the writer chose to stay. */
async function leave(): Promise<boolean> {
    if (!current) return true;
    try {
        await current.view.flush();
    } catch {
        if (!confirm('The last changes couldn’t be saved. Leave anyway?')) return false;
    }
    const { kind, id, view } = current;
    view.destroy();
    current = null;
    // A new article left blank is thrown away rather than kept as another "Untitled".
    if (kind === 'articles' && view.empty?.()) {
        articles = articles.filter(a => a.id !== id);
        paintList();
        await api.deleteArticle(id).catch(() => {});
    }
    return true;
}

// ── right-click

async function removeItem(kind: Kind, id: number, title: string): Promise<void> {
    const note = kind === 'articles' ? 'This can’t be undone.' : 'Its articles stay.';
    if (!confirm(`Delete “${title || 'Untitled'}”? ${note}`)) return;
    if (current?.kind === kind && current.id === id) {
        current.view.destroy();
        current = null;
        location.hash = '';
    }
    if (kind === 'articles') {
        await api.deleteArticle(id);
        articles = articles.filter(a => a.id !== id);
        collections = await api.collections();
    } else {
        await api.deleteCollection(id);
        collections = collections.filter(c => c.id !== id);
    }
    paintList();
}

function itemMenu(link: HTMLAnchorElement): MenuEntry[] | null {
    const m = /^#\/(articles|collections)\/(\d+)$/.exec(link.getAttribute('href') ?? '');
    if (!m) return null;
    const kind = m[1] as Kind;
    const id = Number(m[2]);
    const open = { label: 'Open', run: () => void (location.hash = `#/${kind}/${id}`) };
    if (kind === 'collections') {
        const c = collections.find(x => x.id === id);
        return c ? [open, 'gap', { label: 'Delete', danger: true, run: () => removeItem(kind, id, c.title) }] : null;
    }
    const a = articles.find(x => x.id === id);
    if (!a) return null;
    const href = a.state === 'published' && a.publishedSlug ? `${location.origin}/writing/${encodeURIComponent(a.publishedSlug)}` : null;
    return [
        open,
        { label: 'Preview', run: () => void window.open(`/admin/preview/${id}`, '_blank') },
        href && { label: 'Open on the site', run: () => void window.open(href, '_blank') },
        href && { label: 'Copy link', run: () => copy(href) },
        'gap',
        { label: 'Delete', danger: true, run: () => removeItem(kind, id, a.title) },
    ];
}

contextMenu(app, target => {
    const link = target.closest<HTMLAnchorElement>('a.side-item');
    if (link) return itemMenu(link);
    if (target.closest('.side')) {
        if (target.closest('a, button, input')) return null;
        return [
            { label: 'New article', run: () => newArticle() },
            { label: 'New collection', run: () => newCollection() },
            'gap',
            { label: 'Hide the list', keys: `${MOD}\\`, run: toggleList },
        ];
    }
    if (current && target.closest('.work')) {
        const own = current.view.menu?.(target);
        if (own !== undefined) return own;
        if (target.closest('a, button, input, textarea, select')) return null;
        return [{ label: shell.classList.contains('is-wide') ? 'Show the list' : 'Hide the list', keys: `${MOD}\\`, run: toggleList }];
    }
    return null;
});

/**
 * Changes what the right side shows, with the same soft, out-of-focus handover
 * as the reading pages where the browser can (see motion.css). Opening a piece
 * goes forward and closing it goes back, which on a phone slides between the
 * list and the page.
 */
function swap(change: () => void, type?: 'forward' | 'back', animate = true): void {
    let done = false;
    const update = (): void => {
        if (done) return;
        done = true;
        work.inert = false;
        change();
    };
    // If the browser never gets round to the change (a page with no frames to draw), make it anyway.
    setTimeout(update, 1000);
    type Start = (arg: (() => void) | { update: () => void; types: string[] }) => { ready: Promise<void> };
    const start = (document as Document & { startViewTransition?: Start }).startViewTransition?.bind(document);
    if (!animate || !start || matchMedia('(prefers-reduced-motion: reduce)').matches) return update();
    const typed = typeof ViewTransition !== 'undefined' && 'types' in ViewTransition.prototype;
    start(typed ? { update, types: type ? [type] : [] } : update).ready.catch(() => {});
}

let lastHash = '';
async function route(animate = true): Promise<void> {
    const m = /^#\/(articles|collections)\/(\d+)$/.exec(location.hash);
    const want = m ? { kind: m[1] as Kind, id: Number(m[2]) } : null;
    if (current && want && current.kind === want.kind && current.id === want.id) return;
    if (!(await leave())) {
        history.replaceState(null, '', lastHash || '#');
        return;
    }
    const wasOpen = shell.classList.contains('has-item');
    lastHash = location.hash;
    // What's left on screen while the next piece loads is only a picture of the last one.
    work.inert = true;
    if (!want) {
        swap(() => {
            shell.classList.remove('has-item');
            work.replaceChildren();
            paintList();
        }, 'back', animate);
        return;
    }

    const back = (): void => void (location.hash = '');
    try {
        const view =
            want.kind === 'articles'
                ? articleView(await api.article(want.id), {
                      changed: a => {
                          articles = [a, ...articles.filter(x => x.id !== a.id)];
                          paintList();
                      },
                      deleted: id => {
                          current = null;
                          articles = articles.filter(x => x.id !== id);
                          void api.collections().then(c => ((collections = c), paintList()));
                          back();
                      },
                      back,
                  })
                : collectionView(await api.collection(want.id), {
                      articles: () => articles,
                      changed: c => {
                          collections = collections.map(x => (x.id === c.id ? c : x));
                          paintList();
                      },
                      deleted: id => {
                          current = null;
                          collections = collections.filter(x => x.id !== id);
                          back();
                      },
                      back,
                      open: id => void (location.hash = `#/articles/${id}`),
                  });
        current = { ...want, view };
        swap(() => {
            shell.classList.add('has-item');
            work.replaceChildren(view.el);
            view.mounted?.();
            paintList();
        }, wasOpen ? undefined : 'forward', animate);
    } catch (e) {
        swap(() => {
            shell.classList.add('has-item');
            work.replaceChildren(h('p', { class: 'work-empty muted' }, e instanceof ApiFailure ? e.message : 'Couldn’t open that.'));
            paintList();
        }, undefined, animate);
    }
}

async function start(): Promise<void> {
    [articles, collections] = await Promise.all([api.articles(), api.collections()]);
    app.replaceChildren(shell);
    await route(false);
}

addEventListener('hashchange', () => void route());
addEventListener('beforeunload', e => {
    if (current?.view.dirty) {
        void current.view.flush().catch(() => {});
        e.preventDefault();
    }
});

onSignedOut(() => {
    current?.view.destroy();
    current = null;
    signIn(true);
});

void api
    .session()
    .then(s => (s.signedIn ? start() : signIn(s.configured)))
    .catch(() => app.replaceChildren(h('p', { class: 'work-empty muted' }, 'Can’t reach the server.')));
