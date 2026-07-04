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

// Google Analytics 4 — injected into the <head> of EVERY page (incl. future blog posts).
const GA_ID = 'G-5KD888CEP2';
const googleAnalytics = {
  name: 'inject-ga4',
  transformIndexHtml() {
    return [
      {
        tag: 'script',
        attrs: { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${GA_ID}` },
        injectTo: 'head',
      },
      {
        tag: 'script',
        children:
          `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
          `gtag('js',new Date());gtag('config','${GA_ID}');`,
        injectTo: 'head',
      },
    ];
  },
};

export default defineConfig({
  base: '/',
  plugins: [googleAnalytics],
  build: {
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
    rollupOptions: { input },
  },
});
