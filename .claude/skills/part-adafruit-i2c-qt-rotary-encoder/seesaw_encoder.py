# Adafruit I2C QT Rotary Encoder (product 4991, seesaw firmware), MicroPython driver.
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
_GPIO_PULLENSET = 0x0B
_ENCODER_BASE = 0x11
_ENCODER_POSITION = 0x30
_ENCODER_DELTA = 0x40

_HW_IDS = (0x55, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89)  # SAMD09 (this board) and ATtiny8xx/16xx seesaw chips
_BUTTON_PIN = 24  # seesaw pin of the encoder's push switch on this board


class SeesawEncoder:
    def __init__(self, i2c, addr=0x36, reset=True):
        self.i2c = i2c
        self.addr = addr
        if reset:
            self._write(_STATUS_BASE, _STATUS_SWRST, b'\xff')
            time.sleep_ms(500)  # seesaw restarts after a software reset
        hw = self._read(_STATUS_BASE, _STATUS_HW_ID, 1)[0]
        if hw not in _HW_IDS:
            raise OSError('seesaw not found at 0x%02x (HW_ID 0x%02x): check the wiring' % (addr, hw))
        # Encoder switch: input with pull-up (pressed pulls it to GND).
        mask = (1 << _BUTTON_PIN).to_bytes(4, 'big')
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
        """Encoder position in detents (signed 32-bit counter kept by seesaw)."""
        return self._int32(self._read(_ENCODER_BASE, _ENCODER_POSITION, 4))

    def set_position(self, pos):
        self._write(_ENCODER_BASE, _ENCODER_POSITION, (pos & 0xFFFFFFFF).to_bytes(4, 'big'))

    def delta(self):
        """Detents turned since the last delta() call (reading clears it)."""
        return self._int32(self._read(_ENCODER_BASE, _ENCODER_DELTA, 4))

    def pressed(self):
        """True while the encoder knob is pushed in."""
        b = self._read(_GPIO_BASE, _GPIO_BULK, 4)
        bits = (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]
        return not (bits >> _BUTTON_PIN) & 1
