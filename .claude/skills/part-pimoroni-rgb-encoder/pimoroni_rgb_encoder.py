# Pimoroni RGB Encoder Breakout (PIM522), MicroPython driver.
# A Nuvoton MS51 microcontroller running Pimoroni's IO Expander ("ioe") firmware reads the rotary
# encoder in hardware and drives the RGB LED inside the knob with its PWM unit. The firmware maps
# the MS51's special-function registers into an I2C register space (address 0x0F by default).
# Sequences follow Pimoroni's own libraries (ioe-python ioexpander/__init__.py and
# pimoroni-pico drivers/ioexpander + libraries/breakout_encoder).
#
# Board wiring of the MS51 (IOE pin numbers): LED red = pin 1 (P1.5, PWM5), green = pin 7
# (P1.1, PWM1), blue = pin 2 (P1.0, PWM2); encoder A = pin 12 (P0.5), B = pin 3 (P1.2),
# common C = pin 11 (P0.6, driven low as open drain). INT is on P0.0 (INT pin swap bit).
import time

ADDR = 0x0F
CHIP_ID = 0xE26A

# ioe firmware registers
_CHIP_ID_L = 0xFA
_CHIP_ID_H = 0xFB
_VERSION = 0xFC
_ADDR = 0xFD
_CTRL = 0xFE
_INT = 0xF9            # bit0 TRIGD (interrupt flag), bit1 OUT_EN, bit2 PIN_SWAP (0 = P1.3, 1 = P0.0)
_ENC_EN = 0x04         # bit0 enable channel 1, bit1 count microsteps on channel 1
_ENC_1_CFG = 0x05      # pin A | pin B << 4
_ENC_1_COUNT = 0x06    # 8-bit count, wraps (two's complement)
# MS51 SFRs as mapped by the firmware
_P0 = 0x40             # bit-addressed: write 0b1000|bit to set, bit to clear
_P1 = 0x50
_P0M1 = 0x71
_P0M2 = 0x72
_P1M1 = 0x73
_P1M2 = 0x74
_P0S = 0xC2
_P1S = 0xC4
_PIOCON0 = 0x9E
_PIOCON1 = 0xC9
_PNP = 0x96
_PWMCON0 = 0x98        # bit7 PWMRUN, bit6 LOAD (clears itself), bit4 CLRPWM
_PWMCON1 = 0x9F        # bits 2:0 clock divider
_PWMPL = 0x99
_PWMPH = 0x91
_BIT_ADDRESSED = (_P0, _P1)

# (port P reg, M1, M2, S reg, bit) per pin, and (piocon reg, bit, PWM L reg, PWM H reg) for PWM pins
_ENC_A = (_P0, _P0M1, _P0M2, _P0S, 5, (_PIOCON1, 2))   # IOE pin 12
_ENC_B = (_P1, _P1M1, _P1M2, _P1S, 2, (_PIOCON0, 0))   # IOE pin 3
_ENC_C = (_P0, _P0M1, _P0M2, _P0S, 6, None)            # IOE pin 11 (ADC-only pin, no PWM)
_LED_R = (_P1, _P1M1, _P1M2, _P1S, 5, (_PIOCON1, 5), 0xCB, 0xC8)  # pin 1, PWM5
_LED_G = (_P1, _P1M1, _P1M2, _P1S, 1, (_PIOCON0, 1), 0x9B, 0x93)  # pin 7, PWM1
_LED_B = (_P1, _P1M1, _P1M2, _P1S, 0, (_PIOCON0, 2), 0x9C, 0x94)  # pin 2, PWM2

_MODE_PU = 0b10000   # input with pull-up (quasi-bidirectional, initial high)
_MODE_OD = 0b00011   # open-drain output
_MODE_PWM = 0b00101  # PWM, push-pull


class RGBEncoder:
    def __init__(self, i2c, addr=ADDR, brightness=1.0, timeout_ms=1000):
        self.i2c = i2c
        self.addr = addr
        self.timeout_ms = timeout_ms
        self._last = 0
        self._offset = 0
        self.direction = 1   # 1 = as counted by the chip, -1 = reversed
        cid = self.chip_id()
        if cid != CHIP_ID:
            raise OSError('RGB Encoder not found at 0x%02X (chip ID 0x%04X, expected 0x%04X)' % (addr, cid, CHIP_ID))
        # Encoder: A and B inputs with pull-ups and Schmitt triggers, C driven low.
        self._set_mode(_ENC_A, _MODE_PU, schmitt=True)
        self._set_mode(_ENC_B, _MODE_PU, schmitt=True)
        self._set_mode(_ENC_C, _MODE_OD)
        self._w8(_ENC_C[0], _ENC_C[4])                 # clear the bit: output low
        self._w8(_ENC_1_CFG, 12 | (3 << 4))            # channel 1 = pins 12 (A) and 3 (B)
        self._clr_bit(_ENC_EN, 1)                      # count whole steps, not microsteps
        self._set_bit(_ENC_EN, 0)                      # enable channel 1
        self.clear()
        # LED: PWM period gives 0-255 steps at the chosen brightness, divider 2.
        self.set_brightness(brightness)
        self._w8(_PWMCON1, 0b001)
        for led in (_LED_R, _LED_G, _LED_B):
            self._set_mode(led, _MODE_PWM, invert=True)

    # --- low level
    def _r8(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _w8(self, reg, v):
        self.i2c.writeto_mem(self.addr, reg, bytes([v & 0xFF]))

    def _set_bit(self, reg, bit):
        if reg in _BIT_ADDRESSED:
            self._w8(reg, 0b1000 | bit)
        else:
            self._w8(reg, self._r8(reg) | (1 << bit))

    def _clr_bit(self, reg, bit):
        if reg in _BIT_ADDRESSED:
            self._w8(reg, bit)
        else:
            self._w8(reg, self._r8(reg) & ~(1 << bit))

    def _change_bit(self, reg, bit, state):
        if state:
            self._set_bit(reg, bit)
        else:
            self._clr_bit(reg, bit)

    def _set_mode(self, pin, mode, schmitt=False, invert=False):
        p, m1, m2, ps, bit, pio = pin[0], pin[1], pin[2], pin[3], pin[4], pin[5]
        gpio_mode = mode & 0b11
        initial = mode >> 4
        if mode == _MODE_PWM:
            self._set_bit(pio[0], pio[1])                # route the PWM channel to the pin
            self._change_bit(_PNP, pio[1], invert)       # output polarity
            self._set_bit(_PWMCON0, 7)                   # PWMRUN
        elif pio is not None:
            self._clr_bit(pio[0], pio[1])
        pm1 = self._r8(m1) & ~(1 << bit) & 0xFF
        pm2 = self._r8(m2) & ~(1 << bit) & 0xFF
        pm1 |= (gpio_mode >> 1) << bit
        pm2 |= (gpio_mode & 1) << bit
        self._w8(m1, pm1)
        self._w8(m2, pm2)
        if mode == _MODE_PU:
            self._change_bit(ps, bit, schmitt)
        self._w8(p, (initial << 3) | bit)

    def _pwm_load(self):
        self._set_bit(_PWMCON0, 6)                       # LOAD: latch period and duties
        t0 = time.ticks_ms()
        while self._r8(_PWMCON0) & 0x40:
            if time.ticks_diff(time.ticks_ms(), t0) > self.timeout_ms:
                raise OSError('timed out waiting for PWM load')
            time.sleep_ms(1)

    # --- identity
    def chip_id(self):
        return self._r8(_CHIP_ID_L) | (self._r8(_CHIP_ID_H) << 8)

    def version(self):
        return self._r8(_VERSION)

    # --- encoder
    def read(self):
        """Steps turned since clear(). The chip keeps an 8-bit count; wraps are tracked here,
        so call this at least once per ~64 steps of turning."""
        v = self._r8(_ENC_1_COUNT)
        if v & 0x80:
            v -= 256
        if self._last > 64 and v < -64:
            self._offset += 256
        if self._last < -64 and v > 64:
            self._offset -= 256
        self._last = v
        self.clear_interrupt()
        return (self._offset + v) * self.direction

    def clear(self):
        self._w8(_ENC_1_COUNT, 0)
        self._last = 0
        self._offset = 0

    # --- interrupt flag (set by the firmware when the count changes)
    def changed(self):
        return bool(self._r8(_INT) & 0x01)

    def clear_interrupt(self):
        self._clr_bit(_INT, 0)

    def enable_interrupt_out(self):
        """Drive the board's INT pin (active low). The breakout's INT is on P0.0, so PIN_SWAP is set."""
        self._set_bit(_INT, 1)
        self._set_bit(_INT, 2)

    # --- RGB LED
    def set_brightness(self, brightness):
        brightness = min(max(brightness, 0.01), 1.0)
        period = int(255 / brightness)
        self._w8(_PWMPL, period & 0xFF)
        self._w8(_PWMPH, period >> 8)
        self._pwm_load()

    def set_led(self, r, g, b):
        for led, v in ((_LED_R, r), (_LED_G, g), (_LED_B, b)):
            v = max(0, min(255, int(v)))
            self._w8(led[6], v & 0xFF)
            self._w8(led[7], v >> 8)
        self._pwm_load()

    # --- address (kept in the MS51's flash)
    def set_address(self, new_addr):
        self._set_bit(_CTRL, 4)
        self._w8(_ADDR, new_addr)
        self.addr = new_addr
        time.sleep_ms(250)
        self._clr_bit(_CTRL, 4)
