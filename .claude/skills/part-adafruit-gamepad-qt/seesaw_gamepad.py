# Adafruit Mini I2C STEMMA QT Gamepad (product 5743, ATtiny816 running seesaw firmware), MicroPython driver.
# seesaw protocol: every access starts with a write of [module base, function register];
# for a read, wait briefly (8 ms, as Adafruit's library does), then read the bytes back (big-endian).
import time

_STATUS_BASE = 0x00
_STATUS_HW_ID = 0x01
_STATUS_SWRST = 0x7F
_GPIO_BASE = 0x01
_GPIO_DIRCLR_BULK = 0x03
_GPIO_BULK = 0x04
_GPIO_BULK_SET = 0x05
_GPIO_PULLENSET = 0x0B
_ADC_BASE = 0x09
_ADC_CHANNEL_OFFSET = 0x07  # on ATtiny seesaw chips the channel register is 0x07 + seesaw pin number

_HW_IDS = (0x84, 0x85, 0x86, 0x87, 0x88, 0x89)  # ATtiny806/807/816/817/1616/1617 seesaw (this board: 0x86)

# seesaw pin numbers on the Gamepad QT
BUTTON_SELECT = 0
BUTTON_B = 1
BUTTON_Y = 2
BUTTON_A = 5
BUTTON_X = 6
BUTTON_START = 16
JOY_X_PIN = 14
JOY_Y_PIN = 15

BUTTONS = (('A', BUTTON_A), ('B', BUTTON_B), ('X', BUTTON_X), ('Y', BUTTON_Y),
           ('SELECT', BUTTON_SELECT), ('START', BUTTON_START))
_MASK = 0
for _n, _p in BUTTONS:
    _MASK |= 1 << _p


class GamepadQT:
    def __init__(self, i2c, addr=0x50, reset=True):
        self.i2c = i2c
        self.addr = addr
        if reset:
            self._write(_STATUS_BASE, _STATUS_SWRST, b'\xff')
            time.sleep_ms(500)  # seesaw restarts after a software reset
        hw = self._read(_STATUS_BASE, _STATUS_HW_ID, 1)[0]
        if hw not in _HW_IDS:
            raise OSError('seesaw not found at 0x%02x (HW_ID 0x%02x): check the wiring' % (addr, hw))
        # All six buttons: inputs with pull-up (a press pulls the pin to GND).
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

    def analog_read(self, pin):
        """Raw 10-bit ADC reading (0-1023) of a seesaw analog pin."""
        b = self._read(_ADC_BASE, _ADC_CHANNEL_OFFSET + pin, 2)
        return (b[0] << 8) | b[1]

    def joystick(self):
        """(x, y), each 0-1023, about 512 at rest. Like Adafruit's example this returns
        1023 - raw ADC count, so x grows to the right and y grows upward."""
        return 1023 - self.analog_read(JOY_X_PIN), 1023 - self.analog_read(JOY_Y_PIN)

    def buttons(self):
        """Set of the names of the buttons held down now ('A', 'B', 'X', 'Y', 'SELECT', 'START')."""
        b = self._read(_GPIO_BASE, _GPIO_BULK, 4)
        bits = (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]
        return set(name for name, pin in BUTTONS if not (bits >> pin) & 1)
