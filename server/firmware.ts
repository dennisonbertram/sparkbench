// Official MicroPython firmware for browser installs, fetched from micropython.org (latest stable)
// and cached locally. The browser can't download it directly (no CORS on micropython.org).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BOARDS = { esp32: { page: 'ESP32_GENERIC', ext: 'bin' }, pico: { page: 'RPI_PICO', ext: 'uf2' } } as const;
const CACHE = join(homedir(), '.cache/sparkbench/firmware');

export async function latestFirmware(board: 'esp32' | 'pico'): Promise<{ name: string; data: Buffer }> {
  const b = BOARDS[board];
  mkdirSync(CACHE, { recursive: true });
  const page = await fetch(`https://micropython.org/download/${b.page}/`).then((r) => r.text());
  const re = new RegExp(`/resources/firmware/(${b.page}-\\d{8}-v\\d+\\.\\d+\\.\\d+\\.${b.ext})`);
  const m = re.exec(page);
  if (!m) throw new Error(`Couldn't find the latest ${b.page} firmware on micropython.org.`);
  const file = join(CACHE, m[1]);
  if (!existsSync(file)) {
    const r = await fetch(`https://micropython.org/resources/firmware/${m[1]}`);
    if (!r.ok) throw new Error(`Download failed (${r.status}).`);
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  return { name: m[1], data: readFileSync(file) };
}
