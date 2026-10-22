import { describe, expect, it } from 'vitest';
import { buildEsp32FirmwareExample } from '../../src/core/firmwareExample';
import { validateEsp32Firmware, validateEsp32Project } from '../../server/esp32';

function image(): Buffer {
  const b = Buffer.alloc(4 * 1024 * 1024);
  for (const offset of [0x1000, 0x10000]) {
    b[offset] = 0xe9;
    b[offset + 1] = 2;
    b.writeUInt16LE(0, offset + 12);
  }
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
    const appOnly = Buffer.alloc(4 * 1024 * 1024); appOnly[0x10000] = 0xe9;
    expect(() => validateEsp32Firmware(appOnly)).toThrow(/bootloader/);
    expect(() => validateEsp32Firmware(Buffer.alloc(1024))).toThrow(/4 MiB/);
  });

  it('rejects unsupported circuit parts', () => {
    const project = buildEsp32FirmwareExample();
    project.parts.push({ id: 'sensor1', type: 'dht22', props: {}, x: 0, y: 0 });
    expect(() => validateEsp32Project(project)).toThrow(/supports only/);
  });
});
