// The raw-REPL client against a real MicroPython (the Unix port), the same protocol a board speaks over USB.
import { describe, it, expect } from 'vitest';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RawRepl, ReplError, type ByteStream } from '../../src/board/rawrepl';
import { buildExample } from '../../src/core/examples';
import { generateSelfTest } from '../../src/core/selftest';

const MP = (() => {
  try {
    return execSync('command -v micropython', { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
})();

function board() {
  const dir = mkdtempSync(join(tmpdir(), 'mp-'));
  const p = spawn(MP, ['-i'], { cwd: dir });
  const stream: ByteStream = {
    write: async (d) => void p.stdin.write(d),
    onData: (cb) => p.stdout.on('data', (b: Buffer) => cb(new Uint8Array(b))),
  };
  return { repl: new RawRepl(stream), dir, stop: () => p.kill() };
}

describe.skipIf(!MP)('raw REPL client (real MicroPython)', { timeout: 30000 }, () => {
  it('runs code and returns its output', async () => {
    const b = board();
    await b.repl.enter();
    expect((await b.repl.exec('print(6 * 7)')).trim()).toBe('42');
    const info = await b.repl.info();
    expect(info.version).toMatch(/^micropython 1\./);
    b.stop();
  });

  it('streams output while a long program runs', async () => {
    const b = board();
    await b.repl.enter();
    const seen: string[] = [];
    const out = await b.repl.exec('import time\nfor i in range(3):\n    print("tick", i)\n    time.sleep(0.05)', { onOutput: (t) => seen.push(t) });
    expect(out).toMatch(/tick 0[\s\S]*tick 2/);
    expect(seen.join('')).toContain('tick 1');
    b.stop();
  });

  it('writes files of any content and reads them back', async () => {
    const b = board();
    await b.repl.enter();
    const content = 'print("héllo \\"quoted\\" \\\\ back")\n' + 'x = 1\n'.repeat(400);
    await b.repl.writeFile('main.py', content);
    expect(await b.repl.readFile('main.py')).toBe(content);
    b.stop();
  });

  it('reports the board traceback on errors', async () => {
    const b = board();
    await b.repl.enter();
    await expect(b.repl.exec('1/0')).rejects.toThrow(/ZeroDivisionError/);
    expect((await b.repl.exec('print("still alive")')).trim()).toBe('still alive');
    b.stop();
  });

  it('uploads a generated self-test and it parses on real MicroPython', async () => {
    const b = board();
    await b.repl.enter();
    const code = generateSelfTest(buildExample('pico-traffic-light'))!;
    await b.repl.writeFile('selftest.py', code);
    // The Unix port has no machine.Pin, so it can't run the test — but it must compile.
    const out = await b.repl.exec("src = open('selftest.py').read()\ncompile(src, 'selftest.py', 'exec')\nprint('compiled', len(src))");
    expect(out).toMatch(/compiled \d+/);
    b.stop();
  });

  it('times out with a helpful message when nothing answers', async () => {
    const silent: ByteStream = { write: async () => {}, onData: () => {} };
    await expect(new RawRepl(silent).enter()).rejects.toThrow(ReplError);
  });
});
