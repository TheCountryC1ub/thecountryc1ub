import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const input = {
  main: resolve(__dirname, 'index.html'),
  story: resolve(__dirname, 'story.html'),
  partners: resolve(__dirname, 'partners.html'),
  assessment: resolve(__dirname, 'assessment.html'),
  checkout: resolve(__dirname, 'checkout.html'),
  'thank-you': resolve(__dirname, 'thank-you.html'),
  account: resolve(__dirname, 'account.html'),
  dashboard: resolve(__dirname, 'dashboard.html'),
};

// /dashboard is Cameron's private reporting page — keep GA4/Pixel off it so
// checking the numbers never inflates the numbers.
const skipTracking = (ctx) => ctx.filename && ctx.filename.endsWith('dashboard.html');

// Auto-include every page in these content dirs — drop a <dir>/<slug>.html file and it ships.
// blog = articles · mentor = EGC coach profiles · pro = EGC playing-pro profiles
for (const dir of ['blog', 'mentor', 'pro']) {
  const abs = resolve(__dirname, dir);
  if (existsSync(abs)) {
    for (const f of readdirSync(abs)) {
      if (f.endsWith('.html')) input[dir + '-' + f.replace(/\.html$/, '')] = resolve(abs, f);
    }
  }
}

// Google Analytics 4 — injected into the <head> of EVERY page (incl. future blog posts).
const GA_ID = 'G-5KD888CEP2';
const googleAnalytics = {
  name: 'inject-ga4',
  transformIndexHtml(html, ctx) {
    if (skipTracking(ctx)) return [];
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
//   • Lead        on any "Download on iOS" (App Store) click  → free-app download intent
//   • ViewContent when the visitor scrolls past 50%           → higher-volume warm-up event
//   • AddToCart   fires on /assessment quiz completion (src/assessment.js)
// Membership model (2026-07-13): the app is free; the paid conversion is the WEB checkout
// ($36/yr 9 Hole Twilight Rate) — /checkout fires its own add_to_cart/begin_checkout(value 36)
// + InitiateCheckout, and the real Purchase fires server-side from the Fanbasis webhook later.
// GA4: App Store click = custom app_store_click (no fake value); begin_checkout now means
// the actual checkout page only.
const FB_ID = '27839343388989480';
const metaPixel = {
  name: 'inject-meta-pixel',
  transformIndexHtml(html, ctx) {
    if (skipTracking(ctx)) return [];
    return [
      {
        tag: 'script',
        children:
          `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');` +
          `fbq('init','${FB_ID}');fbq('track','PageView');` +
          `document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href*="apps.apple.com"]');if(a){if(window.fbq){fbq('track','Lead');}if(window.gtag){gtag('event','app_store_click',{link_url:a.href});}}},true);` +
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
