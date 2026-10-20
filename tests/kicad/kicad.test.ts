// Round-trips exported schematics through KiCad's own CLI: netlist, ERC and SVG export.
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { planFromPrompt } from '../../src/core/planner';
import { buildNets } from '../../src/core/netlist';
import { pinNumber } from '../../src/core/symbols';
import { exportKicadSchematic, exportKicadProject, exportKicadNetlist, kicadName } from '../../src/core/kicad';
import type { Project } from '../../src/core/types';

const CLI = [process.env.KICAD_CLI, join(homedir(), 'Applications/KiCad.app/Contents/MacOS/kicad-cli'), '/Applications/KiCad.app/Contents/MacOS/kicad-cli', '/usr/bin/kicad-cli'].find(
  (p): p is string => !!p && existsSync(p),
);

const PROMPTS = [
  'ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU',
  'raspberry pi plant monitor with soil moisture, relay pump and lcd',
  'raspberry pi pico traffic light',
  '555 blinker',
  'esp32 parking sensor with ultrasonic distance, buzzer and 3 leds',
  'transistor led switch with no microcontroller',
];

/**
 * ERC findings we accept. They are about the user's KiCad installation, not the design:
 * - lib_symbol_issues: the embedded "Sparkbench"/"power" libraries are not in the global sym-lib-table
 * - footprint_link_issues: footprint libraries are not configured for a standalone kicad-cli run
 * - lib_symbol_mismatch: embedded copy differs from an installed library symbol of the same name
 */
const ALLOWED = new Set(['lib_symbol_issues', 'footprint_link_issues', 'lib_symbol_mismatch']);

// Minimal s-expression reader for KiCad netlists.
type S = string | S[];
function parseSexpr(src: string): S {
  let i = 0;
  const read = (): S => {
    while (/\s/.test(src[i])) i++;
    if (src[i] === '(') {
      i++;
      const list: S[] = [];
      for (;;) {
        while (/\s/.test(src[i])) i++;
        if (src[i] === ')') {
          i++;
          return list;
        }
        list.push(read());
      }
    }
    if (src[i] === '"') {
      let s = '';
      i++;
      while (src[i] !== '"') {
        if (src[i] === '\\') i++;
        s += src[i++];
      }
      i++;
      return s;
    }
    let s = '';
    while (!/[\s()]/.test(src[i])) s += src[i++];
    return s;
  };
  return read();
}
const child = (l: S[], key: string) => l.find((x): x is S[] => Array.isArray(x) && x[0] === key);
const children = (l: S[], key: string) => l.filter((x): x is S[] => Array.isArray(x) && x[0] === key);

/** Multi-pin nets as sorted "REF.pin" groups. */
function kicadPartition(netlist: string): string[] {
  const root = parseSexpr(netlist) as S[];
  const nets = children(child(root, 'nets')!, 'net');
  return nets
    .map((n) =>
      children(n, 'node')
        .map((nd) => `${child(nd, 'ref')![1]}.${child(nd, 'pin')![1]}`)
        .filter((k) => !k.startsWith('#'))
        .sort()
        .join(' '),
    )
    .filter((g) => g.includes(' '))
    .sort();
}

function ourPartition(project: Project): string[] {
  const byId = new Map(project.parts.map((p) => [p.id, p]));
  return buildNets(project)
    .nets.filter((n) => n.pins.length > 1)
    .map((n) =>
      n.pins
        .map((r) => `${byId.get(r.part)!.ref}.${pinNumber(byId.get(r.part)!.type, r.pin)}`)
        .sort()
        .join(' '),
    )
    .sort();
}

describe.skipIf(!CLI)('KiCad round trip (kicad-cli)', () => {
  for (const prompt of PROMPTS) {
    it(`"${prompt}" exports, netlists, passes ERC and plots`, () => {
      const project = planFromPrompt(prompt);
      const dir = mkdtempSync(join(tmpdir(), 'sparkbench-kicad-test-'));
      const name = kicadName(project);
      const sch = join(dir, `${name}.kicad_sch`);
      writeFileSync(sch, exportKicadSchematic(project));
      writeFileSync(join(dir, `${name}.kicad_pro`), exportKicadProject(project));
      const run = (args: string[]) => execFileSync(CLI!, args, { cwd: dir, stdio: 'pipe', timeout: 60_000 });

      // Netlist: KiCad must see exactly the same connections as Sparkbench.
      run(['sch', 'export', 'netlist', '-o', join(dir, 'k.net'), sch]);
      expect(kicadPartition(readFileSync(join(dir, 'k.net'), 'utf8'))).toEqual(ourPartition(project));
      // ...and our own netlist exporter agrees with both.
      expect(kicadPartition(exportKicadNetlist(project))).toEqual(ourPartition(project));

      // ERC: no errors, and nothing about dangling wires/labels or unconnected pins.
      run(['sch', 'erc', '--format', 'json', '--severity-all', '-o', join(dir, 'erc.json'), sch]);
      const erc = JSON.parse(readFileSync(join(dir, 'erc.json'), 'utf8'));
      const violations: { type: string; severity: string; description: string }[] = erc.sheets.flatMap((s: any) => s.violations);
      const unexpected = violations.filter((v) => !ALLOWED.has(v.type)).map((v) => `${v.severity} ${v.type}: ${v.description}`);
      expect(unexpected).toEqual([]);

      // Plot it (references come from the instances section; the netlist check above proves they resolve).
      run(['sch', 'export', 'svg', '-o', dir, sch]);
      const svgFile = readdirSync(dir).find((f) => f.endsWith('.svg'));
      expect(svgFile).toBeTruthy();
      const svg = readFileSync(join(dir, svgFile!), 'utf8');
      expect(svg.length).toBeGreaterThan(1000);
    }, 120_000);
  }
});
