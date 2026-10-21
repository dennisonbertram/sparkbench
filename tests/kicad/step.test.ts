// The case STEP export must be readable by OpenCascade (KiCad's CAD kernel): attach it as a footprint
// 3D model, export the board as STEP, and the case's faces must appear in the result.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCase } from '../../src/core/enclosure';
import { solidToStep } from '../../src/core/step';

const CLI = [process.env.KICAD_CLI, join(homedir(), 'Applications/KiCad.app/Contents/MacOS/kicad-cli'), '/Applications/KiCad.app/Contents/MacOS/kicad-cli', '/usr/bin/kicad-cli'].find((p) => p && existsSync(p));
const board = { width_mm: 50, height_mm: 40, holes: [[3.5, 3.5], [46.5, 3.5], [46.5, 36.5], [3.5, 36.5]] as [number, number][], parts: [{ ref: 'D1', x: 25, y: 20, rot: 0, box: [22, 17, 28, 23] as [number, number, number, number] }], usb: null };

const pcbWithModel = (model: string) => `(kicad_pcb (version 20240108) (generator "test")
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user))
  (gr_rect (start 0 0) (end 50 40) (stroke (width 0.1) (type default)) (fill none) (layer "Edge.Cuts"))
  (footprint "Test:Case" (layer "F.Cu") (at 0 0)
    (property "Reference" "X1" (at 0 0 0) (layer "F.SilkS"))
    (model "${model}" (offset (xyz 0 0 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0)))
  )
)
`;
const faces = (step: string) => (step.match(/ADVANCED_FACE|FACE_SURFACE/g) ?? []).length;

describe.skipIf(!CLI)('case STEP export', { timeout: 120000 }, () => {
  it('is read by OpenCascade (its faces appear in a KiCad STEP export)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'step-'));
    const r = buildCase({ board, types: { D1: 'led' }, style: 'minimal', name: 'T' });
    const step = solidToStep(r.parts[0].geom, 'case-base');
    writeFileSync(join(dir, 'case.step'), step);
    writeFileSync(join(dir, 'with.kicad_pcb'), pcbWithModel(join(dir, 'case.step')));
    writeFileSync(join(dir, 'without.kicad_pcb'), pcbWithModel(join(dir, 'missing.step')));
    for (const n of ['with', 'without']) execFileSync(CLI!, ['pcb', 'export', 'step', '--output', join(dir, `${n}.step`), join(dir, `${n}.kicad_pcb`)], { stdio: 'pipe' });
    const added = faces(readFileSync(join(dir, 'with.step'), 'utf8')) - faces(readFileSync(join(dir, 'without.step'), 'utf8'));
    expect(added).toBe(faces(step));
  });
});
