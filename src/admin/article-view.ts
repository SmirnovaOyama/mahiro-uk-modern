// Writing one article: a title, a summary, the markdown, and Publish. Laid out
// in the reading page's own type, so what you write looks like what readers get.
import { icon } from '../icons.ts';
import type { Article, ArticleSummary } from '../shared/api.ts';
import { hasHan, slugify } from '../shared/slug.ts';
import { drawCard } from './card.ts';
import { api, ApiFailure } from './api.ts';
import { autosave, describe, type SaveState } from './autosave.ts';
import { h, svg } from './dom.ts';
import { copy, MOD, type MenuEntry } from '../menu.ts';
import { clip, continueList, insertBlock, link, linePrefix, pasteLink, swapText, wrap } from './textarea.ts';

export interface View {
    el: HTMLElement;
    flush(): Promise<void>;
    readonly dirty: boolean;
    /** Nothing written and never published: leaving it should leave nothing behind. */
    empty?(): boolean;
    /** Called once it is on the page, when it can measure itself. */
    mounted?(): void;
    /** Its own right-click menu for what was clicked, null for the browser's, undefined to let the page decide. */
    menu?(target: Element): MenuEntry[] | null | undefined;
    destroy(): void;
}

export interface ArticleContext {
    changed: (article: ArticleSummary) => void;
    deleted: (id: number) => void;
    back: () => void;
}

/** Textareas that grow with what's in them, so the page scrolls, not the box. */
export function grow(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
}

export function articleView(initial: Article, ctx: ArticleContext): View {
    let article = initial;
    // The address follows the title until the article has been out in the world.
    // One still written in Chinese follows it once more, into pinyin; the old
    // address then leads to the new one.
    const slugFollows = (!article.publishedSlug && !article.republishedAt) || hasHan(article.slug);

    const title = h('textarea', { class: 'title-input', rows: 1, placeholder: 'Title', 'aria-label': 'Title', value: article.title });
    const summary = h('textarea', { class: 'summary-input', rows: 1, placeholder: 'Summary', 'aria-label': 'Summary', value: article.summary });
    const body = h('textarea', { class: 'body-input', placeholder: 'Markdown', 'aria-label': 'Text, in markdown', value: article.body });

    const note = h('span', { class: 'save-note', 'aria-live': 'polite' });
    const publishButton = h('button', { class: 'btn-filled', type: 'button', onclick: () => void publish() });
    const unpublishButton = h('button', { class: 'btn-ghost', type: 'button', onclick: () => void unpublish() }, 'Unpublish');
    const discardButton = h('button', { class: 'btn-ghost', type: 'button', onclick: () => void discard() }, 'Discard changes');
    const stale = h(
        'div',
        { class: 'banner', hidden: true, role: 'alert' },
        h('span', null, 'Changed in another window.'),
        h('button', { class: 'btn-ghost', type: 'button', onclick: () => location.reload() }, 'Reload'),
    );

    function paint(): void {
        const live = article.state !== 'draft';
        const pending = article.changed || saver.dirty;
        publishButton.textContent = live && !pending ? 'Published' : live ? 'Publish changes' : 'Publish';
        publishButton.disabled = live && !pending;
        unpublishButton.hidden = !live;
        discardButton.hidden = !live || !pending;
    }

    function say(state: SaveState): void {
        note.textContent = describe(state);
        note.className = `save-note save-${state.kind}`;
        stale.hidden = !(state.kind === 'error' && state.stale);
        paint();
    }

    const saver = autosave(async () => {
        article = await api.saveArticle(article.id, {
            title: title.value,
            slug: slugFollows ? slugify(title.value) || article.slug : article.slug,
            summary: summary.value,
            body: body.value,
            publishedAt: article.publishedAt,
            updatedAt: article.updatedAt,
        });
        ctx.changed(article);
    }, say);

    /**
     * Draws the live version's link preview and stores it. Quietly: a preview
     * that can't be made leaves the site's own picture in its place.
     */
    async function makeCard(): Promise<void> {
        try {
            const { url } = await api.upload(await drawCard({ title: article.title, summary: article.summary }));
            article = { ...article, card: (await api.setCard(article.id, url)).card };
        } catch (e) {
            console.warn('The link preview couldn’t be made.', e);
        }
    }

    async function publish(): Promise<void> {
        publishButton.disabled = true;
        try {
            await saver.flush();
            article = await api.publish(article.id);
            ctx.changed(article);
            note.textContent = '';
            // Published as it is now, so the preview shows what readers will see.
            void makeCard();
        } catch (e) {
            if (e instanceof ApiFailure) say({ kind: 'error', message: e.message, field: e.field, stale: false });
        }
        paint();
    }

    async function unpublish(): Promise<void> {
        if (!confirm(`Unpublish “${title.value || 'Untitled'}”?`)) return;
        try {
            await saver.flush();
            article = await api.unpublish(article.id);
            ctx.changed(article);
        } catch (e) {
            if (e instanceof ApiFailure) say({ kind: 'error', message: e.message, stale: false });
        }
        paint();
    }

    /** Back to what readers see now. */
    async function discard(): Promise<void> {
        if (!confirm('Discard the changes made since it was published?')) return;
        try {
            await saver.flush();
            article = await api.revert(article.id);
            title.value = article.title;
            summary.value = article.summary;
            body.value = article.body;
            onResize();
            ctx.changed(article);
            note.textContent = '';
        } catch (e) {
            if (e instanceof ApiFailure) say({ kind: 'error', message: e.message, stale: false });
        }
        paint();
    }

    // ── pictures: paste or drop them into the text
    let uploads = 0;
    async function addPictures(files: File[]): Promise<void> {
        for (const file of files) {
            const marker = `![Uploading…](#upload-${++uploads})`;
            insertBlock(body, marker);
            try {
                const { url } = await api.upload(file);
                swapText(body, marker, `![](${url})`);
            } catch (e) {
                swapText(body, marker, '');
                say({ kind: 'error', message: e instanceof ApiFailure ? e.message : 'Couldn’t upload that picture.', stale: false });
            }
        }
    }
    const pictures = (list: FileList | null | undefined): File[] => [...(list ?? [])].filter(f => f.type.startsWith('image/'));
    const picker = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    picker.addEventListener('change', () => {
        body.focus();
        void addPictures(pictures(picker.files));
        picker.value = '';
    });

    // ── right-click
    function textMenu(): MenuEntry[] {
        const selected = body.selectionStart !== body.selectionEnd;
        const clipped = (what: 'cut' | 'copy' | 'paste') => async (): Promise<string | void> =>
            (await clip(body, what)) ? undefined : `Use ${MOD}${what === 'cut' ? 'X' : what === 'copy' ? 'C' : 'V'}`;
        return [
            selected && { label: 'Bold', keys: `${MOD}B`, run: () => wrap(body, '**', 'bold') },
            selected && { label: 'Italic', keys: `${MOD}I`, run: () => wrap(body, '_', 'italic') },
            selected && { label: 'Code', keys: `${MOD}E`, run: () => wrap(body, '`', 'code') },
            selected && { label: 'Math', run: () => wrap(body, '$', 'x') },
            selected && { label: 'Link', keys: `${MOD}K`, run: () => link(body) },
            !selected && { label: 'Picture…', run: () => picker.click() },
            'gap',
            { label: 'Heading', run: () => linePrefix(body, '## ') },
            { label: 'Quote', run: () => linePrefix(body, '> ') },
            { label: 'List', run: () => linePrefix(body, '- ') },
            'gap',
            selected && { label: 'Cut', keys: `${MOD}X`, run: clipped('cut') },
            selected && { label: 'Copy', keys: `${MOD}C`, run: clipped('copy') },
            { label: 'Paste', keys: `${MOD}V`, run: clipped('paste') },
        ];
    }

    function pageMenu(): MenuEntry[] {
        const live = article.state !== 'draft';
        const href = article.publishedSlug ? `${location.origin}/writing/${encodeURIComponent(article.publishedSlug)}` : null;
        return [
            !publishButton.disabled && { label: publishButton.textContent!, run: () => publish() },
            { label: 'Preview', run: () => void open(`/admin/preview/${article.id}`, '_blank') },
            live && href && { label: 'Open on the site', run: () => void open(href, '_blank') },
            live && href && { label: 'Copy link', run: () => copy(href) },
            'gap',
            !discardButton.hidden && { label: 'Discard changes', run: () => discard() },
            live && { label: 'Unpublish', run: () => unpublish() },
            { label: 'Delete', danger: true, run: () => remove() },
        ];
    }

    async function remove(): Promise<void> {
        if (!confirm(`Delete “${title.value || 'Untitled'}”? This can’t be undone.`)) return;
        saver.stop();
        try {
            await api.deleteArticle(article.id);
            ctx.deleted(article.id);
        } catch (e) {
            if (e instanceof ApiFailure) say({ kind: 'error', message: e.message, stale: false });
        }
    }

    // ── typing
    const changed = (): void => {
        saver.touch();
        paint();
    };
    for (const el of [title, summary]) {
        el.addEventListener('input', () => {
            if (el.value.includes('\n')) el.value = el.value.replace(/\n+/g, ' ');
            grow(el);
            changed();
        });
    }
    title.addEventListener('keydown', e => {
        if (e.key === 'Enter') (e.preventDefault(), summary.focus());
    });
    summary.addEventListener('keydown', e => {
        if (e.key === 'Enter') (e.preventDefault(), body.focus());
    });
    body.addEventListener('input', () => {
        grow(body);
        changed();
    });
    // Markdown shortcuts, with no buttons for them: ⌘B, ⌘I, ⌘K, ⌘E, and lists that carry on.
    body.addEventListener('keydown', event => {
        const cmd = event.metaKey || event.ctrlKey;
        if (cmd && event.key === 'b') (event.preventDefault(), wrap(body, '**', 'bold'));
        else if (cmd && event.key === 'i') (event.preventDefault(), wrap(body, '_', 'italic'));
        else if (cmd && event.key === 'k') (event.preventDefault(), link(body));
        else if (cmd && event.key === 'e') (event.preventDefault(), wrap(body, '`', 'code'));
        else if (event.key === 'Enter' && !event.shiftKey && !cmd && !event.isComposing && continueList(body)) event.preventDefault();
    });
    body.addEventListener('paste', event => {
        const files = pictures(event.clipboardData?.files);
        if (files.length) {
            event.preventDefault();
            void addPictures(files);
        } else pasteLink(body, event);
    });
    body.addEventListener('dragover', event => {
        if (!event.dataTransfer?.types.includes('Files')) return;
        event.preventDefault();
        body.classList.add('is-dropping');
    });
    body.addEventListener('dragleave', () => body.classList.remove('is-dropping'));
    body.addEventListener('drop', event => {
        body.classList.remove('is-dropping');
        const files = pictures(event.dataTransfer?.files);
        if (!files.length) return;
        event.preventDefault();
        // Put them where they were dropped, as near as a textarea can tell.
        body.focus();
        const doc = document as Document & { caretPositionFromPoint?(x: number, y: number): { offset: number } | null };
        const at = doc.caretPositionFromPoint?.(event.clientX, event.clientY);
        if (at) body.setSelectionRange(at.offset, at.offset);
        void addPictures(files);
    });

    // While writing, the bar steps back; moving the pointer brings it back.
    let pointer: { x: number; y: number } | null = null;
    for (const field of [title, summary, body]) field.addEventListener('input', () => el.classList.add('is-typing'));
    const settle = (e: MouseEvent): void => {
        // A real move, not the pointer twitching or the page scrolling under it.
        if (pointer && Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 6) el.classList.remove('is-typing');
        if (!el.classList.contains('is-typing') || !pointer) pointer = { x: e.clientX, y: e.clientY };
    };

    const onKey = (e: KeyboardEvent): void => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            saver.touch();
            void saver.flush().catch(() => {});
        }
    };
    document.addEventListener('keydown', onKey);
    const onResize = (): void => [title, summary, body].forEach(grow);
    addEventListener('resize', onResize);

    const el = h(
        'section',
        { class: 'editor' },
        h(
            'header',
            { class: 'bar' },
            h('button', { class: 'btn-ghost btn-icon back', type: 'button', onclick: ctx.back, 'aria-label': 'Back' }, svg(icon('arrowLeft', 18))),
            note,
            h('span', { class: 'spacer' }),
            h('a', { class: 'btn-ghost', href: `/admin/preview/${article.id}`, target: '_blank' }, 'Preview'),
            publishButton,
        ),
        stale,
        h(
            'div',
            { class: 'editor-scroll' },
            h(
                'div',
                { class: 'sheet' },
                title,
                summary,
                body,
                picker,
                h('footer', { class: 'sheet-foot' }, discardButton, unpublishButton, h('button', { class: 'btn-ghost danger', type: 'button', onclick: () => void remove() }, 'Delete')),
            ),
        ),
    );

    el.addEventListener('mousemove', settle);
    say({ kind: 'saved' });
    note.textContent = '';

    return {
        el,
        flush: () => saver.flush(),
        get dirty() {
            return saver.dirty;
        },
        mounted() {
            onResize();
            if (!article.title) title.focus();
            // An address that was written in Chinese is rewritten into pinyin.
            if (hasHan(article.slug)) changed();
            // Published before previews were drawn: make its picture now, once.
            if (article.state !== 'draft' && !article.card) void makeCard();
        },
        menu: target => {
            if (target === body) return textMenu();
            // The title and summary keep the browser's menu, with its spelling suggestions.
            if (target.closest('textarea, input, a, button')) return null;
            return pageMenu();
        },
        empty: () => article.state === 'draft' && !article.republishedAt && ![title, summary, body].some(el => el.value.trim()),
        destroy() {
            saver.stop();
            document.removeEventListener('keydown', onKey);
            removeEventListener('resize', onResize);
        },
    };
}
