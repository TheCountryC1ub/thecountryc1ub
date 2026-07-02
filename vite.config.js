import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const input = {
  main: resolve(__dirname, 'index.html'),
  story: resolve(__dirname, 'story.html'),
};

// Auto-include every blog page — drop a blog/<slug>.html file and it ships.
const blogDir = resolve(__dirname, 'blog');
if (existsSync(blogDir)) {
  for (const f of readdirSync(blogDir)) {
    if (f.endsWith('.html')) input['blog-' + f.replace(/\.html$/, '')] = resolve(blogDir, f);
  }
}

export default defineConfig({
  base: '/',
  build: {
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
    rollupOptions: { input },
  },
});
