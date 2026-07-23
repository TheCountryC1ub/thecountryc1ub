/* ============================================================
   Complimentary Golf Assessment — /assessment
   One-question-at-a-time survey funnel. No backend: answers are
   a micro-commitment device; final submit fires the conversion
   (Meta AddToCart + GA4 add_to_cart) and hands off to /story.
   ============================================================ */

const STEPS = [
  {
    // Landing = promise + question 1 on one screen (answering IS the start — no extra click).
    type: 'options', key: 'goal', landing: true,
    kicker: 'Complimentary Golf Assessment',
    heading: 'Shoot 4–8 shots better.',
    dek: 'Understand your game — and your mind. Answer 11 quick questions and get your personalized path to lower scores.',
    fine: 'Free · No email required · About 60 seconds',
    title: 'What would you like to achieve?',
    quote: 'The more aware you are about your game & goals the faster you will improve.',
    options: ['Break 100', 'Break 90', 'Break 80', 'Break 70', 'Compete in big tournaments', 'Play on the PGA Tour'],
  },
  {
    type: 'options', key: 'favorite_club', cols: 2,
    title: 'What’s your favorite club to hit?',
    options: ['Driver', 'Fairway wood', 'Hybrid', 'Long irons', 'Mid irons', 'Short irons', 'Wedges', 'Putter'],
  },
  { type: 'slider', key: 'overall',   title: 'How would you rate your overall game?' },
  { type: 'slider', key: 'tee',       title: 'How would you rate your game off the tee?' },
  { type: 'slider', key: 'irons',     title: 'How would you rate your iron play?' },
  { type: 'slider', key: 'wedges',    title: 'How would you rate your wedge play?', sub: '30 yards and out' },
  { type: 'slider', key: 'chipping',  title: 'How would you rate your chipping?' },
  { type: 'slider', key: 'putting',   title: 'How would you rate your putting?' },
  { type: 'slider', key: 'putt_short', title: 'Short putts?', sub: 'Inside 6 feet' },
  { type: 'slider', key: 'putt_long',  title: 'Long putts?', sub: 'Outside 25 feet' },
  {
    type: 'options', key: 'coaching',
    title: 'Have you gotten golf consulting before — from top players or a pro golfer?',
    options: [
      'Yes',
      'No',
      'Just some golf lessons',
      'I have a coach, but they never played big tournaments & events',
    ],
  },
];

const QUESTION_COUNT = STEPS.length;
const DEST = '/story?from=assessment';

const mount = document.getElementById('qz');
const progressFill = document.getElementById('qz-progress-fill');
const answers = {};
let current = 0;

function setProgress() {
  progressFill.style.width = `${(current / QUESTION_COUNT) * 100}%`;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/* Birdie chirp on every answer tap — two quick songbird "chips" synthesized
   with Web Audio (no file to load): fast upward sine sweeps with a soft
   attack and a little downward tail. Context is created lazily inside the
   first click, which is the user gesture browsers require before sound. */
let clickCtx = null;

function chirp(t, f0, f1, dur, vol) {
  const osc = clickCtx.createOscillator();
  const g = clickCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
  osc.frequency.exponentialRampToValueAtTime(f1 * 0.82, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(clickCtx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

function playClick() {
  try {
    clickCtx = clickCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (clickCtx.state === 'suspended') clickCtx.resume();
    const t = clickCtx.currentTime;
    // "chip-chip" — second note a touch higher and shorter
    chirp(t, 2300, 3900, 0.07, 0.09);
    chirp(t + 0.085, 2700, 4300, 0.06, 0.07);
  } catch (_) { /* sound is decoration — never block the funnel */ }
}

function show(i, dir = 1) {
  current = i;
  setProgress();
  const step = STEPS[i];
  const card = el('section', 'qz-step');
  card.style.setProperty('--dir', dir);

  {
    if (step.landing) {
      card.append(el('p', 'qz-kicker qz-kicker--lg', step.kicker));
      card.append(el('h1', 'qz-title qz-title--intro', step.heading));
      card.append(el('p', 'qz-dek', step.dek));
      card.append(el('h2', 'qz-question', step.title));
      if (step.quote) {
        const q = el('p', 'qz-quote', `“${step.quote}”`);
        q.append(el('span', null, '— Founder'));
        card.append(q);
      }
    } else {
      card.append(el('p', 'qz-kicker', `Question ${i + 1} of ${QUESTION_COUNT}`));
      card.append(el('h1', 'qz-title', step.title));
    }
    if (step.sub) card.append(el('p', 'qz-sub', step.sub));

    if (step.type === 'options') {
      const list = el('div', 'qz-options' + (step.cols === 2 ? ' qz-options--2col' : ''));
      step.options.forEach((label) => {
        const b = el('button', 'qz-option', label);
        b.type = 'button';
        b.addEventListener('click', () => {
          playClick();
          answers[step.key] = label;
          b.classList.add('is-picked');
          setTimeout(() => advance(i), 260);
        }, { once: true });
        list.append(b);
      });
      card.append(list);
    }

    if (step.type === 'slider') {
      const wrap = el('div', 'qz-sliderwrap');
      const readout = el('div', 'qz-readout', '50%');
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0'; input.max = '100'; input.value = '50';
      input.className = 'qz-slider';
      input.setAttribute('aria-label', step.title);
      const paint = () => {
        readout.textContent = `${input.value}%`;
        input.style.setProperty('--pct', `${input.value}%`);
      };
      input.addEventListener('input', paint);
      paint();
      const anchors = el('div', 'qz-anchors');
      anchors.append(el('span', null, 'Needs work'), el('span', null, 'Dialed in'));
      const next = el('button', 'qz-btn', 'Continue');
      next.type = 'button';
      next.addEventListener('click', () => {
        playClick();
        answers[step.key] = Number(input.value);
        advance(i);
      });
      wrap.append(readout, input, anchors);
      card.append(wrap, next);
    }

    if (step.landing) {
      card.append(el('p', 'qz-fine', step.fine));
    } else if (i > 0) {
      const back = el('button', 'qz-back', '← Back');
      back.type = 'button';
      back.addEventListener('click', () => { playClick(); show(i - 1, -1); });
      card.append(back);
    }
  }

  mount.replaceChildren(card);
  requestAnimationFrame(() => card.classList.add('is-in'));
}

function advance(i) {
  if (i + 1 < STEPS.length) {
    show(i + 1);
  } else {
    finish();
  }
}

/* Final submit: the funnel's conversion moment.
   Meta AddToCart is the ad-optimization event; GA4 add_to_cart mirrors it
   (importable into Google Ads once the accounts are linked);
   assessment_complete carries the answers as params for free segment data. */
function fireConversion() {
  const sliderKeys = ['overall', 'tee', 'irons', 'wedges', 'chipping', 'putting', 'putt_short', 'putt_long'];
  const rated = sliderKeys.filter((k) => typeof answers[k] === 'number');
  const avg = rated.length ? Math.round(rated.reduce((s, k) => s + answers[k], 0) / rated.length) : null;
  try {
    if (window.fbq) {
      window.fbq('track', 'AddToCart', {
        value: 14.99,
        currency: 'USD',
        content_name: 'Elite Golf Consulting App',
        content_ids: ['elite-golf-consulting-app'],
        content_type: 'product',
      });
    }
  } catch (_) { /* never block the redirect on tracking */ }
  try {
    if (window.gtag) {
      window.gtag('event', 'add_to_cart', {
        currency: 'USD',
        value: 14.99,
        items: [{ item_id: 'elite-golf-consulting-app', item_name: 'Elite Golf Consulting App', price: 14.99, quantity: 1 }],
      });
      window.gtag('event', 'assessment_complete', {
        goal: answers.goal,
        favorite_club: answers.favorite_club,
        coaching: answers.coaching,
        self_rating_avg: avg,
      });
    }
  } catch (_) { /* never block the redirect on tracking */ }
}

function finish() {
  current = STEPS.length;
  progressFill.style.width = '100%';
  fireConversion();

  const card = el('section', 'qz-step qz-analyzing');
  card.append(el('p', 'qz-kicker', 'One moment'));
  card.append(el('h1', 'qz-title', 'Building your assessment…'));
  const lines = [
    'Analyzing your game profile',
    'Comparing against players who reached your goal',
    'Preparing your recommendations',
  ];
  const list = el('div', 'qz-checks');
  lines.forEach((t, n) => {
    const row = el('p', 'qz-check', t);
    list.append(row);
    setTimeout(() => row.classList.add('is-done'), 500 + n * 650);
  });
  card.append(list);
  mount.replaceChildren(card);
  requestAnimationFrame(() => card.classList.add('is-in'));

  setTimeout(() => { window.location.href = DEST; }, 2600);
}

show(0);
