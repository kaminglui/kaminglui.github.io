// Pure wire / path geometry for the Circuit Lab.
// Routing primitives that only need a grid constant and plain {x, y} points.

import { GRID } from './config.js';

export const ROUTE_ORIENTATION = {
    H_FIRST: 'h-first',
    V_FIRST: 'v-first'
};

export function snapToGrid(v) {
    return Math.round(v / GRID) * GRID;
}

// Snap a point to the nearest breadboard hole center.
export function snapToBoardPoint(x, y) {
    return {
        x: snapToGrid(x - GRID / 2) + GRID / 2,
        y: snapToGrid(y - GRID / 2) + GRID / 2
    };
}

export function mergeCollinear(pts = []) {
    // Keep user bends intact; only drop true duplicates/zero-length segments.
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

export function ensureOrthogonalPath(points, preferredOrientation = null) {
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

export function directionToOrientation(dir) {
    if (!dir) return null;
    if (Math.abs(dir.x) >= Math.abs(dir.y)) return ROUTE_ORIENTATION.H_FIRST;
    if (Math.abs(dir.y) > Math.abs(dir.x)) return ROUTE_ORIENTATION.V_FIRST;
    return null;
}

export function firstSegmentOrientation(points = []) {
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

export function lastSegmentOrientation(points = []) {
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

export function inferRoutePreference(start, verts = [], end) {
    const poly = [start, ...(verts || []), end].filter(Boolean);
    return firstSegmentOrientation(poly);
}

export function buildTwoPointPath(start, end, orientationHint = null) {
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

export function alignEndpoint(path = [], side = 'start', orientationHint = null) {
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

export function buildStableWirePath(start, midPoints, end, { routePref = null, startOrientation = null, endOrientation = null } = {}) {
    const snap = (p = {}) => snapToBoardPoint(p.x ?? 0, p.y ?? 0);
    const s = snap(start);
    const e = snap(end);
    const mids = Array.isArray(midPoints) ? midPoints.map(p => snap(p)) : [];
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

// Strip interior vertices that add no bend: a prev/curr/next triplet collinear
// horizontally or vertically. Caller supplies start/end bookends so we can evaluate
// the first and last interior vertex against their real neighbours. Vertices marked
// `userPlaced = true` are preserved so caller-originated waypoints (clicked corners,
// drag targets) survive cleanup; only router-added stubs get pruned.
export function dropCollinearVerts(verts, startPos, endPos) {
    if (!Array.isArray(verts) || verts.length === 0) return verts ? verts.slice() : [];
    const poly = [startPos, ...verts, endPos];
    const out = [];
    for (let i = 1; i < poly.length - 1; i++) {
        const curr = poly[i];
        const prev = out.length > 0 ? out[out.length - 1] : poly[i - 1];
        const next = poly[i + 1];
        if (curr && curr.userPlaced === true) {
            out.push(curr);
            continue;
        }
        const collinearH = prev.y === curr.y && curr.y === next.y;
        const collinearV = prev.x === curr.x && curr.x === next.x;
        if (collinearH || collinearV) continue;
        out.push(curr);
    }
    return out;
}

// Strict interior point-in-rectangle test. Exclusive on edges so pins sitting on
// a component's bounding edge aren't considered "inside" the next component.
function pointInsideRect(x, y, ob) {
    return x > ob.x1 && x < ob.x2 && y > ob.y1 && y < ob.y2;
}

// Does an axis-aligned segment a->b intersect the strict interior of rect ob?
// For orthogonal wires, the segment is either horizontal (a.y === b.y) or vertical
// (a.x === b.x). We test the constant coordinate against the opposite range (strict),
// then the variable range against the matching range (non-empty overlap).
export function segmentIntersectsRect(a, b, ob) {
    if (!a || !b || !ob) return false;
    if (a.y === b.y) {
        if (a.y <= ob.y1 || a.y >= ob.y2) return false;
        const xMin = Math.min(a.x, b.x);
        const xMax = Math.max(a.x, b.x);
        return xMax > ob.x1 && xMin < ob.x2;
    }
    if (a.x === b.x) {
        if (a.x <= ob.x1 || a.x >= ob.x2) return false;
        const yMin = Math.min(a.y, b.y);
        const yMax = Math.max(a.y, b.y);
        return yMax > ob.y1 && yMin < ob.y2;
    }
    // Non-orthogonal segments aren't expected from the router; bail safely.
    return false;
}

// Count how many segments of `path` cross (strict interior) any of the obstacles.
// Each segment is counted at most once even if it crosses multiple obstacles.
export function countPathCrossings(path, obstacles) {
    if (!Array.isArray(path) || !Array.isArray(obstacles) || obstacles.length === 0) return 0;
    let n = 0;
    for (let i = 0; i < path.length - 1; i++) {
        for (const ob of obstacles) {
            if (segmentIntersectsRect(path[i], path[i + 1], ob)) { n++; break; }
        }
    }
    return n;
}

// Build an orthogonal path that honours user-provided midpoints in sequence and
// uses pin directions to bias stub placement near endpoints. Optionally accepts
// `obstacles: [{x1, y1, x2, y2}]` — rectangles the router should avoid routing
// an L-elbow into (used to steer wires around component bodies).
export function routeManhattan(start, midPoints, end, startDir = null, endDir = null, opts = {}) {
    const preferredOrientation = opts.preferredOrientation || null;
    const stickiness = Number.isFinite(opts.stickiness) ? opts.stickiness : 0.6;
    const obstacles = Array.isArray(opts.obstacles) ? opts.obstacles : null;
    const obstaclePenalty = Number.isFinite(opts.obstaclePenalty) ? opts.obstaclePenalty : 6;
    let orientationHint = preferredOrientation;
    // Preserve userPlaced so callers can distinguish the user's targets from router-added stubs.
    const targets = [...(midPoints || []), end].map((p) => {
        const snapped = snapToBoardPoint(p.x, p.y);
        if (p && p.userPlaced) snapped.userPlaced = true;
        return snapped;
    });

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
        const dirIn  = isEnd ? endDir : null;
        const snapT = t;

        // direct align
        if (last.x === snapT.x || last.y === snapT.y) {
            pts.push(snapT);
            last = snapT;
            return;
        }

        // propose two L paths; pick one that aligns with dir hints
        const pathA = [snapToBoardPoint(snapT.x, last.y), snapT];
        const pathB = [snapToBoardPoint(last.x, snapT.y), snapT];
        const orientA = ROUTE_ORIENTATION.H_FIRST;
        const orientB = ROUTE_ORIENTATION.V_FIRST;

        function score(path, orientation) {
            let s = path.length;
            if (dirOut) {
                const first = path[0];
                if (dirOut.x && first.x === last.x) s += 1;
                if (dirOut.y && first.y === last.y) s += 1;
            }
            if (dirIn) {
                const prev = path[path.length - 2] || last;
                if (dirIn.x && prev.x === snapT.x) s += 1;
                if (dirIn.y && prev.y === snapT.y) s += 1;
            }
            if (orientationHint && orientation) {
                if (orientation === orientationHint) s -= stickiness;
                else s += stickiness * 0.25;
            }
            // Strongly penalize candidate paths whose segments pass through a component
            // body. Segment-level check (not just elbow) so a long straight run that
            // skewers a component is also caught. The full L-path is `[last, ...path]`.
            if (obstacles && obstacles.length) {
                const fullPath = [last, ...path];
                for (let si = 0; si < fullPath.length - 1; si++) {
                    let hit = false;
                    for (const ob of obstacles) {
                        if (segmentIntersectsRect(fullPath[si], fullPath[si + 1], ob)) {
                            hit = true;
                            break;
                        }
                    }
                    if (hit) s += obstaclePenalty;
                }
            }
            return s;
        }

        const scoreA = score(pathA, orientA);
        const scoreB = score(pathB, orientB);
        const pickA = scoreA <= scoreB;
        const best = pickA ? pathA : pathB;
        const chosenOrientation = pickA ? orientA : orientB;
        if (!orientationHint) orientationHint = chosenOrientation;

        // ensure stubs honoring dirOut
        if (dirOut) {
            const stub = stubFrom(last, dirOut, best[0]);
            if (stub.x !== last.x || stub.y !== last.y) pts.push(stub);
        }

        best.forEach(p => pts.push(p));
        last = snapT;

        // add arrival stub if needed
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

// Orthogonal A* pathfinder: finds a grid-aligned path from start to end that avoids
// component bodies. Used as a fallback when the cheap L router (routeManhattan)
// produces a path that crosses obstacles both ways. Keeps runtime bounded by
// limiting exploration to a box around start/end plus any obstacles, and caps the
// total node expansions.
//
// opts:
//   obstacles     — [{x1,y1,x2,y2}] strict-interior avoidance rectangles
//   step          — grid step (defaults to GRID)
//   margin        — padding around the start/end/obstacle bbox (defaults to 4*step)
//   maxNodes      — cap on node expansions (defaults to 8000)
//   cornerPenalty — extra g-cost for changing direction (defaults to 2)
//
// Returns an array of {x,y} or null if no path found. The path is already
// compressed to turn points (collinear grid walks are collapsed into single edges).
export function routeAStar(start, end, opts = {}) {
    const obstacles = Array.isArray(opts.obstacles) ? opts.obstacles : [];
    const step = Number.isFinite(opts.step) ? opts.step : GRID;
    const margin = Number.isFinite(opts.margin) ? opts.margin : step * 4;
    const maxNodes = Number.isFinite(opts.maxNodes) ? opts.maxNodes : 8000;
    const cornerPenalty = Number.isFinite(opts.cornerPenalty) ? opts.cornerPenalty : 2;

    const sx = snapToGrid(start.x);
    const sy = snapToGrid(start.y);
    const ex = snapToGrid(end.x);
    const ey = snapToGrid(end.y);

    let minX = Math.min(sx, ex) - margin;
    let maxX = Math.max(sx, ex) + margin;
    let minY = Math.min(sy, ey) - margin;
    let maxY = Math.max(sy, ey) + margin;
    for (const ob of obstacles) {
        minX = Math.min(minX, ob.x1 - step);
        maxX = Math.max(maxX, ob.x2 + step);
        minY = Math.min(minY, ob.y1 - step);
        maxY = Math.max(maxY, ob.y2 + step);
    }

    const isBlocked = (x, y) => {
        for (const ob of obstacles) {
            if (x > ob.x1 && x < ob.x2 && y > ob.y1 && y < ob.y2) return true;
        }
        return false;
    };

    if (isBlocked(sx, sy) || isBlocked(ex, ey)) return null;

    const keyOf = (x, y) => `${x},${y}`;
    const startKey = keyOf(sx, sy);
    const endKey = keyOf(ex, ey);
    const manhattan = (x1, y1, x2, y2) => Math.abs(x1 - x2) + Math.abs(y1 - y2);

    const gScore = new Map([[startKey, 0]]);
    const cameFrom = new Map();
    const dirInto = new Map(); // 'h' | 'v' — direction we entered this cell from

    // Open set as a flat array of [fScore, key]. Linear-scan extraction is fine for
    // typical board-scale searches; swap for a binary heap if this ever becomes hot.
    const open = [[manhattan(sx, sy, ex, ey), startKey]];
    const openSet = new Set([startKey]);
    const NEIGHBORS = [[step, 0, 'h'], [-step, 0, 'h'], [0, step, 'v'], [0, -step, 'v']];

    let expansions = 0;
    while (open.length > 0 && expansions < maxNodes) {
        let minIdx = 0;
        for (let i = 1; i < open.length; i++) {
            if (open[i][0] < open[minIdx][0]) minIdx = i;
        }
        const [, currentKey] = open.splice(minIdx, 1)[0];
        openSet.delete(currentKey);
        expansions += 1;

        if (currentKey === endKey) {
            const walk = [];
            let k = currentKey;
            while (k) {
                const [x, y] = k.split(',').map(Number);
                walk.unshift({ x, y });
                k = cameFrom.get(k);
            }
            // Compress collinear runs so callers get turn points, not every grid cell.
            if (walk.length <= 2) return walk;
            const verts = walk.slice(1, walk.length - 1);
            return [walk[0], ...dropCollinearVerts(verts, walk[0], walk[walk.length - 1]), walk[walk.length - 1]];
        }

        const [cx, cy] = currentKey.split(',').map(Number);
        const currentDir = dirInto.get(currentKey) || null;

        for (const [dx, dy, ndir] of NEIGHBORS) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
            if (isBlocked(nx, ny)) continue;
            const nKey = keyOf(nx, ny);
            const turn = currentDir && currentDir !== ndir ? cornerPenalty : 0;
            const tentativeG = (gScore.get(currentKey) ?? Infinity) + 1 + turn;
            if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
                cameFrom.set(nKey, currentKey);
                dirInto.set(nKey, ndir);
                gScore.set(nKey, tentativeG);
                const f = tentativeG + manhattan(nx, ny, ex, ey);
                if (!openSet.has(nKey)) {
                    open.push([f, nKey]);
                    openSet.add(nKey);
                }
            }
        }
    }

    return null;
}

// Distance from a point p to the finite segment v→w.
export function distToSegment(p, v, w) {
    const sqr = (x) => x * x;
    const dist2 = (a, b) => sqr(a.x - b.x) + sqr(a.y - b.y);
    const l2 = dist2(v, w);
    if (l2 === 0) return Math.sqrt(dist2(p, v));
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt(
        dist2(p, {
            x: v.x + t * (w.x - v.x),
            y: v.y + t * (w.y - v.y)
        })
    );
}

// When an endpoint moves, only adjust the segments touching that endpoint to keep
// the wire orthogonal; leave interior vertices untouched so user-defined bends stay put.
export function adjustWireAnchors(wire, { start, end, startDir = null, endDir = null } = {}) {
    const snap = (p = {}) => snapToBoardPoint(p.x ?? 0, p.y ?? 0);
    const poly = [
        snap(start),
        ...(Array.isArray(wire?.vertices) ? wire.vertices.map(v => snap(v)) : []),
        snap(end)
    ];

    function insertElbow(anchorIdx, neighborIdx, dirHint = null) {
        const anchor = poly[anchorIdx];
        const neighbor = poly[neighborIdx];
        if (!anchor || !neighbor) return;
        if (anchor.x === neighbor.x || anchor.y === neighbor.y) return; // already orthogonal

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
        // Place the elbow between anchor and neighbor; index choice keeps vertex order stable.
        const insertIdx = anchorIdx < neighborIdx ? neighborIdx : anchorIdx;
        poly.splice(insertIdx, 0, snapped);
    }

    if (startDir) insertElbow(0, 1, startDir);
    if (endDir) insertElbow(poly.length - 1, poly.length - 2, endDir);

    const cleaned = mergeCollinear(poly);
    return cleaned.slice(1, Math.max(1, cleaned.length - 1));
}
