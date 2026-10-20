// MicroPython "raw REPL" over any byte stream (Web Serial in the browser, a child process in tests).
// This is the same protocol mpremote uses: Ctrl-A enters raw mode, code + Ctrl-D runs it, the board
// answers "OK", then stdout, \x04, stderr, \x04, ">".

export interface ByteStream {
  write(data: Uint8Array): Promise<void>;
  /** Called with every chunk the board sends. */
  onData(cb: (chunk: Uint8Array) => void): void;
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ReplError extends Error {}

export class RawRepl {
  private buf = '';
  private waiters: (() => void)[] = [];
  /** Everything the board printed outside raw-mode exchanges (for the serial monitor). */
  onText: (text: string) => void = () => {};
  private capturing = false;

  constructor(private stream: ByteStream) {
    stream.onData((chunk) => {
      const text = dec.decode(chunk, { stream: true });
      this.buf += text;
      if (!this.capturing) this.onText(text);
      for (const w of this.waiters.splice(0)) w();
    });
  }

  private async send(s: string | Uint8Array) {
    await this.stream.write(typeof s === 'string' ? enc.encode(s) : s);
  }

  /** Wait until the buffer contains `marker`; return and consume everything up to and including it. */
  private async until(marker: string, timeoutMs: number, onProgress?: (text: string) => void): Promise<string> {
    const t0 = Date.now();
    let seen = 0;
    for (;;) {
      const i = this.buf.indexOf(marker);
      if (onProgress && this.buf.length > seen) {
        const end = i >= 0 ? i : this.buf.length;
        if (end > seen) onProgress(this.buf.slice(seen, end));
        seen = end;
      }
      if (i >= 0) {
        const out = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + marker.length);
        return out;
      }
      if (Date.now() - t0 > timeoutMs) throw new ReplError(`The board did not answer (waited for ${JSON.stringify(marker)}). Is MicroPython installed, and is nothing else using the port?`);
      await new Promise<void>((r) => {
        this.waiters.push(r);
        setTimeout(r, 50);
      });
    }
  }

  /** Stop whatever is running and enter raw mode. */
  async enter() {
    this.capturing = true;
    await this.send('\r\x03\x03');
    await sleep(100);
    this.buf = '';
    await this.send('\x01');
    await this.until('raw REPL; CTRL-B to exit\r\n>', 3000);
  }

  /** Run code in raw mode; stream stdout as it arrives. Throws with the board's traceback on error. */
  async exec(code: string, opts: { timeoutMs?: number; onOutput?: (text: string) => void } = {}): Promise<string> {
    const bytes = enc.encode(code);
    for (let i = 0; i < bytes.length; i += 256) {
      await this.send(bytes.slice(i, i + 256));
      await sleep(5);
    }
    await this.send('\x04');
    const ok = await this.until('OK', 3000);
    if (ok.trim()) throw new ReplError(`Unexpected reply from the board: ${ok.trim().slice(0, 200)}`);
    const out = await this.until('\x04', opts.timeoutMs ?? 10000, opts.onOutput);
    const err = await this.until('\x04', 3000);
    await this.until('>', 3000);
    if (err.trim()) throw new ReplError(err.trim());
    return out;
  }

  /** Leave raw mode back to the normal REPL. */
  async exit() {
    await this.send('\x02');
    this.capturing = false;
  }

  /** Soft reset from the friendly REPL: the board runs main.py again. */
  async softReset() {
    this.capturing = false;
    await this.send('\x04');
  }

  /** Write a file on the board (base64 in chunks, so any content is safe). */
  async writeFile(path: string, content: string | Uint8Array, onProgress?: (done: number, total: number) => void) {
    const data = typeof content === 'string' ? enc.encode(content) : content;
    await this.exec(`import binascii\nf = open(${JSON.stringify(path)}, 'wb')\nw = f.write`);
    const CH = 512;
    for (let i = 0; i < data.length; i += CH) {
      const b64 = btoa(String.fromCharCode(...data.slice(i, i + CH)));
      await this.exec(`w(binascii.a2b_base64(${JSON.stringify(b64)}))`);
      onProgress?.(Math.min(i + CH, data.length), data.length);
    }
    await this.exec('f.close()');
  }

  async readFile(path: string): Promise<string> {
    return this.exec(`with open(${JSON.stringify(path)}) as f:\n    print(f.read(), end='')`);
  }

  /** "MicroPython v1.24.1 on 2024-11-29; ESP32 module with ESP32" etc. */
  async info(): Promise<{ version: string; machine: string; platform: string }> {
    const out = await this.exec("import sys, os\nun = getattr(os, 'uname', None)\nprint(sys.implementation.name + ' ' + '.'.join(str(x) for x in sys.implementation.version[:3]))\nprint(getattr(un(), 'machine', '') if un else getattr(sys.implementation, '_machine', ''))\nprint(sys.platform)");
    const [version, machine, platform] = out.trim().split(/\r?\n/);
    return { version: version ?? '', machine: machine ?? '', platform: platform ?? '' };
  }
}
