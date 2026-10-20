// A USB serial connection to a real board through the browser's Web Serial API (Chrome/Edge).
import type { ByteStream } from './rawrepl';

export const serialSupported = () => typeof navigator !== 'undefined' && 'serial' in navigator;

export class SerialLink implements ByteStream {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private listeners: ((d: Uint8Array) => void)[] = [];
  private reading = false;
  onClose: () => void = () => {};

  constructor(public port: SerialPort) {}

  /** Ask the user to pick the board's USB port. */
  static async request(): Promise<SerialLink> {
    const port = await (navigator as any).serial.requestPort({});
    return new SerialLink(port);
  }

  async open(baudRate = 115200) {
    await this.port.open({ baudRate });
    this.writer = this.port.writable!.getWriter();
    this.reading = true;
    this.readLoop();
  }

  private async readLoop() {
    while (this.reading && this.port.readable) {
      const reader = this.port.readable.getReader();
      this.reader = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) for (const l of this.listeners) l(value);
        }
      } catch {
        /* device unplugged or port closed */
      } finally {
        reader.releaseLock();
      }
      if (!this.reading) break;
    }
    this.onClose();
  }

  onData(cb: (d: Uint8Array) => void) {
    this.listeners.push(cb);
  }

  async write(data: Uint8Array) {
    await this.writer!.write(data);
  }

  /** Release the port (e.g. so the firmware installer can use it). */
  async close() {
    this.reading = false;
    try {
      await this.reader?.cancel();
    } catch {}
    try {
      this.writer?.releaseLock();
    } catch {}
    try {
      await this.port.close();
    } catch {}
  }
}
