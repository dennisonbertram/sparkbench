# US-100 ultrasonic distance sensor in serial (UART) mode, MicroPython driver.
# Mode jumper fitted on the back of the module. 9600 baud, 8-N-1.
# Send 0x55 -> 2 bytes back, high byte first: distance in mm.
# Send 0x50 -> 1 byte back: temperature in degC = byte - 45.
# Wiring note: the module's Trig/TX pin RECEIVES (connect it to the board's UART TX)
# and Echo/RX SENDS (connect it to the board's UART RX).
import time


class US100:
    def __init__(self, uart):
        self.uart = uart
        time.sleep_ms(100)
        self._flush()

    def _flush(self):
        while self.uart.any():
            self.uart.read()

    def _ask(self, cmd, n, timeout_ms=300):
        self._flush()
        self.uart.write(bytes([cmd]))
        t0 = time.ticks_ms()
        while self.uart.any() < n:
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                return None
            time.sleep_ms(10)
        d = self.uart.read(n)
        if not d or len(d) != n:
            return None
        return d

    def distance_mm(self):
        """Distance to the nearest object in mm (about 20-4500), or None if no reply."""
        d = self._ask(0x55, 2)
        if d is None:
            return None
        return (d[0] << 8) | d[1]

    def distance_cm(self):
        mm = self.distance_mm()
        return None if mm is None else mm / 10

    def temperature(self):
        """Module temperature in whole degC, or None if no reply."""
        d = self._ask(0x50, 1)
        if d is None:
            return None
        return d[0] - 45
