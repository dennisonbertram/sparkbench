# MCP7940N battery-backed I2C real-time clock/calendar (Microchip), MicroPython driver.
# I2C address 0x6F (control byte 1101111x). Registers per Microchip DS20005010H:
# 00h RTCSEC (bit 7 ST = start oscillator), 01h RTCMIN, 02h RTCHOUR (bit 6 = 12-hour mode),
# 03h RTCWKDAY (bit 5 OSCRUN, bit 4 PWRFAIL, bit 3 VBATEN, bits 2-0 weekday 1-7),
# 04h RTCDATE, 05h RTCMTH (bit 5 LPYR, read-only), 06h RTCYEAR, all BCD.
# 07h CONTROL (OUT, SQWEN, ALM1EN, ALM0EN, EXTOSC, CRSTRIM, SQWFS1:0), 08h OSCTRIM,
# 0Ah-0Fh alarm 0, 11h-16h alarm 1, 18h-1Fh power-fail time stamps, 20h-5Fh 64 bytes of SRAM.
import time

_ADDR = 0x6F
_RTCSEC = 0x00
_RTCWKDAY = 0x03
_CONTROL = 0x07
_OSCTRIM = 0x08
_ALM0 = 0x0A
_ALM1 = 0x11
_SRAM = 0x20

_ST = 0x80       # RTCSEC bit 7
_OSCRUN = 0x20   # RTCWKDAY bit 5
_PWRFAIL = 0x10  # RTCWKDAY bit 4
_VBATEN = 0x08   # RTCWKDAY bit 3


def _bcd(n):
    return ((n // 10) << 4) | (n % 10)


def _dec(b):
    return (b >> 4) * 10 + (b & 0x0F)


def _weekday(y, m, d):
    # 1 = Monday ... 7 = Sunday. The chip just counts 1-7; this driver uses the ISO convention.
    t = (0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4)
    if m < 3:
        y -= 1
    w = (y + y // 4 - y // 100 + y // 400 + t[m - 1] + d) % 7  # 0 = Sunday
    return w or 7


class MCP7940N:
    def __init__(self, i2c, addr=_ADDR):
        self.i2c = i2c
        self.addr = addr

    def _r(self, reg, n=1):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, data):
        self.i2c.writeto_mem(self.addr, reg, bytes(data))

    def datetime(self, dt=None):
        """Read or set the time.
        Read returns (year, month, day, weekday, hour, minute, second), weekday 1 = Monday ... 7 = Sunday.
        Set with (year, month, day, hour, minute, second); the weekday is worked out for you.
        Setting also starts the oscillator (ST) and enables the coin-cell backup (VBATEN)."""
        if dt is None:
            r = self._r(_RTCSEC, 7)  # one read: the chip buffers the time registers against rollover
            h = r[2]
            if h & 0x40:  # 12-hour mode (set by other software): convert to 24 h
                hour = _dec(h & 0x1F) % 12 + (12 if h & 0x20 else 0)
            else:
                hour = _dec(h & 0x3F)
            return (2000 + _dec(r[6]), _dec(r[5] & 0x1F), _dec(r[4] & 0x3F), r[3] & 0x07,
                    hour, _dec(r[1] & 0x7F), _dec(r[0] & 0x7F))
        y, mo, d, h, mi, s = dt[:6]
        if not 2001 <= y <= 2099:
            raise ValueError('year must be 2001-2099')  # chip's leap-year logic covers 2001-2399, year is 2 digits
        # Datasheet 5.3 note 2: clear ST, wait for OSCRUN to clear, load the time, then set ST again.
        sec = self._r(_RTCSEC)[0]
        if sec & _ST:
            self._w(_RTCSEC, [sec & 0x7F])
            t0 = time.ticks_ms()
            while self._r(_RTCWKDAY)[0] & _OSCRUN:
                if time.ticks_diff(time.ticks_ms(), t0) > 50:  # TOSF is ~1 ms; give up after 50 ms
                    break
                time.sleep_ms(1)
        self._w(_RTCSEC + 1, [
            _bcd(mi),
            _bcd(h),                          # bit 6 = 0: 24-hour format
            _VBATEN | _weekday(y, mo, d),     # writing RTCWKDAY also clears PWRFAIL
            _bcd(d),
            _bcd(mo),
            _bcd(y - 2000)])
        self._w(_RTCSEC, [_ST | _bcd(s)])     # start the oscillator last

    def is_running(self):
        """True once the oscillator is running (OSCRUN). False after first power-up until the time is set."""
        return bool(self._r(_RTCWKDAY)[0] & _OSCRUN)

    def power_failed(self):
        """True if main power was lost while on the coin cell (PWRFAIL). Cleared by setting the time
        or by clear_power_fail()."""
        return bool(self._r(_RTCWKDAY)[0] & _PWRFAIL)

    def clear_power_fail(self):
        w = self._r(_RTCWKDAY)[0]
        self._w(_RTCWKDAY, [w & 0x0F])  # PWRFAIL can only be written 0; OSCRUN is read-only

    def battery_backup(self, on=True):
        """Enable (VBATEN) or disable the VBAT coin-cell input."""
        w = self._r(_RTCWKDAY)[0] & 0x0F
        self._w(_RTCWKDAY, [(w | _VBATEN) if on else (w & ~_VBATEN)])

    def square_wave(self, hz):
        """Square wave on MFP (open-drain, needs a pull-up): 1, 4096, 8192, 32768, or 0/None for off."""
        c = self._r(_CONTROL)[0] & 0xB8  # keep OUT, ALM1EN, ALM0EN, EXTOSC; clear SQWEN, CRSTRIM, SQWFS
        if hz:
            c |= 0x40 | {1: 0, 4096: 1, 8192: 2, 32768: 3}[hz]
        self._w(_CONTROL, [c])

    def mfp(self, level):
        """Drive MFP as a general-purpose output (only when square wave and both alarms are off)."""
        c = self._r(_CONTROL)[0]
        self._w(_CONTROL, [(c | 0x80) if level else (c & 0x7F)])

    def trim(self, steps):
        """Digital trim, -127..127 (SIGN bit 7 + TRIMVAL6:0, CRSTRIM = 0). Each step adds or subtracts
        2 clock cycles per minute (about 1 ppm). Positive: the clock runs slow, so add cycles. 0 = off."""
        v = max(-127, min(127, int(steps)))
        self._w(_OSCTRIM, [(0x80 | v) if v > 0 else -v])

    def set_alarm(self, alarm=0, second=None, minute=None, hour=None, weekday=None, day=None,
                  month=None, active_high=False):
        """Alarm 0 or 1. Give ONE of second/minute/hour/weekday/day to match only that field,
        or give all of second, minute, hour, weekday, day and month for a full match.
        MFP asserts (low by default) when ALMxIF is set; clear it with clear_alarm()."""
        base = _ALM0 if alarm == 0 else _ALM1
        fields = (second, minute, hour, weekday, day, month)
        given = [f is not None for f in fields]
        if all(given):
            mask = 7
        elif sum(given) == 1 and month is None:
            mask = given.index(True)  # 0 sec, 1 min, 2 hour, 3 weekday, 4 date
        else:
            raise ValueError('give one field, or all six')
        v = [0 if f is None else f for f in fields]
        pol = 0x80 if active_high else 0
        if alarm == 1:
            pol = self._r(_ALM0 + 3)[0] & 0x80  # ALMPOL lives in ALM0WKDAY; ALM1's copy is read-only
        self._w(base, [
            _bcd(v[0]), _bcd(v[1]), _bcd(v[2]),
            pol | (mask << 4) | (v[3] & 0x07),  # writing ALMxWKDAY clears ALMxIF
            _bcd(v[4]), _bcd(v[5])])
        c = self._r(_CONTROL)[0] & ~0x40      # SQWEN off so MFP is the alarm output
        self._w(_CONTROL, [c | (0x10 if alarm == 0 else 0x20)])

    def alarm_fired(self, alarm=0):
        base = _ALM0 if alarm == 0 else _ALM1
        return bool(self._r(base + 3)[0] & 0x08)

    def clear_alarm(self, alarm=0):
        base = _ALM0 if alarm == 0 else _ALM1
        w = self._r(base + 3)[0]
        self._w(base + 3, [w & 0xF7])

    def disable_alarm(self, alarm=0):
        c = self._r(_CONTROL)[0]
        self._w(_CONTROL, [c & ~(0x10 if alarm == 0 else 0x20)])

    def sram_read(self, offset, n):
        """Read n bytes of the 64-byte battery-backed SRAM (offset 0-63)."""
        if offset < 0 or offset + n > 64:
            raise ValueError('SRAM is 64 bytes')
        return self._r(_SRAM + offset, n)

    def sram_write(self, offset, data):
        if offset < 0 or offset + len(data) > 64:
            raise ValueError('SRAM is 64 bytes')
        self._w(_SRAM + offset, data)
