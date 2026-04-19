import { describe, it, expect } from 'vitest';
import {
  fileTimestamp,
  validateSaveData,
  serializeCircuitPayload
} from './persistence.js';

describe('fileTimestamp', () => {
  it('formats a Date as YYYYMMDD-HHmm with zero padding', () => {
    const d = new Date(2025, 2, 7, 4, 9); // March 7 2025 04:09
    expect(fileTimestamp(d)).toBe('20250307-0409');
  });

  it('uses current time when called with no argument', () => {
    expect(fileTimestamp()).toMatch(/^\d{8}-\d{4}$/);
  });
});

describe('validateSaveData', () => {
  const opts = { schemaId: 'cf', schemaVersion: 2 };

  it('returns data when valid', () => {
    const data = { schema: 'cf', version: 1, components: [] };
    expect(validateSaveData(data, opts)).toBe(data);
  });

  it('rejects non-object input', () => {
    expect(() => validateSaveData(null, opts)).toThrow(/Invalid save data/);
    expect(() => validateSaveData('nope', opts)).toThrow(/Invalid save data/);
  });

  it('rejects wrong schema id', () => {
    expect(() => validateSaveData({ schema: 'other', version: 1 }, opts))
      .toThrow(/not a Circuit Forge save/);
  });

  it('rejects missing or non-numeric version', () => {
    expect(() => validateSaveData({ schema: 'cf' }, opts)).toThrow(/Missing save version/);
    expect(() => validateSaveData({ schema: 'cf', version: '1' }, opts)).toThrow(/Missing save version/);
  });

  it('rejects versions newer than the current schema', () => {
    expect(() => validateSaveData({ schema: 'cf', version: 3 }, opts))
      .toThrow(/newer version/);
  });
});

describe('serializeCircuitPayload', () => {
  const getComponentTypeId = (c) => c.kind || null;

  it('emits schema, version, metadata, components, and wires', () => {
    const comp = { id: 'R1', kind: 'resistor', x: 10, y: 20, rotation: 0, props: { R: 100 } };
    const wire = { from: { c: comp, p: 0 }, to: { c: comp, p: 1 }, vertices: [{ x: 1, y: 2 }] };
    const payload = serializeCircuitPayload({
      schemaId: 'cf',
      schemaVersion: 1,
      metadata: { savedAt: 'now' },
      components: [comp],
      wires: [wire],
      getComponentTypeId
    });
    expect(payload.schema).toBe('cf');
    expect(payload.version).toBe(1);
    expect(payload.metadata).toEqual({ savedAt: 'now' });
    expect(payload.components).toEqual([
      { id: 'R1', type: 'resistor', x: 10, y: 20, rotation: 0, mirrorX: false, props: { R: 100 } }
    ]);
    expect(payload.wires).toEqual([
      { from: { id: 'R1', p: 0 }, to: { id: 'R1', p: 1 }, vertices: [{ x: 1, y: 2 }] }
    ]);
  });

  it('drops components whose type cannot be resolved', () => {
    const payload = serializeCircuitPayload({
      schemaId: 'cf',
      schemaVersion: 1,
      metadata: {},
      components: [{ id: 'X1', kind: null, x: 0, y: 0, rotation: 0, props: {} }],
      wires: [],
      getComponentTypeId
    });
    expect(payload.components).toEqual([]);
  });

  it('drops wires missing either endpoint id', () => {
    const comp = { id: 'C1', kind: 'capacitor', x: 0, y: 0, rotation: 0, props: {} };
    const orphan = { from: { c: {}, p: 0 }, to: { c: comp, p: 1 }, vertices: [] };
    const payload = serializeCircuitPayload({
      schemaId: 'cf',
      schemaVersion: 1,
      metadata: {},
      components: [comp],
      wires: [orphan],
      getComponentTypeId
    });
    expect(payload.wires).toEqual([]);
  });

  it('defaults vertices to [] when absent', () => {
    const comp = { id: 'C1', kind: 'capacitor', x: 0, y: 0, rotation: 0, props: {} };
    const wire = { from: { c: comp, p: 0 }, to: { c: comp, p: 1 } };
    const payload = serializeCircuitPayload({
      schemaId: 'cf',
      schemaVersion: 1,
      metadata: {},
      components: [comp],
      wires: [wire],
      getComponentTypeId
    });
    expect(payload.wires[0].vertices).toEqual([]);
  });
});
