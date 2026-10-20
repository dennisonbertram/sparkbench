// "Make it a product": the same circuit, built the way a factory would — the dev board replaced by
// the bare module plus the circuit around it (USB, regulator, USB-serial, auto-reset), chips and
// passives as surface-mount parts JLCPCB-style assembly can place. Plug-in sensor and display
// modules stay on connectors (normal for small-batch products). The firmware doesn't change.
import type { PartInstance, Project, Wire } from './types';
import { annotate } from './netlist';

const SMD: Record<string, string> = {
  resistor: 'Resistor_SMD:R_0805_2012Metric',
  capacitor: 'Capacitor_SMD:C_0805_2012Metric',
  electrolytic: 'Capacitor_SMD:CP_Elec_5x5.4',
  led: 'LED_SMD:LED_0805_2012Metric',
  diode: 'Diode_SMD:D_SOD-123',
  ne555: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
  mcp3008: 'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm',
};

export interface Productionized {
  project: Project;
  /** What changed, in plain words. */
  notes: string[];
}

export function productionize(src: Project): Productionized {
  const notes: string[] = [];
  let parts: PartInstance[] = src.parts.map((p) => ({ ...p, props: { ...p.props } }));
  let wires: Wire[] = src.wires.map((w) => ({ ...w, a: { ...w.a }, b: { ...w.b } }));
  let n = 0;
  const add = (type: string, props: Record<string, any> = {}, label?: string) => {
    const id = `prod${++n}`;
    parts.push({ id, type, props, x: 0, y: 0, ...(label ? { label } : {}) });
    return id;
  };
  const wire = (a: [string, string], b: [string, string]) => wires.push({ id: `pw${wires.length + 1}`, a: { part: a[0], pin: a[1] }, b: { part: b[0], pin: b[1] } });

  // Passives and chips → surface-mount.
  const smd = new Set<string>();
  for (const p of parts) {
    if (SMD[p.type]) {
      p.props.footprint = SMD[p.type];
      smd.add(p.type);
    }
    if (p.type === 'npn') p.type = 'npn-smd';
  }
  if (smd.size || parts.some((p) => p.type === 'npn-smd')) notes.push('Resistors, capacitors, LEDs and chips become small surface-mount parts (0805 / SOIC) that the factory places and solders.');

  // Dev board → bare module.
  const devkit = parts.find((p) => p.type === 'esp32-devkit');
  if (devkit) {
    devkit.type = 'esp32-wroom';
    const U = devkit.id;
    // VIN (5 V from the DevKit's USB) now comes from our own USB socket.
    const usb = add('usb-micro');
    for (const w of wires) for (const end of [w.a, w.b]) if (end.part === U && end.pin === 'VIN') Object.assign(end, { part: usb, pin: 'VBUS' });
    wire([usb, 'GND'], [U, 'GND.1']);
    wire([usb, 'SHIELD'], [U, 'GND.1']);
    // 5 V → 3.3 V regulator with input/output capacitors and module decoupling.
    const ldo = add('ldo-3v3');
    wire([ldo, 'VIN'], [usb, 'VBUS']);
    wire([ldo, 'GND'], [U, 'GND.1']);
    wire([ldo, 'VOUT'], [U, '3V3']);
    const cap = (f: number, a: [string, string], label: string) => {
      const c = add('capacitor', { farads: f, footprint: SMD.capacitor }, label);
      wire([c, '1'], a);
      wire([c, '2'], [U, 'GND.1']);
      return c;
    };
    cap(10e-6, [usb, 'VBUS'], 'Regulator input');
    cap(10e-6, [U, '3V3'], 'Regulator output');
    cap(100e-9, [U, '3V3'], 'Module decoupling');
    // USB-serial for programming and print().
    const ch = add('ch340c');
    wire([ch, 'VCC'], [usb, 'VBUS']);
    wire([ch, 'GND'], [U, 'GND.1']);
    cap(100e-9, [ch, 'V3'], 'CH340C V3');
    cap(100e-9, [ch, 'VCC'], 'CH340C decoupling');
    wire([ch, 'UDP'], [usb, 'DP']);
    wire([ch, 'UDM'], [usb, 'DM']);
    wire([ch, 'TXD'], [U, 'RX0']);
    wire([ch, 'RXD'], [U, 'TX0']);
    // Auto-reset/boot (the classic two-transistor circuit): the flasher toggles DTR/RTS.
    const res = (ohms: number, a: [string, string], b: [string, string], label: string) => {
      const r = add('resistor', { ohms, footprint: SMD.resistor }, label);
      wire([r, '1'], a);
      wire([r, '2'], b);
      return r;
    };
    const q1 = add('npn-smd', {}, 'Auto-reset EN');
    const q2 = add('npn-smd', {}, 'Auto-reset IO0');
    res(10000, [ch, 'DTR'], [q1, 'B'], 'Q1 base');
    wire([q1, 'E'], [ch, 'RTS']);
    wire([q1, 'C'], [U, 'EN']);
    res(10000, [ch, 'RTS'], [q2, 'B'], 'Q2 base');
    wire([q2, 'E'], [ch, 'DTR']);
    wire([q2, 'C'], [U, 'IO0']);
    // EN: pull-up + RC delay + RESET button; IO0: pull-up + BOOT button.
    res(10000, [U, 'EN'], [U, '3V3'], 'EN pull-up');
    cap(1e-6, [U, 'EN'], 'EN delay');
    res(10000, [U, 'IO0'], [U, '3V3'], 'IO0 pull-up');
    const rst = add('pushbutton', { color: 'black' }, 'RESET');
    wire([rst, '1'], [U, 'EN']);
    wire([rst, '2'], [U, 'GND.1']);
    const boot = add('pushbutton', { color: 'black' }, 'BOOT');
    wire([boot, '1'], [U, 'IO0']);
    wire([boot, '2'], [U, 'GND.1']);
    notes.push('The ESP32 DevKit is replaced by the bare ESP32-WROOM-32E module (with its certified antenna), soldered to the board.');
    notes.push('Added the circuit a DevKit has around the module: a Micro-USB socket, an AMS1117 3.3 V regulator with capacitors, a CH340C USB-serial chip, the two-transistor auto-reset so it programs with one click, and RESET/BOOT buttons.');
  }
  const pico = parts.find((p) => p.type === 'pi-pico');
  if (pico) {
    pico.props.footprint = 'Module:RaspberryPi_Pico_SMD';
    notes.push('The Raspberry Pi Pico is soldered flat onto the board by its castellated edge pads (no socket), the way Raspberry Pi intends it for products.');
  }
  if (src.board === 'rpi4') notes.push('The Raspberry Pi stays a separate computer; this board plugs onto its header with a ribbon cable.');
  if (parts.some((p) => ['ssd1306', 'mpu6050', 'hcsr04', 'pir', 'level-shifter', 'lcd1602', 'epaper29'].includes(p.type)))
    notes.push('Display and sensor modules stay as plug-in modules on connectors: they come pre-assembled and tested, which is how small-batch products use them.');
  const project = annotate({ ...src, id: `${src.id}-product`, name: `${src.name} (product)`, parts, wires });
  return { project, notes };
}
