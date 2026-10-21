// The OTA server (ota.py) running on real MicroPython (Unix port), receiving files from otaPush.
import { describe, it, expect } from 'vitest';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { otaPy, otaToken } from '../../src/core/ota';
import { otaPush } from '../../server/ota';

const MP = (() => {
  try {
    return execSync('command -v micropython', { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
})();

describe.skipIf(!MP)('over-the-air updates (real MicroPython)', { timeout: 30000 }, () => {
  it('accepts files with the right token and restarts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ota-'));
    writeFileSync(join(dir, 'ota.py'), otaPy(otaToken('proj-1')));
    const port = 18266 + Math.floor(Math.random() * 1000);
    const mp = spawn(MP, ['-c', `import ota\nota.serve(${port})`], { cwd: dir });
    let out = '';
    mp.stdout.on('data', (d) => (out += d));
    for (let i = 0; i < 50 && !out.includes('OTA ready'); i++) await new Promise((r) => setTimeout(r, 100));
    expect(out).toContain('OTA ready');
    const log = await otaPush('127.0.0.1', 'proj-1', { 'main.py': 'print("v2")\n' + 'x = 1\n'.repeat(500) }, port);
    expect(log.join(' ')).toMatch(/saved main\.py/);
    expect(readFileSync(join(dir, 'main.py'), 'utf8')).toContain('print("v2")');
    await new Promise((r) => setTimeout(r, 200));
    mp.kill();
  });

  it('refuses a different project’s token', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ota-'));
    writeFileSync(join(dir, 'ota.py'), otaPy(otaToken('proj-A')));
    const port = 19366 + Math.floor(Math.random() * 1000);
    const mp = spawn(MP, ['-c', `import ota\nota.serve(${port})`], { cwd: dir });
    let out = '';
    mp.stdout.on('data', (d) => (out += d));
    for (let i = 0; i < 50 && !out.includes('OTA ready'); i++) await new Promise((r) => setTimeout(r, 100));
    await expect(otaPush('127.0.0.1', 'proj-B', { 'main.py': 'print(1)' }, port)).rejects.toThrow(/different project/);
    expect(existsSync(join(dir, 'main.py'))).toBe(false);
    mp.kill();
  });
});
