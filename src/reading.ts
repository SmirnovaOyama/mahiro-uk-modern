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
 * marked, and in the margin a hairline runs down the list, stepping in beside
 * each indented entry and back out, so it follows the list's own shape. A
 * short terracotta marker glides along that line in step with the scroll:
 * within a section it moves from that entry towards the next as the section is
 * read, so it is always as far down the list as the reader is through the
 * article, and a faint terracotta line fills the path behind it.
 *
 * A list longer than the screen follows as a whole: it slides through its own
 * length as the marker travels down it, so the marker starts at the top of
 * the part in view and ends at its bottom, and no entry has to be scrolled to.
 */
function followContents(): () => void {
    const list = document.querySelector<HTMLElement>('.toc-list');
    const links = [...document.querySelectorAll<HTMLAnchorElement>('.toc a[href^="#"]')];
    if (!list || !links.length) return () => {};
    const headings = links.map(a => document.getElementById(decodeURIComponent(a.hash.slice(1))));
    const prose = document.querySelector<HTMLElement>('.prose');

    const NS = 'http://www.w3.org/2000/svg';
    const rail = document.createElementNS(NS, 'svg');
    rail.setAttribute('class', 'toc-rail');
    rail.setAttribute('aria-hidden', 'true');
    const [track, fill, marker] = ['toc-track', 'toc-fill', 'toc-marker'].map(name => {
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('class', name);
        rail.append(path);
        return path;
    }) as [SVGPathElement, SVGPathElement, SVGPathElement];
    list.append(rail);

    // Motion blur: while the marker travels it smears along the line, by as much
    // as it moved, and comes back into focus as it settles. A blur only up and
    // down (the line runs that way), drawn over the whole rail's area so a thin
    // vertical stroke is never clipped away.
    const filter = document.createElementNS(NS, 'filter');
    filter.setAttribute('id', 'toc-motion');
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    const smear = document.createElementNS(NS, 'feGaussianBlur');
    smear.setAttribute('stdDeviation', '0 0');
    filter.append(smear);
    const defs = document.createElementNS(NS, 'defs');
    defs.append(filter);
    rail.prepend(defs);
    marker.setAttribute('filter', 'url(#toc-motion)');
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    let blur = 0;
    let lastStart: number | null = null;
    let fading = 0;
    const fade = (): void => {
        blur *= 0.8;
        if (blur < 0.05) blur = 0;
        smear.setAttribute('stdDeviation', `0 ${blur.toFixed(2)}`);
        fading = blur ? requestAnimationFrame(fade) : 0;
    };
    const moved = (start: number): void => {
        const delta = lastStart === null ? 0 : Math.abs(start - lastStart);
        lastStart = start;
        if (still.matches || delta < 0.5) return;
        blur = Math.min(7, blur + delta * 0.22);
        smear.setAttribute('stdDeviation', `0 ${blur.toFixed(2)}`);
        if (!fading) fading = requestAnimationFrame(fade);
    };

    /** How far in, in pixels, the line steps beside an indented entry. */
    const STEP = 16;

    let queued = false;
    /** A section just chosen from the list stays marked until the reader scrolls on their own. */
    let chosen: number | null = null;
    let chosenAt = 0;
    const show = (current: number): void =>
        links.forEach((a, i) => (i === current ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));

    /** Where an entry sits in the list, from the top of its whole length, however far that has slid. */
    const place = (a: HTMLAnchorElement): { top: number; height: number } => {
        const box = list.getBoundingClientRect();
        const r = a.getBoundingClientRect();
        return { top: r.top - box.top + list.scrollTop, height: r.height };
    };

    // The list's own slide. It eases towards where it should be rather than
    // snapping there, so a jump to a far section carries the list along with
    // the marker; its place is kept here as well, since a browser may round
    // away the last fraction of a pixel.
    let aim = 0;
    let at = 0;
    let sliding = 0;
    const slide = (): void => {
        at += (aim - at) * 0.2;
        if (Math.abs(aim - at) < 0.5) at = aim;
        list.scrollTop = at;
        sliding = at === aim ? 0 : requestAnimationFrame(slide);
    };
    const slideTo = (top: number): void => {
        aim = top;
        if (still.matches || !list.classList.contains('is-settled')) {
            cancelAnimationFrame(sliding);
            sliding = 0;
            list.scrollTop = at = aim;
        } else if (!sliding && Math.abs(aim - list.scrollTop) >= 0.5) {
            // Start from where it is: the reader may have scrolled the list to look ahead.
            at = list.scrollTop;
            sliding = requestAnimationFrame(slide);
        }
    };
    /** Entries cut off at an edge fade out there, by as much as lies beyond it, up to a line's worth. */
    const edges = (): void => {
        const above = list.scrollTop;
        const below = list.scrollHeight - list.clientHeight - above;
        list.style.setProperty('--cut-above', `${Math.max(0, Math.min(32, above)).toFixed(1)}px`);
        list.style.setProperty('--cut-below', `${Math.max(0, Math.min(32, below)).toFixed(1)}px`);
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
        // The line's path: down beside each entry, at that entry's depth, with a
        // short slant across the gap wherever the depth changes.
        const spots = links.map(a => ({ ...place(a), x: a.closest('.toc-h3') ? STEP : 0 }));
        const points: [number, number][] = spots.flatMap(e => [
            [e.x + 0.5, e.top],
            [e.x + 0.5, e.top + e.height],
        ]);
        const lengths = [0];
        for (let k = 1; k < points.length; k++) {
            const [ax, ay] = points[k - 1]!;
            const [bx, by] = points[k]!;
            lengths.push(lengths[k - 1]! + Math.hypot(bx - ax, by - ay));
        }
        const total = lengths.at(-1)!;
        /** The distance along the path to where it reaches height y. */
        const along = (y: number): number => {
            for (let k = 1; k < points.length; k++) {
                const [, ay] = points[k - 1]!;
                const [, by] = points[k]!;
                if (y <= by) return lengths[k - 1]! + (by > ay ? Math.max(0, (y - ay) / (by - ay)) : 0) * (lengths[k]! - lengths[k - 1]!);
            }
            return total;
        };
        const d = `M${points.map(([x, y]) => `${x} ${y}`).join(' L')}`;
        const first = spots[0]!;
        const last = spots.at(-1)!;
        const depth = Math.ceil(last.top + last.height);
        rail.setAttribute('width', String(STEP + 2));
        rail.setAttribute('height', String(depth));
        filter.setAttribute('x', '-20');
        filter.setAttribute('y', '-60');
        filter.setAttribute('width', String(STEP + 42));
        filter.setAttribute('height', String(depth + 120));
        for (const path of [track, fill, marker]) path.setAttribute('d', d);

        const here = spots[current]!;
        const next = spots[current + 1]?.top ?? here.top + here.height;
        const y = here.top + (next - here.top) * through;
        const start = along(y);
        const reach = Math.min(total, along(y + here.height)) - start;
        // The marker: just its own stretch of the path. The fill: everything up to its middle.
        moved(start);
        marker.style.strokeDasharray = `${reach} ${total + 1}`;
        marker.style.strokeDashoffset = `${-start}`;
        fill.style.strokeDasharray = `${start + reach / 2} ${total + 1}`;

        // The list has slid as far through its length as the marker is down it.
        const room = list.scrollHeight - list.clientHeight;
        const down = Math.min(1, Math.max(0, (y - first.top) / Math.max(1, last.top - first.top)));
        slideTo(room > 0 ? Math.round(down * room) : 0);
        edges();
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
    list.addEventListener('scroll', edges, { passive: true });
    return () => {
        links.forEach(a => a.removeEventListener('click', onClick));
        removeEventListener('scroll', onScroll);
        removeEventListener('resize', onScroll);
        list.removeEventListener('scroll', edges);
        cancelAnimationFrame(fading);
        cancelAnimationFrame(sliding);
        rail.remove();
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
