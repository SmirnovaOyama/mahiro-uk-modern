// The reading pages: the Worker writes them whole, so all that's left is the
// theme switch, the right-click menu, the contents and, on phones, the folded
// places to go.
import './styles/writing.css';

import { contextMenu, copy } from './menu.ts';
import { foldNav } from './nav.ts';
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
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    // Motion blur: while the marker travels it smears along the line by as much
    // as it moved in that frame, and comes back into focus as it settles. The
    // blur runs only up and down (the way the line runs), and its region is
    // drawn around the marker alone. The rail is never much taller than the
    // screen, so it stays well inside WebKit's filter texture limit.
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
    let blur = 0;
    let fading = 0;
    let lastMid: number | null = null;

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

    /** Entries cut off at an edge fade out there, by as much as lies beyond it, up to a line's worth. */
    const edges = (): void => {
        const above = list.scrollTop;
        const below = list.scrollHeight - list.clientHeight - above;
        list.style.setProperty('--cut-above', `${Math.max(0, Math.min(32, above)).toFixed(1)}px`);
        list.style.setProperty('--cut-below', `${Math.max(0, Math.min(32, below)).toFixed(1)}px`);
    };

    // The rail's geometry and the marker's glide along it. Both the marker and
    // the fill are drawn as their own sliced sub-paths (plain <path d="...">
    // segments, with no SVG filter and no dashoffset), so a long contents list
    // never hits WebKit's filter texture or dash cap past ~2000px. While the
    // marker travels, its leading end eases slightly faster than its trailing
    // end, stretching along the path in motion and settling back as it lands.
    let points: [number, number][] = [];
    let lengths: number[] = [0];
    let total = 0;
    let depth = 0;
    let aimStart = 0;
    let aimEnd = 0;
    let curStart = 0;
    let curEnd = 0;
    let gliding = 0;

    /** The distance along the path to where it reaches height y. */
    const along = (y: number): number => {
        for (let k = 1; k < points.length; k++) {
            const [, ay] = points[k - 1]!;
            const [, by] = points[k]!;
            if (y <= by) return lengths[k - 1]! + (by > ay ? Math.max(0, (y - ay) / (by - ay)) : 0) * (lengths[k]! - lengths[k - 1]!);
        }
        return total;
    };

    const pointAt = (dist: number): [number, number] => {
        if (dist <= 0 || !points.length) return points[0] ?? [1, 0];
        for (let k = 1; k < points.length; k++) {
            const d0 = lengths[k - 1]!;
            const d1 = lengths[k]!;
            if (dist <= d1) {
                const [ax, ay] = points[k - 1]!;
                const [bx, by] = points[k]!;
                const t = d1 > d0 ? (dist - d0) / (d1 - d0) : 0;
                return [ax + (bx - ax) * t, ay + (by - ay) * t];
            }
        }
        return points.at(-1)!;
    };

    const slicePath = (from: number, to: number): string => {
        if (!points.length || to <= from) return '';
        const a = Math.max(0, Math.min(total, from));
        const b = Math.max(a, Math.min(total, to));
        const sub: [number, number][] = [pointAt(a)];
        for (let k = 1; k < points.length - 1; k++) {
            const d = lengths[k]!;
            if (d > a && d < b) sub.push(points[k]!);
        }
        sub.push(pointAt(b));
        return `M${sub.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L')}`;
    };

    const paint = (): void => {
        if (!depth) return;
        const bleed = 64;
        const viewTop = Math.max(0, Math.floor(list.scrollTop - bleed));
        const viewHeight = Math.max(1, Math.min(depth - viewTop, Math.ceil((list.clientHeight || 520) + bleed * 2)));
        const topEdge = along(viewTop);
        const botEdge = along(viewTop + viewHeight);
        const mid = (curStart + curEnd) / 2;
        rail.style.top = `${viewTop}px`;
        rail.setAttribute('width', String(STEP + 3));
        rail.setAttribute('height', String(viewHeight));
        rail.setAttribute('viewBox', `0 ${viewTop} ${STEP + 3} ${viewHeight}`);
        track.setAttribute('d', slicePath(topEdge, botEdge));
        fill.setAttribute('d', slicePath(topEdge, Math.min(mid, botEdge)));
        marker.setAttribute('d', slicePath(curStart, curEnd));
        focus(mid);
    };

    /** Smears the marker by how far it moved since the last frame, then lets it come back into focus. */
    const focus = (mid: number): void => {
        const moved = lastMid === null ? 0 : Math.abs(mid - lastMid);
        lastMid = mid;
        if (!still.matches && moved >= 0.5) blur = Math.min(6, Math.max(blur, moved * 0.45));
        if (!blur) return;
        const [, y0] = pointAt(curStart);
        const [, y1] = pointAt(curEnd);
        filter.setAttribute('x', '-20');
        filter.setAttribute('y', String(Math.floor(Math.min(y0, y1) - 40)));
        filter.setAttribute('width', String(STEP + 44));
        filter.setAttribute('height', String(Math.ceil(Math.abs(y1 - y0) + 80)));
        smear.setAttribute('stdDeviation', `0 ${blur.toFixed(2)}`);
        marker.setAttribute('filter', 'url(#toc-motion)');
        if (!fading) fading = requestAnimationFrame(fade);
    };
    const fade = (): void => {
        fading = 0;
        blur *= 0.78;
        if (blur < 0.1) {
            blur = 0;
            marker.removeAttribute('filter');
            return;
        }
        smear.setAttribute('stdDeviation', `0 ${blur.toFixed(2)}`);
        fading = requestAnimationFrame(fade);
    };

    /** Entries cut off at an edge fade out there, by as much as lies beyond it, up to a line's worth. */
    const onListScroll = (): void => {
        edges();
        paint();
    };

    const glide = (): void => {
        const down = aimStart >= curStart;
        curStart += (aimStart - curStart) * (down ? 0.22 : 0.34);
        curEnd += (aimEnd - curEnd) * (down ? 0.34 : 0.22);
        if (Math.abs(aimStart - curStart) < 0.25) curStart = aimStart;
        if (Math.abs(aimEnd - curEnd) < 0.25) curEnd = aimEnd;
        paint();
        gliding = curStart === aimStart && curEnd === aimEnd ? 0 : requestAnimationFrame(glide);
    };

    const moveMarker = (start: number, end: number): void => {
        aimStart = start;
        aimEnd = end;
        if (still.matches || !list.classList.contains('is-settled')) {
            cancelAnimationFrame(gliding);
            gliding = 0;
            curStart = aimStart;
            curEnd = aimEnd;
            paint();
        } else if (!gliding && (Math.abs(aimStart - curStart) >= 0.25 || Math.abs(aimEnd - curEnd) >= 0.25)) {
            gliding = requestAnimationFrame(glide);
        } else if (!gliding) {
            curStart = aimStart;
            curEnd = aimEnd;
            paint();
        }
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
        edges();
        paint();
        sliding = at === aim ? 0 : requestAnimationFrame(slide);
    };
    const slideTo = (top: number): void => {
        aim = top;
        if (still.matches || !list.classList.contains('is-settled')) {
            cancelAnimationFrame(sliding);
            sliding = 0;
            list.scrollTop = at = aim;
            paint();
        } else if (!sliding && Math.abs(aim - list.scrollTop) >= 0.5) {
            // Start from where it is: the reader may have scrolled the list to look ahead.
            at = list.scrollTop;
            sliding = requestAnimationFrame(slide);
        }
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
        // short slant across the gap wherever the depth changes. Collinear points
        // at the same depth collapse into a single segment.
        const spots = links.map(a => ({ ...place(a), x: a.closest('.toc-h3') ? STEP : 0 }));
        const rawPoints: [number, number][] = spots.flatMap(e => [
            [e.x + 1, e.top],
            [e.x + 1, e.top + e.height],
        ]);
        points = rawPoints.filter(
            (p, i) => i === 0 || i === rawPoints.length - 1 || p[0] !== rawPoints[i - 1]![0] || p[0] !== rawPoints[i + 1]![0],
        );
        lengths = [0];
        for (let k = 1; k < points.length; k++) {
            const [ax, ay] = points[k - 1]!;
            const [bx, by] = points[k]!;
            lengths.push(lengths[k - 1]! + Math.hypot(bx - ax, by - ay));
        }
        total = lengths.at(-1)!;
        const first = spots[0]!;
        const last = spots.at(-1)!;
        depth = Math.ceil(last.top + last.height);

        const here = spots[current]!;
        const after = spots[current + 1] ?? here;
        const y = here.top + (after.top - here.top) * through;
        const h = here.height + (after.height - here.height) * through;
        const start = along(y);
        const reach = Math.max(4, Math.min(total, along(y + h)) - start);

        // The list has slid as far through its length as the marker is down it,
        // keeping the marker clear of the faded top and bottom edges while sliding.
        const room = list.scrollHeight - list.clientHeight;
        const safe = Math.min(64, list.clientHeight / 4);
        const startY = Math.max(first.top, safe);
        const endY = Math.min(last.top, list.scrollHeight - last.height - safe);
        const span = endY > startY ? (y - startY) / (endY - startY) : (y - first.top) / Math.max(1, last.top - first.top);
        const down = Math.min(1, Math.max(0, span));
        slideTo(room > 0 ? Math.round(down * room) : 0);
        moveMarker(start, start + reach);
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
    document.addEventListener('toggle', onScroll, { capture: true, passive: true });
    list.addEventListener('scroll', onListScroll, { passive: true });
    return () => {
        links.forEach(a => a.removeEventListener('click', onClick));
        removeEventListener('scroll', onScroll);
        removeEventListener('resize', onScroll);
        document.removeEventListener('toggle', onScroll, { capture: true });
        list.removeEventListener('scroll', onListScroll);
        cancelAnimationFrame(gliding);
        cancelAnimationFrame(sliding);
        cancelAnimationFrame(fading);
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

        const diagram = target.closest<HTMLElement>('.prose .mermaid-diagram');
        const code = target.closest('.prose pre')?.querySelector(':scope > code');
        const source = diagram?.dataset.mermaidSource ?? code?.textContent;
        const copyLabel = diagram || code?.classList.contains('language-mermaid') ? 'Copy Mermaid source' : 'Copy code';
        const y = event.clientX || event.clientY ? event.clientY : target.getBoundingClientRect().top;
        const section = sectionAt(target, y);
        const prev = document.querySelector<HTMLAnchorElement>('.series-bar a[rel="prev"]');
        const next = document.querySelector<HTMLAnchorElement>('.series-bar a[rel="next"]');
        const blog = document.querySelector<HTMLAnchorElement>('.reading-top a.home');
        const atIndex = location.pathname.replace(/\/+$/, '') === '/writing';
        return [
            source && { label: copyLabel, run: () => copy(source) },
            'gap',
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

    const diagrams = document.querySelectorAll<HTMLElement>('.prose pre > code.language-mermaid');
    if (diagrams.length) {
        void import('./mermaid.ts').then(({ renderDiagrams }) => renderDiagrams(diagrams)).catch(() => {
            // The source is still readable if the diagram module fails to load.
        });
    }

    const unContents = followContents();
    const unNav = foldNav();

    return () => {
        unNav();
        unMenu();
        unTheme();
        unContents();
    };
}
