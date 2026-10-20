import { describe, it, expect } from 'vitest';
import { PARTS } from '../../src/core/parts';
import { planFromPrompt } from '../../src/core/planner';
import { buildNets, pinKey } from '../../src/core/netlist';
import { allSymbols, symbolFor, GRID } from '../../src/core/symbols';
import { buildSchematic, drawnConnectivity, overlap, pinEnd, renderSchematicSvg, verifySchematic } from '../../src/core/schematic';
import { exportKicadSchematic, exportKicadNetlist, exportKicadProject } from '../../src/core/kicad';
import type { Project } from '../../src/core/types';

const PROMPTS = [
  'ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU',
  'raspberry pi plant monitor with soil moisture, relay pump and lcd',
  'raspberry pi pico traffic light',
  '555 blinker',
  'esp32 parking sensor with ultrasonic distance, buzzer and 3 leds',
  'transistor led switch with no microcontroller',
  'esp32 rgb mood light with a potentiometer and a light sensor and a servo',
  'pico motion light with pir and relay and neopixel ring and a slide switch',
  'raspberry pi weather station with thermistor, light sensor, potentiometer, oled',
];

const onGrid = (v: number, g = GRID / 2) => Math.abs(v / g - Math.round(v / g)) < 1e-6;

describe('symbol library', () => {
  it('has a symbol for every part with exactly the PinDef pin names', () => {
    for (const def of PARTS) {
      const sym = symbolFor(def.type);
      expect(sym.pins.map((p) => p.name).sort(), def.type).toEqual(def.pins.map((p) => p.name).sort());
      const numbers = sym.pins.map((p) => p.number);
      expect(new Set(numbers).size, `${def.type} pin numbers unique`).toBe(numbers.length);
      for (const p of sym.pins) expect(onGrid(p.x) && onGrid(p.y), `${def.type}.${p.name} on grid`).toBe(true);
    }
    expect(new Set(allSymbols().map((s) => s.name)).size).toBe(PARTS.length);
  });

  it('uses physical header numbers for boards', () => {
    const pico = symbolFor('pi-pico');
    expect(pico.pins.find((p) => p.name === 'GP0')!.number).toBe('1');
    expect(pico.pins.find((p) => p.name === 'VBUS')!.number).toBe('40');
    expect(pico.pins).toHaveLength(40);
    const pi = symbolFor('rpi4');
    expect(pi.pins.find((p) => p.name === 'GPIO2')!.number).toBe('3');
    expect(pi.pins).toHaveLength(40);
    expect(symbolFor('esp32-devkit').pins).toHaveLength(30);
    // LED/diode follow KiCad's K=1, A=2 footprint convention
    expect(symbolFor('led').pins.find((p) => p.name === 'C')!.number).toBe('1');
  });

  it('puts board GPIOs on the sides and supplies on top/bottom', () => {
    const esp = symbolFor('esp32-devkit');
    const side = (n: string) => esp.pins.find((p) => p.name === n)!.dir;
    expect(side('D21')).toBe('right');
    expect(side('D13')).toBe('left');
    expect(side('3V3')).toBe('up');
    expect(side('GND.1')).toBe('down');
  });
});

describe('schematic', () => {
  for (const prompt of PROMPTS) {
    describe(prompt, () => {
      const project = planFromPrompt(prompt);
      const sch = buildSchematic(project);

      it('draws exactly the connectivity of the project nets', () => {
        expect(verifySchematic(sch, project)).toEqual([]);
        expect(sch.symbols).toHaveLength(project.parts.length);
      });

      it('terminates every pin (wire, label, power symbol or no-connect)', () => {
        const { netOf } = buildNets(project);
        const conn = drawnConnectivity(sch);
        const ncs = new Set(sch.noConnects.map((n) => `${n.part}:${n.pin}`));
        const touched = new Set([...sch.wires.flatMap((w) => [w.a, w.b]), ...sch.power.map((p) => [p.x, p.y]), ...sch.labels.map((l) => [l.x, l.y])].map((p) => `${p[0]},${p[1]}`));
        for (const s of sch.symbols) {
          const sym = symbolFor(s.type);
          for (const p of sym.pins) {
            const k = pinKey({ part: s.part, pin: p.name });
            const { pt } = pinEnd(sym, p, s.x, s.y, s.rot);
            const multi = netOf.get(k)!.pins.length > 1;
            if (multi) {
              const shared = sch.symbols.some((o) => o !== s && symbolFor(o.type).pins.some((q) => pinEnd(symbolFor(o.type), q, o.x, o.y, o.rot).pt.join() === pt.join()));
              expect(touched.has(`${pt[0]},${pt[1]}`) || shared, `${s.ref}.${p.name} connected`).toBe(true);
              expect(ncs.has(k)).toBe(false);
            } else expect(ncs.has(k), `${s.ref}.${p.name} no-connect`).toBe(true);
            expect(conn.has(k)).toBe(true);
          }
        }
      });

      it('keeps all coordinates on the 1.27 mm connection grid', () => {
        for (const w of sch.wires) expect([...w.a, ...w.b].every((v) => onGrid(v))).toBe(true);
        for (const l of [...sch.labels, ...sch.power]) expect(onGrid(l.x) && onGrid(l.y)).toBe(true);
      });

      it('does not overlap symbols, labels or texts of different owners', () => {
        const bad: string[] = [];
        const obs = sch.obstacles;
        for (let i = 0; i < obs.length; i++)
          for (let j = i + 1; j < obs.length; j++) if (obs[i].owner !== obs[j].owner && overlap(obs[i], obs[j], -0.05)) bad.push(`${obs[i].kind}:${obs[i].owner} × ${obs[j].kind}:${obs[j].owner}`);
        expect(bad).toEqual([]);
      });
    });
  }

  it('uses real wires for the discrete classics and labels for board projects', () => {
    expect(buildSchematic(planFromPrompt('555 blinker')).style).toBe('template');
    expect(buildSchematic(planFromPrompt('555 blinker')).labels).toHaveLength(0);
    expect(buildSchematic(planFromPrompt('transistor led switch with no microcontroller')).style).toBe('template');
    expect(buildSchematic(planFromPrompt('raspberry pi pico traffic light')).style).toBe('labels');
  });

  it('falls back to the label layout when a discrete circuit was rewired', () => {
    const p = planFromPrompt('555 blinker');
    // Move the LED resistor from OUT to DIS: the hand-drawn template no longer matches.
    const edited: Project = { ...p, wires: p.wires.map((w) => (w.a.pin === 'OUT' && w.a.part === 'ne5551' ? { ...w, a: { ...w.a, pin: 'DIS' } } : w)) };
    const sch = buildSchematic(edited);
    expect(sch.style).toBe('labels');
    expect(verifySchematic(sch, edited)).toEqual([]);
  });

  it('updates when wiring changes', () => {
    const p = planFromPrompt('raspberry pi pico traffic light');
    const before = buildSchematic(p).noConnects.length;
    const fewer: Project = { ...p, wires: p.wires.slice(1) };
    expect(buildSchematic(fewer).noConnects.length).toBeGreaterThan(before);
    expect(verifySchematic(buildSchematic(fewer), fewer)).toEqual([]);
  });

  it('handles empty projects', () => {
    const p = planFromPrompt('raspberry pi pico traffic light');
    const empty: Project = { ...p, parts: [], wires: [], features: [] };
    expect(renderSchematicSvg(empty)).toContain('<svg');
  });
});

describe('renderSchematicSvg', () => {
  const project = planFromPrompt('ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU');

  it('produces a standalone SVG with refs, values, title block and data attributes', () => {
    const svg = renderSchematicSvg(project);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toMatch(/viewBox="[-\d.]+ [-\d.]+ [\d.]+ [\d.]+"/);
    for (const p of project.parts) {
      expect(svg).toContain(`data-part="${p.id}"`);
      expect(svg).toContain(`>${p.ref}<`);
    }
    expect(svg).toContain('data-net="GPIO21_SDA"');
    expect(svg).toContain('data-net="GND"');
    expect(svg).toContain('Sparkbench');
    expect(svg).toContain(project.name.replace(/&/g, '&amp;'));
    expect(svg).toContain('OLED_SSD1306');
    // balanced groups
    expect((svg.match(/<g[ >]/g) ?? []).length).toBe((svg.match(/<\/g>/g) ?? []).length);
  });

  it('highlights a net and supports a dark theme', () => {
    const svg = renderSchematicSvg(project, { highlightNet: 'GPIO21_SDA', theme: 'dark' });
    expect(svg).toMatch(/class="w hl" data-net="GPIO21_SDA"/);
    expect(svg).toMatch(/class="lbl hl" data-net="GPIO21_SDA"/);
    expect(svg).toContain('sb-dark');
    expect(svg).not.toMatch(/class="w hl" data-net="GND"/);
  });
});

describe('KiCad text exports', () => {
  const project = planFromPrompt('555 blinker');

  it('writes a KiCad 8+ schematic with embedded symbols, power symbols and instances', () => {
    const sch = exportKicadSchematic(project);
    expect(sch).toMatch(/^\(kicad_sch \(version 20231120\)/);
    expect(sch).toContain('(symbol "Sparkbench:NE555"');
    expect(sch).toContain('(symbol "power:GND"');
    expect(sch).toContain('(lib_id "power:+BATT")');
    expect(sch).toContain('(reference "U1")');
    expect(sch).toContain('Package_DIP:DIP-8_W7.62mm');
    expect(sch).toContain('(sheet_instances');
    // balanced parentheses
    let depth = 0;
    for (const ch of sch.replace(/"(\\.|[^"\\])*"/g, '')) depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
    expect(depth).toBe(0);
    // deterministic
    expect(exportKicadSchematic(project)).toBe(sch);
  });

  it('writes a netlist and a project file', () => {
    const net = exportKicadNetlist(project);
    expect(net).toMatch(/^\(export \(version "E"\)/);
    expect(net).toContain('(net (code "1") (name "GND")');
    expect(net).toContain('(comp (ref "U1") (value "NE555P")');
    const pro = JSON.parse(exportKicadProject(project));
    expect(pro.meta.filename).toBe('555-led-blinker.kicad_pro');
  });
});
