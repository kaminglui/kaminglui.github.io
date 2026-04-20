// Snapshot-based undo / redo. Hangs off the caller's autosave debounce via
// captureSnapshot() so each logical action — drag, paste, prop edit — collapses
// into one history entry even though the underlying mark-dirty signal fires
// many times mid-drag.

const DEFAULT_MAX_HISTORY = 60;

function defaultSnapshotsEqual(a, b) {
    try {
        const pick = (s) => ({ components: s?.components || [], wires: s?.wires || [] });
        return JSON.stringify(pick(a)) === JSON.stringify(pick(b));
    } catch {
        return false;
    }
}

function createHistoryApi({
    serializeState,
    applySerializedState,
    persist,
    maxHistory = DEFAULT_MAX_HISTORY,
    snapshotsEqual = defaultSnapshotsEqual,
    isBlocked,
    onChange
} = {}) {
    const undoStack = [];
    const redoStack = [];
    let lastStable = null;
    let isUndoingOrRedoing = false;

    const notify = () => {
        if (typeof onChange === 'function') {
            try { onChange({ canUndo: !!undoStack.length, canRedo: !!redoStack.length }); }
            catch (err) { console.warn('history onChange failed:', err); }
        }
    };

    function primeBaseline() {
        lastStable = serializeState();
        undoStack.length = 0;
        redoStack.length = 0;
        notify();
    }

    function captureSnapshot(currentSnapshot) {
        if (isUndoingOrRedoing) return;
        if (typeof isBlocked === 'function' && isBlocked()) return;
        const snap = currentSnapshot ?? serializeState();
        if (!lastStable) {
            lastStable = snap;
            return;
        }
        if (snapshotsEqual(lastStable, snap)) return;
        undoStack.push(lastStable);
        if (undoStack.length > maxHistory) undoStack.shift();
        redoStack.length = 0;
        lastStable = snap;
        notify();
    }

    function applyWithoutCapture(state) {
        isUndoingOrRedoing = true;
        try {
            applySerializedState(state);
            lastStable = state;
        } finally {
            isUndoingOrRedoing = false;
        }
    }

    function undo() {
        if (!undoStack.length) return;
        redoStack.push(serializeState());
        const prev = undoStack.pop();
        applyWithoutCapture(prev);
        if (typeof persist === 'function') {
            try { persist(prev); } catch { /* ignore */ }
        }
        notify();
    }

    function redo() {
        if (!redoStack.length) return;
        undoStack.push(serializeState());
        const next = redoStack.pop();
        applyWithoutCapture(next);
        if (typeof persist === 'function') {
            try { persist(next); } catch { /* ignore */ }
        }
        notify();
    }

    return {
        primeBaseline,
        captureSnapshot,
        undo,
        redo,
        canUndo: () => !!undoStack.length,
        canRedo: () => !!redoStack.length
    };
}

export { createHistoryApi, defaultSnapshotsEqual };
