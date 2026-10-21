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
  private reply: number[] = [];
  constructor(
    public partId: string,
    public addr: number,
    registers: Record<string, number>,
    private measures: I2CMeasure[],
    private value: (key: string) => number,
    private responses: { match: string; bytes: ResponseSegment[] }[] = [],
    private layout: { regWidth?: 8 | 16; addrWidth?: 8 | 16; pointerless?: boolean; inputBits?: { reg: string; bit: number; control: string; activeLow?: boolean }[]; rtc?: { reg: string; order: 'ds1307' | 'pcf8563' }; nowMs?: () => number } = {},
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
      this.setReg(0, bytes[bytes.length - 1]);
      return;
    }
    const aw = this.layout.addrWidth === 16 ? 2 : 1;
    this.ptr = aw === 2 ? ((bytes[0] << 8) | (bytes[1] ?? 0)) : bytes[0];
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
    this.rtcMaterialize();
    for (const m of this.measures) {
      const reg = Number(m.reg);
      let raw = Math.round((this.value(m.control ?? 'value') - (m.offset ?? 0)) / (m.scale || 1)) * 2 ** (m.shift ?? 0);
      const bits = m.bytes * 8;
      if (m.signed && raw < 0) raw += 2 ** bits;
      raw = Math.max(0, Math.min(2 ** bits - 1, raw));
      const b = Array.from({ length: m.bytes }, (_, i) => Math.floor(raw / 2 ** (8 * (m.littleEndian ? i : m.bytes - 1 - i))) & 0xff);
      if (this.wide) for (let i = 0; i < b.length; i += 2) this.store.set(reg + i / 2, [b[i], b[i + 1] ?? 0]);
      else b.forEach((x, i) => this.store.set(reg + i, [x]));
    }
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
    for (let i = 0; i < n; i++) out.push(this.wide ? this.byteAt(this.ptr + (i >> 1), i & 1) : (view.get(this.ptr + i) ?? this.byteAt(this.ptr + i, 0)));
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
  /** One bit of a byte register (for output pins shown on the part). */
  bit(reg: number, bit: number): boolean {
    return ((this.byteAt(reg, 0) >> bit) & 1) === 1;
  }
}

/** Sensirion CRC-8 (poly 0x31, init 0xFF), used by SHT3x/SHT4x/SCD4x/SGP and AHT20. */
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
      else if (s.crc === 'sum8') push(sum & 0xff, 8);
      else if (s.crc === 'mhz19') push((0xff - (prev.slice(1).reduce((a, b) => a + b, 0) & 0xff) + 1) & 0xff, 8);
      else push(crc8Sensirion(prev, s.crc === 'htu21d' ? 0 : 0xff), 8);
    }
    else if ('const' in s) push(s.const, s.bits);
    else {
      let raw = Math.round((value(s.control) - (s.offset ?? 0)) / (s.scale || 1));
      if (s.signed && raw < 0) raw += 2 ** s.bits;
      push(Math.max(0, Math.min(2 ** s.bits - 1, raw)), s.bits);
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
export class MAX7219Device {
  digitRegs = new Array(8).fill(0);
  decode = 0;
  shutdown = true;
  test = false;
  scanLimit = 7;
  private shift: number[] = [];
  constructor(public partId: string) {}
  clockIn(bytes: number[]) {
    this.shift.push(...bytes);
    if (this.shift.length > 64) this.shift.splice(0, this.shift.length - 64);
  }
  /** LOAD rising: the last 16 bits shifted in are this chip's frame (cascaded chips pass earlier ones on). */
  latch() {
    if (this.shift.length < 2) return void (this.shift = []);
    const [a, d] = this.shift.slice(-2);
    this.shift = [];
    const reg = a & 0x0f;
    if (reg >= 1 && reg <= 8) this.digitRegs[reg - 1] = d;
    else if (reg === 0x09) this.decode = d;
    else if (reg === 0x0b) this.scanLimit = d & 7;
    else if (reg === 0x0c) this.shutdown = (d & 1) === 0;
    else if (reg === 0x0f) this.test = (d & 1) === 1;
  }
  /** Segment bytes (bit0 = a … bit6 = g) for digit positions left to right (digit 7 is the leftmost on 8-digit modules). */
  segments(): number[] {
    const CODE_B = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x40, 0x79, 0x76, 0x38, 0x73, 0x00];
    const out: number[] = [];
    for (let i = this.scanLimit; i >= 0; i--) {
      const v = this.digitRegs[i];
      if (this.decode & (1 << i)) out.push(CODE_B[v & 0x0f] | (v & 0x80));
      else {
        // No-decode bit order: DP A B C D E F G (bit7 … bit0).
        let seg = 0;
        for (let k = 0; k < 7; k++) if (v & (1 << (6 - k))) seg |= 1 << k;
        out.push(seg | (v & 0x80));
      }
    }
    return out;
  }
  /** 8×8 matrix brightness (row = digit register, column bit 7 … 0 left to right). */
  matrix(): number[] {
    const px: number[] = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) px.push(!this.shutdown && (this.test || (this.digitRegs[r] >> (7 - c)) & 1) ? 255 : 0);
    return px;
  }
}
