/* Lab tooltips — hover/focus popup engine shared by all lab pages.
   Any element with data-g="key" becomes a tooltip trigger. On hover or
   keyboard focus, the engine shows a popup with:
     - title
     - short explanation
     - clickable related-concept chips (hop to another entry)
     - section jump-links (scroll to the canonical explanation)
   Content lives in assets/js/lab-glossary.js so every lab shares it. */

import { GLOSSARY } from './lab-glossary.js';

const HIDE_DELAY_MS = 180;
let tooltipEl = null;
let hideTimer = null;
let currentKey = null;
let currentTrigger = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function ensureTooltip() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'lab-tooltip';
  tooltipEl.setAttribute('role', 'tooltip');
  tooltipEl.hidden = true;
  tooltipEl.addEventListener('mouseenter', cancelHide);
  tooltipEl.addEventListener('mouseleave', scheduleHide);
  tooltipEl.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-g-chip]');
    if (chip) {
      const key = chip.getAttribute('data-g-chip');
      showFor(chip, key);
      return;
    }
    const link = e.target.closest('[data-g-link]');
    if (link) {
      const id = link.getAttribute('data-g-link');
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        hide();
      }
    }
  });
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function renderEntry(key) {
  const entry = GLOSSARY[key];
  if (!entry) return `<div class="lab-tooltip__title">Unknown term</div><div class="lab-tooltip__body">No glossary entry for <code>${escapeHtml(key)}</code>.</div>`;
  const related = (entry.related || [])
    .map((k) => {
      const title = GLOSSARY[k]?.title ?? k;
      return `<button type="button" class="lab-tooltip__chip" data-g-chip="${escapeHtml(k)}">${escapeHtml(title)}</button>`;
    })
    .join('');
  const sections = (entry.sections || [])
    .map((s) => `<button type="button" class="lab-tooltip__section" data-g-link="${escapeHtml(s.id)}">${escapeHtml(s.label)} →</button>`)
    .join('');
  return [
    `<div class="lab-tooltip__title">${escapeHtml(entry.title)}</div>`,
    `<div class="lab-tooltip__body">${entry.body}</div>`,
    related ? `<div class="lab-tooltip__related"><span class="lab-tooltip__meta">Related:</span> ${related}</div>` : '',
    sections ? `<div class="lab-tooltip__sections">${sections}</div>` : ''
  ].join('');
}

function positionTooltip(target) {
  const tip = tooltipEl;
  tip.style.left = '0px';
  tip.style.top = '0px';
  tip.hidden = false;
  // Force layout so we can measure.
  const rect = target.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  const margin = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = rect.bottom + margin;
  let placeAbove = false;
  if (top + tipRect.height + margin > vh && rect.top - tipRect.height - margin > 0) {
    top = rect.top - tipRect.height - margin;
    placeAbove = true;
  }
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  if (left + tipRect.width + margin > vw) left = vw - tipRect.width - margin;
  if (left < margin) left = margin;

  tip.style.left = `${left + window.scrollX}px`;
  tip.style.top = `${top + window.scrollY}px`;
  tip.dataset.placement = placeAbove ? 'above' : 'below';
}

function showFor(target, key) {
  cancelHide();
  if (currentKey === key && currentTrigger === target) return;
  const tip = ensureTooltip();
  tip.innerHTML = renderEntry(key);
  currentKey = key;
  currentTrigger = target;
  positionTooltip(target);
}

function scheduleHide() {
  cancelHide();
  hideTimer = window.setTimeout(hide, HIDE_DELAY_MS);
}

function cancelHide() {
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function hide() {
  if (!tooltipEl) return;
  tooltipEl.hidden = true;
  currentKey = null;
  currentTrigger = null;
}

function handleEnter(e) {
  const trigger = e.target.closest('[data-g]');
  if (!trigger) return;
  const key = trigger.getAttribute('data-g');
  if (!key) return;
  showFor(trigger, key);
}

function handleLeave(e) {
  const trigger = e.target.closest('[data-g]');
  if (!trigger) return;
  scheduleHide();
}

function initTooltips() {
  document.addEventListener('mouseover', handleEnter);
  document.addEventListener('mouseout', handleLeave);
  document.addEventListener('focusin', handleEnter);
  document.addEventListener('focusout', handleLeave);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
  // Make bare <span data-g> keyboard-reachable.
  document.querySelectorAll('[data-g]').forEach((el) => {
    if (!el.hasAttribute('tabindex') && el.tagName !== 'BUTTON' && el.tagName !== 'A') {
      el.setAttribute('tabindex', '0');
    }
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    if (!el.hasAttribute('aria-label')) {
      const key = el.getAttribute('data-g');
      const title = GLOSSARY[key]?.title;
      if (title) el.setAttribute('aria-label', `${title} — glossary`);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTooltips, { once: true });
} else {
  initTooltips();
}

export { initTooltips };
