// Static electrical rule checks (ERC) written for beginners: every result explains the
// problem in plain English and, where it can, offers a one-click fix.
import type { CheckResult, FixAction, Net, PartDef, PartInstance, PinRef, Project, Severity, Wire } from './types';
import { partDef } from './parts';
import { boardFor, boardPin, type BoardDef, type BoardPin, type Cap } from './boards';
import { buildNets, boardPart, pinKey } from './netlist';
import { ElectricalModel } from './circuit';

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/** Supply budgets in mA available to external parts. */
const BUDGET_3V3: Record<string, number> = { esp32: 500, pico: 300, rpi4: 50 };
const BUDGET_5V: Record<string, number> = { esp32: 500, pico: 500, rpi4: 1000 };
/** Worst-case draw (stalled servo, NeoPixels at full white) where it differs a lot from typical. */
const WORST_MA: Record<string, (p: PartInstance) => number> = {
  servo: () => 650,
  'neopixel-ring': (p) => 60 * Number(p.props?.pixels ?? 12),
};
/** Module pins that must be driven by the board (so they can't go to an input-only pin). */
const NEEDS_OUTPUT: Record<string, string[]> = {
  led: ['A'],
  'rgb-led': ['R', 'G', 'B'],
  buzzer: ['+'],
  servo: ['PWM'],
  relay: ['IN'],
  hcsr04: ['TRIG'],
  'neopixel-ring': ['DIN'],
  dht22: ['DATA'],
};
const LED_VF: Record<string, number> = { red: 2.0, orange: 2.0, yellow: 2.1, green: 2.2, blue: 3.0, white: 3.0 };
const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82];

/** Smallest standard (E12) resistor ≥ ohms. */
function e12Ceil(ohms: number): number {
  for (let dec = 10; dec <= 1e6; dec *= 10) for (const v of E12) if ((v * dec) / 10 >= ohms) return (v * dec) / 10;
  return 1e6;
}

/** A sensible series resistor for an LED of this colour on this supply. */
export function ledResistorFor(volts: number, color = 'red'): number {
  const vf = LED_VF[color] ?? 2.0;
  if (volts <= 3.6) return vf >= 2.8 ? 100 : 220;
  const target = volts > 6 ? 0.015 : 0.01;
  return Math.max(100, e12Ceil((volts - vf) / target));
}

class Ctx {
  nets: Net[];
  netOf: Map<string, Net>;
  board?: BoardDef;
  boardId?: string;
  parts = new Map<string, PartInstance>();
  gnd = new Set<Net>();
  /** Supply nets → all the supply voltages found on them. */
  supply = new Map<Net, number[]>();
  model?: ElectricalModel;
  results: CheckResult[] = [];
  private seen = new Set<string>();

  constructor(public project: Project) {
    const { nets, netOf } = buildNets(project);
    this.nets = nets;
    this.netOf = netOf;
    this.board = boardFor(project.board);
    this.boardId = boardPart(project)?.id;
    for (const p of project.parts) this.parts.set(p.id, p);
    for (const net of nets) {
      for (const r of net.pins) {
        const bp = this.boardPinOf(r);
        if (bp?.role === 'gnd') this.gnd.add(net);
        if (bp?.role === 'power' && bp.voltage) this.addSupply(net, bp.voltage);
        const part = this.parts.get(r.part);
        if (part?.type === 'battery-9v') {
          if (r.pin === '-') this.gnd.add(net);
          else this.addSupply(net, Number(part.props?.volts ?? 9));
        }
        // Product version: the USB socket and the 3.3 V regulator are the supplies.
        if (part?.type === 'usb-micro' && r.pin === 'VBUS') this.addSupply(net, 5);
        if (part?.type === 'ldo-3v3' && r.pin === 'VOUT') this.addSupply(net, 3.3);
      }
    }
    try {
      this.model = new ElectricalModel(project);
    } catch {
      this.model = undefined;
    }
  }

  private addSupply(net: Net, v: number) {
    const list = this.supply.get(net) ?? [];
    if (!list.includes(v)) list.push(v);
    this.supply.set(net, list);
  }

  add(r: CheckResult) {
    if (this.seen.has(r.id)) return;
    this.seen.add(r.id);
    this.results.push(r);
  }

  def(part: PartInstance): PartDef | undefined {
    try {
      return partDef(part.type);
    } catch {
      return undefined;
    }
  }
  net(ref: PinRef): Net | undefined {
    return this.netOf.get(pinKey(ref));
  }
  boardPinOf(ref: PinRef): BoardPin | undefined {
    if (!this.board || ref.part !== this.boardId) return undefined;
    return boardPin(this.board, ref.pin);
  }
  isBoard(partId: string) {
    return partId === this.boardId;
  }
  /** Board GPIO pins on a net. */
  gpios(net: Net | undefined): BoardPin[] {
    if (!net) return [];
    return net.pins.map((r) => this.boardPinOf(r)).filter((b): b is BoardPin => !!b && b.gpio !== undefined);
  }
  supplyV(net: Net | undefined): number | undefined {
    if (!net) return undefined;
    const vs = this.supply.get(net);
    return vs ? Math.max(...vs) : undefined;
  }
  /** Is this pin wired to any other part? */
  connected(ref: PinRef): boolean {
    const net = this.net(ref);
    return !!net && net.pins.some((r) => r.part !== ref.part);
  }
  wiresAt(ref: PinRef): Wire[] {
    return this.project.wires.filter((w) => (w.a.part === ref.part && w.a.pin === ref.pin) || (w.b.part === ref.part && w.b.pin === ref.pin));
  }
  /** Wire touching `ref`, and which end of it is NOT `ref`. */
  wireFrom(ref: PinRef, otherPart?: string): { wire: Wire; other: 'a' | 'b' } | undefined {
    for (const w of this.wiresAt(ref)) {
      const other = w.a.part === ref.part && w.a.pin === ref.pin ? 'b' : 'a';
      if (!otherPart || w[other].part === otherPart) return { wire: w, other };
    }
    return undefined;
  }

  // ---------------------------------------------------------------- naming
  partName(part: PartInstance): string {
    const def = this.def(part);
    const label = part.label || def?.name || part.type;
    return part.ref ? `${label} (${part.ref})` : label;
  }
  boardPinName(name: string): string {
    const b = this.board;
    if (!b) return name;
    const bp = boardPin(b, name);
    if (!bp) return name;
    if (b.id === 'rpi4') return bp.physical ? `${name} (header pin ${bp.physical})` : name;
    if (b.id === 'pico') return bp.physical ? `${name} (pin ${bp.physical})` : name;
    return bp.gpio !== undefined && name !== `D${bp.gpio}` ? `${name} (GPIO${bp.gpio})` : name;
  }
  pinName(ref: PinRef): string {
    if (this.isBoard(ref.part)) return `the ${this.board?.short ?? 'board'}'s ${this.boardPinName(ref.pin)} pin`;
    const part = this.parts.get(ref.part);
    return part ? `the ${ref.pin} pin of ${this.partName(part)}` : `${ref.part}.${ref.pin}`;
  }
  netDescription(net: Net): string {
    if (this.gnd.has(net)) return 'GND';
    const v = this.supplyV(net);
    if (v !== undefined) return `${v} V`;
    const g = this.gpios(net)[0];
    if (g) return this.boardPinName(g.name);
    return 'nothing useful';
  }

  /** The board pin feeding a supply voltage (3V3 / 5V) — for "add-wire" fixes. */
  supplyPinFor(volts: number): PinRef | undefined {
    if (this.board && this.boardId) return { part: this.boardId, pin: volts > 4 ? this.board.supply5v : this.board.supply3v3 };
    const bat = this.project.parts.find((p) => p.type === 'battery-9v');
    return bat ? { part: bat.id, pin: '+' } : undefined;
  }
  gndPin(): PinRef | undefined {
    if (this.board && this.boardId) return { part: this.boardId, pin: this.board.gnd };
    const bat = this.project.parts.find((p) => p.type === 'battery-9v');
    return bat ? { part: bat.id, pin: '-' } : undefined;
  }
  /** Best unused board GPIO with the given capabilities. */
  freePin(caps: Cap[]): BoardPin | undefined {
    if (!this.board || !this.boardId) return undefined;
    const used = new Set(this.project.wires.flatMap((w) => [w.a, w.b]).filter((r) => r.part === this.boardId).map((r) => r.pin));
    return this.board.pins
      .filter((p) => p.role === 'gpio' && !used.has(p.name) && caps.every((c) => p.caps?.includes(c)) && (p.rank ?? 5) < 5)
      .sort((a, b) => (a.rank ?? 5) - (b.rank ?? 5) || (a.gpio ?? 0) - (b.gpio ?? 0))[0];
  }
  /** Fix that moves the board end of the wire at `boardRef` to `to`. */
  moveBoardEnd(boardRef: PinRef, to: BoardPin | undefined, label?: string): CheckResult['fix'] {
    if (!to || !this.boardId) return undefined;
    const w = this.wiresAt(boardRef)[0];
    if (!w) return undefined;
    const end = w.a.part === boardRef.part && w.a.pin === boardRef.pin ? 'a' : 'b';
    return { label: label ?? `Move the wire to ${this.boardPinName(to.name)}`, action: { kind: 'move-wire-end', wireId: w.id, end, to: { part: this.boardId, pin: to.name } } };
  }
}

const fix = (label: string, action: FixAction): CheckResult['fix'] => ({ label, action });

// ==================================================================== individual checks

function checkWires(c: Ctx) {
  for (const w of c.project.wires) {
    const bad = [w.a, w.b].find((r) => {
      const part = c.parts.get(r.part);
      const def = part && c.def(part);
      return !def || !def.pins.some((p) => p.name === r.pin);
    });
    if (bad) {
      c.add({
        id: `dangling-wire:${w.id}`,
        severity: 'warning',
        title: 'A wire goes nowhere',
        detail: `One end of this wire is attached to "${bad.part}.${bad.pin}", which no longer exists (the part was probably deleted). It does nothing, so it's safe to remove.`,
        fix: fix('Remove the wire', { kind: 'remove-wire', wireId: w.id }),
      });
    } else if (w.a.part === w.b.part && w.a.pin === w.b.pin) {
      c.add({
        id: `self-wire:${w.id}`,
        severity: 'info',
        title: 'A wire connects a pin to itself',
        detail: `This wire starts and ends on ${c.pinName(w.a)}, so it does nothing.`,
        fix: fix('Remove the wire', { kind: 'remove-wire', wireId: w.id }),
      });
    }
  }
}

function checkBoardPresence(c: Ctx) {
  if (c.project.board !== 'none' && !c.boardId) {
    c.add({ id: 'no-board', severity: 'error', title: 'There is no microcontroller board', detail: `This project is set up for the ${c.board?.name ?? 'board'}, but the board isn't in the design, so nothing can run the program or power the parts.` });
  }
  if (c.project.board === 'none' && !c.project.parts.some((p) => p.type === 'battery-9v')) {
    c.add({ id: 'no-power-source', severity: 'warning', title: 'Nothing powers this circuit', detail: 'There is no battery or board in the design. Add a 9 V battery (or another supply) so current can flow.' });
  }
}

function checkFloating(c: Ctx): Set<string> {
  const floating = new Set<string>();
  const touched = new Set(c.project.wires.flatMap((w) => [w.a.part, w.b.part]));
  for (const part of c.project.parts) {
    const def = c.def(part);
    if (!def || def.category === 'board') continue;
    if (!touched.has(part.id)) {
      floating.add(part.id);
      c.add({
        id: `floating:${part.id}`,
        severity: 'warning',
        title: `${c.partName(part)} isn't connected to anything`,
        detail: `This part is on the bench but has no wires, so it can't do anything yet. Wire it up, or delete it if you don't need it.`,
        parts: [part.id],
      });
    }
  }
  return floating;
}

function checkPowerShorts(c: Ctx): Set<Net> {
  const shorted = new Set<Net>();
  for (const net of c.nets) {
    const vs = c.supply.get(net) ?? [];
    const g = c.gnd.has(net);
    if (vs.length && g) {
      shorted.add(net);
      const isSup = (r: PinRef) => c.boardPinOf(r)?.role === 'power' || (c.parts.get(r.part)?.type === 'battery-9v' && r.pin === '+');
      const isGnd = (r: PinRef) => c.boardPinOf(r)?.role === 'gnd' || (c.parts.get(r.part)?.type === 'battery-9v' && r.pin === '-');
      const direct = c.project.wires.find((w) => (isSup(w.a) && isGnd(w.b)) || (isSup(w.b) && isGnd(w.a)));
      c.add({
        id: `short:${net.id}`,
        severity: 'error',
        title: `Short circuit: ${vs.map((v) => `${v} V`).join(' and ')} is wired straight to GND`,
        detail: `The power supply and ground are joined by a plain wire with nothing in between. A huge current would flow: the board's regulator or USB port shuts down or gets hot, and batteries drain in minutes. Find the wire that joins them and remove it.`,
        parts: [...new Set(net.pins.map((r) => r.part))],
        fix: direct ? fix('Remove the shorting wire', { kind: 'remove-wire', wireId: direct.id }) : undefined,
      });
    } else if (vs.length > 1) {
      shorted.add(net);
      c.add({
        id: `supply-clash:${net.id}`,
        severity: 'error',
        title: `Two different supplies are connected together (${vs.map((v) => `${v} V`).join(' and ')})`,
        detail: 'The 3.3 V and 5 V pins are joined by a wire. They fight each other and can damage the regulator. Each part should connect to just one of them.',
        parts: [...new Set(net.pins.map((r) => r.part))],
      });
    }
  }
  return shorted;
}

function checkModulePower(c: Ctx, floating: Set<string>) {
  for (const part of c.project.parts) {
    const def = c.def(part);
    if (!def || def.category === 'board' || part.type === 'battery-9v' || floating.has(part.id)) continue;
    const name = c.partName(part);
    for (const pin of def.pins) {
      const ref = { part: part.id, pin: pin.name };
      const net = c.net(ref);
      if (pin.role === 'gnd') {
        if (net && c.gnd.has(net)) continue;
        const to = c.gndPin();
        c.add({
          id: `no-ground:${part.id}:${pin.name}`,
          severity: 'error',
          title: `${name} has no ground connection`,
          detail: `Its ${pin.name} pin must connect to GND. Electricity needs a complete loop: in through ${def.pins.find((p) => p.role === 'power')?.name ?? 'VCC'}, out through GND. Without it the part stays dead (or behaves randomly).`,
          parts: [part.id],
          fix: to ? fix(`Wire ${pin.name} to GND`, { kind: 'add-wire', a: ref, b: to }) : undefined,
        });
      } else if (pin.role === 'power') {
        const v = c.supplyV(net);
        const want = def.vmin !== undefined && def.vmin > 3.6 ? 5 : 3.3;
        const to = c.supplyPinFor(c.project.board === 'none' ? 9 : want);
        const supplyName = c.project.board === 'none' ? 'the battery +' : want > 4 ? `${c.board?.supply5v} (5 V)` : `${c.board?.supply3v3} (3.3 V)`;
        if (v === undefined) {
          const fromGpio = c.gpios(net)[0];
          if (fromGpio) {
            c.add({
              id: `powered-from-gpio:${part.id}:${pin.name}`,
              severity: 'warning',
              title: `${name} is powered from a signal pin`,
              detail: `Its ${pin.name} pin is wired to ${c.boardPinName(fromGpio.name)}, a GPIO. GPIO pins can only supply a few milliamps, and the program would have to switch it on. Connect ${pin.name} to ${supplyName} instead.`,
              parts: [part.id],
              fix: c.moveBoardEnd({ part: c.boardId!, pin: fromGpio.name }, c.board && boardPin(c.board, want > 4 ? c.board.supply5v : c.board.supply3v3), `Move the wire to ${supplyName}`),
            });
          } else {
            c.add({
              id: `no-power:${part.id}:${pin.name}`,
              severity: 'error',
              title: `${name} has no power`,
              detail: `Its ${pin.name} pin isn't connected to a supply, so the part can't switch on. Connect it to ${supplyName}.`,
              parts: [part.id],
              fix: to && !c.connected(ref) ? fix(`Wire ${pin.name} to ${supplyName}`, { kind: 'add-wire', a: ref, b: to }) : undefined,
            });
          }
          continue;
        }
        if (pin.name === 'VREF') continue; // ADC reference: any voltage up to VDD is fine
        const lo = def.vmin;
        const hi = def.vmax;
        const bad = (lo !== undefined && v < lo - 0.05) || (hi !== undefined && v > hi + 0.05);
        if (!bad) continue;
        const under = lo !== undefined && v < lo;
        const w = c.wireFrom(ref);
        let fx: CheckResult['fix'];
        if (w && c.board && c.boardId && w.wire[w.other].part === c.boardId) {
          const pinName = under ? c.board.supply5v : c.board.supply3v3;
          if (!under || (hi ?? 99) >= 5) fx = fix(`Move the wire to ${pinName} (${under ? '5' : '3.3'} V)`, { kind: 'move-wire-end', wireId: w.wire.id, end: w.other, to: { part: c.boardId, pin: pinName } });
        }
        c.add({
          id: `supply-range:${part.id}:${pin.name}`,
          severity: 'error',
          title: under ? `${name} needs at least ${lo} V but gets ${v} V` : `${name} gets ${v} V — more than its ${hi} V maximum`,
          detail: under
            ? `${def.name} is made for ${lo}–${hi} V. On ${v} V it may not start, or it gives wrong readings and resets at random. ${hi !== undefined && hi >= 5 ? `Power it from ${c.board ? `${c.board.supply5v} (5 V)` : '5 V'} instead.` : ''}`.trim()
            : `${def.name} is only rated up to ${hi} V. ${v} V can permanently damage it — move its ${pin.name} wire to a lower supply before powering up.`,
          parts: [part.id],
          fix: fx,
        });
      }
    }
  }
}

function checkRequiredPins(c: Ctx, floating: Set<string>) {
  for (const part of c.project.parts) {
    const def = c.def(part);
    if (!def || def.category === 'board' || floating.has(part.id)) continue;
    for (const pin of def.pins) {
      if (pin.required === false || pin.role === 'nc' || pin.role === 'power' || pin.role === 'gnd') continue;
      const ref = { part: part.id, pin: pin.name };
      if (c.connected(ref)) continue;
      const isModule = pin.role === 'io';
      let fx: CheckResult['fix'];
      if (c.board && c.boardId && (pin.fn === 'i2c.sda' || pin.fn === 'i2c.scl')) {
        const to = pin.fn === 'i2c.sda' ? c.board.i2c.sda : c.board.i2c.scl;
        fx = fix(`Wire ${pin.name} to ${c.boardPinName(to)}`, { kind: 'add-wire', a: ref, b: { part: c.boardId, pin: to } });
      }
      const what = pin.description ? ` (${pin.description})` : '';
      c.add({
        id: `unconnected:${part.id}:${pin.name}`,
        severity: isModule ? 'error' : 'warning',
        title: isModule ? `${c.partName(part)}: the ${pin.name} pin isn't connected` : `${c.partName(part)} has a leg that isn't connected`,
        detail: isModule
          ? `${pin.name}${what} needs a wire for ${def.name} to work${pin.fn?.startsWith('i2c') ? ' — it\'s one of the two I2C data wires the board uses to talk to it' : ''}.`
          : `Leg ${pin.name}${what} doesn't go anywhere, so no current can flow through this part and it won't do its job.`,
        parts: [part.id],
        fix: fx,
      });
    }
  }
}

interface LedChannel {
  part: PartInstance;
  anode: string;
  cathode: string;
  color: string;
  label: string;
}

function ledChannels(c: Ctx): LedChannel[] {
  const out: LedChannel[] = [];
  for (const p of c.project.parts) {
    if (p.type === 'led') out.push({ part: p, anode: 'A', cathode: 'C', color: String(p.props?.color ?? 'red'), label: c.partName(p) });
    if (p.type === 'rgb-led')
      for (const [ch, color] of [['R', 'red'], ['G', 'green'], ['B', 'blue']] as const) out.push({ part: p, anode: ch, cathode: 'COM', color, label: `${c.partName(p)} ${color} channel` });
  }
  return out;
}

function checkLeds(c: Ctx, floating: Set<string>) {
  const isDriver = (net: Net | undefined) => !!net && (c.supply.has(net) || c.gpios(net).length > 0 || net.pins.some((r) => c.parts.get(r.part)?.type === 'ne555' && r.pin === 'OUT'));
  const isSink = (net: Net | undefined) => !!net && (c.gnd.has(net) || c.gpios(net).length > 0 || net.pins.some((r) => c.parts.get(r.part)?.type === 'ne555' && r.pin === 'OUT'));
  const flagged = new Set<string>();
  for (const ch of ledChannels(c)) {
    if (floating.has(ch.part.id)) continue;
    const aRef = { part: ch.part.id, pin: ch.anode };
    const kRef = { part: ch.part.id, pin: ch.cathode };
    const an = c.net(aRef);
    const kn = c.net(kRef);
    if (!an || !kn) continue;
    const key = `${ch.part.id}:${ch.anode}`;
    if (an === kn && c.connected(aRef)) {
      flagged.add(key);
      c.add({ id: `led-shorted:${key}`, severity: 'warning', title: `${ch.label}: both legs are connected together`, detail: 'The current goes around the LED instead of through it, so it can never light. Each leg needs its own row on the breadboard.', parts: [ch.part.id] });
      continue;
    }
    // Reversed: anode toward ground, or cathode toward the supply.
    if ((c.gnd.has(an) && !c.gnd.has(kn) && c.connected(kRef)) || (c.supply.has(kn) && !c.supply.has(an) && c.connected(aRef))) {
      flagged.add(key);
      c.add({
        id: `led-reversed:${key}`,
        severity: 'error',
        title: `${ch.label} is in backwards`,
        detail: `LEDs only let current flow one way. The long leg (anode, +) must point toward the ${c.board ? 'GPIO pin / resistor' : 'positive supply'} and the short leg (cathode, −, flat edge) toward GND. Right now it's the other way round, so it will never light. Swap its two legs.`,
        parts: [ch.part.id],
      });
      continue;
    }
    // No series resistor: the anode sits on a hard driver and the cathode on a hard sink.
    if (isDriver(an) && isSink(kn) && !c.gnd.has(an)) {
      flagged.add(key);
      const v = c.supplyV(an) ?? (c.gpios(an).length ? c.board?.logicV ?? 3.3 : c.supplyV(c.nets.find((n) => c.supply.has(n))) ?? 5);
      const ohms = ledResistorFor(v, ch.color);
      const w = c.wireFrom(aRef) ?? c.wireFrom(kRef);
      const g = c.gpios(an)[0];
      c.add({
        id: `led-no-resistor:${key}`,
        severity: 'error',
        title: `${ch.label} has no current-limiting resistor`,
        detail: `An LED connected straight to ${g ? c.boardPinName(g.name) : `${v} V`} tries to pull as much current as it can — far more than its ~20 mA limit${g ? ` and more than a ${c.board?.short ?? 'board'} pin can safely give` : ''}. It can burn out the LED${g ? ' or the pin' : ''}. Put a ${ohms} Ω resistor in series (between the ${g ? 'pin' : 'supply'} and the LED's long leg).`,
        parts: [ch.part.id],
        fix: w ? fix(`Insert a ${ohms} Ω resistor`, { kind: 'insert-resistor', wireId: w.wire.id, ohms }) : undefined,
      });
    }
  }
  // LED current with the driving GPIO switched on (uses the circuit solver).
  const m = c.model;
  if (!m || !c.board) return;
  for (const ch of ledChannels(c)) {
    const key = `${ch.part.id}:${ch.anode}`;
    if (flagged.has(key) || floating.has(ch.part.id)) continue;
    const high = m.gpiosReachable(ch.part.id, ch.anode, 1e6);
    if (!high.length) continue;
    const low = m.gpiosReachable(ch.part.id, ch.cathode, 1e6).filter((g) => !high.includes(g));
    let ma = 0;
    try {
      for (const g of high) m.setPinMode(g, { kind: 'out', level: 1 });
      for (const g of low) m.setPinMode(g, { kind: 'out', level: 0 });
      ma = m.ledCurrentMa(ch.part.id, ch.part.type === 'rgb-led' ? ch.anode : 'd');
    } catch {
      ma = 0;
    } finally {
      for (const g of [...high, ...low]) m.setPinMode(g, { kind: 'unused' });
    }
    if (!Number.isFinite(ma)) continue;
    const pinMax = c.board.maxPinMa;
    if (ma > 30) {
      c.add({ id: `led-current:${key}`, severity: 'error', title: `${ch.label} would draw about ${Math.round(ma)} mA — too much`, detail: `Standard LEDs are rated for 20 mA, and a ${c.board.short} pin for about ${pinMax} mA. Use a bigger resistor (${ledResistorFor(c.board.logicV, ch.color)} Ω or more).`, parts: [ch.part.id] });
    } else if (ma > pinMax || ma > 20) {
      c.add({ id: `led-current:${key}`, severity: 'warning', title: `${ch.label} draws about ${Math.round(ma)} mA`, detail: `That's more than a ${c.board.short} pin should supply (about ${pinMax} mA). It will work, but a bigger resistor (e.g. ${ledResistorFor(c.board.logicV, ch.color)} Ω) is kinder to the board.`, parts: [ch.part.id] });
    } else if (ma < 0.3) {
      c.add({ id: `led-dim:${key}`, severity: 'warning', title: `${ch.label} will be very dim or dark`, detail: `With the pin switched on only about ${ma.toFixed(2)} mA flows through it. Check the resistor value (a few hundred ohms is typical) and that the LED isn't sharing a path with something else.`, parts: [ch.part.id] });
    }
  }
}

function checkElectrolytics(c: Ctx) {
  for (const p of c.project.parts) {
    if (p.type !== 'electrolytic') continue;
    const plus = c.net({ part: p.id, pin: '+' });
    const minus = c.net({ part: p.id, pin: '-' });
    if (plus && minus && c.gnd.has(plus) && !c.gnd.has(minus) && c.connected({ part: p.id, pin: '-' })) {
      c.add({ id: `cap-reversed:${p.id}`, severity: 'error', title: `${c.partName(p)} is in backwards`, detail: 'Electrolytic capacitors have a + and a − leg (the stripe marks −). Here + goes to GND. Reversed, they can leak, heat up, and even pop. Turn it round.', parts: [p.id] });
    }
  }
}

function checkGpioNets(c: Ctx, shorted: Set<Net>) {
  for (const net of c.nets) {
    if (shorted.has(net)) continue;
    const g = c.gpios(net);
    if (!g.length || !c.boardId) continue;
    const boardRef = (bp: BoardPin) => ({ part: c.boardId!, pin: bp.name });
    if (c.gnd.has(net) || c.supply.has(net)) {
      const to = c.gnd.has(net) ? 'GND' : `${c.supplyV(net)} V`;
      for (const bp of g) {
        const ws = c.wiresAt(boardRef(bp));
        const canOut = bp.caps?.includes('out');
        c.add({
          id: `gpio-to-rail:${bp.name}`,
          severity: canOut ? 'error' : 'warning',
          title: `${c.boardPinName(bp.name)} is wired straight to ${to}`,
          detail: canOut
            ? `If the program ever sets this pin as an output and switches it ${to === 'GND' ? 'on' : 'off'}, it short-circuits and can be destroyed. A signal pin should go to a part (button, sensor, resistor…), not directly to a power or ground pin.`
            : `This pin can only read, so nothing gets damaged, but it will always read the same value — the wire is probably in the wrong hole.`,
          fix: ws.length === 1 ? fix('Remove the wire', { kind: 'remove-wire', wireId: ws[0].id }) : undefined,
        });
      }
      continue;
    }
    if (g.length > 1) {
      const second = g[1];
      const ws = c.wiresAt(boardRef(second));
      c.add({
        id: `gpio-short:${g.map((x) => x.name).join('+')}`,
        severity: 'error',
        title: `${g.map((x) => c.boardPinName(x.name)).join(' and ')} are wired together`,
        detail: 'Two signal pins are joined directly. If one is driven high while the other is driven low, they short-circuit each other. Each part should have its own pin.',
        fix: ws.length === 1 ? fix(`Remove the wire to ${second.name}`, { kind: 'remove-wire', wireId: ws[0].id }) : undefined,
      });
    }
  }
}

function hasPullUp(c: Ctx, net: Net): boolean {
  return net.pins.some((r) => {
    const part = c.parts.get(r.part);
    if (part?.type !== 'resistor') return false;
    const other = c.net({ part: part.id, pin: r.pin === '1' ? '2' : '1' });
    return !!other && c.supply.has(other);
  });
}

function checkInputOnly(c: Ctx) {
  if (!c.board || !c.boardId) return;
  const m = c.model;
  for (const part of c.project.parts) {
    const pins = NEEDS_OUTPUT[part.type];
    if (!pins) continue;
    for (const pin of pins) {
      const gpios = m ? m.gpiosReachable(part.id, pin, 1e6) : c.gpios(c.net({ part: part.id, pin })).map((b) => b.gpio!);
      for (const g of gpios) {
        const bp = c.board.pins.find((p) => p.gpio === g);
        if (!bp || bp.caps?.includes('out')) continue;
        const what = part.type === 'dht22' ? 'talk to' : 'drive';
        c.add({
          id: `input-only:${bp.name}:${part.id}`,
          severity: 'error',
          title: `${c.boardPinName(bp.name)} can't ${what} ${c.partName(part)}`,
          detail: `On the ${c.board.name}, GPIO 34–39 are input-only: they can read a voltage but can't output one. ${def(part).name}'s ${pin} pin needs a pin that can ${part.type === 'dht22' ? 'send as well as receive' : 'switch on and off'}.`,
          parts: [part.id],
          fix: c.moveBoardEnd({ part: c.boardId, pin: bp.name }, c.freePin(['out'])),
        });
      }
    }
  }
  // Buttons / switches on input-only pins without an external pull-up resistor.
  for (const part of c.project.parts) {
    if (part.type !== 'pushbutton' && part.type !== 'slide-switch') continue;
    for (const pin of partDef(part.type).pins) {
      const net = c.net({ part: part.id, pin: pin.name });
      for (const bp of c.gpios(net)) {
        if (bp.caps?.includes('out') || hasPullUp(c, net!)) continue;
        c.add({
          id: `no-pullup:${bp.name}`,
          severity: 'error',
          title: `${c.partName(part)} on ${c.boardPinName(bp.name)} needs a pull-up resistor`,
          detail: `GPIO 34–39 have no built-in pull-up, so when the button isn't pressed the pin "floats" and reads random values. Move it to a normal pin, or add a 10 kΩ resistor from the pin to 3.3 V.`,
          parts: [part.id],
          fix: c.moveBoardEnd({ part: c.boardId, pin: bp.name }, c.freePin(['in', 'out'])),
        });
      }
    }
  }
}

const def = (p: PartInstance) => partDef(p.type);

function checkCautionPins(c: Ctx) {
  if (!c.board || !c.boardId) return;
  const used = new Map<string, Net>();
  for (const net of c.nets) for (const r of net.pins) if (r.part === c.boardId && net.pins.some((x) => x.part !== c.boardId)) used.set(r.pin, net);
  for (const [pinName] of used) {
    const bp = boardPin(c.board, pinName);
    if (!bp?.caution || /input-only/i.test(bp.caution)) continue;
    let severity: Severity = 'info';
    if (bp.role === 'other' || bp.gpio === 12 || (c.board.id === 'esp32' && (bp.gpio === 1 || bp.gpio === 3))) severity = 'warning';
    const strapping = /strapping/i.test(bp.caution);
    c.add({
      id: `caution-pin:${pinName}`,
      severity,
      title: bp.role === 'other' ? `${c.boardPinName(pinName)} is not a normal GPIO` : strapping ? `${c.boardPinName(pinName)} is a boot "strapping" pin` : `Heads-up about ${c.boardPinName(pinName)}`,
      detail:
        bp.role === 'other'
          ? `${bp.caution} Connecting parts here can stop the board from working; use a free GPIO instead.`
          : strapping
            ? `${bp.caution} The ESP32 reads strapping pins at the moment it powers up to decide how to boot. A part that pulls this pin the wrong way at that moment can stop the board starting or uploading. If you see boot problems, move this wire to another pin.`
            : bp.caution,
      fix: severity === 'warning' ? c.moveBoardEnd({ part: c.boardId, pin: pinName }, c.freePin(bp.caps?.filter((x) => x !== 'touch') ?? ['in', 'out'])) : undefined,
    });
  }
}

function checkI2C(c: Ctx) {
  // Address clashes, grouped by the bus (the SDA net).
  const buses = new Map<string, { part: PartInstance; addr: number }[]>();
  for (const part of c.project.parts) {
    const d = c.def(part);
    if (!d?.i2cAddress) continue;
    const sda = c.net({ part: part.id, pin: 'SDA' });
    if (!sda || !c.connected({ part: part.id, pin: 'SDA' })) continue;
    let addr = d.i2cAddress;
    if (part.type === 'mpu6050' && c.supply.has(c.net({ part: part.id, pin: 'AD0' })!)) addr = 0x69;
    const list = buses.get(sda.id) ?? [];
    list.push({ part, addr });
    buses.set(sda.id, list);
  }
  for (const list of buses.values()) {
    const byAddr = new Map<number, PartInstance[]>();
    for (const { part, addr } of list) byAddr.set(addr, [...(byAddr.get(addr) ?? []), part]);
    for (const [addr, ps] of byAddr) {
      if (ps.length < 2) continue;
      const hex = `0x${addr.toString(16).toUpperCase()}`;
      const mpu = ps.find((p, i) => i > 0 && p.type === 'mpu6050' && !c.connected({ part: p.id, pin: 'AD0' }));
      const to = c.supplyPinFor(3.3);
      c.add({
        id: `i2c-clash:${addr}:${ps.map((p) => p.id).join('+')}`,
        severity: 'error',
        title: `${ps.map((p) => c.partName(p)).join(' and ')} use the same I2C address (${hex})`,
        detail: `Parts on an I2C bus share the same two wires and are told apart by their address, like house numbers on a street. Two parts at ${hex} answer at the same time and garble each other. ${
          mpu ? 'An MPU-6050 moves to 0x69 when its AD0 pin is connected to 3.3 V.' : ps[0].type === 'ssd1306' ? 'Many OLED modules have a solder jumper on the back to change the address to 0x3D (then update the address in the code).' : ps[0].type === 'lcd1602' ? 'The LCD backpack has A0–A2 solder pads that change its address (then update the address in the code).' : 'Check the module for an address jumper, or use a second I2C bus.'
        }`,
        parts: ps.map((p) => p.id),
        fix: mpu && to ? fix('Wire AD0 to 3.3 V (address 0x69)', { kind: 'add-wire', a: { part: mpu.id, pin: 'AD0' }, b: to }) : undefined,
      });
    }
  }
  // Bus pins: swapped SDA/SCL, and fixed hardware pins on the Pi / Pico.
  const b = c.board;
  if (!b || !c.boardId) return;
  for (const part of c.project.parts) {
    const d = c.def(part);
    if (!d || d.category === 'board') continue;
    const sdaPin = d.pins.find((p) => p.fn === 'i2c.sda');
    const sclPin = d.pins.find((p) => p.fn === 'i2c.scl');
    if (!sdaPin || !sclPin) continue;
    const sda = c.gpios(c.net({ part: part.id, pin: sdaPin.name }))[0];
    const scl = c.gpios(c.net({ part: part.id, pin: sclPin.name }))[0];
    if (sda && scl && sda.name === b.i2c.scl && scl.name === b.i2c.sda) {
      c.add({ id: `i2c-swapped:${part.id}`, severity: 'error', title: `${c.partName(part)}: SDA and SCL are swapped`, detail: `SDA should go to ${c.boardPinName(b.i2c.sda)} and SCL to ${c.boardPinName(b.i2c.scl)}. With the two wires crossed the board can't find the part (you'd see "OSError: ENODEV" or a blank screen). Swap the two wires.`, parts: [part.id] });
      continue;
    }
    for (const [sig, bp, want] of [['SDA', sda, b.i2c.sda], ['SCL', scl, b.i2c.scl]] as const) {
      if (!bp || bp.name === want) continue;
      const altRe = sig === 'SDA' ? /I2C\d_SDA|^SDA/ : /I2C\d_SCL|^SCL/;
      const capable = b.id === 'esp32' ? !!bp.caps?.includes('out') : b.id === 'pico' ? (bp.alt ?? []).some((a) => altRe.test(a)) : false;
      if (capable && b.id === 'pico') continue; // valid alternative I2C pins on the Pico
      if (capable) {
        c.add({ id: `i2c-pin:${part.id}:${sig}`, severity: 'warning', title: `${c.partName(part)}: ${sig} is on ${c.boardPinName(bp.name)}`, detail: `That works on the ESP32, but the generated code expects ${sig} on ${c.boardPinName(want)}. Move the wire, or change the pin number in the I2C(...) line of main.py.`, parts: [part.id], fix: c.moveBoardEnd({ part: c.boardId, pin: bp.name }, boardPin(b, want)) });
        continue;
      }
      c.add({
        id: `i2c-pin:${part.id}:${sig}`,
        severity: 'error',
        title: `${c.partName(part)}: ${sig} must go to ${c.boardPinName(want)}`,
        detail: b.id === 'rpi4' ? `The Raspberry Pi's I2C bus is fixed to GPIO2 (SDA) and GPIO3 (SCL). ${c.boardPinName(bp.name)} can't do I2C, so the part won't be found.` : `${c.boardPinName(bp.name)} can't be used for I2C ${sig}. Use ${c.boardPinName(want)}.`,
        parts: [part.id],
        fix: c.moveBoardEnd({ part: c.boardId, pin: bp.name }, boardPin(b, want)),
      });
    }
  }
  // SPI on the Raspberry Pi is fixed too (gpiozero's MCP3008 uses the hardware bus).
  if (b.id === 'rpi4' && b.spi) {
    const want: Record<string, string[]> = { 'spi.sck': [b.spi.sck], 'spi.mosi': [b.spi.mosi], 'spi.miso': [b.spi.miso], 'spi.cs': [b.spi.cs, 'GPIO7'] };
    for (const part of c.project.parts) {
      const d = c.def(part);
      for (const pin of d?.pins ?? []) {
        if (!pin.fn || !want[pin.fn]) continue;
        const bp = c.gpios(c.net({ part: part.id, pin: pin.name }))[0];
        if (!bp || want[pin.fn].includes(bp.name)) continue;
        c.add({ id: `spi-pin:${part.id}:${pin.name}`, severity: 'error', title: `${c.partName(part)}: ${pin.name} must go to ${c.boardPinName(want[pin.fn][0])}`, detail: `The Raspberry Pi's SPI bus uses fixed pins. ${pin.name} is on ${c.boardPinName(bp.name)}, where the SPI hardware can't reach it.`, parts: [part.id], fix: c.moveBoardEnd({ part: c.boardId, pin: bp.name }, boardPin(b, want[pin.fn][0])) });
      }
    }
  }
}

function checkSignalLevels(c: Ctx) {
  const b = c.board;
  const m = c.model;
  if (!b || !c.boardId) return;
  const limit = b.logicV + 0.3;
  // Simulate module outputs at their "high" level with all GPIOs floating, then look at each GPIO's voltage.
  const sources: { part: PartInstance; pin: string; push: boolean }[] = [];
  for (const part of c.project.parts) {
    if (part.type === 'hcsr04') sources.push({ part, pin: 'ECHO', push: true });
    if (['ssd1306', 'lcd1602', 'mpu6050'].includes(part.type)) sources.push({ part, pin: 'SDA', push: false }, { part, pin: 'SCL', push: false });
  }
  if (!sources.length) return;
  let volts = new Map<number, number>();
  if (m) {
    try {
      for (const s of sources) if (s.push) m.setModuleOutput(s.part.id, 'echo', Math.max(0, m.moduleSupply(s.part.id)));
      for (const p of b.pins) if (p.gpio !== undefined) volts.set(p.gpio, m.gpioVoltage(p.gpio));
    } catch {
      volts = new Map();
    } finally {
      for (const s of sources) if (s.push) m.setModuleOutput(s.part.id, 'echo', 0);
    }
  }
  for (const s of sources) {
    const supplyNet = c.net({ part: s.part.id, pin: def(s.part).pins.find((p) => p.role === 'power')!.name });
    const sv = c.supplyV(supplyNet);
    if (!sv || sv <= limit) continue;
    const gpios = m ? m.gpiosReachable(s.part.id, s.pin, 1e6) : c.gpios(c.net({ part: s.part.id, pin: s.pin })).map((x) => x.gpio!);
    for (const g of gpios) {
      const bp = b.pins.find((p) => p.gpio === g)!;
      const v = volts.get(g) ?? sv;
      if (v <= limit) continue;
      const net = c.net({ part: c.boardId, pin: bp.name });
      if (net && (c.supply.has(net) || c.gnd.has(net))) continue; // reported as a rail short
      c.add({
        id: s.push ? `overvoltage:${bp.name}:${s.part.id}` : `i2c-pullup-5v:${s.part.id}`,
        severity: s.push ? 'error' : 'warning',
        title: s.push ? `${c.boardPinName(bp.name)} gets ${v.toFixed(1)} V from ${c.partName(s.part)}` : `${c.partName(s.part)} pulls the I2C lines up to ${sv} V`,
        detail: s.push
          ? `The ${b.name}'s pins are ${b.logicV} V only. ${def(s.part).name} runs on ${sv} V and its ${s.pin} output swings to ${sv} V, which can damage the pin over time. Add a voltage divider (1 kΩ from ${s.pin} to the pin, 2 kΩ from the pin to GND) to bring it down to about 3.3 V.`
          : `This module has pull-up resistors to its own supply (${sv} V), so ${c.boardPinName(bp.name)} sees about ${v.toFixed(1)} V when idle — above the ${b.logicV} V the pin is designed for. The resistors are weak, so most boards survive it, but a small I2C level shifter (or powering the module from 3.3 V, if it supports it) is the safe option.`,
        parts: [s.part.id],
      });
      if (!s.push) break; // one warning per module is enough for pull-ups
    }
  }
}

function checkAnalog(c: Ctx) {
  const b = c.board;
  if (!b || !c.boardId) return;
  const analogPins: Record<string, string[]> = { potentiometer: ['SIG'], soil: ['AOUT'], ldr: ['1', '2'], ntc: ['1', '2'] };
  for (const part of c.project.parts) {
    const pins = analogPins[part.type];
    if (!pins) continue;
    for (const pin of pins) {
      for (const bp of c.gpios(c.net({ part: part.id, pin }))) {
        if (bp.caps?.includes('adc')) continue;
        c.add({
          id: `not-adc:${bp.name}:${part.id}`,
          severity: 'error',
          title: b.id === 'rpi4' ? `The Raspberry Pi can't read ${c.partName(part)} directly` : `${c.boardPinName(bp.name)} can't read ${c.partName(part)}`,
          detail:
            b.id === 'rpi4'
              ? `${def(part).name} gives a varying voltage (an analog signal), but the Raspberry Pi's pins only understand on/off. Connect it to a channel of an MCP3008 analog-to-digital converter instead.`
              : `${def(part).name} gives a varying voltage, which only analog (ADC) pins can measure. ${c.boardPinName(bp.name)} isn't one, so it would only ever read 0 or 1.${b.id === 'pico' ? ' On the Pico the analog pins are GP26, GP27 and GP28.' : ' On the ESP32 use D32–D39 (ADC1).'}`,
          parts: [part.id],
          fix: b.id === 'rpi4' ? undefined : c.moveBoardEnd({ part: c.boardId, pin: bp.name }, c.freePin(['adc'])),
        });
      }
    }
  }
}

function checkPowerBudget(c: Ctx) {
  const b = c.board;
  if (!b || !c.boardId) return;
  const rail3 = c.net({ part: c.boardId, pin: b.supply3v3 });
  const rail5 = c.net({ part: c.boardId, pin: b.supply5v });
  const tally = { 3: { typ: 0, worst: 0, who: [] as string[] }, 5: { typ: 0, worst: 0, who: [] as string[] } };
  for (const part of c.project.parts) {
    const d = c.def(part);
    if (!d || d.category === 'board') continue;
    const pp = d.pins.find((p) => p.role === 'power');
    if (!pp) continue;
    const net = c.net({ part: part.id, pin: pp.name });
    const rail = net && net === rail3 ? 3 : net && net === rail5 ? 5 : undefined;
    if (!rail) continue;
    const typ = d.currentMa ?? 5;
    const worst = WORST_MA[part.type]?.(part) ?? typ;
    tally[rail].typ += typ;
    tally[rail].worst += worst;
    tally[rail].who.push(`${c.partName(part)} ~${worst === typ ? typ : `${typ}–${worst}`} mA`);
  }
  // LEDs driven from GPIOs come out of the 3.3 V regulator too.
  const m = c.model;
  if (m) {
    for (const ch of ledChannels(c)) {
      const gs = m.gpiosReachable(ch.part.id, ch.anode, 1e6);
      if (!gs.length) continue;
      try {
        for (const g of gs) m.setPinMode(g, { kind: 'out', level: 1 });
        const ma = m.ledCurrentMa(ch.part.id, ch.part.type === 'rgb-led' ? ch.anode : 'd');
        if (Number.isFinite(ma) && ma < 40) {
          tally[3].typ += ma;
          tally[3].worst += ma;
        }
      } catch {
        /* ignore */
      } finally {
        for (const g of gs) m.setPinMode(g, { kind: 'unused' });
      }
    }
  }
  const own = c.def(c.project.parts.find((p) => p.id === c.boardId)!)?.currentMa ?? 0;
  const rails: [3 | 5, string, number, number][] = [
    [3, `${b.supply3v3} (3.3 V)`, BUDGET_3V3[b.id] ?? 300, 0],
    [5, b.id === 'rpi4' ? '5V' : `${b.supply5v} (5 V from USB)`, BUDGET_5V[b.id] ?? 500, b.id === 'rpi4' ? 0 : own],
  ];
  for (const [rail, name, budget, base] of rails) {
    const t = tally[rail];
    const typ = Math.round(t.typ + base);
    const worst = Math.round(t.worst + base);
    if (worst <= budget) continue;
    const severity: Severity = typ > budget * 2 ? 'error' : typ > budget || worst > budget * 1.4 ? 'warning' : 'info';
    const boardNote = base ? ` (including about ${base} mA for the ${b.short} itself)` : '';
    const advice =
      rail === 5
        ? 'Power hungry parts like servos and NeoPixels are best fed from a separate 5 V supply (a USB power bank or 5 V 2 A adapter), with its GND joined to the board\'s GND.'
        : b.id === 'rpi4'
          ? "The Pi's 3.3 V pins are meant for small sensors only; move bigger loads to the 5 V pins (if they accept 5 V) or a separate regulator."
          : 'Move 5 V-capable parts to the 5 V pin, or use a separate 3.3 V regulator.';
    c.add({
      id: `budget:${rail}v`,
      severity,
      title: typ > budget ? `Too much current on ${name}: about ${typ} mA` : `${name} could need up to ${worst} mA`,
      detail: `The ${name} supply can give about ${budget} mA. Expected draw is about ${typ} mA${worst > typ ? `, rising to ${worst} mA at worst (a servo straining, or NeoPixels at full white use 60 mA each)` : ''}${boardNote}. When the supply runs out the voltage dips and the board can reset at random. Parts on this rail: ${t.who.join(', ') || 'LEDs'}. ${advice}`,
    });
  }
}

/** Run every check. Results are sorted errors → warnings → info. */
export function runChecks(project: Project): CheckResult[] {
  const c = new Ctx(project);
  checkWires(c);
  checkBoardPresence(c);
  const floating = checkFloating(c);
  const shorted = checkPowerShorts(c);
  checkModulePower(c, floating);
  checkRequiredPins(c, floating);
  checkLeds(c, floating);
  checkElectrolytics(c);
  checkGpioNets(c, shorted);
  checkInputOnly(c);
  checkCautionPins(c);
  checkI2C(c);
  checkSignalLevels(c);
  checkAnalog(c);
  checkPowerBudget(c);
  checkNeoPixelLevels(c);
  return c.results.map((r, i) => [r, i] as const).sort((a, b) => SEVERITY_ORDER[a[0].severity] - SEVERITY_ORDER[b[0].severity] || a[1] - b[1]).map(([r]) => r);
}

/** WS2812 data must reach 0.7 × VDD: 3.3 V data into a ring powered from 5 V is marginal. */
function checkNeoPixelLevels(c: Ctx) {
  if (!c.board || c.board.logicV >= 5 || !c.model) return;
  for (const p of c.project.parts) {
    if (p.type !== 'neopixel-ring') continue;
    const vdd = c.model.moduleSupply(p.id);
    if (vdd < 4.5) continue;
    c.add({
      id: `neopixel-level:${p.id}`,
      severity: 'info',
      title: `${p.ref ?? p.id}: 3.3 V data into a 5 V NeoPixel ring is borderline`,
      detail: `The ring runs on ${vdd.toFixed(1)} V, so it wants data signals of at least ${(0.7 * vdd).toFixed(1)} V, and the ${c.board.short} sends 3.3 V. It usually works with short wires; if the ring flickers or stays dark, add a 74AHCT125 level shifter on the data line or power the ring from 3.3 V (dimmer, fewer LEDs).`,
      parts: [p.id],
    });
  }
}

/** One plain-English line summarising check results, e.g. for a status bar or the AI reply. */
export function checkSummary(results: CheckResult[]): string {
  const n = (s: Severity) => results.filter((r) => r.severity === s).length;
  const e = n('error');
  const w = n('warning');
  if (!e && !w) return 'No wiring problems found.';
  const parts: string[] = [];
  if (e) parts.push(`${e} problem${e === 1 ? '' : 's'} to fix`);
  if (w) parts.push(`${w} warning${w === 1 ? '' : 's'} worth a look`);
  return `${parts.join(' and ')}.`.replace(/^./, (s) => s.toUpperCase());
}
