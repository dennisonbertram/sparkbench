import { createServer, request as httpRequest } from 'node:http';
import { describe, expect, it } from 'vitest';
import { buildEsp32FirmwareExample } from '../../src/core/firmwareExample';
import { ElectricalModel } from '../../src/core/circuit';
import { applyEsp32Inputs, Esp32CircuitBridge } from '../../server/esp32Circuit';
import { esp32Middleware, validateEsp32Firmware, validateEsp32Project } from '../../server/esp32';

function image(): Buffer {
  const b = Buffer.alloc(4 * 1024 * 1024);
  b.fill(0xff, 0x8000, 0x9000);
  for (const offset of [0x1000, 0x10000]) {
    b[offset] = 0xe9;
    b[offset + 1] = 1;
    b.writeUInt16LE(0, offset + 12);
    b.writeUInt32LE(0x3ffb0000, offset + 24);
    b.writeUInt32LE(4, offset + 28);
    b.set([1, 2, 3, 4], offset + 32);
  }
  b.writeUInt16LE(0x50aa, 0x8000);
  b[0x8002] = 0;
  b[0x8003] = 0;
  b.writeUInt32LE(0x10000, 0x8004);
  b.writeUInt32LE(0x100000, 0x8008);
  return b;
}

describe('native ESP32 firmware contract', () => {
  it('builds the deterministic LED/button circuit', () => {
    const project = buildEsp32FirmwareExample();
    expect(project.board).toBe('esp32');
    expect(project.parts.map((p) => p.id)).toEqual(['board1', 'resistor1', 'led1', 'resistor2', 'button1']);
    expect(project.parts.find((p) => p.id === 'resistor2')?.props.ohms).toBe(10000);
    expect(project.files['main.py']).not.toMatch(/executes|runs Python/i);
    expect(() => validateEsp32Project(project)).not.toThrow();
  });

  it('requires merged classic ESP32 images', () => {
    expect(() => validateEsp32Firmware(image())).not.toThrow();
    const wrongChip = image(); wrongChip.writeUInt16LE(0x1000, 0x1000 + 12);
    expect(() => validateEsp32Firmware(wrongChip)).toThrow(/classic ESP32/);
    const badPartition = image(); badPartition.writeUInt16LE(0, 0x8000);
    expect(() => validateEsp32Firmware(badPartition)).toThrow(/partition table/);
    const badSegments = image(); badSegments[0x1000 + 1] = 17;
    expect(() => validateEsp32Firmware(badSegments)).toThrow(/segment count/);
    const badAppSegments = image(); badAppSegments[0x10000 + 1] = 0;
    expect(() => validateEsp32Firmware(badAppSegments)).toThrow(/segment count/);
    const badSegmentLength = image(); badSegmentLength.writeUInt32LE(0xffffffff, 0x10000 + 28);
    expect(() => validateEsp32Firmware(badSegmentLength)).toThrow(/segment length/);
    const appOnly = Buffer.alloc(4 * 1024 * 1024); appOnly[0x10000] = 0xe9;
    expect(() => validateEsp32Firmware(appOnly)).toThrow(/bootloader/);
    expect(() => validateEsp32Firmware(Buffer.alloc(1024))).toThrow(/4 MiB/);
  });

  it('rejects unsupported circuit parts', () => {
    const project = buildEsp32FirmwareExample();
    project.parts.push({ id: 'sensor1', type: 'dht22', props: {}, x: 0, y: 0 });
    expect(() => validateEsp32Project(project)).toThrow(/supports only/);
  });

  it('maps wired GPIO18/19 and never feeds output GPIOs back as inputs', () => {
    const project = buildEsp32FirmwareExample();
    for (const wire of project.wires) {
      for (const ref of [wire.a, wire.b]) {
        if (ref.part === 'board1' && ref.pin === 'D2') ref.pin = 'D18';
        if (ref.part === 'board1' && ref.pin === 'D4') ref.pin = 'D19';
      }
    }
    const model = new ElectricalModel(project);
    const bridge = new Esp32CircuitBridge(project, model);
    expect(bridge.wiredGpios).toEqual([18, 19]);
    bridge.setDirection(18, true);
    bridge.setOutput(18, 1);
    model.solve();
    expect(model.ledCurrentMa('led1')).toBeGreaterThan(0);
    let inputs = bridge.syncInputs();
    expect(inputs.mask & (1 << 18)).toBe(0);
    expect(inputs.mask & (1 << 19)).toBeTruthy();
    expect(inputs.values & (1 << 19)).toBeTruthy();
    model.setPartState('button1', 'pressed', 1);
    inputs = bridge.syncInputs();
    expect(inputs.values & (1 << 19)).toBe(0);
    bridge.setDirection(18, false);
    inputs = bridge.syncInputs();
    expect(inputs.mask & (1 << 18)).toBeTruthy();
  });

  it('applies browser-format initial controls and rejects invalid wired GPIOs and controls', () => {
    const project = buildEsp32FirmwareExample();
    const model = new ElectricalModel(project);
    applyEsp32Inputs(project, model, { 'button1.pressed': 1 });
    const bridge = new Esp32CircuitBridge(project, model);
    expect(bridge.syncInputs().values & (1 << 4)).toBe(0);
    expect(() => applyEsp32Inputs(project, model, { button1: 1 })).toThrow(/invalid input control/);
    expect(() => applyEsp32Inputs(project, model, { 'button1.pressed': 2 })).toThrow(/invalid input/);
    expect(() => validateEsp32Project({ ...project, wires: project.wires.map((wire, i) => i === 0
      ? { ...wire, a: { part: 'board1', pin: 'D34' } }
      : wire) })).toThrow(/GPIO34/);
    expect(() => validateEsp32Project({ ...project, wires: project.wires.map((wire, i) => i === 0
      ? { ...wire, a: { part: 'board1', pin: 'NO_SUCH_PIN' } }
      : wire) })).toThrow(/unknown pin/);
    expect(() => validateEsp32Project({ ...project, parts: [...project.parts, { ...project.parts[1] }] })).toThrow(/unique/);
    expect(() => validateEsp32Project({ ...project, parts: project.parts.map((part) =>
      part.id === 'resistor1' ? { ...part, props: { ...part.props, ohms: 0 } } : part) })).toThrow(/resistance/);
  });

  it('rejects foreign Host and Origin headers and non-JSON mutations', async () => {
    const server = createServer((req, res) => {
      void esp32Middleware(req, res, () => { res.statusCode = 404; res.end(); });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test HTTP server did not bind');
    const send = (path: string, headers: Record<string, string>, body?: string) => new Promise<number>((resolve, reject) => {
      const request = httpRequest({
        hostname: '127.0.0.1',
        port: address.port,
        path,
        method: body === undefined ? 'GET' : 'POST',
        headers,
      }, (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode ?? 0));
      });
      request.on('error', reject);
      request.end(body);
    });
    try {
      const foreignHost = await send('/api/esp32/status', { Host: 'attacker.example' });
      expect(foreignHost).toBe(403);
      const foreignOrigin = await send('/api/esp32/status', {
        Host: `127.0.0.1:${address.port}`,
        Origin: 'http://attacker.example',
      });
      expect(foreignOrigin).toBe(403);
      const missingJson = await send('/api/esp32/run', {
        Host: `127.0.0.1:${address.port}`,
        'Content-Length': '2',
      }, '{}');
      expect(missingJson).toBe(415);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
