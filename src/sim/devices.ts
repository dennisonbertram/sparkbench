// Register-level models of I2C peripherals. They receive exactly the bytes the real
// MicroPython / Python drivers put on the bus, so driver bugs show up in simulation too.
import type { I2CMeasure, ResponseSegment } from '../core/customParts';

export interface I2CDevice {
  addr: number;
  partId: string;
  write(bytes: number[]): void;
  read(n: number): number[];
}

const CMD_ARGS: Record<number, number> = { 0x20: 1, 0x21: 2, 0x22: 2, 0x81: 1, 0xa8: 1, 0xd3: 1, 0xda: 1, 0xd5: 1, 0xd9: 1, 0xdb: 1, 0x8d: 1, 0xad: 1 };

export class SSD1306Device implements I2CDevice {
  addr = 0x3c;
  ram: Uint8Array;
  /** SH1106-style controllers have 132 RAM columns with the visible 128 starting at column 2. */
  ramWidth = 128;
  colOffset = 0;
  rows = 64;
  on = false;
  invert = false;
  contrast = 255;
  col0 = 0;
  col1 = 127;
  page0 = 0;
  page1 = 7;
  col = 0;
  page = 0;
  private pending: number[] = [];
  private pendingCmd = -1;
  dirty = true;
  frames = 0;
  constructor(public partId: string, opts: { addr?: number; controller?: 'ssd1306' | 'sh1106'; rows?: 32 | 64 } = {}) {
    if (opts.addr !== undefined) this.addr = opts.addr;
    if (opts.controller === 'sh1106') {
      this.ramWidth = 132;
      this.colOffset = 2;
    }
    if (opts.rows) this.rows = opts.rows;
    this.ram = new Uint8Array(this.ramWidth * 8);
    this.col1 = this.ramWidth - 1;
  }

  write(bytes: number[]) {
    let i = 0;
    while (i < bytes.length) {
      const ctrl = bytes[i++];
      const co = (ctrl & 0x80) !== 0;
      const dc = (ctrl & 0x40) !== 0;
      if (co) {
        // single byte follows, then another control byte
        if (i < bytes.length) {
          const b = bytes[i++];
          dc ? this.data(b) : this.command(b);
        }
      } else {
        // rest of the transaction is all commands or all data
        while (i < bytes.length) {
          const b = bytes[i++];
          dc ? this.data(b) : this.command(b);
        }
      }
    }
    if (bytes.length > 2 && (bytes[0] & 0x40)) this.frames++;
  }
  read(n: number) {
    return new Array(n).fill(this.on ? 0x03 : 0x43);
  }
  private command(b: number) {
    if (this.pendingCmd >= 0) {
      this.pending.push(b);
      if (this.pending.length >= CMD_ARGS[this.pendingCmd]) {
        this.exec(this.pendingCmd, this.pending);
        this.pendingCmd = -1;
        this.pending = [];
      }
      return;
    }
    if (CMD_ARGS[b] !== undefined) {
      this.pendingCmd = b;
      this.pending = [];
      return;
    }
    this.exec(b, []);
  }
  private exec(cmd: number, args: number[]) {
    switch (cmd) {
      case 0xae:
        this.on = false;
        break;
      case 0xaf:
        this.on = true;
        break;
      case 0xa6:
        this.invert = false;
        break;
      case 0xa7:
        this.invert = true;
        break;
      case 0x81:
        this.contrast = args[0];
        break;
      case 0x21:
        this.col0 = args[0] % this.ramWidth;
        this.col1 = args[1] % this.ramWidth;
        this.col = this.col0;
        break;
      case 0x22:
        this.page0 = args[0] & 7;
        this.page1 = args[1] & 7;
        this.page = this.page0;
        break;
      default:
        if (cmd >= 0xb0 && cmd <= 0xb7) this.page = cmd & 7; // page addressing mode
        else if (cmd < 0x10) this.col = (this.col & 0xf0) | cmd;
        else if (cmd < 0x20) this.col = (this.col & 0x0f) | ((cmd & 0x0f) << 4);
    }
    this.dirty = true;
  }
  private data(b: number) {
    this.ram[this.page * this.ramWidth + (this.col % this.ramWidth)] = b;
    this.col++;
    if (this.col > this.col1) {
      this.col = this.col0;
      this.page++;
      if (this.page > this.page1) this.page = this.page0;
    }
    this.dirty = true;
  }
  /** The visible picture as 128×64 page-format bytes (what the frame and the screen reader use). */
  visibleRam(): number[] {
    const out = new Array(1024).fill(0);
    for (let page = 0; page < this.rows / 8; page++) for (let x = 0; x < 128; x++) out[page * 128 + x] = this.ram[page * this.ramWidth + x + this.colOffset];
    return out;
  }
  /** 128×64 pixel bitmap, one byte per pixel (0/1). */
  pixels(): Uint8Array {
    const out = new Uint8Array(128 * 64);
    if (!this.on) return out;
    const vis = this.visibleRam();
    for (let page = 0; page < 8; page++)
      for (let x = 0; x < 128; x++) {
        const b = vis[page * 128 + x];
        for (let bit = 0; bit < 8; bit++) out[(page * 8 + bit) * 128 + x] = ((b >> bit) & 1) ^ (this.invert ? 1 : 0);
      }
    return out;
  }
  /** Text-ish dump for tests: rows of '#'/'.'. */
  ascii(scaleX = 2, scaleY = 4): string {
    const px = this.pixels();
    const rows: string[] = [];
    for (let y = 0; y < 64; y += scaleY) {
      let r = '';
      for (let x = 0; x < 128; x += scaleX) {
        let on = 0;
        for (let dy = 0; dy < scaleY; dy++) for (let dx = 0; dx < scaleX; dx++) on |= px[(y + dy) * 128 + x + dx];
        r += on ? '#' : '.';
      }
      rows.push(r);
    }
    return rows.join('\n');
  }
}

export interface ImuInputs {
  tiltX: number; // roll, degrees
  tiltY: number; // pitch, degrees
  rotZ: number; // deg/s
  shake: number; // 0/1
  walking?: number; // 0/1: periodic up/down steps at ~1.8 Hz
}

export class MPU6050Device implements I2CDevice {
  addr = 0x68;
  regs = new Uint8Array(128);
  ptr = 0;
  private prev = { x: 0, y: 0, t: 0 };
  constructor(public partId: string, public inputs: () => ImuInputs, public now: () => number, ad0High = false) {
    if (ad0High) this.addr = 0x69;
    this.regs[0x6b] = 0x40; // powers up asleep
    this.regs[0x75] = 0x68;
  }
  write(bytes: number[]) {
    if (!bytes.length) return;
    this.ptr = bytes[0] & 0x7f;
    for (let i = 1; i < bytes.length; i++) {
      const r = (this.ptr + i - 1) & 0x7f;
      if (r === 0x6b && bytes[i] & 0x80) {
        this.regs.fill(0);
        this.regs[0x6b] = 0x40;
        this.regs[0x75] = 0x68;
      } else this.regs[r] = bytes[i];
    }
    if (bytes.length > 1) this.ptr = (this.ptr + bytes.length - 1) & 0x7f;
  }
  private refresh() {
    const asleep = (this.regs[0x6b] & 0x40) !== 0;
    const inp = this.inputs();
    const rad = Math.PI / 180;
    const roll = inp.tiltX * rad;
    const pitch = inp.tiltY * rad;
    let ax = -Math.sin(pitch);
    let ay = Math.sin(roll) * Math.cos(pitch);
    let az = Math.cos(roll) * Math.cos(pitch);
    const t = this.now();
    if (inp.shake) {
      const ph = t / 37000;
      ax += 1.6 * Math.sin(ph * 7.1);
      ay += 1.4 * Math.cos(ph * 5.3);
      az += 1.2 * Math.sin(ph * 3.7);
    }
    if (inp.walking) {
      // Each step: a sharp vertical bump plus a little forward sway.
      const ph = (t / 1e6) * 1.8 * 2 * Math.PI;
      az += 0.55 * Math.max(0, Math.sin(ph)) ** 3 - 0.12;
      ax += 0.12 * Math.sin(ph / 2);
    }
    // tiny sensor noise so values look alive
    const n = () => (Math.random() - 0.5) * 0.004;
    const dt = Math.max(1e-3, (t - this.prev.t) / 1e6);
    const gx = (inp.tiltX - this.prev.x) / dt;
    const gy = (inp.tiltY - this.prev.y) / dt;
    this.prev = { x: inp.tiltX, y: inp.tiltY, t };
    const afs = [16384, 8192, 4096, 2048][(this.regs[0x1c] >> 3) & 3];
    const gfs = [131, 65.5, 32.8, 16.4][(this.regs[0x1b] >> 3) & 3];
    const put = (reg: number, v: number) => {
      let iv = Math.round(asleep ? 0 : v);
      iv = Math.max(-32768, Math.min(32767, iv));
      const u = iv & 0xffff;
      this.regs[reg] = u >> 8;
      this.regs[reg + 1] = u & 0xff;
    };
    put(0x3b, (ax + n()) * afs);
    put(0x3d, (ay + n()) * afs);
    put(0x3f, (az + n()) * afs);
    put(0x41, (24.5 - 36.53) * 340);
    put(0x43, (Math.abs(gx) < 2000 ? gx : 0) * gfs);
    put(0x45, (Math.abs(gy) < 2000 ? gy : 0) * gfs);
    put(0x47, inp.rotZ * gfs);
  }
  read(n: number) {
    if (this.ptr >= 0x3b && this.ptr <= 0x48) this.refresh();
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(this.regs[(this.ptr + i) & 0x7f]);
    this.ptr = (this.ptr + n) & 0x7f;
    return out;
  }
}

/** HD44780 16×2 behind a PCF8574 backpack (P0=RS, P1=RW, P2=E, P3=backlight, P4–P7=D4–D7). */
export class Lcd1602Device implements I2CDevice {
  addr = 0x27;
  ddram = new Uint8Array(128).fill(0x20);
  addrPtr = 0;
  displayOn = false;
  cursor = false;
  blink = false;
  backlight = false;
  private port = 0;
  private eightBit = true;
  private cgMode = false;
  cgram = new Uint8Array(64);
  private cgAddr = 0;
  private hiNibble: number | null = null;
  dirty = true;
  constructor(public partId: string) {}
  write(bytes: number[]) {
    for (const b of bytes) {
      const prevE = this.port & 0x04;
      this.port = b;
      this.backlight = (b & 0x08) !== 0;
      if (prevE && !(b & 0x04)) this.latch((b >> 4) & 0x0f, (b & 0x01) !== 0);
    }
    this.dirty = true;
  }
  read(n: number) {
    return new Array(n).fill(this.port);
  }
  private latch(nib: number, rs: boolean) {
    if (this.eightBit) {
      const cmd = nib << 4;
      if (!rs) this.exec(cmd);
      return;
    }
    if (this.hiNibble === null) {
      this.hiNibble = nib;
      return;
    }
    const v = (this.hiNibble << 4) | nib;
    this.hiNibble = null;
    if (rs) this.putc(v);
    else this.exec(v);
  }
  private exec(cmd: number) {
    if (cmd & 0x80) {
      this.addrPtr = cmd & 0x7f;
      this.cgMode = false;
    } else if (cmd & 0x40) {
      this.cgMode = true;
      this.cgAddr = cmd & 0x3f;
    } else if (cmd & 0x20) {
      this.eightBit = (cmd & 0x10) !== 0;
      this.hiNibble = null;
    } else if (cmd & 0x10) {
      // cursor/display shift: ignored
    } else if (cmd & 0x08) {
      this.displayOn = (cmd & 0x04) !== 0;
      this.cursor = (cmd & 0x02) !== 0;
      this.blink = (cmd & 0x01) !== 0;
    } else if (cmd & 0x04) {
      // entry mode: assume increment
    } else if (cmd & 0x02) {
      this.addrPtr = 0;
    } else if (cmd & 0x01) {
      this.ddram.fill(0x20);
      this.addrPtr = 0;
    }
  }
  private putc(v: number) {
    if (this.cgMode) {
      this.cgram[this.cgAddr] = v;
      this.cgAddr = (this.cgAddr + 1) & 0x3f;
      return;
    }
    this.ddram[this.addrPtr & 0x7f] = v;
    this.addrPtr = (this.addrPtr + 1) & 0x7f;
  }
  lines(): [string, string] {
    if (!this.displayOn) return ['                ', '                '];
    const row = (base: number) => Array.from(this.ddram.subarray(base, base + 16), (c) => String.fromCharCode(c < 32 ? 32 : c)).join('');
    return [row(0x00), row(0x40)];
  }
  /** Raw character codes for the Wokwi element (32 bytes). */
  characters(): Uint8Array {
    const out = new Uint8Array(32);
    if (!this.displayOn) return out.fill(32);
    out.set(this.ddram.subarray(0, 16), 0);
    out.set(this.ddram.subarray(0x40, 0x50), 16);
    return out;
  }
}

/** SSD1680 e-paper controller (296×128 panel used as 128 wide × 296 tall RAM). */
export class EPaperDevice {
  ram = new Uint8Array(16 * 296).fill(0xff);
  shown = new Uint8Array(16 * 296).fill(0xff);
  busyUntil = 0;
  refreshes = 0;
  private cmd = -1;
  private args: number[] = [];
  private x = 0;
  private y = 0;
  private x0 = 0;
  private x1 = 15;
  private y0 = 0;
  private y1 = 295;
  sleeping = false;
  constructor(public partId: string, public now: () => number) {}

  reset() {
    this.busyUntil = this.now() + 5_000;
    this.sleeping = false;
    this.cmd = -1;
  }
  busy() {
    return this.now() < this.busyUntil;
  }
  write(bytes: number[], dc: number) {
    if (this.sleeping && !(dc === 0 && bytes[0] === 0x12)) return;
    if (dc === 0) {
      for (const b of bytes) this.command(b);
      return;
    }
    for (const b of bytes) this.data(b);
  }
  private command(c: number) {
    this.cmd = c;
    this.args = [];
    switch (c) {
      case 0x12: // SW reset
        this.busyUntil = this.now() + 2_000;
        this.x0 = 0;
        this.x1 = 15;
        this.y0 = 0;
        this.y1 = 295;
        break;
      case 0x20: // master activation: show RAM
        this.shown.set(this.ram);
        this.refreshes++;
        this.busyUntil = this.now() + 1_800_000;
        break;
    }
  }
  private data(b: number) {
    const a = this.args;
    switch (this.cmd) {
      case 0x24:
        if (this.x >= 0 && this.x < 16 && this.y >= 0 && this.y < 296) this.ram[this.y * 16 + this.x] = b;
        this.x++;
        if (this.x > this.x1) {
          this.x = this.x0;
          this.y++;
          if (this.y > this.y1) this.y = this.y0;
        }
        return;
      case 0x44:
        a.push(b);
        if (a.length === 2) [this.x0, this.x1] = [a[0] & 0x1f, a[1] & 0x1f];
        return;
      case 0x45:
        a.push(b);
        if (a.length === 4) [this.y0, this.y1] = [a[0] | (a[1] << 8), a[2] | (a[3] << 8)];
        return;
      case 0x4e:
        this.x = b & 0x1f;
        return;
      case 0x4f:
        a.push(b);
        this.y = a[0] | ((a[1] ?? 0) << 8);
        return;
      case 0x10:
        if (b & 1) this.sleeping = true;
        return;
    }
  }
  /** Landscape 296×128 bitmap (1 = black) of what the panel currently shows. */
  pixels(): Uint8Array {
    const out = new Uint8Array(296 * 128);
    for (let lx = 0; lx < 296; lx++)
      for (let ly = 0; ly < 128; ly++) {
        const px = 127 - ly;
        const bit = this.shown[lx * 16 + (px >> 3)] & (0x80 >> (px & 7));
        out[ly * 296 + lx] = bit ? 0 : 1;
      }
    return out;
  }
  ascii(sx = 4, sy = 8): string {
    const px = this.pixels();
    const rows: string[] = [];
    for (let y = 0; y < 128; y += sy) {
      let r = '';
      for (let x = 0; x < 296; x += sx) {
        let on = 0;
        for (let dy = 0; dy < sy; dy++) for (let dx = 0; dx < sx; dx++) on |= px[(y + dy) * 296 + x + dx];
        r += on ? '#' : '.';
      }
      rows.push(r);
    }
    return rows.join('\n');
  }
}

/** An I2C chip described by its datasheet: fixed registers plus one measured value. */
export class GenericI2CDevice implements I2CDevice {
  ptr = 0;
  /** Bytes queued by a command (see responses); reads drain these before falling back to registers. */
  reply: number[] = [];
  constructor(
    public partId: string,
    public addr: number,
    registers: Record<string, number>,
    private measures: I2CMeasure[],
    private value: (key: string) => number,
    private responses: { match: string; bytes: ResponseSegment[] }[] = [],
    private layout: { regWidth?: 8 | 16; addrWidth?: 8 | 16; autoIncrementBit7?: boolean; pointerless?: boolean; pointerlessBytes?: 1 | 2; inputBits?: { reg: string; bit: number; control: string; activeLow?: boolean }[]; rtc?: { reg: string; order: 'ds1307' | 'pcf8563' }; nowMs?: () => number } = {},
  ) {
    // Static register values; with 16-bit registers a value is the whole word (e.g. "0xFE": 0x5449).
    for (const [k, v] of Object.entries(registers)) this.setReg(Number(k), v);
  }
  private get wide() {
    return this.layout.regWidth === 16;
  }
  /** Words live at 2×address in the byte store, so 16-bit registers never overlap. */
  private setReg(addr: number, v: number) {
    if (this.wide) {
      this.store.set(addr & 0xffff, [(v >> 8) & 0xff, v & 0xff]);
    } else this.store.set(addr & 0xffff, [v & 0xff]);
  }
  private store = new Map<number, number[]>();
  /** RTC: seconds between the simulated clock's epoch and the time set on the chip. */
  private rtcOffset = Date.UTC(2026, 9, 21, 12, 0, 0) / 1000;
  private rtcFields(): number[] | null {
    const r = this.layout.rtc;
    if (!r) return null;
    const t = new Date((this.rtcOffset + Math.floor((this.layout.nowMs?.() ?? 0) / 1000)) * 1000);
    const bcd = (n: number) => ((Math.floor(n / 10) << 4) | n % 10) & 0xff;
    const dow = t.getUTCDay() || 7;
    const [s, m, h, d, mo, y] = [t.getUTCSeconds(), t.getUTCMinutes(), t.getUTCHours(), t.getUTCDate(), t.getUTCMonth() + 1, t.getUTCFullYear() % 100];
    return r.order === 'pcf8563' ? [bcd(s), bcd(m), bcd(h), bcd(d), dow % 7, bcd(mo), bcd(y)] : [bcd(s), bcd(m), bcd(h), dow, bcd(d), bcd(mo), bcd(y)];
  }
  /** Put the current time into the RTC registers. */
  private rtcMaterialize() {
    const f = this.rtcFields();
    if (f) f.forEach((v, i) => this.setReg(Number(this.layout.rtc!.reg) + i, v));
  }
  /** After a write: read the time registers back as the newly set time. */
  private rtcAdopt() {
    const r = this.layout.rtc;
    if (!r) return;
    const base = Number(r.reg);
    const g = (i: number) => this.byteAt(base + i, 0);
    const dec = (b: number, mask: number) => ((b & mask) >> 4) * 10 + (b & 0x0f);
    const [s, m, h] = [dec(g(0), 0x70), dec(g(1), 0x70), dec(g(2), 0x30)];
    const [d, mo, y] = r.order === 'pcf8563' ? [dec(g(3), 0x30), dec(g(5), 0x10), dec(g(6), 0xf0)] : [dec(g(4), 0x30), dec(g(5), 0x10), dec(g(6), 0xf0)];
    const set = Date.UTC(2000 + y, Math.max(0, mo - 1), Math.max(1, d), h, m, s) / 1000;
    this.rtcOffset = set - Math.floor((this.layout.nowMs?.() ?? 0) / 1000);
  }
  private byteAt(addr: number, i: number): number {
    const w = this.store.get(addr);
    return w?.[i] ?? 0;
  }
  write(bytes: number[]) {
    if (!bytes.length) return;
    const hit = this.responses.find((r) => {
      const m = r.match.split(' ').map((h) => parseInt(h, 16));
      return m.length <= bytes.length && m.every((b, i) => b === bytes[i]);
    });
    if (hit) {
      this.reply = packResponse(hit.bytes, this.value);
      return;
    }
    this.reply = [];
    if (this.layout.pointerless) {
      this.ptr = 0;
      const k = this.layout.pointerlessBytes ?? 1;
      // Each complete group of k bytes sets the port(s); the last complete group wins.
      const whole = bytes.length - (bytes.length % k);
      if (whole) for (let i = 0; i < k; i++) this.setReg(i, bytes[whole - k + i]);
      return;
    }
    const aw = this.layout.addrWidth === 16 ? 2 : 1;
    this.ptr = aw === 2 ? ((bytes[0] << 8) | (bytes[1] ?? 0)) : this.layout.autoIncrementBit7 ? bytes[0] & 0x7f : bytes[0];
    const data = bytes.slice(aw);
    const rtcBase = this.layout.rtc ? Number(this.layout.rtc.reg) : -1;
    const touchesRtc = rtcBase >= 0 && data.length > 0 && this.ptr < rtcBase + 7 && this.ptr + data.length > rtcBase;
    if (touchesRtc) this.rtcMaterialize();
    if (this.wide) {
      for (let i = 0; i + 1 < data.length; i += 2) this.setReg(this.ptr + i / 2, (data[i] << 8) | data[i + 1]);
    } else data.forEach((b, i) => this.setReg(this.ptr + i, b));
    if (touchesRtc) this.rtcAdopt();
  }
  read(n: number) {
    if (this.reply.length) return Array.from({ length: n }, (_, i) => this.reply[i] ?? 0);
    this.refresh();
    // Input pins: a quasi-bidirectional pin written high reads the outside level (PCF8574); register inputs read it directly.
    // (computed for this read only, so a PCF8574's output latch is never overwritten)
    const view = new Map<number, number>();
    for (const ib of this.layout.inputBits ?? []) {
      const reg = Number(ib.reg);
      const cur = view.get(reg) ?? this.byteAt(reg, 0);
      const level = this.value(ib.control) > 0 !== !!ib.activeLow;
      const latchHigh = !this.layout.pointerless || ((this.byteAt(reg, 0) >> ib.bit) & 1) === 1;
      view.set(reg, level && latchHigh ? cur | (1 << ib.bit) : cur & ~(1 << ib.bit));
    }
    if (this.layout.pointerless) this.ptr = 0;
    const out: number[] = [];
    // Byte registers auto-increment; word registers stream the word at the pointer (then the next).
    // A pointerless expander repeats its port(s): PCF8574 port, port…; PCF8575 port 0, port 1, port 0…
    const at = (i: number) => (this.layout.pointerless ? i % (this.layout.pointerlessBytes ?? 1) : this.ptr + i);
    for (let i = 0; i < n; i++) out.push(this.wide ? this.byteAt(this.ptr + (i >> 1), i & 1) : (view.get(at(i)) ?? this.byteAt(at(i), 0)));
    if (!this.wide && !this.layout.pointerless) this.ptr = (this.ptr + n) & 0xffff;
    return out;
  }
  /** PCA9685-style channel duty (0–1) from its four registers. */
  pwmDuty(base: number, ch: number): number {
    const r = (i: number) => this.byteAt(base + ch * 4 + i, 0);
    const on = ((r(1) & 0x0f) << 8) | r(0);
    const off = ((r(3) & 0x0f) << 8) | r(2);
    if (r(3) & 0x10) return 0;
    if (r(1) & 0x10) return 1;
    return (((off - on) % 4096) + 4096) % 4096 / 4096;
  }
  /** Bring the clock and measured values into the registers. */
  private refresh() {
    this.rtcMaterialize();
    for (const m of this.measures) {
      if (m.when && (this.byteAt(Number(m.when.reg), 0) & (m.when.mask ?? 0xff)) !== m.when.equals) continue;
      const reg = Number(m.reg);
      if (m.format === 'ens210') {
        // 16-bit value low byte first, then VALID (bit 0) and the CRC-7 of those 17 bits (bits 7:1).
        const raw = Math.max(0, Math.min(0xffff, Math.round((this.value(m.control ?? 'value') - (m.offset ?? 0)) / (m.scale || 1))));
        [raw & 0xff, raw >> 8, 1 | (crc7Ens210(raw | 0x10000) << 1)].forEach((x, i) => this.store.set(reg + i, [x]));
        continue;
      }
      if (m.format) {
        // Smallest exponent whose mantissa fits, as the chips' automatic ranging does.
        const v = Math.max(0, this.value(m.control ?? 'value'));
        const mbits = m.format === 'max44009' ? 8 : 12;
        let e = 0;
        while (e < 15 && Math.round(v / (m.scale * 2 ** e)) > 2 ** mbits - 1) e++;
        const mant = Math.min(2 ** mbits - 1, Math.round(v / (m.scale * 2 ** e)));
        if (m.format === 'max44009') {
          this.store.set(reg, [(e << 4) | (mant >> 4)]);
          this.store.set(reg + 1, [mant & 0x0f]);
        } else {
          const word = (e << 12) | mant;
          if (this.wide) this.store.set(reg, [word >> 8, word & 0xff]);
          else {
            this.store.set(reg, [word >> 8]);
            this.store.set(reg + 1, [word & 0xff]);
          }
        }
        continue;
      }
      let raw = Math.round((this.value(m.control ?? 'value') - (m.offset ?? 0)) / (m.scale || 1)) * 2 ** (m.shift ?? 0);
      const bits = m.bytes * 8;
      if (m.signed && raw < 0) raw += 2 ** bits;
      raw = Math.max(0, Math.min(2 ** bits - 1, raw));
      const b = Array.from({ length: m.bytes }, (_, i) => Math.floor(raw / 2 ** (8 * (m.littleEndian ? i : m.bytes - 1 - i))) & 0xff);
      if (this.wide) for (let i = 0; i < b.length; i += 2) this.store.set(reg + i / 2, [b[i], b[i + 1] ?? 0]);
      else b.forEach((x, i) => this.store.set(reg + i, [x]));
    }
  }
  /** The current value of a byte register, measurements included (for alias addresses). */
  peek(reg: number): number {
    this.refresh();
    return this.byteAt(reg, 0);
  }
  /** One bit of a byte register (for output pins shown on the part). */
  bit(reg: number, bit: number): boolean {
    return ((this.byteAt(reg, 0) >> bit) & 1) === 1;
  }
}

/** Sensirion CRC-8 (poly 0x31, init 0xFF), used by SHT3x/SHT4x/SCD4x/SGP and AHT20. */
/** ENS210 CRC-7 (polynomial 0x89, initial vector 0x7F) over a 17-bit value (16 data bits + the VALID bit), as the
 * datasheet's reference code computes it. */
export function crc7Ens210(val17: number): number {
  const W = 7;
  const D = 17;
  let pol = 0x89 << (D - W - 1 + W);
  let bit = (1 << (D - 1)) << W;
  let val = ((val17 & 0x1ffff) << W) | 0x7f;
  const mask = ((1 << D) - 1) << W;
  while (bit & mask) {
    if (bit & val) val ^= pol;
    bit >>>= 1;
    pol >>>= 1;
  }
  return val & 0x7f;
}

export function crc8Sensirion(bytes: number[], init = 0xff): number {
  let crc = init;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0x31) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

/** Pack response fields MSB-first into bytes (fields may straddle bytes, e.g. AHT20's 20-bit values). */
export function packResponse(segs: ResponseSegment[], value: (key: string) => number): number[] {
  const out: number[] = [];
  let acc = 0;
  let nbits = 0;
  const push = (v: number, bits: number) => {
    for (let i = bits - 1; i >= 0; i--) {
      acc = (acc << 1) | (Math.floor(v / 2 ** i) & 1);
      if (++nbits === 8) {
        out.push(acc & 0xff);
        acc = 0;
        nbits = 0;
      }
    }
  };
  for (const s of segs) {
    if ('crc' in s) {
      const prev = out.slice(-s.over);
      const sum = prev.reduce((a, b) => a + b, 0);
      if (s.crc === 'sum16') push(sum & 0xffff, 16);
      else if (s.crc === 'neg16') push(-sum & 0xffff, 16);
      else if (s.crc === 'modbus16') {
        let crc = 0xffff;
        for (const b of prev) {
          crc ^= b;
          for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
        }
        push(crc & 0xff, 8);
        push(crc >> 8, 8);
      }
      else if (s.crc === 'sum8') push(sum & 0xff, 8);
      else if (s.crc === 'neg8') push((256 - (sum & 0xff)) & 0xff, 8);
      else if (s.crc === 'xor8hex') {
        const txt = String.fromCharCode(...prev);
        let x = 0;
        for (let i = 0; i + 1 < txt.length; i += 2) x ^= parseInt(txt.slice(i, i + 2), 16) || 0;
        for (const c of x.toString(16).toUpperCase().padStart(2, '0')) push(c.charCodeAt(0), 8);
      }
      else if (s.crc === 'mhz19') push((0xff - (prev.slice(1).reduce((a, b) => a + b, 0) & 0xff) + 1) & 0xff, 8);
      else push(crc8Sensirion(prev, s.crc === 'htu21d' ? 0 : 0xff), 8);
    }
    else if ('const' in s) push(s.const, s.bits);
    else if ('float32' in s) {
      const dv = new DataView(new ArrayBuffer(4));
      dv.setFloat32(0, (value(s.control) - (s.offset ?? 0)) / (s.scale ?? 1));
      if (s.float32 === 'hi') push(dv.getUint16(0), 16);
      else if (s.float32 === 'lo') push(dv.getUint16(2), 16);
      else push(dv.getUint32(0), 32);
    } else {
      let raw = Math.round((value(s.control) - (s.offset ?? 0)) / (s.scale || 1));
      const width = s.hex ? s.bits / 2 : s.bits; // hex: each 8-bit character carries 4 bits
      if (s.signed && raw < 0) raw += 2 ** width;
      raw = Math.max(0, Math.min(2 ** width - 1, raw));
      if (s.hex) for (const c of raw.toString(16).toUpperCase().padStart(s.bits / 8, '0')) push(c.charCodeAt(0), 8);
      else if (s.littleEndian && s.bits % 8 === 0) for (let i = 0; i < s.bits / 8; i++) push(Math.floor(raw / 2 ** (8 * i)) & 0xff, 8);
      else push(raw, s.bits);
    }
  }
  return out;
}

/** 7-segment glyphs (bit0 = a … bit6 = g) → characters, for reading a display in tests. */
const SEG_CHARS: Record<number, string> = {
  0x3f: '0', 0x06: '1', 0x5b: '2', 0x4f: '3', 0x66: '4', 0x6d: '5', 0x7d: '6', 0x07: '7', 0x7f: '8', 0x6f: '9',
  0x77: 'A', 0x7c: 'b', 0x39: 'C', 0x5e: 'd', 0x79: 'E', 0x71: 'F', 0x3d: 'G', 0x76: 'H', 0x30: 'I', 0x1e: 'J', 0x38: 'L',
  0x54: 'n', 0x5c: 'o', 0x73: 'P', 0x67: 'q', 0x50: 'r', 0x78: 't', 0x3e: 'U', 0x1c: 'u', 0x6e: 'y', 0x40: '-', 0x08: '_', 0x63: '°', 0x00: ' ',
  0x7e: '0', 0x7b: '9', 0x27: '7', 0x7a: 'd',
};
/** 14-segment glyphs of the Adafruit LED Backpack font (bit 0 = A … bit 13 = N, bit 14 = DP), for reading
 * an HT16K33 alphanumeric display in tests. Letters and digits win where two characters share a glyph. */
const ALPHA_FONT: Record<string, number> = {
  ' ': 0x0000, '!': 0x0006, '"': 0x0220, '#': 0x12ce, '$': 0x12ed, '%': 0x0c24, '&': 0x235d, "'": 0x0400, '(': 0x2400, ')': 0x0900,
  '*': 0x3fc0, '+': 0x12c0, ',': 0x0800, '-': 0x00c0, '/': 0x0c00, '0': 0x0c3f, '1': 0x0006, '2': 0x00db, '3': 0x008f, '4': 0x00e6,
  '5': 0x2069, '6': 0x00fd, '7': 0x0007, '8': 0x00ff, '9': 0x00ef, ':': 0x1200, ';': 0x0a00, '<': 0x2400, '=': 0x00c8, '>': 0x0900,
  '?': 0x1083, '@': 0x02bb, A: 0x00f7, B: 0x128f, C: 0x0039, D: 0x120f, E: 0x00f9, F: 0x0071, G: 0x00bd, H: 0x00f6, I: 0x1209,
  J: 0x001e, K: 0x2470, L: 0x0038, M: 0x0536, N: 0x2136, O: 0x003f, P: 0x00f3, Q: 0x203f, R: 0x20f3, S: 0x00ed, T: 0x1201,
  U: 0x003e, V: 0x0c30, W: 0x2836, X: 0x2d00, Y: 0x1500, Z: 0x0c09, '[': 0x0039, '\\': 0x2100, ']': 0x000f, '^': 0x0c03, _: 0x0008,
  '`': 0x0100, a: 0x1058, b: 0x2078, c: 0x00d8, d: 0x088e, e: 0x0858, f: 0x0071, g: 0x048e, h: 0x1070, i: 0x1000, j: 0x000e,
  k: 0x3600, l: 0x0030, m: 0x10d4, n: 0x1050, o: 0x00dc, p: 0x0170, q: 0x0486, r: 0x0050, s: 0x2088, t: 0x0078, u: 0x001c,
  v: 0x2004, w: 0x2814, x: 0x28c0, y: 0x200c, z: 0x0848, '{': 0x0949, '|': 0x1200, '}': 0x2489, '~': 0x0520,
};
const ALPHA_CHARS = new Map<number, string>();
for (const c of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz -_=+*/%#$&@?!"\'()<>[]{}|^`~,;:\\') if (c in ALPHA_FONT && !ALPHA_CHARS.has(ALPHA_FONT[c])) ALPHA_CHARS.set(ALPHA_FONT[c], c);
export function alphaText(glyphs: number[]): string {
  return glyphs.map((g) => ALPHA_CHARS.get(g & 0x3fff) ?? '?').join('');
}

export function segText(segs: number[]): string {
  return segs.map((b) => SEG_CHARS[b & 0x7f] ?? '?').join('');
}

/** TM1637: decodes the two-wire protocol from pin changes (start/stop while CLK high, LSB-first bytes, ack clock). */
export class TM1637Device {
  segs: number[];
  on = false;
  brightness = 7;
  private bits = 0;
  private byte = 0;
  private bytes: number[] = [];
  private active = false;
  constructor(public partId: string, digits = 4) {
    this.segs = new Array(Math.max(digits, 6)).fill(0);
  }
  /** Called with both line levels whenever the board changes CLK or DIO. */
  update(clk: number, dio: number, prevClk: number, prevDio: number) {
    if (clk && prevClk && dio !== prevDio) {
      if (!dio) {
        this.active = true;
        this.bits = 0;
        this.byte = 0;
        this.bytes = [];
      } else if (this.active) {
        this.active = false;
        this.command(this.bytes);
      }
      return;
    }
    if (this.active && clk && !prevClk) {
      if (this.bits < 8) this.byte |= (dio ? 1 : 0) << this.bits;
      this.bits++;
      if (this.bits === 9) {
        this.bytes.push(this.byte);
        this.bits = 0;
        this.byte = 0;
      }
    }
  }
  private addr = 0;
  private command(b: number[]) {
    if (!b.length) return;
    const c = b[0];
    if ((c & 0xc0) === 0x40) return; // data command (auto-increment or fixed): nothing to store
    if ((c & 0xc0) === 0xc0) {
      this.addr = c & 0x07;
      for (const d of b.slice(1)) if (this.addr < this.segs.length) this.segs[this.addr++] = d;
      return;
    }
    if ((c & 0xf0) === 0x80) {
      this.on = (c & 0x08) !== 0;
      this.brightness = c & 0x07;
    }
  }
}

/** MAX7219: 16-bit register frames latched by LOAD (CS) rising; digits 1–8, decode mode, shutdown, test. */
/** One MAX7219's registers. */
class MAX7219Chip {
  digitRegs = new Array(8).fill(0);
  decode = 0;
  shutdown = true;
  test = false;
  scanLimit = 7;
  exec(a: number, d: number) {
    const reg = a & 0x0f;
    if (reg >= 1 && reg <= 8) this.digitRegs[reg - 1] = d;
    else if (reg === 0x09) this.decode = d;
    else if (reg === 0x0b) this.scanLimit = d & 7;
    else if (reg === 0x0c) this.shutdown = (d & 1) === 0;
    else if (reg === 0x0f) this.test = (d & 1) === 1;
  }
}

/** MAX7219, or `count` of them daisy-chained DOUT → DIN. Every chip has a 16-bit shift register; bytes clocked in
 * push the chain along, and on LOAD rising each chip runs the frame sitting in its own register (no-op 0x00 frames
 * do nothing). Chip 0 is the one wired to the board. */
export class MAX7219Device {
  chips: MAX7219Chip[];
  private shift: number[];
  constructor(public partId: string, public count = 1) {
    this.chips = Array.from({ length: count }, () => new MAX7219Chip());
    this.shift = new Array(2 * count).fill(0);
  }
  get shutdown() {
    return this.chips.every((c) => c.shutdown);
  }
  clockIn(bytes: number[]) {
    // shift[0..1] is chip 0's register; older bytes move on to the next chip.
    for (const b of bytes) {
      this.shift.pop();
      this.shift.unshift(b);
    }
  }
  latch() {
    this.chips.forEach((c, i) => c.exec(this.shift[2 * i + 1], this.shift[2 * i]));
  }
  /** Segment bytes (bit0 = a … bit6 = g) for digit positions left to right (digit 7 is the leftmost on 8-digit modules). */
  segments(): number[] {
    const c = this.chips[0];
    const CODE_B = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x40, 0x79, 0x76, 0x38, 0x73, 0x00];
    const out: number[] = [];
    for (let i = c.scanLimit; i >= 0; i--) {
      const v = c.digitRegs[i];
      if (c.decode & (1 << i)) out.push(CODE_B[v & 0x0f] | (v & 0x80));
      else {
        // No-decode bit order: DP A B C D E F G (bit7 … bit0).
        let seg = 0;
        for (let k = 0; k < 7; k++) if (v & (1 << (6 - k))) seg |= 1 << k;
        out.push(seg | (v & 0x80));
      }
    }
    return out;
  }
  /** Dot-matrix brightness, 8 rows × 8·count columns, row-major (row = digit register, column bit 7 … 0 left to right).
   * FC-16 modules: DIN enters the rightmost chip, so chip 0 is the rightmost block. */
  matrix(): number[] {
    const px: number[] = [];
    for (let r = 0; r < 8; r++)
      for (let b = 0; b < this.count; b++) {
        const c = this.chips[this.count - 1 - b];
        for (let x = 0; x < 8; x++) px.push(!c.shutdown && (c.test || (c.digitRegs[r] >> (7 - x)) & 1) ? 255 : 0);
      }
    return px;
  }
}

/** SPI colour display. 'dcs' = MIPI DCS controllers (ST7789/ST7735/ILI9341/ILI9488): CASET 0x2A, RASET 0x2B, RAMWR 0x2C,
 * MADCTL 0x36 row/column swap, COLMOD 0x3A pixel format (16-bit RGB565 or 18-bit RGB666 = 3 bytes per pixel),
 * DISPOFF/DISPON 0x28/0x29. 'ssd1351' = Solomon SSD1351 OLED: 0x15 column / 0x75 row window (one byte each),
 * 0x5C write RAM, 0xA0 remap (bit 0 vertical increment, bit 1 column remap, bit 2 colour order, bit 4 COM scan,
 * bits 7:6 colour depth 65k/262k), 0xA4–0xA7 display mode, 0xAE/0xAF sleep on/off, 0xFD command lock. */
export class TFTDevice {
  fb: Uint16Array;
  on: boolean;
  private cmd = -1;
  private args: number[] = [];
  private x0 = 0;
  private x1 = 0;
  private y0 = 0;
  private y1 = 0;
  private x = 0;
  private y = 0;
  private part: number[] = [];
  private swap = false;
  private bits: number;
  // SSD1351 state
  private remap = 0;
  private mode = 0xa6; // A4 all off, A5 all on, A6 normal, A7 inverse
  private locked = false;
  writes = 0;
  constructor(public partId: string, public width: number, public height: number, public controller: 'dcs' | 'ssd1351' = 'dcs', pixelBits: 16 | 18 = 16) {
    this.fb = new Uint16Array(width * height);
    this.x1 = width - 1;
    this.y1 = height - 1;
    this.bits = pixelBits;
    // MIPI panels are usually woken by the driver; the SSD1351 starts in sleep mode (display off).
    this.on = controller !== 'ssd1351';
  }
  private get w() {
    return this.swap ? this.height : this.width;
  }
  private get h() {
    return this.swap ? this.width : this.height;
  }
  private get ramCmd() {
    return this.controller === 'ssd1351' ? 0x5c : 0x2c;
  }
  command(c: number) {
    if (this.controller === 'ssd1351' && this.locked && c !== 0xfd) return;
    this.cmd = c;
    this.args = [];
    this.part = [];
    if (this.controller === 'ssd1351') {
      if (c === 0xae) this.on = false;
      if (c === 0xaf) this.on = true;
      if (c >= 0xa4 && c <= 0xa7) this.mode = c;
    } else {
      if (c === 0x28) this.on = false;
      if (c === 0x29) this.on = true;
    }
    if (c === this.ramCmd) {
      this.x = this.x0;
      this.y = this.y0;
    }
  }
  private put(rgb565: number) {
    if (this.controller === 'ssd1351') {
      // Column remap mirrors x, COM scan (bit 4 clear) mirrors y; colour order bit 2 clear swaps red and blue.
      const sx = this.remap & 0x02 ? this.width - 1 - this.x : this.x;
      const sy = this.remap & 0x10 ? this.y : this.height - 1 - this.y;
      const px = this.remap & 0x04 ? rgb565 : ((rgb565 & 0x1f) << 11) | (rgb565 & 0x07e0) | (rgb565 >> 11);
      if (this.x < this.width && this.y < this.height) {
        this.fb[sy * this.width + sx] = px;
        this.writes++;
      }
      if (this.remap & 0x01) {
        if (++this.y > this.y1) {
          this.y = this.y0;
          if (++this.x > this.x1) this.x = this.x0;
        }
      } else if (++this.x > this.x1) {
        this.x = this.x0;
        if (++this.y > this.y1) this.y = this.y0;
      }
      return;
    }
    if (this.x < this.w && this.y < this.h) {
      // Store in panel orientation so thumbnails are stable.
      const [px0, py0] = this.swap ? [this.y, this.x] : [this.x, this.y];
      this.fb[py0 * this.width + px0] = rgb565;
      this.writes++;
    }
    if (++this.x > this.x1) {
      this.x = this.x0;
      if (++this.y > this.y1) this.y = this.y0;
    }
  }
  data(bytes: number[]) {
    if (this.controller === 'ssd1351' && this.locked && this.cmd !== 0xfd) return;
    if (this.cmd === this.ramCmd) {
      const per = this.bits === 18 ? 3 : 2;
      for (const b of bytes) {
        this.part.push(b);
        if (this.part.length < per) continue;
        const [p0, p1, p2] = this.part;
        this.part = [];
        if (per === 2) this.put((p0 << 8) | p1);
        else if (this.controller === 'ssd1351') this.put(((p0 & 0x3f) >> 1 << 11) | ((p1 & 0x3f) << 5) | ((p2 & 0x3f) >> 1)); // 6-bit values in bits 5:0
        else this.put(((p0 >> 3) << 11) | ((p1 >> 2) << 5) | (p2 >> 3)); // RGB666: 6 bits in bits 7:2 of each byte
      }
      return;
    }
    this.args.push(...bytes);
    const a = this.args;
    if (this.controller === 'ssd1351') {
      if (this.cmd === 0x15 && a.length >= 2) [this.x0, this.x1] = [a[0], a[1]];
      if (this.cmd === 0x75 && a.length >= 2) [this.y0, this.y1] = [a[0], a[1]];
      if (this.cmd === 0xa0 && a.length >= 1) {
        this.remap = a[0];
        this.bits = a[0] >> 6 >= 2 ? 18 : 16;
      }
      if (this.cmd === 0xfd && a.length >= 1) {
        if (a[0] === 0x16) this.locked = true;
        if (a[0] === 0x12) this.locked = false;
      }
      return;
    }
    if (this.cmd === 0x2a && a.length >= 4) [this.x0, this.x1] = [(a[0] << 8) | a[1], (a[2] << 8) | a[3]];
    if (this.cmd === 0x2b && a.length >= 4) [this.y0, this.y1] = [(a[0] << 8) | a[1], (a[2] << 8) | a[3]];
    if (this.cmd === 0x36 && a.length >= 1) this.swap = (a[0] & 0x20) !== 0;
    if (this.cmd === 0x3a && a.length >= 1) this.bits = (a[0] & 0x07) === 6 ? 18 : 16;
  }
  /** What the panel shows at (x, y) as RGB565, after the SSD1351 display mode. */
  private shown(x: number, y: number): number {
    const p = this.fb[y * this.width + x] ?? 0;
    if (this.controller !== 'ssd1351' || this.mode === 0xa6) return p;
    return this.mode === 0xa4 ? 0 : this.mode === 0xa5 ? 0xffff : ~p & 0xffff;
  }
  /** Lit = any colour brighter than near-black (for reading text and checking that something is drawn). */
  lit(x: number, y: number): boolean {
    const p = this.shown(x, y);
    return ((p >> 11) & 0x1f) + ((p >> 5) & 0x3f) / 2 + (p & 0x1f) > 12;
  }
  /** Downscaled RGB thumbnail (for the canvas), every `step` pixels. */
  thumb(step: number): number[] {
    const out: number[] = [];
    for (let y = 0; y < this.height; y += step)
      for (let x = 0; x < this.width; x += step) {
        const p = this.on ? this.shown(x, y) : 0;
        out.push(((p >> 11) & 0x1f) << 3, ((p >> 5) & 0x3f) << 2, (p & 0x1f) << 3);
      }
    return out;
  }
}

/** HT16K33 LED backpack (I2C): 16 bytes of display RAM, oscillator (0x21), display setup (0x80 | on), dimming (0xE0 | n). */
export class HT16K33Device implements I2CDevice {
  ram = new Array(16).fill(0);
  on = false;
  constructor(public partId: string, public addr: number) {}
  write(bytes: number[]) {
    if (!bytes.length) return;
    const c = bytes[0];
    if (c < 0x10) bytes.slice(1).forEach((b, i) => (this.ram[(c + i) & 0x0f] = b));
    else if ((c & 0xf0) === 0x80) this.on = (c & 0x01) === 1;
  }
  read(n: number) {
    return new Array(n).fill(0);
  }
}
