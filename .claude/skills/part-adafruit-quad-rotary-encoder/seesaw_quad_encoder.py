# Adafruit I2C Quad Rotary Encoder breakout (product 5752, ATtiny817 running seesaw firmware), MicroPython driver.
# seesaw protocol: every access starts with a write of [module base, function register];
# for a read, wait briefly, then read the bytes back (all values big-endian).
import time

_STATUS_BASE = 0x00
_STATUS_HW_ID = 0x01
_STATUS_VERSION = 0x02
_STATUS_SWRST = 0x7F
_GPIO_BASE = 0x01
_GPIO_DIRCLR_BULK = 0x03
_GPIO_BULK = 0x04
_GPIO_BULK_SET = 0x05
_GPIO_PULLENSET = 0x0B
_NEOPIXEL_BASE = 0x0E
_NEOPIXEL_PIN = 0x01
_NEOPIXEL_SPEED = 0x02
_NEOPIXEL_BUF_LENGTH = 0x03
_NEOPIXEL_BUF = 0x04
_NEOPIXEL_SHOW = 0x05
_ENCODER_BASE = 0x11
_ENCODER_POSITION = 0x30  # + encoder number (0-3)
_ENCODER_DELTA = 0x40     # + encoder number (0-3)

_HW_IDS = (0x55, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89)  # 0x87 = ATtiny817 (this board)
_PRODUCT_ID = 5752
_SWITCH_PINS = (12, 14, 17, 9)  # seesaw pins of the push switches of encoders #0-#3
_NEOPIXEL_SEESAW_PIN = 18
_NUM = 4


class QuadEncoder:
    def __init__(self, i2c, addr=0x49, reset=True):
        self.i2c = i2c
        self.addr = addr
        if reset:
            self._write(_STATUS_BASE, _STATUS_SWRST, b'\xff')
            time.sleep_ms(500)  # seesaw restarts after a software reset
        hw = self._read(_STATUS_BASE, _STATUS_HW_ID, 1)[0]
        if hw not in _HW_IDS:
            raise OSError('seesaw not found at 0x%02x (HW_ID 0x%02x): check the wiring' % (addr, hw))
        v = self._read(_STATUS_BASE, _STATUS_VERSION, 4)
        pid = (v[0] << 8) | v[1]
        if pid != _PRODUCT_ID:
            raise OSError('seesaw at 0x%02x is product %d, not the quad encoder 5752' % (addr, pid))
        # Push switches: inputs with pull-ups (a pressed knob pulls its pin to GND).
        m = 0
        for p in _SWITCH_PINS:
            m |= 1 << p
        mask = m.to_bytes(4, 'big')
        self._write(_GPIO_BASE, _GPIO_DIRCLR_BULK, mask)
        self._write(_GPIO_BASE, _GPIO_PULLENSET, mask)
        self._write(_GPIO_BASE, _GPIO_BULK_SET, mask)
        # NeoPixels: seesaw pin 18, 800 kHz, 4 pixels x 3 bytes (GRB).
        self._write(_NEOPIXEL_BASE, _NEOPIXEL_PIN, bytes([_NEOPIXEL_SEESAW_PIN]))
        self._write(_NEOPIXEL_BASE, _NEOPIXEL_SPEED, b'\x01')
        self._write(_NEOPIXEL_BASE, _NEOPIXEL_BUF_LENGTH, (_NUM * 3).to_bytes(2, 'big'))

    def _write(self, base, reg, data=b''):
        self.i2c.writeto(self.addr, bytes([base, reg]) + bytes(data))

    def _read(self, base, reg, n, delay_us=8000):
        self.i2c.writeto(self.addr, bytes([base, reg]))
        time.sleep_us(delay_us)  # seesaw needs time to fetch the value before the read
        return self.i2c.readfrom(self.addr, n)

    @staticmethod
    def _int32(b):
        v = (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]
        return v - (1 << 32) if v & 0x80000000 else v

    @staticmethod
    def _check(n):
        if not 0 <= n < _NUM:
            raise IndexError('encoder number 0-3')

    def position(self, n=0):
        """Position of encoder n (0-3) in detents (signed 32-bit counter kept by seesaw)."""
        self._check(n)
        return self._int32(self._read(_ENCODER_BASE, _ENCODER_POSITION + n, 4))

    def positions(self):
        return [self.position(n) for n in range(_NUM)]

    def set_position(self, n, pos):
        self._check(n)
        self._write(_ENCODER_BASE, _ENCODER_POSITION + n, (pos & 0xFFFFFFFF).to_bytes(4, 'big'))

    def delta(self, n=0):
        """Detents encoder n turned since its last delta() read (reading clears it)."""
        self._check(n)
        return self._int32(self._read(_ENCODER_BASE, _ENCODER_DELTA + n, 4))

    def _gpio(self):
        b = self._read(_GPIO_BASE, _GPIO_BULK, 4)
        return (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]

    def pressed(self, n=0):
        """True while knob n (0-3) is pushed in."""
        self._check(n)
        return not (self._gpio() >> _SWITCH_PINS[n]) & 1

    def pressed_all(self):
        bits = self._gpio()
        return [not (bits >> p) & 1 for p in _SWITCH_PINS]

    def pixel(self, n, r, g, b, show=True):
        """Set the NeoPixel under encoder n (0-3) to r, g, b (0-255 each)."""
        self._check(n)
        self._write(_NEOPIXEL_BASE, _NEOPIXEL_BUF, (n * 3).to_bytes(2, 'big') + bytes([g & 255, r & 255, b & 255]))
        if show:
            self.show()

    def show(self):
        self._write(_NEOPIXEL_BASE, _NEOPIXEL_SHOW)
