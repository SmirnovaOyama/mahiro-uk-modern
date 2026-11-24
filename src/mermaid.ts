import mermaid from 'mermaid';

mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    themeVariables: {
        primaryColor: '#faf0eb',
        primaryTextColor: '#242320',
        primaryBorderColor: '#ac624b',
        secondaryColor: '#f4f2ee',
        tertiaryColor: '#faf8f5',
        lineColor: '#655d55',
    },
    suppressErrorRendering: true,
});

let nextId = 0;

export async function renderDiagrams(blocks: NodeListOf<HTMLElement>): Promise<void> {
    for (const code of blocks) {
        const source = code.textContent;
        const pre = code.parentElement;
        if (!source?.trim() || !pre?.isConnected) continue;

        try {
            const { svg } = await mermaid.render(`article-diagram-${++nextId}`, source);
            if (!pre.isConnected) continue;

            const figure = document.createElement('figure');
            figure.className = 'mermaid-diagram';
            figure.tabIndex = 0;
            figure.setAttribute('aria-label', 'Mermaid diagram');
            figure.innerHTML = svg;
            const graphic = figure.querySelector('svg');
            const width = graphic?.viewBox.baseVal.width;
            if (graphic && width) graphic.setAttribute('width', String(width));
            pre.replaceWith(figure);
        } catch {
            // Leave the source readable when a diagram cannot render.
        }
    }
}
