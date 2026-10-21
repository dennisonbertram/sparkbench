// MFRC522 (RC522) 13.56 MHz reader over SPI, with one ISO/IEC 14443-A card (4-byte UID, MIFARE Classic 1K answers)
// that can be put on or taken off the reader. Registers, FIFO, CRC coprocessor, Transceive framing and the card's
// ISO 14443-3 state machine (IDLE → READY → ACTIVE → HALT) follow the NXP MFRC522 datasheet and ISO/IEC 14443-3.
// Not modelled: MIFARE Crypto1 authentication (MFAuthent ends with a protocol error) and so block reads/writes, 7-byte
// UIDs, multiple cards and collisions, MSB-first CRC, and the analog/antenna settings beyond "antenna on".

/** ISO/IEC 14443-A CRC_A: preset 0x6363, reflected polynomial 0x8408, sent low byte first. */
export function crcA(bytes: number[], preset = 0x6363): number {
  let crc = preset;
  for (let b of bytes) {
    b = (b ^ crc) & 0xff;
    b = (b ^ (b << 4)) & 0xff;
    crc = ((crc >> 8) ^ (b << 8) ^ (b << 3) ^ (b >> 4)) & 0xffff;
  }
  return crc;
}

const CRC_PRESETS = [0x0000, 0x6363, 0xa671, 0xffff];
const R = { Command: 0x01, ComIrq: 0x04, DivIrq: 0x05, Error: 0x06, Status1: 0x07, Status2: 0x08, FIFOData: 0x09, FIFOLevel: 0x0a, Control: 0x0c, BitFraming: 0x0d, Coll: 0x0e, Mode: 0x11, TxMode: 0x12, RxMode: 0x13, TxControl: 0x14, CRCMsb: 0x21, CRCLsb: 0x22, TMode: 0x2a, TPrescaler: 0x2b, TReloadHi: 0x2c, TReloadLo: 0x2d, Version: 0x37 };
/** Power-on values (datasheet table 20 onwards) for the registers whose reset value isn't 0. */
const POR: Record<number, number> = { 0x01: 0x20, 0x02: 0x80, 0x04: 0x14, 0x0c: 0x10, 0x0e: 0x80, 0x11: 0x3f, 0x14: 0x80, 0x16: 0x10, 0x17: 0x84, 0x18: 0x84, 0x19: 0x4d, 0x1a: 0x00, 0x24: 0x26, 0x26: 0x48, 0x27: 0x88, 0x28: 0x20, 0x29: 0x00 };

export interface CardState {
  present: boolean;
  uid: number;
}

export class MFRC522Device {
  private regs = new Uint8Array(64);
  private fifo: number[] = [];
  private card: 'idle' | 'ready' | 'active' | 'halt' = 'idle';
  private wasPresent = false;
  /** SPI transaction state: the first byte after CS falls says read or write. */
  private txMode: 'none' | 'read' | 'write' = 'none';
  private txReg = 0;
  private timerAt = -1;
  powered = true;
  constructor(public partId: string, private version: number, private card$: () => CardState, private nowUs: () => number) {
    this.reset();
  }
  reset() {
    this.card = 'idle'; // the reset turns the RF field off, so the card loses power
    this.regs.fill(0);
    for (const [k, v] of Object.entries(POR)) this.regs[Number(k)] = v;
    this.regs[R.Version] = this.version;
    this.fifo = [];
    this.timerAt = -1;
  }
  /** NRSTPD low: hard power-down. Rising: the chip comes out of reset with power-on values. */
  setReset(high: boolean) {
    if (high && !this.powered) this.reset();
    if (!high) this.card = 'idle';
    this.powered = high;
  }
  select() {
    this.txMode = 'none';
  }
  /** Bytes clocked in on MOSI → bytes clocked out on MISO. */
  transfer(mosi: number[]): number[] {
    if (!this.powered) return mosi.map(() => 0);
    this.syncCard();
    const out: number[] = [];
    for (const b of mosi) {
      if (this.txMode === 'none') {
        this.txMode = b & 0x80 ? 'read' : 'write';
        this.txReg = (b >> 1) & 0x3f;
        out.push(0);
      } else if (this.txMode === 'read') {
        // Each byte returns the register addressed by the byte before; this byte names the next one (0 ends).
        out.push(this.readReg(this.txReg));
        this.txReg = (b >> 1) & 0x3f;
      } else {
        out.push(0);
        this.writeReg(this.txReg, b);
      }
    }
    return out;
  }
  /** A card taken off the field loses power and starts over in IDLE. */
  private syncCard() {
    const c = this.card$();
    if (c.present !== this.wasPresent && !c.present) this.card = 'idle';
    if (c.present && !this.wasPresent) this.card = 'idle';
    this.wasPresent = c.present;
  }
  private timerIrq() {
    if (this.timerAt >= 0 && this.nowUs() >= this.timerAt) {
      this.regs[R.ComIrq] |= 0x01;
      this.timerAt = -1;
    }
  }
  readReg(r: number): number {
    this.timerIrq();
    if (r === R.FIFOData) return this.fifo.shift() ?? 0;
    if (r === R.FIFOLevel) return Math.min(64, this.fifo.length);
    return this.regs[r];
  }
  writeReg(r: number, v: number) {
    switch (r) {
      case R.FIFOData:
        if (this.fifo.length < 64) this.fifo.push(v);
        else this.regs[R.Error] |= 0x10; // BufferOvfl
        return;
      case R.FIFOLevel:
        if (v & 0x80) {
          this.fifo = [];
          this.regs[R.Error] &= ~0x10;
        }
        return;
      case R.ComIrq:
      case R.DivIrq: {
        // Bit 7 (Set1/Set2): 1 sets the marked bits, 0 clears them.
        const mask = v & 0x7f;
        this.regs[r] = v & 0x80 ? this.regs[r] | mask : this.regs[r] & ~mask;
        return;
      }
      case R.Command:
        this.regs[r] = v & 0x3f;
        this.command(v & 0x0f);
        return;
      case R.BitFraming:
        this.regs[r] = v;
        if (v & 0x80 && (this.regs[R.Command] & 0x0f) === 0x0c) this.transceive();
        return;
      case R.TxControl:
        this.regs[r] = v;
        if (!this.antennaOn()) this.card = 'idle'; // field off: the card powers down
        return;
      case R.Error:
      case R.Status1:
      case R.Version:
        return; // read-only
      default:
        this.regs[r] = v;
    }
  }
  private command(cmd: number) {
    switch (cmd) {
      case 0x0f: // SoftReset
        this.reset();
        return;
      case 0x03: {
        // CalcCRC over the FIFO, preset from ModeReg CRCPreset.
        const crc = crcA(this.fifo.splice(0), CRC_PRESETS[this.regs[R.Mode] & 3]);
        this.regs[R.CRCMsb] = crc >> 8;
        this.regs[R.CRCLsb] = crc & 0xff;
        this.regs[R.DivIrq] |= 0x04;
        this.regs[R.Status1] |= 0x20; // CRCReady
        return;
      }
      case 0x0c: // Transceive: sending starts with BitFramingReg StartSend
        if (this.regs[R.BitFraming] & 0x80) this.transceive();
        return;
      case 0x0e: // MFAuthent: Crypto1 isn't modelled, so it ends with a protocol error.
        this.regs[R.Error] = 0x01;
        this.regs[R.ComIrq] |= 0x12; // IdleIRq | ErrIRq
        this.regs[R.Command] = (this.regs[R.Command] & 0xf0) | 0x00;
        return;
      case 0x04: // Transmit (nothing comes back)
        this.fifo = [];
        this.regs[R.ComIrq] |= 0x50; // TxIRq | IdleIRq
        this.regs[R.Command] &= 0xf0;
        return;
      default:
        return; // Idle, Mem, RandomID, Receive, NoCmdChange: no card traffic to model
    }
  }
  /** Send the FIFO to the card and put its answer in the FIFO. */
  private transceive() {
    const txLast = this.regs[R.BitFraming] & 0x07;
    let frame = this.fifo.splice(0);
    if (this.regs[R.TxMode] & 0x80) {
      const c = crcA(frame, CRC_PRESETS[this.regs[R.Mode] & 3]);
      frame = [...frame, c & 0xff, c >> 8];
    }
    this.regs[R.ComIrq] |= 0x40; // TxIRq
    this.regs[R.Error] = 0;
    this.regs[R.Control] &= ~0x07;
    let reply = this.antennaOn() ? this.cardReply(frame, txLast) : null;
    // With the receiver's CRC on, the reader checks and strips the card's CRC_A.
    if (reply && reply.bytes.length > 2 && this.regs[R.RxMode] & 0x80) {
      const body = reply.bytes.slice(0, -2);
      const c = crcA(body, CRC_PRESETS[this.regs[R.Mode] & 3]);
      if ((c & 0xff) !== reply.bytes[reply.bytes.length - 2] || c >> 8 !== reply.bytes[reply.bytes.length - 1]) this.regs[R.Error] |= 0x04;
      reply = { bytes: body, lastBits: 0 };
    }
    if (reply) {
      this.fifo.push(...reply.bytes);
      this.regs[R.Control] = (this.regs[R.Control] & ~0x07) | reply.lastBits;
      this.regs[R.ComIrq] |= 0x20; // RxIRq
      return;
    }
    // Nothing answered: the timer (TAuto) times out after (2·TPrescaler + 1)(TReload + 1) / 13.56 MHz.
    if (this.regs[R.TMode] & 0x80) {
      const pre = ((this.regs[R.TMode] & 0x0f) << 8) | this.regs[R.TPrescaler];
      const reload = (this.regs[R.TReloadHi] << 8) | this.regs[R.TReloadLo];
      this.timerAt = this.nowUs() + ((2 * pre + 1) * (reload + 1)) / 13.56;
    }
  }
  private antennaOn() {
    return (this.regs[R.TxControl] & 0x03) !== 0;
  }
  /** The card's answer to a frame (ISO/IEC 14443-3 type A, one MIFARE Classic 1K card). null = silence. */
  private cardReply(f: number[], txLast: number): { bytes: number[]; lastBits: number } | null {
    const c = this.card$();
    if (!c.present || !f.length) return null;
    const uid = [(c.uid >>> 24) & 0xff, (c.uid >>> 16) & 0xff, (c.uid >>> 8) & 0xff, c.uid & 0xff];
    const bcc = uid.reduce((a, b) => a ^ b, 0);
    const crcOk = (n: number) => f.length === n + 2 && crcA(f.slice(0, n)) === (f[n] | (f[n + 1] << 8));
    const withCrc = (b: number[]) => {
      const x = crcA(b);
      return [...b, x & 0xff, x >> 8];
    };
    // REQA / WUPA are 7-bit short frames.
    if (f.length === 1 && txLast === 7 && (f[0] === 0x26 || f[0] === 0x52)) {
      if (this.card === 'idle' || (f[0] === 0x52 && this.card === 'halt')) {
        this.card = 'ready';
        return { bytes: [0x04, 0x00], lastBits: 0 }; // ATQA: single-size UID, bit-frame anticollision
      }
      return null;
    }
    if (this.card === 'ready' && f[0] === 0x93) {
      if (f.length === 2 && f[1] === 0x20) return { bytes: [...uid, bcc], lastBits: 0 }; // ANTICOLLISION, cascade level 1
      if (f[1] === 0x70 && crcOk(7) && f.slice(2, 7).every((b, i) => b === [...uid, bcc][i])) {
        this.card = 'active';
        return { bytes: withCrc([0x08]), lastBits: 0 }; // SAK 0x08: MIFARE Classic 1K, UID complete
      }
    }
    if (this.card === 'active') {
      if (f[0] === 0x50 && f[1] === 0x00 && crcOk(2)) {
        this.card = 'halt'; // HLTA: no answer
        return null;
      }
      if (f[0] === 0x30 && crcOk(2)) return { bytes: [0x04], lastBits: 4 }; // READ before authentication: 4-bit NAK
    }
    // Anything unexpected sends a READY or ACTIVE card back to IDLE without an answer.
    if (this.card === 'ready' || this.card === 'active') this.card = 'idle';
    return null;
  }
}
