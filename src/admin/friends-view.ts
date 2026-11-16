// The friends the blog points to: a picture, a name, their address and a line
// about them, in the order the page shows them. Saved as you type, like
// everything else.
import { icon } from '../icons.ts';
import type { Friend } from '../shared/api.ts';
import { friendHref } from '../shared/friends.ts';
import type { MenuEntry } from '../menu.ts';
import { api } from './api.ts';
import type { View } from './article-view.ts';
import { autosave, describe, type SaveState } from './autosave.ts';
import { h, svg } from './dom.ts';
import { sortable } from './sortable.ts';

export interface FriendsContext {
    changed: (friends: Friend[]) => void;
    back: () => void;
}

export interface FriendsView extends View {
    /** Puts the cursor in a friend's name, or in a new row at the end. */
    focus(index: number | 'new'): void;
}

const blank = (f: Friend): boolean => !f.name.trim() && !f.url.trim() && !f.note.trim() && !f.avatar;

/** Avatars are kept small: a centred square, 256 pixels across. */
const AVATAR_SIZE = 256;

/**
 * Crops a picture to its centred square and shrinks it to AVATAR_SIZE, so a
 * phone photo becomes a few kilobytes rather than several megabytes.
 */
async function squareAvatar(file: Blob): Promise<Blob> {
    const address = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.src = address;
        await img.decode();
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        if (!side) throw new Error('That picture has no size.');
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = Math.min(AVATAR_SIZE, side);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('This browser can’t resize pictures.');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
        const encode = (type: string): Promise<Blob | null> => new Promise(done => canvas.toBlob(done, type, 0.9));
        // WebP where the browser can write it (it keeps transparency); JPEG otherwise.
        const webp = await encode('image/webp');
        const blob = webp?.type === 'image/webp' ? webp : await encode('image/jpeg');
        if (!blob) throw new Error('That picture couldn’t be resized.');
        return blob;
    } finally {
        URL.revokeObjectURL(address);
    }
}

export function friendsView(initial: Friend[], ctx: FriendsContext): FriendsView {
    let rows: Friend[] = initial.map(f => ({ ...f, avatar: f.avatar ?? '' }));
    const note = h('span', { class: 'save-note', 'aria-live': 'polite' });
    const list = h('ol', { class: 'order friends-order' });
    const adder = h('button', { class: 'adder', type: 'button', onclick: () => add() }, 'Add a friend');

    function say(state: SaveState): void {
        note.textContent = describe(state);
        note.className = `save-note save-${state.kind}`;
    }

    // A row with nothing in it yet is kept here, but never saved.
    const saver = autosave(
        async () => {
            await api.saveFriends(rows.filter(f => !blank(f)));
            ctx.changed(rows.filter(f => !blank(f)));
        },
        say,
        600,
    );

    function reorder(from: number, to: number): void {
        if (to < 0 || to >= rows.length || to === from) return;
        const [f] = rows.splice(from, 1);
        rows.splice(to, 0, f!);
        paint();
        saver.touch();
    }

    function remove(i: number): void {
        const was = rows[i]!;
        rows.splice(i, 1);
        paint();
        if (!blank(was)) saver.touch();
        list.children[Math.min(i, rows.length - 1)]?.querySelector<HTMLInputElement>('.friend-name')?.focus();
    }

    function focus(index: number | 'new'): void {
        if (index === 'new') return add();
        list.children[index]?.querySelector<HTMLInputElement>('.friend-name')?.focus();
    }

    function add(): void {
        // A row already waiting to be filled in is used rather than another.
        const empty = rows.findIndex(blank);
        if (empty < 0) {
            rows.push({ name: '', url: '', note: '', avatar: '' });
            paint();
        }
        focus(empty < 0 ? rows.length - 1 : empty);
    }

    const sorter = sortable(list, reorder);

    /** Uploads a picture as friend i's avatar; the circle shows it's working meanwhile. */
    async function setAvatar(i: number, file: File): Promise<void> {
        const friend = rows[i];
        if (!friend) return;
        if (!file.type.startsWith('image/')) {
            say({ kind: 'error', message: 'An avatar has to be a picture.', stale: false });
            return;
        }
        list.children[i]?.querySelector('.friend-face')?.classList.add('is-busy');
        try {
            const { url } = await api.upload(await squareAvatar(file));
            friend.avatar = url;
            saver.touch();
        } catch (e) {
            say({ kind: 'error', message: e instanceof Error ? e.message : 'That picture couldn’t be uploaded.', stale: false });
        }
        paint();
    }

    function chooseAvatar(i: number): void {
        const picker = h('input', { type: 'file', accept: 'image/*' });
        picker.addEventListener('change', () => {
            const file = picker.files?.[0];
            if (file) void setAvatar(i, file);
        });
        picker.click();
    }

    function clearAvatar(i: number): void {
        const friend = rows[i];
        if (!friend?.avatar) return;
        friend.avatar = '';
        paint();
        saver.touch();
    }

    function paint(): void {
        list.replaceChildren(
            ...rows.map((f, i) => {
                const field = (key: keyof Friend, placeholder: string, extra: Record<string, unknown> = {}): HTMLInputElement => {
                    const input = h('input', {
                        class: `friend-${key}`,
                        value: f[key],
                        placeholder,
                        'aria-label': placeholder,
                        spellcheck: key === 'note',
                        autocomplete: 'off',
                        ...extra,
                        oninput: () => {
                            f[key] = input.value;
                            if (key === 'url') check();
                            saver.touch();
                        },
                        onkeydown: (e: KeyboardEvent) => {
                            if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                                e.preventDefault();
                                const to = i + (e.key === 'ArrowUp' ? -1 : 1);
                                reorder(i, to);
                                list.children[Math.min(Math.max(to, 0), rows.length - 1)]?.querySelector<HTMLInputElement>(`.friend-${key}`)?.focus();
                            } else if (e.key === 'Enter') {
                                e.preventDefault();
                                // Down through the row, then on to a new one.
                                const next = input.nextElementSibling as HTMLInputElement | null;
                                if (next) next.focus();
                                else add();
                            }
                        },
                    });
                    return input;
                };
                const url = field('url', 'Address', { type: 'url', inputMode: 'url' });
                // An address that can't be followed yet is shown, quietly, as not working.
                const check = (): void => {
                    const off = Boolean(f.url.trim()) && !friendHref(f.url);
                    url.classList.toggle('is-off', off);
                    url.title = off ? 'Not an address yet' : '';
                };
                check();
                // Their picture: click to choose one, or drop one on the row.
                const initial = [...f.name.trim()][0]?.toLocaleUpperCase() ?? '';
                const face = h(
                    'button',
                    {
                        class: f.avatar ? 'friend-face has-picture' : 'friend-face',
                        type: 'button',
                        'aria-label': f.avatar ? 'Change picture' : 'Add a picture',
                        title: f.avatar ? 'Change picture' : 'Add a picture',
                        onclick: () => chooseAvatar(i),
                    },
                    f.avatar ? h('img', { src: f.avatar, alt: '', width: 96, height: 96, decoding: 'async' }) : initial || svg(icon('plus', 16)),
                );
                const li = h(
                    'li',
                    {
                        class: 'order-item friend',
                        ondragover: (e: DragEvent) => {
                            if (![...(e.dataTransfer?.items ?? [])].some(item => item.type.startsWith('image/'))) return;
                            e.preventDefault();
                            li.classList.add('is-dropping');
                        },
                        ondragleave: () => li.classList.remove('is-dropping'),
                        ondrop: (e: DragEvent) => {
                            const file = [...(e.dataTransfer?.files ?? [])].find(item => item.type.startsWith('image/'));
                            li.classList.remove('is-dropping');
                            if (!file) return;
                            e.preventDefault();
                            void setAvatar(i, file);
                        },
                    },
                    face,
                    h('div', { class: 'friend-fields' }, field('name', 'Name'), url, field('note', 'Note')),
                    h('button', { class: 'tool step', type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: () => reorder(i, i - 1) }, svg(icon('chevronUp', 16))),
                    h('button', { class: 'tool step', type: 'button', 'aria-label': 'Move down', disabled: i === rows.length - 1, onclick: () => reorder(i, i + 1) }, svg(icon('chevronDown', 16))),
                    h('button', { class: 'tool', type: 'button', 'aria-label': 'Remove', onclick: () => remove(i) }, svg(icon('x', 16))),
                );
                li.addEventListener('pointerdown', e => {
                    // Pressing the picture chooses one; it doesn't pick up the row.
                    if ((e.target as Element).closest('.friend-face')) return;
                    sorter.pickUp(li, e);
                });
                return li;
            }),
        );
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
        h('div', { class: 'editor-scroll' }, h('div', { class: 'sheet' }, h('h1', { class: 'title-input sheet-title' }, 'Friends'), list, adder)),
    );

    paint();

    return {
        el,
        focus,
        flush: () => saver.flush(),
        get dirty() {
            return saver.dirty;
        },
        mounted() {
            if (!rows.length) add();
        },
        menu: (target): MenuEntry[] | null | undefined => {
            const row = target.closest<HTMLElement>('.friend');
            if (!row) return undefined;
            if (target.closest('input') && getSelection()?.toString()) return null;
            const i = [...list.children].indexOf(row);
            const href = friendHref(rows[i]!.url);
            return [
                href && { label: 'Visit', run: () => void window.open(href, '_blank', 'noopener') },
                'gap',
                { label: rows[i]!.avatar ? 'Change picture…' : 'Add a picture…', run: () => chooseAvatar(i) },
                { label: 'Remove picture', disabled: !rows[i]!.avatar, run: () => clearAvatar(i) },
                'gap',
                { label: 'Move to the top', disabled: i === 0, run: () => reorder(i, 0) },
                { label: 'Move up', keys: '⌥↑', disabled: i === 0, run: () => reorder(i, i - 1) },
                { label: 'Move down', keys: '⌥↓', disabled: i === rows.length - 1, run: () => reorder(i, i + 1) },
                { label: 'Move to the end', disabled: i === rows.length - 1, run: () => reorder(i, rows.length - 1) },
                'gap',
                { label: 'Remove', danger: true, run: () => remove(i) },
            ];
        },
        destroy: () => saver.stop(),
    };
}
