# VCNL4040 proximity & ambient light sensor (Vishay, datasheet doc 84274), MicroPython driver.
# I2C address 0x60 (fixed). 16-bit registers ("command codes"), sent and received LSB first:
#   write: [command code, data byte low, data byte high]
#   read:  command code, repeated start, data byte low, data byte high.
# Lux = ALS counts x resolution: 0.1 / 0.05 / 0.025 / 0.0125 lx per step at ALS_IT 80 / 160 / 320 / 640 ms.
import time

_ALS_CONF = 0x00   # L: ALS_CONF, H: reserved (keep 0x00)
_ALS_THDH = 0x01
_ALS_THDL = 0x02
_PS_CONF12 = 0x03  # L: PS_CONF1, H: PS_CONF2
_PS_CONF3MS = 0x04  # L: PS_CONF3, H: PS_MS
_PS_CANC = 0x05
_PS_THDL = 0x06
_PS_THDH = 0x07
_PS_DATA = 0x08
_ALS_DATA = 0x09
_WHITE_DATA = 0x0A
_INT_FLAG = 0x0B   # H byte holds the flags; reading clears them
_ID = 0x0C         # 0x0186

# ALS_IT (ALS_CONF bits 7:6) keyed by integration time in ms, and the datasheet's lux/step (table 14)
_ALS_IT_BITS = {80: 0b00, 160: 0b01, 320: 0b10, 640: 0b11}
_ALS_RES = {80: 0.1, 160: 0.05, 320: 0.025, 640: 0.0125}

# PS_IT (PS_CONF1 bits 3:1): 1T, 1.5T, 2T, 2.5T, 3T, 3.5T, 4T, 8T
PS_IT_1T = 0b000
PS_IT_2T = 0b010
PS_IT_4T = 0b110
PS_IT_8T = 0b111

# LED_I (PS_MS bits 2:0)
LED_50MA = 0b000
LED_75MA = 0b001
LED_100MA = 0b010
LED_120MA = 0b011
LED_140MA = 0b100
LED_160MA = 0b101
LED_180MA = 0b110
LED_200MA = 0b111


class VCNL4040:
    def __init__(self, i2c, addr=0x60, als_it_ms=80, ps_it=PS_IT_8T, led_current=LED_100MA):
        self.i2c = i2c
        self.addr = addr
        ident = self._read(_ID)
        if ident != 0x0186:
            raise OSError('VCNL4040 not found at 0x%02X (ID 0x%04X)' % (addr, ident))
        # PS_CONF1: duty 1/40, persistence 1, PS_IT, PS_SD = 0 (on); PS_CONF2: PS_HD = 1 (16-bit), INT off
        self._write(_PS_CONF12, ((ps_it & 0x07) << 1) | (0x08 << 8))
        # PS_CONF3 = 0 (normal mode); PS_MS: White_EN = 0 (white channel on), logic mode off, LED current
        self._write(_PS_CONF3MS, (led_current & 0x07) << 8)
        self.configure_als(als_it_ms)

    def _read(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return d[0] | (d[1] << 8)  # data byte low first

    def _write(self, reg, value):
        self.i2c.writeto_mem(self.addr, reg, bytes([value & 0xFF, (value >> 8) & 0xFF]))

    def configure_als(self, it_ms=80):
        """Set the ALS integration time (80, 160, 320 or 640 ms) and power the ALS on.

        Longer times are more sensitive but saturate sooner: 80 ms = 0.1 lx/step up to 6553.5 lx,
        640 ms = 0.0125 lx/step up to 819.2 lx."""
        if it_ms not in _ALS_IT_BITS:
            raise ValueError('it_ms must be 80, 160, 320 or 640')
        self.als_it_ms = it_ms
        self.resolution = _ALS_RES[it_ms]
        # ALS_IT, ALS_PERS = 1, ALS_INT_EN = 0, ALS_SD = 0 (power on); high byte reserved = 0x00
        self._write(_ALS_CONF, _ALS_IT_BITS[it_ms] << 6)
        time.sleep_ms(it_ms + it_ms // 10 + 10)  # let the first full integration finish

    def als_raw(self):
        """ALS output counts (0..65535)."""
        return self._read(_ALS_DATA)

    def lux(self):
        """Ambient light in lx: ALS counts x lux/step for the integration time (datasheet table 14)."""
        return self.als_raw() * self.resolution

    def white(self):
        """White channel counts (0..65535); the datasheet gives no lux conversion for it."""
        return self._read(_WHITE_DATA)

    def proximity(self):
        """Proximity counts (16-bit, 0..65535): bigger = closer. Not a distance in mm; it
        depends on the target's colour, size and LED current, so calibrate thresholds in place."""
        return self._read(_PS_DATA)

    def interrupt_flags(self):
        """Read and clear INT_Flag (high byte of 0x0B): bit 6 PS_SPFLAG, 5 ALS_IF_L, 4 ALS_IF_H,
        1 PS_IF_CLOSE, 0 PS_IF_AWAY. Reading releases the INT pin."""
        return (self._read(_INT_FLAG) >> 8) & 0xFF

    def shutdown(self, off=True):
        """Shut down (ALS_SD = 1, PS_SD = 1; about 0.2 uA) or, with off=False, power both on again."""
        als = self._read(_ALS_CONF)
        ps = self._read(_PS_CONF12)
        if off:
            self._write(_ALS_CONF, als | 0x0001)
            self._write(_PS_CONF12, ps | 0x0001)
        else:
            self._write(_PS_CONF12, ps & ~0x0001)
            self._write(_ALS_CONF, als & ~0x0001)
            time.sleep_ms(self.als_it_ms + self.als_it_ms // 10 + 10)
