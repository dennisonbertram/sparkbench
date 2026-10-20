// A physical 830-point breadboard: hole geometry, which holes are connected, and a realistic
// top-down SVG of a build (parts with legs in holes + jumper wires). Used to show beginners
// exactly where everything goes, and to check photos of real builds against the plan.

export const PITCH = 20; // px per 0.1"
export const COLS = 63;
const X0 = 60;
const ROW_Y: Record<string, number> = { a: 100, b: 120, c: 140, d: 160, e: 180, f: 240, g: 260, h: 280, i: 300, j: 320 };
const RAIL_Y: Record<string, number> = { 'T+': 30, 'T-': 50, 'B-': 370, 'B+': 390 };
export const BOARD_W = X0 * 2 + (COLS - 1) * PITCH;
export const BOARD_H = 420;

/** Hole names: "a1".."j63" for the main area, "T+5" / "T-5" / "B-5" / "B+5" for rails. */
export type Hole = string;

export function holeXY(h: Hole): { x: number; y: number } {
  const m = /^([a-j])(\d+)$/.exec(h);
  if (m) return { x: X0 + (Number(m[2]) - 1) * PITCH, y: ROW_Y[m[1]] };
  const r = /^([TB][+-])(\d+)$/.exec(h);
  if (r) return { x: X0 + (Number(r[2]) - 1) * PITCH, y: RAIL_Y[r[1]] };
  throw new Error(`bad hole ${h}`);
}

/** The metal strip a hole belongs to: a–e of a column, f–j of a column, or a whole rail. */
export function stripOf(h: Hole): string {
  const m = /^([a-j])(\d+)$/.exec(h);
  if (m) return `${'abcde'.includes(m[1]) ? 'T' : 'B'}${m[2]}`;
  const r = /^([TB][+-])(\d+)$/.exec(h);
  if (r) return `rail${r[1]}`;
  throw new Error(`bad hole ${h}`);
}

export type BbKind = 'pico' | 'led' | 'resistor' | 'button' | 'ldr' | 'ne555' | 'capacitor' | 'electrolytic' | 'battery';

export interface BbPart {
  ref: string; // "R1", "D1", "U1"
  kind: BbKind;
  /** Pin name → hole. For the battery, its leads' rail holes. */
  legs: Record<string, Hole>;
  color?: string; // LED colour
  ohms?: number;
  farads?: number;
  label?: string;
}

export interface BbWire {
  from: Hole;
  to: Hole;
  color: string;
}

export interface BbLayout {
  name: string;
  parts: BbPart[];
  wires: BbWire[];
}

// ------------------------------------------------------------------ Raspberry Pi Pico on the board
const PICO_TOP: string[] = ['VBUS', 'VSYS', 'GND.8', '3V3_EN', '3V3', 'ADC_VREF', 'GP28', 'AGND', 'GP27', 'GP26', 'RUN', 'GP22', 'GND.7', 'GP21', 'GP20', 'GP19', 'GP18', 'GND.6', 'GP17', 'GP16'];
const PICO_BOTTOM: string[] = ['GP0', 'GP1', 'GND.1', 'GP2', 'GP3', 'GP4', 'GP5', 'GND.2', 'GP6', 'GP7', 'GP8', 'GP9', 'GND.3', 'GP10', 'GP11', 'GP12', 'GP13', 'GND.4', 'GP14', 'GP15'];

/** Pico straddling the centre gap with its USB end at column 1: pins in rows c (top edge) and h (bottom edge). */
export function picoLegs(): Record<string, Hole> {
  const legs: Record<string, Hole> = {};
  PICO_TOP.forEach((n, i) => (legs[n] = `c${i + 1}`));
  PICO_BOTTOM.forEach((n, i) => (legs[n] = `h${i + 1}`));
  return legs;
}

/** A free hole in the same strip as a Pico pin, for a jumper (rows a/b above, i/j below). */
export function picoAccess(pin: string, row: 'outer' | 'inner' = 'outer'): Hole {
  const h = picoLegs()[pin];
  const col = h.slice(1);
  return h[0] === 'c' ? `${row === 'outer' ? 'a' : 'b'}${col}` : `${row === 'outer' ? 'j' : 'i'}${col}`;
}

// ------------------------------------------------------------------ connectivity
/** Connected groups of "REF.pin" given what's plugged where. */
export function connectivity(layout: BbLayout): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  for (const w of layout.wires) union(stripOf(w.from), stripOf(w.to));
  // Pins with the same name on one part (e.g. the Pico's GND pins) are joined inside it.
  for (const p of layout.parts) {
    const byName = new Map<string, string>();
    for (const [pin, h] of Object.entries(p.legs)) {
      const base = pin.replace(/\.\d+$/, '');
      if (byName.has(base)) union(byName.get(base)!, stripOf(h));
      else byName.set(base, stripOf(h));
    }
  }
  const members = new Map<string, string[]>();
  for (const p of layout.parts) {
    for (const [pin, h] of Object.entries(p.legs)) {
      const name = `${p.ref}.${pin.replace(/\.\d+$/, '')}`;
      const root = find(stripOf(h));
      if (!members.has(root)) members.set(root, []);
      members.get(root)!.push(name);
    }
  }
  return [...members.values()].map((g) => [...new Set(g)].sort()).filter((g) => g.length > 1).sort((a, b) => a[0].localeCompare(b[0]));
}

/** Compare against expected nets (each a list of REF.pin). Returns human-readable differences. */
export function diffConnectivity(actual: string[][], expected: string[][]): string[] {
  const key = (g: string[]) => [...g].sort().join(' ');
  const a = new Set(actual.map(key));
  const e = new Set(expected.map(key));
  return [...[...e].filter((x) => !a.has(x)).map((x) => `missing: ${x}`), ...[...a].filter((x) => !e.has(x)).map((x) => `unexpected: ${x}`)];
}

// ------------------------------------------------------------------ rendering
const BAND = ['#111', '#7a4a1a', '#d42020', '#ee7a12', '#f2d21b', '#2f9a3a', '#2453c9', '#7a2fa8', '#888', '#f4f4f4'];
const LED_FILL: Record<string, string> = { red: '#e8302a', yellow: '#f4cf1f', green: '#3ccf4e', blue: '#3a7bff', white: '#f2f5f8', orange: '#ff8a1c' };

function resistorBands(ohms: number): string[] {
  const exp = Math.max(0, Math.floor(Math.log10(ohms)) - 1);
  const sig = Math.round(ohms / 10 ** exp);
  const d1 = Math.floor(sig / 10) % 10;
  const d2 = sig % 10;
  return [BAND[d1], BAND[d2], BAND[exp], '#c9a227'];
}

const lead = (a: { x: number; y: number }, b: { x: number; y: number }, w = 2) => `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#b8b8b8" stroke-width="${w}" stroke-linecap="round"/><circle cx="${a.x}" cy="${a.y}" r="2.6" fill="#8d8d8d" stroke="#555" stroke-width="0.8"/>`;
/** Small parts with legs one hole apart are drawn leaning back, as in a real photo, so each leg's hole stays visible. */
const LIFT = 24;
/** Lean up or down, whichever hides fewer of the other parts' legs and wire ends. */
function liftFor(p: BbPart, layout: BbLayout, cx: number, cy: number): number {
  const others = [...layout.parts.filter((q) => q !== p).flatMap((q) => Object.values(q.legs)), ...layout.wires.flatMap((w) => [w.from, w.to])].map(holeXY);
  const hidden = (y: number) => others.filter((o) => Math.abs(o.x - cx) < 20 && Math.abs(o.y - y) < 16).length;
  return hidden(cy - LIFT) <= hidden(cy + LIFT) ? LIFT : -LIFT;
}

function renderBoard(): string {
  const out: string[] = [];
  out.push(`<rect x="0" y="0" width="${BOARD_W}" height="${BOARD_H}" rx="10" fill="#f1ede3" stroke="#d6cfbf"/>`);
  out.push(`<rect x="20" y="${(ROW_Y.e + ROW_Y.f) / 2 - 9}" width="${BOARD_W - 40}" height="18" fill="#e2dccd"/>`);
  for (const [r, y] of Object.entries(RAIL_Y)) {
    const plus = r.endsWith('+');
    const ly = r.startsWith('T') ? (plus ? 18 : 62) : plus ? 402 : 358;
    out.push(`<line x1="40" y1="${ly}" x2="${BOARD_W - 40}" y2="${ly}" stroke="${plus ? '#d33' : '#36c'}" stroke-width="2"/>`);
    for (let c = 1; c <= COLS; c++) if (c % 6 !== 0) {
      const x = X0 + (c - 1) * PITCH;
      out.push(`<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" rx="1" fill="#3b3833"/>`);
    }
    out.push(`<text x="28" y="${y + 5}" font-size="13" fill="${plus ? '#d33' : '#36c'}" font-family="Arial" font-weight="bold">${plus ? '+' : '−'}</text>`);
  }
  for (const [r, y] of Object.entries(ROW_Y)) {
    out.push(`<text x="36" y="${y + 4}" font-size="11" fill="#6d665a" font-family="Arial">${r}</text>`);
    out.push(`<text x="${BOARD_W - 46}" y="${y + 4}" font-size="11" fill="#6d665a" font-family="Arial">${r}</text>`);
    for (let c = 1; c <= COLS; c++) {
      const x = X0 + (c - 1) * PITCH;
      out.push(`<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" rx="1" fill="#3b3833"/>`);
    }
  }
  for (let c = 1; c <= COLS; c++) if (c === 1 || c % 5 === 0) {
    const x = X0 + (c - 1) * PITCH;
    out.push(`<text x="${x}" y="${ROW_Y.a - 18}" font-size="10" fill="#6d665a" font-family="Arial" text-anchor="middle">${c}</text>`);
    out.push(`<text x="${x}" y="${ROW_Y.j + 24}" font-size="10" fill="#6d665a" font-family="Arial" text-anchor="middle">${c}</text>`);
  }
  return out.join('');
}

function renderPart(p: BbPart, layout: BbLayout): string {
  const L = Object.fromEntries(Object.entries(p.legs).map(([k, h]) => [k, holeXY(h)]));
  const pts = Object.values(L);
  const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
  const cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;
  const lift = ['led', 'ldr', 'capacitor', 'electrolytic'].includes(p.kind) ? liftFor(p, layout, cx, cy) : 0;
  switch (p.kind) {
    case 'pico': {
      const xs = pts.map((q) => q.x);
      const x1 = Math.min(...xs) - 14;
      const x2 = Math.max(...xs) + 14;
      const y1 = ROW_Y.c - 14;
      const y2 = ROW_Y.h + 14;
      const pins = pts.map((q) => `<circle cx="${q.x}" cy="${q.y}" r="5" fill="#d8c27a" stroke="#9c8742"/>`).join('');
      return `<g filter="url(#sh)"><rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" rx="6" fill="#1f7a3f"/>${pins}
        <rect x="${x1 - 16}" y="${(y1 + y2) / 2 - 22}" width="30" height="44" rx="3" fill="#c7cbd0" stroke="#8b9096"/>
        <rect x="${cx - 26}" y="${(y1 + y2) / 2 - 26}" width="52" height="52" fill="#2a2a2a"/><text x="${cx}" y="${(y1 + y2) / 2 + 4}" fill="#bbb" font-size="9" text-anchor="middle" font-family="Arial">RP2040</text>
        <rect x="${x1 + 40}" y="${(y1 + y2) / 2 - 12}" width="16" height="12" fill="#eee"/><text x="${x1 + 48}" y="${(y1 + y2) / 2 + 12}" fill="#e8f2ea" font-size="7" text-anchor="middle" font-family="Arial">BOOTSEL</text>
        <text x="${x2 - 70}" y="${(y1 + y2) / 2 + 3}" fill="#e8f2ea" font-size="10" font-family="Arial" font-weight="bold">Raspberry Pi Pico</text>
        <text x="${holeXY('h1').x}" y="${ROW_Y.h - 10}" fill="#fff" font-size="8" text-anchor="middle" font-family="Arial">1</text><text x="${holeXY('h2').x}" y="${ROW_Y.h - 10}" fill="#fff" font-size="8" text-anchor="middle" font-family="Arial">2</text>
        <text x="${holeXY('c1').x}" y="${ROW_Y.c + 17}" fill="#fff" font-size="8" text-anchor="middle" font-family="Arial">40</text><text x="${holeXY('c2').x}" y="${ROW_Y.c + 17}" fill="#fff" font-size="8" text-anchor="middle" font-family="Arial">39</text></g>`;
    }
    case 'resistor': {
      const a = L['1'];
      const b = L['2'];
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const bands = resistorBands(p.ohms ?? 220)
        .map((c, i) => `<rect x="${-12 + i * 6 + (i === 3 ? 3 : 0)}" y="-5.5" width="3" height="11" fill="${c}"/>`)
        .join('');
      return `${lead(a, b)}${lead(b, a)}<g transform="translate(${cx} ${cy}) rotate(${ang})" filter="url(#sh)"><rect x="-17" y="-6" width="34" height="12" rx="5" fill="#d9c49a"/>${bands}</g>`;
    }
    case 'led': {
      const a = L.A;
      const k = L.C;
      const ang = (Math.atan2(k.y - a.y, k.x - a.x) * 180) / Math.PI;
      const fill = LED_FILL[p.color ?? 'red'] ?? '#e33';
      // Top view of a 5 mm LED: round dome with a flat edge on the cathode (−) side.
      return `${lead(a, { x: cx - 4, y: cy - lift })}${lead(k, { x: cx + 4, y: cy - lift })}<g transform="translate(${cx} ${cy - lift}) rotate(${ang})" filter="url(#sh)"><path d="M 9 -6.5 A 11 11 0 1 1 9 6.5 Z" fill="${fill}" stroke="#0004" stroke-width="1"/><circle cx="-3" cy="-3" r="3" fill="#fff8"/></g>`;
    }
    case 'button': {
      return `${pts.map((q) => lead(q, { x: cx, y: cy })).join('')}<g filter="url(#sh)"><rect x="${cx - 16}" y="${cy - 16}" width="32" height="32" rx="2" fill="#2b2b2b"/><circle cx="${cx}" cy="${cy}" r="9" fill="${p.color ?? '#c22'}"/></g>`;
    }
    case 'ldr': {
      const y = cy - lift;
      return `${pts.map((q) => lead(q, { x: q.x < cx ? cx - 4 : cx + 4, y })).join('')}<g filter="url(#sh)"><circle cx="${cx}" cy="${y}" r="11" fill="#d9a865" stroke="#8a6b3f"/><path d="M ${cx - 7} ${y - 5} h 14 v 3 h -14 v 3 h 14 v 3 h -14" stroke="#a33" stroke-width="1.6" fill="none"/></g>`;
    }
    case 'capacitor': {
      const y = cy - lift;
      return `${pts.map((q) => lead(q, { x: q.x < cx ? cx - 3 : cx + 3, y })).join('')}<g filter="url(#sh)"><ellipse cx="${cx}" cy="${y}" rx="10" ry="8" fill="#d9922e"/><text x="${cx}" y="${y + 3}" font-size="6" text-anchor="middle" fill="#3d2400" font-family="Arial">103</text></g>`;
    }
    case 'electrolytic': {
      const plus = L['+'];
      const minus = L['-'];
      const ang = (Math.atan2(minus.y - plus.y, minus.x - plus.x) * 180) / Math.PI;
      const dx = plus.x < minus.x ? 4 : -4;
      return `${lead(plus, { x: cx - dx, y: cy - lift })}${lead(minus, { x: cx + dx, y: cy - lift })}<g transform="translate(${cx} ${cy - lift}) rotate(${ang})" filter="url(#sh)"><circle r="13" fill="#1b3d8f"/><path d="M 5 -12 A 13 13 0 0 1 5 12 Z" fill="#c9d4f0"/><text x="9" y="3" font-size="9" fill="#1b3d8f" font-family="Arial">−</text></g>`;
    }
    case 'ne555': {
      const xs = pts.map((q) => q.x);
      const x1 = Math.min(...xs) - 10;
      const x2 = Math.max(...xs) + 10;
      return `<g filter="url(#sh)"><rect x="${x1}" y="${ROW_Y.e - 2}" width="${x2 - x1}" height="${ROW_Y.f - ROW_Y.e + 4}" rx="3" fill="#202020"/>${pts.map((q) => `<rect x="${q.x - 3}" y="${q.y - 5}" width="6" height="10" fill="#c8c8c8"/>`).join('')}<path d="M ${x1} ${cy - 7} A 7 7 0 0 1 ${x1} ${cy + 7}" fill="#444"/><circle cx="${x1 + 9}" cy="${ROW_Y.f - 12}" r="2.5" fill="#444"/><text x="${cx}" y="${cy + 4}" font-size="10" fill="#ddd" text-anchor="middle" font-family="Arial">NE555P</text></g>`;
    }
    case 'battery': {
      const plus = L['+'];
      const minus = L['-'];
      const bx = Math.min(plus.x, minus.x) - 10;
      return `<g filter="url(#sh)"><path d="M ${plus.x} ${plus.y} C ${plus.x - 20} ${plus.y - 40}, ${bx - 30} ${-40}, ${bx - 40} ${-70}" stroke="#d22" stroke-width="5" fill="none"/><path d="M ${minus.x} ${minus.y} C ${minus.x - 20} ${minus.y - 40}, ${bx - 10} ${-40}, ${bx - 20} ${-70}" stroke="#222" stroke-width="5" fill="none"/><circle cx="${plus.x}" cy="${plus.y}" r="3.5" fill="#bbb"/><circle cx="${minus.x}" cy="${minus.y}" r="3.5" fill="#bbb"/></g>`;
    }
  }
}

function renderWire(w: BbWire, i: number): string {
  const a = holeXY(w.from);
  const b = holeXY(w.to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const lift = Math.min(70, 14 + len * 0.18) * (i % 2 ? 1 : 0.8);
  // Arc the wire "up" (towards the viewer, drawn as an offset perpendicular to the wire).
  const nx = len ? -dy / len : 0;
  const ny = len ? dx / len : -1;
  const sgn = ny > 0 ? -1 : 1;
  const c1 = { x: a.x + dx * 0.25 + nx * lift * sgn, y: a.y + dy * 0.25 + ny * lift * sgn };
  const c2 = { x: a.x + dx * 0.75 + nx * lift * sgn, y: a.y + dy * 0.75 + ny * lift * sgn };
  const d = `M ${a.x} ${a.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
  return `<g filter="url(#sh)"><path d="${d}" stroke="#0005" stroke-width="7" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${w.color}" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="${a.x}" cy="${a.y}" r="3.5" fill="#aaa"/><circle cx="${b.x}" cy="${b.y}" r="3.5" fill="#aaa"/></g>`;
}

/** Full SVG of the build. Parts first, then wires on top (as they would be on a real board). */
export function renderBreadboardSvg(layout: BbLayout, opts: { margin?: number } = {}): string {
  const m = opts.margin ?? 90;
  const body = [renderBoard(), ...layout.parts.map((p) => renderPart(p, layout)), ...layout.wires.map(renderWire)].join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-m} ${-m} ${BOARD_W + 2 * m} ${BOARD_H + 2 * m}" width="${BOARD_W + 2 * m}" height="${BOARD_H + 2 * m}"><defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="2" dy="3" stdDeviation="2" flood-opacity="0.35"/></filter></defs>${body}</svg>`;
}
