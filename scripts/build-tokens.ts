// Turns design/tokens.json (the Oyama design system's tokens, copied as is)
// into src/styles/tokens.css. Run: npm run tokens
import { readFileSync, writeFileSync } from 'node:fs';

type Themed = { light?: string; dark?: string };
type TokenValue = string | number | Themed;
interface Token {
    name: string;
    value: TokenValue;
}
interface TokenFile {
    name: string;
    type: { families: Record<string, string> };
    [family: string]: unknown;
}

const root = new URL('..', import.meta.url);
const tokens = JSON.parse(readFileSync(new URL('design/tokens.json', root), 'utf8')) as TokenFile;

const light: [string, string | number][] = [];
const dark: [string, string | number][] = [];

const push = (name: string, value: TokenValue): void => {
    if (typeof value === 'string' || typeof value === 'number') {
        light.push([name, value]);
        return;
    }
    if (value.light !== undefined) light.push([name, value.light]);
    if (value.dark !== undefined) dark.push([name, value.dark]);
};

for (const [family, body] of Object.entries(tokens)) {
    if (family === 'type') {
        for (const [key, stack] of Object.entries(tokens.type.families)) push(`font-${key}`, stack);
        continue;
    }
    const list = (body as { tokens?: Token[] } | null)?.tokens;
    if (!Array.isArray(list)) continue;
    for (const t of list) push(t.name, t.value);
}

const block = (rows: [string, string | number][], indent: string): string =>
    rows.map(([n, v]) => `${indent}--${n}: ${v};`).join('\n');

const css = `/* ${tokens.name} — generated from design/tokens.json by scripts/build-tokens.ts. Do not edit. */
:root {
    color-scheme: light;
${block(light, '    ')}
}

@media (prefers-color-scheme: dark) {
    :root:not([data-theme='light']) {
        color-scheme: dark;
${block(dark, '        ')}
    }
}

:root[data-theme='dark'] {
    color-scheme: dark;
${block(dark, '    ')}
}
`;

writeFileSync(new URL('src/styles/tokens.css', root), css);
console.log(`src/styles/tokens.css: ${light.length} tokens, ${dark.length} dark overrides`);
