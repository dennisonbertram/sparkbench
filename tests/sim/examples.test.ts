import { describe, it, expect } from 'vitest';
import { EXAMPLES, buildExample } from '../../src/core/examples';
import { simulate } from '../../src/sim/node-runner';

describe('every example project builds and simulates without errors', () => {
  for (const ex of EXAMPLES) {
    it(ex.id, async () => {
      const p = buildExample(ex.id);
      expect(p.parts.length).toBeGreaterThan(1);
      const { engine, final } = await simulate(p, { untilMs: 3000 });
      if (engine.error) console.log(ex.id, engine.error.raw, '\n', p.files['main.py']);
      expect(engine.error).toBeUndefined();
      const errs = engine.allWarnings.filter((w) => w.severity === 'error');
      if (errs.length) console.log(ex.id, errs);
      expect(errs).toEqual([]);
      expect(final.status).toBe('stopped');
      console.log(`${ex.id}: ${p.name} | ${p.summary}\n  serial: ${engine.serialAll.slice(-2).join(' / ')}\n  warnings: ${engine.allWarnings.map((w) => w.text).join(' | ')}`);
    }, 30000);
  }
});
