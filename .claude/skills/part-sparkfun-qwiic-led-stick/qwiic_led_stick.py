# SparkFun Qwiic LED Stick - APA102C (COM-18354), MicroPython driver.
# The board's ATtiny85 runs SparkFun's Qwiic_LED_Stick firmware: it keeps a colour + 5-bit brightness for
# up to 100 APA102C LEDs and shifts the whole array out to the LEDs after every I2C write.
# The firmware takes command bytes (no register pointer, nothing to read back):
#   0x70 n            set LED count (1-100, stored in EEPROM)
#   0x71 i r g b      colour of LED i (index starts at 0, as printed on the board)
#   0x72 r g b        colour of all LEDs
#   0x73/0x74/0x75 len off v...   red/green/blue values for LEDs off..off+len-1
#   0x76 i bri        brightness (0-31) of LED i      0x77 bri   brightness of all LEDs
#   0x78              all colours to 0 (brightness kept)
#   0xC7 addr         new I2C address (0x08-0x77, stored in EEPROM)
# Source: github.com/sparkfun/Qwiic_LED_Stick Firmware/Qwiic_LED_Stick.ino (v2, 2021: index from 0).
import time

CMD_CHANGE_ADDRESS = 0xC7
CMD_CHANGE_LENGTH = 0x70
CMD_SINGLE_COLOR = 0x71
CMD_ALL_COLOR = 0x72
CMD_RED_ARRAY = 0x73
CMD_GREEN_ARRAY = 0x74
CMD_BLUE_ARRAY = 0x75
CMD_SINGLE_BRIGHTNESS = 0x76
CMD_ALL_BRIGHTNESS = 0x77
CMD_ALL_OFF = 0x78

# The ATtiny85 I2C receive buffer is 16 bytes: command + length + offset + 12 values per write,
# exactly as SparkFun's Arduino library splits it.
_CHUNK = 12


def _b(v):
    v = int(v)
    return 0 if v < 0 else 255 if v > 255 else v


def _bri(v):
    v = int(v)
    return 0 if v < 0 else 31 if v > 31 else v


class LEDStick:
    def __init__(self, i2c, addr=0x23):
        self.i2c = i2c
        self.addr = addr
        if addr not in i2c.scan():
            raise OSError('Qwiic LED Stick not found at 0x%02X' % addr)

    def _w(self, data):
        self.i2c.writeto(self.addr, bytes(data))

    def set_led_color(self, number, r, g, b):
        """Colour of one LED; number 0-99 (0 = the LED marked 0 on the board)."""
        if not 0 <= number <= 99:
            raise ValueError('LED number 0-99')
        self._w([CMD_SINGLE_COLOR, number, _b(r), _b(g), _b(b)])

    def set_all(self, r, g, b):
        self._w([CMD_ALL_COLOR, _b(r), _b(g), _b(b)])

    def set_colors(self, reds, greens, blues):
        """Different colour per LED, starting at LED 0. Lists must be the same length."""
        n = len(reds)
        if len(greens) != n or len(blues) != n:
            raise ValueError('colour lists differ in length')
        for cmd, arr in ((CMD_RED_ARRAY, reds), (CMD_GREEN_ARRAY, greens), (CMD_BLUE_ARRAY, blues)):
            for off in range(0, n, _CHUNK):
                chunk = [_b(v) for v in arr[off:off + _CHUNK]]
                self._w([cmd, len(chunk), off] + chunk)

    def set_brightness(self, number, bri):
        """Brightness 0-31 of one LED (0 = off, colour remembered)."""
        if not 0 <= number <= 99:
            raise ValueError('LED number 0-99')
        self._w([CMD_SINGLE_BRIGHTNESS, number, _bri(bri)])

    def set_all_brightness(self, bri):
        self._w([CMD_ALL_BRIGHTNESS, _bri(bri)])

    def off(self):
        """All colours to 0 (brightness settings are kept)."""
        self._w([CMD_ALL_OFF])

    def change_length(self, n):
        """Number of LEDs driven (1-100, saved in EEPROM). Use an external LED supply for long chains."""
        if not 1 <= n <= 100:
            raise ValueError('length 1-100')
        self._w([CMD_CHANGE_LENGTH, n])

    def change_address(self, new_addr):
        """Store a new I2C address (0x08-0x77) in EEPROM; ignored while the ADR jumper is closed (0x22)."""
        if not 0x08 <= new_addr <= 0x77:
            raise ValueError('address must be 0x08-0x77')
        self._w([CMD_CHANGE_ADDRESS, new_addr])
        time.sleep_ms(50)
        self.addr = new_addr
