const COMPONENT_ID_PREFIXES = {
  ground: 'GND',
  voltagesource: 'V',
  functiongenerator: 'FG',
  resistor: 'R',
  capacitor: 'C',
  potentiometer: 'POT',
  led: 'LED',
  mosfet: 'M',
  lf412: 'U',
  switch: 'SW',
  oscilloscope: 'SCOPE',
  junction: 'J'
};

function createIdRegistry() {
  return {
    pools: new Map(),
    usedIds: new Set()
  };
}

const defaultIdRegistry = createIdRegistry();

function ensureRegistry(registry) {
  if (registry && registry.pools && registry.usedIds) return registry;
  return defaultIdRegistry;
}

function resetIdRegistry(registry = defaultIdRegistry) {
  const reg = ensureRegistry(registry);
  reg.pools.clear();
  reg.usedIds.clear();
}

function getIdState(prefix, registry) {
  const reg = ensureRegistry(registry);
  let state = reg.pools.get(prefix);
  if (!state) {
    state = { used: new Set(), free: new Set(), next: 1 };
    reg.pools.set(prefix, state);
  }
  return state;
}

function reserveComponentId(prefix, registry = defaultIdRegistry, providedId) {
  const reg = ensureRegistry(registry);
  const prefixKey = String(prefix || 'X');
  if (providedId && !reg.usedIds.has(providedId)) {
    reg.usedIds.add(providedId);
    const parsed = String(providedId).match(/^([A-Za-z]+)(\d+)$/);
    if (parsed) {
      const parsedPrefix = parsed[1];
      const num = parseInt(parsed[2], 10);
      const state = getIdState(parsedPrefix, reg);
      state.used.add(num);
      state.free.delete(num);
      if (state.next <= num) state.next = num + 1;
    }
    return providedId;
  }
  const state = getIdState(prefixKey, reg);
  let num;
  if (state.free.size) {
    num = Math.min(...state.free);
    state.free.delete(num);
  } else {
    num = state.next;
    state.next += 1;
  }
  let id = `${prefixKey}${num}`;
  while (reg.usedIds.has(id)) {
    num = state.next;
    state.next += 1;
    id = `${prefixKey}${num}`;
  }
  state.used.add(num);
  reg.usedIds.add(id);
  return id;
}

function releaseComponentId(id, registry = defaultIdRegistry) {
  const reg = ensureRegistry(registry);
  if (!id || !reg.usedIds.has(id)) return;
  reg.usedIds.delete(id);
  const parsed = String(id).match(/^([A-Za-z]+)(\d+)$/);
  if (!parsed) return;
  const prefix = parsed[1];
  const num = parseInt(parsed[2], 10);
  const state = getIdState(prefix, reg);
  state.used.delete(num);
  state.free.add(num);
}

export {
  COMPONENT_ID_PREFIXES,
  createIdRegistry,
  defaultIdRegistry,
  resetIdRegistry,
  reserveComponentId,
  releaseComponentId
};
