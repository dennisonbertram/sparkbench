import { describe, it, expect } from 'vitest';
import { runChecks } from '../../src/core/checks';
import { buildExample } from '../../src/core/examples';
import { planFromPrompt } from '../../src/core/planner';

describe('safety checks', () => {
  it('warns about mains voltage in the request', () => {
    const p = planFromPrompt('ESP32 with a relay to switch my 230V wall socket lamp');
    expect(runChecks(p).some((c) => c.id === 'safety:mains' && c.severity === 'warning')).toBe(true);
  });
  it('notes that relay builds switch low voltage only', () => {
    expect(runChecks(buildExample('rpi-plant-waterer')).some((c) => c.id.startsWith('safety:relay'))).toBe(true);
  });
  it('flags a motor wired straight to a GPIO as an error', () => {
    const p = buildExample('rpi-plant-waterer');
    const motor = p.parts.find((x) => x.type === 'dc-motor')!;
    const board = p.parts.find((x) => x.type === 'rpi4')!;
    const wires = p.wires.filter((w) => w.a.part !== motor.id && w.b.part !== motor.id);
    wires.push({ id: 'm1', a: { part: motor.id, pin: '+' }, b: { part: board.id, pin: 'GPIO17' } }, { id: 'm2', a: { part: motor.id, pin: '-' }, b: { part: board.id, pin: 'GND.1' } });
    expect(runChecks({ ...p, wires }).some((c) => c.id.startsWith('safety:motor-gpio') && c.severity === 'error')).toBe(true);
  });
  it('does not flag ordinary projects', () => {
    expect(runChecks(buildExample('pico-traffic-light')).filter((c) => c.id.startsWith('safety:'))).toEqual([]);
  });
});
