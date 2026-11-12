// Photographs og.html into public/og.png, the picture shown when a link to
// the site is shared. Needs the dev server running (`npm run dev`) and Google
// Chrome installed. Run: npm run og
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PAGE = process.env.OG_PAGE ?? 'http://localhost:4173/og.html';
const out = fileURLToPath(new URL('../public/og.png', import.meta.url));

if (!existsSync(CHROME)) {
    console.error(`Chrome not found at ${CHROME}; set CHROME to its path.`);
    process.exit(1);
}

execFileSync(
    CHROME,
    [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--window-size=1200,630',
        // Time for the module to load, the avatar to decode and the cat to be drawn.
        '--virtual-time-budget=4000',
        '--default-background-color=ffffffff',
        `--screenshot=${out}`,
        PAGE,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
);
console.log(`public/og.png written from ${PAGE}`);
