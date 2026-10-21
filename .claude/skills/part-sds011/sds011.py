# Nova Fitness SDS011 laser PM2.5/PM10 sensor, MicroPython driver.
# UART 9600 8N1. In the factory-default "active" mode the sensor sends a 10-byte frame
# every second: AA C0 PM25_L PM25_H PM10_L PM10_H ID1 ID2 CHECKSUM AB,
# checksum = low 8 bits of DATA1+...+DATA6, PM = (high*256 + low) / 10 ug/m3.
# Commands (19 bytes: AA B4 <15 data bytes> <checksum> AB) follow the
# "Laser Dust Sensor Control Protocol V1.3".
import time


class SDS011:
    def __init__(self, uart):
        self.uart = uart
        self._buf = b''

    def _poll(self):
        n = self.uart.any()
        if n:
            d = self.uart.read(n)
            if d:
                self._buf = (self._buf + d)[-64:]

    def read(self):
        """Return the newest (pm2_5, pm10) in ug/m3 from the stream, or None if no valid frame yet."""
        self._poll()
        b = self._buf
        result = None
        i = 0
        while i + 10 <= len(b):
            if b[i] == 0xAA and b[i + 1] == 0xC0 and b[i + 9] == 0xAB:
                if sum(b[i + 2:i + 8]) & 0xFF == b[i + 8]:
                    pm25 = (b[i + 3] * 256 + b[i + 2]) / 10
                    pm10 = (b[i + 5] * 256 + b[i + 4]) / 10
                    result = (pm25, pm10)
                    i += 10
                    continue
            i += 1
        self._buf = b[i:]
        return result

    def _cmd(self, data, dev_id=0xFFFF):
        # data: up to 13 data bytes (DATA1..DATA13); ID FF FF = every sensor answers.
        d = bytearray(15)
        d[0:len(data)] = bytes(data)
        d[13] = (dev_id >> 8) & 0xFF
        d[14] = dev_id & 0xFF
        self.uart.write(b'\xaa\xb4' + d + bytes([sum(d) & 0xFF, 0xAB]))

    def query(self):
        """Ask for one reading (needed in query mode; at least 3 s apart)."""
        self._buf = b''
        self._cmd([0x04])
        t = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t) < 1500:
            r = self.read()
            if r:
                return r
            time.sleep_ms(20)
        return None

    def sleep(self):
        """Stop the fan and laser (lasts until wake() or power cycle)."""
        self._cmd([0x06, 0x01, 0x00])

    def wake(self):
        """Start the fan and laser again; readings are stable after about 30 s."""
        self._cmd([0x06, 0x01, 0x01])

    def set_active_mode(self):
        """Factory default: the sensor reports by itself (stored in the sensor)."""
        self._cmd([0x02, 0x01, 0x00])

    def set_query_mode(self):
        """Report only when asked with query() (stored in the sensor)."""
        self._cmd([0x02, 0x01, 0x01])

    def set_period(self, minutes):
        """0 = continuous; 1-30 = work 30 s then sleep for the rest of each period (stored)."""
        self._cmd([0x08, 0x01, max(0, min(30, int(minutes)))])
