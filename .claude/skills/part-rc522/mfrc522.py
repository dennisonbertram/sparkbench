# MFRC522 (RC522) 13.56 MHz RFID reader, MicroPython driver.
# Register access over SPI as in the NXP MFRC522 datasheet (section 8.1.2): address byte = (reg << 1),
# bit 7 set to read, MSB first, SPI mode 0. Card commands follow ISO/IEC 14443-3 type A:
# REQA (7-bit short frame) -> ATQA, ANTICOLLISION (93 20) -> UID + BCC, SELECT (93 70 + UID + BCC + CRC_A) -> SAK,
# HLTA (50 00 + CRC_A). Reads the 4-byte UID of MIFARE Classic / Ultralight-style cards (cascade level 1 only).
import time

# Registers (datasheet table 20)
_CommandReg = 0x01
_ComIEnReg = 0x02
_ComIrqReg = 0x04
_DivIrqReg = 0x05
_ErrorReg = 0x06
_FIFODataReg = 0x09
_FIFOLevelReg = 0x0A
_ControlReg = 0x0C
_BitFramingReg = 0x0D
_CollReg = 0x0E
_ModeReg = 0x11
_TxModeReg = 0x12
_RxModeReg = 0x13
_TxControlReg = 0x14
_TxASKReg = 0x15
_TModeReg = 0x2A
_TPrescalerReg = 0x2B
_TReloadRegH = 0x2C
_TReloadRegL = 0x2D
_VersionReg = 0x37

# Commands (datasheet table 149)
_CMD_IDLE = 0x00
_CMD_TRANSCEIVE = 0x0C
_CMD_SOFTRESET = 0x0F


def crc_a(data):
    """ISO/IEC 14443-3 CRC_A (preset 0x6363), returned as [low byte, high byte] as it is sent."""
    crc = 0x6363
    for b in data:
        b = (b ^ crc) & 0xFF
        b = (b ^ (b << 4)) & 0xFF
        crc = ((crc >> 8) ^ (b << 8) ^ (b << 3) ^ (b >> 4)) & 0xFFFF
    return [crc & 0xFF, crc >> 8]


class MFRC522:
    def __init__(self, spi, cs, rst):
        """spi: a machine.SPI/SoftSPI in mode 0 (polarity=0, phase=0), up to 10 MHz.
        cs: output Pin wired to SDA (NSS). rst: output Pin wired to RST (NRSTPD)."""
        self.spi = spi
        self.cs = cs
        self.rst = rst
        self.cs.value(1)
        self.rst.value(0)
        self._buf = bytearray(2)
        time.sleep_ms(1)        # NRSTPD low >= 100 ns resets the chip (hard power-down)
        self.rst.value(1)
        time.sleep_ms(50)       # oscillator start-up (crystal) + 37.74 us internal delay
        self.init()

    # --- register access -------------------------------------------------
    def _wreg(self, reg, val):
        self.cs.value(0)
        self.spi.write(bytes(((reg << 1) & 0x7E, val & 0xFF)))
        self.cs.value(1)

    def _rreg(self, reg):
        self.cs.value(0)
        self.spi.write_readinto(bytes((0x80 | ((reg << 1) & 0x7E), 0)), self._buf)
        self.cs.value(1)
        return self._buf[1]

    def _set(self, reg, mask):
        self._wreg(reg, self._rreg(reg) | mask)

    def _clear(self, reg, mask):
        self._wreg(reg, self._rreg(reg) & ~mask)

    # --- set-up ----------------------------------------------------------
    def init(self):
        self._wreg(_CommandReg, _CMD_SOFTRESET)
        t0 = time.ticks_ms()
        while self._rreg(_CommandReg) & 0x10:          # PowerDown bit clears when the reset is done
            if time.ticks_diff(time.ticks_ms(), t0) > 100:
                raise OSError('MFRC522 does not come out of reset: check 3.3V, RST and the SPI wires')
            time.sleep_ms(1)
        # Timer: TAuto, f_timer = 13.56 MHz / (2*169+1) = 40 kHz, reload 1000 -> 25 ms receive timeout.
        self._wreg(_TModeReg, 0x80)
        self._wreg(_TPrescalerReg, 0xA9)
        self._wreg(_TReloadRegH, 0x03)
        self._wreg(_TReloadRegL, 0xE8)
        self._wreg(_TxASKReg, 0x40)    # Force100ASK: ISO 14443-A 100 % ASK modulation
        self._wreg(_ModeReg, 0x3D)     # CRC preset 6363h (CRC_A)
        self._wreg(_TxModeReg, 0x00)   # 106 kBd, no TX CRC (the driver appends CRC_A itself)
        self._wreg(_RxModeReg, 0x00)   # 106 kBd, no RX CRC check (the driver checks it)
        self.antenna_on()

    def version(self):
        """VersionReg: 0x91 = MFRC522 v1.0, 0x92 = v2.0 (clone chips often read 0x88 or 0x12)."""
        return self._rreg(_VersionReg)

    def antenna_on(self, on=True):
        if on:
            self._set(_TxControlReg, 0x03)   # Tx1RFEn | Tx2RFEn
        else:
            self._clear(_TxControlReg, 0x03)

    # --- talking to a card -----------------------------------------------
    def _transceive(self, data, last_bits=0):
        """Send data to the card and return (bytes received, valid bits in the last byte), or None on timeout/error."""
        self._wreg(_CommandReg, _CMD_IDLE)
        self._wreg(_ComIrqReg, 0x7F)            # clear all interrupt request bits (Set1 = 0)
        self._wreg(_FIFOLevelReg, 0x80)         # FlushBuffer
        for b in data:
            self._wreg(_FIFODataReg, b)
        self._wreg(_BitFramingReg, last_bits & 0x07)
        self._wreg(_CommandReg, _CMD_TRANSCEIVE)
        self._set(_BitFramingReg, 0x80)         # StartSend
        t0 = time.ticks_ms()
        while True:
            irq = self._rreg(_ComIrqReg)
            if irq & 0x30:                      # RxIRq or IdleIRq: a reply has arrived
                break
            if irq & 0x01:                      # TimerIRq: no card answered within 25 ms
                self._clear(_BitFramingReg, 0x80)
                return None
            if time.ticks_diff(time.ticks_ms(), t0) > 50:
                self._clear(_BitFramingReg, 0x80)
                return None
        self._clear(_BitFramingReg, 0x80)
        if self._rreg(_ErrorReg) & 0x1B:        # BufferOvfl, CollErr, ParityErr, ProtocolErr
            return None
        n = self._rreg(_FIFOLevelReg) & 0x7F
        rx_last = self._rreg(_ControlReg) & 0x07
        return bytes([self._rreg(_FIFODataReg) for _ in range(n)]), rx_last

    def request(self, wake=False):
        """REQA (0x26) or WUPA (0x52, also wakes halted cards). Returns the 2-byte ATQA or None."""
        r = self._transceive([0x52 if wake else 0x26], 7)
        if r is None or len(r[0]) != 2 or r[1] != 0:
            return None
        return r[0]

    def anticoll(self):
        """Cascade level 1 anticollision. Returns the 5 bytes UID0..UID3 + BCC, or None."""
        self._clear(_CollReg, 0x80)          # ValuesAfterColl = 0
        r = self._transceive([0x93, 0x20])
        if r is None or len(r[0]) != 5:
            return None
        d = r[0]
        if d[0] ^ d[1] ^ d[2] ^ d[3] != d[4]:
            return None                      # BCC mismatch
        return d

    def select(self, uid_bcc):
        """SELECT cascade level 1. Returns the SAK byte or None."""
        frame = [0x93, 0x70] + list(uid_bcc)
        r = self._transceive(frame + crc_a(frame))
        if r is None or len(r[0]) != 3:
            return None
        d = r[0]
        if list(d[1:3]) != crc_a(d[0:1]):
            return None                      # CRC_A mismatch
        return d[0]

    def halt(self):
        """HLTA: the card goes to HALT and stays quiet until it leaves the field (or gets a WUPA)."""
        frame = [0x50, 0x00]
        self._transceive(frame + crc_a(frame))   # a card answers HLTA with silence

    def read_uid(self):
        """Look for a card. Returns its UID as bytes (4 bytes), or None if there is no (new) card.
        The card is halted afterwards, so the same card is reported once per tap."""
        if self.request() is None:
            return None
        uid_bcc = self.anticoll()
        if uid_bcc is None:
            return None
        sak = self.select(uid_bcc)
        if sak is None:
            return None
        if sak & 0x04:
            # Cascade bit: a 7- or 10-byte UID (e.g. NTAG); only its first 3 bytes are known here.
            self.halt()
            return None
        self.halt()
        return bytes(uid_bcc[0:4])
