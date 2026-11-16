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
 * Marks, in the contents list, the section being read: the last heading that
 * has scrolled up past the top of the screen (or the first, before any has).
 */
function followContents(): () => void {
    const links = [...document.querySelectorAll<HTMLAnchorElement>('.toc a[href^="#"]')];
    if (!links.length) return () => {};
    const headings = links.map(a => document.getElementById(decodeURIComponent(a.hash.slice(1))));
    let queued = false;
    /** A section just chosen from the list stays marked until the reader scrolls on their own. */
    let chosen: number | null = null;
    let chosenAt = 0;
    const show = (current: number): void =>
        links.forEach((a, i) => (i === current ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    const mark = (): void => {
        queued = false;
        if (chosen !== null) return show(chosen);
        // The reading line: a third of the way down, never above the header's edge.
        const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 96;
        const line = Math.max(padding + 8, innerHeight / 3);
        let current = 0;
        headings.forEach((h, i) => {
            if (h && h.getBoundingClientRect().top <= line) current = i;
        });
        // At the very bottom, the last section is the one being read, however short it is.
        if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) current = links.length - 1;
        show(current);
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
        show(i);
    };
    links.forEach(a => a.addEventListener('click', onClick));
    mark();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    return () => {
        links.forEach(a => a.removeEventListener('click', onClick));
        removeEventListener('scroll', onScroll);
        removeEventListener('resize', onScroll);
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
