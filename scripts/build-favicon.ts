// Draws the curled-up pixel cat as public/favicon.svg, with the light theme's
// colours read from design/tokens.json. Run: npm run favicon
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { catMarkup, CAT_GRID } from '../src/cat.ts';

interface ColorToken {
    name: string;
    value: string | { light?: string; dark?: string };
}

const root = new URL('..', import.meta.url);
const tokens = JSON.parse(readFileSync(new URL('design/tokens.json', root), 'utf8')) as {
    color: { tokens: ColorToken[] };
};

const paint = (name: string): string => {
    const value = tokens.color.tokens.find(t => t.name === name)?.value;
    const colour = typeof value === 'string' ? value : value?.light;
    if (!colour) throw new Error(`No light value for the token ${name}`);
    return colour;
};

// The grid is 26 by 15; centre it in a square so the tab icon is not squashed.
const side = CAT_GRID.width;
const top = (side - CAT_GRID.height) / 2;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges"><g transform="translate(0 ${top})">${catMarkup(
    { pose: 'donut', state: 'napping', paint },
).replace(/ class="[^"]*"/g, '')}</g></svg>
`;

mkdirSync(new URL('public/', root), { recursive: true });
writeFileSync(new URL('public/favicon.svg', root), svg);
console.log(`public/favicon.svg: ${svg.length} bytes`);
