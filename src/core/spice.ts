// Export a project's circuit as an ngspice netlist (.cir). The netlist mirrors ElectricalModel
// element-for-element (same values, same switch/GPIO/module approximations), so results from
// `ngspice -b file.cir` can be compared directly with our own MNA solver.
import type { Project } from './types';
import { ElectricalModel } from './circuit';
import { Resistor, Switch, VSource, Diode, NPN, Timer555, Capacitor, LED_PARAMS, type Element } from './mna';

export interface SpiceOptions {
  analysis?: 'op' | 'tran';
  tranStop?: number; // s
  tranStep?: number; // s (also used as the max internal step)
  /** gpio → 0/1: those GPIOs are configured as push-pull outputs. */
  gpioLevels?: Record<number, number>;
  /** part id → control states (pressed, position, lux, temperature, on…). */
  partStates?: Record<string, Record<string, number>>;
}

/** Spice-safe node name for a net name ('+3V3' → 'p3v3', 'GPIO21/SDA' → 'gpio21_sda'). */
export function spiceNode(name: string): string {
  const s = name.replace(/^\+/, 'p').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase();
  return s === '0' || s === 'gnd' ? 'gnd_' : /^[a-z_]/.test(s) ? s : `n${s}`;
}

const num = (x: number) => (Number.isFinite(x) ? Number(x.toPrecision(6)).toString() : '0');

// Behavioural NE555 matching mna.ts Timer555: CTRL divider 5k/10k, 3k quiescent load, output
// high = VCC−1.7 V / low = 0.1 V through 10 Ω, 10 Ω discharge switch. The flip-flop is a
// bistable B-source latch with an RC memory node (set = TRIG < CTRL/2 dominates, reset = THR > CTRL,
// forced low when RESET < 0.7 V or VCC < 3 V).
const NE555_SUBCKT = `.subckt NE555 gnd trig out reset ctrl thr dis vcc
* internal divider (CTRL = 2/3 VCC) and quiescent current
Rdiv1 vcc ctrl 5k
Rdiv2 ctrl gnd 10k
Rq vcc gnd 3k
* comparators (0..1): s = TRIG < CTRL/2, r = THR > CTRL, en = RESET > 0.7 V and VCC > 3 V
Bs s gnd V = 0.5*(1+tanh(500*(v(ctrl,gnd)/2-v(trig,gnd))))
Br r gnd V = 0.5*(1+tanh(500*(v(thr,gnd)-v(ctrl,gnd))))
Ben en gnd V = 0.25*(1+tanh(500*(v(reset,gnd)-0.7)))*(1+tanh(500*(v(vcc,gnd)-3)))
* bistable latch with RC memory (set dominates, like Timer555.evalState)
Bq qn gnd V = v(en,gnd)*0.5*(1+tanh(20*(3*v(s,gnd)-2*v(r,gnd)+v(qd,gnd)-0.5)))
Rmem qn qd 1k
Cmem qd gnd 1n
* squared-up latch state: output/discharge only move once the latch has flipped
Bqo qo gnd V = 0.5*(1+tanh(50*(v(qd,gnd)-0.5)))
* output stage (Norton 10 ohm) and discharge transistor
Bo oi gnd V = v(qo,gnd)*max(v(vcc,gnd)-1.7,0) + (1-v(qo,gnd))*0.1
Ro oi out 10
Bdis dis gnd I = v(dis,gnd)*((1-v(qo,gnd))/10 + 1e-9)
.ends NE555`;

export function exportSpice(project: Project, opts: SpiceOptions = {}): string {
  const m = new ElectricalModel(project);
  for (const [g, lvl] of Object.entries(opts.gpioLevels ?? {})) m.setPinMode(Number(g), { kind: 'out', level: lvl ? 1 : 0 });
  for (const [id, st] of Object.entries(opts.partStates ?? {})) {
    for (const [k, val] of Object.entries(st)) {
      if (project.parts.find((p) => p.id === id)?.type === 'relay' && k === 'on') m.setRelay(id, val > 0);
      else m.setPartState(id, k, val);
    }
  }
  m.solve(); // settles supply-dependent module outputs (soil sensor)
  const c = m.circuit;

  // Node names: net index → sanitized unique net name.
  const netById = new Map(m.nets.map((n) => [n.id, n]));
  const used = new Set<string>(['0']);
  const nodeName: string[] = c.nodeNames.map((id) => {
    const base = spiceNode(netById.get(id)?.name ?? id);
    let s = base;
    for (let k = 2; used.has(s); k++) s = `${base}_${k}`;
    used.add(s);
    return s;
  });
  const nd = (i: number) => (i < 0 ? '0' : nodeName[i]);
  const netLabel = (i: number) => (i < 0 ? 'GND' : netById.get(c.nodeNames[i])?.name ?? c.nodeNames[i]);
  const pinCount = (i: number) => (i < 0 ? 2 : netById.get(c.nodeNames[i])?.pins.length ?? 1);

  // Element → owning part.
  const owner = new Map<Element, { part: (typeof project.parts)[number]; key: string }>();
  for (const part of project.parts) for (const [key, el] of Object.entries(m.partElements(part.id))) owner.set(el, { part, key });

  const names = new Set<string>();
  const elName = (letter: string, base: string) => {
    let b = base.replace(/[^A-Za-z0-9_]/g, '_');
    if (!b.toUpperCase().startsWith(letter)) b = letter + b;
    let s = b;
    for (let k = 2; names.has(s.toLowerCase()); k++) s = `${b}_${k}`;
    names.add(s.toLowerCase());
    return s;
  };

  const models = new Map<string, string>();
  const diodeModel = (d: Diode, color?: string) => {
    let name = color ? `LED_${color.toUpperCase()}` : d.is === 2.52e-9 && d.n === 1.75 ? 'D1N4148' : `D_IS${num(d.is)}_N${num(d.n)}`;
    name = name.replace(/[^A-Za-z0-9_]/g, '_');
    models.set(name, `.model ${name} D(IS=${d.is.toExponential(6)} N=${num(d.n)})`);
    return name;
  };

  const lines: string[] = [];
  const out = (s: string) => lines.push(s);
  let has555 = false;
  const vsource = (name: string, src: VSource, comment: string) => {
    const a = nd(src.nodes[0]), b = nd(src.nodes[1]);
    out(`* ${comment}: + ${netLabel(src.nodes[0])}, − ${netLabel(src.nodes[1])}`);
    const vn = elName('V', name);
    const mid = `${vn.toLowerCase()}_int`;
    out(`${vn} ${mid} ${b} DC ${num(src.volts)}`);
    out(`${elName('R', `${name}_rs`)} ${mid} ${a} ${num(src.rs)}`);
  };

  for (const el of c.elements) {
    const own = owner.get(el);
    if (!own) {
      // Board-level sources: supplies and GPIO drivers.
      const src = el as VSource;
      if (/^gpio\d+$/.test(src.name)) {
        if (src.rs > 1e6) {
          if (pinCount(src.nodes[0]) < 2) continue; // unconnected, unused pin
          out(`* ${src.name.toUpperCase()} (unused/high-Z) on ${netLabel(src.nodes[0])}`);
          out(`${elName('R', `${src.name}_hiz`)} ${nd(src.nodes[0])} ${nd(src.nodes[1])} ${num(src.rs)}`);
        } else vsource(src.name, src, `${src.name.toUpperCase()} output ${src.volts > 0 ? 'high' : 'low'} (${num(src.rs)} Ω)`);
      } else vsource(src.name, src, `board ${src.name.replace(/^supply_/, '')} supply`);
      continue;
    }
    const { part, key } = own;
    const ref = part.ref ?? part.id;
    const base = key === Object.keys(m.partElements(part.id))[0] && Object.keys(m.partElements(part.id)).length === 1 ? ref : `${ref}_${key}`;
    const desc = `${ref} (${part.id}, ${part.type}${part.label ? `, ${part.label}` : ''})`;
    const nets = el.nodes.map(netLabel).join(', ');
    if (el instanceof Switch) {
      out(`* ${desc} ${key}: ${el.closed ? 'closed' : 'open'} — ${nets}`);
      out(`${elName('R', base)} ${nd(el.nodes[0])} ${nd(el.nodes[1])} ${num(el.ohms)}`);
    } else if (el instanceof Resistor) {
      out(`* ${desc}: ${nets}`);
      out(`${elName('R', base)} ${nd(el.nodes[0])} ${nd(el.nodes[1])} ${num(el.ohms)}`);
    } else if (el instanceof Diode) {
      const color = part.type === 'led' ? String(part.props.color ?? 'red') : part.type === 'rgb-led' ? { R: 'red', G: 'green', B: 'blue' }[key] : undefined;
      const model = diodeModel(el, color && LED_PARAMS[color] ? color : part.type === 'led' ? 'red' : color);
      out(`* ${desc}: anode ${netLabel(el.nodes[0])}, cathode ${netLabel(el.nodes[1])}`);
      out(`${elName('D', base)} ${nd(el.nodes[0])} ${nd(el.nodes[1])} ${model}`);
    } else if (el instanceof Capacitor) {
      out(`* ${desc}: ${nets}`);
      out(`${elName('C', base)} ${nd(el.nodes[0])} ${nd(el.nodes[1])} ${num(el.farads)} IC=${num(el.v0)}`);
    } else if (el instanceof NPN) {
      const model = `QNPN_${num(el.bf)}`.replace(/[^A-Za-z0-9_]/g, '_');
      models.set(model, `.model ${model} NPN(IS=${el.is.toExponential(6)} BF=${num(el.bf)} BR=${num(el.br)})`);
      out(`* ${desc}: C ${netLabel(el.nodes[0])}, B ${netLabel(el.nodes[1])}, E ${netLabel(el.nodes[2])}`);
      out(`${elName('Q', base)} ${el.nodes.map(nd).join(' ')} ${model}`);
    } else if (el instanceof Timer555) {
      has555 = true;
      out(`* ${desc}: GND TRIG OUT RESET CTRL THR DIS VCC = ${nets}`);
      out(`${elName('X', base)} ${el.nodes.map(nd).join(' ')} NE555`);
    } else if (el instanceof VSource) {
      vsource(base, el, `${desc}${key === 'v' ? '' : ` ${key} output`}`);
    } else out(`* ${desc} ${key}: unsupported element ${el.constructor.name}`);
  }

  const analysis = opts.analysis ?? 'op';
  const stop = opts.tranStop ?? 1;
  const step = opts.tranStep ?? stop / 1000;
  const probes = [...new Set(nodeName)].filter((n) => !n.endsWith('_int'));
  const devCurrents = lines
    .filter((l) => /^[DQ]/i.test(l))
    .map((l) => l.split(' ')[0].toLowerCase())
    .map((n) => (n.startsWith('d') ? `@${n}[id]` : `@${n}[ic]`));

  const hdr = [
    `* Sparkbench SPICE export — ${project.name}`,
    `* board: ${project.board}; ground = GND net (node 0). Mirrors ElectricalModel (src/core/circuit.ts).`,
    `* Run: ngspice -b file.cir`,
    '.options rshunt=1e12', // GMIN to ground on every node, like our solver
  ];
  const ctl =
    analysis === 'op'
      ? ['.control', 'op', 'print all', ...(devCurrents.length ? [`print ${devCurrents.join(' ')}`] : []), '.endc']
      : [
          '.control',
          `set width=${16 * (probes.length + 2) + 8}`,
          'set nobreak',
          `tran ${num(step)} ${num(stop)} 0 ${num(step)} uic`,
          ...(probes.length ? [`print ${probes.map((n) => `v(${n})`).join(' ')}`] : []),
          '.endc',
        ];
  return [`${project.name} (Sparkbench)`, ...hdr, '', ...lines, '', ...models.values(), ...(has555 ? ['', NE555_SUBCKT] : []), '', ...ctl, '.end', ''].join('\n');
}

/** Parse `name = value` lines from ngspice `.op` / `print` output (keys lowercased, as ngspice prints them). */
export function parseNgspiceOp(stdout: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of stdout.split(/\r?\n/)) {
    const mm = /^\s*([^\s=]+)\s*=\s*([-+]?[0-9.]+(?:e[-+]?\d+)?)\s*$/i.exec(line);
    if (mm) out[mm[1].toLowerCase()] = Number(mm[2]);
  }
  return out;
}

/** Parse a `print` table from a transient run into columns (time, v(node)…), merging wrapped tables. */
export function parseNgspiceTran(stdout: string): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  let cols: string[] | null = null;
  for (const line of stdout.split(/\r?\n/)) {
    const t = line.trim();
    if (/^Index\s/.test(t)) {
      cols = t.split(/\s+/).slice(1).map((s) => s.toLowerCase());
      for (const k of cols) out[k] ??= [];
      continue;
    }
    if (!cols || !/^\d+\s/.test(t)) continue;
    const f = t.split(/\s+/);
    const i = Number(f[0]);
    cols.forEach((k, j) => (out[k][i] = Number(f[j + 1])));
  }
  return out;
}
