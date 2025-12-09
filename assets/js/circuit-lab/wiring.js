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
  const DELTA_TOLERANCE = Math.max(0.5, GRID * 0.05);

  const snapWithMeta = (p = {}) => {
    const snapped = snapToBoardPoint(p.x ?? 0, p.y ?? 0);
    if (p.userPlaced) snapped.userPlaced = true;
    return snapped;
  };

  const cloneVerts = (list = []) => list.map((v) => ({ ...v }));

  const deltasMatch = (a = {}, b = {}, tol = DELTA_TOLERANCE) => (
    Math.abs((a.dx || 0) - (b.dx || 0)) <= tol &&
    Math.abs((a.dy || 0) - (b.dy || 0)) <= tol
  );

  const segmentKey = (a = {}, b = {}) => {
    if (!a || !b) return null;
    const x1 = Math.min(a.x, b.x);
    const x2 = Math.max(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const y2 = Math.max(a.y, b.y);
    if (x1 === x2 && y1 === y2) return null;
    return `${x1},${y1}-${x2},${y2}`;
  };

  const segmentsOverlap = (a = {}, b = {}, c = {}, d = {}) => {
    const ax = a.x; const ay = a.y;
    const bx = b.x; const by = b.y;
    const cx = c.x; const cy = c.y;
    const dx = d.x; const dy = d.y;
    if (ax === bx && cx === dx && ax === cx) {
      const minA = Math.min(ay, by);
      const maxA = Math.max(ay, by);
      const minB = Math.min(cy, dy);
      const maxB = Math.max(cy, dy);
      return Math.max(minA, minB) <= Math.min(maxA, maxB);
    }
    if (ay === by && cy === dy && ay === cy) {
      const minA = Math.min(ax, bx);
      const maxA = Math.max(ax, bx);
      const minB = Math.min(cx, dx);
      const maxB = Math.max(cx, dx);
      return Math.max(minA, minB) <= Math.min(maxA, maxB);
    }
    return false;
  };

  function buildOccupancyMap(excludeWire = null) {
    const keys = new Set();
    const segments = [];
    getWires().forEach((w) => {
      if (excludeWire && w === excludeWire) return;
      const poly = getWirePolyline(w);
      for (let i = 0; i < poly.length - 1; i++) {
        const key = segmentKey(poly[i], poly[i + 1]);
        if (key) {
          keys.add(key);
          segments.push({ a: poly[i], b: poly[i + 1] });
        }
      }
    });
    return { keys, segments };
  }

  function countPathOverlaps(path = [], occupancy = null) {
    if (!occupancy) return 0;
    const keys = occupancy.keys || occupancy;
    const segs = occupancy.segments || [];
    let overlaps = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const key = segmentKey(a, b);
      const exact = key && keys && keys.has(key);
      const partial = !exact && segs && segs.some((seg) => segmentsOverlap(a, b, seg.a, seg.b));
      if (exact || partial) overlaps += 1;
    }
    return overlaps;
  }

  function mergeCollinear(pts = []) {
    if (!Array.isArray(pts) || pts.length < 2) return Array.isArray(pts) ? pts.slice() : [];
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = out[out.length - 1];
      const curr = pts[i];
      const next = pts[i + 1];

      const duplicatePrev = (curr.x === prev.x && curr.y === prev.y);
      const duplicateNext = (curr.x === next.x && curr.y === next.y);
      if (duplicatePrev) {
        if (curr.userPlaced) prev.userPlaced = prev.userPlaced || curr.userPlaced;
        continue;
      }
      if (duplicateNext) {
        if (curr.userPlaced) next.userPlaced = next.userPlaced || curr.userPlaced;
        continue;
      }

      out.push(curr);
    }
    const last = pts[pts.length - 1];
    const tail = out[out.length - 1];
    if (last.x !== tail.x || last.y !== tail.y) out.push(last);
    else if (last.userPlaced) tail.userPlaced = tail.userPlaced || last.userPlaced;
    return out;
  }

  function enforceConvexPath(pts = []) {
    if (!Array.isArray(pts) || pts.length < 3) return Array.isArray(pts) ? pts.slice() : [];
    const out = [pts[0]];
    let lastDir = null;
    for (let i = 1; i < pts.length; i++) {
      const prev = out[out.length - 1];
      const curr = pts[i];
      if (!prev || !curr) continue;
      if (prev.x === curr.x && prev.y === curr.y) continue;
      const dir = { x: Math.sign(curr.x - prev.x), y: Math.sign(curr.y - prev.y) };
      const reverses = lastDir && ((dir.x && dir.x === -lastDir.x) || (dir.y && dir.y === -lastDir.y));
      if (reverses && out.length >= 2) {
        const prior = out[out.length - 2];
        const merged = { x: curr.x, y: curr.y, userPlaced: !!(curr.userPlaced || prev.userPlaced) };
        out[out.length - 1] = merged;
        lastDir = { x: Math.sign(merged.x - prior.x), y: Math.sign(merged.y - prior.y) };
        continue;
      }
      out.push(curr);
      lastDir = dir;
    }
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
        out.push(snapWithMeta(elbow));
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
    const snap = snapWithMeta;
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
    const occupancy = opts.occupancy || null;
    const occKeys = occupancy?.keys || occupancy;
    const occSegments = occupancy?.segments || [];
    const overlapPenalty = Number.isFinite(opts.overlapPenalty) ? opts.overlapPenalty : 3;
    const allowOffset = opts.allowOffset !== false;
    let orientationHint = preferredOrientation;
    const targets = [...(midPoints || []), end].map((p) => ({
      ...snapWithMeta(p),
      userPlaced: !!p.userPlaced
    }));

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

      function buildSegments(path, startPoint, orientation) {
        const segs = [];
        let prev = startPoint;
        const stub = dirOut ? stubFrom(startPoint, dirOut, path[0]) : null;
        if (stub && (stub.x !== prev.x || stub.y !== prev.y)) {
          segs.push([prev, stub]);
          prev = stub;
        }
        const pathCopy = [...path];
        if (stub && pathCopy.length) {
          const first = pathCopy[0];
          if (stub.x !== first.x && stub.y !== first.y) {
            const elbow = (orientation === ROUTE_ORIENTATION.H_FIRST)
              ? snapToBoardPoint(first.x, stub.y)
              : snapToBoardPoint(stub.x, first.y);
            pathCopy.unshift(elbow);
          }
        }
        pathCopy.forEach((pt) => {
          segs.push([prev, pt]);
          prev = pt;
        });
        const needsArrivalStub = dirIn && (
          (dirIn.x && (path[path.length - 2] || startPoint).x !== snapT.x) ||
          (dirIn.y && (path[path.length - 2] || startPoint).y !== snapT.y)
        );
        if (needsArrivalStub) {
          const prevLeg = path[path.length - 2] || startPoint;
          const arr = stubFrom(snapT, { x: -dirIn.x, y: -dirIn.y }, prevLeg);
          if (arr && (arr.x !== snapT.x || arr.y !== snapT.y)) {
            if (segs.length) segs.pop();
            segs.push([prevLeg, arr], [arr, snapT]);
          }
        }
        return segs;
      }

      function nudgePath(path, orientation, startPoint, sign = 1) {
        const offset = GRID * (sign || 1);
        if (orientation === ROUTE_ORIENTATION.H_FIRST) {
          const mid1 = snapToBoardPoint(startPoint.x, startPoint.y + offset);
          const mid2 = snapToBoardPoint(snapT.x, startPoint.y + offset);
          return [mid1, mid2, snapT];
        }
        const mid1 = snapToBoardPoint(startPoint.x + offset, startPoint.y);
        const mid2 = snapToBoardPoint(startPoint.x + offset, snapT.y);
        return [mid1, mid2, snapT];
      }

      function score(path, orientation, startPoint) {
        let sScore = path.length;
        if (dirOut) {
          const first = path[0];
          if (dirOut.x && first.x === startPoint.x) sScore += 1;
          if (dirOut.y && first.y === startPoint.y) sScore += 1;
        }
        if (dirIn) {
          const prev = path[path.length - 2] || startPoint;
          if (dirIn.x && prev.x === snapT.x) sScore += 1;
          if (dirIn.y && prev.y === snapT.y) sScore += 1;
        }
        if (orientationHint && orientation) {
          if (orientation === orientationHint) sScore -= stickiness;
          else sScore += stickiness * 0.25;
        }
        let overlaps = 0;
        if (occKeys || (occSegments && occSegments.length)) {
          const segs = buildSegments(path, startPoint, orientation);
          segs.forEach(([a, b]) => {
            const key = segmentKey(a, b);
            const exactHit = key && occKeys && occKeys.has(key);
            const partialHit = !exactHit && occSegments && occSegments.some((seg) => segmentsOverlap(a, b, seg.a, seg.b));
            if (exactHit || partialHit) {
              overlaps += 1;
              sScore += overlapPenalty;
            }
          });
        }
        return { score: sScore, overlaps };
      }

      const baseA = score(pathA, orientA, last);
      const baseB = score(pathB, orientB, last);
      const candidates = [
        { path: pathA, orientation: orientA, meta: baseA },
        { path: pathB, orientation: orientB, meta: baseB }
      ];

      if (allowOffset && occupancy && (baseA.overlaps > 0 || baseB.overlaps > 0)) {
        [1, -1].forEach((sign) => {
          candidates.push({
            path: nudgePath(pathA, orientA, last, sign),
            orientation: orientA,
            meta: score(nudgePath(pathA, orientA, last, sign), orientA, last)
          });
          candidates.push({
            path: nudgePath(pathB, orientB, last, sign),
            orientation: orientB,
            meta: score(nudgePath(pathB, orientB, last, sign), orientB, last)
          });
        });
      }

      candidates.sort((a, b) => a.meta.score - b.meta.score);
      const best = candidates[0];
      const chosenOrientation = best.orientation;
      if (!orientationHint) orientationHint = chosenOrientation;

      const pathPoints = [...best.path];
      let stub = null;
      if (dirOut) {
        stub = stubFrom(last, dirOut, pathPoints[0]);
        if (stub.x !== last.x || stub.y !== last.y) pts.push(stub);
        if (stub && pathPoints.length && stub.x !== pathPoints[0].x && stub.y !== pathPoints[0].y) {
          const elbow = (chosenOrientation === ROUTE_ORIENTATION.H_FIRST)
            ? snapToBoardPoint(pathPoints[0].x, stub.y)
            : snapToBoardPoint(stub.x, pathPoints[0].y);
          pathPoints.unshift(elbow);
        }
      }

      pathPoints.forEach((p) => pts.push(p));
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
    return enforceConvexPath(pts);
  }

  function buildWireVertices(fromPin, midPoints, toPin, opts = {}) {
    const start = fromPin.c.getPinPos(fromPin.p);
    const end = toPin.c.getPinPos(toPin.p);
    const dir = getPinDirection(fromPin.c, fromPin.p);
    const endDir = getPinDirection(toPin.c, toPin.p);
    const occupancy = opts.occupancy || buildOccupancyMap(opts.excludeWire || null);
    let path = routeManhattan(
      start,
      midPoints || [],
      end,
      dir,
      endDir,
      { occupancy, allowOffset: false }
    );
    if (occupancy && (!midPoints || midPoints.length === 0)) {
      const baseOverlap = countPathOverlaps(path, occupancy);
      const baseOrientation = firstSegmentOrientation(path);
      const altPref = baseOrientation === ROUTE_ORIENTATION.H_FIRST
        ? ROUTE_ORIENTATION.V_FIRST
        : ROUTE_ORIENTATION.H_FIRST;
      const altPath = buildAnchoredPath(
        start,
        [],
        end,
        {
          routePref: altPref,
          startOrientation: directionToOrientation(dir) || altPref,
          endOrientation: directionToOrientation(endDir) || altPref
        }
      );
      const altOverlap = countPathOverlaps(altPath, occupancy);
      const preferAlt = (altOverlap < baseOverlap) ||
        (altOverlap === baseOverlap && altPath.length < path.length);
      if (preferAlt) path = altPath;
    }
    const verts = path.slice(1, Math.max(1, path.length - 1)).map((p) => ({ ...p }));
    return mergeCollinear(verts);
  }

  function adjustWireAnchors(wire, { start, end, startDir = null, endDir = null } = {}) {
    const snap = snapWithMeta;
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
      if (!w.routePref) tagWireRoutePreference(w);
      const poly = getWirePolyline(w);
      const start = poly[0];
      const end = poly[poly.length - 1];
      snaps.push({
        wire: w,
        polyline: poly,
        vertices: cloneVerts(w.vertices || []),
        fromMoved: movingSet.has(w.from.c),
        toMoved: movingSet.has(w.to.c),
        routePref: w.routePref || inferRoutePreference(start, poly.slice(1, Math.max(1, poly.length - 1)), end),
        startOrientation: firstSegmentOrientation(poly),
        endOrientation: lastSegmentOrientation(poly)
      });
    });
    return snaps;
  }

  function buildAnchoredPath(start, midPoints, end, { routePref = null, startOrientation = null, endOrientation = null } = {}) {
    const s = snapWithMeta(start);
    const e = snapWithMeta(end);
    const mids = Array.isArray(midPoints) ? midPoints.map((p) => snapWithMeta(p)) : [];
    const preferH = endOrientation === ROUTE_ORIENTATION.H_FIRST || (!endOrientation && routePref === ROUTE_ORIENTATION.H_FIRST);
    const preferV = endOrientation === ROUTE_ORIENTATION.V_FIRST || (!endOrientation && routePref === ROUTE_ORIENTATION.V_FIRST);

    if (!mids.length) {
      const path = buildTwoPointPath(s, e, routePref);
      if (path.length > 1) {
        alignEndpoint(path, 'start', startOrientation || routePref);
        alignEndpoint(path, 'end', endOrientation || routePref);
      }
      return mergeCollinear(path);
    }

    const lastIdx = mids.length - 1;
    const lastMid = mids[lastIdx];
    if (lastMid && lastMid.x !== e.x && lastMid.y !== e.y) {
      const updated = { ...lastMid };
      if (preferH && !preferV) {
        updated.y = e.y;
      } else if (preferV && !preferH) {
        updated.x = e.x;
      } else {
        const dx = Math.abs(e.x - updated.x);
        const dy = Math.abs(e.y - updated.y);
        if (dx >= dy) updated.y = e.y;
        else updated.x = e.x;
      }
      mids[lastIdx] = snapWithMeta(updated);
    }

    const path = [s, ...mids, e];
    if (!mids[0]?.userPlaced) alignEndpoint(path, 'start', startOrientation || routePref);
    if (!mids[lastIdx]?.userPlaced) alignEndpoint(path, 'end', endOrientation || routePref);
    return mergeCollinear(path);
  }

  function updateWireFromSnapshot(snapshot, deltaMap) {
    if (!snapshot || !snapshot.wire) return;
    const { wire } = snapshot;
    const start = wire.from.c.getPinPos(wire.from.p);
    const end = wire.to.c.getPinPos(wire.to.p);
    const basePolyline = snapshot.polyline || [];
    const snapStart = basePolyline[0] || start;
    const snapEnd = basePolyline[basePolyline.length - 1] || end;
    const measuredStartDelta = { dx: start.x - snapStart.x, dy: start.y - snapStart.y };
    const measuredEndDelta = { dx: end.x - snapEnd.x, dy: end.y - snapEnd.y };
    const mapStart = deltaMap?.get?.(wire.from.c);
    const mapEnd = deltaMap?.get?.(wire.to.c);
    const startDelta = mapStart || measuredStartDelta;
    const endDelta = mapEnd || measuredEndDelta;
    const routePref = snapshot.routePref || wire.routePref || inferRoutePreference(snapStart, midsSource, snapEnd);
    const startOrientation = snapshot.startOrientation || routePref;
    const endOrientation = snapshot.endOrientation || routePref;
    const movedTogether = snapshot.fromMoved && snapshot.toMoved && deltasMatch(startDelta, endDelta);
    const polyMids = (basePolyline.length > 2)
      ? basePolyline.slice(1, Math.max(1, basePolyline.length - 1)).map((p, idx) => ({
          ...p,
          userPlaced: snapshot.vertices?.[idx]?.userPlaced || p.userPlaced
        }))
      : [];
    const vertexMids = (snapshot.vertices && snapshot.vertices.length)
      ? snapshot.vertices.map((p) => snapWithMeta(p))
      : [];
    const midsSource = movedTogether
      ? (polyMids.length ? polyMids : vertexMids)
      : (vertexMids.length ? vertexMids : polyMids);
    const adjusted = midsSource.map((p, idx, arr) => {
      const v = { ...p };
      if (movedTogether) {
        v.x += startDelta.dx;
        v.y += startDelta.dy;
      } else {
        if (snapshot.fromMoved && idx === 0) {
          v.x += startDelta.dx;
          v.y += startDelta.dy;
        }
        if (snapshot.toMoved && idx === arr.length - 1) {
          v.x += endDelta.dx;
          v.y += endDelta.dy;
        }
      }
      return snapWithMeta(v);
    });

    if (movedTogether) {
      wire.vertices = adjusted;
      wire.routePref = routePref || inferRoutePreference(start, wire.vertices, end);
      return;
    }

    const path = buildAnchoredPath(start, adjusted, end, { routePref, startOrientation, endOrientation });
    wire.vertices = path.slice(1, Math.max(1, path.length - 1));
    wire.routePref = routePref || inferRoutePreference(start, wire.vertices, end);
  }

  function normalizeWireFromSnapshot(snapshot) {
    if (!snapshot || !snapshot.wire) return;
    const { wire } = snapshot;
    const start = wire.from.c.getPinPos(wire.from.p);
    const end = wire.to.c.getPinPos(wire.to.p);
    const basePolyline = snapshot.polyline || [];
    const snapStart = basePolyline[0] || start;
    const snapEnd = basePolyline[basePolyline.length - 1] || end;
    const measuredStartDelta = { dx: start.x - snapStart.x, dy: start.y - snapStart.y };
    const measuredEndDelta = { dx: end.x - snapEnd.x, dy: end.y - snapEnd.y };
    const startDelta = measuredStartDelta;
    const endDelta = measuredEndDelta;
    const routePref = wire.routePref || snapshot.routePref || inferRoutePreference(snapStart, midsSource, snapEnd);
    const startOrientation = snapshot.startOrientation || routePref;
    const endOrientation = snapshot.endOrientation || routePref;
    const movedTogether = snapshot.fromMoved && snapshot.toMoved && deltasMatch(startDelta, endDelta);
    const polyMids = (basePolyline.length > 2)
      ? basePolyline.slice(1, Math.max(1, basePolyline.length - 1)).map((p, idx) => ({
          ...p,
          userPlaced: snapshot.vertices?.[idx]?.userPlaced || p.userPlaced
        }))
      : [];
    const vertexMids = (snapshot.vertices && snapshot.vertices.length)
      ? snapshot.vertices.map((p) => snapWithMeta(p))
      : [];
    const midsSource = (vertexMids.length ? vertexMids : polyMids);

    if (movedTogether) {
      const shifted = midsSource.map((p) => snapWithMeta({
        ...p,
        x: p.x + startDelta.dx,
        y: p.y + startDelta.dy
      }));
      wire.vertices = shifted;
      wire.routePref = routePref || inferRoutePreference(start, wire.vertices, end);
      return;
    }

    const workingVerts = wire.vertices && wire.vertices.length ? wire.vertices.map((v) => snapWithMeta(v)) : midsSource;
    const path = buildAnchoredPath(start, workingVerts, end, { routePref, startOrientation, endOrientation });
    wire.vertices = path.slice(1, Math.max(1, path.length - 1));
    wire.routePref = routePref || inferRoutePreference(start, wire.vertices, end);
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
    enforceConvexPath,
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
