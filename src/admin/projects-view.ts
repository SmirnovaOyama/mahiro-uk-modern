// The projects page's list: for each project its rule, its name, a line about
// it, and its links (a GitHub or GitLab repository, a website), in the order
// the page shows them. Saved as you type, like everything else; each save
// brings back what the Worker found at every link, shown under the address.
import { icon } from '../icons.ts';
import type { LinkPreview, Project, ProjectLink } from '../shared/api.ts';
import { KIND_LABEL, linkPlace } from '../shared/links.ts';
import type { MenuEntry } from '../menu.ts';
import { api } from './api.ts';
import type { View } from './article-view.ts';
import { autosave, describe, type SaveState } from './autosave.ts';
import { h, svg } from './dom.ts';
import { sortable } from './sortable.ts';

export interface ProjectsContext {
    changed: (projects: Project[]) => void;
    back: () => void;
}

export interface ProjectsView extends View {
    /** Puts the cursor in a project's rule, or in a new row at the end. */
    focus(index: number | 'new'): void;
}

const blankLink = (l: ProjectLink): boolean => !l.url.trim();
const blank = (p: Project): boolean => !p.name.trim() && !p.rule.trim() && !p.about.trim() && p.links.every(blankLink);
/** What's sent: no empty projects, and no empty links. */
const tidy = (rows: Project[]): Project[] => rows.filter(p => !blank(p)).map(p => ({ ...p, links: p.links.filter(l => !blankLink(l)) }));

/** A link's preview, as a line or two under its address. */
function previewLine(link: ProjectLink, waiting: boolean): HTMLElement {
    const place = linkPlace(link.url);
    const p: LinkPreview | null = link.preview;
    if (!link.url.trim()) return h('span', { class: 'link-preview is-quiet' }, 'GitHub, GitLab or a website');
    if (!place) return h('span', { class: 'link-preview is-off' }, 'Not an address yet');
    if (waiting) return h('span', { class: 'link-preview is-quiet' }, `${KIND_LABEL[place.kind]} · looking…`);
    if (!p) return h('span', { class: 'link-preview is-quiet' }, `${KIND_LABEL[place.kind]} · no preview found`);
    const meta = [KIND_LABEL[place.kind], p.language, p.stars !== null && place.kind !== 'site' ? `★ ${p.stars}` : ''].filter(Boolean).join(' · ');
    return h(
        'span',
        { class: 'link-preview' },
        p.image ? h('img', { src: p.image, alt: '', width: 72, height: 38, loading: 'lazy', referrerPolicy: 'no-referrer' }) : null,
        h('span', { class: 'link-preview-text' }, h('span', { class: 'link-preview-title' }, p.title || p.description || place.where), h('span', null, meta)),
    );
}

export function projectsView(initial: Project[], ctx: ProjectsContext): ProjectsView {
    let rows: Project[] = initial.map(p => ({ ...p, links: p.links.map(l => ({ ...l })) }));
    /** Links whose address changed since the last save, so their preview is still to come. */
    const waiting = new Set<ProjectLink>();
    const note = h('span', { class: 'save-note', 'aria-live': 'polite' });
    const list = h('ol', { class: 'order friends-order projects-order' });
    const adder = h('button', { class: 'adder', type: 'button', onclick: () => add() }, 'Add a project');

    function say(state: SaveState): void {
        note.textContent = describe(state);
        note.className = `save-note save-${state.kind}`;
    }

    /** Puts the previews a save brought back beside the links they belong to, without touching what's being typed. */
    function receive(saved: Project[]): void {
        const found = new Map<string, ProjectLink>();
        for (const p of saved) for (const l of p.links) found.set(l.url, l);
        rows.forEach((p, i) =>
            p.links.forEach((l, j) => {
                const got = found.get(l.url);
                if (!got) return;
                l.preview = got.preview;
                l.fetchedAt = got.fetchedAt;
                waiting.delete(l);
                list.children[i]?.querySelectorAll('.link-preview')[j]?.replaceWith(previewLine(l, false));
            }),
        );
    }

    const saver = autosave(
        async () => {
            const saved = await api.saveProjects(tidy(rows));
            receive(saved);
            ctx.changed(saved);
        },
        say,
        700,
    );

    function reorder(from: number, to: number): void {
        if (to < 0 || to >= rows.length || to === from) return;
        const [p] = rows.splice(from, 1);
        rows.splice(to, 0, p!);
        paint();
        saver.touch();
    }

    function remove(i: number): void {
        const was = rows[i]!;
        rows.splice(i, 1);
        paint();
        if (!blank(was)) saver.touch();
        list.children[Math.min(i, rows.length - 1)]?.querySelector<HTMLInputElement>('.project-rule-input')?.focus();
    }

    function focus(index: number | 'new'): void {
        if (index === 'new') return add();
        list.children[index]?.querySelector<HTMLInputElement>('.project-rule-input')?.focus();
    }

    function add(): void {
        const empty = rows.findIndex(blank);
        if (empty < 0) {
            rows.push({ name: '', rule: '', about: '', links: [{ url: '', preview: null }] });
            paint();
        }
        focus(empty < 0 ? rows.length - 1 : empty);
    }

    function addLink(i: number): void {
        const p = rows[i]!;
        const empty = p.links.findIndex(blankLink);
        if (empty < 0) {
            p.links.push({ url: '', preview: null });
            paint();
        }
        const inputs = list.children[i]?.querySelectorAll<HTMLInputElement>('.link-url');
        inputs?.[empty < 0 ? p.links.length - 1 : empty]?.focus();
    }

    function removeLink(i: number, j: number): void {
        const p = rows[i]!;
        const [was] = p.links.splice(j, 1);
        paint();
        if (was && !blankLink(was)) saver.touch();
        list.children[i]?.querySelectorAll<HTMLInputElement>('.link-url')[Math.max(0, j - 1)]?.focus();
    }

    const sorter = sortable(list, reorder);

    function paint(): void {
        list.replaceChildren(
            ...rows.map((p, i) => {
                const field = (key: 'rule' | 'name' | 'about', placeholder: string): HTMLInputElement => {
                    const input = h('input', {
                        class: `project-${key}-input`,
                        value: p[key],
                        placeholder,
                        'aria-label': placeholder,
                        spellcheck: key !== 'name',
                        autocomplete: 'off',
                        oninput: () => {
                            p[key] = input.value;
                            saver.touch();
                        },
                        onkeydown: (e: KeyboardEvent) => {
                            if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                                e.preventDefault();
                                const to = i + (e.key === 'ArrowUp' ? -1 : 1);
                                reorder(i, to);
                                list.children[Math.min(Math.max(to, 0), rows.length - 1)]?.querySelector<HTMLInputElement>(`.project-${key}-input`)?.focus();
                            } else if (e.key === 'Enter') {
                                e.preventDefault();
                                // Down through the row: rule, name, line, then its first link.
                                const inputs = [...(input.closest('.project-row')?.querySelectorAll<HTMLInputElement>('input') ?? [])];
                                const next = inputs[inputs.indexOf(input) + 1];
                                if (next) next.focus();
                                else addLink(i);
                            }
                        },
                    });
                    return input;
                };
                const links = p.links.map((l, j) => {
                    const url = h('input', {
                        class: 'link-url',
                        value: l.url,
                        type: 'url',
                        inputMode: 'url',
                        placeholder: 'https://github.com/…',
                        'aria-label': `Link ${j + 1}`,
                        autocomplete: 'off',
                        spellcheck: false,
                        oninput: () => {
                            l.url = url.value;
                            l.preview = null;
                            waiting.add(l);
                            row.querySelector('.link-preview')!.replaceWith(previewLine(l, Boolean(linkPlace(l.url))));
                            saver.touch();
                        },
                        onkeydown: (e: KeyboardEvent) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                addLink(i);
                            } else if (e.key === 'Backspace' && !url.value && p.links.length > 1) {
                                e.preventDefault();
                                removeLink(i, j);
                            }
                        },
                    });
                    const row = h(
                        'div',
                        { class: 'link-row' },
                        h('div', { class: 'link-line' }, url, h('button', { class: 'tool', type: 'button', 'aria-label': 'Remove link', onclick: () => removeLink(i, j) }, svg(icon('x', 14)))),
                        previewLine(l, waiting.has(l)),
                    );
                    return row;
                });
                const li = h(
                    'li',
                    { class: 'order-item friend project-row' },
                    h(
                        'div',
                        { class: 'friend-fields project-fields' },
                        field('rule', 'The rule it keeps'),
                        field('name', 'Name'),
                        field('about', 'What it is, in a line'),
                        h('div', { class: 'project-links' }, ...links, h('button', { class: 'adder link-adder', type: 'button', onclick: () => addLink(i) }, 'Add a link')),
                    ),
                    h('button', { class: 'tool step', type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: () => reorder(i, i - 1) }, svg(icon('chevronUp', 16))),
                    h('button', { class: 'tool step', type: 'button', 'aria-label': 'Move down', disabled: i === rows.length - 1, onclick: () => reorder(i, i + 1) }, svg(icon('chevronDown', 16))),
                    h('button', { class: 'tool', type: 'button', 'aria-label': 'Remove project', onclick: () => remove(i) }, svg(icon('x', 16))),
                );
                li.addEventListener('pointerdown', e => sorter.pickUp(li, e));
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
        h('div', { class: 'editor-scroll' }, h('div', { class: 'sheet' }, h('h1', { class: 'title-input sheet-title' }, 'Projects'), list, adder)),
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
            const row = target.closest<HTMLElement>('.project-row');
            if (!row) return undefined;
            if (target.closest('input') && getSelection()?.toString()) return null;
            const i = [...list.children].indexOf(row);
            const first = rows[i]!.links.map(l => linkPlace(l.url)).find(Boolean);
            return [
                first && { label: 'Visit', run: () => void window.open(first.href, '_blank', 'noopener') },
                { label: 'Add a link', run: () => addLink(i) },
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
