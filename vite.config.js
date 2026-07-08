import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const input = {
  main: resolve(__dirname, 'index.html'),
  story: resolve(__dirname, 'story.html'),
  partners: resolve(__dirname, 'partners.html'),
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

// Meta (Facebook) Pixel — base PageView on every page, plus:
//   • Lead        on any "Download on iOS" (App Store) click  → optimize ads for this
//   • ViewContent when the visitor scrolls past 50%           → higher-volume warm-up event
// Same click also fires GA4 add_to_cart (App Store click = the funnel's "add to cart" step;
// value/currency set so it can be imported into Google Ads as a value-based conversion).
const FB_ID = '27839343388989480';
const metaPixel = {
  name: 'inject-meta-pixel',
  transformIndexHtml() {
    return [
      {
        tag: 'script',
        children:
          `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');` +
          `fbq('init','${FB_ID}');fbq('track','PageView');` +
          `document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href*="apps.apple.com"]');if(a){if(window.fbq){fbq('track','Lead');}if(window.gtag){gtag('event','add_to_cart',{currency:'USD',value:14.99,items:[{item_id:'elite-golf-consulting-app',item_name:'Elite Golf Consulting App',price:14.99,quantity:1}]});}}},true);` +
          `(function(){var fired=false;function onScroll(){if(fired)return;var el=document.documentElement;if((window.scrollY+window.innerHeight)/el.scrollHeight>0.5){fired=true;if(window.fbq)fbq('track','ViewContent');window.removeEventListener('scroll',onScroll);}}window.addEventListener('scroll',onScroll,{passive:true});})();`,
        injectTo: 'head',
      },
      {
        tag: 'noscript',
        children: `<img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${FB_ID}&ev=PageView&noscript=1"/>`,
        injectTo: 'body',
      },
    ];
  },
};

export default defineConfig({
  base: '/',
  plugins: [googleAnalytics, metaPixel],
  build: {
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
    rollupOptions: { input },
  },
});
