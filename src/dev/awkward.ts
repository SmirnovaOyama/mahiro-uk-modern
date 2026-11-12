// Development-only checks for awkward moments: things that look wrong for a
// frame or on some screen width, which are easy to miss by eye. Loaded only
// by `npm run dev`; run `await awkward()` in the browser console.

export interface SiteApi {
    text: HTMLElement;
    open: Set<string>;
    nodes: () => string[];
    /** The phrase a phrase sits inside, if any. */
    parentOf: (name: string) => string | undefined;
    render: () => void;
    unfold: (name: string) => void;
    unfoldAll: () => void;
}

type Problem = { check: string; detail: string };

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const LONE_START = /^[.,;:!?)\]]/;

/** Rects of every visible letter in `root`, line by line. */
function letters(root: Element): { ch: string; x: number; y: number }[] {
    const out: { ch: string; x: number; y: number }[] = [];
    const range = document.createRange();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const t = walker.currentNode as Text;
        let i = 0;
        for (const ch of t.data) {
            if (ch.trim()) {
                range.setStart(t, i);
                range.setEnd(t, i + ch.length);
                const r = range.getBoundingClientRect();
                out.push({ ch, x: r.left, y: r.top });
            }
            i += ch.length;
        }
    }
    return out;
}

/** The text of each laid-out line. */
function lines(root: Element): string[] {
    const ls = letters(root);
    const rows: string[] = [];
    let lastY = Number.NaN;
    for (const l of ls) {
        if (Math.abs(l.y - lastY) > 4) rows.push('');
        rows[rows.length - 1] += l.ch;
        lastY = l.y;
    }
    return rows;
}

function checkStill(api: SiteApi, where: string, problems: Problem[]): void {
    const { text } = api;
    // A line that opens with punctuation is a stranded full stop or comma.
    for (const row of lines(text)) if (LONE_START.test(row)) problems.push({ check: 'stranded punctuation', detail: `${where}: line starts "${row.slice(0, 20)}"` });
    // Punctuation that only reads right in some folded states.
    const copy = text.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('img, svg').forEach(pic => pic.replaceWith('◇'));
    const prose = copy.textContent ?? '';
    const bad = /[;,:]\s*[;,.:]|\s[,.;:)]|\(\s|\s{2,}\S/.exec(prose.replace(/^\s+/, ''));
    if (bad) problems.push({ check: 'punctuation', detail: `${where}: "…${prose.slice(Math.max(0, bad.index - 15), bad.index + 15)}…"` });
    // Nothing may push the page sideways.
    if (document.documentElement.scrollWidth > innerWidth + 1) problems.push({ check: 'sideways scroll', detail: `${where}: page is ${document.documentElement.scrollWidth}px in a ${innerWidth}px window` });
    // A one-letter word left at the end of a line ("… and I") reads as a stumble.
    for (const row of lines(text)) if (/\s(I|a)$/.test(row.trimEnd())) problems.push({ check: 'one-letter word at line end', detail: `${where}: "…${row.slice(-20)}"` });
    // A dotted phrase is one thing to tap; split over two lines it reads as two.
    text.querySelectorAll('button.fold').forEach(b => {
        const rects = [...b.getClientRects()].filter(r => r.width > 0);
        if (rects.length > 1) problems.push({ check: 'dotted phrase split', detail: `${where}: ${b.textContent}` });
    });
    // A link's icon must never sit at the end of a line, away from its words.
    text.querySelectorAll('a.link').forEach(a => {
        const rects = [...a.getClientRects()].filter(r => r.width > 0);
        if (rects.length > 1 && a.querySelector('img, svg')) problems.push({ check: 'icon split from link', detail: `${where}: ${a.textContent}` });
    });
}

/** Lets a transition run to its last frame and compares that frame with the page it settles into. */
async function checkLanding(api: SiteApi, act: () => void, where: string, problems: Problem[]): Promise<void> {
    act();
    const layer = document.querySelector('.type-layer');
    if (!layer) return;
    // The cat's own looping animations never end; only the letters' movements are finished.
    layer.getAnimations({ subtree: true }).forEach(a => {
        if (Number.isFinite(Number(a.effect?.getComputedTiming().endTime))) a.finish();
    });
    const shown = letters(layer).filter((_, i, all) => {
        const el = [...layer.querySelectorAll('span')][i];
        return !el || Number(getComputedStyle(el).opacity) > 0.5 ? true : all.length < 0;
    });
    const real = letters(api.text);
    let worst = 0;
    let worstCh = '';
    for (const r of real) {
        let best = Number.POSITIVE_INFINITY;
        for (const s of shown) if (s.ch === r.ch) best = Math.min(best, Math.hypot(s.x - r.x, s.y - r.y));
        if (best > worst) {
            worst = best;
            worstCh = r.ch;
        }
    }
    if (worst > 0.75) problems.push({ check: 'jump on landing', detail: `${where}: "${worstCh}" lands ${worst.toFixed(2)}px from where it then sits` });
    for (let t = 0; t < 40 && (document.querySelector('.type-layer') || api.text.classList.contains('is-settling')); t++) await wait(100);
    if (document.querySelector('.type-layer')) problems.push({ check: 'leftover layer', detail: where });
    if (api.text.classList.contains('is-moving') || api.text.classList.contains('is-settling')) problems.push({ check: 'text left hidden', detail: where });
}

export async function check(api: SiteApi, widths = [320, 375, 414, 768, 1024, 1440]): Promise<Problem[]> {
    const problems: Problem[] = [];
    const { open, nodes, render } = api;
    const saved = new Set(open);
    const main = api.text.parentElement!;

    for (const w of widths) {
        main.style.maxWidth = `${w}px`;
        main.style.marginInline = '0';

        // Every combination of open phrases, laid out still.
        const all = nodes();
        for (let mask = 0; mask < 1 << all.length; mask++) {
            const chosen = all.filter((_, i) => mask & (1 << i));
            if (chosen.some(n => {
                const parent = api.parentOf(n);
                return parent !== undefined && !chosen.includes(parent);
            })) continue;
            open.clear();
            chosen.forEach(n => open.add(n));
            render();
            checkStill(api, `${w}px, open: ${[...open].join(' ') || 'nothing'}`, problems);
        }

        // Each phrase opened in turn, then everything at once, with the animation's last frame compared.
        open.clear();
        render();
        for (const n of all) await checkLanding(api, () => api.unfold(n), `${w}px, unfolding ${n}`, problems);
        open.clear();
        render();
        await checkLanding(api, () => api.unfoldAll(), `${w}px, unfolding everything`, problems);
    }

    main.style.maxWidth = '';
    main.style.marginInline = '';
    open.clear();
    saved.forEach(n => open.add(n));
    render();

    // Keep only one line per distinct problem so the report stays readable.
    const seen = new Set<string>();
    return problems.filter(p => {
        const k = p.check + p.detail.replace(/^\d+px, /, '');
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}
