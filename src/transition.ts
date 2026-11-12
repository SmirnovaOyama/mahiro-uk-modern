// How the sentence changes. Every letter is treated as a piece of type that
// keeps its identity: letters the old and new sentences share (found with a
// longest-common-subsequence match) glide from where they were to where they
// now belong; new letters soak in like ink spreading from where you tapped;
// letters that are going lift off the page and dissolve.
// 🏳️‍⚧️
//
// The real sentence is never taken apart. It is laid out once, in its final
// shape, and hidden while copies of its letters move in a layer above it,
// each copy placed exactly where a measurement of the real text says that
// letter sits. When they land, the layer goes and the real text is shown in
// the very same place, so the last frame and the still page are identical in
// every browser, line breaks included.

interface Piece {
    key: string;
    /** Relative to the layer's container. */
    x: number;
    y: number;
    w: number;
    h: number;
    /** A letter, or a copy of a picture. */
    ch?: string;
    color?: string;
    picture?: Element;
}

function measure(root: HTMLElement, origin: DOMRect): Piece[] {
    const pieces: Piece[] = [];
    const range = document.createRange();

    const walk = (node: Node): void => {
        for (const child of node.childNodes) {
            if (child instanceof Text) {
                const color = getComputedStyle(child.parentElement ?? root).color;
                let i = 0;
                for (const ch of child.data) {
                    if (ch.trim()) {
                        range.setStart(child, i);
                        range.setEnd(child, i + ch.length);
                        const r = range.getBoundingClientRect();
                        pieces.push({ key: ch, ch, color, x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
                    }
                    i += ch.length;
                }
            } else if (child instanceof HTMLImageElement || child instanceof SVGSVGElement) {
                // The cat, the GitHub mark, the envelope, the avatar and the app icon travel too.
                const r = child.getBoundingClientRect();
                pieces.push({
                    key: `pic:${child.getAttribute('class')}`,
                    picture: child.cloneNode(true) as Element,
                    x: r.left - origin.left,
                    y: r.top - origin.top,
                    w: r.width,
                    h: r.height,
                });
            } else if (child instanceof Element) {
                walk(child);
            }
        }
    };
    walk(root);
    return pieces;
}

/** Index pairs of a longest common subsequence of two key lists. */
function commonPieces(a: string[], b: string[]): [number, number][] {
    const n = a.length;
    const m = b.length;
    const w = m + 1;
    const dp = new Uint16Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1]! + 1 : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!);
        }
    }
    const pairs: [number, number][] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) pairs.push([i++, j++]);
        else if (dp[(i + 1) * w + j]! >= dp[i * w + j + 1]!) i++;
        else j++;
    }
    return pairs;
}

/** A positioned copy of one piece in the moving layer. */
function copyOf(piece: Piece, layer: HTMLElement): HTMLElement | SVGElement {
    let el: HTMLElement | SVGElement;
    if (piece.picture) {
        el = piece.picture.cloneNode(true) as HTMLElement | SVGElement;
        el.style.width = `${piece.w}px`;
        el.style.height = `${piece.h}px`;
        el.style.margin = '0';
    } else {
        el = document.createElement('span');
        el.textContent = piece.ch ?? '';
        el.style.color = piece.color ?? '';
    }
    el.style.position = 'absolute';
    el.style.left = `${piece.x}px`;
    el.style.top = `${piece.y}px`;
    layer.append(el);
    return el;
}

/**
 * Nudges each letter copy until its glyph sits exactly on the real one.
 * Characters drawn from a fallback font (寻寻 in PingFang) have different
 * heights from the main font, so placing by box alone leaves them a pixel or
 * two off; measuring the copy's own glyph and correcting removes any guess.
 */
function calibrate(copies: [HTMLElement | SVGElement, Piece][], host: HTMLElement): void {
    const origin = host.getBoundingClientRect();
    const range = document.createRange();
    const fixes = copies.map(([el, piece]) => {
        if (piece.picture || !el.firstChild) return null;
        range.selectNodeContents(el);
        const r = range.getBoundingClientRect();
        return [el, piece.x + (piece.x - (r.left - origin.left)), piece.y + (piece.y - (r.top - origin.top))] as const;
    });
    for (const fix of fixes) {
        if (!fix) continue;
        fix[0].style.left = `${fix[1]}px`;
        fix[0].style.top = `${fix[2]}px`;
    }
}

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const wobble = (size: number): number => (Math.random() * 2 - 1) * size;
let finishRunning: (() => void) | null = null;

/**
 * Redraws `text` with `redraw`, animating letter by letter from the old
 * sentence to the new one. `from` is where the change starts (the word that
 * was tapped); without one it spreads from the middle of the sentence.
 */
export function transition(text: HTMLElement, redraw: () => void, from: DOMRect | null = null): void {
    finishRunning?.();
    if (reduceMotion.matches) {
        redraw();
        return;
    }

    const host = text.parentElement!;
    const origin = host.getBoundingClientRect();
    const before = measure(text, origin);
    redraw();
    const after = measure(text, origin);

    const layer = document.createElement('div');
    layer.className = 'type-layer';
    layer.setAttribute('aria-hidden', 'true');
    const font = getComputedStyle(text);
    Object.assign(layer.style, {
        fontFamily: font.fontFamily,
        fontSize: font.fontSize,
        fontWeight: font.fontWeight,
        fontStyle: font.fontStyle,
    });
    host.append(layer);
    text.classList.add('is-moving');

    const start = from ?? text.getBoundingClientRect();
    const ox = start.left + start.width / 2 - origin.left;
    const oy = start.top + start.height / 2 - origin.top;
    const accent = font.getPropertyValue('--accent-ink').trim();
    let longest = 0;
    const copies: [HTMLElement | SVGElement, Piece][] = [];
    const queued: [Element, Keyframe[], KeyframeAnimationOptions][] = [];
    const place = (piece: Piece): HTMLElement | SVGElement => {
        const el = copyOf(piece, layer);
        copies.push([el, piece]);
        return el;
    };
    const play = (el: Element, frames: Keyframe[], options: KeyframeAnimationOptions): void => {
        queued.push([el, frames, options]);
        longest = Math.max(longest, Number(options.delay ?? 0) + Number(options.duration ?? 0));
    };
    const distance = (p: Piece): number => Math.hypot(p.x + p.w / 2 - ox, p.y + p.h / 2 - oy);

    const pairs = commonPieces(
        before.map(p => p.key),
        after.map(p => p.key),
    );
    const keptOld = new Set(pairs.map(([i]) => i));
    const keptNew = new Set(pairs.map(([, j]) => j));

    // Letters that stay: they travel, the far ones in a low arc, like a hand moving type.
    for (const [i, j] of pairs) {
        const was = before[i]!;
        const now = after[j]!;
        const el = place(now);
        const dx = was.x - now.x;
        const dy = was.y - now.y;
        const far = Math.hypot(dx, dy);
        if (far < 0.5) continue;
        const lift = Math.min(36, far * 0.18);
        play(
            el,
            [
                { transform: `translate(${dx}px, ${dy}px)` },
                { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) rotate(${wobble(6)}deg)`, offset: 0.5 },
                { transform: 'none' },
            ],
            {
                duration: 560 + Math.min(far, 500) * 0.7,
                delay: Math.min(j * 1.2, 140),
                easing: 'cubic-bezier(0.3, 0, 0, 1)',
                fill: 'both',
            },
        );
    }

    // Letters that go: they lift off the page and blur away.
    before.forEach((piece, i) => {
        if (keptOld.has(i)) return;
        play(
            place(piece),
            [
                { opacity: 1 },
                {
                    opacity: 0,
                    filter: 'blur(4px)',
                    transform: `translate(${wobble(8)}px, ${-10 - Math.random() * 14}px) rotate(${wobble(24)}deg)`,
                },
            ],
            {
                duration: 460,
                delay: Math.min(distance(piece) * 0.35, 280),
                easing: 'cubic-bezier(0.4, 0, 1, 1)',
                fill: 'both',
            },
        );
    });

    // Letters that arrive: they soak in from where you tapped, in terracotta, and dry to ink.
    after.forEach((piece, j) => {
        if (keptNew.has(j)) return;
        const frames: Keyframe[] = [
            { opacity: 0, filter: 'blur(7px)', transform: 'translateY(0.35em) scale(0.8)' },
            // The blur and the movement are over early, so the long tail is only the colour drying.
            { opacity: 1, filter: 'none', transform: 'none', offset: 0.35 },
            { opacity: 1, filter: 'none', transform: 'none' },
        ];
        // Letters dry from terracotta to their own ink; pictures keep their colours.
        if (piece.ch) {
            frames[0]!.color = accent;
            frames[1]!.color = accent;
            frames[2]!.color = piece.color ?? '';
        }
        play(place(piece), frames, {
            duration: 1100,
            delay: 140 + Math.min(distance(piece) * 0.75, 700),
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'both',
        });
    });

    // Everything is placed while still: snap each copy onto its letter, then set them moving.
    calibrate(copies, host);
    for (const [el, frames, options] of queued) el.animate(frames, options);

    const finish = (): void => {
        window.clearTimeout(timer);
        layer.remove();
        // The real text appears exactly under the last frame. Its underlines start
        // hidden and fade in a moment later, so nothing pops.
        text.classList.add('is-settling');
        text.classList.remove('is-moving');
        void text.offsetWidth;
        window.setTimeout(() => text.classList.remove('is-settling'), 40);
        finishRunning = null;
    };
    const timer = window.setTimeout(finish, longest + 40);
    finishRunning = finish;
}
