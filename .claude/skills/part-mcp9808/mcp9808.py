# MCP9808 precision temperature sensor (Microchip DS20005095B), MicroPython driver.
# 16-bit registers, MSB first. Ambient temperature register TA (0x05):
#   bits 15..13 = alert flags (TA >= TCRIT, TA > TUPPER, TA < TLOWER), bit 12 = sign,
#   bits 11..0 = temperature in 0.0625 degC steps (two's complement with the sign bit).
import time

_REG_CONFIG = 0x01
_REG_TA = 0x05
_REG_MANUF_ID = 0x06
_REG_DEVICE_ID = 0x07
_REG_RESOLUTION = 0x08

# Resolution register value -> typical conversion time (ms), datasheet Register 5-7
_TCONV_MS = {0: 30, 1: 65, 2: 130, 3: 250}


class MCP9808:
    def __init__(self, i2c, addr=0x18):
        self.i2c = i2c
        self.addr = addr
        manuf = self._read16(_REG_MANUF_ID)
        dev = self._read16(_REG_DEVICE_ID) >> 8
        if manuf != 0x0054 or dev != 0x04:
            raise OSError('MCP9808 not found at 0x%02X (manufacturer 0x%04X, device 0x%02X)' % (addr, manuf, dev))

    def _read16(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return (d[0] << 8) | d[1]

    def _write16(self, reg, value):
        self.i2c.writeto_mem(self.addr, reg, bytes([(value >> 8) & 0xFF, value & 0xFF]))

    def set_resolution(self, res):
        """0 = 0.5 C (30 ms), 1 = 0.25 C (65 ms), 2 = 0.125 C (130 ms), 3 = 0.0625 C (250 ms, power-up default)."""
        self.i2c.writeto_mem(self.addr, _REG_RESOLUTION, bytes([res & 0x03]))
        time.sleep_ms(_TCONV_MS[res & 0x03])

    def shutdown(self, off=True):
        """Set or clear CONFIG bit 8 (SHDN). In shutdown the chip draws about 0.1 uA and stops converting."""
        cfg = self._read16(_REG_CONFIG)
        cfg = (cfg | 0x0100) if off else (cfg & ~0x0100)
        self._write16(_REG_CONFIG, cfg)
        if not off:
            time.sleep_ms(250)  # wait one full conversion before reading

    def temperature(self):
        """Ambient temperature in degC (datasheet Equation 5-1)."""
        raw = self._read16(_REG_TA) & 0x1FFF  # mask the three alert flag bits
        t = (raw & 0x0FFF) / 16
        if raw & 0x1000:  # sign bit: TA < 0 degC
            t -= 256
        return t
