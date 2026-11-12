import './styles/tokens.css';
import './styles/cat.css';
import './styles/site.css';

import config from './config.ts';
import { catStateForHour, drawCat } from './cat.ts';
import { doodle } from './doodle.ts';
import { copy, locale } from './i18n.ts';
import { githubMark, icon } from './icons.ts';
import { formatHour, hourNowAt } from './time.ts';
import { transition } from './transition.ts';
import type { Theme } from './types.ts';

const $ = <T extends Element = HTMLElement>(id: string): T => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`#${id} is missing from the page`);
    return el as unknown as T;
};

const SVG = 'http://www.w3.org/2000/svg';
const TOKEN = /\{([>$@])(\w+)(?:\|([^}]*))?\}/g;

interface Link {
    href: string;
    display: string;
    /** A picture shown just before the link's words. */
    icon?: () => Node;
}

/**
 * One element per picture, kept for the life of the page and moved back in on
 * every redraw. A new <img> each time would have to be decoded again, and
 * phones show it blank (white) until it is.
 */
const pictures = new Map<string, HTMLImageElement>();
function picture(src: string, className: string, size: number): HTMLImageElement {
    let img = pictures.get(src);
    if (!img) {
        img = document.createElement('img');
        img.className = className;
        img.src = src;
        // Words beside each picture say what it is, so the picture itself says nothing.
        img.alt = '';
        img.width = size;
        img.height = size;
        img.decoding = 'sync';
        pictures.set(src, img);
    }
    return img;
}

const appIcon = (src: string) => (): Node => picture(src, 'app-icon', 48);

// Load and decode both pictures as soon as the page opens, so neither is ever
// shown, or copied for the animation, before its pixels are ready.
for (const [src, className, size] of [['avatar.jpg', 'avatar', 128], ['icons/hrt.png', 'app-icon', 48]] as const) {
    picture(src, className, size).decode().catch(() => {});
}

const markIcon = (): Node => {
    const holder = document.createElement('span');
    holder.innerHTML = githubMark('mark-inline');
    return holder.firstElementChild!;
};

const mailIcon = (): Node => {
    const holder = document.createElement('span');
    holder.innerHTML = doodle('mail', 'doodle-inline');
    return holder.firstElementChild!;
};

const links: Record<string, Link> = {
    ...Object.fromEntries(config.projects.map(p => [p.key, { href: p.href, display: p.href }])),
    github: { href: config.github, display: 'GitHub', icon: markIcon },
    mahiro: { href: config.mahiro, display: 'Oyama Mahiro' },
    email: { href: `mailto:${config.email}`, display: config.email, icon: mailIcon },
};
// The tracker's own app icon, copied from its repository (public/apple-touch-icon.png).
links.hrt!.icon = appIcon('icons/hrt.png');

// ── live values: my clock and the cat ──────────────────────────────────

function liveValues(): Record<string, string> {
    const hour = hourNowAt(config.utcOffsetHours);
    const shifted = new Date(Date.now() + config.utcOffsetHours * 3_600_000);
    return {
        time: formatHour(hour),
        day: new Intl.DateTimeFormat(locale(), { weekday: 'long', timeZone: 'UTC' }).format(shifted),
        state: copy().states[catStateForHour(Math.floor(hour))] ?? '',
    };
}

const catState = () => catStateForHour(Math.floor(hourNowAt(config.utcOffsetHours)));

/** Refreshes the clock and the cat in place, without refolding anything. */
function tick(): void {
    const values = liveValues();
    text.querySelectorAll<HTMLElement>('[data-var]').forEach(el => {
        el.textContent = values[el.dataset.var!] ?? '';
    });
    text.querySelectorAll<SVGSVGElement>('svg.cat-inline').forEach(svg => drawCat(svg, { pose: 'donut', state: catState() }));
}

// ── the unfolding sentence ─────────────────────────────────────────────

const text = $('text');
const open = new Set<string>();

function append(template: string, into: Element, values: Record<string, string>): void {
    let last = 0;
    for (const m of template.matchAll(TOKEN)) {
        if (m.index > last) into.append(template.slice(last, m.index));
        last = m.index + m[0].length;
        const [, kind, name = '', label] = m;

        if (kind === '>') {
            const node = copy().nodes[name];
            if (!node) continue;
            if (open.has(name)) {
                const span = document.createElement('span');
                span.className = 'unfolded';
                span.dataset.node = name;
                span.tabIndex = -1;
                append(node.body, span, values);
                into.append(span);
            } else {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'fold';
                button.setAttribute('aria-expanded', 'false');
                button.textContent = node.label;
                button.addEventListener('click', () => unfold(name, button));
                into.append(button);
            }
        } else if (kind === '$') {
            if (name === 'avatar') {
                into.append(picture('avatar.jpg', 'avatar', 128));
            } else if (name === 'catpic') {
                const svg = document.createElementNS(SVG, 'svg');
                svg.classList.add('cat-inline');
                drawCat(svg, { pose: 'donut', state: catState() });
                into.append(svg);
            } else {
                const span = document.createElement('span');
                span.dataset.var = name;
                span.textContent = values[name] ?? '';
                into.append(span);
            }
        } else {
            const link = links[name];
            if (!link) continue;
            const a = document.createElement('a');
            a.className = link.icon ? 'link has-icon' : 'link';
            a.href = link.href;
            if (!link.href.startsWith('mailto:')) a.rel = 'noopener';
            if (link.icon) a.append(link.icon());
            a.append(label ?? link.display);
            into.append(a);
        }
    }
    if (last < template.length) into.append(template.slice(last));
}

const allNodes = (): string[] => Object.keys(copy().nodes);
const isDone = (): boolean => open.size === allNodes().length;

/**
 * Keeps punctuation that follows a link on the link's line. A link with an
 * icon never wraps, and Safari will then happily push a lone full stop onto
 * the next line. The punctuation may belong to an enclosing phrase
 * ("on GitHub" + ":"), so it is found by walking out of the phrases the link
 * closes, moved in beside the link, and the two are held together.
 */
function gluePunctuation(root: HTMLElement): void {
    root.querySelectorAll<HTMLAnchorElement>('a.link').forEach(a => {
        let edge: Node = a;
        while (!edge.nextSibling && edge.parentNode && edge.parentNode !== root) edge = edge.parentNode;
        const next = edge.nextSibling;
        if (!(next instanceof Text)) return;
        const tail = /^[.,;:!?)]+/.exec(next.data)?.[0];
        if (!tail) return;
        next.data = next.data.slice(tail.length);
        const keep = document.createElement('span');
        keep.className = 'nobr';
        a.replaceWith(keep);
        keep.append(a, tail);
    });
}

function render(): void {
    text.replaceChildren();
    append(copy().root, text, liveValues());
    gluePunctuation(text);

    // The bar stays put: one hint, one button, each changing its words in place.
    const ui = copy().ui;
    const done = isDone();
    $('hint-icon').innerHTML = doodle(done ? 'heart' : 'tap');
    $('hint').textContent = done ? ui.done : ui.hint;
}

function unfold(name: string, from: HTMLElement): void {
    const origin = from.getBoundingClientRect();
    open.add(name);
    transition(text, render, origin);
    // Keep the reader's place: the next thing to open, or the phrase that just did.
    const span = text.querySelector<HTMLElement>(`[data-node="${name}"]`);
    (span?.querySelector<HTMLElement>('button.fold') ?? span)?.focus({ preventScroll: true });
}

/** Opens every phrase at once. No button calls it any more; the development checks still do. */
function unfoldAll(): void {
    const origin = text.querySelector('button.fold')?.getBoundingClientRect() ?? null;
    allNodes().forEach(n => open.add(n));
    transition(text, render, origin);
}

// ── a gentle word before leaving the site ─────────────────────────────

const leave = $('leave');
const leaveGo = $<HTMLAnchorElement>('leave-go');
let leftFrom: HTMLAnchorElement | null = null;

/** Sites of mine (any part of the email's domain) get a warmer note than the rest of the web. */
const ownDomain = config.email.split('@')[1] ?? '';

function closeLeave(returnFocus = true): void {
    if (leave.hidden) return;
    leave.hidden = true;
    if (returnFocus) leftFrom?.focus({ preventScroll: true });
    leftFrom = null;
}

function openLeave(link: HTMLAnchorElement): void {
    const ui = copy().ui;
    const host = new URL(link.href).host;
    const mine = ownDomain !== '' && (host === ownDomain || host.endsWith(`.${ownDomain}`));
    $('leave-text').textContent = (mine ? ui.leaveMine : ui.leaveOut).replace('{host}', host).replace('{domain}', ownDomain);
    leaveGo.href = link.href;
    leaveGo.textContent = ui.go;
    $('leave-stay').textContent = ui.stay;
    leftFrom = link;
    leave.style.width = '';
    leave.hidden = false;

    // Wrapped text leaves the box at its widest; pull it in to the longest line actually set.
    const words = document.createRange();
    words.selectNodeContents($('leave-text'));
    const lines = [...words.getClientRects()];
    // The buttons' own width, never squeezed: the row is laid out at its natural size.
    const actions = leave.querySelector<HTMLElement>('.leave-actions')!.getBoundingClientRect().width;
    const text = Math.max(...lines.map(l => l.right)) - Math.min(...lines.map(l => l.left));
    const inner = Math.max(actions, text);
    const style = getComputedStyle(leave);
    const frame = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
        .map(k => parseFloat(style[k as 'paddingLeft']))
        .reduce((a, b) => a + b, 0);
    leave.style.width = `${Math.ceil(inner + frame)}px`;

    // Just under the link, kept on screen; above it if there is no room below.
    const r = link.getBoundingClientRect();
    const box = leave.getBoundingClientRect();
    const gap = 10;
    const left = Math.min(Math.max(16, r.left), innerWidth - box.width - 16);
    const below = r.bottom + gap;
    const top = below + box.height > innerHeight - 16 ? r.top - gap - box.height : below;
    leave.style.left = `${left}px`;
    leave.style.top = `${Math.max(16, top)}px`;
    leaveGo.focus({ preventScroll: true });
}

document.addEventListener('click', event => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (link && link !== leaveGo && /^https?:/.test(link.href) && new URL(link.href).host !== location.host) {
        // A deliberate new-tab click already knows where it is going.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        openLeave(link);
        return;
    }
    if (!leave.hidden && !leave.contains(event.target as Node)) closeLeave(false);
});
leaveGo.addEventListener('click', () => closeLeave(false));
$('leave-stay').addEventListener('click', () => closeLeave());
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeLeave();
});
addEventListener('scroll', () => closeLeave(false), { passive: true });
addEventListener('resize', () => closeLeave(false));

// ── theme ──────────────────────────────────────────────────────────────

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const currentTheme = (): Theme => {
    const set = document.documentElement.dataset.theme;
    return set === 'light' || set === 'dark' ? set : darkQuery.matches ? 'dark' : 'light';
};

function renderChrome(): void {
    const ui = copy().ui;
    const theme = currentTheme();
    const themeButton = $<HTMLButtonElement>('theme');
    themeButton.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon', 18);
    themeButton.setAttribute('aria-label', theme === 'dark' ? ui.toLight : ui.toDark);

    document.querySelector('meta[name="description"]')?.setAttribute('content', ui.description);
}

$('theme').addEventListener('click', () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
        localStorage.setItem('site-theme', next);
    } catch {
        // The choice then lasts for this visit only.
    }
    renderChrome();
});
darkQuery.addEventListener('change', renderChrome);

const gh = $<HTMLAnchorElement>('gh');
gh.href = config.github;
gh.innerHTML = githubMark('', 18);

renderChrome();
render();
window.setInterval(tick, 20_000);

// In development only: `await awkward()` in the console checks every folded state at
// several widths, and every animation's last frame, for awkward moments.
if (import.meta.env.DEV) {
    void import('./dev/awkward.ts').then(({ check }) => {
        const unfoldNamed = (name: string): void => {
            const button = [...text.querySelectorAll<HTMLButtonElement>('button.fold')].find(b => b.textContent === copy().nodes[name]?.label);
            if (button) button.click();
        };
        Object.assign(window, {
            awkward: () =>
                check({
                    text,
                    open,
                    nodes: allNodes,
                    parentOf: name =>
                        Object.entries(copy().nodes).find(([, node]) => node.body.includes(`{>${name}}`))?.[0],
                    render, unfold: unfoldNamed, unfoldAll }),
        });
    });
}
