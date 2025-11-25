/**
 * Default level-1 MOS process parameters for the educational simulator.
 * Values are intentionally simple and mirror a SPICE-like model card.
 */
export const MOS_MODEL_DEFAULTS = {
  NMOS: {
    level: 1,
    kPrime: 140e-6,
    VTO: 0.7,
    GAMMA: 0.45,
    PHI: 0.9,
    LAMBDA: 0.1,
    UO: 350,
    TOX: 9e-9,
    NSUB: 9e14,
    LD: 0.08e-6,
    CJ: 0.56e-3,
    CJSW: 0.35e-11,
    PB: 0.9,
    MJ: 0.45,
    MJSW: 0.2,
    CGDO: 0.4e-9,
    JS: 1.0e-8,
    defaultW: 1e-6,
    defaultL: 1e-6
  },
  PMOS: {
    level: 1,
    kPrime: 40e-6,
    VTO: -0.8,
    GAMMA: 0.4,
    PHI: 0.8,
    LAMBDA: 0.2,
    UO: 100,
    TOX: 9e-9,
    NSUB: 5e14,
    LD: 0.09e-6,
    CJ: 0.94e-3,
    CJSW: 0.32e-11,
    PB: 0.9,
    MJ: 0.5,
    MJSW: 0.3,
    CGDO: 0.3e-9,
    JS: 0.5e-8,
    defaultW: 1e-6,
    defaultL: 1e-6
  }
};
