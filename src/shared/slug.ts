// Addresses made from titles. Apart from markdown.ts so the editor can make
// them without carrying the markdown and math renderers.
import { pinyin } from 'pinyin-pro';

/** The longest an address may be. Pinyin runs to about four letters a character, so a long Chinese title still fits whole. */
export const SLUG_MAX = 120;

/** Whether any of it is written in Chinese characters. */
export const hasHan = (s: string): boolean => /\p{Script=Han}/u.test(s);

/** Chinese read out in pinyin, a syllable at a time and without tones; anything else is left as it is. */
const romanise = (s: string): string => (hasHan(s) ? pinyin(s, { toneType: 'none', type: 'array', nonZh: 'consecutive', v: true }).join(' ') : s);

/**
 * "Hello, World!" → "hello-world"; "广式肠粉" → "guang-shi-chang-fen".
 * Chinese is written in pinyin, so an address is plain letters wherever it is
 * pasted; letters of other scripts are kept. One that would run too long
 * stops at the end of a word.
 */
export const slugify = (s: string): string => {
    const slug = romanise(s.normalize('NFKD'))
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '');
    if (slug.length <= SLUG_MAX) return slug;
    const cut = slug.slice(0, SLUG_MAX + 1).lastIndexOf('-');
    return slug.slice(0, cut > SLUG_MAX / 2 ? cut : SLUG_MAX).replace(/-+$/, '');
};

export const SLUG = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;
