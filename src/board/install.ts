// Installing MicroPython from the browser: esptool-js for the ESP32 (over Web Serial), and for the
// Pico writing the UF2 file onto its RPI-RP2 drive (File System Access API).

export async function fetchFirmware(board: 'esp32' | 'pico'): Promise<{ name: string; data: Uint8Array }> {
  const r = await fetch(`/api/firmware?board=${board}`);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Could not download MicroPython');
  return { name: r.headers.get('X-Firmware-Name') ?? 'firmware', data: new Uint8Array(await r.arrayBuffer()) };
}

/** Erase the ESP32 and write MicroPython at 0x1000. `port` must not be open. */
export async function installEsp32(port: SerialPort, log: (s: string) => void, progress: (pct: number) => void): Promise<void> {
  const fw = await fetchFirmware('esp32');
  log(`Downloaded ${fw.name} (${Math.round(fw.data.length / 1024)} KB).`);
  const { ESPLoader, Transport } = await import('esptool-js');
  const transport = new Transport(port, false);
  const terminal = { clean() {}, writeLine: (s: string) => log(s), write: (s: string) => log(s) };
  const loader = new ESPLoader({ transport, baudrate: 460800, terminal } as any);
  try {
    const chip = await loader.main();
    log(`Connected to ${chip}. Erasing (about 10 s)…`);
    await loader.eraseFlash();
    log('Writing MicroPython…');
    await loader.writeFlash({
      fileArray: [{ data: fw.data, address: 0x1000 }],
      flashMode: 'keep',
      flashFreq: 'keep',
      flashSize: 'keep',
      eraseAll: false,
      compress: true,
      reportProgress: (_i: number, written: number, total: number) => progress(Math.round((written / total) * 100)),
    } as any);
    await loader.after('hard_reset' as any);
    log('Done. The board restarted with MicroPython.');
  } finally {
    await transport.disconnect().catch(() => {});
  }
}

/** Write the Pico UF2 onto the RPI-RP2 drive the user picks. */
export async function installPico(log: (s: string) => void): Promise<void> {
  const picker = (window as any).showDirectoryPicker;
  if (!picker) throw new Error('This browser cannot write to the Pico drive. Download the .uf2 and drag it onto the RPI-RP2 drive instead.');
  const fw = await fetchFirmware('pico');
  log(`Downloaded ${fw.name}. Now choose the RPI-RP2 drive…`);
  const dir = await picker({ mode: 'readwrite' });
  const names: string[] = [];
  for await (const [n] of dir.entries()) names.push(n);
  if (!names.includes('INFO_UF2.TXT')) throw new Error('That folder is not the Pico drive (no INFO_UF2.TXT). Hold BOOTSEL while plugging the Pico in, then choose the RPI-RP2 drive.');
  const file = await dir.getFileHandle(fw.name, { create: true });
  const w = await file.createWritable();
  await w.write(fw.data);
  await w.close();
  log('Copied. The Pico restarts with MicroPython and the drive disappears; that is normal.');
}
