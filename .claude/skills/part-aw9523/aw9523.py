# AW9523B 16-pin GPIO expander & LED driver (Awinic AW9523B datasheet V1.1.1), MicroPython driver.
# Register map (datasheet Table 4):
#   0x00 / 0x01  Input_Port0 / 1     read-only, the levels on P0_x / P1_x
#   0x02 / 0x03  Output_Port0 / 1    output latches (power-up value set by AD1/AD0, 0x00 with both low)
#   0x04 / 0x05  Config_Port0 / 1    1 = input, 0 = output (power-up 0x00: ALL PINS ARE OUTPUTS)
#   0x06 / 0x07  Int_Port0 / 1       0 = interrupt enabled, 1 = disabled (power-up 0x00)
#   0x10         ID                  reads 0x23
#   0x11         GCR                 bit4 GPOMD: 0 = P0 open-drain, 1 = P0 push-pull; bits1:0 ISEL (LED range)
#                                    bits 7:5 and 3:2 must be written as 0
#   0x12 / 0x13  LED mode switch     1 = GPIO mode (power-up 0xFF), 0 = LED (constant-current) mode
#   0x20-0x2F    DIM0-DIM15          LED current, 0-255 steps of IMAX/255 (write-only)
#   0x7F         SW_RSTN             write 0x00 for a software reset
# Pin numbers 0-15 follow the Adafruit silkscreen: 0-7 = P0_0-P0_7, 8-15 = P1_0-P1_7.
# The AW9523B has NO internal pull-ups or pull-downs: an input needs an external resistor.

_INPUT0 = 0x00
_OUTPUT0 = 0x02
_CONFIG0 = 0x04
_INTEN0 = 0x06
_ID = 0x10
_GCR = 0x11
_LEDMODE0 = 0x12
_SWRST = 0x7F
CHIP_ID = 0x23

INPUT = 1
OUTPUT = 0

# DIM register for each pin number (datasheet Table 13: DIM0-3 = P1_0-P1_3,
# DIM4-11 = P0_0-P0_7, DIM12-15 = P1_4-P1_7).
_DIM = (0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x2B,
        0x20, 0x21, 0x22, 0x23, 0x2C, 0x2D, 0x2E, 0x2F)


class AW9523:
    def __init__(self, i2c, addr=0x58, reset=True, push_pull=True):
        """addr = 0x58 + (AD1 << 1) + AD0 (0x58 on the Adafruit board with no jumper closed).
        reset: software reset first (all pins become outputs, latched low with AD1/AD0 low).
        push_pull: drive P0_0-P0_7 push-pull (GCR GPOMD = 1); the chip's default is open-drain."""
        self.i2c = i2c
        self.addr = addr
        if reset:
            self._w(_SWRST, 0x00)
        cid = self._r(_ID)
        if cid != CHIP_ID:
            raise OSError('AW9523 not found (ID 0x%02X, expected 0x23)' % cid)
        if push_pull:
            # Keep ISEL (bits 1:0); reserved bits must stay 0.
            self._w(_GCR, (self._r(_GCR) & 0x03) | 0x10)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _r(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    @staticmethod
    def _check(pin):
        if not 0 <= pin <= 15:
            raise ValueError('pin must be 0-15')

    def _bit(self, base, pin, on):
        self._check(pin)
        reg = base + (pin >> 3)  # port 0 register, or the port 1 register right after it
        v = self._r(reg)
        v = v | (1 << (pin & 7)) if on else v & ~(1 << (pin & 7))
        self._w(reg, v)

    def pin_mode(self, pin, mode):
        """mode INPUT or OUTPUT (Config_Port: 1 = input). Pins power up as outputs."""
        self._bit(_CONFIG0, pin, mode == INPUT)

    def value(self, pin, val=None):
        """Read a pin's level (Input_Port), or set its output latch (Output_Port)."""
        self._check(pin)
        if val is None:
            return (self._r(_INPUT0 + (pin >> 3)) >> (pin & 7)) & 1
        self._bit(_OUTPUT0, pin, val)

    def interrupt(self, pin, on=True):
        """Enable (on) or disable the INTN interrupt for an input pin (Int_Port: 0 = enabled)."""
        self._bit(_INTEN0, pin, not on)

    def read_port(self):
        """All 16 pin levels: bits 0-7 = P0_0-P0_7, bits 8-15 = P1_0-P1_7.
        Reading the Input_Port registers also clears INTN."""
        return self._r(_INPUT0) | (self._r(_INPUT0 + 1) << 8)

    def write_port(self, val):
        """Set all 16 output latches: bits 0-7 = P0_0-P0_7, bits 8-15 = P1_0-P1_7."""
        self._w(_OUTPUT0, val)
        self._w(_OUTPUT0 + 1, val >> 8)

    def led_mode(self, pin, on=True):
        """Switch a pin to constant-current LED mode (on) or back to GPIO mode.
        In LED mode the pin sinks current from an LED whose anode goes to VIN (no resistor needed)."""
        self._bit(_LEDMODE0, pin, not on)

    def led(self, pin, level):
        """LED current for a pin in LED mode: 0 = off ... 255 = IMAX (37 mA typ. with ISEL = 00)."""
        self._check(pin)
        self._w(_DIM[pin], max(0, min(255, int(level))))

    def led_range(self, isel):
        """ISEL: 0 = 0..IMAX, 1 = 3/4 IMAX, 2 = 1/2 IMAX, 3 = 1/4 IMAX (keeps the P0 drive mode bit)."""
        self._w(_GCR, (self._r(_GCR) & 0x10) | (isel & 0x03))
