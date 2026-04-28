(function () {
  'use strict';

  /* ── 0. Splash screen — first visit per session only ─────────── */
  const splash = document.getElementById('splash');
  if (splash) {
    // Skip the splash entirely on subsequent page loads in the same browser
    // session. The flag persists across home → about → home navigation but
    // resets when the tab is closed.
    const SS_KEY = 'spark_splash_seen';
    if (sessionStorage.getItem(SS_KEY) === '1') {
      splash.remove();
    } else {
      sessionStorage.setItem(SS_KEY, '1');
      const video = document.getElementById('splashVideo');
      const skip  = document.getElementById('splashSkip');

      function dismiss() {
        splash.classList.add('fade-out');
        setTimeout(() => splash.remove(), 700);
      }

      video.addEventListener('canplay', () => { video.style.opacity = '1'; });
      video.addEventListener('ended', dismiss);
      skip.addEventListener('click', dismiss);

      // Safety fallback — dismiss after 8s even if video stalls
      setTimeout(dismiss, 8000);
    }
  }

  /* ── 1. Package opening animation ──────────────── */
  const pkg = document.getElementById('pkgWrap');
  if (pkg) {
    const openPkg = () => pkg.classList.add('open');

    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setTimeout(openPkg, 400);
        obs.disconnect();
      }
    }, { threshold: 0.6 });
    obs.observe(pkg);

    // Click to replay
    pkg.addEventListener('click', () => {
      pkg.classList.remove('open');
      void pkg.offsetWidth; // force reflow
      setTimeout(openPkg, 80);
    });
  }

  /* ── 2. Scroll reveal (fade + slide up) ─────────── */
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('is-visible'));
    return;
  }

  // Auto-add data-reveal to cards/grids with stagger
  document.querySelectorAll('.cards, .team-cards, .donate-tiers, .faq-list, .activity-cards').forEach(grid => {
    Array.from(grid.children).forEach((child, i) => {
      if (!child.hasAttribute('data-reveal')) {
        child.setAttribute('data-reveal', '');
        child.dataset.delay = i * 100;
      }
    });
  });

  // Add to standalone elements
  document.querySelectorAll('.section-header, .highlight-box, .callout, .youth-banner, .icebreaker-strip, .join-box, .book-chips').forEach(el => {
    if (!el.hasAttribute('data-reveal')) el.setAttribute('data-reveal', '');
  });

  const revealObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const delay = el.dataset.delay ? +el.dataset.delay : 0;
      setTimeout(() => el.classList.add('is-visible'), delay);
      revealObs.unobserve(el);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('[data-reveal]').forEach(el => revealObs.observe(el));

  /* ── 3. Stats pop-in ───────────────────────────── */
  const statItems = document.querySelectorAll('.stats__item');
  if (statItems.length) {
    const statsObs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const delay = el.dataset.delay ? +el.dataset.delay : 0;
        setTimeout(() => el.classList.add('stats--popped'), delay);
        statsObs.unobserve(el);
      });
    }, { threshold: 0.5, rootMargin: '0px 0px -40px 0px' });

    statItems.forEach((el, i) => {
      el.dataset.delay = i * 120;
      statsObs.observe(el);
    });
  }

  /* ── 4. Extra hero sparkles ─────────────────────── */
  const hero = document.querySelector('.hero');
  if (hero) {
    const chars = ['✦', '✧', '⋆', '✦', '★', '✦', '✧'];
    for (let i = 0; i < 7; i++) {
      const s = document.createElement('span');
      s.className = 'hero__sparkles';
      s.setAttribute('aria-hidden', 'true');
      s.textContent = chars[i % chars.length];
      s.style.cssText =
        `top:${10 + Math.random() * 75}%;` +
        `left:${4 + Math.random() * 92}%;` +
        `font-size:${(0.5 + Math.random() * 0.8).toFixed(2)}rem;` +
        `animation-delay:${(Math.random() * 5).toFixed(2)}s;` +
        `animation-duration:${(4 + Math.random() * 4).toFixed(2)}s;`;
      hero.appendChild(s);
    }
  }

  /* ── 5. Slide carousel ──────────────────────────── */
  const carousel = document.getElementById('slideCarousel');
  if (carousel) {
    const track = carousel.querySelector('.carousel__track');
    const slides = carousel.querySelectorAll('.carousel__slide');
    const dotsContainer = document.getElementById('carouselDots');
    let current = 0;

    // Build dots
    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'carousel__dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', 'Go to slide ' + (i + 1));
      dot.addEventListener('click', () => goTo(i));
      dotsContainer.appendChild(dot);
    });

    function goTo(index) {
      current = (index + slides.length) % slides.length;
      track.style.transform = `translateX(-${current * 100}%)`;
      carousel.querySelectorAll('.carousel__dot').forEach((d, i) => {
        d.classList.toggle('active', i === current);
      });
    }

    carousel.querySelector('.carousel__btn--prev').addEventListener('click', () => goTo(current - 1));
    carousel.querySelector('.carousel__btn--next').addEventListener('click', () => goTo(current + 1));

    // Swipe support
    let touchStartX = 0;
    carousel.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    carousel.addEventListener('touchend', e => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) goTo(current + (diff > 0 ? 1 : -1));
    });

    // Keyboard support
    carousel.setAttribute('tabindex', '0');
    carousel.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') goTo(current - 1);
      if (e.key === 'ArrowRight') goTo(current + 1);
    });
  }

})();
