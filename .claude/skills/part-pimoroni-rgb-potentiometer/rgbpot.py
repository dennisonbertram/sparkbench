# Pimoroni RGB Potentiometer Breakout (PIM523), MicroPython driver.
# The board is a Nuvoton MS51XB9AE running Pimoroni's "IO Expander" firmware (I2C address 0x0E):
# the MS51's special function registers are exposed as I2C registers. Pin mapping and register
# sequences follow Pimoroni's ioe-python / pimoroni-pico libraries and the MS51 Technical Reference Manual:
#   pot track ends: IOE pin 12 (P0.5) and pin 3 (P1.2), driven as push-pull outputs (one low, one high)
#   pot wiper:      IOE pin 11 (P0.6) = ADC channel 3, 12-bit, result = 4095 * Vain / VDD
#   RGB LED:        IOE pins 1 (P1.5, PWM CH5) red, 7 (P1.1, PWM CH1) green, 2 (P1.0, PWM CH2) blue,
#                   common cathode, so the PWM outputs are inverted (PNP register).
import time

_CHIP_ID = 0xE26A
_REG_CHIP_ID_L = 0xFA
_REG_P0 = 0x40   # bit-addressed by the firmware: write (state << 3) | bit
_REG_P1 = 0x50
_REG_P0M1 = 0x71
_REG_P0M2 = 0x72
_REG_P1M1 = 0x73
_REG_P1M2 = 0x74
_REG_ADCRL = 0x82   # ADCR[3:0]
_REG_PWMPH = 0x91
_REG_PNP = 0x96
_REG_PWMCON0 = 0x98  # bit 7 PWMRUN, bit 6 LOAD, bit 4 CLRPWM
_REG_PWMPL = 0x99
_REG_PIOCON0 = 0x9E
_REG_PWMCON1 = 0x9F
_REG_ADCCON1 = 0xA1  # bit 0 ADCEN
_REG_ADCCON0 = 0xA8  # bit 7 ADCF (done), bit 6 ADCS (start), bits 3:0 channel
_REG_AINDIDS0 = 0xB6
_REG_PIOCON1 = 0xC9
_BIT_ADDRESSED = (_REG_P0, _REG_P1)

_M1 = (_REG_P0M1, _REG_P1M1)
_M2 = (_REG_P0M2, _REG_P1M2)
_P = (_REG_P0, _REG_P1)
_PIOCON = (_REG_PIOCON0, _REG_PIOCON1)

# (port, bit, piocon (reg index, bit), PWM duty L/H registers)
_LED_R = (1, 5, (1, 5), 0xCB, 0xC8)  # IOE pin 1, PWM5
_LED_G = (1, 1, (0, 1), 0x9B, 0x93)  # IOE pin 7, PWM1
_LED_B = (1, 0, (0, 2), 0x9C, 0x94)  # IOE pin 2, PWM2
_TERM_A = (0, 5, (1, 2))             # IOE pin 12, P0.5
_TERM_B = (1, 2, (0, 0))             # IOE pin 3, P1.2
_WIPER = (0, 6)                      # IOE pin 11, P0.6
_WIPER_ADC_CH = 3

_GPIO_PP = 0b01
_GPIO_IN = 0b10


class RGBPotentiometer:
    def __init__(self, i2c, addr=0x0E, clockwise=True, brightness=1.0, timeout_ms=1000):
        self.i2c = i2c
        self.addr = addr
        self.timeout_ms = timeout_ms
        d = self.i2c.readfrom_mem(addr, _REG_CHIP_ID_L, 2)
        chip = d[0] | (d[1] << 8)
        if chip != _CHIP_ID:
            raise OSError('RGB pot: chip ID 0x%04X, expected 0x%04X' % (chip, _CHIP_ID))
        # Pot track: two push-pull outputs, wiper on the ADC.
        self._gpio_mode(_TERM_A[0], _TERM_A[1], _GPIO_PP, piocon=_TERM_A[2])
        self._gpio_mode(_TERM_B[0], _TERM_B[1], _GPIO_PP, piocon=_TERM_B[2])
        self._set_bit(_REG_ADCCON1, 0)  # ADCEN
        self._gpio_mode(_WIPER[0], _WIPER[1], _GPIO_IN)
        self.set_direction(clockwise)
        # LED PWM: period sized for 0-255 duty steps at the chosen brightness, clock /2.
        self._w8(_REG_PWMCON1, 0b001)
        self.set_brightness(brightness)
        for led in (_LED_R, _LED_G, _LED_B):
            reg, bit = led[2]
            self._set_bit(_PIOCON[reg], bit)
            self._set_bit(_REG_PNP, bit)        # invert: common-cathode LED
            self._set_bit(_REG_PWMCON0, 7)      # PWMRUN
            self._gpio_mode(led[0], led[1], _GPIO_PP)

    # --- register helpers -------------------------------------------------
    def _r8(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _w8(self, reg, value):
        self.i2c.writeto_mem(self.addr, reg, bytes((value & 0xFF,)))

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

    def _gpio_mode(self, port, bit, mode, piocon=None):
        if piocon is not None:
            self._clr_bit(_PIOCON[piocon[0]], piocon[1])  # plain GPIO, not PWM
        m1 = self._r8(_M1[port]) & ~(1 << bit)
        m2 = self._r8(_M2[port]) & ~(1 << bit)
        m1 |= (mode >> 1) << bit
        m2 |= (mode & 1) << bit
        self._w8(_M1[port], m1)
        self._w8(_M2[port], m2)
        self._clr_bit(_P[port], bit)  # initial state low

    def _wait_clear(self, reg, bit, what):
        t0 = time.ticks_ms()
        while self._r8(reg) & (1 << bit):
            if time.ticks_diff(time.ticks_ms(), t0) > self.timeout_ms:
                raise OSError('RGB pot: timeout waiting for ' + what)
            time.sleep_ms(1)

    def _pwm_load(self):
        self._set_bit(_REG_PWMCON0, 6)  # LOAD new period/duty
        self._wait_clear(_REG_PWMCON0, 6, 'PWM load')

    # --- public API -------------------------------------------------------
    def set_direction(self, clockwise=True):
        """Choose which way the reading increases (drives the track ends low/high)."""
        a, b = (0, 1) if clockwise else (1, 0)
        (self._set_bit if a else self._clr_bit)(_P[_TERM_A[0]], _TERM_A[1])
        (self._set_bit if b else self._clr_bit)(_P[_TERM_B[0]], _TERM_B[1])

    def set_brightness(self, brightness):
        brightness = min(max(brightness, 0.01), 1.0)
        period = int(255 / brightness)
        self._w8(_REG_PWMPL, period & 0xFF)
        self._w8(_REG_PWMPH, period >> 8)
        self._pwm_load()

    def set_led(self, r, g, b):
        """Set the LED colour, each channel 0-255."""
        for led, v in ((_LED_R, r), (_LED_G, g), (_LED_B, b)):
            v = min(max(int(v), 0), 255)
            self._w8(led[3], v & 0xFF)
            self._w8(led[4], v >> 8)
        self._pwm_load()

    def read_raw(self):
        """One 12-bit ADC conversion of the wiper (0-4095)."""
        self._w8(_REG_AINDIDS0, 1 << _WIPER_ADC_CH)  # analog input, digital buffer off
        c = self._r8(_REG_ADCCON0)
        c = (c & ~0x0F) | _WIPER_ADC_CH
        c = (c & ~0x80) | 0x40  # clear ADCF, set ADCS (start)
        self._w8(_REG_ADCCON0, c)
        t0 = time.ticks_ms()
        while not (self._r8(_REG_ADCCON0) & 0x80):  # ADCF = conversion done
            if time.ticks_diff(time.ticks_ms(), t0) > self.timeout_ms:
                raise OSError('RGB pot: ADC timeout')
            time.sleep_ms(1)
        d = self.i2c.readfrom_mem(self.addr, _REG_ADCRL, 2)  # ADCRL, ADCRH
        return (d[1] << 4) | (d[0] & 0x0F)

    def read(self):
        """Knob position as a fraction 0.0-1.0 (ratiometric to the board supply)."""
        return self.read_raw() / 4095
