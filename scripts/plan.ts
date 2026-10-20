// Usage: npx tsx scripts/plan.ts "ESP32 with an OLED, two buttons, temperature sensor and IMU"
import { planFromPrompt } from '../src/core/planner';
const p = planFromPrompt(process.argv[2] ?? 'ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU');
console.log(JSON.stringify({ name: p.name, summary: p.summary, spec: p.spec, notes: p.notes, parts: p.parts.map((x) => `${x.ref} ${x.id} ${x.type} @${x.x},${x.y}`), wires: p.wires.map((w) => `${w.a.part}.${w.a.pin} -> ${w.b.part}.${w.b.pin}`) }, null, 1));
for (const [f, src] of Object.entries(p.files)) if (process.argv[3] === 'all' || f === 'main.py') console.log(`==== ${f}\n${src}`);
