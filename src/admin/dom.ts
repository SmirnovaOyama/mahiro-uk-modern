type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { class?: string };

/**
 * A small element builder: h('button', { class: 'x', onclick: fn }, 'Label').
 * `on…` keys become listeners, `class` the class name, and anything the
 * element has as a property is set as one; the rest become attributes.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props ?? {})) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'class') el.className = String(value);
        else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value as EventListener);
        else if (key in el && !key.includes('-')) (el as unknown as Record<string, unknown>)[key] = value;
        else el.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children) if (child !== null && child !== undefined && child !== false) el.append(typeof child === 'number' ? String(child) : child);
    return el;
}

/** An SVG string (from icons.ts) as a node. */
export function svg(markup: string): Element {
    const holder = document.createElement('span');
    holder.innerHTML = markup;
    return holder.firstElementChild!;
}
