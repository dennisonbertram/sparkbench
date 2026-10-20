// Circuit-board spec: everything KiCad needs to lay out a printed circuit board for a project —
// one footprint per part with each pad's net, plus net classes (thicker tracks for power).
// The layout itself (placement, routing, ground pour, fab outputs) is done by scripts/pcb/
// with KiCad's own pcbnew + Freerouting, then checked with kicad-cli DRC.
import type { Project } from './types';
import { partDef } from './parts';
import { buildNets, annotate } from './netlist';
import { pinNumber, defaultValue } from './symbols';
import { kicadName } from './kicad';

export interface PcbPart {
  ref: string;
  /** "Library:Footprint" (KiCad standard libraries, or "Sparkbench:" for generated ones). */
  footprint: string;
  value: string;
  /** Pad number → net name. */
  pads: Record<string, string>;
  /** Plain-English role, for placement hints and the assembly notes. */
  role: 'board' | 'connector' | 'module' | 'ic' | 'passive' | 'indicator' | 'input' | 'power';
  description: string;
}

export interface PcbSpec {
  name: string;
  title: string;
  parts: PcbPart[];
  /** Net names that carry supply current (wider tracks). */
  powerNets: string[];
  groundNet: string | null;
}

const ROLE: Record<string, PcbPart['role']> = {
  board: 'board',
  display: 'module',
  sensor: 'module',
  input: 'input',
  output: 'indicator',
  passive: 'passive',
  power: 'power',
  ic: 'ic',
  actuator: 'connector',
};

export function pcbSpec(project: Project): PcbSpec {
  const proj = project.parts.some((p) => !p.ref) ? annotate(project) : project;
  const { nets, netOf } = buildNets(proj);
  const parts: PcbPart[] = proj.parts.map((p) => {
    const def = partDef(p.type);
    const pads: Record<string, string> = {};
    for (const pin of def.pins) {
      const net = netOf.get(`${p.id}:${pin.name}`);
      if (!net || net.pins.length < 2) continue;
      pads[pinNumber(p.type, pin.name)] = net.name;
    }
    return {
      ref: p.ref ?? p.id,
      footprint: def.kicad.footprint ?? 'Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical',
      value: defaultValue(def, p.props),
      pads,
      role: ROLE[def.category] ?? 'passive',
      description: def.name,
    };
  });
  const power = nets.filter((n) => n.pins.length > 1 && /^(GND|\+3V3|\+5V|VBAT)/.test(n.name)).map((n) => n.name);
  return {
    name: kicadName(proj),
    title: proj.name,
    parts,
    powerNets: power,
    groundNet: power.find((n) => /^GND/.test(n)) ?? null,
  };
}
