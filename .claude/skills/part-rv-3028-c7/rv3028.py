# RV-3028-C7 extreme low power real-time clock (Micro Crystal), MicroPython driver.
# I2C address 0x52. Registers per the Micro Crystal RV-3028-C7 Application Manual:
# 00h-06h seconds, minutes, hours, weekday, date, month, year (BCD, auto-increment),
# 07h-09h alarm (bit 7 AE = 1 disables that field), 0Eh status, 0Fh control 1, 10h control 2,
# 27h EE command, 37h EEPROM backup (configuration EEPROM with RAM mirror).
import time

_ADDR = 0x52
_SECONDS = 0x00
_ALARM = 0x07
_STATUS = 0x0E
_CTRL1 = 0x0F
_CTRL2 = 0x10
_EECMD = 0x27
_EE_BACKUP = 0x37

# Status register bits
_EEBUSY = 0x80
_AF = 0x04
_PORF = 0x01


def _bcd(n):
    return ((n // 10) << 4) | (n % 10)


def _dec(b):
    return (b >> 4) * 10 + (b & 0x0F)


def _weekday(y, m, d):
    # 0 = Sunday ... 6 = Saturday. The RV-3028 weekday counter (03h) just counts 0..6 and wraps;
    # the meaning of each value is up to the user, this driver uses 0 = Sunday.
    t = (0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4)
    if m < 3:
        y -= 1
    return (y + y // 4 - y // 100 + y // 400 + t[m - 1] + d) % 7


class RV3028:
    def __init__(self, i2c, addr=_ADDR):
        self.i2c = i2c
        self.addr = addr

    def _r(self, reg, n=1):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, data):
        self.i2c.writeto_mem(self.addr, reg, bytes(data))

    def datetime(self, dt=None):
        """Read or set the time (24-hour mode, years 2000-2099).
        Read returns (year, month, day, weekday, hour, minute, second), weekday 0 = Sunday.
        Set with (year, month, day, hour, minute, second); the weekday is worked out for you."""
        if dt is None:
            # One burst read: the chip blocks the 1 Hz increment during the access (applied after STOP).
            r = self._r(_SECONDS, 7)
            return (2000 + _dec(r[6]), _dec(r[5] & 0x1F), _dec(r[4] & 0x3F), (r[3] & 0x07) % 7,
                    _dec(r[2] & 0x3F), _dec(r[1] & 0x7F), _dec(r[0] & 0x7F))
        y, mo, d, h, mi, s = dt[:6]
        if not 2000 <= y <= 2099:
            raise ValueError('year must be 2000-2099')
        c2 = self._r(_CTRL2)[0]
        if c2 & 0x02:
            self._w(_CTRL2, [c2 & ~0x02])  # 12_24 = 0: 24-hour mode
        # One burst write from 00h; writing the seconds register also resets the 1 Hz prescaler.
        self._w(_SECONDS, [_bcd(s), _bcd(mi), _bcd(h), _weekday(y, mo, d), _bcd(d), _bcd(mo), _bcd(y - 2000)])
        st = self._r(_STATUS)[0]
        self._w(_STATUS, [st & ~_PORF & 0x7F])  # clear PORF: time is now valid

    def lost_power(self):
        """True if PORF is set: the chip saw a power-on reset (first power-up, or the supply and
        backup both dropped), so the time is invalid until set."""
        return bool(self._r(_STATUS)[0] & _PORF)

    def _wait_ee(self, timeout_ms=200):
        t0 = time.ticks_ms()
        while self._r(_STATUS)[0] & _EEBUSY:
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('RV-3028 EEPROM busy')
            time.sleep_ms(5)

    def backup_mode(self, mode=1):
        """Backup switchover mode, stored in the configuration EEPROM (37h, BSM bits 3:2):
        0 = off (factory default: time is lost when VDD is removed even with a cell fitted),
        1 = Direct Switching Mode (switch when VDD < VBACKUP; use this with the 1.55 V 337 cell),
        3 = Level Switching Mode (needs VBACKUP > 2.0 V). Only writes the EEPROM if it changes."""
        if mode not in (0, 1, 3):
            raise ValueError('mode must be 0, 1 or 3')
        cur = self._r(_EE_BACKUP)[0]
        new = (cur & 0xE3) | 0x10 | (mode << 2)  # keep EEOffset[0], BSIE, TCE, TCR; FEDE = 1 (datasheet: always 1)
        if new == cur:
            return
        self._wait_ee()
        c1 = self._r(_CTRL1)[0]
        self._w(_CTRL1, [c1 | 0x08])  # EERD = 1: stop the automatic EEPROM refresh
        try:
            self._w(_EE_BACKUP, [new])  # RAM mirror: active immediately
            self._w(_EECMD, [0x00])  # first command must be 00h
            self._w(_EECMD, [0x11])  # UPDATE: configuration RAM -> EEPROM (~63 ms)
            self._wait_ee()
        finally:
            self._w(_CTRL1, [c1 & ~0x08])  # EERD = 0

    def set_alarm(self, minute=None, hour=None, date=None, interrupt=True):
        """Alarm on the fields given (None = ignore that field; hour in 24-hour form, date 1-31).
        AF is set on a match; the open-drain INT pin goes low if interrupt is True."""
        c2 = self._r(_CTRL2)[0]
        self._w(_CTRL2, [c2 & ~0x08])  # AIE = 0 while changing the alarm
        st = self._r(_STATUS)[0]
        self._w(_STATUS, [st & ~_AF & 0x7F])  # AF = 0
        c1 = self._r(_CTRL1)[0]
        self._w(_CTRL1, [c1 | 0x20])  # WADA = 1: 09h is a date alarm
        f = lambda v: 0x80 if v is None else _bcd(v)
        self._w(_ALARM, [f(minute), f(hour), f(date)])
        if interrupt:
            self._w(_CTRL2, [(c2 & ~0x08) | 0x08])  # AIE = 1

    def alarm_fired(self):
        return bool(self._r(_STATUS)[0] & _AF)

    def clear_alarm(self):
        """Clear AF (INT is released); the alarm stays armed."""
        st = self._r(_STATUS)[0]
        self._w(_STATUS, [st & ~_AF & 0x7F])

    def disable_alarm(self):
        c2 = self._r(_CTRL2)[0]
        self._w(_CTRL2, [c2 & ~0x08])
        self._w(_ALARM, [0x80, 0x80, 0x80])
        self.clear_alarm()
