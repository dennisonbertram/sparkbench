# Adafruit ANO Rotary Navigation Encoder to I2C adapter (product 5740 / 6310, ATtiny816 running
# seesaw firmware), MicroPython driver.
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
_ENCODER_BASE = 0x11
_ENCODER_POSITION = 0x30
_ENCODER_DELTA = 0x40

_HW_IDS = (0x55, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89)  # seesaw chips; this board's ATtiny816 reads 0x86
PRODUCT_ID = 5740  # upper 16 bits of STATUS_VERSION on the ANO firmware

# seesaw pins of the five ANO buttons (pressed pulls the pin to GND)
SELECT = 1
UP = 2
LEFT = 3
DOWN = 4
RIGHT = 5
_BUTTONS = (SELECT, UP, LEFT, DOWN, RIGHT)
_MASK = 0
for _p in _BUTTONS:
    _MASK |= 1 << _p


class ANOEncoder:
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
        self.product = (v[0] << 8) | v[1]
        if self.product != PRODUCT_ID:
            print('ANO: seesaw firmware reports product %d, expected %d' % (self.product, PRODUCT_ID))
        # The five buttons: inputs with pull-ups (INPUT_PULLUP = DIRCLR, PULLENSET, then BULK_SET).
        mask = _MASK.to_bytes(4, 'big')
        self._write(_GPIO_BASE, _GPIO_DIRCLR_BULK, mask)
        self._write(_GPIO_BASE, _GPIO_PULLENSET, mask)
        self._write(_GPIO_BASE, _GPIO_BULK_SET, mask)

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

    def position(self):
        """Scroll wheel position (signed 32-bit counter kept by seesaw)."""
        return self._int32(self._read(_ENCODER_BASE, _ENCODER_POSITION, 4))

    def set_position(self, pos):
        self._write(_ENCODER_BASE, _ENCODER_POSITION, (pos & 0xFFFFFFFF).to_bytes(4, 'big'))

    def delta(self):
        """Counts turned since the last delta() call (reading clears it)."""
        return self._int32(self._read(_ENCODER_BASE, _ENCODER_DELTA, 4))

    def buttons(self):
        """Dict of the five buttons, True while pressed (one GPIO_BULK read)."""
        b = self._read(_GPIO_BASE, _GPIO_BULK, 4)
        bits = (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]
        return {
            'select': not (bits >> SELECT) & 1,
            'up': not (bits >> UP) & 1,
            'left': not (bits >> LEFT) & 1,
            'down': not (bits >> DOWN) & 1,
            'right': not (bits >> RIGHT) & 1,
        }

    def pressed(self, pin):
        """True while the button on seesaw pin `pin` (SELECT, UP, LEFT, DOWN, RIGHT) is pressed."""
        b = self._read(_GPIO_BASE, _GPIO_BULK, 4)
        bits = (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]
        return not (bits >> pin) & 1
