# HC-05 Bluetooth SPP serial module (CSR BC417, ITead HC-05 AT command set), MicroPython driver.
# Talks to the module in AT command mode: hold the board's button (or have EN/KEY high) while
# powering the module up, then it answers at 38400 baud, 8N1, whatever its data baud is.
# Every command ends with \r\n; the module answers with optional "+CMD:<param>" lines and then
# "OK", or "FAIL" / "ERROR:(<code>)".
import time


class HC05:
    def __init__(self, uart, timeout_ms=1000):
        self.uart = uart
        self.timeout_ms = timeout_ms

    def _drain(self):
        while self.uart.any():
            self.uart.read()

    def command(self, cmd, timeout_ms=None):
        """Send one AT command (without \\r\\n); return the lines before "OK"."""
        self._drain()
        self.uart.write(cmd.encode() + b'\r\n')
        tmo = timeout_ms or self.timeout_ms
        t0 = time.ticks_ms()
        buf = b''
        lines = []
        while time.ticks_diff(time.ticks_ms(), t0) < tmo:
            if self.uart.any():
                got = self.uart.read()
                if got:
                    buf += got
                while b'\n' in buf:
                    line, buf = buf.split(b'\n', 1)
                    line = line.strip().decode()
                    if not line:
                        continue
                    if line == 'OK':
                        return lines
                    if line == 'FAIL' or line.startswith('ERROR'):
                        raise OSError('HC-05: %s -> %s' % (cmd, line))
                    lines.append(line)
            else:
                time.sleep_ms(5)
        raise OSError('HC-05: no reply to %s (AT mode needs the button held / EN high at power-up, 38400 baud)' % cmd)

    def query(self, cmd):
        """Send a query such as "AT+NAME?" and return the text after "+NAME:"."""
        for line in self.command(cmd):
            if line.startswith('+') and ':' in line:
                return line.split(':', 1)[1].strip()
        raise OSError('HC-05: no +reply to %s' % cmd)

    def ping(self):
        self.command('AT')
        return True

    def version(self):
        return self.query('AT+VERSION?')

    def name(self):
        return self.query('AT+NAME?')

    def role(self):
        """0 = slave, 1 = master, 2 = slave-loop."""
        return int(self.query('AT+ROLE?'))

    def uart_settings(self):
        """(baud, stop bit, parity) used in data mode."""
        return tuple(int(x) for x in self.query('AT+UART?').split(','))

    def paired_count(self):
        """Number of authenticated (paired) devices in the module's pairing list."""
        return int(self.query('AT+ADCN?'))
