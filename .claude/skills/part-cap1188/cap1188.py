# CAP1188 8-channel capacitive touch sensor with 8 LED drivers (Microchip DS00001620C), MicroPython driver, I2C mode.
# Register map (datasheet Table 6-1):
#   0x00 Main Control: GAIN[7:6] STBY[5] DSLEEP[4] INT[0]; writing INT = 0 clears ALERT# (IRQ pin) and the
#        latched status bits of inputs that are no longer touched
#   0x02 General Status (TOUCH bit 0, MULT bit 2, RESET bit 3)
#   0x03 Sensor Input Status, bit n-1 = CSn touched (latched until INT is cleared)
#   0x10-0x17 delta counts CS1-CS8 (signed 8-bit), 0x1F sensitivity, 0x2A multiple-touch config (default 0x80:
#        blocking ON, only 1 simultaneous touch), 0x72 sensor input LED linking, 0x74 LED output control
#   0xFD Product ID = 0x50, 0xFE Manufacturer ID = 0x5D, 0xFF Revision = 0x83
# I2C address is set by the resistor from ADDR_COMM (board pin AD) to GND, Table 4-1:
#   150k (Adafruit board default, AD open) = 0x29, AD tied to 3Vo (VDD) = 0x28.
#   (120k = 0x2A, 100k = 0x2B, 82k = 0x2C; AD to GND selects SPI instead of I2C.)
# The chip ignores the bus for up to 15 ms after power-up and needs ~170-200 ms for the first conversion.
import time

_MAIN = 0x00
_GEN_STATUS = 0x02
_INPUT_STATUS = 0x03
_DELTA = 0x10
_SENSITIVITY = 0x1F
_MTBLK = 0x2A
_LED_LINK = 0x72
_LED_OUTPUT = 0x74
_PRODUCT_ID = 0xFD
_MFR_ID = 0xFE
_REVISION = 0xFF


class CAP1188:
    def __init__(self, i2c, addr=0x29, reset_pin=None, multi_touch=True, link_leds=True):
        """addr 0x29 with AD open (150k on board), 0x28 with AD wired to 3Vo.
        reset_pin: optional machine.Pin wired to RST (active high, 10k pull-down on the board)."""
        self.i2c = i2c
        self.addr = addr
        if reset_pin is not None:
            reset_pin.init(reset_pin.OUT)
            reset_pin.value(0)
            time.sleep_ms(10)
            reset_pin.value(1)      # held in reset while high
            time.sleep_ms(10)       # tRST_DLY min 10 ms
            reset_pin.value(0)
            time.sleep_ms(200)      # tRESET release up to 200 ms
        else:
            time.sleep_ms(15)       # tCOMM_DLY: no communication for up to 15 ms after power-up
        pid = self._r(_PRODUCT_ID)
        mid = self._r(_MFR_ID)
        if pid != 0x50 or mid != 0x5D:
            raise OSError('CAP1188 not found at 0x%02X (product 0x%02X, maker 0x%02X)' % (addr, pid, mid))
        self.revision = self._r(_REVISION)
        if multi_touch:
            self._w(_MTBLK, 0x00)   # MULT_BLK_EN = 0: report every touched input, not just the first
        if link_leds:
            self._w(_LED_LINK, 0xFF)  # LEDn follows a touch on CSn
        self.clear_interrupt()

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _r(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def clear_interrupt(self):
        """Write INT = 0 (keeping the other Main Control bits): releases IRQ and clears status bits
        of inputs that are no longer touched."""
        self._w(_MAIN, self._r(_MAIN) & ~0x01)

    def touched(self):
        """8-bit mask, bit 0 = C1 ... bit 7 = C8. Status bits latch until INT is cleared, so the
        driver clears INT after each read (a released pad drops out on the next read)."""
        t = self._r(_INPUT_STATUS)
        if t:
            self.clear_interrupt()
        return t

    def touched_pads(self):
        """List of touched pad numbers 1-8 (as printed C1-C8)."""
        t = self.touched()
        return [n + 1 for n in range(8) if t & (1 << n)]

    def delta(self, pad):
        """Signed delta count of pad 1-8 (two's complement, saturates at 127)."""
        v = self._r(_DELTA + pad - 1)
        return v - 256 if v & 0x80 else v

    def set_sensitivity(self, level):
        """level 0 (128x, most sensitive) ... 7 (1x); default 2 (32x). Base shift bits kept."""
        cur = self._r(_SENSITIVITY)
        self._w(_SENSITIVITY, (cur & 0x8F) | ((level & 0x07) << 4))

    def set_gain(self, gain_code):
        """Main Control GAIN[1:0]: 0 = 1x, 1 = 2x, 2 = 4x, 3 = 8x."""
        cur = self._r(_MAIN)
        self._w(_MAIN, (cur & 0x3F) | ((gain_code & 0x03) << 6))

    def leds(self, mask):
        """Drive LED outputs directly (only for LEDs not linked to their input)."""
        self._w(_LED_OUTPUT, mask)
