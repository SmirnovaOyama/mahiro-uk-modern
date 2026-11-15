// With a mouse, a row is picked up and put down where it belongs; the others make room.
// Shared by a collection's articles and the friends list.

export interface Sortable {
    /** Starts following a row from its pointerdown, if that's where a drag can begin. */
    pickUp(li: HTMLElement, down: PointerEvent): void;
    /** A drag just ended, so the click that comes with it should be ignored. */
    readonly dragged: boolean;
}

export function sortable(list: HTMLElement, reorder: (from: number, to: number) => void): Sortable {
    let dragged = false;
    return {
        get dragged() {
            return dragged;
        },
        pickUp(li, down) {
            if (down.pointerType !== 'mouse' || down.button !== 0 || (down.target as Element).closest('.tool, input, textarea, select')) return;
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
        },
    };
}
