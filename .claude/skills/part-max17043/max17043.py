# MAX17043 1-cell LiPo / Li-ion fuel gauge (Maxim / Analog Devices MAX17043-MAX17044 datasheet),
# MicroPython driver. I2C address 0x36 (0x6C write / 0x6D read). Every register is a 16-bit word
# sent MSB first at an even byte address; reads and writes are only valid if all 16 bits are moved
# in one transaction.
#   VCELL 0x02: 12-bit result in bits 15..4 (bits 3..0 read 0), 1.25 mV per count
#   SOC   0x04: high byte = whole percent, low byte = 1/256 %
#   MODE  0x06: write 0x4000 = quick-start
#   VERSION 0x08, CONFIG 0x0C (default 0x971C: RCOMP 0x97, SLEEP bit 7, ALRT bit 5, ATHD bits 4..0)
#   COMMAND 0xFE: write 0x5400 = power-on reset
# The chip is powered from the battery (VDD 2.5-4.5 V), so it does not answer until a cell is connected.

_REG_VCELL = 0x02
_REG_SOC = 0x04
_REG_MODE = 0x06
_REG_VERSION = 0x08
_REG_CONFIG = 0x0C
_REG_CMD = 0xFE


class MAX17043:
    def __init__(self, i2c, addr=0x36):
        self.i2c = i2c
        self.addr = addr
        try:
            self.version = self._read(_REG_VERSION)
        except OSError:
            raise OSError('MAX17043 not found at 0x%02X: is a battery connected?' % addr)

    def _read(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return (d[0] << 8) | d[1]

    def _write(self, reg, value):
        self.i2c.writeto_mem(self.addr, reg, bytes([(value >> 8) & 0xFF, value & 0xFF]))

    def voltage(self):
        """Cell voltage in volts: VCELL >> 4 counts of 1.25 mV (updated every 500 ms)."""
        return (self._read(_REG_VCELL) >> 4) * 0.00125

    def soc(self):
        """State of charge in percent (high byte = %, low byte = 1/256 %). First valid 125 ms after POR."""
        return self._read(_REG_SOC) / 256

    def read(self):
        """Return (cell voltage in V, state of charge in %)."""
        return self.voltage(), self.soc()

    # --- alert --------------------------------------------------------------------------------
    def alert(self):
        """True while the CONFIG.ALRT flag is set (SOC fell below the alert threshold)."""
        return bool(self._read(_REG_CONFIG) & 0x0020)

    def clear_alert(self):
        """Clear CONFIG.ALRT so the ALRT pin releases (only software can clear it)."""
        self._write(_REG_CONFIG, self._read(_REG_CONFIG) & ~0x0020)

    def set_alert_threshold(self, percent):
        """Low-SOC alert threshold, 1-32 %: ATHD = 32 - percent (00000 = 32 %, 11111 = 1 %)."""
        percent = max(1, min(32, int(percent)))
        cfg = self._read(_REG_CONFIG)
        self._write(_REG_CONFIG, (cfg & ~0x001F) | ((32 - percent) & 0x1F))

    def set_rcomp(self, rcomp):
        """Battery compensation byte (CONFIG high byte, default 0x97)."""
        cfg = self._read(_REG_CONFIG)
        self._write(_REG_CONFIG, ((rcomp & 0xFF) << 8) | (cfg & 0x00FF))

    # --- control ------------------------------------------------------------------------------
    def quick_start(self):
        """Restart the SOC estimate from the present voltage (MODE = 0x4000). Only when the cell is
        relaxed (no heavy load or charging), otherwise the first guess is wrong."""
        self._write(_REG_MODE, 0x4000)

    def sleep(self, on=True):
        """CONFIG.SLEEP = 1 halts the gauge; writing it back to 0 wakes it (VCELL updates 500 ms later)."""
        cfg = self._read(_REG_CONFIG)
        self._write(_REG_CONFIG, (cfg | 0x0080) if on else (cfg & ~0x0080))

    def reset(self):
        """Power-on reset (COMMAND = 0x5400). The chip does not ACK this write."""
        try:
            self._write(_REG_CMD, 0x5400)
        except OSError:
            pass
