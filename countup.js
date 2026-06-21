// ─── Animated count-up for stat values ──────────────────────────────────────
// Call animateCountUp(element, targetNumber) once you've computed the real
// stat value and are about to display it — instead of setting textContent
// directly, this animates from 0 up to the target.

function animateCountUp(el, target, duration = 1200) {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion || !el) {
    if (el) el.textContent = target.toLocaleString();
    return;
  }

  const start = 0;
  const startTime = performance.now();

  function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  function frame(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOutExpo(progress);
    const current = Math.round(start + (target - start) * eased);

    el.textContent = current.toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      el.textContent = target.toLocaleString();
    }
  }

  requestAnimationFrame(frame);
}