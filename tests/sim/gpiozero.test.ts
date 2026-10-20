import { describe, it, expect } from 'vitest';
import { planFromPrompt } from '../../src/core/planner';
import { simulate } from '../../src/sim/node-runner';

describe('simulated gpiozero', () => {
  it('blink / beep / pulse run in the background like real gpiozero', async () => {
    const p = planFromPrompt('raspberry pi doorbell with a button, a buzzer and a led');
    const led = p.features!.find((f) => f.kind === 'led')!;
    const bz = p.features!.find((f) => f.kind === 'buzzer')!;
    p.files['main.py'] = `from gpiozero import Button, PWMLED, PWMOutputDevice, Buzzer, LED
from signal import pause
import time
led = PWMLED(${led.gpio.pin})
led.blink(on_time=0.25, off_time=0.25)
b = PWMOutputDevice(${bz.gpio.pin}, frequency=880)
b.blink(on_time=0.1, off_time=0.1, n=3)
t0 = time.monotonic()
while time.monotonic() - t0 < 2:
    time.sleep(0.05)
led.off()
print("done", led.value)
`;
    const frames = [300, 550, 800, 1050];
    const { engine, snapshots } = await simulate(p, { untilMs: 2500, onFrameAt: frames });
    if (engine.error) console.log(engine.error.raw);
    expect(engine.error).toBeUndefined();
    const states = snapshots.map((s) => (s.frame.parts[led.parts[0]].led ?? 0) > 0.1);
    expect(new Set(states).size).toBe(2); // it toggled
    expect(engine.serialAll.join('\n')).toMatch(/done 0/);
  }, 30000);
});
