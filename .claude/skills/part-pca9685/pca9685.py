# PCA9685 16-channel 12-bit PWM / servo driver (NXP PCA9685), MicroPython driver.
# Written from the NXP PCA9685 datasheet Rev. 4: MODE1 0x00, MODE2 0x01, LEDn_ON_L/H, LEDn_OFF_L/H at
# 0x06 + 4*n, ALL_LED at 0xFA, PRE_SCALE 0xFE (writable only while SLEEP=1),
# prescale = round(osc / (4096 * f)) - 1, clamped to 3..255; oscillator needs 500 us after wake.
import time

_MODE1 = 0x00
_MODE2 = 0x01
_LED0 = 0x06
_ALL_LED = 0xFA
_PRESCALE = 0xFE
_RESTART = 0x80
_AI = 0x20
_SLEEP = 0x10
_ALLCALL = 0x01
_OUTDRV = 0x04
_FULL = 0x10  # bit 4 of LEDn_ON_H (full on) / LEDn_OFF_H (full off)


class PCA9685:
    def __init__(self, i2c, addr=0x40, freq=50, osc=25000000):
        self.i2c = i2c
        self.addr = addr
        self.osc = osc  # internal oscillator, 25 MHz typical (real chips vary by a few %)
        self._freq = freq
        self._w(_MODE2, _OUTDRV)  # totem-pole outputs (POR default; needed by the Adafruit board)
        self._w(_ALL_LED + 2, 0)  # ALL_LED_OFF_L
        self._w(_ALL_LED + 3, _FULL)  # ALL_LED_OFF_H: every channel fully off
        self._w(_MODE1, _AI | _ALLCALL)  # wake, register auto-increment on
        time.sleep_us(500)  # oscillator start-up, datasheet MODE1 note [2]
        self.freq(freq)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _r(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def freq(self, hz=None):
        """Set (or return) the PWM frequency, 24..1526 Hz, shared by all 16 channels."""
        if hz is None:
            return self.osc / (4096 * (self._r(_PRESCALE) + 1))
        pre = int(self.osc / (4096 * hz) + 0.5) - 1
        pre = max(3, min(255, pre))
        old = self._r(_MODE1) & ~_RESTART & 0xFF
        self._w(_MODE1, old | _SLEEP)  # PRE_SCALE can only be written while asleep
        self._w(_PRESCALE, pre)
        self._w(_MODE1, (old & ~_SLEEP) | _AI)
        time.sleep_us(500)
        if self._r(_MODE1) & _RESTART:  # restart channels that were running (section 7.3.1.1)
            self._w(_MODE1, (old & ~_SLEEP) | _AI | _RESTART)
        self._freq = hz
        return pre

    def prescale(self):
        return self._r(_PRESCALE)

    def pwm(self, ch, on, off):
        """Raw 12-bit counts: output goes high at count `on` and low at count `off` (0..4095)."""
        if not 0 <= ch <= 15:
            raise ValueError('channel 0..15')
        self.i2c.writeto_mem(self.addr, _LED0 + 4 * ch,
                             bytes([on & 0xFF, (on >> 8) & 0x0F, off & 0xFF, (off >> 8) & 0x0F]))

    def duty(self, ch, value):
        """Duty cycle as 0..4095; 0 = fully off, 4095 = fully on."""
        if value <= 0:
            self.off(ch)
        elif value >= 4095:
            self.i2c.writeto_mem(self.addr, _LED0 + 4 * ch, bytes([0, _FULL, 0, 0]))
        else:
            self.pwm(ch, 0, value)

    def off(self, ch):
        self.i2c.writeto_mem(self.addr, _LED0 + 4 * ch, bytes([0, 0, 0, _FULL]))

    def pulse_us(self, ch, us):
        """High pulse of `us` microseconds each period (servos: about 500..2500 us at 50 Hz)."""
        counts = int(us * self._freq * 4096 / 1000000 + 0.5)
        self.duty(ch, counts)
        return counts

    def servo(self, ch, angle, min_us=500, max_us=2500):
        """Move a hobby servo to 0..180 degrees. Check your servo's pulse range before going to the ends."""
        angle = max(0, min(180, angle))
        return self.pulse_us(ch, min_us + (max_us - min_us) * angle / 180)

    def all_off(self):
        self.i2c.writeto_mem(self.addr, _ALL_LED, bytes([0, 0, 0, _FULL]))
