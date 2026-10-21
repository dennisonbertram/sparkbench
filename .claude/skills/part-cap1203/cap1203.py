# CAP1203 3-channel capacitive touch sensor (Microchip DS00001572B), MicroPython driver, I2C.
# Fixed I2C address 0x28 (SMBus address 0101_000, not configurable).
# Register map (datasheet Table 5-1):
#   0x00 Main Control: STBY[5] DSLEEP[4] INT[0]; writing INT = 0 releases ALERT# (board pin INT) and clears
#        the latched status bits of inputs that are no longer touched (Section 5.1 / 5.2.2)
#   0x02 General Status (TOUCH bit 0, MTP bit 1, MULT bit 2)
#   0x03 Sensor Input Status, bit 0 = CS1, bit 1 = CS2, bit 2 = CS3 (latched until INT is cleared)
#   0x10-0x12 delta counts CS1-CS3 (signed 8-bit, capped at 0x7F / 0x80)
#   0x1F Sensitivity Control: DELTA_SENSE[6:4] (default 010b = 32x), BASE_SHIFT[3:0]
#   0x27 Interrupt Enable (default 0x07), 0x2A Multiple Touch Config (default 0x80: blocking ON, 1 touch)
#   0xFD Product ID = 0x6D, 0xFE Manufacturer ID = 0x5D, 0xFF Revision = 0x00
# Timing: tCOMM_DLY up to 15 ms after power-up, first conversion tCONV_DLY 170-200 ms.
import time

_MAIN = 0x00
_GEN_STATUS = 0x02
_INPUT_STATUS = 0x03
_DELTA = 0x10
_SENSITIVITY = 0x1F
_INT_ENABLE = 0x27
_MTBLK = 0x2A
_PRODUCT_ID = 0xFD
_MFR_ID = 0xFE
_REVISION = 0xFF


class CAP1203:
    def __init__(self, i2c, addr=0x28, multi_touch=True):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(15)               # tCOMM_DLY
        pid = self._r(_PRODUCT_ID)
        mid = self._r(_MFR_ID)
        if pid != 0x6D or mid != 0x5D:
            raise OSError('CAP1203 not found at 0x%02X (product 0x%02X, maker 0x%02X)' % (addr, pid, mid))
        self.revision = self._r(_REVISION)
        if multi_touch:
            self._w(_MTBLK, 0x00)       # MULT_BLK_EN = 0: report every touched pad, not just the first
        self.clear_interrupt()

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _r(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def clear_interrupt(self):
        """Write INT = 0, keeping STBY/DSLEEP: releases the INT pin and clears released pads' status bits."""
        self._w(_MAIN, self._r(_MAIN) & ~0x01)

    def touched(self):
        """3-bit mask, bit 0 = CS1 (left pad), bit 1 = CS2 (middle), bit 2 = CS3 (right).
        Bits latch until INT is cleared, so a released pad drops out on the next read."""
        t = self._r(_INPUT_STATUS) & 0x07
        if t:
            self.clear_interrupt()
        return t

    def touched_pads(self):
        """List of touched pad numbers 1-3 (CS1-CS3)."""
        t = self.touched()
        return [n + 1 for n in range(3) if t & (1 << n)]

    def is_left(self):
        return bool(self.touched() & 0x01)

    def is_middle(self):
        return bool(self.touched() & 0x02)

    def is_right(self):
        return bool(self.touched() & 0x04)

    def delta(self, pad):
        """Signed delta count of pad 1-3 (two's complement)."""
        v = self._r(_DELTA + pad - 1)
        return v - 256 if v & 0x80 else v

    def set_sensitivity(self, level):
        """level 0 (128x, most sensitive) ... 7 (1x); default 2 (32x). BASE_SHIFT bits kept.
        SparkFun calibrated the on-board pads for the default; change it only for your own pads."""
        cur = self._r(_SENSITIVITY)
        self._w(_SENSITIVITY, (cur & 0x8F) | ((level & 0x07) << 4))

    def set_interrupts(self, enabled=True):
        """Enable/disable ALERT# (INT pin) for all three inputs (register 0x27)."""
        self._w(_INT_ENABLE, 0x07 if enabled else 0x00)
