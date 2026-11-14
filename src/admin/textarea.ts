// Markdown conveniences for a plain <textarea>. Edits go through
// execCommand('insertText') where it works, so ⌘Z undoes them like typing.

function replace(ta: HTMLTextAreaElement, start: number, end: number, text: string, selStart: number, selEnd: number): void {
    ta.focus();
    ta.setSelectionRange(start, end);
    if (!document.execCommand('insertText', false, text)) {
        ta.setRangeText(text, start, end, 'end');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    ta.setSelectionRange(selStart, selEnd);
}

/** **bold**, _italic_, `code`: wraps the selection, or unwraps it if it's already wrapped. */
export function wrap(ta: HTMLTextAreaElement, mark: string, placeholder: string): void {
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const inner = value.slice(s, e);
    if (value.slice(s - mark.length, s) === mark && value.slice(e, e + mark.length) === mark) {
        replace(ta, s - mark.length, e + mark.length, inner, s - mark.length, e - mark.length);
        return;
    }
    const text = inner || placeholder;
    replace(ta, s, e, `${mark}${text}${mark}`, s + mark.length, s + mark.length + text.length);
}

export function link(ta: HTMLTextAreaElement, url = 'https://'): void {
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const text = value.slice(s, e) || 'link text';
    const out = `[${text}](${url})`;
    const urlAt = s + text.length + 3;
    replace(ta, s, e, out, urlAt, urlAt + url.length);
}

/**
 * Enter inside a list carries the list on; Enter on an empty item ends it.
 * Returns true if it handled the key.
 */
export function continueList(ta: HTMLTextAreaElement): boolean {
    const { selectionStart: s, selectionEnd: e, value } = ta;
    if (s !== e) return false;
    const from = value.lastIndexOf('\n', s - 1) + 1;
    const line = value.slice(from, s);
    const m = /^(\s*)([-*+]|(\d+)\.)\s(\[[ xX]\]\s)?/.exec(line);
    if (!m) return false;
    if (line.length === m[0].length) {
        // An empty item: leave the list.
        replace(ta, from, s, '', from, from);
        return true;
    }
    const marker = m[3] ? `${Number(m[3]) + 1}.` : m[2];
    const insert = `\n${m[1]}${marker} ${m[4] ? '[ ] ' : ''}`;
    replace(ta, s, s, insert, s + insert.length, s + insert.length);
    return true;
}

/** Pasting an address over selected words makes them a link. */
export function pasteLink(ta: HTMLTextAreaElement, event: ClipboardEvent): void {
    const pasted = event.clipboardData?.getData('text/plain').trim() ?? '';
    if (ta.selectionStart === ta.selectionEnd || !/^https?:\/\/\S+$/.test(pasted)) return;
    event.preventDefault();
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const out = `[${value.slice(s, e)}](${pasted})`;
    replace(ta, s, e, out, s + out.length, s + out.length);
}

/** Puts `text` at the caret on a line of its own. */
export function insertBlock(ta: HTMLTextAreaElement, text: string): void {
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const before = s === 0 || value[s - 1] === '\n' ? '' : '\n';
    const after = value[e] === '\n' ? '' : '\n';
    const out = `${before}${text}${after}`;
    replace(ta, s, e, out, s + out.length, s + out.length);
}

/** Swaps one exact piece of text for another, wherever the writer has got to, keeping their caret where it was. */
export function swapText(ta: HTMLTextAreaElement, from: string, to: string): boolean {
    const at = ta.value.indexOf(from);
    if (at < 0) return false;
    const { selectionStart: s, selectionEnd: e } = ta;
    const shift = (n: number): number => (n <= at ? n : n >= at + from.length ? n + to.length - from.length : at + to.length);
    ta.setRangeText(to, at, at + from.length);
    ta.setSelectionRange(shift(s), shift(e));
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
}

/** "## ", "> ", "- " at the start of each line the selection touches; again takes it off. */
export function linePrefix(ta: HTMLTextAreaElement, mark: string): void {
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const from = value.lastIndexOf('\n', s - 1) + 1;
    const toAt = value.indexOf('\n', e);
    const to = toAt < 0 ? value.length : toAt;
    const lines = value.slice(from, to).split('\n');
    // Any heading, quote or list marker already there gives way to the new one.
    const strip = (l: string): string => l.replace(/^(#{1,6} |> |[-*+] |\d+\. )/, '');
    const all = lines.every(l => l.startsWith(mark));
    const out = lines.map(l => (all ? l.slice(mark.length) : mark + strip(l))).join('\n');
    replace(ta, from, to, out, from, from + out.length);
}

/** Cut, copy and paste for a menu, through the clipboard. False if the browser wouldn't allow it. */
export async function clip(ta: HTMLTextAreaElement, what: 'cut' | 'copy' | 'paste'): Promise<boolean> {
    const { selectionStart: s, selectionEnd: e, value } = ta;
    try {
        if (what === 'paste') {
            const text = await navigator.clipboard.readText();
            replace(ta, s, e, text, s + text.length, s + text.length);
            return true;
        }
        await navigator.clipboard.writeText(value.slice(s, e));
        if (what === 'cut') replace(ta, s, e, '', s, s);
        return true;
    } catch {
        ta.focus();
        return false;
    }
}
