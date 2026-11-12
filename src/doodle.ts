// Small hand-drawn marks in the tracker's doodle hand (see Doodle.tsx there):
// one line colour, one flat wash, paths a little off true, outlines that
// overshoot where they close. The heart is the tracker's own; the rest are
// drawn here in the same hand.

const wash = (d: string): string => `<path class="wash" d="${d}"/>`;
const line = (d: string): string => `<path d="${d}"/>`;

const DRAWINGS = {
    // A pointer coming down on a word, with two little marks where it lands.
    tap:
        wash(
            'M13.2 9.2 C 13.6 16, 13.2 23.4, 13.8 30 C 15.6 28, 17.4 26.2, 19.2 24.6 L 23.4 32.2 C 24.6 31.8, 25.6 31.2, 26.4 30.6 L 22.6 23 C 25.4 22.8, 28.2 22.6, 30.6 22.4 C 25 18, 19 13.6, 13.2 9.2 Z',
        ) +
        line(
            'M13.2 9.2 C 13.6 16, 13.2 23.4, 13.8 30 C 15.6 28, 17.4 26.2, 19.2 24.6 L 23.4 32.2 C 24.6 31.8, 25.6 31.2, 26.4 30.6 L 22.6 23 C 25.4 22.8, 28.2 22.6, 30.6 22.4 C 25 18, 19 13.6, 12.6 8.6',
        ) +
        line('M8.4 7.6 C 7.6 6.8, 6.8 6, 6 5.2') +
        line('M13.6 4.6 C 13.6 3.6, 13.4 2.8, 13.4 2'),
    // A folded strip with arrows pulling it open, up and down.
    unfold:
        wash(
            'M11.6 17.8 C 17 17.4, 23 18, 28.4 17.6 C 28.8 19.2, 28.6 20.8, 28.6 22.2 C 23 22.6, 17 22, 11.4 22.4 C 11.2 20.8, 11.4 19.2, 11.6 17.8 Z',
        ) +
        line(
            'M11.6 17.8 C 17 17.4, 23 18, 28.4 17.6 C 28.8 19.2, 28.6 20.8, 28.6 22.2 C 23 22.6, 17 22, 11.4 22.4 C 11.2 20.8, 11.4 19.2, 12.2 17.6',
        ) +
        line('M14 11.8 C 16 9.8, 18 7.8, 20 5.8 C 22.2 7.8, 24.2 9.8, 26.2 11.6') +
        line('M20 6.4 C 20.2 9, 19.8 11.6, 20 14') +
        line('M13.8 28.4 C 15.8 30.4, 17.8 32.4, 20 34.4 C 22.2 32.4, 24.2 30.4, 26.4 28.6') +
        line('M20 26.2 C 19.8 28.6, 20.2 31.2, 20 33.8'),
    // The same strip with the arrows pressing it shut.
    fold:
        wash(
            'M11.6 17.8 C 17 17.4, 23 18, 28.4 17.6 C 28.8 19.2, 28.6 20.8, 28.6 22.2 C 23 22.6, 17 22, 11.4 22.4 C 11.2 20.8, 11.4 19.2, 11.6 17.8 Z',
        ) +
        line(
            'M11.6 17.8 C 17 17.4, 23 18, 28.4 17.6 C 28.8 19.2, 28.6 20.8, 28.6 22.2 C 23 22.6, 17 22, 11.4 22.4 C 11.2 20.8, 11.4 19.2, 12.2 17.6',
        ) +
        line('M14.2 8.4 C 16.2 10.4, 18 12.4, 20 14.2 C 22 12.4, 24 10.4, 26 8.6') +
        line('M20 4.8 C 20.2 7.6, 19.8 10.6, 20 13.4') +
        line('M14 31.6 C 16 29.6, 18 27.6, 20 25.8 C 22.2 27.6, 24 29.6, 26.2 31.4') +
        line('M20 26.6 C 19.8 29.4, 20.2 32.4, 20 35.2'),
    // An envelope, the flap folded down to a soft point near the middle.
    mail:
        wash(
            'M7.4 11.6 C 15 11.2, 25 11.8, 32.8 11.4 C 33.2 17, 32.8 23, 33 28.8 C 25 29.2, 15 28.6, 7.2 29 C 6.8 23, 7.2 17, 7.4 11.6 Z',
        ) +
        line(
            'M7.4 11.6 C 15 11.2, 25 11.8, 32.8 11.4 C 33.2 17, 32.8 23, 33 28.8 C 25 29.2, 15 28.6, 7.2 29 C 6.8 23, 7.2 17, 7.8 11.2',
        ) +
        line('M8.2 12.6 C 12.2 15.6, 16 18.6, 20 21.2 C 24 18.6, 28 15.6, 32 12.4'),
    // A heart, the left lobe a little rounder than the right.
    heart:
        wash(
            'M20 31 C 14 26.6, 8.4 22.4, 8.6 16.4 C 8.8 12, 12.4 9.4, 15.8 9.8 C 18 10, 19.4 11.6, 20 13.4 C 20.8 11.4, 22.4 9.8, 24.8 9.8 C 28.4 9.8, 31.6 12.6, 31.2 17 C 30.8 22.6, 25.6 26.8, 20 31 Z',
        ) +
        line(
            'M20 31 C 14 26.6, 8.4 22.4, 8.6 16.4 C 8.8 12, 12.4 9.4, 15.8 9.8 C 18 10, 19.4 11.6, 20 13.4 C 20.8 11.4, 22.4 9.8, 24.8 9.8 C 28.4 9.8, 31.6 12.6, 31.2 17 C 30.8 22.6, 25.6 26.8, 19.6 31.4',
        ),
} as const;

export type DoodleName = keyof typeof DRAWINGS;

export const doodle = (name: DoodleName, className = 'doodle'): string =>
    `<svg class="${className}" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${DRAWINGS[name]}</svg>`;
