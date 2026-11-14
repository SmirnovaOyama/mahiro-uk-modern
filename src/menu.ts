// The right-click menu, shared by the editor and the reading pages. It only
// ever adds: hold Shift, right-click a second time, or use a finger, and the
// browser's own menu comes up as usual. Links, pictures and anything else a
// page doesn't ask about keep the browser's menu too.
import './styles/menu.css';

export interface MenuItem {
    label: string;
    /** Shown on the right, as a reminder: ⌘B. */
    keys?: string;
    /** What it does. Return a word (“Copied”) to show it briefly before the menu goes. */
    run: () => void | string | Promise<void | string>;
    danger?: boolean;
    disabled?: boolean;
}
/** Falsy entries are skipped, so a menu can say `ready && { … }`. */
export type MenuEntry = MenuItem | 'gap' | null | false | undefined | '';

/** Given what was right-clicked, the menu to show for it, or nothing for the browser's own. */
export type MenuFor = (target: Element, event: MouseEvent) => MenuEntry[] | null;

let open: { el: HTMLElement; close: (restore: boolean) => void } | null = null;

export function closeMenu(): void {
    open?.close(false);
}

function show(entries: MenuEntry[], x: number, y: number, byKeyboard: boolean): void {
    closeMenu();
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = entries.filter((e, i, all): e is MenuItem | 'gap' => {
        if (!e) return false;
        // No gap at either end, and never two together.
        if (e !== 'gap') return true;
        const before = all.slice(0, i).some(x => x && x !== 'gap');
        const after = all.slice(i + 1).find(x => x);
        return before && Boolean(after) && after !== 'gap';
    });
    if (!items.some(e => e !== 'gap')) return;

    const el = document.createElement('div');
    el.className = 'menu';
    el.setAttribute('role', 'menu');
    el.tabIndex = -1;

    const buttons: HTMLButtonElement[] = [];
    for (const entry of items) {
        if (entry === 'gap') {
            el.append(Object.assign(document.createElement('div'), { className: 'menu-gap', role: 'separator' }));
            continue;
        }
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `menu-item${entry.danger ? ' is-danger' : ''}`;
        b.setAttribute('role', 'menuitem');
        b.disabled = Boolean(entry.disabled);
        const label = Object.assign(document.createElement('span'), { className: 'menu-label', textContent: entry.label });
        b.append(label);
        if (entry.keys) b.append(Object.assign(document.createElement('kbd'), { className: 'menu-keys', textContent: entry.keys }));
        b.addEventListener('click', async () => {
            if (b.disabled) return;
            buttons.forEach(x => (x.disabled = true));
            close(true);
            const said = await entry.run();
            if (typeof said === 'string') echo(said, x, y);
        });
        // Pointing at an item is the same as reaching it by keyboard.
        b.addEventListener('pointermove', () => b.disabled || b.focus({ preventScroll: true }));
        buttons.push(b);
        el.append(b);
    }

    document.body.append(el);
    // Open beside the pointer, turned back from any edge it would cross.
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    const left = x + width + pad > innerWidth ? Math.max(pad, x - width) : x;
    const top = y + height + pad > innerHeight ? Math.max(pad, y - height) : y;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.transformOrigin = `${left < x ? 'right' : 'left'} ${top < y ? 'bottom' : 'top'}`;

    const live = (): HTMLButtonElement[] => buttons.filter(b => !b.disabled);
    const step = (by: number): void => {
        const list = live();
        if (!list.length) return;
        const at = list.indexOf(document.activeElement as HTMLButtonElement);
        list[at < 0 ? (by > 0 ? 0 : list.length - 1) : (at + by + list.length) % list.length]!.focus();
    };
    if (byKeyboard) live()[0]?.focus();
    else el.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') (e.preventDefault(), close(true));
        else if (e.key === 'ArrowDown') (e.preventDefault(), step(1));
        else if (e.key === 'ArrowUp') (e.preventDefault(), step(-1));
        else if (e.key === 'Home') (e.preventDefault(), live()[0]?.focus());
        else if (e.key === 'End') (e.preventDefault(), live().at(-1)?.focus());
        else if (e.key === 'Tab') (e.preventDefault(), close(true));
        else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
            // A letter jumps to the next item starting with it.
            const list = live();
            const from = list.indexOf(document.activeElement as HTMLButtonElement);
            const next = [...list.slice(from + 1), ...list.slice(0, from + 1)].find(b => b.textContent!.toLowerCase().startsWith(e.key.toLowerCase()));
            next?.focus();
        }
    };
    const onDown = (e: PointerEvent): void => {
        if (!el.contains(e.target as Node)) close(false);
    };
    const onAway = (): void => close(false);

    function close(restore: boolean): void {
        if (open?.el !== el) return;
        open = null;
        removeEventListener('keydown', onKey, true);
        removeEventListener('pointerdown', onDown, true);
        removeEventListener('resize', onAway);
        removeEventListener('blur', onAway);
        document.removeEventListener('scroll', onAway, true);
        el.classList.add('is-leaving');
        el.addEventListener('animationend', () => el.remove(), { once: true });
        setTimeout(() => el.remove(), 300);
        if (restore && returnTo?.isConnected) returnTo.focus({ preventScroll: true });
    }

    addEventListener('keydown', onKey, true);
    addEventListener('pointerdown', onDown, true);
    addEventListener('resize', onAway);
    addEventListener('blur', onAway);
    document.addEventListener('scroll', onAway, true);
    open = { el, close };
}

/** A word where the menu was (“Copied”), gone a moment later. */
function echo(word: string, x: number, y: number): void {
    const el = Object.assign(document.createElement('div'), { className: 'menu-echo', textContent: word, role: 'status' });
    document.body.append(el);
    const { width } = el.getBoundingClientRect();
    el.style.left = `${Math.min(Math.max(8, x), innerWidth - width - 8)}px`;
    el.style.top = `${Math.max(8, y - 36)}px`;
    setTimeout(() => el.classList.add('is-leaving'), 900);
    setTimeout(() => el.remove(), 1300);
}

/**
 * Listens for right-clicks within `root`. Shift, a second right-click while
 * the menu is open, or a touch, all get the browser's menu instead.
 */
export function contextMenu(root: Document | HTMLElement, menuFor: MenuFor): void {
    root.addEventListener('contextmenu', event => {
        const e = event as MouseEvent & { pointerType?: string };
        if (e.defaultPrevented || e.shiftKey) return;
        if (e.pointerType === 'touch' || e.pointerType === 'pen') return;
        if (open) {
            // Asked twice: they want the browser's own.
            closeMenu();
            return;
        }
        const target = e.target instanceof Element ? e.target : null;
        if (!target) return;
        const entries = menuFor(target, e);
        if (!entries) return;
        e.preventDefault();
        // From the keyboard (the menu key, or Shift-F10 where it reaches us) there is no pointer; open under what has focus.
        const byKeyboard = e.button !== 2 || (e.clientX === 0 && e.clientY === 0);
        if (byKeyboard) {
            const r = (document.activeElement ?? target).getBoundingClientRect();
            show(entries, r.left + 12, Math.min(r.bottom, r.top + 32), true);
        } else show(entries, e.clientX, e.clientY, false);
    });
}

/** Copies text, saying so if it worked. */
export async function copy(text: string, said = 'Copied'): Promise<string | void> {
    try {
        await navigator.clipboard.writeText(text);
        return said;
    } catch {
        // Where the clipboard API is refused, the old way still works within the click.
        const held = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const ta = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.append(ta);
        ta.select();
        const done = document.execCommand('copy');
        ta.remove();
        held?.focus({ preventScroll: true });
        return done ? said : 'Couldn’t copy';
    }
}

/** ⌘ on a Mac, Ctrl elsewhere, for the reminders on the right. */
export const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';
