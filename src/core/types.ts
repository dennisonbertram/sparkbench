// Core data model shared by the UI, simulator, exporters and tests.

export type BoardId = 'esp32' | 'pico' | 'rpi4' | 'none';

export type PinRole =
  | 'power' // supply input/output (VCC, 3V3, 5V, VIN)
  | 'gnd'
  | 'io' // generic digital/analog signal
  | 'passive' // two-terminal passive lead (resistor, LED, button…)
  | 'nc';

export interface PinDef {
  name: string; // unique within the part, e.g. "SDA"
  role: PinRole;
  /** Functional hint used by the auto-wirer: 'i2c.sda', 'pwm', 'adc', 'digital-in', … */
  fn?: string;
  description?: string;
  /** Wokwi element pin name if it differs from `name`. */
  wokwi?: string;
  /** Required for the part to work (ERC flags it if left floating). Defaults to true except nc. */
  required?: boolean;
  /** This pin needs an external pull-up resistor to the part's supply (ohms), e.g. a bare DS18B20's DQ (4700). */
  pullUp?: number;
  /** A load (or bias) resistor the datasheet asks for on this pin, from the pin's board net to the board's 3V3, GND
   * or the part's own supply (ohms), e.g. the load resistor under a resistive gas sensor or an LDR. Sparkbench adds it
   * as a real resistor; '3v3' keeps an ADC pin within its range when the part runs from 5 V. */
  load?: { ohms: number; to: '3v3' | 'gnd' | 'supply' };
  /** A power pin fed from a separate supply, not the board (a motor driver's VMOT, a solenoid's V+): the volts it
   * accepts and the current it draws. Sparkbench wires it to an external DC supply with its − joined to GND. */
  supply?: { vmin: number; vmax: number; currentMa?: number };
  /** An output whose high level is fixed by the module (e.g. 3.3 V from its own regulator), not the part's supply. */
  levelV?: number;
  /** An output that swings above the board's 3.3 V when the part runs from 5 V: Sparkbench puts this resistor divider
   * between the output and the GPIO (top: output → pin, bottom: pin → GND), so the pin sees about 3.3 V. */
  divider?: { top: number; bottom: number };
  /** The module itself pulls this line up to its own supply (ohms), e.g. the 4.7 kΩ I2C pull-ups on an LCD backpack. */
  boardPullUp?: number;
}

export interface PropDef {
  key: string;
  label: string;
  type: 'number' | 'string' | 'select' | 'color';
  default: string | number;
  options?: string[];
  unit?: string;
  help?: string;
}

/** Simulation knobs exposed to the user while the simulation runs. */
export interface SimControl {
  key: string;
  label: string;
  kind: 'slider' | 'toggle' | 'momentary';
  min?: number;
  max?: number;
  step?: number;
  default: number;
  unit?: string;
}

export interface PartDef {
  type: string;
  name: string;
  category: 'board' | 'display' | 'input' | 'sensor' | 'output' | 'passive' | 'power' | 'ic' | 'actuator';
  description: string;
  /** One-line beginner-friendly explanation. */
  eli5: string;
  refPrefix: string; // R, D, SW, U, M…
  pins: PinDef[];
  props?: PropDef[];
  controls?: SimControl[];
  /** Supply voltage range for modules. */
  vmin?: number;
  vmax?: number;
  /** Typical current draw in mA (for power budget). */
  currentMa?: number;
  i2cAddress?: number;
  bom: { mpn: string; description: string; priceUsd: number; supplierQuery: string; footprint?: string };
  kicad: { symbol: string; footprint?: string; value?: (props: Record<string, any>) => string };
  wokwi?: { tag: string; attrs?: (props: Record<string, any>) => Record<string, string | number | boolean> };
  /** Keywords the offline planner matches against. */
  keywords: string[];
  /** Build tips shown in the build guide. */
  buildNotes?: string[];
  /** Only used by the "product" version of a board (bare chips); hidden from the parts library. */
  production?: boolean;
}

export interface PartInstance {
  id: string; // stable id, e.g. "oled1"
  type: string;
  ref?: string; // reference designator, assigned by annotate()
  label?: string; // human label ("Up button")
  props: Record<string, any>;
  x: number;
  y: number;
  rotate?: number;
}

export interface PinRef {
  part: string; // part id
  pin: string; // pin name
}

export interface Wire {
  id: string;
  a: PinRef;
  b: PinRef;
  color?: string;
}

export interface Project {
  id: string;
  name: string;
  summary: string;
  prompt?: string;
  board: BoardId;
  parts: PartInstance[];
  wires: Wire[];
  files: Record<string, string>; // firmware files, main.py first
  /** Free-text notes from the planner explaining decisions. */
  notes: string[];
  /** The high-level request the design was generated from (re-planned on AI edits). */
  spec?: DesignSpec;
  /** Feature → assigned pins, produced by the planner, used by code/docs generators. */
  features?: FeatureInstance[];
  /** True once the user (or AI) hand-edited main.py — the planner then won't overwrite it. */
  codeCustom?: boolean;
  /** Components added from datasheets (see customParts.ts), carried with the project. */
  customParts?: import('./customParts').CustomPartSpec[];
  /** What custom (AI-written or curated) firmware does, used by the build guide and blog. */
  behavior?: { does: string; test?: string; sim?: string }[];
  /** What the user wants, confirmed before/after designing (requirements card). */
  requirements?: Requirements;
  /** Acceptance tests from the user's intent (AI or user written); auto-derived ones are recomputed. */
  tests?: import('./acceptance').AcceptanceTest[];
  /** Current hardware revision letter ("A", "B"…) and the history of released revisions. */
  revision?: string;
  revisions?: Revision[];
  createdAt: number;
  updatedAt: number;
  version: 1;
}

export interface Revision {
  rev: string;
  date: string;
  /** Why this revision exists, in the user's words. */
  note: string;
  /** What changed from the previous revision (computed). */
  changes: string[];
  /** Snapshot of the design at release. */
  snapshot: { parts: PartInstance[]; wires: Wire[]; files: Record<string, string>; board: BoardId };
}

export interface Requirements {
  /** What it will do, one plain sentence each. */
  does: string[];
  power: string;
  size: string;
  budget: string;
  /** Promises from "does" that no acceptance test checks (set when Claude writes the tests). */
  untested?: string[];
}

export interface Net {
  id: string; // "N1"
  name: string; // human/semantic name: GND, 3V3, GPIO21/SDA …
  pins: PinRef[];
}

export type Severity = 'error' | 'warning' | 'info';

export interface CheckResult {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  parts?: string[];
  fix?: { label: string; action: FixAction };
}

export type FixAction =
  | { kind: 'add-wire'; a: PinRef; b: PinRef }
  | { kind: 'remove-wire'; wireId: string }
  | { kind: 'insert-resistor'; wireId: string; ohms: number }
  | { kind: 'move-wire-end'; wireId: string; end: 'a' | 'b'; to: PinRef };

export type FeatureKind =
  | 'oled' | 'lcd' | 'button' | 'switch' | 'pot' | 'dht22' | 'mpu6050' | 'hcsr04' | 'pir' | 'ldr' | 'ntc' | 'soil'
  | 'led' | 'rgb' | 'neopixel' | 'buzzer' | 'servo' | 'relay' | 'astable555' | 'transistor-led' | 'epaper' | 'internet';

export interface FeatureReq {
  kind: FeatureKind;
  label?: string;
  props?: Record<string, any>;
  /** Board pin the user asked for, e.g. { pin: 'D14' } ("move the button to GPIO 14"). */
  pins?: Record<string, string>;
}

export interface DesignSpec {
  board: BoardId;
  features: FeatureReq[];
  title?: string;
  /** A note from the planner to show the user (e.g. a board substitution). */
  note?: string;
}

export interface FeatureInstance {
  kind: FeatureKind;
  name: string; // python variable name, e.g. btn_up
  label: string; // "Up button"
  parts: string[]; // part ids, main part first
  /** Signal name → board pin name, e.g. { pin: 'D4' } or { sda: 'D21', scl: 'D22' }. */
  pins: Record<string, string>;
  /** gpio numbers for the same signals. */
  gpio: Record<string, number>;
  mcpChannel?: number;
  props?: Record<string, any>;
}
