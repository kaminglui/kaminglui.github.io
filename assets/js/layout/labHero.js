/* Lab hero — collapsible one-row heading used by every lab page.

   Markup contract (emitted inline on each page so the hero renders
   pre-JS without layout shift):

     <section class="lab-hero lab-hero--compact" id="{slug}-hero">
       <div class="container lab-hero__compact-row">
         <div class="lab-hero__compact-head">
           <p class="lab-hero__eyebrow">…</p>
           <h1 class="lab-hero__title" id="{slug}-hero-title">…</h1>
         </div>
         <button class="lab-hero__toggle" aria-expanded="false"
                 aria-controls="{slug}-hero-lead">…chevron…</button>
       </div>
       <div class="lab-hero__lead-wrap" id="{slug}-hero-lead" hidden>
         <div class="container">
           <p class="lab-hero__lead">…</p>
         </div>
       </div>
     </section>

   Wired from siteShell's initSiteShell so every lab picks it up.
   Publishes the measured hero height to --hero-h on the document
   root; fixed-viewport layouts (Circuit Lab) subtract that from
   their own height calcs so the app workspace stays pinned. */

function syncHeroHeight(hero) {
  const h = hero.getBoundingClientRect().height;
  if (Number.isFinite(h)) {
    document.documentElement.style.setProperty('--hero-h', `${Math.round(h)}px`);
  }
}

function initLabHero() {
  const heroes = document.querySelectorAll('.lab-hero--compact');
  heroes.forEach((hero) => {
    if (hero.dataset.heroBound === 'true') return;
    const toggle = hero.querySelector('.lab-hero__toggle');
    const leadWrap = hero.querySelector('.lab-hero__lead-wrap');
    if (!(toggle instanceof HTMLElement) || !(leadWrap instanceof HTMLElement)) return;

    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      if (expanded) {
        leadWrap.setAttribute('hidden', '');
      } else {
        leadWrap.removeAttribute('hidden');
      }
      // Browser needs a frame to re-layout after toggling `hidden`.
      requestAnimationFrame(() => syncHeroHeight(hero));
    });

    syncHeroHeight(hero);
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => syncHeroHeight(hero)).observe(hero);
    } else if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => syncHeroHeight(hero));
    }

    hero.dataset.heroBound = 'true';
  });
}

export { initLabHero };
