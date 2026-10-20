import { describe, it, expect } from 'vitest';
import { planFromPrompt } from '../../src/core/planner';
import { simulate } from '../../src/sim/node-runner';
import { EPaperDevice } from '../../src/sim/devices';

describe('internet + e-paper', () => {
  it('e-ink weather display connects, downloads the forecast and draws it', async () => {
    const p = planFromPrompt('ESP32 with an e-ink display that connects to the internet to get the weather and a button to refresh');
    expect(p.name).toBe('ESP32 E-ink Weather Display');
    const { engine } = await simulate(p, { untilMs: 8000 });
    if (engine.error) console.log(engine.error.raw);
    expect(engine.error).toBeUndefined();
    const log = engine.serialAll.join('\n');
    console.log(log.slice(0, 1200));
    expect(log).toMatch(/Wi-Fi connected/);
    expect(log).toMatch(/open-meteo\.com.*→ 200/);
    expect(log).toMatch(/Out 14\.6 C Cloudy/);
    const epd = (engine as any).epapers[0].dev as EPaperDevice;
    console.log(epd.ascii());
    expect(epd.refreshes).toBeGreaterThan(0);
    expect(epd.pixels().some((b) => b)).toBe(true);
  }, 30000);

  it('without Wi-Fi it reports the failure instead of crashing', async () => {
    const p = planFromPrompt('esp32 weather dashboard with an oled that gets the forecast from the internet');
    const board = p.parts.find((x) => x.type === 'esp32-devkit')!;
    const { engine } = await simulate(p, { untilMs: 15000, inputs: [{ atMs: 0, part: board.id, key: 'wifi', value: 0 }] });
    expect(engine.error).toBeUndefined();
    expect(engine.serialAll.join('\n')).toMatch(/NOT connected|download failed/);
  }, 30000);

  it('internet clock sets the time over NTP', async () => {
    const p = planFromPrompt('esp32 internet clock with an lcd');
    const { engine } = await simulate(p, { untilMs: 6000 });
    expect(engine.error).toBeUndefined();
    expect(engine.serialAll.join('\n')).toMatch(/Time 06:3\d/); // 10:30 UTC − 4 h
  }, 30000);

  it('a Pico internet request becomes an ESP32 design with a note', () => {
    const p = planFromPrompt('pico that shows the weather from the internet on an oled');
    expect(p.board).toBe('esp32');
    expect(p.notes[0]).toMatch(/no Wi-Fi/);
  });
});
