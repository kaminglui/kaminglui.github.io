const MLPlayground = (() => {
  const POINT_RADIUS = 7;
  const HIT_RADIUS = 14;
  const CENTROID_RADIUS = 10;
  const CLUSTER_COLORS = [
    '#3b82f6',
    '#f97316',
    '#22c55e',
    '#a855f7',
    '#ec4899',
    '#06b6d4',
    '#eab308',
    '#ef4444'
  ];

  let canvas;
  let ctx;
  let kInput;
  let btnInit;
  let btnStep;
  let btnRun;
  let btnReset;
  let btnClear;
  let btnTogglePanel;
  let statusK;
  let statusIter;
  let statusSSE;
  let calculationPanel;
  let calculationSSE;
  let distanceTable;
  let selectedPointLabel;
  let selectedClusterLabel;
  let tabButtons;
  let tabPanels;
  let modeButtons;

  const state = {
    points: [],
    centroids: [],
    currentK: 3,
    iteration: 0,
    selectedPointId: null,
    dragPointId: null,
    activePointerId: null,
    interactionMode: 'create',
    isRunning: false,
    sse: null
  };

  let pixelRatio = 1;

  const createId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `id-${Math.random().toString(36).slice(2, 10)}`;

  function init() {
    canvas = document.getElementById('kmeans-canvas');
    ctx = canvas?.getContext('2d') ?? null;
    kInput = document.getElementById('k-input');
    btnInit = document.getElementById('btn-init-centroids');
    btnStep = document.getElementById('btn-step');
    btnRun = document.getElementById('btn-run');
    btnReset = document.getElementById('btn-reset-clustering');
    btnClear = document.getElementById('btn-clear-points');
    btnTogglePanel = document.getElementById('btn-toggle-calculations');
    statusK = document.getElementById('status-k');
    statusIter = document.getElementById('status-iter');
    statusSSE = document.getElementById('status-sse');
    calculationPanel = document.getElementById('calculation-panel');
    calculationSSE = document.getElementById('calculation-sse');
    distanceTable = document.querySelector('#distance-table tbody');
    selectedPointLabel = document.getElementById('selected-point-label');
    selectedClusterLabel = document.getElementById('selected-cluster-label');
    tabButtons = document.querySelectorAll('.ml-tab');
    tabPanels = document.querySelectorAll('.ml-tab-panel');
    modeButtons = document.querySelectorAll('[data-mode]');

    if (!canvas || !ctx) return;

    state.currentK = clampK(Number(kInput?.value) || 3);
    updateStatus();
    attachEvents();
    resizeCanvas();
    setInteractionMode('create');
    draw();
  }

  function clampK(value) {
    return Math.min(8, Math.max(1, Math.round(value)));
  }

  function attachEvents() {
    window.addEventListener('resize', resizeCanvas);

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerUp);

    modeButtons?.forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.getAttribute('data-mode') ?? 'create';
        setInteractionMode(mode);
      });
    });

    tabButtons?.forEach((button) => {
      button.addEventListener('click', () => activateTab(button));
    });

    kInput?.addEventListener('change', () => {
      const newK = clampK(Number(kInput.value));
      kInput.value = String(newK);
      state.currentK = newK;
      state.iteration = 0;
      statusIter.textContent = '0';
      statusK.textContent = String(newK);
      resetAssignments();
      if (state.points.length >= state.currentK) {
        initializeCentroids(state.currentK);
        assignPointsToNearestCentroid();
        recomputeCentroids();
        updateAfterStateChange();
      } else {
        updateSSE(null);
        draw();
      }
    });

    btnInit?.addEventListener('click', () => {
      state.iteration = 0;
      const initialized = initializeCentroids(state.currentK);
      if (initialized) {
        assignPointsToNearestCentroid();
        recomputeCentroids();
      }
      updateAfterStateChange();
    });

    btnStep?.addEventListener('click', () => {
      if (!ensureCentroids()) return;
      stepKMeans();
      draw();
    });

    btnRun?.addEventListener('click', () => {
      runToConvergence();
    });

    btnReset?.addEventListener('click', () => {
      resetAssignments();
      draw();
    });

    btnClear?.addEventListener('click', () => {
      clearAll();
    });

    btnTogglePanel?.addEventListener('click', () => {
      const isExpanded = btnTogglePanel.getAttribute('aria-expanded') === 'true';
      btnTogglePanel.setAttribute('aria-expanded', String(!isExpanded));
      btnTogglePanel.textContent = isExpanded ? 'Show calculation process' : 'Hide calculation process';
      if (calculationPanel) {
        calculationPanel.hidden = isExpanded;
      }
      updateCalculationPanel();
    });
  }

  function handlePointerDown(event) {
    const position = getCanvasPosition(event);
    const existingPoint = findPointAt(position.x, position.y);

    if (event.shiftKey && existingPoint) {
      removePoint(existingPoint.id);
      return;
    }

    if (existingPoint) {
      state.selectedPointId = existingPoint.id;
      if (state.interactionMode === 'drag') {
        state.dragPointId = existingPoint.id;
        state.activePointerId = event.pointerId;
        canvas.setPointerCapture(event.pointerId);
      }
      draw();
      updateCalculationPanel();
      return;
    }

    if (!event.shiftKey && state.interactionMode === 'create') {
      addPoint(position.x, position.y);
      if (state.centroids.length) {
        assignPointsToNearestCentroid();
        recomputeCentroids();
        updateAfterStateChange();
      } else {
        draw();
      }
    }
  }

  function handlePointerMove(event) {
    if (!state.dragPointId || state.activePointerId !== event.pointerId) return;
    const position = getCanvasPosition(event);
    const point = state.points.find((p) => p.id === state.dragPointId);
    if (point) {
      point.x = position.x;
      point.y = position.y;
      draw();
      updateCalculationPanel();
    }
  }

  function handlePointerUp(event) {
    if (!state.dragPointId || state.activePointerId !== event.pointerId) return;
    state.dragPointId = null;
    state.activePointerId = null;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (state.centroids.length) {
      assignPointsToNearestCentroid();
      recomputeCentroids();
      updateAfterStateChange(false);
    } else {
      updateCalculationPanel();
      draw();
    }
  }

  function addPoint(x, y) {
    const newPoint = { id: createId(), x, y, clusterIndex: null };
    state.points.push(newPoint);
    state.selectedPointId = newPoint.id;
    updateCalculationPanel();
  }

  function removePoint(id) {
    state.points = state.points.filter((point) => point.id !== id);
    if (state.selectedPointId === id) {
      state.selectedPointId = null;
    }
    if (state.points.length === 0) {
      state.centroids = [];
    }
    if (state.centroids.length && state.points.length) {
      assignPointsToNearestCentroid();
      recomputeCentroids();
    }
    updateAfterStateChange(false);
  }

  function findPointAt(x, y) {
    return state.points.find((point) => {
      const distance = Math.hypot(point.x - x, point.y - y);
      return distance <= HIT_RADIUS;
    });
  }

  function resetAssignments() {
    state.centroids = [];
    state.points = state.points.map((point) => ({ ...point, clusterIndex: null }));
    state.iteration = 0;
    state.selectedPointId = state.points[0]?.id ?? null;
    updateSSE(null);
    updateStatus();
    updateCalculationPanel();
  }

  function clearAll() {
    state.points = [];
    state.centroids = [];
    state.iteration = 0;
    state.selectedPointId = null;
    updateSSE(null);
    updateStatus();
    updateCalculationPanel();
    draw();
  }

  function getCanvasPosition(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / pixelRatio / rect.width;
    const scaleY = canvas.height / pixelRatio / rect.height;
    return {
      x: (event.clientX - rect.left) * (Number.isFinite(scaleX) ? scaleX : 1),
      y: (event.clientY - rect.top) * (Number.isFinite(scaleY) ? scaleY : 1)
    };
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pixelRatio = window.devicePixelRatio || 1;
    canvas.width = rect.width * pixelRatio;
    canvas.height = rect.height * pixelRatio;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    draw();
  }

  function setInteractionMode(mode) {
    state.interactionMode = mode === 'drag' ? 'drag' : 'create';
    modeButtons?.forEach((button) => {
      const isActive = button.getAttribute('data-mode') === state.interactionMode;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  function activateTab(button) {
    const targetId = button.getAttribute('aria-controls');
    tabButtons?.forEach((tab) => {
      const isActive = tab === button;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
      tab.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    tabPanels?.forEach((panel) => {
      const isActive = panel.id === targetId;
      panel.hidden = !isActive;
      panel.classList.toggle('is-active', isActive);
    });

    if (targetId === 'panel-playground') {
      window.requestAnimationFrame(resizeCanvas);
    }
  }

  function initializeCentroids(k) {
    if (state.points.length < k) {
      updateSSE(null);
      return false;
    }

    const shuffled = [...state.points].sort(() => Math.random() - 0.5);
    state.centroids = shuffled.slice(0, k).map((point, index) => ({
      id: createId(),
      x: point.x,
      y: point.y,
      color: CLUSTER_COLORS[index % CLUSTER_COLORS.length]
    }));
    state.points = state.points.map((p) => ({ ...p, clusterIndex: null }));
    return true;
  }

  function ensureCentroids() {
    if (state.centroids.length) return true;
    const initialized = initializeCentroids(state.currentK);
    if (initialized) {
      assignPointsToNearestCentroid();
      recomputeCentroids();
      updateAfterStateChange();
    }
    return initialized;
  }

  function assignPointsToNearestCentroid() {
    if (!state.centroids.length) return false;
    let changed = false;
    state.points.forEach((point) => {
      let closestIndex = point.clusterIndex ?? 0;
      let closestDistance = Number.POSITIVE_INFINITY;
      state.centroids.forEach((centroid, index) => {
        const distSq = distanceSquared(point, centroid);
        if (distSq < closestDistance) {
          closestDistance = distSq;
          closestIndex = index;
        }
      });
      if (point.clusterIndex !== closestIndex) {
        changed = true;
        point.clusterIndex = closestIndex;
      }
    });
    return changed;
  }

  function recomputeCentroids() {
    if (!state.centroids.length) return;
    state.centroids.forEach((centroid, index) => {
      const assigned = state.points.filter((point) => point.clusterIndex === index);
      if (!assigned.length) return;
      const sum = assigned.reduce(
        (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
        { x: 0, y: 0 }
      );
      centroid.x = sum.x / assigned.length;
      centroid.y = sum.y / assigned.length;
    });
  }

  function distanceSquared(a, b) {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  }

  function computeSSE() {
    if (!state.centroids.length) return null;
    return state.points.reduce((sum, point) => {
      if (point.clusterIndex === null || !state.centroids[point.clusterIndex]) return sum;
      return sum + distanceSquared(point, state.centroids[point.clusterIndex]);
    }, 0);
  }

  function updateSSE(value) {
    state.sse = value;
    const display = value === null ? '—' : value.toFixed(2);
    statusSSE.textContent = display;
    calculationSSE.textContent = display;
  }

  function updateStatus() {
    statusK.textContent = String(state.currentK);
    statusIter.textContent = String(state.iteration);
  }

  function updateAfterStateChange(incrementIteration = false, shouldDraw = true) {
    if (incrementIteration) {
      state.iteration += 1;
      updateStatus();
    } else {
      updateStatus();
    }
    updateSSE(computeSSE());
    ensureSelectedPoint();
    updateCalculationPanel();
    if (shouldDraw) {
      draw();
    }
  }

  function stepKMeans() {
    const changed = assignPointsToNearestCentroid();
    recomputeCentroids();
    state.iteration += 1;
    updateStatus();
    updateSSE(computeSSE());
    ensureSelectedPoint();
    updateCalculationPanel();
    return changed;
  }

  function runToConvergence() {
    if (state.isRunning) return;
    if (!ensureCentroids()) return;

    state.isRunning = true;
    toggleRunButton(true);
    let iterations = 0;
    const maxIterations = 50;

    const loop = () => {
      const changed = stepKMeans();
      draw();
      iterations += 1;
      if (!changed || iterations >= maxIterations) {
        state.isRunning = false;
        toggleRunButton(false);
        return;
      }
      window.setTimeout(loop, 150);
    };

    loop();
  }

  function toggleRunButton(isRunning) {
    if (!btnRun) return;
    btnRun.disabled = isRunning;
    btnRun.textContent = isRunning ? 'Running…' : 'Run to convergence';
  }

  function draw() {
    if (!ctx) return;
    const width = canvas.width / pixelRatio;
    const height = canvas.height / pixelRatio;
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    state.points.forEach((point) => {
      const color =
        point.clusterIndex === null
          ? 'rgba(148, 163, 184, 0.8)'
          : state.centroids[point.clusterIndex]?.color || 'rgba(148, 163, 184, 0.8)';

      ctx.beginPath();
      ctx.arc(point.x, point.y, POINT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (state.selectedPointId === point.id) {
        ctx.strokeStyle = '#0ea5e9';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    state.centroids.forEach((centroid, index) => {
      ctx.fillStyle = centroid.color;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(
        centroid.x - CENTROID_RADIUS,
        centroid.y - CENTROID_RADIUS,
        CENTROID_RADIUS * 2,
        CENTROID_RADIUS * 2
      );
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = '12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(index + 1), centroid.x, centroid.y);
    });
  }

  function updateCalculationPanel() {
    const hasCentroids = state.centroids.length > 0;
    const selectedPoint = ensureSelectedPoint();

    if (!selectedPoint) {
      selectedPointLabel.textContent = 'none';
      selectedClusterLabel.textContent = '—';
      if (distanceTable) {
        distanceTable.innerHTML = '';
      }
      calculationSSE.textContent = state.sse === null ? '—' : state.sse.toFixed(2);
      return;
    }

    if (!hasCentroids) {
      selectedPointLabel.textContent = `(${selectedPoint.x.toFixed(1)}, ${selectedPoint.y.toFixed(1)})`;
      selectedClusterLabel.textContent = 'Not assigned yet – initialize centroids to begin.';
      if (distanceTable) {
        distanceTable.innerHTML = '';
      }
      calculationSSE.textContent = state.sse === null ? '—' : state.sse.toFixed(2);
      return;
    }

    selectedPointLabel.textContent = `(${selectedPoint.x.toFixed(1)}, ${selectedPoint.y.toFixed(1)})`;
    selectedClusterLabel.textContent = `Assigned to cluster C${(selectedPoint.clusterIndex ?? 0) + 1}`;

    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    state.centroids.forEach((centroid, index) => {
      const dist = Math.sqrt(distanceSquared(selectedPoint, centroid));
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = index;
      }
    });

    if (distanceTable) {
      distanceTable.innerHTML = '';
      state.centroids.forEach((centroid, index) => {
        const row = document.createElement('tr');
        const dist = Math.sqrt(distanceSquared(selectedPoint, centroid));

        const cells = [
          `C${index + 1}`,
          `(${centroid.x.toFixed(1)}, ${centroid.y.toFixed(1)})`,
          dist.toFixed(2),
          index === nearestIndex ? 'Yes' : 'No'
        ];

        cells.forEach((value, cellIndex) => {
          const cell = document.createElement('td');
          cell.textContent = value;
          if (cellIndex === cells.length - 1 && index === nearestIndex) {
            cell.classList.add('ml-table--nearest');
          }
          row.appendChild(cell);
        });

        distanceTable.appendChild(row);
      });
    }

    calculationSSE.textContent = state.sse === null ? '—' : state.sse.toFixed(2);
  }

  function ensureSelectedPoint() {
    if (!state.points.length) {
      state.selectedPointId = null;
      return null;
    }

    const existing = state.points.find((p) => p.id === state.selectedPointId);
    if (existing) return existing;

    const fallback = state.points.find((p) => p.clusterIndex !== null) ?? state.points[0];
    state.selectedPointId = fallback?.id ?? null;
    return fallback ?? null;
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  MLPlayground.init();
});
