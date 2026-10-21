# MPR121 12-channel capacitive touch controller (NXP/Freescale MPR121 datasheet rev 4), MicroPython driver.
# Register map (datasheet Table 2):
#   0x00/0x01  touch status, bits 0-11 = ELE0-ELE11 (bit 12 ELEPROX, bit 15 OVCF over-current flag)
#   0x04-0x1D  10-bit filtered electrode data, LSB then MSB per channel
#   0x1E-0x2A  baseline values (upper 8 of 10 bits: shift left 2 before comparing)
#   0x2B-0x40  baseline filter (MHD/NHD/NCL/FDL), 0x41-0x5A touch/release thresholds
#   0x5B debounce, 0x5C/0x5D global CDC / CDT + filters, 0x5E ECR (run/stop), 0x80 soft reset (write 0x63)
# Configuration registers can only be written in Stop Mode (ECR = 0); this driver writes ECR last.
import time

_TOUCH_STATUS = 0x00
_FILTERED = 0x04
_BASELINE = 0x1E
_MHDR = 0x2B
_TOUCH_TH = 0x41
_DEBOUNCE = 0x5B
_CONFIG1 = 0x5C
_CONFIG2 = 0x5D
_ECR = 0x5E
_SOFT_RESET = 0x80


class MPR121:
    def __init__(self, i2c, addr=0x5A, touch=12, release=6):
        """addr 0x5A (ADDR to GND, board default), 0x5B (VDD), 0x5C (SDA) or 0x5D (SCL)."""
        self.i2c = i2c
        self.addr = addr
        self._w(_SOFT_RESET, 0x63)          # soft reset: all registers back to POR values
        time.sleep_ms(1)
        self._w(_ECR, 0x00)                 # Stop Mode so configuration registers accept writes
        # After reset every register is 0 except 0x5C = 0x10 and 0x5D = 0x24: use 0x5D as an identity check.
        if self._r(_CONFIG2) != 0x24:
            raise OSError('MPR121 not found at 0x%02X (CONFIG2 != 0x24)' % addr)
        self.set_thresholds(touch, release)
        # Baseline filter: MHDR NHDR NCLR FDLR MHDF NHDF NCLF FDLF NHDT NCLT FDLT (0x2B-0x35),
        # the values used by the Adafruit_MPR121 library (AN3891 baseline filtering).
        self.i2c.writeto_mem(self.addr, _MHDR, bytes([0x01, 0x01, 0x0E, 0x00, 0x01, 0x05, 0x01, 0x00, 0x00, 0x00, 0x00]))
        self._w(_DEBOUNCE, 0x00)            # no debounce
        self._w(_CONFIG1, 0x10)             # FFI = 6 samples, CDC = 16 uA
        self._w(_CONFIG2, 0x20)             # CDT = 0.5 us, SFI = 4 samples, ESI = 1 ms
        # Run Mode: CL = 0b10 (baseline tracking, baseline loaded from first reading), ELE0-ELE11 enabled.
        self._w(_ECR, 0x80 | 0x0C)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _r(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def set_thresholds(self, touch, release):
        """Touch when baseline - data > touch; release when baseline - data < release (0-255, typ. 4-16).
        Only allowed in Stop Mode, so the ECR is saved, cleared and restored."""
        ecr = self._r(_ECR)
        if ecr:
            self._w(_ECR, 0x00)
        buf = bytearray()
        for _ in range(12):
            buf.append(touch & 0xFF)
            buf.append(release & 0xFF)
        self.i2c.writeto_mem(self.addr, _TOUCH_TH, buf)
        if ecr:
            self._w(_ECR, ecr)

    def touched(self):
        """12-bit mask, bit n set = electrode n touched."""
        d = self.i2c.readfrom_mem(self.addr, _TOUCH_STATUS, 2)
        return (d[0] | (d[1] << 8)) & 0x0FFF

    def is_touched(self, n):
        return bool(self.touched() & (1 << n))

    def filtered_data(self, n):
        """10-bit filtered electrode data (0-1023, falls when touched)."""
        d = self.i2c.readfrom_mem(self.addr, _FILTERED + 2 * n, 2)
        return d[0] | ((d[1] & 0x03) << 8)

    def baseline_data(self, n):
        """10-bit baseline (register holds the upper 8 bits)."""
        return self._r(_BASELINE + n) << 2

    def over_current(self):
        """True if the OVCF flag is set (REXT over-current; chip stopped)."""
        return bool(self._r(0x01) & 0x80)
