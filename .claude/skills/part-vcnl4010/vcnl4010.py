# VCNL4010 proximity & ambient light sensor (Vishay, datasheet doc 83462), MicroPython driver.
# I2C address 0x13 (fixed). Seventeen 8-bit registers 0x80..0x90; 16-bit results are stored
# high byte first (0x85/0x86 ambient light, 0x87/0x88 proximity) and auto-increment on read.
# Ambient light: lux = counts x 0.25 lx (datasheet: 0.25 lx per LSB, 0.25 to 16383 lx).
# Proximity: unitless 16-bit counts of reflected IR, bigger = closer.
import time

_COMMAND = 0x80      # b7 config_lock (RO), b6 als_data_rdy, b5 prox_data_rdy, b4 als_od, b3 prox_od,
                     # b2 als_en, b1 prox_en, b0 selftimed_en
_PRODUCT_ID = 0x81   # 0x21: product ID 2, revision 1
_PROX_RATE = 0x82    # bits 2:0
_IR_LED = 0x83       # bits 5:0 = current / 10 mA (0..20); bits 7:6 fuse prog ID (read only)
_ALS_PARAM = 0x84    # b7 continuous conversion, b6:4 als_rate, b3 auto offset, b2:0 averaging (2^n)
_ALS_RESULT = 0x85   # high byte, 0x86 low byte
_PROX_RESULT = 0x87  # high byte, 0x88 low byte
_INT_CTRL = 0x89
_INT_STATUS = 0x8E
_MOD_TIMING = 0x8F

_ALS_DATA_RDY = 0x40
_PROX_DATA_RDY = 0x20
_ALS_OD = 0x10
_PROX_OD = 0x08
_ALS_EN = 0x04
_PROX_EN = 0x02
_SELFTIMED_EN = 0x01

LUX_PER_COUNT = 0.25

# Proximity rate (register 0x82), measurements per second
PROX_RATE_1_95 = 0
PROX_RATE_3_9 = 1
PROX_RATE_7_8 = 2
PROX_RATE_16_6 = 3
PROX_RATE_31_25 = 4
PROX_RATE_62_5 = 5
PROX_RATE_125 = 6
PROX_RATE_250 = 7

# Ambient light rate (register 0x84 bits 6:4), samples per second
ALS_RATE_1 = 0
ALS_RATE_2 = 1
ALS_RATE_3 = 2
ALS_RATE_4 = 3
ALS_RATE_5 = 4
ALS_RATE_6 = 5
ALS_RATE_8 = 6
ALS_RATE_10 = 7


class VCNL4010:
    def __init__(self, i2c, addr=0x13, led_ma=200, prox_rate=PROX_RATE_16_6,
                 als_rate=ALS_RATE_10, als_averaging=5):
        """Check the ID, configure and start self-timed (periodic) proximity and ALS measurements.

        led_ma: IR LED current 0..200 mA in 10 mA steps. als_averaging: n for 2^n conversions
        per reading (0..7, default 5 = 32). Each ALS reading takes a 100 ms frame."""
        self.i2c = i2c
        self.addr = addr
        pid = self._r8(_PRODUCT_ID)
        if (pid >> 4) != 2:
            raise OSError('VCNL4010 not found at 0x%02X (ID 0x%02X)' % (addr, pid))
        # Rates may only be changed while selftimed_en = 0, so stop first.
        self._w8(_COMMAND, 0x00)
        self.set_led_current(led_ma)
        self._w8(_PROX_RATE, prox_rate & 0x07)
        # Continuous conversion off, rate, auto offset compensation on, averaging 2^n
        self._w8(_ALS_PARAM, ((als_rate & 0x07) << 4) | 0x08 | (als_averaging & 0x07))
        self._w8(_MOD_TIMING, 0x01)  # Vishay recommended value (delay 0, 390.625 kHz, dead time 1)
        self._w8(_INT_CTRL, 0x00)    # no interrupts
        self.start()

    def _r8(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _w8(self, reg, value):
        self.i2c.writeto_mem(self.addr, reg, bytes([value & 0xFF]))

    def _r16(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)  # auto-increment: high byte, then low byte
        return (d[0] << 8) | d[1]

    def set_led_current(self, ma):
        """IR LED current for proximity, 0..200 mA in 10 mA steps (stops self-timed mode briefly)."""
        ma = max(0, min(200, int(ma)))
        cmd = self._r8(_COMMAND) & 0x07
        if cmd & _SELFTIMED_EN:
            self._w8(_COMMAND, 0x00)
        self._w8(_IR_LED, ma // 10)
        if cmd & _SELFTIMED_EN:
            self._w8(_COMMAND, cmd)

    def start(self):
        """Enable self-timed ALS + proximity measurements and wait for the first results."""
        self._w8(_COMMAND, _SELFTIMED_EN | _PROX_EN | _ALS_EN)
        time.sleep_ms(250)  # ALS frame is 100 ms; slowest default rates need a little longer

    def stop(self):
        """Stop measuring (standby, about 1.5 uA)."""
        self._w8(_COMMAND, 0x00)

    def als_raw(self):
        """Latest ambient light result (0..65535 counts)."""
        return self._r16(_ALS_RESULT)

    def lux(self):
        """Ambient light in lx: counts x 0.25 lx (datasheet basic characteristics)."""
        return self._r16(_ALS_RESULT) * LUX_PER_COUNT

    def proximity(self):
        """Latest proximity result (0..65535 counts): bigger = closer. Not a distance."""
        return self._r16(_PROX_RESULT)

    def read_on_demand(self, timeout_ms=500):
        """Single on-demand ALS + proximity measurement (self-timed mode must be off).

        Returns (lux, proximity). Polls the data-ready flags in the command register."""
        self.stop()
        self._w8(_COMMAND, _ALS_OD | _PROX_OD)
        t0 = time.ticks_ms()
        want = _ALS_DATA_RDY | _PROX_DATA_RDY
        while (self._r8(_COMMAND) & want) != want:
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('VCNL4010 measurement timed out')
            time.sleep_ms(5)
        return self.lux(), self.proximity()

    def interrupt_status(self, clear=True):
        """Read register 0x8E (b3 prox ready, b2 als ready, b1 low threshold, b0 high threshold);
        writing 1s clears the bits and releases INT."""
        s = self._r8(_INT_STATUS) & 0x0F
        if clear and s:
            self._w8(_INT_STATUS, s)
        return s
