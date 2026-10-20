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
  createdAt: number;
  updatedAt: number;
  version: 1;
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
  | 'led' | 'rgb' | 'neopixel' | 'buzzer' | 'servo' | 'relay' | 'astable555' | 'transistor-led';

export interface FeatureReq {
  kind: FeatureKind;
  label?: string;
  props?: Record<string, any>;
}

export interface DesignSpec {
  board: BoardId;
  features: FeatureReq[];
  title?: string;
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
