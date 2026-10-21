# HC-06 Bluetooth SPP slave module (CSR BC417/BC04, linvor / hc01.com firmware), MicroPython driver.
# Datasheet (Guangzhou HC / wavesen HC-06 data sheet, section 9 "AT command set"):
#  - The module answers AT commands whenever no Bluetooth device is connected, at its data baud
#    (factory default 9600 8N1).
#  - Commands have NO terminator (no \r\n): the module decides a command has ended from the pause
#    after it, so send at most one command per second.
#  - Replies have no terminator either: AT -> "OK", AT+VERSION -> "linvorV1.8" (sent as "OKlinvorV1.8"
#    by most units), AT+NAMExxx -> "OKsetname", AT+PINxxxx -> "OKsetPIN", AT+BAUDn -> "OK<baud>".
#  - While a phone is connected everything you write goes to the phone and AT commands are not answered.
import time

_BAUDS = {1200: '1', 2400: '2', 4800: '3', 9600: '4', 19200: '5', 38400: '6', 57600: '7',
          115200: '8', 230400: '9', 460800: 'A', 921600: 'B', 1382400: 'C'}


class HC06:
    CMD_GAP_MS = 1000  # datasheet: "The interval of command is about 1 second"

    def __init__(self, uart, timeout_ms=1500, idle_ms=100):
        self.uart = uart
        self.timeout_ms = timeout_ms
        self.idle_ms = idle_ms
        self._last_cmd = None
        self._buf = b''

    def _drain(self):
        while self.uart.any():
            self.uart.read()

    def command(self, cmd):
        """Send one AT command (no line ending) and return the module's reply text."""
        if self._last_cmd is not None:
            wait = self.CMD_GAP_MS - time.ticks_diff(time.ticks_ms(), self._last_cmd)
            if wait > 0:
                time.sleep_ms(wait)
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
                break  # replies have no terminator: a pause ends them
            elif last_rx is None and time.ticks_diff(now, t0) >= self.timeout_ms:
                break
            else:
                time.sleep_ms(5)
        self._last_cmd = time.ticks_ms()
        if not reply:
            raise OSError('HC-06: no reply to %s (module connected to a phone, or wrong baud?)' % cmd)
        return reply.decode().strip()

    def ping(self):
        r = self.command('AT')
        if not r.startswith('OK'):
            raise OSError('HC-06: AT -> %s' % r)
        return True

    def version(self):
        r = self.command('AT+VERSION')
        return r[2:] if r.startswith('OK') else r

    def set_name(self, name):
        """Bluetooth name, up to 20 characters. Some units only show it after a power cycle."""
        if not 0 < len(name) <= 20:
            raise ValueError('name must be 1-20 characters')
        return self.command('AT+NAME' + name)

    def set_pin(self, pin):
        """4-digit pairing PIN (default 1234)."""
        pin = '%s' % pin
        if len(pin) != 4 or not pin.isdigit():
            raise ValueError('PIN must be 4 digits')
        return self.command('AT+PIN' + pin)

    def set_baud(self, baud):
        """Data baud, kept after power-off. Re-open the UART at the new rate afterwards."""
        return self.command('AT+BAUD' + _BAUDS[baud])

    # Data mode (a phone is connected): plain serial bytes.
    def write(self, data):
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
