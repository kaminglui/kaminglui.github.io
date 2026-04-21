// URL-hash share links for circuit state. The encoder is pure (string-in,
// string-out) so it can be reused by any feature that wants to round-trip a
// JSON blob through a URL. createSharingApi() plugs it into the caller's own
// serialize / apply / component-inspection functions so this module has no
// knowledge of the concrete circuit-lab state shape.

function encodeStateToHash(state) {
    try {
        const json = JSON.stringify(state);
        const bytes = new TextEncoder().encode(json);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch {
        return '';
    }
}

function decodeStateFromHash(encoded) {
    try {
        let b64 = String(encoded).replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        return null;
    }
}

// Minimal toast that lives in its own element so multiple features can
// reuse it if they need to flash a one-shot status message.
function flashShareToast(message, { isError = false, toastId = 'share-toast' } = {}) {
    let toast = document.getElementById(toastId);
    if (!toast) {
        toast = document.createElement('div');
        toast.id = toastId;
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.toggle('error', !!isError);
    toast.style.opacity = '1';
    clearTimeout(flashShareToast._timer);
    flashShareToast._timer = setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, 1800);
}

function createSharingApi({
    serializeState,
    applySerializedState,
    isEmpty,
    hashKey = 'state',
    toastId
}) {
    const hashRegex = new RegExp(`^#${hashKey}=([A-Za-z0-9_-]+)$`);

    function buildShareUrl() {
        const state = serializeState();
        const encoded = encodeStateToHash(state);
        if (!encoded) return '';
        const base = typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : '';
        return `${base}#${hashKey}=${encoded}`;
    }

    function copyShareLink() {
        if (typeof isEmpty === 'function' && isEmpty()) {
            flashShareToast('Nothing to share yet', { isError: true, toastId });
            return;
        }
        const url = buildShareUrl();
        if (!url) {
            flashShareToast('Could not build link', { isError: true, toastId });
            return;
        }
        const ok = () => flashShareToast('Link copied to clipboard', { toastId });
        const fail = () => {
            try {
                if (typeof history?.replaceState === 'function') {
                    history.replaceState(null, '', url);
                }
            } catch { /* ignore */ }
            flashShareToast('Clipboard blocked — URL updated', { toastId });
        };
        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(url).then(ok, fail);
        } else {
            fail();
        }
    }

    function applyHashStateIfPresent() {
        if (typeof location === 'undefined') return false;
        const hash = location.hash || '';
        const match = hash.match(hashRegex);
        if (!match) return false;
        const decoded = decodeStateFromHash(match[1]);
        if (!decoded) return false;
        try {
            applySerializedState(decoded);
        } catch (err) {
            console.warn('Could not apply shared state:', err);
            return false;
        }
        try {
            if (typeof history?.replaceState === 'function') {
                history.replaceState(null, '', location.pathname + location.search);
            }
        } catch { /* ignore */ }
        return true;
    }

    return { buildShareUrl, copyShareLink, applyHashStateIfPresent };
}

export { createSharingApi, encodeStateToHash, decodeStateFromHash, flashShareToast };
