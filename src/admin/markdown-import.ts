// Import the conventional Markdown + figures/ folder exported by document tools.
// Only standalone, inline Markdown images are rewritten; prose, tables, fenced
// code, Mermaid and remote images are kept byte-for-byte.
export interface FigureReference {
    start: number;
    end: number;
    path: string;
}

const figureLine = /^ {0,3}!\[(?:\\.|[^\]\\])*\]\([ \t]*(?:<([^>\n]+)>|([^\s()<>]+))(?=[ \t)]).*?\)[ \t]*$/;
const mime: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml',
};

function normalize(path: string): string {
    const parts: string[] = [];
    for (const part of path.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') {
            if (!parts.length) throw new Error('An image path leaves the selected folder.');
            parts.pop();
        } else parts.push(part);
    }
    return parts.join('/');
}

export function figureReferences(markdown: string, documentPath: string): FigureReference[] {
    const base = documentPath.split('/').slice(0, -1).join('/');
    const refs: FigureReference[] = [];
    let fence = '';
    let offset = 0;
    for (const line of markdown.split('\n')) {
        const text = line.replace(/\r$/, '');
        const marker = /^ {0,3}(\x60{3,}|~{3,})(.*)$/.exec(text);
        if (marker) {
            const mark = marker[1]!;
            if (!fence) fence = mark;
            else if (mark[0] === fence[0] && mark.length >= fence.length && !marker[2]!.trim()) fence = '';
        } else if (!fence) {
            const match = figureLine.exec(text);
            const href = match?.[1] ?? match?.[2];
            if (match && href && !/^(?:[a-z][a-z\d+.-]*:|\/|#|\?)/i.test(href)) {
                // Use the original spelling to replace only the destination,
                // never the alt text or the optional caption/title.
                const afterAlt = text.indexOf('](', text.indexOf('![') + 2) + 2;
                // The matched destination is at the end of the image's opening
                // syntax; escaped closing brackets in alt text are supported.
                const opening = /^ {0,3}!\[(?:\\.|[^\]\\])*\]\([ \t]*<?/.exec(text)!;
                const start = opening[0].length;
                if (afterAlt > 1) {
                    const path = normalize(base + '/' + decodeURIComponent(href));
                    refs.push({ start: offset + start, end: offset + start + href.length, path });
                }
            }
        }
        offset += line.length + 1;
    }
    return refs;
}

export function rewriteFigures(markdown: string, refs: FigureReference[], urls: ReadonlyMap<string, string>): string {
    let result = markdown;
    for (const ref of [...refs].reverse()) {
        const url = urls.get(ref.path);
        if (!url) throw new Error('Missing figure: ' + ref.path);
        result = result.slice(0, ref.start) + url + result.slice(ref.end);
    }
    return result;
}

/** Resolve all files before uploading anything, and upload each figure once. */
export async function importMarkdownFolder(files: File[], upload: (file: Blob) => Promise<{ url: string }>): Promise<string> {
    const documents = files.filter(f => /\.(?:md|markdown)$/i.test(f.name));
    if (documents.length !== 1) throw new Error('Choose a folder containing exactly one Markdown file.');
    const doc = documents[0]!;
    const pathOf = (f: File): string => f.webkitRelativePath || f.name;
    const markdown = await doc.text();
    const refs = figureReferences(markdown, pathOf(doc));
    const byPath = new Map(files.map(f => [pathOf(f), f]));
    const images = new Map<string, Blob>();
    for (const path of new Set(refs.map(ref => ref.path))) {
        const file = byPath.get(path);
        const type = mime[path.split('.').pop()!.toLowerCase()];
        if (!file || !type) throw new Error('Missing or unsupported figure: ' + path);
        if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('Figure must be between 1 byte and 20 MB: ' + path);
        images.set(path, file.type === type ? file : new Blob([file], { type }));
    }
    // The server limits the body to 500,000 characters. Reserve more than
    // enough room for each /media/ URL before starting any uploads.
    if (markdown.length + refs.length * 64 > 500_000) throw new Error('This Markdown file is too long.');
    const urls = new Map<string, string>();
    for (const [path, file] of images) urls.set(path, (await upload(file)).url);
    return rewriteFigures(markdown, refs, urls);
}
