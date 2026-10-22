import { BOARDS } from '../src/core/boards';
import type { ElectricalModel } from '../src/core/circuit';
import type { Project } from '../src/core/types';

export type Esp32Control = { part: string; key: 'pressed' | 'position'; value: number };

export function parseEsp32Control(project: Project, partId: string, key: unknown, value: unknown): Esp32Control {
  const part = project.parts.find((candidate) => candidate.id === partId);
  const expected = part?.type === 'pushbutton' ? 'pressed' : part?.type === 'slide-switch' ? 'position' : undefined;
  if (!part || key !== expected || typeof value !== 'number' || !Number.isInteger(value) || (value !== 0 && value !== 1)) {
    throw new Error('invalid input');
  }
  return { part: partId, key: expected as Esp32Control['key'], value };
}

export function applyEsp32Inputs(project: Project, model: ElectricalModel, inputs: unknown): Esp32Control[] {
  if (inputs === undefined) return [];
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) throw new Error('inputs must be a control map');
  const controls = Object.entries(inputs).map(([control, value]) => {
    const separator = control.lastIndexOf('.');
    if (separator <= 0 || separator === control.length - 1) throw new Error(`invalid input control: ${control}`);
    return parseEsp32Control(project, control.slice(0, separator), control.slice(separator + 1), value);
  });
  for (const control of controls) model.setPartState(control.part, control.key, control.value);
  return controls;
}

export function wiredEsp32Gpios(project: Project): number[] {
  const board = project.parts.find((part) => part.type === BOARDS.esp32.partType);
  if (!board) throw new Error('native ESP32 mode requires exactly one ESP32 DevKit V1 board');
  const pins = new Map(BOARDS.esp32.pins.map((pin) => [pin.name, pin]));
  const gpios = new Set<number>();
  for (const wire of project.wires) {
    for (const ref of [wire.a, wire.b]) {
      if (ref.part !== board.id) continue;
      const pin = pins.get(ref.pin);
      if (pin?.gpio === undefined) continue;
      if (!Number.isInteger(pin.gpio) || pin.gpio < 0 || pin.gpio >= 32) {
        throw new Error(`native ESP32 does not support wired GPIO${pin.gpio}; wired GPIO numbers must be 0–31`);
      }
      gpios.add(pin.gpio);
    }
  }
  return [...gpios].sort((a, b) => a - b);
}

export class Esp32CircuitBridge {
  readonly wiredGpios: number[];
  private readonly supported = new Set(
    BOARDS.esp32.pins.flatMap((pin) => pin.gpio !== undefined && pin.gpio >= 0 && pin.gpio < 32 ? [pin.gpio] : []),
  );
  private readonly outputs = new Map<number, boolean>();
  private readonly levels = new Map<number, number>();

  constructor(project: Project, private readonly model: ElectricalModel) {
    this.wiredGpios = wiredEsp32Gpios(project);
    for (const gpio of this.wiredGpios) {
      this.outputs.set(gpio, false);
      this.levels.set(gpio, 0);
      model.setPinMode(gpio, { kind: 'in', pull: 'none' });
    }
  }

  setOutput(gpio: number, level: number) {
    if (!this.supported.has(gpio)) return;
    const value = level ? 1 : 0;
    this.levels.set(gpio, value);
    if (this.outputs.get(gpio)) this.model.setPinMode(gpio, { kind: 'out', level: value });
  }

  setDirection(gpio: number, output: boolean) {
    if (!this.supported.has(gpio)) return;
    this.outputs.set(gpio, output);
    if (output) {
      this.model.setPinMode(gpio, { kind: 'out', level: this.levels.get(gpio) ?? 0 });
    } else if (this.wiredGpios.includes(gpio)) {
      this.model.setPinMode(gpio, { kind: 'in', pull: 'none' });
    } else {
      this.model.setPinMode(gpio, { kind: 'unused' });
    }
  }

  syncInputs(): { mask: number; values: number } {
    this.model.solve();
    let mask = 0;
    let values = 0;
    for (const gpio of this.wiredGpios) {
      if (this.outputs.get(gpio)) continue;
      mask |= 1 << gpio;
      if (this.model.readDigital(gpio)) values |= 1 << gpio;
    }
    return { mask: mask >>> 0, values: values >>> 0 };
  }
}
