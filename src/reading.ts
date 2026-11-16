// The reading pages: the Worker writes them whole, so all that's left is the
// theme switch and the right-click menu.
import './styles/writing.css';

import { contextMenu, copy } from './menu.ts';
import { currentTheme, mountThemeButton } from './theme.ts';

const canonical = (): string => document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? location.href.split('#')[0]!;

/** The heading the reader is under, if they clicked inside a section. */
function sectionAt(target: Element, y: number): HTMLElement | null {
    const prose = target.closest('.prose');
    if (!prose) return null;
    const headings = [...prose.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id]')].filter(h => !h.closest('.footnotes'));
    return headings.filter(h => h.getBoundingClientRect().top <= y).at(-1) ?? null;
}

/**
 * Follows the reader through the contents list. The section being read is
 * marked, and in the margin a thin terracotta marker glides down the list in
 * step with the scroll: within a section it moves from that entry towards the
 * next as the section is read, so it is always exactly as far down the list as
 * the reader is through the article. A faint line behind it fills to match.
 */
function followContents(): () => void {
    const list = document.querySelector<HTMLElement>('.toc-list');
    const links = [...document.querySelectorAll<HTMLAnchorElement>('.toc a[href^="#"]')];
    if (!list || !links.length) return () => {};
    const headings = links.map(a => document.getElementById(decodeURIComponent(a.hash.slice(1))));
    const prose = document.querySelector<HTMLElement>('.prose');

    const track = document.createElement('span');
    track.className = 'toc-track';
    const fill = document.createElement('span');
    fill.className = 'toc-fill';
    const marker = document.createElement('span');
    marker.className = 'toc-marker';
    for (const el of [track, fill, marker]) el.setAttribute('aria-hidden', 'true');
    list.append(track, fill, marker);

    let queued = false;
    /** A section just chosen from the list stays marked until the reader scrolls on their own. */
    let chosen: number | null = null;
    let chosenAt = 0;
    const show = (current: number): void =>
        links.forEach((a, i) => (i === current ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));

    /** Where an entry sits in the list, from the list's own top. */
    const place = (a: HTMLAnchorElement): { top: number; height: number } => {
        const box = list.getBoundingClientRect();
        const r = a.getBoundingClientRect();
        return { top: r.top - box.top, height: r.height };
    };

    const mark = (): void => {
        queued = false;
        // The reading line: a third of the way down, never above the header's edge.
        const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 96;
        const line = Math.max(padding + 8, innerHeight / 3);
        const tops = headings.map(h => (h ? h.getBoundingClientRect().top : Number.POSITIVE_INFINITY));
        let current = 0;
        tops.forEach((top, i) => {
            if (top <= line) current = i;
        });
        // How far through that section the reading line is, from 0 at its heading to 1 at the next.
        const end = tops[current + 1] ?? prose?.getBoundingClientRect().bottom ?? tops[current]! + 1;
        let through = Math.min(1, Math.max(0, (line - tops[current]!) / Math.max(1, end - tops[current]!)));
        // At the very bottom, the last section is the one being read, however short it is.
        if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) {
            current = links.length - 1;
            through = 1;
        }
        if (chosen !== null) {
            current = chosen;
            through = 0;
        }
        show(current);

        // The marker and the line behind it only live in the margin, where the list stays in view.
        const inMargin = list.closest('.toc') !== null && getComputedStyle(list).position === 'sticky';
        list.classList.toggle('is-following', inMargin);
        if (!inMargin) return;
        const here = place(links[current]!);
        const next = links[current + 1] ? place(links[current + 1]!).top : here.top + here.height;
        const y = here.top + (next - here.top) * through;
        const first = place(links[0]!).top;
        const last = place(links.at(-1)!);
        marker.style.transform = `translateY(${y}px)`;
        marker.style.height = `${here.height}px`;
        track.style.top = `${first}px`;
        track.style.height = `${last.top + last.height - first}px`;
        fill.style.top = `${first}px`;
        fill.style.height = `${Math.max(0, y + here.height / 2 - first)}px`;
    };
    const onScroll = (): void => {
        // The jump a click starts, smooth or not, is over within a second; after that, scrolling is the reader's.
        if (chosen !== null && performance.now() - chosenAt > 1000) chosen = null;
        if (queued) return;
        queued = true;
        requestAnimationFrame(mark);
    };
    const onClick = (event: Event): void => {
        const i = links.indexOf(event.currentTarget as HTMLAnchorElement);
        if (i < 0) return;
        chosen = i;
        chosenAt = performance.now();
        mark();
    };
    links.forEach(a => a.addEventListener('click', onClick));
    mark();
    // Placed before the first frame is shown, it then glides rather than sweeping in from the top.
    requestAnimationFrame(() => list.classList.add('is-settled'));
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    return () => {
        links.forEach(a => a.removeEventListener('click', onClick));
        removeEventListener('scroll', onScroll);
        removeEventListener('resize', onScroll);
        track.remove();
        fill.remove();
        marker.remove();
    };
}

/** Sets a reading page up; returns how to take it down. */
export function mountReading(): () => void {
    const themeButton = document.getElementById('theme');
    const unTheme =
        themeButton instanceof HTMLButtonElement
            ? mountThemeButton(themeButton, () => ({ toDark: 'Switch to the dark theme', toLight: 'Switch to the light theme' }))
            : () => {};

    // Links, pictures, chosen words and the browser's own controls keep the browser's menu.
    // Going somewhere clicks the page's own link, so it changes in place like any other.
    const unMenu = contextMenu(document, (target, event) => {
        if (target.closest('a, img, button, input, textarea, select, video, audio')) return null;
        const chosen = getSelection();
        if (chosen && !chosen.isCollapsed && chosen.toString().trim()) return null;

        const section = sectionAt(target, event.clientY);
        const prev = document.querySelector<HTMLAnchorElement>('.series-bar a[rel="prev"]');
        const next = document.querySelector<HTMLAnchorElement>('.series-bar a[rel="next"]');
        const blog = document.querySelector<HTMLAnchorElement>('.reading-top a.home');
        const atIndex = location.pathname.replace(/\/+$/, '') === '/writing';
        return [
            section && { label: 'Copy link to this section', run: () => copy(`${canonical()}#${section.id}`) },
            { label: 'Copy link', run: () => copy(canonical()) },
            'gap',
            prev && { label: 'Previous part', run: () => prev.click() },
            next && { label: 'Next part', run: () => next.click() },
            !atIndex && blog && { label: 'Anya’s Blog', run: () => blog.click() },
            'gap',
            themeButton && { label: currentTheme() === 'dark' ? 'Light theme' : 'Dark theme', run: () => themeButton.click() },
        ];
    });

    const unContents = followContents();

    return () => {
        unMenu();
        unTheme();
        unContents();
    };
}
