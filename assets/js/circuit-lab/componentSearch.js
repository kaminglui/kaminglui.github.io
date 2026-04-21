// Sidebar parts-search filter. Wires up an <input> so typing filters the
// tool-buttons in its container by their text content; Enter activates the
// first visible match and Escape clears. All selectors are configurable so
// the same widget can filter a sidebar in any page layout.

const DEFAULTS = {
    inputId: 'component-search',
    containerSelector: '#tool-scroll',
    buttonSelector: '.tool-btn',
    sectionSelector: ':scope > div',
    hitClass: 'search-hit'
};

function attachComponentSearch(opts = {}) {
    const {
        inputId,
        containerSelector,
        buttonSelector,
        sectionSelector,
        hitClass
    } = { ...DEFAULTS, ...opts };

    const input = document.getElementById(inputId);
    if (!input) return null;
    const container = document.querySelector(containerSelector);
    if (!container) return null;

    const run = () => {
        const q = input.value.trim().toLowerCase();
        const buttons = container.querySelectorAll(buttonSelector);
        buttons.forEach((btn) => {
            const text = (btn.textContent || '').toLowerCase();
            const show = !q || text.includes(q);
            btn.style.display = show ? '' : 'none';
            btn.classList.toggle(hitClass, !!q && show);
        });
        // Hide section headers whose buttons have all been filtered out.
        container.querySelectorAll(sectionSelector).forEach((section) => {
            const hasBtns = section.querySelectorAll(buttonSelector).length;
            if (!hasBtns) return;
            const visible = section.querySelectorAll(
                `${buttonSelector}:not([style*="display: none"])`
            ).length;
            section.style.display = visible ? '' : 'none';
        });
    };

    input.addEventListener('input', run);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            input.value = '';
            run();
            input.blur();
        } else if (e.key === 'Enter') {
            const first = container.querySelector(
                `${buttonSelector}:not([style*="display: none"])`
            );
            if (first) first.click();
        }
    });

    return { run };
}

export { attachComponentSearch };
