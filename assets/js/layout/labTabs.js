/* Lab tabs — collapsible tabbed theory groups shared across every lab.

   Markup contract (emitted inline per lab page):

     <section class="lab-tabs" data-tab-group="math-foundations">
       <header class="lab-tabs__header">
         <h2 class="lab-tabs__title">Foundations</h2>
         <button class="lab-tabs__collapse" aria-expanded="true"
                 aria-controls="tabs-body-math-foundations">…chevron…</button>
       </header>
       <div class="lab-tabs__body" id="tabs-body-math-foundations">
         <div class="lab-tabs__list" role="tablist" aria-label="Foundations">
           <button role="tab" id="tab-theory-opt" aria-controls="theory-opt"
                   aria-selected="true" tabindex="0">Optimisation</button>
           <button role="tab" id="tab-theory-gd" aria-controls="theory-gd"
                   aria-selected="false" tabindex="-1">GD/SGD</button>
           …
         </div>
         <div id="theory-opt" role="tabpanel" class="lab-tabs__panel"
              aria-labelledby="tab-theory-opt">
           …content…
         </div>
         <div id="theory-gd" role="tabpanel" class="lab-tabs__panel"
              aria-labelledby="tab-theory-gd" hidden>
           …content…
         </div>
       </div>
     </section>

   Responsibilities:
   - Click a tab → switch active panel, update URL hash for deep linking.
   - Arrow keys / Home / End on the tablist → WAI-ARIA tab navigation.
   - Collapse button on the group header → hide the whole body (tabs +
     active panel) without losing which tab was selected.
   - On page load: if location.hash matches a panel id, activate that tab
     and scroll its group into view. */

function selectTab(group, tab, { focus = false, updateHash = true } = {}) {
  const list = group.querySelector('[role="tablist"]');
  if (!list) return;
  const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
  const panels = Array.from(group.querySelectorAll(':scope > .lab-tabs__body > [role="tabpanel"]'));
  const targetId = tab.getAttribute('aria-controls');

  tabs.forEach((t) => {
    const selected = t === tab;
    t.setAttribute('aria-selected', String(selected));
    t.setAttribute('tabindex', selected ? '0' : '-1');
  });
  panels.forEach((panel) => {
    if (panel.id === targetId) {
      panel.removeAttribute('hidden');
    } else {
      panel.setAttribute('hidden', '');
    }
  });

  if (focus) tab.focus();
  if (updateHash && targetId && history && typeof history.replaceState === 'function') {
    history.replaceState(null, '', `#${targetId}`);
  }
}

function bindGroup(group) {
  if (group.dataset.tabsBound === 'true') return;
  const list = group.querySelector('[role="tablist"]');
  if (!list) return;
  const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
  if (tabs.length === 0) return;

  tabs.forEach((tab) => {
    tab.addEventListener('click', (event) => {
      event.preventDefault();
      selectTab(group, tab);
    });
  });

  list.addEventListener('keydown', (event) => {
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex === -1) return;
    let nextIndex = currentIndex;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    selectTab(group, tabs[nextIndex], { focus: true });
  });

  const collapseBtn = group.querySelector(':scope > .lab-tabs__header > .lab-tabs__collapse');
  const body = group.querySelector(':scope > .lab-tabs__body');
  if (collapseBtn instanceof HTMLElement && body instanceof HTMLElement) {
    collapseBtn.addEventListener('click', () => {
      const expanded = collapseBtn.getAttribute('aria-expanded') !== 'false';
      collapseBtn.setAttribute('aria-expanded', String(!expanded));
      if (expanded) {
        body.setAttribute('hidden', '');
        group.dataset.collapsed = 'true';
      } else {
        body.removeAttribute('hidden');
        group.dataset.collapsed = 'false';
      }
    });
  }

  group.dataset.tabsBound = 'true';
}

function activateFromHash() {
  const hash = typeof window !== 'undefined' && window.location ? window.location.hash.slice(1) : '';
  if (!hash) return;
  const panel = document.getElementById(hash);
  if (!(panel instanceof HTMLElement) || panel.getAttribute('role') !== 'tabpanel') return;
  const group = panel.closest('.lab-tabs');
  if (!(group instanceof HTMLElement)) return;
  const tab = group.querySelector(`[role="tab"][aria-controls="${CSS.escape(hash)}"]`);
  if (!(tab instanceof HTMLElement)) return;
  // Expand the group if it was collapsed.
  const collapseBtn = group.querySelector(':scope > .lab-tabs__header > .lab-tabs__collapse');
  const body = group.querySelector(':scope > .lab-tabs__body');
  if (collapseBtn && body && collapseBtn.getAttribute('aria-expanded') === 'false') {
    collapseBtn.setAttribute('aria-expanded', 'true');
    body.removeAttribute('hidden');
    group.dataset.collapsed = 'false';
  }
  selectTab(group, tab, { updateHash: false });
  // Bring the group near the top of the viewport after activation.
  requestAnimationFrame(() => {
    group.scrollIntoView({ block: 'start', behavior: 'auto' });
  });
}

function initLabTabs() {
  const groups = document.querySelectorAll('.lab-tabs');
  groups.forEach(bindGroup);
  if (groups.length > 0) activateFromHash();
}

export { initLabTabs };
