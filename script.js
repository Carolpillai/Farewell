/**
 * ORRIS — Natural Perfumery
 * Scroll Choreography & Editorial Typography Engine
 * 
 * Implements:
 * 1. Per-word span splitting with 38ms stagger for headlines, ledes, statements, captions
 * 2. Atomic element registration with data-rev and incremental 40-90ms delays
 * 3. Single IntersectionObserver at threshold 0.12
 * 4. ONE rAF-throttled scroll handler writing CSS custom properties (--p1, --p2, --p3, --scroll-percent)
 * 5. Cumulative lighting of composition rows touching DOM ONLY when floor(p * 4) changes
 * 6. Prefers-reduced-motion compatibility & interactive reservation modal
 */

(function () {
  'use strict';

  // --- Helpers ---
  const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

  // --- 1. Per-Word Span Splitting (38ms Stagger) ---
  function initWordSplitting() {
    const targets = document.querySelectorAll('.split-words');
    
    targets.forEach((el) => {
      // Traverse nodes to safely preserve HTML tags like <em> and <span class="script-mark">
      let wordIndex = 0;

      function processNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent;
          if (!text || !text.trim()) {
            return document.createTextNode(text);
          }

          const fragment = document.createDocumentFragment();
          const tokens = text.split(/(\s+)/);

          tokens.forEach((token) => {
            if (/^\s+$/.test(token)) {
              fragment.appendChild(document.createTextNode(token));
            } else if (token.length > 0) {
              const wrap = document.createElement('span');
              wrap.className = 'word-wrap';

              const inner = document.createElement('span');
              inner.className = 'word';
              inner.textContent = token;
              inner.style.setProperty('--w-delay', `${wordIndex * 38}ms`);
              wordIndex++;

              wrap.appendChild(inner);
              fragment.appendChild(wrap);
            }
          });

          return fragment;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // If it's a script mark or nowrap phrase, animate as an atomic unit to prevent line breaking
          if (node.classList.contains('script-mark') || node.classList.contains('nowrap')) {
            const wrap = document.createElement('span');
            wrap.className = 'word-wrap';
            
            const clone = node.cloneNode(true);
            clone.classList.add('word');
            clone.style.setProperty('--w-delay', `${wordIndex * 38}ms`);
            wordIndex += 2; // slight extra breath
            
            wrap.appendChild(clone);
            return wrap;
          }

          // Otherwise recurse children (e.g. <em>)
          const clone = node.cloneNode(false);
          Array.from(node.childNodes).forEach((child) => {
            const processed = processNode(child);
            if (processed) clone.appendChild(processed);
          });
          return clone;
        }
        return node.cloneNode(true);
      }

      const newFragment = document.createDocumentFragment();
      Array.from(el.childNodes).forEach((child) => {
        const processed = processNode(child);
        if (processed) newFragment.appendChild(processed);
      });

      el.innerHTML = '';
      el.appendChild(newFragment);
    });
  }

  // --- 2. Atomic Elements Delay Stagger & Registration ---
  function initAtomicDelays() {
    // Select all elements requiring data-rev delay assignment:
    // "every column, table row, table cell, composition row, FAQ summary, hero strap, button, nav link and footer line"
    const revElements = document.querySelectorAll('[data-rev]');
    
    // Group elements by parent or section to provide natural cascading rhythm (40 to 90ms)
    revElements.forEach((el, index) => {
      // Calculate delay based on index modulo 12 to prevent giant delays at bottom of page
      const staggerDelay = (index % 10) * 55 + 40;
      el.style.setProperty('--d', `${staggerDelay}ms`);
    });
  }

  // --- 3. Single IntersectionObserver (Threshold: 0.12) ---
  function initIntersectionObserver() {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            // If it's a word-split element or container of split words, reveal them
            const splitChildren = entry.target.querySelectorAll('.split-words');
            splitChildren.forEach((child) => child.classList.add('is-revealed'));
            
            // Unobserve once revealed to keep observer ultra lean
            obs.unobserve(entry.target);
          }
        });
      },
      {
        root: null,
        threshold: 0.12,
        rootMargin: '0px 0px -40px 0px'
      }
    );

    // Observe all [data-rev] items and all .split-words elements
    document.querySelectorAll('[data-rev], .split-words, .statement-block, .pricing-block, .faq-block, .composition__left').forEach((el) => {
      observer.observe(el);
    });
  }

  // --- 4. ONE rAF-Throttled Scroll Handler ---
  function initScrollEngine() {
    const root = document.documentElement;
    const heroStage = document.getElementById('heroStage');
    const heroContent = document.getElementById('heroContent');
    const stripStage = document.getElementById('stripStage');
    const compositionStage = document.getElementById('compositionStage');
    const mainNav = document.getElementById('mainNav');
    const compRows = document.querySelectorAll('.comp-row');
    const stripCaption = document.getElementById('stripCaption');

    // State cache: "Only touch the DOM when the row index changes."
    let lastActiveRowIndex = -1;
    let ticking = false;

    function computeStageProgress(el) {
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const stageHeight = el.offsetHeight;
      const viewportHeight = window.innerHeight;
      const scrollableDistance = stageHeight - viewportHeight;

      if (scrollableDistance <= 0) return 0;

      // When stage top reaches top of viewport, progress starts from 0 to 1
      const progress = -rect.top / scrollableDistance;
      return clamp(progress, 0, 1);
    }

    function updateScrollState() {
      const scrollY = window.scrollY || window.pageYOffset;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const scrollPercent = clamp(scrollY / maxScroll, 0, 1);

      // Write global scroll progress
      root.style.setProperty('--scroll-percent', scrollPercent.toFixed(4));

      // 1. Stage 1 (Hero Pin) Progress: 0 to 1
      const p1 = computeStageProgress(heroStage);
      heroStage.style.setProperty('--p1', p1.toFixed(4));

      // Keep hero content 100% solid, crisp, and dark throughout the vast majority of the pin (up to 70%),
      // fading out smoothly only as the user approaches the bottom of the hero stage.
      if (heroContent) {
        if (p1 <= 0.70) {
          heroContent.style.opacity = '1';
        } else {
          const fadeProgress = clamp((p1 - 0.70) / 0.30, 0, 1);
          heroContent.style.opacity = (1 - fadeProgress).toFixed(3);
        }
      }

      // 2. Stage 2 (Strip / Reveal Pin) Progress: 0 to 1
      const p2 = computeStageProgress(stripStage);
      stripStage.style.setProperty('--p2', p2.toFixed(4));

      // Ensure caption in Stage 2 fades IN only after reveal is 45% done
      if (stripCaption) {
        if (p2 < 0.45) {
          stripCaption.style.opacity = '0';
          stripCaption.style.pointerEvents = 'none';
        } else {
          const capProgress = clamp((p2 - 0.45) / 0.22, 0, 1);
          stripCaption.style.opacity = capProgress.toFixed(3);
          stripCaption.style.pointerEvents = capProgress > 0.5 ? 'auto' : 'none';
        }
      }

      // 3. Stage 3 (Composition Pin on Near-Black) Progress: 0 to 1
      const p3 = computeStageProgress(compositionStage);
      compositionStage.style.setProperty('--p3', p3.toFixed(4));

      // Check nav inverted dark-mode when inside stage 3
      if (compositionStage && mainNav) {
        const compRect = compositionStage.getBoundingClientRect();
        const isInDarkMode = compRect.top <= 50 && compRect.bottom >= 50;
        if (isInDarkMode && !mainNav.classList.contains('nav--dark-mode')) {
          mainNav.classList.add('nav--dark-mode');
        } else if (!isInDarkMode && mainNav.classList.contains('nav--dark-mode')) {
          mainNav.classList.remove('nav--dark-mode');
        }
      }

      // SPECIFICATION: "four composition rows light cumulatively as floor(p * 4) advances"
      // SPECIFICATION: "Only touch the DOM when the row index changes."
      const currentStep = Math.min(3, Math.max(0, Math.floor(p3 * 4)));

      if (currentStep !== lastActiveRowIndex) {
        lastActiveRowIndex = currentStep;

        compRows.forEach((row, idx) => {
          if (idx <= currentStep) {
            row.classList.add('is-lit');
            if (idx === currentStep) {
              row.classList.add('is-active');
            } else {
              row.classList.remove('is-active');
            }
          } else {
            row.classList.remove('is-lit');
            row.classList.remove('is-active');
          }
        });
      }

      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollState);
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    
    // Stabilize mobile: avoid triggering onScroll when only address bar height changes
    let lastKnownWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      if (Math.abs(window.innerWidth - lastKnownWidth) > 12) {
        lastKnownWidth = window.innerWidth;
        onScroll();
      }
    }, { passive: true });

    // Initial calculation
    updateScrollState();
  }

  // --- 5. Interactive Acquisition Modal ---
  function initAcquisitionModal() {
    const acquireBtn = document.getElementById('acquireBtn');
    const modal = document.getElementById('acquireModal');
    const closeBtn = document.getElementById('modalCloseBtn');

    if (!acquireBtn || !modal) return;

    function openModal() {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      const firstInput = modal.querySelector('input');
      if (firstInput) setTimeout(() => firstInput.focus(), 100);
    }

    function closeModal() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      acquireBtn.focus();
    }

    acquireBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) {
        closeModal();
      }
    });
  }

  // --- 6. Device Orientation / Phone View Suggestion ---
  function initRotatePrompt() {
    const banner = document.getElementById('rotateBanner');
    const closeBtn = document.getElementById('rotateBannerClose');
    if (!banner) return;

    if (sessionStorage.getItem('rotatePromptDismissed') === 'true') {
      banner.classList.add('is-dismissed');
      return;
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        banner.classList.add('is-dismissed');
        sessionStorage.setItem('rotatePromptDismissed', 'true');
      });
    }

    // Auto-dismiss when user rotates phone to landscape
    function checkOrientation() {
      if (window.innerWidth > window.innerHeight) {
        banner.classList.add('is-dismissed');
      }
    }

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
  }

  // --- Initialization on DOM Ready ---
  function init() {
    initWordSplitting();
    initAtomicDelays();
    initIntersectionObserver();
    initScrollEngine();
    initAcquisitionModal();
    initRotatePrompt();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

