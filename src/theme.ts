// The light/dark switch, shared by the sentence, the reading pages and the editor.
// A small script in each page's <head> applies a saved choice before first paint.
import { icon } from './icons.ts';
import type { Theme } from './types.ts';

const darkQuery = matchMedia('(prefers-color-scheme: dark)');

export const currentTheme = (): Theme => {
    const set = document.documentElement.dataset.theme;
    return set === 'light' || set === 'dark' ? set : darkQuery.matches ? 'dark' : 'light';
};

export interface ThemeLabels {
    toDark: string;
    toLight: string;
}

/** Draws the button for the theme now showing, and keeps it right as the theme changes. */
export function mountThemeButton(button: HTMLButtonElement, labels: () => ThemeLabels, onChange?: () => void): void {
    const paint = (): void => {
        const theme = currentTheme();
        button.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon', 18);
        button.setAttribute('aria-label', theme === 'dark' ? labels().toLight : labels().toDark);
        onChange?.();
    };
    button.addEventListener('click', () => {
        const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        try {
            localStorage.setItem('site-theme', next);
        } catch {
            // The choice then lasts for this visit only.
        }
        paint();
    });
    darkQuery.addEventListener('change', paint);
    paint();
}
