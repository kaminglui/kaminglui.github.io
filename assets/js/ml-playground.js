const MLPlayground = (() => {
  const POINT_RADIUS = 9;
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
  let tabs;
  let tabPanels;
  let statusK;
  let statusIter;
  let statusSSE;
  let calculationSSE;
  let distanceTable;
  let selectedPointLabel;
  let selectedClusterLabel;

  const state = {
    points: [],
    centroids: [],
    currentK: 3,
    iteration: 0,
    selectedPointId: null,
    dragPointId: null,
    isRunning: false,
    sse: null
  };

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
    tabs = Array.from(document.querySelectorAll('.ml-tab'));
    tabPanels = Array.from(document.querySelectorAll('.ml-tabpanel'));
    statusK = document.getElementById('status-k');
    statusIter = document.getElementById('status-iter');
    statusSSE = document.getElementById('status-sse');
    calculationSSE = document.getElementById('calculation-sse');
    distanceTable = document.querySelector('#distance-table tbody');
    selectedPointLabel = document.getElementById('selected-point-label');
    selectedClusterLabel = document.getElementById('selected-cluster-label');

    if (!canvas || !ctx) return;

    state.currentK = clampK(Number(kInput?.value) || 3);
    updateStatus();
    setupTabs();
    attachEvents();
    draw();
  }

  function clampK(value) {
    return Math.min(8, Math.max(1, Math.round(value)));
  }

  function setupTabs() {
    if (!tabs?.length || !tabPanels?.length) return;

    const activateTab = (tab) => {
      const targetId = tab.getAttribute('aria-controls');
      tabs.forEach((btn) => {
        const isActive = btn === tab;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
        btn.tabIndex = isActive ? 0 : -1;
      });

      tabPanels.forEach((panel) => {
        const shouldShow = panel.id === targetId;
        panel.hidden = !shouldShow;
      });

      if (targetId === 'panel-calculations') {
        updateCalculationPanel();
      }
    };

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => activateTab(tab));
      tab.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activateTab(tab);
        }
      });
    });

    const initialTab = tabs.find((tab) => tab.classList.contains('is-active')) ?? tabs[0];
    if (initialTab) activateTab(initialTab);
  }

  function attachEvents() {
    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('mouseup', handleCanvasMouseUp);
    canvas.addEventListener('mouseleave', handleCanvasMouseLeave);

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
  }

  function handleCanvasMouseDown(event) {
    const position = getCanvasPosition(event);
    const existingPoint = findPointAt(position.x, position.y);

    if (event.shiftKey && existingPoint) {
      removePoint(existingPoint.id);
      return;
    }

    if (existingPoint) {
      state.selectedPointId = existingPoint.id;
      state.dragPointId = existingPoint.id;
      updateCanvasCursor(true);
      draw();
      updateCalculationPanel();
      return;
    }

    if (!event.shiftKey) {
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

  function handleCanvasMouseMove(event) {
    const position = getCanvasPosition(event);
    const hoveredPoint = findPointAt(position.x, position.y);
    updateCanvasCursor(Boolean(hoveredPoint) || Boolean(state.dragPointId));
    if (!state.dragPointId) return;
    const point = state.points.find((p) => p.id === state.dragPointId);
    if (point) {
      point.x = position.x;
      point.y = position.y;
      draw();
    }
  }

  function handleCanvasMouseUp() {
    if (!state.dragPointId) return;
    state.dragPointId = null;
    updateCanvasCursor(false);
    if (state.centroids.length) {
      assignPointsToNearestCentroid();
      recomputeCentroids();
      updateAfterStateChange(false);
    } else {
      updateCalculationPanel();
      draw();
    }
  }

  function handleCanvasMouseLeave() {
    if (state.dragPointId) {
      handleCanvasMouseUp();
    }
    updateCanvasCursor(false);
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
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function updateCanvasCursor(isHoveringPoint) {
    if (!canvas) return;
    if (state.dragPointId) {
      canvas.style.cursor = 'grabbing';
    } else {
      canvas.style.cursor = isHoveringPoint ? 'grab' : 'crosshair';
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);

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
