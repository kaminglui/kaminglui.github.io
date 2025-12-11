import { describe, it, expect, vi } from 'vitest';
import { validateTemplate, mergeTemplateLists, DEFAULT_ICON } from '../../../circuit-lab/templateRegistry.js';

const baseTemplate = {
  id: 'demo',
  label: 'Demo',
  components: [
    { id: 'R1', kind: 'resistor', x: 10, y: 20, props: { R: '1k' } },
    { id: 'C1', type: 'capacitor', x: 30, y: 40, rotation: 1 }
  ],
  wires: [
    { from: { id: 'R1', pin: 0 }, to: { index: 1, pin: 1 }, vertices: [{ x: 20, y: 30 }] }
  ]
};

describe('template validation', () => {
  it('normalizes fields and defaults icon/label', () => {
    const { ok, template, warnings } = validateTemplate({ ...baseTemplate, icon: undefined });
    expect(ok).toBe(true);
    expect(warnings.length).toBe(0);
    expect(template.icon).toBe(DEFAULT_ICON);
    expect(template.label).toBe('Demo');
    expect(template.components[0].type).toBe('resistor');
    expect(template.components[1].rotation).toBe(1);
    expect(template.wires[0].from.id).toBe('R1');
    expect(template.wires[0].to.index).toBe(1);
  });

  it('rejects missing id', () => {
    const { ok, template, warnings } = validateTemplate({ ...baseTemplate, id: '' });
    expect(ok).toBe(false);
    expect(template).toBeNull();
    expect(warnings.some((w) => w.includes('id'))).toBe(true);
  });

  it('drops invalid components and wires', () => {
    const tpl = {
      id: 'bad-wire',
      components: [{ kind: '', x: 0, y: 0 }, { kind: 'led', x: 0, y: 0 }],
      wires: [{ from: {}, to: {} }]
    };
    const { ok, template, warnings } = validateTemplate(tpl);
    expect(ok).toBe(true); // still has one good component
    expect(template.components.length).toBe(1);
    expect(template.wires.length).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe('template merging', () => {
  it('prefers static templates over JSON duplicates', () => {
    const warn = vi.fn();
    const staticList = [{ id: 'a' }, { id: 'b' }];
    const jsonList = [{ id: 'b' }, { id: 'c' }];
    const merged = mergeTemplateLists(staticList, jsonList, warn);
    expect(merged.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('b'));
  });
});
