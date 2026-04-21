/* Home-page bootstrap. After the page was trimmed to Hero + Labs map,
   every renderer for the removed sections (about, learning, posts,
   projects, sidebar, contact, experience, education) and the entire
   inline editor toolbar became dead code — they're gone. What's left:
   render the hero copy, wire the Back to top link, stamp the year. */

import { defaultContent } from './content.js';

/* --- Title-case helper used on hero.title ----------------------------- */

const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of',
  'on', 'or', 'per', 'the', 'to', 'via', 'vs'
]);

function capitalizeWord(word) {
  if (!word) return word;
  const firstLetterIndex = word.search(/[A-Za-z0-9]/);
  if (firstLetterIndex === -1) return word;
  const leading = word.slice(0, firstLetterIndex);
  const firstChar = word.charAt(firstLetterIndex).toUpperCase();
  const remainder = word.slice(firstLetterIndex + 1);
  const normalizedRemainder =
    remainder === remainder.toLowerCase() ? remainder.toLowerCase() : remainder;
  return leading + firstChar + normalizedRemainder;
}

function formatTitleCase(text) {
  if (typeof text !== 'string') return text;
  if (!text.trim()) return text;
  const tokens = text.split(/(\s+)/);
  let processedWords = 0;
  const totalWords = tokens.reduce(
    (count, token) => (token.trim() ? count + 1 : count),
    0
  );
  return tokens
    .map((token) => {
      if (!token.trim()) return token;
      processedWords += 1;
      const prefixMatch = token.match(/^[^A-Za-z0-9']+/);
      const suffixMatch = token.match(/[^A-Za-z0-9']+$/);
      const prefix = prefixMatch ? prefixMatch[0] : '';
      const suffix = suffixMatch ? suffixMatch[0] : '';
      const core = token.slice(prefix.length, token.length - suffix.length);
      if (!core) return token;
      const normalizedCore = core.toLowerCase();
      const shouldCapitalize =
        processedWords === 1 ||
        processedWords === totalWords ||
        !SMALL_WORDS.has(normalizedCore);
      let transformedCore = normalizedCore;
      if (shouldCapitalize) {
        if (core.includes('-')) {
          transformedCore = core
            .split(/(-)/)
            .map((part) => (part === '-' ? part : capitalizeWord(part)))
            .join('');
        } else {
          transformedCore = capitalizeWord(core);
        }
      }
      return prefix + transformedCore + suffix;
    })
    .join('');
}

/* --- Hero render ------------------------------------------------------- */

function renderHero() {
  const { hero } = defaultContent;
  const eyebrow = document.querySelector('[data-content="hero.eyebrow"]');
  const title = document.querySelector('[data-content="hero.title"]');
  const lead = document.querySelector('[data-content="hero.lead"]');
  if (eyebrow) eyebrow.textContent = hero.eyebrow;
  if (title) title.textContent = formatTitleCase(hero.title);
  if (lead) lead.textContent = hero.lead;
}

/* --- Back-to-top smooth scroll ---------------------------------------- */

function setupBackToTop() {
  const link = document.querySelector('.back-to-top');
  if (!link) return;
  link.addEventListener('click', (event) => {
    if (link.getAttribute('href') !== '#top') return;
    event.preventDefault();
    const reduce =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });
}

/* --- Year stamp ------------------------------------------------------- */

const yearElement = document.querySelector('#year');
if (yearElement) yearElement.textContent = String(new Date().getFullYear());

setupBackToTop();
renderHero();
