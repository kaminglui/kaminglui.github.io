// Template data extracted from the former mixer-karaoke.json so it can be imported as a JS module in browsers
// without JSON module/assertion support.
const mixerKaraoke = {
  id: "mixer-karaoke",
  label: "Mixer Karaoke",
  icon: "fas fa-microphone-lines text-cyan-300",
  components: [
    {
      id: "op_amp",
      type: "lf412",
      x: 730,
      y: 2010,
      rotation: 0,
      mirrorX: false,
      props: {}
    },
    {
      id: "r1",
      type: "resistor",
      x: 570,
      y: 1930,
      rotation: 0,
      mirrorX: false,
      props: {
        R: "7.5k",
        Tolerance: "1"
      }
    },
    {
      id: "r2",
      type: "resistor",
      x: 250,
      y: 1990,
      rotation: 0,
      mirrorX: false,
      props: {
        R: "7.5k",
        Tolerance: "1"
      }
    },
    {
      id: "r3",
      type: "resistor",
      x: 250,
      y: 2070,
      rotation: 0,
      mirrorX: false,
      props: {
        R: "7.5k",
        Tolerance: "1"
      }
    },
    {
      id: "r4",
      type: "resistor",
      x: 570,
      y: 2170,
      rotation: 1,
      mirrorX: false,
      props: {
        R: "7.5k",
        Tolerance: "1"
      }
    },
    {
      id: "spdt",
      type: "switch",
      x: 390,
      y: 2070,
      rotation: 0,
      mirrorX: false,
      props: {
        Type: "SPDT",
        Position: "B"
      }
    },
    {
      id: "gnd1",
      type: "ground",
      x: 570,
      y: 2250,
      rotation: 0,
      mirrorX: false,
      props: {}
    },
    {
      id: "fun_gen_mid1",
      type: "funcGen",
      x: 50,
      y: 1870,
      rotation: 0,
      mirrorX: false,
      props: {
        Vpp: "0.25",
        Freq: "880",
        Offset: "0",
        Phase: "0",
        Wave: "sine"
      }
    },
    {
      id: "fun_gen_low",
      type: "funcGen",
      x: -70,
      y: 1870,
      rotation: 0,
      mirrorX: false,
      props: {
        Vpp: "0.25",
        Freq: "110",
        Offset: "0",
        Phase: "0",
        Wave: "sine"
      }
    },
    {
      id: "scope",
      type: "oscilloscope",
      x: 510,
      y: 1750,
      rotation: 0,
      mirrorX: false,
      props: {
        TimeDiv: "10m",
        VDiv1: "200m",
        VDiv2: "200m"
      }
    },
    {
      id: "gnd2",
      type: "ground",
      x: 550,
      y: 1830,
      rotation: 0,
      mirrorX: false,
      props: {}
    },
    {
      id: "vcc1",
      type: "voltageSource",
      x: 650,
      y: 2130,
      rotation: 2,
      mirrorX: false,
      props: {
        Vdc: "15"
      }
    },
    {
      id: "gnd3",
      type: "ground",
      x: 650,
      y: 2250,
      rotation: 0,
      mirrorX: false,
      props: {}
    },
    {
      id: "vcc2",
      type: "voltageSource",
      x: 810,
      y: 1890,
      rotation: 2,
      mirrorX: false,
      props: {
        Vdc: "15"
      }
    },
    {
      id: "gnd4",
      type: "ground",
      x: 810,
      y: 1770,
      rotation: 2,
      mirrorX: false,
      props: {}
    },
    {
      id: "gnd5",
      type: "ground",
      x: 50,
      y: 1950,
      rotation: 0,
      mirrorX: false,
      props: {}
    },
    {
      id: "fun_gen_high",
      type: "funcGen",
      x: -70,
      y: 2050,
      rotation: 0,
      mirrorX: false,
      props: {
        Vpp: "0.25",
        Freq: "3520",
        Offset: "0",
        Phase: "0",
        Wave: "sine"
      }
    },
    {
      id: "fun_gen_mid2",
      type: "funcGen",
      x: 50,
      y: 2050,
      rotation: 0,
      mirrorX: false,
      props: {
        Vpp: "0.25",
        Freq: "880",
        Offset: "0",
        Phase: "0",
        Wave: "sine"
      }
    },
    {
      id: "gnd6",
      type: "ground",
      x: 50,
      y: 2130,
      rotation: 0,
      mirrorX: false,
      props: {}
    },
    {
      id: "junction1",
      type: "junction",
      x: 470,
      y: 1990,
      rotation: 0,
      mirrorX: false,
      props: {}
    },
    {
      id: "junction2",
      type: "junction",
      x: 470,
      y: 1930,
      rotation: 0,
      mirrorX: false,
      props: {}
    },
    {
      id: "junction3",
      type: "junction",
      x: 570,
      y: 2090,
      rotation: 0,
      mirrorX: false,
      props: {}
    }
  ],
  wires: [
    {
      from: {
        id: "spdt",
        pin: 0
      },
      to: {
        id: "r3",
        pin: 1
      },
      vertices: []
    },
    {
      from: {
        id: "gnd2",
        pin: 0
      },
      to: {
        id: "scope",
        pin: 2
      },
      vertices: []
    },
    {
      from: {
        id: "vcc2",
        pin: 0
      },
      to: {
        id: "op_amp",
        pin: 7
      },
      vertices: [
        {
          x: 810,
          y: 1970
        }
      ]
    },
    {
      from: {
        id: "gnd4",
        pin: 0
      },
      to: {
        id: "vcc2",
        pin: 1
      },
      vertices: []
    },
    {
      from: {
        id: "fun_gen_low",
        pin: 0
      },
      to: {
        id: "r2",
        pin: 0
      },
      vertices: [
        {
          x: -90,
          y: 1990
        }
      ]
    },
    {
      from: {
        id: "gnd5",
        pin: 0
      },
      to: {
        id: "fun_gen_mid1",
        pin: 1
      },
      vertices: []
    },
    {
      from: {
        id: "fun_gen_mid1",
        pin: 0
      },
      to: {
        id: "fun_gen_low",
        pin: 1
      },
      vertices: [
        {
          x: 30,
          y: 1930
        },
        {
          x: -70,
          y: 1930
        }
      ]
    },
    {
      from: {
        id: "fun_gen_mid2",
        pin: 0
      },
      to: {
        id: "fun_gen_high",
        pin: 1
      },
      vertices: [
        {
          x: 30,
          y: 2110
        },
        {
          x: -70,
          y: 2110
        }
      ]
    },
    {
      from: {
        id: "gnd6",
        pin: 0
      },
      to: {
        id: "fun_gen_mid2",
        pin: 1
      },
      vertices: []
    },
    {
      from: {
        id: "fun_gen_high",
        pin: 0
      },
      to: {
        id: "r3",
        pin: 0
      },
      vertices: [
        {
          x: -90,
          y: 2170
        },
        {
          x: 150,
          y: 2170
        },
        {
          x: 150,
          y: 2070
        }
      ]
    },
    {
      from: {
        id: "junction1",
        pin: 0
      },
      to: {
        id: "r2",
        pin: 1
      },
      vertices: []
    },
    {
      from: {
        id: "op_amp",
        pin: 1
      },
      to: {
        id: "junction1",
        pin: 0
      },
      vertices: []
    },
    {
      from: {
        id: "spdt",
        pin: 1
      },
      to: {
        id: "junction1",
        pin: 0
      },
      vertices: [
        {
          x: 470,
          y: 2050
        }
      ]
    },
    {
      from: {
        id: "r1",
        pin: 1
      },
      to: {
        id: "op_amp",
        pin: 0
      },
      vertices: [
        {
          x: 650,
          y: 1930
        },
        {
          x: 650,
          y: 1970
        }
      ]
    },
    {
      from: {
        id: "r1",
        pin: 0
      },
      to: {
        id: "junction2",
        pin: 0
      },
      vertices: []
    },
    {
      from: {
        id: "junction2",
        pin: 0
      },
      to: {
        id: "junction1",
        pin: 0
      },
      vertices: [
        {
          x: 470,
          y: 1930
        }
      ]
    },
    {
      from: {
        id: "scope",
        pin: 0
      },
      to: {
        id: "junction2",
        pin: 0
      },
      vertices: []
    },
    {
      from: {
        id: "op_amp",
        pin: 2
      },
      to: {
        id: "junction3",
        pin: 0
      },
      vertices: [
        {
          x: 570,
          y: 2030
        }
      ]
    },
    {
      from: {
        id: "junction3",
        pin: 0
      },
      to: {
        id: "spdt",
        pin: 2
      },
      vertices: [
        {
          x: 570,
          y: 2090
        }
      ]
    },
    {
      from: {
        id: "r4",
        pin: 0
      },
      to: {
        id: "junction3",
        pin: 0
      },
      vertices: []
    },
    {
      from: {
        id: "r4",
        pin: 1
      },
      to: {
        id: "gnd1",
        pin: 0
      },
      vertices: []
    },
    {
      from: {
        id: "vcc1",
        pin: 0
      },
      to: {
        id: "gnd3",
        pin: 0
      },
      vertices: []
    },
    {
      from: {
        id: "op_amp",
        pin: 3
      },
      to: {
        id: "vcc1",
        pin: 1
      },
      vertices: [
        {
          x: 650,
          y: 2050
        }
      ]
    }
  ]
};

export default mixerKaraoke;
