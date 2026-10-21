# MAX17048 1-cell LiPo / Li-ion fuel gauge (Analog Devices / Maxim MAX17048-MAX17049 datasheet),
# MicroPython driver. I2C address 0x36 (0x6C write / 0x6D read). Every register is a 16-bit word
# sent MSB first at an even byte address; both bytes must be read (or written) in one transaction.
#   VCELL 0x02: 78.125 uV per LSB (whole 16-bit word)
#   SOC   0x04: 1/256 % per LSB (high byte = whole percent)
#   CRATE 0x16: signed, 0.208 %/hr per LSB
# The chip is powered from the battery (its VDD pin is the cell voltage), so it does not answer
# on the bus until a cell is plugged in.

_REG_VCELL = 0x02
_REG_SOC = 0x04
_REG_MODE = 0x06
_REG_VERSION = 0x08
_REG_HIBRT = 0x0A
_REG_CONFIG = 0x0C
_REG_VALRT = 0x14
_REG_CRATE = 0x16
_REG_VRESET = 0x18
_REG_STATUS = 0x1A
_REG_CMD = 0xFE


class MAX17048:
    def __init__(self, i2c, addr=0x36):
        self.i2c = i2c
        self.addr = addr
        ver = self._read(_REG_VERSION)
        if ver & 0xFFF0 != 0x0010:  # datasheet: VERSION reads 0x001_
            raise OSError('MAX17048 not found (VERSION=0x%04X): is a battery connected?' % ver)
        self.version = ver

    def _read(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return (d[0] << 8) | d[1]

    def _write(self, reg, value):
        self.i2c.writeto_mem(self.addr, reg, bytes([(value >> 8) & 0xFF, value & 0xFF]))

    def voltage(self):
        """Cell voltage in volts (78.125 uV per count, updated every 250 ms)."""
        return self._read(_REG_VCELL) * 78.125e-6

    def soc(self):
        """State of charge in percent (1/256 % per count). First valid about 1 s after power-up."""
        return self._read(_REG_SOC) / 256

    def charge_rate(self):
        """Approximate SOC change rate in %/hour (negative = discharging), 0.208 %/hr per count."""
        raw = self._read(_REG_CRATE)
        if raw & 0x8000:
            raw -= 0x10000
        return raw * 0.208

    def read(self):
        """Return (cell voltage in V, state of charge in %)."""
        return self.voltage(), self.soc()

    # --- alerts -----------------------------------------------------------------------------
    def status(self):
        """STATUS bits 13..8: SC, HD (SOC low), VR (reset), VL (under V), VH (over V), RI (reset indicator)."""
        return (self._read(_REG_STATUS) >> 8) & 0x3F

    def clear_alert(self):
        """Clear the STATUS alert bits and CONFIG.ALRT so the ALRT/INT pin releases."""
        st = self._read(_REG_STATUS)
        self._write(_REG_STATUS, st & 0x40FF)  # keep EnVR, clear SC/HD/VR/VL/VH/RI
        cfg = self._read(_REG_CONFIG)
        self._write(_REG_CONFIG, cfg & ~0x0020)

    def set_low_soc_alert(self, percent):
        """Alert when SOC falls past percent (1-32 %): CONFIG.ATHD = 32 - percent."""
        percent = max(1, min(32, int(percent)))
        cfg = self._read(_REG_CONFIG)
        self._write(_REG_CONFIG, (cfg & ~0x001F) | (32 - percent))

    def set_voltage_alert(self, vmin, vmax):
        """Alert while VCELL < vmin or > vmax (20 mV steps, 0 to 5.1 V)."""
        lo = max(0, min(255, int(vmin / 0.02)))
        hi = max(0, min(255, int(vmax / 0.02)))
        self._write(_REG_VALRT, (lo << 8) | hi)

    # --- control ----------------------------------------------------------------------------
    def quick_start(self):
        """Restart the SOC estimate from the present voltage (MODE.Quick-Start). Use with care:
        only when the cell is relaxed (no load/charging), see the datasheet's Quick-Start section."""
        self._write(_REG_MODE, 0x4000)

    def sleep(self, on=True):
        """Enter (or leave) sleep mode: MODE.EnSleep = 1, then CONFIG.SLEEP."""
        if on:
            self._write(_REG_MODE, 0x2000)
        cfg = self._read(_REG_CONFIG)
        self._write(_REG_CONFIG, (cfg | 0x0080) if on else (cfg & ~0x0080))

    def reset(self):
        """Power-on reset (write 0x5400 to CMD 0xFE). The chip does not ACK this write."""
        try:
            self._write(_REG_CMD, 0x5400)
        except OSError:
            pass
