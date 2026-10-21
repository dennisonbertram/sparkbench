# TMP117 high-accuracy digital temperature sensor (Texas Instruments SNOSD82D), MicroPython driver.
# 16-bit registers, MSB first; the first byte written is the register pointer:
#   0x00 Temp_Result (read-only, two's complement, 7.8125 m°C per LSB, reads 0x8000 = -256 °C
#        until the first conversion after power-up or reset)
#   0x01 Configuration (factory default 0x0220: continuous conversion, 8 averages, 1 s cycle)
#   0x02 THigh_Limit, 0x03 TLow_Limit, 0x07 Temp_Offset (all 7.8125 m°C per LSB)
#   0x0F Device_ID (bits 11..0 = 0x117, bits 15..12 = revision)
import time

_REG_TEMP = 0x00
_REG_CONFIG = 0x01
_REG_THIGH = 0x02
_REG_TLOW = 0x03
_REG_OFFSET = 0x07
_REG_DEVICE_ID = 0x0F

_LSB = 0.0078125      # °C per LSB (7.8125 m°C)
_RESET_VALUE = 0x8000  # Temp_Result before the first conversion (-256 °C)

_CFG_HIGH_ALERT = 0x8000
_CFG_LOW_ALERT = 0x4000
_CFG_DATA_READY = 0x2000
_CFG_EEPROM_BUSY = 0x1000
_CFG_MOD = 0x0C00      # MOD[1:0]: 00 continuous, 01 shutdown, 11 one-shot
_CFG_CONV = 0x0380     # CONV[2:0]
_CFG_AVG = 0x0060      # AVG[1:0]
_CFG_SOFT_RESET = 0x0002

MODE_CONTINUOUS = 0
MODE_SHUTDOWN = 1
MODE_ONE_SHOT = 3

AVG_1 = 0   # no averaging, 15.5 ms per conversion
AVG_8 = 1   # factory default, 124 ms active time
AVG_32 = 2
AVG_64 = 3

_AVG_MS = (16, 125, 500, 1000)  # active conversion time for each AVG setting (15.5 ms x N)


def _to_signed(raw):
    return raw - 0x10000 if raw & 0x8000 else raw


class TMP117:
    def __init__(self, i2c, addr=0x48):
        self.i2c = i2c
        self.addr = addr
        dev = self._read16(_REG_DEVICE_ID)
        if dev & 0x0FFF != 0x117:
            raise OSError('TMP117 not found at 0x%02X (device ID 0x%04X)' % (addr, dev))

    def _read16(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return (d[0] << 8) | d[1]

    def _write16(self, reg, value):
        self.i2c.writeto_mem(self.addr, reg, bytes([(value >> 8) & 0xFF, value & 0xFF]))

    def temperature(self):
        """Latest conversion in °C (continuous mode). After power-up the register holds -256 °C
        until the first conversion finishes (1.5 ms power-up + 124 ms with the default 8 averages)."""
        t0 = time.ticks_ms()
        while True:
            raw = self._read16(_REG_TEMP)
            if raw != _RESET_VALUE:
                return _to_signed(raw) * _LSB
            if time.ticks_diff(time.ticks_ms(), t0) > 1100:
                raise OSError('TMP117 has no conversion result yet (shut down?)')
            time.sleep_ms(20)

    def config(self):
        """Raw configuration register. Note: reading it clears Data_Ready and the alert flags."""
        return self._read16(_REG_CONFIG)

    def set_mode(self, mode=MODE_CONTINUOUS, averaging=None, conv=None):
        """Write MOD (and optionally AVG[1:0] / CONV[2:0]) without touching the other bits."""
        cfg = self._read16(_REG_CONFIG) & 0x03FC & ~_CFG_SOFT_RESET
        cfg = (cfg & ~_CFG_MOD) | ((mode & 3) << 10)
        if averaging is not None:
            cfg = (cfg & ~_CFG_AVG) | ((averaging & 3) << 5)
        if conv is not None:
            cfg = (cfg & ~_CFG_CONV) | ((conv & 7) << 7)
        self._write16(_REG_CONFIG, cfg)

    def one_shot(self, timeout_ms=1500):
        """Start a one-shot conversion (MOD = 11), wait for Data_Ready, return °C.
        The device returns to shutdown afterwards."""
        self.set_mode(MODE_ONE_SHOT)
        avg = (self._read16(_REG_CONFIG) & _CFG_AVG) >> 5
        t0 = time.ticks_ms()
        time.sleep_ms(_AVG_MS[avg])
        while not (self._read16(_REG_CONFIG) & _CFG_DATA_READY):
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('TMP117 one-shot conversion timed out')
            time.sleep_ms(5)
        return _to_signed(self._read16(_REG_TEMP)) * _LSB

    def soft_reset(self):
        """Soft reset (config bit 1): reloads EEPROM defaults, takes about 2 ms."""
        self._write16(_REG_CONFIG, _CFG_SOFT_RESET)
        time.sleep_ms(3)

    def limits(self):
        """(low, high) alert limits in °C; factory values are -256 and 192."""
        return _to_signed(self._read16(_REG_TLOW)) * _LSB, _to_signed(self._read16(_REG_THIGH)) * _LSB

    def set_limits(self, low, high):
        """Write the alert limits (volatile; not stored in EEPROM)."""
        self._write16(_REG_TLOW, int(round(low / _LSB)) & 0xFFFF)
        self._write16(_REG_THIGH, int(round(high / _LSB)) & 0xFFFF)
