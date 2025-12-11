import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  autoscaleScopeVoltage,
  updateCursors,
  __testSetScope
} from '../../../circuitforge.js';

const HISTORY_SIZE = 1200;

function makeData({ min = 0, max = 0 }) {
  return new Array(HISTORY_SIZE).fill(0).map((_, idx) => {
    const t = idx / (HISTORY_SIZE - 1);
    return min + (max - min) * t;
  });
}

function stubScope({ ch1, ch2, vdiv1 = '1', vdiv2 = '1', timeDiv = '1m' }) {
  return {
    props: { TimeDiv: timeDiv, VDiv1: vdiv1, VDiv2: vdiv2 },
    data: { ch1, ch2 },
    head: 0
  };
}

function stubDom() {
  const store = new Map();
  const makeEl = (id) => {
    const el = { id, innerText: '', style: {}, value: '' };
    store.set(id, el);
    return el;
  };
  ['cursor-1', 'cursor-2', 'scope-vdiv1', 'scope-vdiv2', 'scope-time-div'].forEach(makeEl);
  ['ch1-va', 'ch1-vb', 'ch1-dv', 'ch2-va', 'ch2-vb', 'ch2-dv', 'chd-va', 'chd-vb', 'chd-dv', 'ch1-max', 'ch1-min', 'ch2-max', 'ch2-min', 'cursor-dt', 'cursor-freq', 'cursor-ta', 'cursor-tb'].forEach(makeEl);
  store.get('cursor-1').style.left = '20';
  store.get('cursor-2').style.left = '80';
  global.document = {
    getElementById: (id) => store.get(id) || null,
    querySelectorAll: () => []
  };
  return store;
}

beforeEach(() => {
  global.document = undefined;
});

describe('scope autoscale and metrics', () => {
  it('sets both channel V/div using the larger Vpp rounded up', () => {
    stubDom();
    const scope = stubScope({
      ch1: makeData({ min: -1, max: 1 }),
      ch2: makeData({ min: -3, max: 3 }),
      vdiv1: '0.5',
      vdiv2: '0.5'
    });
    __testSetScope(scope);
    autoscaleScopeVoltage();
    expect(scope.props.VDiv1).toBe('1');
    expect(scope.props.VDiv2).toBe('1');
  });

  it('updates cursor table with channel diff and extrema', () => {
    const dom = stubDom();
    const scope = stubScope({
      ch1: makeData({ min: 1, max: 2 }),
      ch2: makeData({ min: -1, max: -0.5 })
    });
    __testSetScope(scope);
    updateCursors();
    expect(parseFloat(dom.get('chd-va').innerText)).toBeGreaterThan(1.5);
    expect(parseFloat(dom.get('chd-va').innerText)).toBeLessThan(3);
    expect(parseFloat(dom.get('chd-vb').innerText)).toBeGreaterThan(1.5);
    expect(parseFloat(dom.get('chd-vb').innerText)).toBeLessThan(3);
    expect(parseFloat(dom.get('ch1-max').innerText)).toBeCloseTo(2, 2);
    expect(parseFloat(dom.get('ch2-min').innerText)).toBeCloseTo(-1, 2);
  });
});
