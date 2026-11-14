// A collection: its title, a line about it, and its articles in reading order.
import { icon } from '../icons.ts';
import type { ArticleSummary, Collection, CollectionSummary } from '../shared/api.ts';
import { slugify } from '../shared/slug.ts';
import { api, ApiFailure } from './api.ts';
import { grow, type View } from './article-view.ts';
import type { MenuEntry } from '../menu.ts';
import { autosave, describe, type SaveState } from './autosave.ts';
import { h, svg } from './dom.ts';

export interface CollectionContext {
    articles: () => ArticleSummary[];
    changed: (c: CollectionSummary) => void;
    deleted: (id: number) => void;
    back: () => void;
    open: (articleId: number) => void;
}

export function collectionView(initial: Collection, ctx: CollectionContext): View {
    let collection = initial;
    let order = collection.articles.map(a => a.id);
    // Its page only exists once it holds a published article; until then nobody can have linked to it.
    const slugFollows = !collection.articles.some(a => a.state === 'published');

    const title = h('textarea', { class: 'title-input', rows: 1, placeholder: 'Title', 'aria-label': 'Title', value: collection.title });
    const description = h('textarea', { class: 'summary-input', rows: 1, placeholder: 'Summary', 'aria-label': 'Summary', value: collection.description });
    const note = h('span', { class: 'save-note', 'aria-live': 'polite' });
    const list = h('ol', { class: 'order' });
    const adder = h('select', { class: 'adder', 'aria-label': 'Add an article' });

    function say(state: SaveState): void {
        note.textContent = describe(state);
        note.className = `save-note save-${state.kind}`;
    }

    const saver = autosave(
        async () => {
            collection = await api.saveCollection(collection.id, {
                title: title.value,
                slug: slugFollows ? slugify(title.value) || collection.slug : collection.slug,
                description: description.value,
                articleIds: order,
                updatedAt: collection.updatedAt,
            });
            ctx.changed(collection);
        },
        say,
        600,
    );

    function reorder(from: number, to: number): void {
        if (to < 0 || to >= order.length || to === from) return;
        const [id] = order.splice(from, 1);
        order.splice(to, 0, id!);
        paintList();
        saver.touch();
    }

    function move(index: number, by: number, focus: 'title' | 'tool'): void {
        reorder(index, index + by);
        const to = Math.min(Math.max(index + by, 0), order.length - 1);
        const row = list.children[to];
        row?.querySelector<HTMLElement>(focus === 'title' ? '.order-title' : `[data-move="${by}"]`)?.focus();
    }

    // With a mouse, a row is picked up and put down where it belongs; the others make room.
    let dragged = false;
    function pickUp(li: HTMLElement, down: PointerEvent): void {
        if (down.pointerType !== 'mouse' || down.button !== 0 || (down.target as Element).closest('.tool')) return;
        const rows = [...list.children] as HTMLElement[];
        const from = rows.indexOf(li);
        const rects = rows.map(r => r.getBoundingClientRect());
        const height = rects[from]!.height;
        let to = from;
        let lifted = false;
        const onMove = (e: PointerEvent): void => {
            const dy = e.clientY - down.clientY;
            if (!lifted && Math.abs(dy) < 5) return;
            if (!lifted) {
                lifted = true;
                list.classList.add('is-sorting');
                li.classList.add('is-lifted');
            }
            li.style.transform = `translateY(${dy}px)`;
            const middle = rects[from]!.top + height / 2 + dy;
            to = rects.filter((r, i) => i !== from && r.top + r.height / 2 < middle).length;
            rows.forEach((row, i) => {
                if (i === from) return;
                const shift = from < to && i > from && i <= to ? -height : from > to && i >= to && i < from ? height : 0;
                row.style.transform = shift ? `translateY(${shift}px)` : '';
            });
        };
        const onUp = (): void => {
            removeEventListener('pointermove', onMove);
            removeEventListener('pointercancel', onUp);
            removeEventListener('pointerup', onUp);
            if (!lifted) return;
            dragged = true;
            setTimeout(() => (dragged = false));
            list.classList.remove('is-sorting');
            rows.forEach(row => (row.style.transform = ''));
            li.classList.remove('is-lifted');
            reorder(from, to);
        };
        addEventListener('pointermove', onMove);
        addEventListener('pointerup', onUp);
        addEventListener('pointercancel', onUp);
    }

    function paintList(): void {
        const byId = new Map(ctx.articles().map(a => [a.id, a]));
        list.replaceChildren(
            ...order.map((id, i) => {
                const a = byId.get(id);
                const li = h(
                    'li',
                    { class: `order-item${a?.state === 'draft' ? ' is-draft' : ''}` },
                    h(
                        'button',
                        {
                            class: 'order-title',
                            type: 'button',
                            onclick: () => dragged || ctx.open(id),
                            onkeydown: (e: KeyboardEvent) => {
                                if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                                e.preventDefault();
                                move(i, e.key === 'ArrowUp' ? -1 : 1, 'title');
                            },
                        },
                        a?.title || 'Untitled',
                    ),
                    h('button', { class: 'tool step', type: 'button', 'data-move': '-1', 'aria-label': 'Move up', disabled: i === 0, onclick: () => move(i, -1, 'tool') }, svg(icon('chevronUp', 16))),
                    h('button', { class: 'tool step', type: 'button', 'data-move': '1', 'aria-label': 'Move down', disabled: i === order.length - 1, onclick: () => move(i, 1, 'tool') }, svg(icon('chevronDown', 16))),
                    h(
                        'button',
                        {
                            class: 'tool',
                            type: 'button',
                            'aria-label': 'Remove',
                            onclick: () => {
                                order = order.filter(x => x !== id);
                                paintList();
                                saver.touch();
                            },
                        },
                        svg(icon('x', 16)),
                    ),
                );
                li.addEventListener('pointerdown', e => pickUp(li, e));
                return li;
            }),
        );
        const rest = ctx.articles().filter(a => !order.includes(a.id));
        adder.replaceChildren(h('option', { value: '' }, 'Add…'), ...rest.map(a => h('option', { value: String(a.id) }, a.title || 'Untitled')));
        adder.hidden = !rest.length;
    }

    adder.addEventListener('change', () => {
        const id = Number(adder.value);
        if (!id) return;
        order = [...order, id];
        paintList();
        saver.touch();
        adder.focus();
    });

    for (const el of [title, description]) {
        el.addEventListener('input', () => {
            if (el.value.includes('\n')) el.value = el.value.replace(/\n+/g, ' ');
            grow(el);
            saver.touch();
        });
    }

    async function remove(): Promise<void> {
        if (!confirm(`Delete “${title.value || 'Untitled'}”? Its articles stay.`)) return;
        saver.stop();
        try {
            await api.deleteCollection(collection.id);
            ctx.deleted(collection.id);
        } catch (e) {
            if (e instanceof ApiFailure) say({ kind: 'error', message: e.message, stale: false });
        }
    }

    const el = h(
        'section',
        { class: 'editor' },
        h(
            'header',
            { class: 'bar' },
            h('button', { class: 'btn-ghost btn-icon back', type: 'button', onclick: ctx.back, 'aria-label': 'Back' }, svg(icon('arrowLeft', 18))),
            note,
        ),
        h(
            'div',
            { class: 'editor-scroll' },
            h('div', { class: 'sheet' }, title, description, list, adder, h('footer', { class: 'sheet-foot' }, h('button', { class: 'btn-ghost danger', type: 'button', onclick: () => void remove() }, 'Delete'))),
        ),
    );

    paintList();

    return {
        el,
        flush: () => saver.flush(),
        get dirty() {
            return saver.dirty;
        },
        mounted() {
            grow(title);
            grow(description);
            if (!collection.title) title.focus();
        },
        menu: (target): MenuEntry[] | null | undefined => {
            const row = target.closest<HTMLElement>('.order-item');
            if (!row) return target.closest('textarea, select') ? null : undefined;
            const i = [...list.children].indexOf(row);
            const id = order[i]!;
            return [
                { label: 'Open', run: () => ctx.open(id) },
                'gap',
                { label: 'Move to the top', disabled: i === 0, run: () => reorder(i, 0) },
                { label: 'Move up', keys: '⌥↑', disabled: i === 0, run: () => reorder(i, i - 1) },
                { label: 'Move down', keys: '⌥↓', disabled: i === order.length - 1, run: () => reorder(i, i + 1) },
                { label: 'Move to the end', disabled: i === order.length - 1, run: () => reorder(i, order.length - 1) },
                'gap',
                {
                    label: 'Take out of the collection',
                    run: () => {
                        order = order.filter(x => x !== id);
                        paintList();
                        saver.touch();
                    },
                },
            ];
        },
        destroy: () => saver.stop(),
    };
}
