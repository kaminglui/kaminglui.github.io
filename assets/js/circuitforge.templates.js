// Template library for Circuit Forge
// Replaced with a single subtractor/op-amp circuit that includes DC rails to
// demonstrate output limiting via supply voltages.

window.CIRCUIT_TEMPLATES = [
    {
        id: 'subtract',
        label: 'Op-Amp Subtractor (±15 V rails)',
        icon: 'fas fa-wave-square text-orange-300',
        components: [
            { id: 'czdlbkhsule', type: 'lf412', x: 770, y: 1090, rotation: 0, mirrorX: false, props: {} },
            { id: 'fhm58sa65s5', type: 'resistor', x: 610, y: 1010, rotation: 0, mirrorX: false, props: { R: '7.5k', Tolerance: '1' } },
            { id: '4x14p0u8qi3', type: 'resistor', x: 290, y: 1070, rotation: 0, mirrorX: false, props: { R: '7.5k', Tolerance: '1' } },
            { id: 'c4tnc69osa', type: 'resistor', x: 290, y: 1150, rotation: 0, mirrorX: false, props: { R: '7.5k', Tolerance: '1' } },
            { id: '0k2a7xr7v7st', type: 'resistor', x: 610, y: 1250, rotation: 1, mirrorX: false, props: { R: '7.5k', Tolerance: '1' } },
            { id: 'poxayflc8f', type: 'switch', x: 430, y: 1150, rotation: 0, mirrorX: false, props: { Type: 'SPDT', Position: 'B' } },
            { id: 'vucjw3ajy3', type: 'ground', x: 610, y: 1330, rotation: 0, mirrorX: false, props: {} },
            { id: 'ywdptmj4uw', type: 'funcGen', x: 90, y: 950, rotation: 0, mirrorX: false, props: { Vpp: '0.25', Freq: '880', Offset: '0', Phase: '0', Wave: 'sine' } },
            { id: '5d10959454', type: 'ground', x: 90, y: 1030, rotation: 0, mirrorX: false, props: {} },
            { id: 'zq83rzk8k9', type: 'ground', x: -30, y: 1030, rotation: 0, mirrorX: false, props: {} },
            { id: 'tz8xz7xk03i', type: 'funcGen', x: -30, y: 950, rotation: 0, mirrorX: false, props: { Vpp: '0.25', Freq: '880', Offset: '0', Phase: '0', Wave: 'sine' } },
            { id: 'n8lbcif2t8', type: 'oscilloscope', x: 550, y: 830, rotation: 0, mirrorX: false, props: { TimeDiv: '1m', VDiv1: '50m', VDiv2: '50m' } },
            { id: 'wmuhkky9mgn', type: 'ground', x: 590, y: 910, rotation: 0, mirrorX: false, props: {} },
            { id: 'zp4tsiy189m', type: 'junction', x: 510, y: 1010, rotation: 0, mirrorX: false, props: {} },
            { id: '1ftlm167jao', type: 'junction', x: 510, y: 1070, rotation: 0, mirrorX: false, props: {} },
            { id: '7gjmac8jz2f', type: 'junction', x: 610, y: 1170, rotation: 0, mirrorX: false, props: {} },
            { id: 'cwycw2i657f', type: 'voltageSource', x: 690, y: 1210, rotation: 2, mirrorX: false, props: { Vdc: '15' } },
            { id: '9d3gdcmrqck', type: 'ground', x: 690, y: 1330, rotation: 0, mirrorX: false, props: {} },
            { id: 'th7uyx063', type: 'voltageSource', x: 850, y: 970, rotation: 2, mirrorX: false, props: { Vdc: '15' } },
            { id: '4r79l920m7h', type: 'ground', x: 850, y: 850, rotation: 2, mirrorX: false, props: {} }
        ],
        wires: [
            { from: { id: 'fhm58sa65s5', pin: 1 }, to: { id: 'czdlbkhsule', pin: 0 }, vertices: [ { x: 690, y: 1010 }, { x: 690, y: 1050 } ] },
            { from: { id: 'poxayflc8f', pin: 0 }, to: { id: 'c4tnc69osa', pin: 1 }, vertices: [] },
            { from: { id: '5d10959454', pin: 0 }, to: { id: 'ywdptmj4uw', pin: 1 }, vertices: [] },
            { from: { id: 'zq83rzk8k9', pin: 0 }, to: { id: 'tz8xz7xk03i', pin: 1 }, vertices: [] },
            { from: { id: 'wmuhkky9mgn', pin: 0 }, to: { id: 'n8lbcif2t8', pin: 2 }, vertices: [] },
            { from: { id: '0k2a7xr7v7st', pin: 1 }, to: { id: 'vucjw3ajy3', pin: 0 }, vertices: [] },
            { from: { id: 'zp4tsiy189m', pin: 0 }, to: { id: 'n8lbcif2t8', pin: 0 }, vertices: [] },
            { from: { id: 'fhm58sa65s5', pin: 0 }, to: { id: 'zp4tsiy189m', pin: 0 }, vertices: [] },
            { from: { id: '4x14p0u8qi3', pin: 1 }, to: { id: '1ftlm167jao', pin: 0 }, vertices: [] },
            { from: { id: '1ftlm167jao', pin: 0 }, to: { id: 'zp4tsiy189m', pin: 0 }, vertices: [ { x: 510, y: 1070 } ] },
            { from: { id: 'czdlbkhsule', pin: 1 }, to: { id: '1ftlm167jao', pin: 0 }, vertices: [] },
            { from: { id: 'ywdptmj4uw', pin: 0 }, to: { id: '4x14p0u8qi3', pin: 0 }, vertices: [ { x: 70, y: 1070 } ] },
            { from: { id: 'tz8xz7xk03i', pin: 0 }, to: { id: 'c4tnc69osa', pin: 0 }, vertices: [ { x: -50, y: 1150 } ] },
            { from: { id: 'poxayflc8f', pin: 2 }, to: { id: '7gjmac8jz2f', pin: 0 }, vertices: [ { x: 610, y: 1170 } ] },
            { from: { id: '7gjmac8jz2f', pin: 0 }, to: { id: '0k2a7xr7v7st', pin: 0 }, vertices: [] },
            { from: { id: 'czdlbkhsule', pin: 2 }, to: { id: '7gjmac8jz2f', pin: 0 }, vertices: [ { x: 610, y: 1110 } ] },
            { from: { id: 'poxayflc8f', pin: 1 }, to: { id: '1ftlm167jao', pin: 0 }, vertices: [ { x: 510, y: 1130 } ] },
            { from: { id: 'cwycw2i657f', pin: 1 }, to: { id: 'czdlbkhsule', pin: 3 }, vertices: [ { x: 690, y: 1130 } ] },
            { from: { id: '9d3gdcmrqck', pin: 0 }, to: { id: 'cwycw2i657f', pin: 0 }, vertices: [] },
            { from: { id: 'th7uyx063', pin: 0 }, to: { id: 'czdlbkhsule', pin: 7 }, vertices: [ { x: 850, y: 1050 } ] },
            { from: { id: '4r79l920m7h', pin: 0 }, to: { id: 'th7uyx063', pin: 1 }, vertices: [] }
        ]
    }
];
