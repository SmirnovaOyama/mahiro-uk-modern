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
//   $$ … $$ or ```math          and on a line of its own, centred
import katex from 'katex';
import { Marked, type Tokens } from 'marked';
import markedFootnote from 'marked-footnote';
import markedKatex from 'marked-katex-extension';
import { markedSmartypants } from 'marked-smartypants';
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

const isExternal = (href: string): boolean => /^https?:\/\//i.test(href);

type Parser = { parser: { parseInline(t: Tokens.Generic[]): string } };

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
        renderer: {
            heading(this: Parser, token: Tokens.Heading): string {
                let id = slugify(token.text) || 'section';
                const seen = ids.get(id) ?? 0;
                ids.set(id, seen + 1);
                if (seen) id += `-${seen}`;
                const safe = escapeHtml(id);
                return `<h${token.depth} id="${safe}">${this.parser.parseInline(token.tokens)}<a class="anchor" href="#${safe}" aria-hidden="true" tabindex="-1">#</a></h${token.depth}>\n`;
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
