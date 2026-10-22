import type { Project } from '../core/types';
import type { SimFrame } from '../sim/engine';

export interface FirmwareHandlers {
  frame(frame: SimFrame): void;
  artifact(artifact: { name: string; sha256: string }): void;
  error(message: string): void;
  done(): void;
}

export class FirmwareClient {
  private controller = new AbortController();
  private id?: string;
  private stopped = false;
  private queue = Promise.resolve();
  private pending: { part: string; key: string; value: number }[] = [];

  constructor(private handlers: FirmwareHandlers) {}

  async start(project: Project, firmware: { name: string; base64: string } | 'demo', inputs: Record<string, number>) {
    try {
      const response = await fetch('/api/esp32/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: this.controller.signal,
        body: JSON.stringify({ project, inputs, ...(firmware === 'demo' ? { demo: true } : { firmware }) }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? `Firmware runtime returned HTTP ${response.status}`);
      }
      if (!response.body) throw new Error('This browser cannot stream the firmware runtime.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;
      try {
        while (!this.stopped && !done) {
          const chunk = await reader.read();
          buffer += decoder.decode(chunk.value, { stream: !chunk.done });
          if (buffer.length > 2_000_000) throw new Error('Firmware runtime sent an oversized message.');
          let newline: number;
          while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            if (!line.trim() || this.stopped) continue;
            const event = JSON.parse(line);
            if (event.type === 'session') {
              this.id = event.id;
              this.handlers.artifact(event.artifact);
              for (const input of this.pending.splice(0)) this.input(input.part, input.key, input.value);
            } else if (event.type === 'frame') this.handlers.frame(event.frame);
            else if (event.type === 'error') throw new Error(event.message);
            else if (event.type === 'done') { done = true; break; }
          }
          if (chunk.done) break;
        }
        if (!done && !this.stopped) throw new Error('The firmware runtime disconnected unexpectedly.');
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    } catch (error) {
      if (!this.stopped) this.handlers.error(error instanceof Error ? error.message : String(error));
    } finally {
      const notify = !this.stopped;
      this.stop();
      if (notify) this.handlers.done();
    }
  }

  input(part: string, key: string, value: number) {
    if (this.stopped) return;
    if (!this.id) {
      if (this.pending.length >= 100) this.pending.shift();
      this.pending.push({ part, key, value });
      return;
    }
    this.queue = this.queue.then(async () => {
      if (this.stopped) return;
      const response = await fetch('/api/esp32/input', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: this.controller.signal,
        body: JSON.stringify({ id: this.id, part, key, value }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? 'Could not send input to the ESP32.');
      }
    }).catch((error) => {
      if (this.stopped) return;
      this.handlers.error(error instanceof Error ? error.message : String(error));
      this.stop();
      this.handlers.done();
    });
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.pending = [];
    this.controller.abort();
    if (this.id) {
      void fetch('/api/esp32/stop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ id: this.id }),
      }).catch(() => {});
    }
  }
}
