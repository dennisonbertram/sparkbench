import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildEsp32FirmwareExample } from '../../src/core/firmwareExample';
import { closeEsp32Runtime, esp32Middleware } from '../../server/esp32';

const enabled = process.env.SPARKBENCH_ESP32_INTEGRATION === '1';
const cache = process.env.SPARKBENCH_CACHE ?? join(homedir(), '.cache', 'sparkbench');
const helper = process.env.SPARKBENCH_ESP32_HELPER ?? join(cache, 'esp32', 'sparkbench-esp32-helper');
const qemu = process.env.SPARKBENCH_ESP32_QEMU ?? join(cache, 'qemu', 'build', 'libqemu-xtensa.so');
const rom = process.env.SPARKBENCH_ESP32_ROM ?? join(cache, 'qemu', 'pc-bios');
const firmware = process.env.SPARKBENCH_ESP32_FIRMWARE ?? join(cache, 'esp32', 'firmware', 'esp32-gpio-blink-4mb.bin');

type Event = { type: string; id?: string; frame?: { serial: string[]; parts: Record<string, { led?: number }> } };
type Stream = { reader: ReadableStreamDefaultReader<Uint8Array>; events: Event[]; buffer: string };

afterAll(async () => { await closeEsp32Runtime(); });

describe('native ESP32 integration', () => {
  const integrationTest = enabled ? it : it.skip;
  integrationTest('runs real firmware through the local API and electrical model', async () => {
    for (const path of [helper, qemu, firmware, join(rom, 'esp32-v3-rom.bin'), join(rom, 'esp32-v3-rom-app.bin')]) {
      expect(existsSync(path), `missing integration dependency: ${path}`).toBe(true);
    }

    const server = createServer((req, res) => {
      void esp32Middleware(req, res, () => { res.statusCode = 404; res.end(); });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test HTTP server did not bind');
    const base = `http://127.0.0.1:${address.port}`;
    const project = buildEsp32FirmwareExample();
    const sessionDirs = async () => (await readdir(tmpdir())).filter((name) => name.startsWith('sparkbench-esp32-')).sort();
    const initialDirs = await sessionDirs();
    const expectClean = async () => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && (await sessionDirs()).join() !== initialDirs.join()) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(await sessionDirs()).toEqual(initialDirs);
    };

    const openRun = async (circuit = project): Promise<Stream> => {
      const response = await fetch(`${base}/api/esp32/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project: circuit, demo: true }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/x-ndjson');
      if (!response.body) throw new Error('runtime returned no stream');
      return { reader: response.body.getReader(), events: [], buffer: '' };
    };
    const readUntil = async (stream: Stream, predicate: (events: Event[]) => boolean, label: string) => {
      const deadline = Date.now() + 30000;
      const decoder = new TextDecoder();
      const summary = () => JSON.stringify({
        errors: stream.events.filter((event) => event.type === 'error').slice(-4),
        serial: stream.events.flatMap((event) => event.frame?.serial ?? []).slice(-12),
        led: stream.events.filter((event) => event.frame).slice(-12).map((event) => event.frame?.parts.led1?.led),
      });
      while (!predicate(stream.events) && Date.now() < deadline) {
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}: ${summary()}`)), Math.max(1, deadline - Date.now()));
        });
        const next = await Promise.race([
          stream.reader.read(),
          timeout,
        ]).finally(() => { if (timer) clearTimeout(timer); });
        if (next.done) throw new Error(`runtime stream ended before ${label}: ${summary()}`);
        stream.buffer += decoder.decode(next.value, { stream: true });
        const lines = stream.buffer.split(/\r?\n/);
        stream.buffer = lines.pop() ?? '';
        for (const line of lines) if (line) stream.events.push(JSON.parse(line) as Event);
      }
      expect(predicate(stream.events), `timed out waiting for ${label}: ${summary()}`).toBe(true);
    };
    const serialText = (stream: Stream) => stream.events.flatMap((event) => event.type === 'frame' ? event.frame?.serial ?? [] : []).join('\n');
    const stop = async (id: string) => {
      const response = await fetch(`${base}/api/esp32/stop`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      expect(response.status).toBe(200);
    };
    const rejectRun = async (payload: unknown, message: RegExp) => {
      const response = await fetch(`${base}/api/esp32/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(message);
    };

    try {
      const status = await (await fetch(`${base}/api/esp32/status`)).json() as { available: boolean; demoAvailable: boolean };
      expect(status).toEqual(expect.objectContaining({ available: true, demoAvailable: true }));
      await rejectRun({ project, firmware: { name: 'app.bin', base64: 'YmFk' } }, /4 MiB/);
      await rejectRun({ project: { ...project, board: 'pico' }, demo: true }, /requires an esp32 project/);
      await expectClean();
      const demo = await openRun();
      await readUntil(demo, (events) => events.some((event) => event.type === 'session') && serialText(demo).includes('SPARKBENCH_ESP32_BOOT'), 'first firmware boot');
      const firstId = demo.events.find((event) => event.type === 'session')?.id;
      expect(firstId).toBeTruthy();
      await readUntil(demo, (events) => {
        const leds = events.flatMap((event) => event.type === 'frame' ? [event.frame?.parts.led1?.led ?? 0] : []);
        return leds.some((value) => value > 0) && leds.some((value) => value === 0) &&
          serialText(demo).includes('SPARKBENCH_BUTTON=released');
      }, 'GPIO2 blink and released-button serial state');
      expect(Math.max(...demo.events.flatMap((event) => event.type === 'frame' ? [event.frame?.parts.led1?.led ?? 0] : []))).toBeGreaterThan(0);

      const press = async (value: number) => {
        const response = await fetch(`${base}/api/esp32/input`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: firstId, part: 'button1', key: 'pressed', value }),
        });
        expect(response.status).toBe(200);
      };
      await press(1);
      await readUntil(demo, (events) => serialText(demo).includes('SPARKBENCH_BUTTON=pressed'), 'pressed-button serial state');
      await press(0);
      await readUntil(demo, (events) => serialText(demo).includes('SPARKBENCH_BUTTON=released'), 'released-button serial state');
      await stop(firstId!);
      await readUntil(demo, (events) => events.some((event) => event.type === 'done'), 'clean stop');
      await expectClean();

      const disconnected = {
        ...project,
        wires: project.wires.filter((wire) => wire.id !== 'wire-led-resistor'),
      };
      const broken = await openRun(disconnected);
      await readUntil(broken, (events) =>
        serialText(broken).includes('SPARKBENCH_ESP32_BOOT') &&
        serialText(broken).includes('SPARKBENCH_BUTTON=released') &&
        serialText(broken).includes('LED=1'),
      'restart with real firmware and a broken LED wire');
      expect(broken.events.find((event) => event.type === 'session')?.id).not.toBe(firstId);
      expect(broken.events.flatMap((event) => event.type === 'frame' ? [event.frame?.parts.led1?.led ?? 0] : []).every((value) => value === 0)).toBe(true);
      await broken.reader.cancel();
      const brokenId = broken.events.find((event) => event.type === 'session')?.id;
      if (brokenId) await stop(brokenId);
      await expectClean();

      const restarted = await openRun();
      await readUntil(restarted, (events) => serialText(restarted).includes('SPARKBENCH_ESP32_BOOT'), 'fresh boot after client abort');
      const restartedId = restarted.events.find((event) => event.type === 'session')?.id;
      expect(restartedId).not.toBe(firstId);
      await stop(restartedId!);
      await readUntil(restarted, (events) => events.some((event) => event.type === 'done'), 'stop after restart');
      await expectClean();
    } finally {
      await closeEsp32Runtime();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 180000);
});
