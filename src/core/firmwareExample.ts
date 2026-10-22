import type { Project } from './types';

/** A deliberately small, deterministic project used by the native ESP32 demo. */
export function buildEsp32FirmwareExample(): Project {
  return {
    id: 'esp32-native-demo',
    name: 'ESP32 native firmware LED/button',
    summary: 'A real ESP-IDF image blinks GPIO2 and reads a pulled-up GPIO4 button.',
    board: 'esp32',
    parts: [
      { id: 'board1', type: 'esp32-devkit', label: 'ESP32 DevKit V1', props: {}, x: 100, y: 100 },
      { id: 'resistor1', type: 'resistor', label: 'LED resistor (220 Ω)', props: { ohms: 220 }, x: 300, y: 100 },
      { id: 'led1', type: 'led', label: 'GPIO2 LED', props: { color: 'red' }, x: 430, y: 100 },
      { id: 'resistor2', type: 'resistor', label: 'GPIO4 pull-up (10 kΩ)', props: { ohms: 10000 }, x: 300, y: 300 },
      { id: 'button1', type: 'pushbutton', label: 'GPIO4 button', props: { color: 'red' }, x: 480, y: 300 },
    ],
    wires: [
      { id: 'wire-led-drive', a: { part: 'board1', pin: 'D2' }, b: { part: 'resistor1', pin: '1' } },
      { id: 'wire-led-resistor', a: { part: 'resistor1', pin: '2' }, b: { part: 'led1', pin: 'A' } },
      { id: 'wire-led-ground', a: { part: 'led1', pin: 'C' }, b: { part: 'board1', pin: 'GND.1' } },
      { id: 'wire-pull-vcc', a: { part: 'board1', pin: '3V3' }, b: { part: 'resistor2', pin: '1' } },
      { id: 'wire-pull-gpio', a: { part: 'resistor2', pin: '2' }, b: { part: 'board1', pin: 'D4' } },
      { id: 'wire-button-gpio', a: { part: 'button1', pin: '1' }, b: { part: 'board1', pin: 'D4' } },
      { id: 'wire-button-ground', a: { part: 'button1', pin: '2' }, b: { part: 'board1', pin: 'GND.1' } },
    ],
    // This file is retained for project compatibility; native mode does not execute Python.
    files: { 'main.py': '# Native ESP-IDF firmware is selected separately for this project.\n' },
    notes: [
      'Native mode runs the compiled classic ESP32 image, not main.py.',
      'GPIO4 is pulled to 3V3 through an external 10 kΩ resistor and the button connects it to GND.',
    ],
    createdAt: 0,
    updatedAt: 0,
    version: 1,
  };
}
