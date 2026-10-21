# SparkFun Qwiic Button (BOB-15932, red LED), MicroPython driver.
# The board's ATtiny84 runs SparkFun's firmware, which exposes a byte-addressed register map
# (register map PDF + SparkFun_Qwiic_Button library): write the register number, then read.
# Multi-byte registers are little-endian (AVR). Device ID register 0x00 reads 0x5D.
from micropython import const

_ID = const(0x00)
_FW_MINOR = const(0x01)
_FW_MAJOR = const(0x02)
_STATUS = const(0x03)          # bit0 eventAvailable, bit1 hasBeenClicked, bit2 isPressed
_INT_CONFIG = const(0x04)      # bit0 clickedEnable, bit1 pressedEnable
_DEBOUNCE = const(0x05)        # uint16 ms, default 10
_PRESSED_Q_STATUS = const(0x07)  # bit0 popRequest, bit1 isEmpty, bit2 isFull
_PRESSED_Q_FRONT = const(0x08)   # uint32 ms since newest press
_PRESSED_Q_BACK = const(0x0C)    # uint32 ms since oldest press
_CLICKED_Q_STATUS = const(0x10)
_CLICKED_Q_FRONT = const(0x11)
_CLICKED_Q_BACK = const(0x15)
_LED_BRIGHTNESS = const(0x19)  # 0-255
_LED_GRANULARITY = const(0x1A)
_LED_CYCLE = const(0x1B)       # uint16 ms, 0 = no pulsing
_LED_OFF = const(0x1D)         # uint16 ms
_I2C_ADDRESS = const(0x1F)

DEVICE_ID = const(0x5D)


class QwiicButton:
    def __init__(self, i2c, addr=0x6F):
        self.i2c = i2c
        self.addr = addr
        if self._read(_ID, 1)[0] != DEVICE_ID:
            raise OSError('Qwiic Button not found at 0x%02X (wrong ID)' % addr)

    # --- low level: pointer write (with STOP) then read, as SparkFun's library does
    def _read(self, reg, n):
        self.i2c.writeto(self.addr, bytes([reg]))
        return self.i2c.readfrom(self.addr, n)

    def _write(self, reg, data):
        self.i2c.writeto(self.addr, bytes([reg]) + bytes(data))

    def _read_u16(self, reg):
        d = self._read(reg, 2)
        return d[0] | (d[1] << 8)

    def _read_u32(self, reg):
        d = self._read(reg, 4)
        return d[0] | (d[1] << 8) | (d[2] << 16) | (d[3] << 24)

    def _write_u16(self, reg, v):
        self._write(reg, (v & 0xFF, (v >> 8) & 0xFF))

    # --- identity
    def firmware_version(self):
        return (self._read(_FW_MAJOR, 1)[0], self._read(_FW_MINOR, 1)[0])

    # --- button
    def status(self):
        return self._read(_STATUS, 1)[0]

    def is_pressed(self):
        return bool(self.status() & 0x04)

    def has_been_clicked(self):
        return bool(self.status() & 0x02)

    def available(self):
        """True when a new press/release event happened since clear_events()."""
        return bool(self.status() & 0x01)

    def clear_events(self):
        """Clear eventAvailable, hasBeenClicked and isPressed (isPressed is refreshed on the next read)."""
        self._write(_STATUS, (self.status() & ~0x07 & 0xFF,))

    def debounce_ms(self):
        return self._read_u16(_DEBOUNCE)

    def set_debounce_ms(self, ms):
        self._write_u16(_DEBOUNCE, ms)

    # --- interrupt pin (INT, active low)
    def enable_interrupts(self, pressed=True, clicked=True):
        self._write(_INT_CONFIG, ((1 if clicked else 0) | (2 if pressed else 0),))

    # --- event queues (timestamps are milliseconds ago)
    def pressed_queue_empty(self):
        return bool(self._read(_PRESSED_Q_STATUS, 1)[0] & 0x02)

    def time_since_last_press(self):
        return self._read_u32(_PRESSED_Q_FRONT)

    def pop_pressed_queue(self):
        t = self._read_u32(_PRESSED_Q_BACK)
        s = self._read(_PRESSED_Q_STATUS, 1)[0]
        self._write(_PRESSED_Q_STATUS, (s | 0x01,))
        return t

    def clicked_queue_empty(self):
        return bool(self._read(_CLICKED_Q_STATUS, 1)[0] & 0x02)

    def time_since_last_click(self):
        return self._read_u32(_CLICKED_Q_FRONT)

    def pop_clicked_queue(self):
        t = self._read_u32(_CLICKED_Q_BACK)
        s = self._read(_CLICKED_Q_STATUS, 1)[0]
        self._write(_CLICKED_Q_STATUS, (s | 0x01,))
        return t

    # --- LED in the button
    def led_config(self, brightness, cycle_ms=0, off_ms=0, granularity=1):
        """brightness 0-255; cycle_ms > 0 makes the LED pulse (cycle_ms up, off_ms dark)."""
        self._write(_LED_BRIGHTNESS, (brightness & 0xFF,))
        self._write(_LED_GRANULARITY, (granularity & 0xFF,))
        self._write_u16(_LED_CYCLE, cycle_ms)
        self._write_u16(_LED_OFF, off_ms)

    def led_on(self, brightness=255):
        self.led_config(brightness, 0, 0)

    def led_off(self):
        self.led_config(0, 0, 0)

    # --- address (stored in the ATtiny's EEPROM; address jumpers A0-A3 override it)
    def set_address(self, new_addr):
        if not 0x08 <= new_addr <= 0x77:
            raise ValueError('address must be 0x08-0x77')
        self._write(_I2C_ADDRESS, (new_addr,))
        self.addr = new_addr
