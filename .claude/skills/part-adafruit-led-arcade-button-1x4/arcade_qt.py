# Adafruit LED Arcade Button 1x4 STEMMA QT I2C breakout (product 5296, ATtiny817 running seesaw firmware),
# MicroPython driver.
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
_TIMER_BASE = 0x08
_TIMER_PWM = 0x01

_HW_IDS = (0x87, 0x85, 0x89)  # ATtiny817 (this board); ATtiny807/1617 seesaw builds use the same pin map
BUTTON_PINS = (18, 19, 20, 2)  # SWITCH1, SW #2, SW #3, SWITCH4 (pressed = shorted to GND)
LED_PINS = (12, 13, 0, 1)      # LED1-LED4, PWM into BSS138 low-side switches from the on-board 5 V pump
_BUTTON_MASK = 0
for _p in BUTTON_PINS:
    _BUTTON_MASK |= 1 << _p


class ArcadeQT:
    def __init__(self, i2c, addr=0x3A, reset=True, interrupt=False):
        self.i2c = i2c
        self.addr = addr
        if reset:
            self._write(_STATUS_BASE, _STATUS_SWRST, b'\xff')
            time.sleep_ms(500)  # seesaw restarts after a software reset
        hw = self._read(_STATUS_BASE, _STATUS_HW_ID, 1)[0]
        if hw not in _HW_IDS:
            raise OSError('seesaw not found at 0x%02x (HW_ID 0x%02x): check the wiring' % (addr, hw))
        # Buttons: inputs with pull-ups (a pressed button shorts the pin to GND).
        mask = _BUTTON_MASK.to_bytes(4, 'big')
        self._write(_GPIO_BASE, _GPIO_DIRCLR_BULK, mask)
        self._write(_GPIO_BASE, _GPIO_PULLENSET, mask)
        self._write(_GPIO_BASE, _GPIO_BULK_SET, mask)
        self._write(_GPIO_BASE, _GPIO_INTENSET if interrupt else _GPIO_INTENCLR, mask)
        for i in range(4):
            self.led(i, 0)

    def _write(self, base, reg, data=b''):
        self.i2c.writeto(self.addr, bytes([base, reg]) + bytes(data))

    def _read(self, base, reg, n, delay_us=8000):
        self.i2c.writeto(self.addr, bytes([base, reg]))
        time.sleep_us(delay_us)  # seesaw needs time to fetch the value before the read
        return self.i2c.readfrom(self.addr, n)

    def buttons(self):
        """List of 4 booleans, True while button 1, 2, 3, 4 is pressed."""
        b = self._read(_GPIO_BASE, _GPIO_BULK, 4)
        bits = (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]
        return [not (bits >> p) & 1 for p in BUTTON_PINS]

    def __getitem__(self, i):
        return self.buttons()[i]

    def led(self, i, duty):
        """Set LED i (0-3) brightness, 0 (off) to 65535 (full on); 16-bit seesaw PWM value."""
        if not 0 <= i < 4:
            raise IndexError('LED index 0-3')
        duty = max(0, min(65535, int(duty)))
        self._write(_TIMER_BASE, _TIMER_PWM, bytes([LED_PINS[i], duty >> 8, duty & 0xFF]))
        time.sleep_ms(1)
