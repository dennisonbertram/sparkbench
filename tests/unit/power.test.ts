import { describe, expect, it } from 'vitest';
import { buildExample } from '../../src/core/examples';
import { batteryOptions, fuseFor, powerReport, protectionAdvice, sleepAdvice, type LoadSample } from '../../src/core/power';
import { runChecks, supplyLoads } from '../../src/core/checks';
import { buildBom } from '../../src/core/bom';
import { benchCounts, toolkit } from '../../src/core/toolkit';
import { buildGuide } from '../../src/core/docs';

const load = (avgMa: number, perPart: Record<string, number> = {}): LoadSample => ({ avgMa, peakMa: avgMa, perPart, seconds: 30 });

describe('power advice', () => {
  it('sizes the fuse for the worst-case current', () => {
    expect(fuseFor(120)).toBe(500);
    expect(fuseFor(800)).toBe(1100);
    expect(fuseFor(2000)).toBe(3000);
    const thermo = buildExample('esp32-neopixel-thermo');
    const r = powerReport(thermo, load(123));
    expect(r.worst.totalMa).toBeGreaterThanOrEqual(800);
    expect(r.protection[0]).toMatch(/1\.1 A resettable fuse/);
    expect(protectionAdvice(buildExample('rpi-plant-waterer'), 1500).join(' ')).not.toMatch(/500 mA/);
  });

  it('uses the same worst case as the Problems tab', () => {
    const thermo = buildExample('esp32-neopixel-thermo');
    const rail5 = supplyLoads(thermo).find((r) => r.rail === 5)!;
    const check = runChecks(thermo).find((c) => c.id === 'budget:5v')!;
    expect(check.title + check.detail).toContain(`${rail5.worst} mA`);
  });

  it('needs a 5 V boost converter on lithium cells when 5 V parts are fitted', () => {
    const thermo = buildExample('esp32-neopixel-thermo');
    const opts = batteryOptions(thermo, 800, supplyLoads(thermo));
    const li = opts.find((o) => o.id === 'li18650')!;
    expect(li.regulator).toMatch(/5 V boost/);
    expect(li.regulator).not.toMatch(/MCP1700/);
    expect(li.factor).toBeGreaterThan(1.3);
    // A Pico with only 3.3 V parts keeps the low-current LDO.
    const tl = buildExample('pico-traffic-light');
    expect(batteryOptions(tl, 100, supplyLoads(tl)).find((o) => o.id === 'li18650')!.regulator).toMatch(/HT7333|MCP1700/);
  });

  it('offers deep sleep only when nothing has to stay lit', () => {
    expect(sleepAdvice(buildExample('pico-mood-lamp'), load(25))).toBeNull();
    expect(sleepAdvice(buildExample('esp32-neopixel-thermo'), load(123))).toBeNull();
    expect(sleepAdvice(buildExample('esp32-eink-weather'), load(60))).not.toBeNull();
  });

  it('lists every part with its full-on current, even if it was off during the run', () => {
    const r = powerReport(buildExample('rpi-plant-waterer'), load(637));
    const pump = Object.entries(r.maxPerPart).find(([k]) => /^M/.test(k));
    expect(pump?.[1]).toBeGreaterThan(100);
  });
});

describe('motor flyback diode', () => {
  it('the planner puts a diode across a relay-switched pump, so no warning', () => {
    const p = buildExample('rpi-plant-waterer');
    expect(p.parts.some((x) => x.type === 'diode')).toBe(true);
    expect(runChecks(p).some((c) => c.id.startsWith('safety:flyback'))).toBe(false);
    expect(buildBom(p).some((l) => l.type === 'diode')).toBe(true);
  });
  it('warns when the diode is missing', () => {
    const p = buildExample('rpi-plant-waterer');
    const d = p.parts.find((x) => x.type === 'diode')!;
    const broken = { ...p, parts: p.parts.filter((x) => x !== d), wires: p.wires.filter((w) => w.a.part !== d.id && w.b.part !== d.id) };
    expect(runChecks(broken).find((c) => c.id.startsWith('safety:flyback'))?.severity).toBe('warning');
  });
});

describe('one source of truth for breadboard and wires', () => {
  for (const id of ['rpi-plant-waterer', 'esp32-weather-imu', '555-blinker', 'pico-traffic-light']) {
    it(`${id}: parts list, tools and guide agree`, () => {
      const p = buildExample(id);
      const bench = benchCounts(p);
      const bom = buildBom(p);
      const tools = toolkit(p);
      expect(bom.find((l) => l.key === 'supply:breadboard')!.name).toMatch(/830/);
      expect(tools.find((t) => t.id === 'breadboard')!.name).toMatch(/830/);
      expect(bom.find((l) => l.key === 'supply:jumpers-mm')!.description).toContain(`uses ${bench.jumpers})`);
      expect(tools.find((t) => t.id === 'jumpers')!.why).toContain(`uses ${bench.jumpers} jumpers`);
      if (bench.femaleLeads) expect(bom.find((l) => l.key === 'supply:jumpers-fm')!.description).toContain(`uses ${bench.femaleLeads})`);
      expect(buildGuide(p)).toContain(`about ${bench.minutes} minutes`);
      expect(buildGuide(p)).toContain(`**Jumpers:** ${bench.jumpers}`);
    });
  }
  it('lists the T-Cobbler for a Raspberry Pi layout', () => {
    const p = buildExample('rpi-plant-waterer');
    expect(buildBom(p).some((l) => l.key === 'supply:cobbler')).toBe(true);
    expect(toolkit(p).some((t) => t.id === 'cobbler')).toBe(true);
  });
});
