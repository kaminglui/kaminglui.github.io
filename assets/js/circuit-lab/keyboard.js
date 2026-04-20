// Small declarative keyboard-shortcut dispatcher. Callers register a list of
// bindings ({ key, ctrl?, shift?, meta?, allowEditable?, handler }) and the
// dispatcher resolves whichever one matches the event first, handling the
// standard preventDefault / editable-element guard so each handler stays a
// one-line callback. Perfect for host pages that want to consolidate their
// scattered per-key logic into a single readable table.

function isEditableElement(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return true;
    return !!el.isContentEditable;
}

function matchesBinding(binding, event) {
    const key = event.key;
    const lowerKey = key?.toLowerCase?.() || '';
    const expectCtrl = !!(binding.ctrl || binding.meta);
    const eventCtrl = !!(event.ctrlKey || event.metaKey);
    if (expectCtrl !== eventCtrl) return false;
    if (binding.shift != null && !!binding.shift !== !!event.shiftKey) return false;
    if (binding.alt != null && !!binding.alt !== !!event.altKey) return false;
    if (binding.matchKey) return binding.matchKey(event);
    const target = String(binding.key || '');
    const targetLower = target.toLowerCase();
    return key === target || lowerKey === targetLower;
}

function createKeyboardDispatcher({
    bindings = [],
    beforeDispatch,
    isEditable = isEditableElement
} = {}) {
    return function onKeyboardEvent(event) {
        const editable = isEditable(event?.target) || isEditable(document?.activeElement);
        if (typeof beforeDispatch === 'function') {
            const handled = beforeDispatch(event, { editable });
            if (handled) return;
        }
        for (const binding of bindings) {
            if (!matchesBinding(binding, event)) continue;
            if (editable && !binding.allowEditable) continue;
            if (binding.preventDefault !== false) event.preventDefault?.();
            try {
                binding.handler(event, { editable });
            } catch (err) {
                console.warn('Keyboard binding failed:', err);
            }
            return;
        }
    };
}

export { createKeyboardDispatcher, isEditableElement };
