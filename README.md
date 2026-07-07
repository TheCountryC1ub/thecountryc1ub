# Elite Golf Consulting — Landing Page

A single-page, scroll-driven landing page for the Elite Golf Consulting iOS app.
Built with **Vite + vanilla JS**, **GSAP ScrollTrigger**, and **Lenis** smooth scroll.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
```

## Build

```bash
npm run build    # outputs to dist/
npm run preview  # preview the production build
```

## Deploy (Vercel)

This is a static Vite build. Vercel auto-detects it:

- **Framework preset:** Vite
- **Build command:** `npm run build`
- **Output directory:** `dist`

## Before launch

- Replace the `{{APP_STORE_URL}}` placeholder (×6) in `index.html` with the real App Store link.
- The privacy link points to `https://elitegolfconsulting.com/privacy`.

## Notes

- The scroll-scrubbed background video (`public/bg.mp4`) is desktop-only; touch devices show `public/poster.jpg`.
- The rolling-golf-ball animation is desktop-only (≥1366px) and respects `prefers-reduced-motion`.


---
Related: [[EGC Hub]] · [[HANDOFF]] · [[tracking-pixel]]
