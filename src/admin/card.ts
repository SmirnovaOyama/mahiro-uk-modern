// Each article's link preview: a 1200 × 630 picture drawn when it is
// published, in the home page's own preview style. The article's title set
// large and light beside my avatar, its summary below, the blog's address and
// the sleeping pixel cat at the foot. Drawn on a canvas in the editor, so it
// uses the same system fonts (Chinese and Japanese included) as the site, and
// the Worker needs no image library at all.
import tokens from '../../design/tokens.json';
import { catMarkup } from '../cat.ts';

const W = 1200;
const H = 630;
const PAD = { top: 84, side: 96, bottom: 64 };

type ColorToken = { name: string; value: string | { light?: string } };

/** A colour from the design system, always its light-theme value: previews are shown on white. */
function light(name: string): string {
    const token = (tokens.color.tokens as ColorToken[]).find(t => t.name === name);
    const value = typeof token?.value === 'string' ? token.value : token?.value.light;
    if (!value) throw new Error(`No light colour for ${name}`);
    return value;
}

const families = tokens.type.families as Record<string, string>;

export interface CardText {
    title: string;
    summary: string;
}

/** Splits text into the pieces a line may break between: words, and single CJK characters. */
function pieces(text: string): string[] {
    const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter;
    if (Segmenter) return [...new Segmenter(undefined, { granularity: 'word' }).segment(text)].map(s => s.segment);
    return text.split(/(\s+)/);
}

/**
 * Lays text into at most `max` lines no wider than `width`. A piece too long
 * for any line is cut by character; text that doesn't fit ends in an ellipsis.
 */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number, firstIndent = 0): string[] {
    const lines: string[] = [];
    let line = '';
    const room = (): number => (lines.length === 0 ? width - firstIndent : width);
    const push = (): void => {
        lines.push(line.trimEnd());
        line = '';
    };
    for (const piece of pieces(text)) {
        if (!line && !piece.trim()) continue;
        if (ctx.measureText(line + piece).width <= room()) {
            line += piece;
            continue;
        }
        if (line) push();
        if (lines.length === max) break;
        let rest = piece.trimStart();
        // A single piece wider than a whole line: cut it where it overflows.
        while (ctx.measureText(rest).width > room()) {
            let cut = rest.length;
            while (cut > 1 && ctx.measureText(rest.slice(0, cut)).width > room()) cut--;
            line = rest.slice(0, cut);
            rest = rest.slice(cut);
            push();
            if (lines.length === max) break;
        }
        if (lines.length === max) break;
        line = rest;
    }
    if (line && lines.length < max) push();
    // Anything left over: the last line ends in an ellipsis.
    const shown = lines.join('');
    if (shown.replace(/\s/g, '').length < text.replace(/\s/g, '').length && lines.length) {
        let last = lines[lines.length - 1]!;
        while (last && ctx.measureText(`${last}…`).width > (lines.length === 1 ? width - firstIndent : width)) last = last.slice(0, -1);
        lines[lines.length - 1] = `${last.trimEnd()}…`;
    }
    return lines;
}

function loadImage(src: string): Promise<HTMLImageElement> {
    const img = new Image();
    img.src = src;
    return img.decode().then(() => img);
}

/** The curled-up cat, asleep, drawn pixel by pixel; only its resting frame, as in a photograph. */
function drawCat(ctx: CanvasRenderingContext2D, x: number, y: number, width: number): void {
    const markup = catMarkup({ pose: 'donut', state: 'napping', paint: light });
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`, 'image/svg+xml');
    const scale = width / 26;
    for (const rect of doc.querySelectorAll('rect')) {
        // The moving frames (an ear mid-twitch, a blink) would double up in a still picture.
        const layer = rect.parentElement?.getAttribute('class') ?? '';
        if (/twitch|flick|left|right|stretch|blink|chew|-b$/.test(layer)) continue;
        ctx.fillStyle = rect.getAttribute('fill') ?? 'transparent';
        ctx.fillRect(x + Number(rect.getAttribute('x')) * scale, y + Number(rect.getAttribute('y')) * scale, Math.ceil(scale), Math.ceil(scale));
    }
}

/** Draws the card and returns it as a PNG. */
export async function drawCard({ title, summary }: CardText): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser can’t draw the link preview.');
    const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string };

    ctx.fillStyle = light('bg');
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';
    const width = W - PAD.side * 2;

    // The title: large and light, my avatar opening its first line as on the home page.
    const titleSize = 60;
    const titleLead = Math.round(titleSize * 1.32);
    ctx.font = `300 ${titleSize}px ${families.display}`;
    spaced.letterSpacing = `${-0.02 * titleSize}px`;
    const avatar = Math.round(titleSize * 1.2);
    const indent = avatar + Math.round(titleSize * 0.3);
    const titleLines = wrap(ctx, title.trim() || 'Untitled', width, 3, indent);
    ctx.fillStyle = light('text');
    let baseline = PAD.top + titleSize;
    titleLines.forEach((line, i) => {
        ctx.fillText(line, PAD.side + (i === 0 ? indent : 0), baseline + i * titleLead);
    });

    try {
        const face = await loadImage('/avatar.jpg');
        const ax = PAD.side;
        const ay = baseline - titleSize * 0.82 - (avatar - titleSize * 0.82) / 2 + titleSize * 0.05;
        ctx.save();
        ctx.beginPath();
        ctx.arc(ax + avatar / 2, ay + avatar / 2, avatar / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(face, ax, ay, avatar, avatar);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(ax + avatar / 2, ay + avatar / 2, avatar / 2 - 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = light('border');
        ctx.lineWidth = 1;
        ctx.stroke();
    } catch {
        // Without the avatar the title still reads; the indent simply stays empty.
    }
    baseline += (titleLines.length - 1) * titleLead;

    // The summary, quieter, under the title.
    if (summary.trim()) {
        const size = 30;
        ctx.font = `300 ${size}px ${families.display}`;
        spaced.letterSpacing = `${-0.01 * size}px`;
        ctx.fillStyle = light('text-muted');
        wrap(ctx, summary.trim(), width, 2).forEach((line, i) => ctx.fillText(line, PAD.side, baseline + 36 + size + i * Math.round(size * 1.45)));
    }

    // The foot: where it lives, and the cat asleep in the corner.
    ctx.font = `500 26px ${families.sans}`;
    spaced.letterSpacing = '-0.26px';
    ctx.fillStyle = light('text-muted');
    ctx.fillText('mahiro.uk/writing', PAD.side, H - PAD.bottom - 4);
    drawCat(ctx, W - PAD.side - 156, H - PAD.bottom - 90, 156);

    const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, 'image/png'));
    if (!blob) throw new Error('The link preview couldn’t be made.');
    return blob;
}
