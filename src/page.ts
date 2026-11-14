// The reading pages: the Worker writes them whole, so all that's left is the
// theme switch and the right-click menu.
import './styles/tokens.css';
import './styles/site.css';
import './styles/writing.css';
import './styles/motion.css';

import { contextMenu, copy } from './menu.ts';
import { currentTheme, mountThemeButton } from './theme.ts';

const themeButton = document.getElementById('theme');
if (themeButton instanceof HTMLButtonElement) {
    mountThemeButton(themeButton, () => ({ toDark: 'Switch to the dark theme', toLight: 'Switch to the light theme' }));
}

const canonical = (): string => document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? location.href.split('#')[0]!;

/** The heading the reader is under, if they clicked inside a section. */
function sectionAt(target: Element, y: number): HTMLElement | null {
    const prose = target.closest('.prose');
    if (!prose) return null;
    const headings = [...prose.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id]')].filter(h => !h.closest('.footnotes'));
    return headings.filter(h => h.getBoundingClientRect().top <= y).at(-1) ?? null;
}

// Links, pictures, chosen words and the browser's own controls keep the browser's menu.
contextMenu(document, (target, event) => {
    if (target.closest('a, img, button, input, textarea, select, video, audio')) return null;
    const chosen = getSelection();
    if (chosen && !chosen.isCollapsed && chosen.toString().trim()) return null;

    const section = sectionAt(target, event.clientY);
    const prev = document.querySelector<HTMLAnchorElement>('.series-bar a[rel="prev"]');
    const next = document.querySelector<HTMLAnchorElement>('.series-bar a[rel="next"]');
    const atIndex = location.pathname.replace(/\/+$/, '') === '/writing';
    return [
        section && { label: 'Copy link to this section', run: () => copy(`${canonical()}#${section.id}`) },
        { label: 'Copy link', run: () => copy(canonical()) },
        'gap',
        prev && { label: 'Previous part', run: () => void (location.href = prev.href) },
        next && { label: 'Next part', run: () => void (location.href = next.href) },
        !atIndex && { label: 'Anya’s Blog', run: () => void (location.href = '/writing') },
        'gap',
        themeButton && { label: currentTheme() === 'dark' ? 'Light theme' : 'Dark theme', run: () => themeButton.click() },
    ];
});
