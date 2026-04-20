// Voltage LED display: 4 LEDs driven by 4 LF412 comparators against a 15 V
// divider. Thresholds R19:R20:R21:R22:R23 = 54:2:2:1:1 give tap voltages of
// 1.5 / 1.0 / 0.5 / 0.25 V. LED series resistors R14-R17 sized
// (15 V − 3.3 V) / 10 mA ≈ 1170 Ω for a standard red LED at 10 mA.
const voltageLedDisplay = {
  id: 'voltage-led-display',
  label: 'Voltage LED Display',
  icon: 'fas fa-signal',
  components: [
    // --- Power rails ---
    { id: 'V1', type: 'voltageSource', x: 720, y: 540, rotation: 0, mirrorX: false, props: { Vdc: '15' } },
    { id: 'GND1', type: 'ground', x: 720, y: 640, rotation: 0, mirrorX: false, props: {} },
    { id: 'V2', type: 'voltageSource', x: 800, y: 540, rotation: 2, mirrorX: false, props: { Vdc: '15' } },
    { id: 'GND2', type: 'ground', x: 800, y: 640, rotation: 0, mirrorX: false, props: {} },

    // --- Voltage divider (R19-R23, 54:2:2:1:1) ---
    { id: 'R19', type: 'resistor', x: 880, y: 560, rotation: 1, mirrorX: false, props: { R: '54k', Tolerance: '5' } },
    { id: 'R20', type: 'resistor', x: 880, y: 640, rotation: 1, mirrorX: false, props: { R: '2k',  Tolerance: '5' } },
    { id: 'R21', type: 'resistor', x: 880, y: 720, rotation: 1, mirrorX: false, props: { R: '2k',  Tolerance: '5' } },
    { id: 'R22', type: 'resistor', x: 880, y: 800, rotation: 1, mirrorX: false, props: { R: '1k',  Tolerance: '5' } },
    { id: 'R23', type: 'resistor', x: 880, y: 880, rotation: 1, mirrorX: false, props: { R: '1k',  Tolerance: '5' } },
    { id: 'GND3', type: 'ground', x: 880, y: 960, rotation: 0, mirrorX: false, props: {} },

    // --- Input signal (triangle sweep through all four thresholds) ---
    { id: 'FG1', type: 'funcGen', x: 1000, y: 500, rotation: 0, mirrorX: false, props: { Vpp: '2', Freq: '2', Offset: '0.75', Phase: '0', Wave: 'triangle' } },
    { id: 'GND4', type: 'ground', x: 1000, y: 620, rotation: 0, mirrorX: false, props: {} },

    // --- Comparators U2 (thresholds 1.5 V and 1.0 V) and U3 (0.5 V, 0.25 V) ---
    { id: 'U2', type: 'lf412', x: 1200, y: 640, rotation: 0, mirrorX: false, props: {} },
    { id: 'U3', type: 'lf412', x: 1200, y: 840, rotation: 0, mirrorX: false, props: {} },

    // --- LED chain: R → LED → GND for each channel ---
    { id: 'R14', type: 'resistor', x: 1340, y: 600, rotation: 0, mirrorX: false, props: { R: '1170', Tolerance: '5' } },
    { id: 'LED1', type: 'led', x: 1460, y: 600, rotation: 0, mirrorX: false, props: { Vf: '3.3', If: '10m', Color: 'red' } },
    { id: 'GND5', type: 'ground', x: 1520, y: 660, rotation: 0, mirrorX: false, props: {} },

    { id: 'R15', type: 'resistor', x: 1340, y: 660, rotation: 0, mirrorX: false, props: { R: '1170', Tolerance: '5' } },
    { id: 'LED2', type: 'led', x: 1460, y: 660, rotation: 0, mirrorX: false, props: { Vf: '3.3', If: '10m', Color: 'red' } },
    { id: 'GND6', type: 'ground', x: 1520, y: 720, rotation: 0, mirrorX: false, props: {} },

    { id: 'R16', type: 'resistor', x: 1340, y: 800, rotation: 0, mirrorX: false, props: { R: '1170', Tolerance: '5' } },
    { id: 'LED3', type: 'led', x: 1460, y: 800, rotation: 0, mirrorX: false, props: { Vf: '3.3', If: '10m', Color: 'red' } },
    { id: 'GND7', type: 'ground', x: 1520, y: 860, rotation: 0, mirrorX: false, props: {} },

    { id: 'R17', type: 'resistor', x: 1340, y: 860, rotation: 0, mirrorX: false, props: { R: '1170', Tolerance: '5' } },
    { id: 'LED4', type: 'led', x: 1460, y: 860, rotation: 0, mirrorX: false, props: { Vf: '3.3', If: '10m', Color: 'red' } },
    { id: 'GND8', type: 'ground', x: 1520, y: 920, rotation: 0, mirrorX: false, props: {} },

    // --- Junctions so the signal and rails fan out cleanly ---
    { id: 'J_SIG1', type: 'junction', x: 1120, y: 660, rotation: 0, mirrorX: false, props: {} },
    { id: 'J_SIG2', type: 'junction', x: 1120, y: 860, rotation: 0, mirrorX: false, props: {} },
    { id: 'J_VP',   type: 'junction', x: 1100, y: 500, rotation: 0, mirrorX: false, props: {} },
    { id: 'J_VN',   type: 'junction', x: 1100, y: 940, rotation: 0, mirrorX: false, props: {} }
  ],
  wires: [
    // --- Power sources ---
    { from: { id: 'V1',  pin: 1 }, to: { id: 'GND1', pin: 0 }, vertices: [] },
    { from: { id: 'V2',  pin: 0 }, to: { id: 'GND2', pin: 0 }, vertices: [] },

    // +15 V rail: V1.0 → top of divider → junction above op-amps → U2/U3 VCC+
    { from: { id: 'V1',  pin: 0 }, to: { id: 'R19', pin: 0 }, vertices: [{ x: 720, y: 520 }, { x: 880, y: 520 }] },
    { from: { id: 'R19', pin: 0 }, to: { id: 'J_VP', pin: 0 }, vertices: [{ x: 880, y: 500 }] },
    { from: { id: 'J_VP', pin: 0 }, to: { id: 'U2', pin: 7 }, vertices: [{ x: 1240, y: 500 }, { x: 1240, y: 600 }] },
    { from: { id: 'J_VP', pin: 0 }, to: { id: 'U3', pin: 7 }, vertices: [{ x: 1240, y: 500 }, { x: 1240, y: 800 }] },

    // -15 V rail: V2.1 → junction below op-amps → U2/U3 VCC-
    { from: { id: 'V2',  pin: 1 }, to: { id: 'J_VN', pin: 0 }, vertices: [{ x: 800, y: 480 }, { x: 1100, y: 480 }, { x: 1100, y: 940 }] },
    { from: { id: 'J_VN', pin: 0 }, to: { id: 'U2', pin: 3 }, vertices: [{ x: 1160, y: 940 }, { x: 1160, y: 680 }] },
    { from: { id: 'J_VN', pin: 0 }, to: { id: 'U3', pin: 3 }, vertices: [{ x: 1160, y: 940 }, { x: 1160, y: 880 }] },

    // --- Divider chain ---
    { from: { id: 'R19', pin: 1 }, to: { id: 'R20', pin: 0 }, vertices: [] },
    { from: { id: 'R20', pin: 1 }, to: { id: 'R21', pin: 0 }, vertices: [] },
    { from: { id: 'R21', pin: 1 }, to: { id: 'R22', pin: 0 }, vertices: [] },
    { from: { id: 'R22', pin: 1 }, to: { id: 'R23', pin: 0 }, vertices: [] },
    { from: { id: 'R23', pin: 1 }, to: { id: 'GND3', pin: 0 }, vertices: [] },

    // --- Reference taps into op-amp inverting inputs ---
    //  Tap A (1.5 V) = R19.1 / R20.0 → U2 1IN-
    { from: { id: 'R20', pin: 0 }, to: { id: 'U2', pin: 1 }, vertices: [{ x: 940, y: 620 }, { x: 940, y: 620 }] },
    //  Tap B (1.0 V) = R20.1 / R21.0 → U2 2IN-
    { from: { id: 'R21', pin: 0 }, to: { id: 'U2', pin: 5 }, vertices: [{ x: 960, y: 680 }, { x: 1260, y: 680 }, { x: 1260, y: 660 }] },
    //  Tap C (0.5 V) = R21.1 / R22.0 → U3 1IN-
    { from: { id: 'R22', pin: 0 }, to: { id: 'U3', pin: 1 }, vertices: [{ x: 940, y: 760 }, { x: 940, y: 820 }] },
    //  Tap D (0.25 V) = R22.1 / R23.0 → U3 2IN-
    { from: { id: 'R23', pin: 0 }, to: { id: 'U3', pin: 5 }, vertices: [{ x: 960, y: 840 }, { x: 1260, y: 840 }, { x: 1260, y: 860 }] },

    // --- Function generator drives signal to all four + inputs ---
    { from: { id: 'FG1', pin: 1 }, to: { id: 'GND4', pin: 0 }, vertices: [] },
    { from: { id: 'FG1', pin: 0 }, to: { id: 'J_SIG1', pin: 0 }, vertices: [{ x: 980, y: 660 }] },
    { from: { id: 'J_SIG1', pin: 0 }, to: { id: 'U2', pin: 2 }, vertices: [{ x: 1120, y: 660 }] },
    { from: { id: 'J_SIG1', pin: 0 }, to: { id: 'U2', pin: 4 }, vertices: [{ x: 1120, y: 680 }, { x: 1240, y: 680 }] },
    { from: { id: 'J_SIG1', pin: 0 }, to: { id: 'J_SIG2', pin: 0 }, vertices: [{ x: 1120, y: 860 }] },
    { from: { id: 'J_SIG2', pin: 0 }, to: { id: 'U3', pin: 2 }, vertices: [{ x: 1120, y: 860 }] },
    { from: { id: 'J_SIG2', pin: 0 }, to: { id: 'U3', pin: 4 }, vertices: [{ x: 1120, y: 880 }, { x: 1240, y: 880 }] },

    // --- LED drivers: op-amp output → R → LED → GND ---
    { from: { id: 'U2', pin: 0 }, to: { id: 'R14', pin: 0 }, vertices: [{ x: 1160, y: 600 }, { x: 1300, y: 600 }] },
    { from: { id: 'R14', pin: 1 }, to: { id: 'LED1', pin: 0 }, vertices: [] },
    { from: { id: 'LED1', pin: 1 }, to: { id: 'GND5', pin: 0 }, vertices: [{ x: 1480, y: 640 }] },

    { from: { id: 'U2', pin: 6 }, to: { id: 'R15', pin: 0 }, vertices: [{ x: 1280, y: 620 }, { x: 1280, y: 660 }, { x: 1300, y: 660 }] },
    { from: { id: 'R15', pin: 1 }, to: { id: 'LED2', pin: 0 }, vertices: [] },
    { from: { id: 'LED2', pin: 1 }, to: { id: 'GND6', pin: 0 }, vertices: [{ x: 1480, y: 700 }] },

    { from: { id: 'U3', pin: 0 }, to: { id: 'R16', pin: 0 }, vertices: [{ x: 1160, y: 800 }, { x: 1300, y: 800 }] },
    { from: { id: 'R16', pin: 1 }, to: { id: 'LED3', pin: 0 }, vertices: [] },
    { from: { id: 'LED3', pin: 1 }, to: { id: 'GND7', pin: 0 }, vertices: [{ x: 1480, y: 840 }] },

    { from: { id: 'U3', pin: 6 }, to: { id: 'R17', pin: 0 }, vertices: [{ x: 1280, y: 820 }, { x: 1280, y: 860 }, { x: 1300, y: 860 }] },
    { from: { id: 'R17', pin: 1 }, to: { id: 'LED4', pin: 0 }, vertices: [] },
    { from: { id: 'LED4', pin: 1 }, to: { id: 'GND8', pin: 0 }, vertices: [{ x: 1480, y: 900 }] }
  ]
};

export default voltageLedDisplay;
