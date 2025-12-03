// Template library for Circuit Forge
// Each template is defined relative to an origin that is chosen when the
// template is placed on the canvas. Coordinates are offsets from that origin
// so templates can be dropped anywhere without caring about absolute
// positions.

window.CIRCUIT_TEMPLATES = [
    {
        id: 'rc-low-pass',
        label: 'RC Low-Pass',
        icon: 'fas fa-filter text-blue-300',
        components: [
            { id: 'fg', type: 'funcGen', x: -200, y: 0, props: { Vpp: '2', Freq: '1k' } },
            { id: 'r',  type: 'resistor', x: -40,  y: 0, props: { R: '10k' } },
            { id: 'c',  type: 'capacitor', x: 120, y: 40, props: { C: '100n' } },
            { id: 'g',  type: 'ground', x: 120, y: 120 },
            { id: 'scope', type: 'oscilloscope', x: 260, y: 0 }
        ],
        wires: [
            { from: { id: 'fg', pin: 0 }, to: { id: 'r', pin: 0 } },
            { from: { id: 'fg', pin: 1 }, to: { id: 'g',  pin: 0 } },
            { from: { id: 'fg', pin: 2 }, to: { id: 'g',  pin: 0 } },
            { from: { id: 'r',  pin: 1 }, to: { id: 'c',  pin: 0 } },
            { from: { id: 'c',  pin: 1 }, to: { id: 'g',  pin: 0 } },
            { from: { id: 'scope', pin: 0 }, to: { id: 'r', pin: 1 } },
            { from: { id: 'scope', pin: 1 }, to: { id: 'r', pin: 0 } },
            { from: { id: 'scope', pin: 2 }, to: { id: 'g', pin: 0 } }
        ]
    },
    {
        id: 'rc-high-pass',
        label: 'RC High-Pass',
        icon: 'fas fa-chart-line text-emerald-300',
        components: [
            { id: 'fg', type: 'funcGen', x: -200, y: 0, props: { Vpp: '2', Freq: '1k' } },
            { id: 'c',  type: 'capacitor', x: -40,  y: 0, props: { C: '47n' } },
            { id: 'r',  type: 'resistor', x: 120, y: 0, props: { R: '10k' } },
            { id: 'g',  type: 'ground', x: 120, y: 120 },
            { id: 'scope', type: 'oscilloscope', x: 260, y: 0 }
        ],
        wires: [
            { from: { id: 'fg', pin: 0 }, to: { id: 'c', pin: 0 } },
            { from: { id: 'fg', pin: 1 }, to: { id: 'g', pin: 0 } },
            { from: { id: 'fg', pin: 2 }, to: { id: 'g', pin: 0 } },
            { from: { id: 'c',  pin: 1 }, to: { id: 'r', pin: 0 } },
            { from: { id: 'r',  pin: 1 }, to: { id: 'g', pin: 0 } },
            { from: { id: 'scope', pin: 0 }, to: { id: 'r', pin: 0 } },
            { from: { id: 'scope', pin: 1 }, to: { id: 'fg', pin: 0 } },
            { from: { id: 'scope', pin: 2 }, to: { id: 'g', pin: 0 } }
        ]
    },
    {
        id: 'inverting-opamp',
        label: 'Inverting Op-Amp',
        icon: 'fas fa-rotate-left text-amber-300',
        components: [
            { id: 'op',   type: 'lf412', x: 200, y: 0 },
            { id: 'vcc',  type: 'voltageSource', x: 200, y: -180, props: { Vdc: '12' } },
            { id: 'g',    type: 'ground', x: 200, y: 160 },
            { id: 'fg',   type: 'funcGen', x: -140, y: 40, props: { Vpp: '2', Freq: '1k' } },
            { id: 'rin',  type: 'resistor', x: 40, y: 20, props: { R: '10k' } },
            { id: 'rf',   type: 'resistor', x: 260, y: -20, props: { R: '20k' } },
            { id: 'scope',type: 'oscilloscope', x: 420, y: 0 }
        ],
        wires: [
            { from: { id: 'vcc', pin: 0 }, to: { id: 'op', pin: 7 } },
            { from: { id: 'vcc', pin: 1 }, to: { id: 'g',  pin: 0 } },
            { from: { id: 'op',  pin: 3 }, to: { id: 'g',  pin: 0 } },
            { from: { id: 'fg',  pin: 0 }, to: { id: 'rin', pin: 0 } },
            { from: { id: 'fg',  pin: 1 }, to: { id: 'g',   pin: 0 } },
            { from: { id: 'fg',  pin: 2 }, to: { id: 'g',   pin: 0 } },
            { from: { id: 'rin', pin: 1 }, to: { id: 'op',  pin: 1 } },
            { from: { id: 'op',  pin: 2 }, to: { id: 'g',   pin: 0 } },
            { from: { id: 'rf',  pin: 0 }, to: { id: 'op',  pin: 0 } },
            { from: { id: 'rf',  pin: 1 }, to: { id: 'op',  pin: 1 } },
            { from: { id: 'scope', pin: 0 }, to: { id: 'op', pin: 0 } },
            { from: { id: 'scope', pin: 1 }, to: { id: 'fg', pin: 0 } },
            { from: { id: 'scope', pin: 2 }, to: { id: 'g',  pin: 0 } }
        ]
    },
    {
        id: 'non-inverting-opamp',
        label: 'Non-Inverting Op-Amp',
        icon: 'fas fa-plus text-fuchsia-300',
        components: [
            { id: 'op',   type: 'lf412', x: 200, y: 0 },
            { id: 'vcc',  type: 'voltageSource', x: 200, y: -180, props: { Vdc: '12' } },
            { id: 'g',    type: 'ground', x: 200, y: 160 },
            { id: 'fg',   type: 'funcGen', x: -140, y: 40, props: { Vpp: '2', Freq: '1k' } },
            { id: 'rg',   type: 'resistor', x: 80,  y: 60, props: { R: '10k' } },
            { id: 'rf',   type: 'resistor', x: 260, y: -10, props: { R: '10k' } },
            { id: 'scope',type: 'oscilloscope', x: 420, y: 0 }
        ],
        wires: [
            { from: { id: 'vcc', pin: 0 }, to: { id: 'op', pin: 7 } },
            { from: { id: 'vcc', pin: 1 }, to: { id: 'g',  pin: 0 } },
            { from: { id: 'op',  pin: 3 }, to: { id: 'g',  pin: 0 } },
            { from: { id: 'fg',  pin: 0 }, to: { id: 'op', pin: 2 } },
            { from: { id: 'fg',  pin: 1 }, to: { id: 'g',  pin: 0 } },
            { from: { id: 'fg',  pin: 2 }, to: { id: 'g',  pin: 0 } },
            { from: { id: 'rg',  pin: 0 }, to: { id: 'op', pin: 1 } },
            { from: { id: 'rg',  pin: 1 }, to: { id: 'g',  pin: 0 } },
            { from: { id: 'rf',  pin: 0 }, to: { id: 'op', pin: 0 } },
            { from: { id: 'rf',  pin: 1 }, to: { id: 'op', pin: 1 } },
            { from: { id: 'scope', pin: 0 }, to: { id: 'op', pin: 0 } },
            { from: { id: 'scope', pin: 1 }, to: { id: 'fg', pin: 0 } },
            { from: { id: 'scope', pin: 2 }, to: { id: 'g',  pin: 0 } }
        ]
    }
];
