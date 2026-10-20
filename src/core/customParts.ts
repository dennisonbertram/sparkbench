// Components added from a datasheet (by the AI) rather than hand-modelled in parts.ts.
// A CustomPartSpec is plain JSON: it lives in the project file and in the part's skill folder
// (.claude/skills/part-<slug>/part.json), and is turned into a PartDef at runtime.
import type { PartDef, PinDef, Project, SimControl } from './types';

export type CustomInterface = 'i2c' | 'spi' | 'analog' | 'digital-in' | 'digital-out' | 'pwm' | 'uart' | 'onewire' | 'power' | 'passive';

export interface CustomSim {
  /**
   * analog-sensor: drives `outputPin` with a voltage set by a slider
   * digital-sensor: drives `outputPin` high/low with a toggle
   * actuator: shows "on" when `inputPin` is driven high
   * i2c-device: answers at its address with a register map
   */
  kind: 'analog-sensor' | 'digital-sensor' | 'actuator' | 'i2c-device' | 'none';
  outputPin?: string;
  inputPin?: string;
  quantity?: string; // "Temperature"
  unit?: string; // "°C"
  min?: number;
  max?: number;
  default?: number;
  /** analog-sensor: output voltage at min / max of the quantity. */
  vAtMin?: number;
  vAtMax?: number;
  /** digital-sensor: output level when active. */
  activeHigh?: boolean;
  /** i2c-device: fixed register contents, e.g. { "0xD0": 96 } (chip id). */
  registers?: Record<string, number>;
  /** i2c-device: where the slider's measured value appears: raw = round((value - offset) / scale). */
  measure?: { reg: string; bytes: number; scale: number; offset?: number; signed?: boolean; littleEndian?: boolean; shift?: number };
}

export interface CustomPartSpec {
  type: string; // "custom-bme280"
  name: string;
  mpn: string;
  category: PartDef['category'];
  description: string;
  eli5: string;
  refPrefix: string;
  interface: CustomInterface;
  pins: PinDef[];
  vmin?: number;
  vmax?: number;
  currentMa?: number;
  i2cAddress?: number;
  datasheetUrl?: string;
  priceUsd: number;
  supplierQuery: string;
  footprint?: string;
  buildNotes?: string[];
  keywords?: string[];
  sim: CustomSim;
  /** MicroPython driver written from the datasheet, copied into projects that use the part. */
  driver?: { filename: string; code: string };
  /** The part's skill (markdown) — given to the AI whenever the part is in a project. */
  skill?: string;
}

const REGISTRY = new Map<string, { spec: CustomPartSpec; def: PartDef }>();

export function specToDef(spec: CustomPartSpec): PartDef {
  const controls: SimControl[] = [];
  const s = spec.sim;
  if (s.kind === 'analog-sensor' || (s.kind === 'i2c-device' && s.measure)) {
    const min = s.min ?? 0;
    const max = s.max ?? 100;
    controls.push({ key: 'value', label: s.quantity ?? 'Value', kind: 'slider', min, max, step: (max - min) / 200 >= 1 ? 1 : +((max - min) / 200).toPrecision(1), default: s.default ?? (min + max) / 2, unit: s.unit ? ` ${s.unit}`.replace(/^ (°|%)/, '$1') : '' });
  }
  if (s.kind === 'digital-sensor') controls.push({ key: 'active', label: s.quantity ?? 'Triggered', kind: 'toggle', default: 0 });
  return {
    type: spec.type,
    name: spec.name,
    category: spec.category,
    description: spec.description,
    eli5: spec.eli5,
    refPrefix: spec.refPrefix || 'U',
    pins: spec.pins,
    controls,
    vmin: spec.vmin,
    vmax: spec.vmax,
    currentMa: spec.currentMa,
    i2cAddress: spec.i2cAddress,
    bom: { mpn: spec.mpn, description: spec.description.split('. ')[0], priceUsd: spec.priceUsd, supplierQuery: spec.supplierQuery, footprint: spec.footprint },
    kicad: { symbol: `Sparkbench:${spec.type}`, footprint: spec.footprint ?? `Connector_PinHeader_2.54mm:PinHeader_1x${String(spec.pins.length).padStart(2, '0')}_P2.54mm_Vertical`, value: () => spec.mpn },
    keywords: spec.keywords ?? [spec.mpn.toLowerCase(), spec.name.toLowerCase()],
    buildNotes: spec.buildNotes,
  };
}

export function registerCustomPart(spec: CustomPartSpec) {
  REGISTRY.set(spec.type, { spec, def: specToDef(spec) });
}

export function registerProjectParts(project: Pick<Project, 'customParts'> | null | undefined) {
  for (const s of project?.customParts ?? []) registerCustomPart(s);
}

export function customDef(type: string): PartDef | undefined {
  return REGISTRY.get(type)?.def;
}

export function customSpec(type: string): CustomPartSpec | undefined {
  return REGISTRY.get(type)?.spec;
}

export function allCustomDefs(): PartDef[] {
  return [...REGISTRY.values()].map((x) => x.def);
}

export function slugType(mpn: string): string {
  return `custom-${mpn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

/** Sanity-check AI-extracted specs before they enter a design. */
export function validateSpec(spec: CustomPartSpec): string[] {
  const errs: string[] = [];
  if (!/^custom-[a-z0-9-]+$/.test(spec.type)) errs.push('type must look like custom-<mpn>');
  if (!spec.pins?.length) errs.push('no pins');
  const names = new Set<string>();
  for (const p of spec.pins ?? []) {
    if (!p.name || names.has(p.name)) errs.push(`bad or duplicate pin name "${p.name}"`);
    names.add(p.name);
  }
  if (!spec.pins?.some((p) => p.role === 'gnd') && spec.interface !== 'passive') errs.push('no ground pin');
  const s = spec.sim;
  if (s.outputPin && !names.has(s.outputPin)) errs.push(`sim.outputPin ${s.outputPin} is not a pin`);
  if (s.inputPin && !names.has(s.inputPin)) errs.push(`sim.inputPin ${s.inputPin} is not a pin`);
  if (s.kind === 'i2c-device' && spec.i2cAddress === undefined) errs.push('i2c-device without i2cAddress');
  return errs;
}
