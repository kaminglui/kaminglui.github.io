function createWiringApi({
  GRID,
  ROUTE_ORIENTATION,
  WIRE_HIT_DISTANCE,
  snapToBoardPoint,
  getPinDirection,
  getComponents,
  setComponents,
  getWires,
  setWires,
  Junction,
  distToSegment
}) {
  function mergeCollinear(pts = []) {
    if (!Array.isArray(pts) || pts.length < 2) return Array.isArray(pts) ? pts.slice() : [];
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = out[out.length - 1];
      const curr = pts[i];
      const next = pts[i + 1];

      const duplicatePrev = (curr.x === prev.x && curr.y === prev.y);
      const duplicateNext = (curr.x === next.x && curr.y === next.y);
      if (duplicatePrev || duplicateNext) continue;

      out.push(curr);
    }
    const last = pts[pts.length - 1];
    const tail = out[out.length - 1];
    if (last.x !== tail.x || last.y !== tail.y) out.push(last);
    return out;
  }

  function ensureOrthogonalPath(points, preferredOrientation = null) {
    if (points.length < 2) return points.slice();
    const out = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const prev = out[out.length - 1];
      const curr = points[i];
      if (prev.x !== curr.x && prev.y !== curr.y) {
        const preferH = preferredOrientation === ROUTE_ORIENTATION.H_FIRST;
        const preferV = preferredOrientation === ROUTE_ORIENTATION.V_FIRST;
        let elbow;
        if (preferH && !preferV) {
          elbow = { x: curr.x, y: prev.y };
        } else if (preferV && !preferH) {
          elbow = { x: prev.x, y: curr.y };
        } else {
          const dx = Math.abs(curr.x - prev.x);
          const dy = Math.abs(curr.y - prev.y);
          elbow = (dx >= dy) ? { x: curr.x, y: prev.y } : { x: prev.x, y: curr.y };
        }
        out.push(snapToBoardPoint(elbow.x, elbow.y));
      }
      out.push(curr);
    }
    return out;
  }

  function firstSegmentOrientation(points = []) {
    if (!Array.isArray(points)) return null;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      if (!prev || !curr) continue;
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      if (dx === 0 && dy === 0) continue;
      return (Math.abs(dx) >= Math.abs(dy)) ? ROUTE_ORIENTATION.H_FIRST : ROUTE_ORIENTATION.V_FIRST;
    }
    return null;
  }

  function lastSegmentOrientation(points = []) {
    if (!Array.isArray(points)) return null;
    for (let i = points.length - 1; i > 0; i--) {
      const curr = points[i];
      const prev = points[i - 1];
      if (!curr || !prev) continue;
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      if (dx === 0 && dy === 0) continue;
      return (Math.abs(dx) >= Math.abs(dy)) ? ROUTE_ORIENTATION.H_FIRST : ROUTE_ORIENTATION.V_FIRST;
    }
    return null;
  }

  function inferRoutePreference(start, verts = [], end) {
    const poly = [start, ...(verts || []), end].filter(Boolean);
    return firstSegmentOrientation(poly);
  }

  function tagWireRoutePreference(wire) {
    if (!wire?.from?.c || !wire?.to?.c) return wire;
    const start = wire.from.c.getPinPos(wire.from.p);
    const end = wire.to.c.getPinPos(wire.to.p);
    wire.routePref = inferRoutePreference(start, wire.vertices || [], end);
    return wire;
  }

  function buildTwoPointPath(start, end, orientationHint = null) {
    if (start.x === end.x || start.y === end.y) return [start, end];
    const preferH = orientationHint === ROUTE_ORIENTATION.H_FIRST;
    const preferV = orientationHint === ROUTE_ORIENTATION.V_FIRST;
    let elbow;
    if (preferH && !preferV) {
      elbow = { x: end.x, y: start.y };
    } else if (preferV && !preferH) {
      elbow = { x: start.x, y: end.y };
    } else {
      const dx = Math.abs(end.x - start.x);
      const dy = Math.abs(end.y - start.y);
      elbow = (dx >= dy) ? { x: end.x, y: start.y } : { x: start.x, y: end.y };
    }
    const snapElbow = snapToBoardPoint(elbow.x, elbow.y);
    return [start, snapElbow, end];
  }

  function alignEndpoint(path = [], side = 'start', orientationHint = null) {
    if (!Array.isArray(path) || path.length < 2) return path;
    const anchorIdx = (side === 'end') ? path.length - 1 : 0;
    const neighborIdx = (side === 'end') ? path.length - 2 : 1;
    const anchor = path[anchorIdx];
    const neighbor = { ...(path[neighborIdx] || {}) };
    if (!anchor || neighborIdx < 0 || !isFinite(neighbor.x) || !isFinite(neighbor.y)) return path;
    if (anchor.x === neighbor.x || anchor.y === neighbor.y) {
      path[neighborIdx] = snapToBoardPoint(neighbor.x, neighbor.y);
      return path;
    }
    const preferH = orientationHint === ROUTE_ORIENTATION.H_FIRST;
    const preferV = orientationHint === ROUTE_ORIENTATION.V_FIRST;
    if (preferH && !preferV) {
      neighbor.y = anchor.y;
    } else if (preferV && !preferH) {
      neighbor.x = anchor.x;
    } else {
      const dx = Math.abs(neighbor.x - anchor.x);
      const dy = Math.abs(neighbor.y - anchor.y);
      if (dx >= dy) neighbor.y = anchor.y;
      else neighbor.x = anchor.x;
    }
    path[neighborIdx] = snapToBoardPoint(neighbor.x, neighbor.y);
    return path;
  }

  function buildStableWirePath(start, midPoints, end, { routePref = null, startOrientation = null, endOrientation = null } = {}) {
    const snap = (p = {}) => snapToBoardPoint(p.x ?? 0, p.y ?? 0);
    const s = snap(start);
    const e = snap(end);
    const mids = Array.isArray(midPoints) ? midPoints.map((p) => snap(p)) : [];
    const pref = routePref || inferRoutePreference(s, mids, e);
    const path = ensureOrthogonalPath([s, ...mids, e], pref);
    if (path.length === 2) {
      return mergeCollinear(buildTwoPointPath(s, e, pref));
    }
    const orientedStart = startOrientation || pref;
    const orientedEnd = endOrientation || pref;
    alignEndpoint(path, 'start', orientedStart);
    alignEndpoint(path, 'end', orientedEnd);
    return mergeCollinear(path);
  }

  function routeManhattan(start, midPoints, end, startDir = null, endDir = null, opts = {}) {
    const preferredOrientation = opts.preferredOrientation || null;
    const stickiness = Number.isFinite(opts.stickiness) ? opts.stickiness : 0.6;
    let orientationHint = preferredOrientation;
    const targets = [...(midPoints || []), end].map((p) => snapToBoardPoint(p.x, p.y));

    function stubFrom(p, dir, toward) {
      if (dir) return snapToBoardPoint(p.x + dir.x * GRID, p.y + dir.y * GRID);
      const dx = toward.x - p.x;
      const dy = toward.y - p.y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        return snapToBoardPoint(p.x + Math.sign(dx || 1) * GRID, p.y);
      }
      return snapToBoardPoint(p.x, p.y + Math.sign(dy || 1) * GRID);
    }

    let pts = [start];
    let last = start;

    targets.forEach((t, idx) => {
      const isEnd = (idx === targets.length - 1);
      const dirOut = (idx === 0) ? startDir : null;
      const dirIn = isEnd ? endDir : null;
      const snapT = t;

      if (last.x === snapT.x || last.y === snapT.y) {
        pts.push(snapT);
        last = snapT;
        return;
      }

      const pathA = [snapToBoardPoint(snapT.x, last.y), snapT];
      const pathB = [snapToBoardPoint(last.x, snapT.y), snapT];
      const orientA = ROUTE_ORIENTATION.H_FIRST;
      const orientB = ROUTE_ORIENTATION.V_FIRST;

      function score(path, orientation) {
        let sScore = path.length;
        if (dirOut) {
          const first = path[0];
          if (dirOut.x && first.x === last.x) sScore += 1;
          if (dirOut.y && first.y === last.y) sScore += 1;
        }
        if (dirIn) {
          const prev = path[path.length - 2] || last;
          if (dirIn.x && prev.x === snapT.x) sScore += 1;
          if (dirIn.y && prev.y === snapT.y) sScore += 1;
        }
        if (orientationHint && orientation) {
          if (orientation === orientationHint) sScore -= stickiness;
          else sScore += stickiness * 0.25;
        }
        return sScore;
      }

      const scoreA = score(pathA, orientA);
      const scoreB = score(pathB, orientB);
      const pickA = scoreA <= scoreB;
      const best = pickA ? pathA : pathB;
      const chosenOrientation = pickA ? orientA : orientB;
      if (!orientationHint) orientationHint = chosenOrientation;

      if (dirOut) {
        const stub = stubFrom(last, dirOut, best[0]);
        if (stub.x !== last.x || stub.y !== last.y) pts.push(stub);
      }

      best.forEach((p) => pts.push(p));
      last = snapT;

      if (dirIn) {
        const prev = pts[pts.length - 2];
        if ((dirIn.x && prev.x !== snapT.x) || (dirIn.y && prev.y !== snapT.y)) {
          const arr = stubFrom(snapT, { x: -dirIn.x, y: -dirIn.y }, prev);
          pts.splice(pts.length - 1, 0, arr);
        }
      }
    });

    pts = mergeCollinear(pts);
    return pts;
  }

  function buildWireVertices(fromPin, midPoints, toPin) {
    const start = fromPin.c.getPinPos(fromPin.p);
    const end = toPin.c.getPinPos(toPin.p);
    const dir = getPinDirection(fromPin.c, fromPin.p);
    const endDir = getPinDirection(toPin.c, toPin.p);
    const path = routeManhattan(start, midPoints || [], end, dir, endDir);
    const verts = path.slice(1, Math.max(1, path.length - 1));
    return mergeCollinear(verts);
  }

  function adjustWireAnchors(wire, { start, end, startDir = null, endDir = null } = {}) {
    const snap = (p = {}) => snapToBoardPoint(p.x ?? 0, p.y ?? 0);
    const poly = [
      snap(start),
      ...(Array.isArray(wire?.vertices) ? wire.vertices.map((v) => snap(v)) : []),
      snap(end)
    ];

    function insertElbow(anchorIdx, neighborIdx, dirHint = null) {
      const anchor = poly[anchorIdx];
      const neighbor = poly[neighborIdx];
      if (!anchor || !neighbor) return;
      if (anchor.x === neighbor.x || anchor.y === neighbor.y) return;

      const preferX = !!(dirHint && dirHint.x);
      const preferY = !!(dirHint && dirHint.y);
      let elbow;
      if (preferX && !preferY) {
        elbow = { x: neighbor.x, y: anchor.y };
      } else if (preferY && !preferX) {
        elbow = { x: anchor.x, y: neighbor.y };
      } else {
        const dx = Math.abs(neighbor.x - anchor.x);
        const dy = Math.abs(neighbor.y - anchor.y);
        elbow = (dx >= dy) ? { x: neighbor.x, y: anchor.y } : { x: anchor.x, y: neighbor.y };
      }
      const snapped = snap(elbow);
      if ((snapped.x === anchor.x && snapped.y === anchor.y) ||
        (snapped.x === neighbor.x && snapped.y === neighbor.y)) {
        return;
      }
      const insertIdx = anchorIdx < neighborIdx ? neighborIdx : anchorIdx;
      poly.splice(insertIdx, 0, snapped);
    }

    if (startDir) insertElbow(0, 1, startDir);
    if (endDir) insertElbow(poly.length - 1, poly.length - 2, endDir);

    const cleaned = mergeCollinear(poly);
    return cleaned.slice(1, Math.max(1, cleaned.length - 1));
  }

  function buildStablePathWithDirs(w, start, end) {
    const dir = getPinDirection(w.from.c, w.from.p);
    const endDir = getPinDirection(w.to.c, w.to.p);
    const startOrientation = directionToOrientation(dir);
    const endOrientation = directionToOrientation(endDir);
    return buildStableWirePath(
      start,
      w.vertices || [],
      end,
      {
        routePref: w.routePref || null,
        startOrientation: startOrientation || w.routePref || null,
        endOrientation: endOrientation || w.routePref || null
      }
    );
  }

  function getWirePolyline(w) {
    const pStart = w.from.c.getPinPos(w.from.p);
    const pEnd = w.to.c.getPinPos(w.to.p);
    return buildStablePathWithDirs(w, pStart, pEnd);
  }

  function splitWireAtPoint(wire, pt) {
    const poly = getWirePolyline(wire);
    let best = { idx: 0, dist: Infinity, proj: poly[0] };
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i];
      const b = poly[i + 1];
      const l2 = Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2);
      let t = 0;
      if (l2 > 0) {
        t = ((pt.x - a.x) * (b.x - a.x) + (pt.y - a.y) * (b.y - a.y)) / l2;
        t = Math.max(0, Math.min(1, t));
      }
      const proj = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
      const d = Math.hypot(pt.x - proj.x, pt.y - proj.y);
      if (d < best.dist) best = { idx: i, dist: d, proj };
    }

    const snap = snapToBoardPoint(best.proj.x, best.proj.y);
    const junction = new Junction(snap.x, snap.y);
    const comps = getComponents();
    comps.push(junction);
    setComponents(comps);

    const newPoly = [];
    for (let i = 0; i < poly.length; i++) {
      newPoly.push(poly[i]);
      if (i === best.idx) newPoly.push(snap);
    }

    const insertIdx = best.idx + 1;
    const partA = newPoly.slice(0, insertIdx + 1);
    const partB = newPoly.slice(insertIdx);

    function toVertices(path) {
      const verts = path.slice(1, Math.max(1, path.length - 1));
      return mergeCollinear(verts);
    }

    const wireA = {
      from: wire.from,
      to: { c: junction, p: 0 },
      vertices: toVertices(partA),
      v: wire.v || 0
    };
    const wireB = {
      from: { c: junction, p: 0 },
      to: wire.to,
      vertices: toVertices(partB),
      v: wire.v || 0
    };

    tagWireRoutePreference(wireA);
    tagWireRoutePreference(wireB);

    const updated = getWires().filter((w) => w !== wire);
    updated.push(wireA, wireB);
    setWires(updated);
    return junction;
  }

  function pickWireAt(m, maxDist = WIRE_HIT_DISTANCE) {
    let bestWire = null;
    let bestDist = maxDist;
    getWires().forEach((w) => {
      const pts = getWirePolyline(w);
      for (let i = 0; i < pts.length - 1; i++) {
        const d = distToSegment(m, pts[i], pts[i + 1]);
        if (d < bestDist) {
          bestDist = d;
          bestWire = w;
        }
      }
    });
    return bestWire;
  }

  function captureWireSnapshots(movingComponents = []) {
    const movingSet = new Set(movingComponents);
    const snaps = [];
    getWires().forEach((w) => {
      if (!movingSet.has(w.from.c) && !movingSet.has(w.to.c)) return;
      const poly = getWirePolyline(w);
      const start = poly[0];
      const end = poly[poly.length - 1];
      snaps.push({
        wire: w,
        polyline: poly,
        fromMoved: movingSet.has(w.from.c),
        toMoved: movingSet.has(w.to.c),
        routePref: w.routePref || inferRoutePreference(start, poly.slice(1, Math.max(1, poly.length - 1)), end),
        startOrientation: firstSegmentOrientation(poly),
        endOrientation: lastSegmentOrientation(poly)
      });
    });
    return snaps;
  }

  function updateWireFromSnapshot(snapshot, deltaMap) {
    if (!snapshot || !snapshot.wire) return;
    const { wire } = snapshot;
    const start = wire.from.c.getPinPos(wire.from.p);
    const end = wire.to.c.getPinPos(wire.to.p);
    const safeDelta = (comp) => {
      const delta = deltaMap?.get(comp);
      return delta ? delta : { dx: 0, dy: 0 };
    };
    const startDelta = safeDelta(wire.from.c);
    const endDelta = safeDelta(wire.to.c);
    const movedTogether = snapshot.fromMoved && snapshot.toMoved &&
      startDelta.dx === endDelta.dx && startDelta.dy === endDelta.dy;

    const mids = snapshot.polyline.slice(1, Math.max(1, snapshot.polyline.length - 1)).map((p) => ({ ...p }));
    const adjusted = mids.map((p, idx, arr) => {
      let x = p.x;
      let y = p.y;
      if (movedTogether) {
        x += startDelta.dx;
        y += startDelta.dy;
      } else {
        if (snapshot.fromMoved && idx === 0) {
          x += startDelta.dx;
          y += startDelta.dy;
        }
        if (snapshot.toMoved && idx === arr.length - 1) {
          x += endDelta.dx;
          y += endDelta.dy;
        }
      }
      return { x, y };
    });

    const path = buildStableWirePath(
      start,
      adjusted,
      end,
      {
        routePref: snapshot.routePref,
        startOrientation: snapshot.startOrientation,
        endOrientation: snapshot.endOrientation
      }
    );
    wire.vertices = path.slice(1, Math.max(1, path.length - 1));
    wire.routePref = snapshot.routePref || wire.routePref || inferRoutePreference(start, wire.vertices, end);
  }

  function normalizeWireFromSnapshot(snapshot) {
    if (!snapshot || !snapshot.wire) return;
    const { wire } = snapshot;
    const start = wire.from.c.getPinPos(wire.from.p);
    const end = wire.to.c.getPinPos(wire.to.p);
    const path = buildStableWirePath(
      start,
      wire.vertices || [],
      end,
      {
        routePref: wire.routePref || snapshot.routePref,
        startOrientation: snapshot.startOrientation,
        endOrientation: snapshot.endOrientation
      }
    );
    wire.vertices = path.slice(1, Math.max(1, path.length - 1));
    wire.routePref = wire.routePref || snapshot.routePref || inferRoutePreference(start, wire.vertices, end);
  }

  function rerouteWiresForComponent(c) {
    getWires().forEach((w) => {
      if (w.from.c !== c && w.to.c !== c) return;

      const startPos = w.from.c.getPinPos(w.from.p);
      const endPos = w.to.c.getPinPos(w.to.p);
      const startDir = (w.from.c === c) ? getPinDirection(w.from.c, w.from.p) : null;
      const endDir = (w.to.c === c) ? getPinDirection(w.to.c, w.to.p) : null;
      const updated = adjustWireAnchors(w, {
        start: startPos,
        end: endPos,
        startDir,
        endDir
      });
      const path = buildStableWirePath(
        startPos,
        updated,
        endPos,
        {
          routePref: w.routePref || inferRoutePreference(startPos, updated, endPos),
          startOrientation: directionToOrientation(startDir),
          endOrientation: directionToOrientation(endDir)
        }
      );
      w.vertices = path.slice(1, Math.max(1, path.length - 1));
      tagWireRoutePreference(w);
    });
  }

  function autoConnectPins(component) {
    const comps = getComponents();
    const wires = getWires();
    comps.forEach((other) => {
      if (other === component) return;
      component.pins.forEach((_, i) => {
        const p1Raw = component.getPinPos(i);
        const p1 = snapToBoardPoint(p1Raw.x, p1Raw.y);
        other.pins.forEach((__, j) => {
          const p2Raw = other.getPinPos(j);
          const p2 = snapToBoardPoint(p2Raw.x, p2Raw.y);
          if (p1.x === p2.x && p1.y === p2.y) {
            const exists = wires.some((w) =>
              (w.from.c === component && w.from.p === i &&
                w.to.c === other && w.to.p === j) ||
              (w.to.c === component && w.to.p === i &&
                w.from.c === other && w.from.p === j)
            );
            if (!exists) {
              const newWire = {
                from: { c: component, p: i },
                to: { c: other, p: j },
                vertices: [],
                v: 0
              };
              tagWireRoutePreference(newWire);
              wires.push(newWire);
            }
          }
        });
      });
    });
    setWires(wires);
  }

  function directionToOrientation(dir) {
    if (!dir) return null;
    if (Math.abs(dir.x) >= Math.abs(dir.y)) return ROUTE_ORIENTATION.H_FIRST;
    if (Math.abs(dir.y) > Math.abs(dir.x)) return ROUTE_ORIENTATION.V_FIRST;
    return null;
  }

  return {
    mergeCollinear,
    ensureOrthogonalPath,
    firstSegmentOrientation,
    lastSegmentOrientation,
    inferRoutePreference,
    tagWireRoutePreference,
    buildTwoPointPath,
    alignEndpoint,
    buildStableWirePath,
    routeManhattan,
    buildWireVertices,
    adjustWireAnchors,
    getWirePolyline,
    splitWireAtPoint,
    pickWireAt,
    captureWireSnapshots,
    updateWireFromSnapshot,
    normalizeWireFromSnapshot,
    rerouteWiresForComponent,
    autoConnectPins
  };
}

export { createWiringApi };
