// Addresses made from titles. Apart from markdown.ts so the editor can make
// them without carrying the markdown and math renderers.

/** "Hello, World!" → "hello-world". Letters of any script are kept, so Chinese titles make Chinese slugs. */
export const slugify = (s: string): string =>
    s
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80)
        .replace(/-+$/, '');

export const SLUG = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;
