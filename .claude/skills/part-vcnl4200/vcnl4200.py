# VCNL4200 long-distance proximity & ambient light sensor (Vishay, datasheet doc 84430), MicroPython driver.
# I2C address 0x51 (fixed). 16-bit registers ("command codes"), sent and received LSB first:
#   write: [command code, data byte low, data byte high]
#   read:  command code, repeated start, data byte low, data byte high.
# Lux = ALS counts x resolution: 0.024 / 0.012 / 0.006 / 0.003 lx per step at ALS_IT 50 / 100 / 200 / 400 ms
# (datasheet table 14; maximum 1573 / 786 / 393 / 197 lx).
import time

_ALS_CONF = 0x00    # L: ALS_CONF, H: reserved, must be kept at 0x01
_ALS_THDH = 0x01
_ALS_THDL = 0x02
_PS_CONF12 = 0x03   # L: PS_CONF1, H: PS_CONF2
_PS_CONF3MS = 0x04  # L: PS_CONF3, H: PS_MS
_PS_CANC = 0x05
_PS_THDL = 0x06
_PS_THDH = 0x07
_PS_DATA = 0x08
_ALS_DATA = 0x09
_WHITE_DATA = 0x0A
_INT_FLAG = 0x0D    # H byte holds the flags; reading clears them
_ID = 0x0E          # 0x1058 (ID_L = 0x58; ID_H bits 3:0 = version code)

# ALS_IT (ALS_CONF bits 7:6) keyed by integration time in ms, and the datasheet's lux/step (table 14)
_ALS_IT_BITS = {50: 0b00, 100: 0b01, 200: 0b10, 400: 0b11}
_ALS_RES = {50: 0.024, 100: 0.012, 200: 0.006, 400: 0.003}

# PS_IT (PS_CONF1 bits 3:1): 1T, 1.5T, 2T, 4T, 8T, 9T (110 and 111 are reserved)
PS_IT_1T = 0b000
PS_IT_1_5T = 0b001
PS_IT_2T = 0b010
PS_IT_4T = 0b011
PS_IT_8T = 0b100
PS_IT_9T = 0b101

# PS_Duty (PS_CONF1 bits 7:6): IRED on/off ratio
PS_DUTY_160 = 0b00
PS_DUTY_320 = 0b01
PS_DUTY_640 = 0b10
PS_DUTY_1280 = 0b11

# LED_I (PS_MS bits 2:0). On boards that drive the IRED through an external MOSFET (Adafruit #6064),
# this only drives the FET gate and the datasheet says 50 mA is enough; the IRED current is set by RLED.
LED_50MA = 0b000
LED_75MA = 0b001
LED_100MA = 0b010
LED_120MA = 0b011
LED_140MA = 0b100
LED_160MA = 0b101
LED_180MA = 0b110
LED_200MA = 0b111


class VCNL4200:
    def __init__(self, i2c, addr=0x51, als_it_ms=50, ps_it=PS_IT_8T, ps_duty=PS_DUTY_160, led_current=LED_50MA):
        self.i2c = i2c
        self.addr = addr
        ident = self._read(_ID)
        if ident & 0xFF != 0x58:
            raise OSError('VCNL4200 not found at 0x%02X (ID 0x%04X)' % (addr, ident))
        # PS_CONF1: duty, persistence 1, PS_IT, PS_SD = 0 (on); PS_CONF2: PS_HD = 1 (16-bit output), PS_INT off
        self._write(_PS_CONF12, ((ps_duty & 0x03) << 6) | ((ps_it & 0x07) << 1) | (0x08 << 8))
        # PS_CONF3 = 0 (1 pulse, normal mode, sunlight cancel off); PS_MS: normal (interrupt) mode, LED_I
        self._write(_PS_CONF3MS, (led_current & 0x07) << 8)
        self.configure_als(als_it_ms)

    def _read(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return d[0] | (d[1] << 8)  # data byte low first

    def _write(self, reg, value):
        self.i2c.writeto_mem(self.addr, reg, bytes([value & 0xFF, (value >> 8) & 0xFF]))

    def configure_als(self, it_ms=50):
        """Set the ALS integration time (50, 100, 200 or 400 ms) and power the ALS on.

        Longer times are more sensitive but saturate sooner: 50 ms = 0.024 lx/step up to 1573 lx,
        400 ms = 0.003 lx/step up to 197 lx."""
        if it_ms not in _ALS_IT_BITS:
            raise ValueError('it_ms must be 50, 100, 200 or 400')
        self.als_it_ms = it_ms
        self.resolution = _ALS_RES[it_ms]
        # ALS_IT, ALS_INT_SWITCH = 0, ALS_PERS = 1, ALS_INT_EN = 0, ALS_SD = 0 (power on);
        # high byte reserved, must stay 0x01 (table 3)
        self._write(_ALS_CONF, (_ALS_IT_BITS[it_ms] << 6) | 0x0100)
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
        """Proximity counts (16-bit, 0..65535): bigger = closer. Not a distance in mm; it depends on
        the target's colour and size and on the IRED drive, so calibrate thresholds in place."""
        return self._read(_PS_DATA)

    def interrupt_flags(self):
        """Read and clear INT_Flag (high byte of 0x0D): bit 7 PS_UPFLAG (saturated), 6 PS_SPFLAG,
        5 ALS_IF_L, 4 ALS_IF_H, 1 PS_IF_CLOSE, 0 PS_IF_AWAY. Reading releases the INT pin."""
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
