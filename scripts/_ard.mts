import { buildExample } from '../src/core/examples';
import { aiArduino } from '../server/arduino';
for (const id of process.argv.slice(2)) {
  const t0 = Date.now();
  const r = await aiArduino(buildExample(id));
  console.log(id, r.ok ? 'OK' : 'FAILED', r.target, r.size, `${Math.round((Date.now() - t0) / 1000)}s`, '\n  ', r.log.join('\n   '), '\n   notes:', r.notes);
  console.log(Object.values(r.files)[0].split('\n').slice(0, 14).join('\n'));
}
