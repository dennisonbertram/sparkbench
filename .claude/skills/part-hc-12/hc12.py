# HC-12 433 MHz wireless serial module (Si4463 radio + STM8S003 MCU, hc01.com firmware), MicroPython driver.
# Datasheet (HC-12 V2.4 user manual, "Module parameter setting AT command"):
#  - Pull pin 5 SET low to enter AT command mode; wait 40 ms before sending a command.
#    Release SET (high / floating, internal 10k pull-up) and wait 80 ms before sending data again.
#    After leaving AT mode the module resets: wait at least 200 ms before entering AT mode again.
#  - In AT mode the module talks at its configured baud (factory 9600 8N1). If SET is held low
#    while the module powers up, AT mode always runs at 9600 8N1.
#  - Commands have no terminator; replies end with \r\n: AT -> OK, AT+RB -> OK+B9600, AT+RC -> OK+RC001,
#    AT+RF -> OK+FU3, AT+RP -> OK+RP:+20dBm, AT+V -> www.hc01.com HC-12_V2.4, AT+RX -> all four.
#  - New settings take effect after leaving AT mode and survive power-off.
#  - With SET high every byte written to RXD is sent over the air; bytes received come out of TXD.
import time

_BAUDS = (1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200)
_POWER_DBM = (-1, 2, 5, 8, 11, 14, 17, 20)  # AT+P1 .. AT+P8


class HC12:
    def __init__(self, uart, set_pin, timeout_ms=500, idle_ms=60):
        """set_pin: a machine.Pin already configured as Pin.OUT, wired to the module's SET."""
        self.uart = uart
        self.set = set_pin
        self.set.value(1)
        self.timeout_ms = timeout_ms
        self.idle_ms = idle_ms
        self._at = False
        self._left_at = time.ticks_ms() - 200
        self._buf = b''

    # --- AT command mode -------------------------------------------------
    def enter_at(self):
        if self._at:
            return
        wait = 200 - time.ticks_diff(time.ticks_ms(), self._left_at)
        if wait > 0:
            time.sleep_ms(wait)  # module resets after leaving AT mode
        self.set.value(0)
        time.sleep_ms(40)  # datasheet: wait 40 ms after SET low
        self._at = True

    def exit_at(self):
        if not self._at:
            return
        self.set.value(1)
        time.sleep_ms(80)  # datasheet: wait 80 ms before transparent mode works
        self._at = False
        self._left_at = time.ticks_ms()

    def _drain(self):
        while self.uart.any():
            self.uart.read()

    def command(self, cmd):
        """Send one AT command (enters AT mode if needed) and return the reply text, CRLF stripped."""
        self.enter_at()
        self._drain()
        self.uart.write(cmd.encode())
        t0 = time.ticks_ms()
        reply = b''
        last_rx = None
        while True:
            now = time.ticks_ms()
            if self.uart.any():
                got = self.uart.read()
                if got:
                    reply += got
                    last_rx = now
            elif last_rx is not None and time.ticks_diff(now, last_rx) >= self.idle_ms:
                break
            elif last_rx is None and time.ticks_diff(now, t0) >= self.timeout_ms:
                break
            else:
                time.sleep_ms(5)
        if not reply:
            raise OSError('HC-12: no reply to %s (SET not low, or wrong baud?)' % cmd)
        return reply.decode().strip()

    def _ok(self, cmd, expect):
        r = self.command(cmd)
        if not r.startswith(expect):
            raise OSError('HC-12: %s -> %s' % (cmd, r))
        return r

    def ping(self):
        self._ok('AT', 'OK')
        return True

    def version(self):
        return self.command('AT+V')

    def baud(self):
        return int(self._ok('AT+RB', 'OK+B')[4:])

    def channel(self):
        return int(self._ok('AT+RC', 'OK+RC')[5:])

    def mode(self):
        return int(self._ok('AT+RF', 'OK+FU')[5:])

    def power_dbm(self):
        r = self._ok('AT+RP', 'OK+RP')
        s = r[r.index(':') + 1:].replace('dBm', '').strip()
        return int(s)

    def set_baud(self, baud):
        """Applies after exit_at(); re-open the UART at the new rate then."""
        if baud not in _BAUDS:
            raise ValueError('baud must be one of %s' % (_BAUDS,))
        return self._ok('AT+B%d' % baud, 'OK+B')

    def set_channel(self, ch):
        """Channel 1-127 (1 = 433.4 MHz, +400 kHz per channel; above 100 range is not guaranteed)."""
        if not 1 <= ch <= 127:
            raise ValueError('channel must be 1-127')
        return self._ok('AT+C%03d' % ch, 'OK+C')

    def set_mode(self, fu):
        """Transparent mode FU1/FU2/FU3 (FU2 only supports 1200-4800 baud). Both ends must match."""
        if fu not in (1, 2, 3, 4):
            raise ValueError('mode must be 1-4')
        return self._ok('AT+FU%d' % fu, 'OK+FU')

    def set_power(self, level):
        """Transmit power level 1-8 (-1 to +20 dBm)."""
        if not 1 <= level <= 8:
            raise ValueError('power level must be 1-8')
        return self._ok('AT+P%d' % level, 'OK+P')

    def defaults(self):
        return self._ok('AT+DEFAULT', 'OK+DEFAULT')

    def sleep(self):
        """Module sleeps (about 22 uA) after exit_at(); entering AT mode again wakes it."""
        return self._ok('AT+SLEEP', 'OK+SLEEP')

    # --- transparent mode (SET high) ---------------------------------------
    def write(self, data):
        self.exit_at()
        return self.uart.write(data)

    def readline(self):
        """Return one received line (without \\r\\n) as str, or None if no whole line yet."""
        if self.uart.any():
            got = self.uart.read()
            if got:
                self._buf += got
        if b'\n' in self._buf:
            line, self._buf = self._buf.split(b'\n', 1)
            return line.strip().decode()
        return None
