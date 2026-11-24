import mermaid from 'mermaid';
import type { Theme } from './types.ts';

const standardSecureKeys = mermaid.mermaidAPI.getSiteConfig().secure ?? [];
const palettes = {
    light: {
        primaryColor: '#faf0eb',
        primaryTextColor: '#242320',
        primaryBorderColor: '#ac624b',
        secondaryColor: '#f4f2ee',
        tertiaryColor: '#faf8f5',
        lineColor: '#655d55',
    },
    dark: {
        darkMode: true,
        background: '#22211f',
        primaryColor: '#453028',
        primaryTextColor: '#faf9f7',
        primaryBorderColor: '#dc947d',
        secondaryColor: '#302f2c',
        tertiaryColor: '#292825',
        lineColor: '#c6bbb2',
        textColor: '#faf9f7',
        edgeLabelBackground: '#22211f',
        dropShadow: 'none',
    },
};

const figures = new WeakMap<HTMLElement, HTMLElement>();
let nextId = 0;
let pending = Promise.resolve();

export function renderDiagrams(blocks: NodeListOf<HTMLElement>, theme: Theme, isCurrent: () => boolean): Promise<void> {
    // Mermaid's configuration is global. Keep it stable until this batch is done.
    pending = pending.catch(() => {}).then(async () => {
        if (!isCurrent()) return;
        mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: 'base',
            themeVariables: palettes[theme],
            // In dark mode, prevent an embedded light theme from making the canvas bright.
            secure: theme === 'dark' ? [...standardSecureKeys, 'theme', 'themeVariables', 'themeCSS'] : standardSecureKeys,
            fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
            suppressErrorRendering: true,
        });
        for (const code of blocks) {
            if (!isCurrent()) return;
            const source = code.textContent;
            const figure = figures.get(code);
            const host = figure ?? code.parentElement;
            if (!source?.trim() || !host?.isConnected || figure?.dataset.diagramTheme === theme) continue;
            try {
                const { svg } = await mermaid.render(`article-diagram-${++nextId}`, source);
                if (!isCurrent() || !host.isConnected) continue;

                const diagram = figure ?? document.createElement('figure');
                const scrollLeft = diagram.scrollLeft;
                diagram.className = 'mermaid-diagram';
                diagram.dataset.mermaidSource = source;
                diagram.dataset.diagramTheme = theme;
                diagram.tabIndex = 0;
                diagram.setAttribute('aria-label', 'Mermaid diagram');
                diagram.innerHTML = svg;
                const graphic = diagram.querySelector('svg');
                const width = graphic?.viewBox.baseVal.width;
                if (graphic && width) graphic.setAttribute('width', String(width));
                if (!figure) {
                    host.replaceWith(diagram);
                    figures.set(code, diagram);
                }
                diagram.scrollLeft = scrollLeft;
            } catch {
                // If rendering fails, give the reader the source.
                if (figure && isCurrent() && host.isConnected && code.parentElement) {
                    figure.replaceWith(code.parentElement);
                    figures.delete(code);
                }
            }
        }
    });
    return pending;
}
