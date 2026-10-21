# Senseair S8 LP NDIR CO2 sensor, MicroPython driver (Modbus RTU over UART).
# From Senseair TDE2067 (Modbus on Senseair S8): 9600 baud, 8N1 (sensor sends 2 stop bits),
# "any address" 0xFE, function 0x04 Read Input Registers, CRC-16/MODBUS sent low byte first.
# Reads IR1..IR4 in one frame: MeterStatus, AlarmStatus, OutputStatus, Space CO2 (ppm).
import time


def _crc16(data):
    crc = 0xFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc


class S8:
    ADDR = 0xFE  # "any address" (sensor answers regardless of its own address)

    def __init__(self, uart, addr=ADDR):
        self.uart = uart
        self.addr = addr

    def _read_input(self, start, count):
        req = bytes([self.addr, 0x04, start >> 8, start & 0xFF, count >> 8, count & 0xFF])
        c = _crc16(req)
        req += bytes([c & 0xFF, c >> 8])
        while self.uart.any():  # drop stale bytes
            self.uart.read()
        self.uart.write(req)
        n = 5 + 2 * count
        buf = b''
        t0 = time.ticks_ms()
        while len(buf) < n and time.ticks_diff(time.ticks_ms(), t0) < 500:
            d = self.uart.read(n - len(buf))
            if d:
                buf += d
            else:
                time.sleep_ms(10)
        if len(buf) < 5:
            raise OSError('S8: no reply (check TxD/RxD are crossed and G+ has 5 V)')
        if buf[1] & 0x80:
            raise OSError('S8: Modbus exception %d' % buf[2])
        if len(buf) < n or buf[0] != self.addr or buf[1] != 0x04 or buf[2] != 2 * count:
            raise OSError('S8: bad reply')
        c = _crc16(buf[:n - 2])
        if buf[n - 2] != (c & 0xFF) or buf[n - 1] != (c >> 8):
            raise OSError('S8: CRC mismatch')
        return [(buf[3 + 2 * i] << 8) | buf[4 + 2 * i] for i in range(count)]

    def read(self):
        """Return (CO2 in ppm, MeterStatus bits). Status 0 means no error."""
        r = self._read_input(0x0000, 4)  # IR1..IR4
        return r[3], r[0]

    def co2(self):
        return self.read()[0]
