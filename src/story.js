import './style.css';
import './story.css';

// Quiz arrivals (?from=assessment): show the "that was the first pillar"
// note, and retag the App Store links ct=story → ct=assessment so installs
// from the quiz path split out in App Store Connect web-referrer reports.
if (new URLSearchParams(window.location.search).get('from') === 'assessment') {
  const note = document.getElementById('quiznote');
  if (note) note.hidden = false;
  document.querySelectorAll('a[href*="apps.apple.com"]').forEach((a) => {
    a.href = a.href.replace('ct=story', 'ct=assessment');
  });
}

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const els = document.querySelectorAll('[data-reveal]');

if (reduce || !('IntersectionObserver' in window)) {
  els.forEach((e) => e.classList.add('is-in'));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
  );
  els.forEach((e) => io.observe(e));
}
