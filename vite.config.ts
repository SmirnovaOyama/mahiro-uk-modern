import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig, type Plugin } from 'vite';

/**
 * KaTeX's stylesheet and fonts, copied to public/vendor/katex at a fixed
 * address, so the Worker can link them on just the pages that have math.
 */
function katexAssets(): Plugin {
    const from = 'node_modules/katex/dist';
    const to = 'public/vendor/katex';
    return {
        name: 'katex-assets',
        buildStart() {
            const version = JSON.parse(readFileSync('node_modules/katex/package.json', 'utf8')).version as string;
            if (existsSync(`${to}/VERSION`) && readFileSync(`${to}/VERSION`, 'utf8') === version) return;
            mkdirSync(`${to}/fonts`, { recursive: true });
            cpSync(`${from}/katex.min.css`, `${to}/katex.min.css`);
            // Every browser that runs this site reads woff2, so the older formats stay behind.
            for (const font of readdirSync(`${from}/fonts`).filter(f => f.endsWith('.woff2'))) cpSync(`${from}/fonts/${font}`, `${to}/fonts/${font}`);
            writeFileSync(`${to}/VERSION`, version);
        },
    };
}

export default defineConfig({
    // Absolute asset paths: reading pages live a folder or two deep (/writing/…).
    base: '/',
    // Runs worker/index.ts inside Vite in development, with a local D1 database.
    plugins: [katexAssets(), cloudflare()],
    environments: {
        // The pages; the Worker is its own environment, built from wrangler.jsonc's `main`.
        client: {
            build: {
                rollupOptions: {
                    input: {
                        // The sentence.
                        main: 'index.html',
                        // The editor, at /admin/.
                        admin: 'admin/index.html',
                        // The shell the Worker fills in for every reading page.
                        page: 'page.html',
                    },
                },
            },
        },
    },
    server: { port: 4173, strictPort: true },
    preview: { port: 4173, strictPort: true },
});
