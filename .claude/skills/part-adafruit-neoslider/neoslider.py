# Adafruit NeoSlider (product 5295): ATtiny817 running seesaw firmware, MicroPython driver.
# seesaw protocol: every access starts with a write of [module base, function register];
# for a read, wait briefly, then read the bytes back (all values big-endian).
import time

_STATUS_BASE = 0x00
_STATUS_HW_ID = 0x01
_STATUS_SWRST = 0x7F
_ADC_BASE = 0x09
_ADC_CHANNEL_OFFSET = 0x07
_NEOPIXEL_BASE = 0x0E
_NEOPIXEL_PIN = 0x01
_NEOPIXEL_BUF_LENGTH = 0x03
_NEOPIXEL_BUF = 0x04
_NEOPIXEL_SHOW = 0x05

_HW_IDS = (0x84, 0x85, 0x86, 0x87, 0x88, 0x89)  # ATtiny8xx/16xx seesaw chips (0x87 = ATtiny817 on this board)
_POT_PIN = 18        # slide potentiometer wiper, seesaw ADC pin 18
_PIXEL_PIN = 14      # 4 reverse-mount NeoPixels (GRB) on seesaw pin 14
_NUM_PIXELS = 4


class NeoSlider:
    def __init__(self, i2c, addr=0x30, reset=True):
        self.i2c = i2c
        self.addr = addr
        if reset:
            self._write(_STATUS_BASE, _STATUS_SWRST, b'\xff')
            time.sleep_ms(500)  # seesaw restarts after a software reset
        hw = self._read(_STATUS_BASE, _STATUS_HW_ID, 1)[0]
        if hw not in _HW_IDS:
            raise OSError('seesaw not found at 0x%02x (HW_ID 0x%02x): check the wiring' % (addr, hw))
        # Set up the NeoPixel output: pin 14, 4 pixels x 3 bytes (GRB).
        self._write(_NEOPIXEL_BASE, _NEOPIXEL_PIN, bytes([_PIXEL_PIN]))
        self._write(_NEOPIXEL_BASE, _NEOPIXEL_BUF_LENGTH, (_NUM_PIXELS * 3).to_bytes(2, 'big'))

    def _write(self, base, reg, data=b''):
        self.i2c.writeto(self.addr, bytes([base, reg]) + bytes(data))

    def _read(self, base, reg, n, delay_us=8000):
        self.i2c.writeto(self.addr, bytes([base, reg]))
        time.sleep_us(delay_us)  # seesaw needs time to fetch the value before the read
        return self.i2c.readfrom(self.addr, n)

    def position(self):
        """Slider position as the 10-bit ADC reading, 0-1023 (one end to the other)."""
        b = self._read(_ADC_BASE, _ADC_CHANNEL_OFFSET + _POT_PIN, 2)
        return (b[0] << 8) | b[1]

    def fill(self, r, g, b):
        """Set all four NeoPixels to one colour (0-255 each) and show it."""
        self._write(_NEOPIXEL_BASE, _NEOPIXEL_BUF, b'\x00\x00' + bytes([g, r, b]) * _NUM_PIXELS)
        self._write(_NEOPIXEL_BASE, _NEOPIXEL_SHOW)

    def set_pixel(self, i, r, g, b):
        """Set one NeoPixel (0-3); call show() afterwards."""
        self._write(_NEOPIXEL_BASE, _NEOPIXEL_BUF, (i * 3).to_bytes(2, 'big') + bytes([g, r, b]))

    def show(self):
        self._write(_NEOPIXEL_BASE, _NEOPIXEL_SHOW)
