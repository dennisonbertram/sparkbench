# Adafruit NeoKey 1x4 QT I2C (product 4980, ATSAMD09 running seesaw firmware), MicroPython driver.
# seesaw protocol: every access starts with a write of [module base, function register];
# for a read, wait briefly, then read the bytes back (all values big-endian).
import time

_STATUS_BASE = 0x00
_STATUS_HW_ID = 0x01
_STATUS_SWRST = 0x7F
_GPIO_BASE = 0x01
_GPIO_DIRCLR_BULK = 0x03
_GPIO_BULK = 0x04
_GPIO_BULK_SET = 0x05
_GPIO_INTENSET = 0x08
_GPIO_INTENCLR = 0x09
_GPIO_PULLENSET = 0x0B
_NEOPIXEL_BASE = 0x0E
_NEOPIXEL_PIN = 0x01
_NEOPIXEL_SPEED = 0x02
_NEOPIXEL_BUF_LENGTH = 0x03
_NEOPIXEL_BUF = 0x04
_NEOPIXEL_SHOW = 0x05

_HW_IDS = (0x55, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89)  # SAMD09 (this board) and ATtiny8xx/16xx seesaw chips
_KEY_MASK = 0xF0       # keys A-D are seesaw pins 4-7 (PA04-PA07), pressed = pulled to GND
_NEOPIXEL_SEESAW_PIN = 3  # PA03 drives the 4 WS2812B through a 74AHCT1G125 buffer
_NUM_KEYS = 4


class NeoKey1x4:
    def __init__(self, i2c, addr=0x30, reset=True, interrupt=False):
        self.i2c = i2c
        self.addr = addr
        if reset:
            self._write(_STATUS_BASE, _STATUS_SWRST, b'\xff')
            time.sleep_ms(500)  # seesaw restarts after a software reset
        hw = self._read(_STATUS_BASE, _STATUS_HW_ID, 1)[0]
        if hw not in _HW_IDS:
            raise OSError('seesaw not found at 0x%02x (HW_ID 0x%02x): check the wiring' % (addr, hw))
        # Keys: inputs with pull-ups (a pressed key shorts the pin to GND).
        mask = _KEY_MASK.to_bytes(4, 'big')
        self._write(_GPIO_BASE, _GPIO_DIRCLR_BULK, mask)
        self._write(_GPIO_BASE, _GPIO_PULLENSET, mask)
        self._write(_GPIO_BASE, _GPIO_BULK_SET, mask)
        self._write(_GPIO_BASE, _GPIO_INTENSET if interrupt else _GPIO_INTENCLR, mask)
        # NeoPixels: pin 3, 800 kHz, 4 pixels x 3 bytes (GRB).
        self._write(_NEOPIXEL_BASE, _NEOPIXEL_PIN, bytes([_NEOPIXEL_SEESAW_PIN]))
        self._write(_NEOPIXEL_BASE, _NEOPIXEL_SPEED, b'\x01')
        self._write(_NEOPIXEL_BASE, _NEOPIXEL_BUF_LENGTH, (_NUM_KEYS * 3).to_bytes(2, 'big'))

    def _write(self, base, reg, data=b''):
        self.i2c.writeto(self.addr, bytes([base, reg]) + bytes(data))

    def _read(self, base, reg, n, delay_us=8000):
        self.i2c.writeto(self.addr, bytes([base, reg]))
        time.sleep_us(delay_us)  # seesaw needs time to fetch the value before the read
        return self.i2c.readfrom(self.addr, n)

    def keys(self):
        """List of 4 booleans, True while key A, B, C, D (seesaw pins 4-7) is pressed."""
        b = self._read(_GPIO_BASE, _GPIO_BULK, 4)
        bits = (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]
        return [not (bits >> (4 + i)) & 1 for i in range(_NUM_KEYS)]

    def __getitem__(self, i):
        return self.keys()[i]

    def pixel(self, i, r, g, b, show=True):
        """Set the NeoPixel under key i (0-3) to r, g, b (0-255 each)."""
        if not 0 <= i < _NUM_KEYS:
            raise IndexError('key index 0-3')
        self._write(_NEOPIXEL_BASE, _NEOPIXEL_BUF, (i * 3).to_bytes(2, 'big') + bytes([g & 255, r & 255, b & 255]))
        if show:
            self.show()

    def fill(self, r, g, b):
        self._write(_NEOPIXEL_BASE, _NEOPIXEL_BUF, b'\x00\x00' + bytes([g & 255, r & 255, b & 255]) * _NUM_KEYS)
        self.show()

    def show(self):
        self._write(_NEOPIXEL_BASE, _NEOPIXEL_SHOW)
