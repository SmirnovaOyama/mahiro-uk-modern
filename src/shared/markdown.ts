// Markdown to HTML, used by the Worker when it publishes and previews.
//
// Raw HTML inside the markdown is passed through: the only author is the site's
// owner, signed in, and it is the escape hatch for anything markdown can't say.
//
// Beyond GitHub's markdown:
//   footnotes[^1]               with [^1]: the note, anywhere below
//   "quotes" -- and ...         become “quotes” – and …
//   ![alt](src "A caption")     on a line of its own becomes a figure with that caption
//   headings                    get an id and a quiet # to link to them by
//   $e^{i\pi} + 1 = 0$          LaTeX, set by KaTeX, inline;
//   $$ … $$, \[ … \] or ```math  and on a line of its own, centred
//   :::info[Title]{open} … :::  and > [!INFO] Title callouts, quiet or unfolding
import katex from 'katex';
import { Marked, type TokenizerThis, type Tokens } from 'marked';
import markedFootnote from 'marked-footnote';
import markedKatex from 'marked-katex-extension';
import { markedSmartypants } from 'marked-smartypants';
import { icon, type IconName } from '../icons.ts';
import { slugify } from './slug.ts';

export { hasHan, slugify, SLUG, SLUG_MAX } from './slug.ts';

export const escapeHtml = (s: string): string =>
    s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface RenderOptions {
    /**
     * How math is written out. 'html' (the default) is KaTeX's own typesetting
     * with MathML beside it for screen readers, and needs katex.css; 'mathml'
     * needs nothing, for places like feed readers that bring no styles.
     */
    math?: 'html' | 'mathml';
}

/** Whether rendered HTML holds any math, so the page knows to bring the math styles. */
export const hasMath = (html: string): boolean => html.includes('class="katex');

const sameLineDisplayMath = /^ {0,3}\$\$(?!\$)[ \t]*([^\n]+?)\$\$(?!\$)[ \t]*(?:\n|$)/;
const bracketDisplayMath = /^ {0,3}\\\[([\s\S]+?)\\\][ \t]*(?:\n|$)/;
const inlineMathStart = /\\\(|\$(?![\s$])(?:\\.|[^\\$\n])+\$(?=[)\]}!?;:–—-])/;

export const MATH_DELIMITERS_MARKER = '<!-- math-delimiters-v2 -->';

export function needsMathRefresh(body: string, html: string): boolean {
    return !html.startsWith(MATH_DELIMITERS_MARKER)
        && (/^ {0,3}(?:\$\$.+\$\$[ \t]*$|\\\[)/m.test(body) || inlineMathStart.test(body));
}

const isExternal = (href: string): boolean => /^https?:\/\//i.test(href);

type Parser = {
    parser: {
        parse(t: Tokens.Generic[]): string;
        parseInline(t: Tokens.Generic[]): string;
    };
};

type CalloutTone = 'info' | 'note' | 'tip' | 'important' | 'warning' | 'danger' | 'success' | 'question' | 'quote';
type CalloutFold = 'open' | 'closed' | null;

interface CalloutToken extends Tokens.Generic {
    type: 'callout';
    raw: string;
    kind: string;
    fold: CalloutFold;
    titleTokens: Tokens.Generic[];
    tokens: Tokens.Generic[];
}

const CALLOUTS: Record<string, { tone: CalloutTone; label: string; glyph: IconName }> = {
    info: { tone: 'info', label: 'Info', glyph: 'info' },
    todo: { tone: 'info', label: 'To do', glyph: 'info' },
    note: { tone: 'note', label: 'Note', glyph: 'info' },
    callout: { tone: 'note', label: 'Note', glyph: 'info' },
    abstract: { tone: 'note', label: 'Summary', glyph: 'info' },
    summary: { tone: 'note', label: 'Summary', glyph: 'info' },
    tldr: { tone: 'note', label: 'Summary', glyph: 'info' },
    details: { tone: 'note', label: 'Details', glyph: 'info' },
    tip: { tone: 'tip', label: 'Tip', glyph: 'lightbulb' },
    hint: { tone: 'tip', label: 'Hint', glyph: 'lightbulb' },
    important: { tone: 'important', label: 'Important', glyph: 'circleAlert' },
    success: { tone: 'success', label: 'Success', glyph: 'circleCheck' },
    check: { tone: 'success', label: 'Check', glyph: 'circleCheck' },
    done: { tone: 'success', label: 'Done', glyph: 'circleCheck' },
    question: { tone: 'question', label: 'Question', glyph: 'circleHelp' },
    help: { tone: 'question', label: 'Help', glyph: 'circleHelp' },
    faq: { tone: 'question', label: 'FAQ', glyph: 'circleHelp' },
    example: { tone: 'question', label: 'Example', glyph: 'info' },
    warning: { tone: 'warning', label: 'Warning', glyph: 'triangleAlert' },
    warn: { tone: 'warning', label: 'Warning', glyph: 'triangleAlert' },
    caution: { tone: 'warning', label: 'Caution', glyph: 'triangleAlert' },
    attention: { tone: 'warning', label: 'Attention', glyph: 'triangleAlert' },
    danger: { tone: 'danger', label: 'Danger', glyph: 'circleAlert' },
    error: { tone: 'danger', label: 'Error', glyph: 'circleAlert' },
    bug: { tone: 'danger', label: 'Bug', glyph: 'circleAlert' },
    failure: { tone: 'danger', label: 'Failure', glyph: 'circleAlert' },
    fail: { tone: 'danger', label: 'Failure', glyph: 'circleAlert' },
    quote: { tone: 'quote', label: 'Quote', glyph: 'info' },
    cite: { tone: 'quote', label: 'Quote', glyph: 'info' },
};

/** Parses `[Title]{open}`, `{open}[Title]`, `Title {collapsed}`, or plain `Title` after `:::kind`. */
function parseDirectiveHead(kind: string, rawRest: string): { title: string; fold: CalloutFold } {
    let rest = rawRest.trim();
    const attrs: string[] = [];
    const trail = /^(.*?)\s*\{([^{}]*)\}\s*$/.exec(rest);
    if (trail) {
        rest = trail[1]!.trim();
        attrs.push(trail[2]!);
    }
    const lead = /^\s*\{([^{}]*)\}\s*(.*)$/.exec(rest);
    if (lead) {
        rest = lead[2]!.trim();
        attrs.push(lead[1]!);
    }
    const title = rest.startsWith('[') && rest.endsWith(']') ? rest.slice(1, -1).trim() : rest;
    const flags = attrs
        .join(' ')
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(Boolean);
    let fold: CalloutFold = null;
    if (flags.some(f => f === 'closed' || f === 'collapse' || f === 'collapsed' || f === 'open=false' || f === 'fold')) {
        fold = 'closed';
    } else if (flags.some(f => f === 'open' || f === 'open=true' || f === 'collapsible')) {
        fold = 'open';
    } else if (kind === 'details') {
        fold = 'closed';
    }
    return { title, fold };
}

function renderCallout(kind: string, fold: CalloutFold, titleHtml: string, bodyHtml: string): string {
    const spec = CALLOUTS[kind] ?? {
        tone: 'note' as const,
        label: kind.charAt(0).toUpperCase() + kind.slice(1),
        glyph: 'info' as const,
    };
    const label = titleHtml || escapeHtml(spec.label);
    const glyph = `<span class="callout-icon">${icon(spec.glyph, 16)}</span>`;
    const body = bodyHtml.trim() ? `<div class="callout-body">\n${bodyHtml}</div>` : '';
    if (fold) {
        const chev = icon('chevronDown', 16).replace('<svg ', '<svg class="callout-chev" ');
        const openAttr = fold === 'open' ? ' open' : '';
        return `<details class="callout callout-${spec.tone}"${openAttr}><summary class="callout-head">${glyph}<span class="callout-title">${label}${chev}</span></summary>${body}</details>\n`;
    }
    return `<aside class="callout callout-${spec.tone}"><p class="callout-head">${glyph}<span class="callout-title">${label}</span></p>${body}</aside>\n`;
}

const img = (token: Tokens.Image): string =>
    `<img src="${escapeHtml(token.href)}" alt="${escapeHtml(token.text)}" loading="lazy" decoding="async">`;

export function renderMarkdown(markdown: string, { math = 'html' }: RenderOptions = {}): string {
    const ids = new Map<string, number>();
    const katexOptions = {
        output: math === 'html' ? ('htmlAndMathml' as const) : ('mathml' as const),
        // A mistake in the TeX shows the source in red, rather than losing the article.
        throwOnError: false,
        errorColor: 'var(--danger)',
        // Never \href to javascript:, \includegraphics or the like.
        trust: false,
        strict: 'ignore' as const,
    };
    const marked = new Marked({ gfm: true });
    marked.use(markedSmartypants({ config: 2 }), markedFootnote({ description: 'Notes', refMarkers: false }), markedKatex({ ...katexOptions, nonStandard: false }));
    marked.use({
        extensions: [
            {
                name: 'displayMath',
                level: 'block',
                start(src: string): number | undefined {
                    return src.match(/^ {0,3}(?:\$\$|\\\[)/m)?.index;
                },
                tokenizer(src: string): Tokens.Generic | undefined {
                    const match = sameLineDisplayMath.exec(src) ?? bracketDisplayMath.exec(src);
                    if (!match?.[1]?.trim()) return undefined;
                    return { type: 'displayMath', raw: match[0], text: match[1].trim() };
                },
                renderer(token: Tokens.Generic): string {
                    return `<div class="math-display">${katex.renderToString(token.text, { ...katexOptions, displayMode: true })}</div>\n`;
                },
            },
            {
                name: 'delimitedInlineMath',
                level: 'inline',
                start(src: string): number | undefined {
                    return src.match(inlineMathStart)?.index;
                },
                tokenizer(src: string): Tokens.Generic | undefined {
                    const match = /^\\\(((?:\\[^)]|[^\\\n])+?)\\\)/.exec(src)
                        ?? /^\$(?![\s$])((?:\\.|[^\\$\n])+?)\$(?=[)\]}!?;:–—-])/.exec(src);
                    if (!match?.[1]?.trim()) return undefined;
                    return { type: 'delimitedInlineMath', raw: match[0], text: match[1].trim() };
                },
                renderer(token: Tokens.Generic): string {
                    return katex.renderToString(token.text, katexOptions);
                },
            },
            {
                name: 'callout',
                level: 'block',
                start(src: string): number | undefined {
                    return src.match(/^ {0,3}:{3,}[ \t]*[a-zA-Z]/m)?.index;
                },
                tokenizer(this: TokenizerThis, src: string): CalloutToken | undefined {
                    const open = /^ {0,3}(:{3,})[ \t]*([a-zA-Z][\w-]*)(?:[ \t]*([^\n]*))?(?:\n|$)/.exec(src);
                    if (!open) return undefined;
                    const fence = open[1]!;
                    const kind = open[2]!.toLowerCase();
                    const { title, fold } = parseDirectiveHead(kind, open[3] ?? '');
                    const lines = src.slice(open[0].length).split('\n');
                    let codeFence = '';
                    let depth = 0;
                    let endLine = -1;
                    let consumed = open[0].length;
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i]!;
                        const step = i < lines.length - 1 ? line.length + 1 : line.length;
                        const codeMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
                        if (codeMatch) {
                            const mark = codeMatch[1]!;
                            if (!codeFence) codeFence = mark;
                            else if (
                                mark[0] === codeFence[0] &&
                                mark.length >= codeFence.length &&
                                /^ {0,3}(`{3,}|~{3,})[ \t]*$/.test(line)
                            ) {
                                codeFence = '';
                            }
                        } else if (!codeFence) {
                            const closeMatch = /^ {0,3}(:{3,})[ \t]*$/.exec(line);
                            if (closeMatch) {
                                if (depth === 0 && closeMatch[1]!.length >= fence.length) {
                                    endLine = i;
                                    consumed += step;
                                    break;
                                }
                                if (depth > 0) depth--;
                            } else if (/^ {0,3}:{3,}[ \t]*[a-zA-Z][\w-]*/.test(line)) {
                                depth++;
                            }
                        }
                        consumed += step;
                    }
                    if (endLine < 0) return undefined;
                    const body = lines.slice(0, endLine).join('\n');
                    return {
                        type: 'callout',
                        raw: src.slice(0, consumed),
                        kind,
                        fold,
                        titleTokens: title ? this.lexer.inlineTokens(title) : [],
                        tokens: this.lexer.blockTokens(body),
                    };
                },
                renderer(this: Parser, token: Tokens.Generic): string {
                    const t = token as CalloutToken;
                    const titleHtml = t.titleTokens.length ? this.parser.parseInline(t.titleTokens) : '';
                    const bodyHtml = this.parser.parse(t.tokens);
                    return renderCallout(t.kind, t.fold, titleHtml, bodyHtml);
                },
            },
        ],
        renderer: {
            heading(this: Parser, token: Tokens.Heading): string {
                let id = slugify(token.text) || 'section';
                const seen = ids.get(id) ?? 0;
                ids.set(id, seen + 1);
                if (seen) id += `-${seen}`;
                const safe = escapeHtml(id);
                return `<h${token.depth} id="${safe}">${this.parser.parseInline(token.tokens)}<a class="anchor" href="#${safe}" aria-hidden="true" tabindex="-1">#</a></h${token.depth}>\n`;
            },
            blockquote(this: Parser, token: Tokens.Blockquote): string | false {
                // > [!INFO] Title (or [!INFO]+ / [!INFO]- for unfolding callouts).
                const first = token.tokens[0];
                if (first?.type !== 'paragraph') return false;
                const match = /^\[!([a-zA-Z][\w-]*)\]([+-])?(?:[ \t]+([^\n]*))?(?:\n([\s\S]*))?$/.exec(first.raw.trim());
                if (!match) return false;
                const kind = match[1]!.toLowerCase();
                const fold: CalloutFold = match[2] === '+' ? 'open' : match[2] === '-' ? 'closed' : null;
                const title = (match[3] ?? '').trim();
                const restFirst = (match[4] ?? '').trim();
                const tailRaw = token.tokens
                    .slice(1)
                    .map(t => t.raw)
                    .join('');
                const bodyMd = [restFirst, tailRaw].filter(Boolean).join('\n\n');
                const titleHtml = title ? marked.parseInline(title, { async: false }) : '';
                const bodyHtml = bodyMd ? marked.parse(bodyMd, { async: false }) : '';
                return renderCallout(kind, fold, titleHtml, bodyHtml);
            },
            code(token: Tokens.Code): string | false {
                // ```math, as GitHub writes a displayed equation.
                if (token.lang?.trim() !== 'math') return false;
                return `<div class="math-display">${katex.renderToString(token.text, { ...katexOptions, displayMode: true })}</div>\n`;
            },
            link(this: Parser, token: Tokens.Link): string {
                const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
                const rel = isExternal(token.href) ? ' rel="noopener"' : '';
                return `<a href="${escapeHtml(token.href)}"${title}${rel}>${this.parser.parseInline(token.tokens)}</a>`;
            },
            image(token: Tokens.Image): string {
                const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
                return img(token).replace('>', `${title}>`);
            },
            paragraph(this: Parser, token: Tokens.Paragraph): string | false {
                // A captioned picture on a line of its own is a figure.
                const only = token.tokens.filter(t => !(t.type === 'text' && !t.raw.trim()));
                const image = only.length === 1 && only[0]!.type === 'image' ? (only[0] as Tokens.Image) : null;
                if (!image?.title) return false;
                return `<figure>${img(image)}<figcaption>${escapeHtml(image.title)}</figcaption></figure>\n`;
            },
        },
    });
    return marked.parse(markdown, { async: false });
}
