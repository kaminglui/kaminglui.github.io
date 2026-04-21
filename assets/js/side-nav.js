/* Side-nav — a vertical timeline rail that auto-discovers every
   <article id="…"> with a heading on the current page and renders a
   click-to-scroll navigation on the right side. Collapsed by default
   (just a line of dots); on hover/focus it expands to show section
   labels. An IntersectionObserver highlights whichever section is
   currently in view. Hidden on narrow viewports.

   Wires itself in from siteShell.js so every lab gets it automatically. */

const VIEWPORT_CUTOFF = 900;
const OBSERVER_MARGIN = '-30% 0px -55% 0px';

function pickHeading(article) {
  return article.querySelector(':scope > h2, :scope > h3, :scope > h4, :scope > header h2, :scope > header h3');
}

function buildNav(items) {
  const nav = document.createElement('nav');
  nav.className = 'side-nav';
  nav.setAttribute('aria-label', 'Sections on this page');
  const list = document.createElement('ol');
  list.className = 'side-nav__list';
  nav.appendChild(list);

  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'side-nav__item';
    li.dataset.section = item.article.id;

    const dot = document.createElement('span');
    dot.className = 'side-nav__dot';
    dot.setAttribute('aria-hidden', 'true');

    const link = document.createElement('a');
    link.className = 'side-nav__link';
    link.href = `#${item.article.id}`;
    link.textContent = item.label;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      item.article.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (history && typeof history.replaceState === 'function') {
        history.replaceState(null, '', `#${item.article.id}`);
      }
    });

    li.appendChild(dot);
    li.appendChild(link);
    list.appendChild(li);
    item.li = li;
  });

  return nav;
}

function initSideNav() {
  // Only run on wider viewports — the rail overlaps content on narrow ones.
  if (typeof window !== 'undefined' && window.innerWidth < VIEWPORT_CUTOFF) return;
  if (document.querySelector('.side-nav')) return;

  const articles = Array.from(document.querySelectorAll('article[id]'));
  const items = articles
    .map((article) => {
      const heading = pickHeading(article);
      if (!heading) return null;
      // Strip KaTeX-mangled bits by using textContent, and trim any leading
      // "§" / numeric prefix if desired — here we keep the heading verbatim
      // since readers recognise "1 · Bandits" etc.
      const label = heading.textContent.trim().replace(/\s+/g, ' ');
      return { article, heading, label };
    })
    .filter(Boolean);

  // Need at least two sections for a timeline to be useful.
  if (items.length < 2) return;

  const nav = buildNav(items);
  document.body.appendChild(nav);

  // Highlight the section currently near the top of the viewport. Using
  // intersectionRatio with a skewed rootMargin so a section is "active"
  // once its heading crosses the upper third of the viewport.
  if (typeof IntersectionObserver === 'function') {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const match = items.find((it) => it.article === entry.target);
        if (match && match.li) {
          match.li.classList.toggle('is-active', entry.isIntersecting);
        }
      });
    }, { rootMargin: OBSERVER_MARGIN, threshold: 0 });
    items.forEach((it) => observer.observe(it.article));
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSideNav, { once: true });
  } else {
    initSideNav();
  }
}

export { initSideNav };
