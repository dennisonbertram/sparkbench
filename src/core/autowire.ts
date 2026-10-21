// Wire a datasheet-defined part into an existing design: power at a voltage it accepts,
// ground, bus pins to the board's I2C/SPI pins, and signal pins to free, capable GPIOs.
import type { Project, Wire, PinRef } from './types';
import { partDef } from './parts';
import { boardFor, type BoardPin } from './boards';
import { customSpec, registerCustomPart, type CustomPartSpec } from './customParts';
import { annotate, boardPart } from './netlist';
import { partSize } from './layout';

const COLORS = ['#2e7d32', '#8e24aa', '#00838f', '#c2185b', '#6d4c41', '#5c6bc0'];

export function autoWirePart(project: Project, partId: string): { project: Project; notes: string[] } {
  const part = project.parts.find((p) => p.id === partId);
  const board = boardFor(project.board);
  const bpart = boardPart(project);
  if (!part || !board || !bpart) return { project, notes: ['There is no microcontroller board to wire it to.'] };
  const def = partDef(part.type);
  const spec = customSpec(part.type);
  const notes: string[] = [];
  const wires: Wire[] = [];
  const used = new Set(project.wires.flatMap((w) => [w.a, w.b]).filter((r) => r.part === bpart.id).map((r) => r.pin));
  const already = new Set(project.wires.flatMap((w) => [w.a, w.b]).filter((r) => r.part === partId).map((r) => r.pin));
  let n = project.wires.length;
  const wire = (pin: string, boardPin: string, color: string) => {
    while (project.wires.some((w) => w.id === `w${n}`) || wires.some((w) => w.id === `w${n}`)) n++;
    const a: PinRef = { part: partId, pin };
    wires.push({ id: `w${n}`, a, b: { part: bpart.id, pin: boardPin }, color });
  };
  const free = (need: 'in' | 'out' | 'adc'): BoardPin | undefined =>
    board.pins
      .filter((p) => p.role === 'gpio' && !used.has(p.name) && p.caps?.includes(need) && (need === 'in' || need === 'adc' || p.caps?.includes('out')))
      .filter((p) => ![board.i2c.sda, board.i2c.scl].includes(p.name))
      .sort((a, b) => (a.rank ?? 5) - (b.rank ?? 5) + (need !== 'adc' && a.caps?.includes('adc') ? 1 : 0) - (need !== 'adc' && b.caps?.includes('adc') ? 1 : 0))[0];
  const take = (need: 'in' | 'out' | 'adc') => {
    const p = free(need);
    if (p) used.add(p.name);
    return p;
  };
  // Supply: 3.3 V if the part accepts it, else 5 V.
  const vmin = def.vmin ?? 3.3;
  const vmax = def.vmax ?? 5.5;
  const supply = vmin <= 3.3 && vmax >= 3.3 ? board.supply3v3 : board.supply5v;
  const logicPins = def.pins.filter((p) => p.role === 'power' && !p.supply);
  if (logicPins.length && supply === board.supply5v && vmin > 3.6) notes.push(`${def.name} needs at least ${vmin} V, so it is powered from 5 V.`);
  let sig = 0;
  // Serial modules: the part's TX goes to a board RX and vice versa. On the Pico only some pin pairs
  // belong to a UART (GP0/1 = UART0, GP4/5 and GP8/9 = UART1, GP12/13 and GP16/17 = UART0).
  const ptx = def.pins.find((p) => p.fn === 'uart.tx' && !already.has(p.name));
  const prx = def.pins.find((p) => p.fn === 'uart.rx' && !already.has(p.name));
  if (ptx) {
    const pairs: [number, number][] = project.board === 'pico' ? [[0, 1], [8, 9], [4, 5], [12, 13], [16, 17]] : [[17, 16], [27, 26], [33, 32], [25, 14]];
    const byGpio = (g: number) => board.pins.find((p) => p.gpio === g && p.role === 'gpio');
    const pair = pairs.map(([t, r]) => [byGpio(t), byGpio(r)] as const).find(([t, r]) => t && r && !used.has(t.name) && !used.has(r.name) && ![board.i2c.sda, board.i2c.scl].includes(t.name) && ![board.i2c.sda, board.i2c.scl].includes(r.name));
    if (pair) {
      const [btx, brx] = pair as [BoardPin, BoardPin];
      used.add(brx.name);
      wire(ptx.name, brx.name, '#00838f');
      already.add(ptx.name);
      if (prx) {
        used.add(btx.name);
        wire(prx.name, btx.name, '#8e24aa');
        already.add(prx.name);
      }
      notes.push(`${part.ref ?? part.id}.${ptx.name} → ${brx.name} (the board's RX)${prx ? `, ${prx.name} → ${btx.name} (the board's TX)` : ''}.`);
    } else notes.push(`No free UART pin pair was left for ${def.name}; wire TX/RX by hand.`);
  }
  for (const pin of def.pins) {
    if (already.has(pin.name) || pin.role === 'nc') continue;
    const fn = pin.fn ?? '';
    if (pin.role === 'gnd') wire(pin.name, board.gnd, '#1f2328');
    else if (pin.role === 'power' && pin.supply) continue; // a separate supply, below
    else if (pin.role === 'power') wire(pin.name, supply, supply === board.supply3v3 ? '#d32f2f' : '#ef6c00');
    else if (fn === 'i2c.sda') wire(pin.name, board.i2c.sda, '#1e88e5');
    else if (fn === 'i2c.scl') wire(pin.name, board.i2c.scl, '#f9a825');
    else if (fn.startsWith('spi.') && board.spi) {
      const target = { 'spi.sck': board.spi.sck, 'spi.mosi': board.spi.mosi, 'spi.miso': board.spi.miso, 'spi.cs': board.spi.cs }[fn];
      const bp = target && !used.has(target) ? target : take('out')?.name;
      if (bp) {
        used.add(bp);
        wire(pin.name, bp, COLORS[sig++ % COLORS.length]);
      }
    } else if (pin.role === 'io' || pin.role === 'passive') {
      if (pin.required === false) continue;
      const analog = fn === 'adc' || (spec?.sim.kind === 'analog-sensor' && spec.sim.outputPin === pin.name);
      // 1-Wire is bidirectional and actuator inputs are driven by the board: both need output-capable pins.
      // Keypad columns need internal pull-ups, which the ESP32's input-only pins don't have.
      const out = /out|pwm|cs|trig|reset|enable|onewire|din|^tft\./i.test(fn) || spec?.sim.kind === 'dht-sensor' || spec?.sim.kind === 'keypad-matrix' || spec?.sim.inputPin === pin.name || !!spec?.sim.inputPins?.includes(pin.name) || (spec?.sim.kind === 'onewire-temp' && spec.sim.outputPin === pin.name);
      const bp = take(analog ? 'adc' : out ? 'out' : 'in');
      if (!bp) {
        notes.push(analog && project.board === 'rpi4' ? `${pin.name} is an analog output, but the Raspberry Pi has no analog inputs — add an MCP3008 and wire ${pin.name} to one of its channels.` : `No free pin was left for ${pin.name}; wire it by hand.`);
        continue;
      }
      wire(pin.name, bp.name, COLORS[sig++ % COLORS.length]);
      notes.push(`${part.ref ?? part.id}.${pin.name} → ${bp.name}${bp.gpio !== undefined ? ` (GPIO${bp.gpio})` : ''}${analog ? ' — an analog-capable pin' : ''}.`);
    }
  }
  // External pull-ups the datasheet asks for: a real resistor from the pin to the part's supply.
  let extraParts: Project['parts'] = [];
  for (const pin of def.pins.filter((p) => p.pullUp)) {
    const sigWire = wires.find((w) => w.a.part === partId && w.a.pin === pin.name);
    if (!sigWire) continue;
    let k = 1;
    while ([...project.parts, ...extraParts].some((x) => x.id === `${partId}_pu${k}`)) k++;
    const rid = `${partId}_pu${k}`;
    extraParts.push({ id: rid, type: 'resistor', label: `${pin.name} pull-up`, props: { ohms: pin.pullUp }, x: part.x + 30 * k, y: part.y - 40 });
    while (project.wires.some((w) => w.id === `w${n}`) || wires.some((w) => w.id === `w${n}`)) n++;
    wires.push({ id: `w${n}`, a: { part: rid, pin: '1' }, b: { ...sigWire.b }, color: COLORS[sig++ % COLORS.length] });
    n++;
    wires.push({ id: `w${n}`, a: { part: rid, pin: '2' }, b: { part: bpart.id, pin: supply }, color: supply === board.supply3v3 ? '#d32f2f' : '#ef6c00' });
    const ohms = pin.pullUp!;
    notes.push(`Added a ${ohms >= 1000 ? `${ohms / 1000} kΩ` : `${ohms} Ω`} pull-up resistor from ${pin.name} to ${supply}, as the datasheet requires.`);
  }
  // Pins fed from a separate supply: an external DC supply that fits (one already in the design, or a new one),
  // its − joined to the board's GND. Never the board's 3V3/5V.
  for (const pin of def.pins.filter((p) => p.role === 'power' && p.supply && !already.has(p.name))) {
    const { vmin: lo, vmax: hi, currentMa } = pin.supply!;
    const fits = (v: number) => v >= lo && v <= hi;
    let src = [...project.parts, ...extraParts].find((x) => x.type === 'dc-supply' && fits(Number(x.props.volts ?? 12)));
    if (!src) {
      const volts = [12, 24, 9, 6, 5].find(fits) ?? Math.ceil(lo);
      const amps = [1, 2, 3, 5, 10].find((a) => a * 1000 >= (currentMa ?? 1000) * 1.25) ?? 10;
      let k = 1;
      while ([...project.parts, ...extraParts].some((x) => x.id === `extsupply${k}`)) k++;
      src = { id: `extsupply${k}`, type: 'dc-supply', label: `${volts} V supply`, props: { volts, amps: Math.max(2, amps) }, x: part.x, y: part.y + 150 };
      extraParts.push(src);
      while (project.wires.some((w) => w.id === `w${n}`) || wires.some((w) => w.id === `w${n}`)) n++;
      wires.push({ id: `w${n}`, a: { part: src.id, pin: '-' }, b: { part: bpart.id, pin: board.gnd }, color: '#1f2328' });
      notes.push(`Added a separate ${volts} V supply for ${pin.name} (it needs ${lo}–${hi} V${currentMa ? ` and up to ${currentMa >= 1000 ? `${+(currentMa / 1000).toFixed(1)} A` : `${currentMa} mA`}` : ''}, more than the board can give); its − joins the board's GND.`);
    } else notes.push(`${pin.name} goes to the ${src.props.volts ?? 12} V supply already in the design.`);
    while (project.wires.some((w) => w.id === `w${n}`) || wires.some((w) => w.id === `w${n}`)) n++;
    wires.push({ id: `w${n}`, a: { part: partId, pin: pin.name }, b: { part: src.id, pin: '+' }, color: '#b71c1c' });
  }
  if (spec?.interface === 'i2c' && spec.i2cAddress !== undefined) notes.push(`It shares the I2C bus (SDA ${board.i2c.sda}, SCL ${board.i2c.scl}) at address 0x${spec.i2cAddress.toString(16)}.`);
  const files = { ...project.files };
  if (spec?.driver && board.language === 'micropython' && !files[spec.driver.filename]) {
    files[spec.driver.filename] = spec.driver.code;
    notes.push(`Added the ${spec.driver.filename} driver written from the datasheet.`);
  }
  const parts = [...project.parts, ...extraParts];
  return { project: extraParts.length ? annotate({ ...project, parts, wires: [...project.wires, ...wires], files }) : { ...project, wires: [...project.wires, ...wires], files }, notes };
}

/** Add a datasheet/library part to a design (registered, placed to the right, wired to the board when there is one). */
export function withCustomPart(project: Project, spec: CustomPartSpec, opts: { wire?: boolean; label?: string } = {}): { project: Project; notes: string[]; id: string } {
  registerCustomPart(spec);
  const base = spec.type.replace(/[^a-z0-9]/g, '');
  let n = 1;
  while (project.parts.some((x) => x.id === `${base}${n}`)) n++;
  const id = `${base}${n}`;
  const right = Math.max(...project.parts.map((x) => x.x + partSize(x.type)[0]), 0) + 60;
  const top = Math.min(...project.parts.map((x) => x.y), 40);
  let next = annotate({ ...project, customParts: [...(project.customParts ?? []).filter((c) => c.type !== spec.type), spec], parts: [...project.parts, { id, type: spec.type, label: opts.label ?? spec.name, props: {}, x: right, y: top }] });
  let notes: string[] = [];
  if (opts.wire !== false && project.board !== 'none') ({ project: next, notes } = autoWirePart(next, id));
  return { project: next, notes, id };
}

/** Remove a datasheet/library part (and its wires) from a design. */
export function withoutCustomPart(project: Project, type: string): Project {
  const ids = new Set(project.parts.filter((p) => p.type === type).map((p) => p.id));
  const spec = project.customParts?.find((c) => c.type === type);
  const files = { ...project.files };
  if (spec?.driver) delete files[spec.driver.filename];
  let wires = project.wires.filter((w) => !ids.has(w.a.part) && !ids.has(w.b.part));
  // An external supply that fed only the removed part goes too.
  for (const s of project.parts.filter((p) => p.type === 'dc-supply')) {
    const fedOnly = project.wires.some((w) => [w.a, w.b].some((r) => r.part === s.id && r.pin === '+')) && !wires.some((w) => [w.a, w.b].some((r) => r.part === s.id && r.pin === '+'));
    if (fedOnly) ids.add(s.id);
  }
  wires = wires.filter((w) => !ids.has(w.a.part) && !ids.has(w.b.part));
  return { ...project, parts: project.parts.filter((p) => !ids.has(p.id)), wires, customParts: project.customParts?.filter((c) => c.type !== type), files };
}
