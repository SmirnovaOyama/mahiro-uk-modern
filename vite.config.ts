import { defineConfig } from 'vite';

export default defineConfig({
    // Relative asset paths, so the built site works from any folder or domain.
    base: './',
    server: { port: 4173, strictPort: true },
    preview: { port: 4173, strictPort: true },
});
