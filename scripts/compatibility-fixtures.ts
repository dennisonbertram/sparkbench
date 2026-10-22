import type { Project, PartInstance, Wire } from '../src/core/types';
import type { CircuitInventory } from '../src/core/compatibility';
import type { CustomPartSpec } from '../src/core/customParts';

const part = (id: string, type: string, ref: string, props = {}): PartInstance => ({ id, type, ref, props, x: 0, y: 0 });
const wire = (id: string, a: string, ap: string, b: string, bp: string): Wire => ({ id, a: { part: a, pin: ap }, b: { part: b, pin: bp } });
const project = (id: string, board: Project['board'], parts: PartInstance[], wires: Wire[], customParts?: CustomPartSpec[]): Project => ({
  id, name: id, summary: 'Synthetic compatibility reference circuit', board, parts, wires, customParts,
  files: {}, notes: [], version: 1, createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
});
const esp = { ref: 'U1', value: 'ESP32 DevKit V1', footprint: 'Sparkbench:ESP32_DevKit_V1_30pin' };
const header = (n: string) => `Connector_PinHeader_2.54mm:PinHeader_1x${n}_P2.54mm_Vertical`;

// Expectations are written separately from the exporter/model; do not regenerate them.
// LED footprint: cathode=1, anode=2. DevKit V1 (30-pin, DIP numbering):
// GND=14/17, 3V3=16, GPIO21=26, GPIO22=29, GPIO34=4.
// The synthetic module deliberately uses header order SIGNAL, GND, VCC, unlike the OLED.
const custom: CustomPartSpec = {
  type: 'custom-lab-module', name: 'Synthetic analog module', mpn: 'LAB_MODULE',
  category: 'sensor', description: 'Synthetic header mapping fixture.', eli5: 'A test module.',
  refPrefix: 'U', interface: 'analog', priceUsd: 0, supplierQuery: '',
  pins: [{ name: 'SIGNAL', role: 'io', fn: 'adc' }, { name: 'GND', role: 'gnd' }, { name: 'VCC', role: 'power' }],
  sim: { kind: 'none' },
};

export const compatibilityFixtures: { id: string; project: Project; expected: CircuitInventory }[] = [
  {
    id: 'led-polarity',
    project: project('led-polarity', 'none', [part('battery', 'battery-9v', 'BT1'), part('resistor', 'resistor', 'R1', { ohms: 1000 }), part('led', 'led', 'D1')], [
      wire('w1', 'battery', '+', 'resistor', '1'), wire('w2', 'resistor', '2', 'led', 'A'), wire('w3', 'led', 'C', 'battery', '-'),
    ]),
    expected: {
      components: [
        { ref: 'BT1', value: '9V', footprint: 'Battery:BatteryHolder_MPD_BA9VPC_1xPP3' },
        { ref: 'R1', value: '1k', footprint: 'Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal' },
        { ref: 'D1', value: 'LED_RED', footprint: 'LED_THT:LED_D5.0mm' },
      ],
      nets: [['BT1.1', 'R1.1'], ['R1.2', 'D1.2'], ['D1.1', 'BT1.2']],
    },
  },
  {
    id: 'i2c-display',
    project: project('i2c-display', 'esp32', [part('board', 'esp32-devkit', 'U1'), part('screen', 'ssd1306', 'DS1')], [
      wire('w1', 'board', 'GND.1', 'screen', 'GND'), wire('w2', 'board', '3V3', 'screen', 'VCC'),
      wire('w3', 'board', 'D21', 'screen', 'SDA'), wire('w4', 'board', 'D22', 'screen', 'SCL'),
    ]),
    expected: {
      components: [esp, { ref: 'DS1', value: 'OLED_SSD1306', footprint: header('04') }],
      nets: [['U1.14', 'U1.17', 'DS1.1'], ['U1.16', 'DS1.2'], ['U1.26', 'DS1.4'], ['U1.29', 'DS1.3']],
    },
  },
  {
    id: 'custom-header',
    project: project('custom-header', 'esp32', [part('board', 'esp32-devkit', 'U1'), part('module', custom.type, 'U2')], [
      wire('w1', 'board', 'D34', 'module', 'SIGNAL'), wire('w2', 'board', 'GND.1', 'module', 'GND'), wire('w3', 'board', '3V3', 'module', 'VCC'),
    ], [custom]),
    expected: {
      components: [esp, { ref: 'U2', value: 'LAB_MODULE', footprint: header('03') }],
      nets: [['U1.4', 'U2.1'], ['U1.14', 'U1.17', 'U2.2'], ['U1.16', 'U2.3']],
    },
  },
];
