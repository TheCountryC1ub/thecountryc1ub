import './style.css';
import './story.css';

// Quiz-arrival callout: only visitors coming from /assessment see the
// "that was the first pillar" note (cold readers never saw a survey).
if (new URLSearchParams(window.location.search).get('from') === 'assessment') {
  const note = document.getElementById('quiznote');
  if (note) note.hidden = false;
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
