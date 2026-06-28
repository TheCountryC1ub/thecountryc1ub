import './style.css';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const BASE = import.meta.env.BASE_URL || '/';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch =
  window.matchMedia('(hover: none), (pointer: coarse)').matches ||
  window.innerWidth < 760;

const bgStage = document.querySelector('.bg-stage');
const bgVideo = document.getElementById('bg-video');
const bgPoster = document.getElementById('bg-poster');
const progressFill = document.getElementById('progress-fill');

/* Poster always set (mobile fallback + while video buffers) */
bgPoster.style.backgroundImage = `url("${BASE}poster.jpg")`;

/* ------------------------------------------------------------
   Smooth scroll (Lenis) wired to GSAP
   ------------------------------------------------------------ */
let lenis = null;
if (!reduceMotion) {
  lenis = new Lenis({
    lerp: 0.09,
    wheelMultiplier: 1,
    smoothWheel: true,
    syncTouch: false,
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* ------------------------------------------------------------
   Scroll-scrubbed background video
   ------------------------------------------------------------ */
let videoReady = false;
let videoDuration = 0;
let lastVideoT = -1;

const useVideo = !isTouch; // desktop / fine-pointer only

if (useVideo) {
  bgVideo.src = `${BASE}bg.mp4`;
  bgVideo.load();
  bgVideo.addEventListener('loadedmetadata', () => {
    videoDuration = bgVideo.duration || 0;
  });
  // 'canplay' / first seekable frame
  bgVideo.addEventListener('loadeddata', () => {
    videoReady = true;
    bgVideo.style.opacity = '1';
    bgPoster.style.opacity = '0';
    try { bgVideo.currentTime = 0.001; } catch (e) {}
    ScrollTrigger.refresh();
  });
  bgVideo.addEventListener('error', () => {
    // fall back to poster permanently
    videoReady = false;
    bgVideo.style.display = 'none';
    bgPoster.style.opacity = '1';
  });
} else {
  bgVideo.style.display = 'none';
  bgPoster.style.opacity = '1';
}

function scrubVideo(progress) {
  if (!useVideo || !videoReady || !videoDuration) return;
  const t = progress * (videoDuration - 0.05);
  if (Math.abs(t - lastVideoT) > 0.008) {
    bgVideo.currentTime = t;
    lastVideoT = t;
  }
}

/* Master document progress → video time + progress rail */
ScrollTrigger.create({
  trigger: document.documentElement,
  start: 'top top',
  end: 'bottom bottom',
  onUpdate: (self) => {
    scrubVideo(self.progress);
    if (progressFill) progressFill.style.width = (self.progress * 100).toFixed(2) + '%';
  },
});

/* ------------------------------------------------------------
   Show the video stage only behind video-background sections
   ------------------------------------------------------------ */
let activeVideoSections = 0;
function setStage() {
  bgStage.classList.toggle('is-active', activeVideoSections > 0);
}
document.querySelectorAll('[data-bg="video"]').forEach((section) => {
  ScrollTrigger.create({
    trigger: section,
    start: 'top 80%',
    end: 'bottom 20%',
    onToggle: (self) => {
      activeVideoSections += self.isActive ? 1 : -1;
      activeVideoSections = Math.max(0, activeVideoSections);
      setStage();
    },
  });
});
// hero is on screen at load
activeVideoSections = 1;
setStage();

/* ------------------------------------------------------------
   Reveal-on-scroll
   ------------------------------------------------------------ */
const revealEls = gsap.utils.toArray('[data-reveal]');
if (reduceMotion) {
  revealEls.forEach((el) => { el.style.opacity = '1'; el.style.transform = 'none'; });
} else {
  revealEls.forEach((el) => {
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: 1.05,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 88%',
        toggleActions: 'play none none none',
      },
    });
  });
}

/* ------------------------------------------------------------
   SIGNATURE MOMENT — "I" becomes "we"
   ------------------------------------------------------------ */
const promptStack = document.getElementById('prompt-stack');
if (promptStack) {
  const promptI = document.getElementById('prompt-i');
  const promptWe = document.getElementById('prompt-we');
  const strike = promptI.querySelector('.prompt__strike');
  const pronounI = promptI.querySelector('.prompt__pronoun');

  if (reduceMotion) {
    gsap.set(promptI, { opacity: 0.4 });
    gsap.set(strike, { scaleX: 1 });
    gsap.set(promptWe, { opacity: 1 });
  } else {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: promptStack,
        start: 'top 72%',
        end: 'bottom 42%',
        scrub: 0.8,
      },
    });

    tl
      // 1. "I" settles in, breathing
      .fromTo(promptI, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8 }, 0)
      .fromTo(pronounI, { color: 'rgba(255,255,255,0.85)' }, { color: '#D4B84A', duration: 0.4 }, 0.7)
      // 2. strike crosses the old prompt
      .to(strike, { scaleX: 1, duration: 0.7, ease: 'power2.inOut' }, 1.1)
      // 3. "I" dims and drifts
      .to(promptI, { opacity: 0.28, y: -14, duration: 0.7 }, 1.3)
      // 4. "we" rises in gold
      .fromTo(promptWe, { opacity: 0, y: 34 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' }, 1.6);
  }
}

/* ------------------------------------------------------------
   APP SHOWCASE — expand-on-hover gallery
   ------------------------------------------------------------ */
const shotsRow = document.getElementById('shots-row');
if (shotsRow) {
  const shots = Array.from(shotsRow.querySelectorAll('.shot'));
  const capLabel = document.getElementById('shots-caption-label');
  const capSub = document.getElementById('shots-caption-sub');
  const DEFAULT_ACTIVE = 3; // visually balanced for 7 screens

  function setActive(i) {
    shots.forEach((s, k) => {
      const on = k === i;
      s.classList.toggle('is-active', on);
      s.setAttribute('aria-selected', on ? 'true' : 'false');
      s.tabIndex = on ? 0 : -1;
    });
    const s = shots[i];
    if (capLabel) capLabel.textContent = s.dataset.label || '';
    if (capSub) capSub.innerHTML = s.dataset.sub || '';
  }

  shots.forEach((s, i) => {
    if (!isTouch) {
      s.addEventListener('mouseenter', () => setActive(i));
      s.addEventListener('focus', () => setActive(i));
    }
    s.addEventListener('click', () => setActive(i));
    // arrow-key navigation across the filmstrip
    s.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const next = (i + dir + shots.length) % shots.length;
        setActive(next);
        shots[next].focus();
      }
    });
  });

  setActive(DEFAULT_ACTIVE);

  // "Hover" doesn't make sense on touch devices
  if (isTouch) {
    const verb = document.querySelector('.showcase__verb');
    if (verb) verb.textContent = 'Swipe';
  }
}

/* ------------------------------------------------------------
   Scroll-driven rolling golf ball → drops in the hole
   ------------------------------------------------------------ */
const ballEl = document.getElementById('golfball');
const holeEl = document.getElementById('hole');
const ballEnabled =
  ballEl && !isTouch && !reduceMotion &&
  window.matchMedia('(min-width: 1366px) and (hover: hover) and (pointer: fine)').matches;

if (ballEnabled) {
  const sphereEl = ballEl.querySelector('.golfball__sphere');
  const teeEl = document.getElementById('tee');
  const R = 20;                       // ball radius
  const LANE_X = 48;                  // lane centre x
  const CIRC = Math.PI * (R * 2);     // ball circumference (px)
  const FLICK = 0.05;                 // progress spent launching off the tee
  const ROLL_END = 0.9;               // progress at which the drop begins

  // classic bounce easing — gives the ball its settle in the cup
  function easeOutBounce(x) {
    const n1 = 7.5625, d1 = 2.75;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) { x -= 1.5 / d1; return n1 * x * x + 0.75; }
    if (x < 2.5 / d1) { x -= 2.25 / d1; return n1 * x * x + 0.9375; }
    x -= 2.625 / d1; return n1 * x * x + 0.984375;
  }

  function updateBall(progress, scrollPx) {
    const vh = window.innerHeight;
    const topY = 84;
    const bottomY = vh - 168;
    const holeX = 60;                 // matches .hole__pit centre
    const holeY = vh - 58;

    // baseline position along the rolling lane (kept continuous across phases)
    const rollCy = topY + (bottomY - topY) * (progress / ROLL_END);
    let cx, cy, scale = 1, opacity = 1;

    if (progress < FLICK) {
      // launch off the tee: a small arc up-and-out, landing back on the lane
      const p = progress / FLICK;
      const arc = Math.sin(p * Math.PI);
      cx = LANE_X + 8 * arc;
      cy = rollCy - 32 * arc;
    } else if (progress <= ROLL_END) {
      cx = LANE_X;
      cy = rollCy;
    } else {
      // drop into the cup with a bounce-settle
      const p = (progress - ROLL_END) / (1 - ROLL_END);   // 0 → 1
      cx = LANE_X + (holeX - LANE_X) * Math.min(1, p * 1.3);
      cy = bottomY + (holeY - bottomY) * easeOutBounce(Math.min(1, p * 1.1));
      const sink = Math.max(0, (p - 0.62) / 0.38);          // sink in once settled
      scale = 1 - 0.62 * sink;
      opacity = 1 - sink;
    }

    const rot = (scrollPx / CIRC) * 360;                    // roll synced to distance
    ballEl.style.opacity = opacity.toFixed(3);
    ballEl.style.transform = `translate3d(${(cx - R).toFixed(1)}px, ${(cy - R).toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
    sphereEl.style.transform = `rotate(${rot.toFixed(1)}deg)`;
    holeEl.style.opacity = progress > 0.8 ? Math.min(1, (progress - 0.8) / 0.1).toFixed(3) : '0';
    if (teeEl) {
      teeEl.style.opacity = progress < 0.012
        ? '1'
        : Math.max(0, 1 - (progress - 0.012) / 0.04).toFixed(3);
    }
  }

  ScrollTrigger.create({
    trigger: document.documentElement,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => updateBall(self.progress, self.scroll()),
  });
  updateBall(0, 0);
}

/* ------------------------------------------------------------
   Refresh after fonts load (layout shift safety)
   ------------------------------------------------------------ */
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => ScrollTrigger.refresh());
}
window.addEventListener('load', () => ScrollTrigger.refresh());
