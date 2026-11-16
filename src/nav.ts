// The places to go, folded on a phone. Four links, the theme switch and the
// blog's name don't fit one narrow line, so there the links fold away behind
// the name of the part of the site being read ("‹ Writing"). Opened, they
// spring out of it leftwards, nearest first, across the whole line while the
// name and the theme switch step aside; the chevron at the end folds them back
// into where they came from. Wider screens, and readers without scripts, get
// the plain row of links as ever.
import { icon } from './icons.ts';

const NARROW = '(max-width: 420px)';

/** The part of the site a page belongs to, for the folded label. */
function sectionOf(links: HTMLAnchorElement[]): string {
    const path = location.pathname;
    const current = links.find(a => a.hasAttribute('aria-current'));
    if (current) return current.textContent ?? '';
    if (/^\/(writing|collections)(\/|$)/.test(path)) return 'Writing';
    return links.find(a => a.pathname !== '/' && path.startsWith(a.pathname))?.textContent ?? 'Menu';
}

export function foldNav(): () => void {
    const top = document.querySelector<HTMLElement>('.reading-top');
    const nav = top?.querySelector<HTMLElement>('.reading-nav');
    const list = document.getElementById('nav-links');
    if (!top || !nav || !list) return () => {};
    const links = [...list.querySelectorAll<HTMLAnchorElement>('a')];
    const narrow = matchMedia(NARROW);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn-ghost nav-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', list.id);
    toggle.innerHTML = `${icon('chevronLeft', 16)}<span class="nav-toggle-label"></span>`;
    toggle.querySelector('.nav-toggle-label')!.textContent = sectionOf(links);
    toggle.setAttribute('aria-label', `Pages (${sectionOf(links)})`);

    const fold = document.createElement('button');
    fold.type = 'button';
    fold.className = 'btn-ghost btn-icon nav-fold';
    fold.setAttribute('aria-label', 'Fold the pages away');
    fold.innerHTML = icon('chevronRight', 18);

    nav.insertBefore(toggle, list.nextSibling);
    list.append(fold);
    top.classList.add('can-fold');

    const open = (): boolean => top.classList.contains('is-open');

    /** Where each piece starts from when it springs out: the folded label's middle. */
    const measure = (): void => {
        const from = toggle.getBoundingClientRect();
        const box = list.getBoundingClientRect();
        const pieces = [...list.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el.offsetParent !== null);
        const middle = from.left + from.width / 2;
        pieces.forEach((el, i) => {
            const centre = box.left + el.offsetLeft + el.offsetWidth / 2;
            // Moved into its folded place at once, not slid there, so the opening starts from it.
            el.style.transition = 'none';
            el.style.setProperty('--from', `${(middle - centre).toFixed(1)}px`);
            // The nearest comes out first; each further one a beat later.
            el.style.setProperty('--delay', `${(pieces.length - 1 - i) * 28}ms`);
        });
        void list.offsetWidth;
        pieces.forEach(el => getComputedStyle(el).transform);
        pieces.forEach(el => (el.style.transition = ''));
    };

    const set = (opening: boolean, focus = false): void => {
        if (opening === open()) return;
        if (opening) measure();
        top.classList.toggle('is-open', opening);
        toggle.setAttribute('aria-expanded', String(opening));
        list.inert = narrow.matches && !opening;
        if (!focus) return;
        if (opening) list.querySelector<HTMLElement>('a:not([aria-current="page"])')?.focus({ preventScroll: true });
        else toggle.focus({ preventScroll: true });
    };

    const onToggle = (): void => set(true, true);
    const onFold = (): void => set(false, true);
    const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape' && open()) {
            e.preventDefault();
            set(false, true);
        }
    };
    const onDown = (e: PointerEvent): void => {
        if (open() && !list.contains(e.target as Node)) set(false);
    };
    const onWidth = (): void => {
        set(false);
        list.inert = narrow.matches;
    };

    list.inert = narrow.matches;
    toggle.addEventListener('click', onToggle);
    fold.addEventListener('click', onFold);
    addEventListener('keydown', onKey);
    addEventListener('pointerdown', onDown, true);
    narrow.addEventListener('change', onWidth);
    return () => {
        toggle.removeEventListener('click', onToggle);
        fold.removeEventListener('click', onFold);
        removeEventListener('keydown', onKey);
        removeEventListener('pointerdown', onDown, true);
        narrow.removeEventListener('change', onWidth);
    };
}
