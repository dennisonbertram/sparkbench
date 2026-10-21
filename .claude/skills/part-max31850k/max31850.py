# MAX31850K 1-Wire K-type thermocouple amplifier, MicroPython driver.
# Written from the Maxim MAX31850/MAX31851 datasheet (19-6648):
#   family code 0x3B; Convert T (44h) takes up to 100 ms (tCONV max);
#   Read Scratchpad (BEh) returns 9 bytes, byte 8 = Maxim CRC-8 of bytes 0-7;
#   bytes 0-1 = cold-junction-compensated thermocouple temperature:
#     bits 15..2 = signed 14-bit value, 0.25 degC per LSB; bit 1 reserved; bit 0 = 1 on a fault;
#   bytes 2-3 = internal (cold-junction) temperature: bits 15..4 = signed 12-bit, 0.0625 degC per LSB;
#     bit 2 = short to VDD, bit 1 = short to GND, bit 0 = open circuit;
#   byte 4 = configuration: bits 3..0 = AD3..AD0 pin levels (bits 7..4 read as 1).
# MicroPython's ds18x20 module sends the commands and checks the scratchpad CRC; for any
# family other than 0x10 its read_temp() returns the signed 16-bit word of bytes 0-1 divided
# by 16, which this driver turns back into the raw word and decodes as above.
import time
import ds18x20

FAMILY = 0x3B
CONV_MS = 100  # tCONV max


class MAX31850Fault(OSError):
    pass


class MAX31850:
    def __init__(self, ow):
        self.ow = ow
        self.ds = ds18x20.DS18X20(ow)

    def scan(self):
        """ROM codes of every MAX31850/MAX31851 on the bus."""
        return [rom for rom in self.ow.scan() if rom[0] == FAMILY]

    def convert(self):
        """Start a conversion on every chip (Skip ROM + 44h) and wait tCONV (100 ms).
        Externally powered boards only: parasite power needs a strong pull-up during tCONV."""
        self.ds.convert_temp()
        time.sleep_ms(CONV_MS)

    def read_raw(self, rom):
        """Signed 16-bit word from scratchpad bytes 0-1 (CRC checked by ds18x20)."""
        return int(round(self.ds.read_temp(rom) * 16))

    def read_temp(self, rom):
        """Thermocouple temperature in degC (0.25 degC steps). Raises MAX31850Fault if the
        chip flags an open or shorted thermocouple (bit 0 of byte 0)."""
        raw = self.read_raw(rom)
        if raw & 0x01:
            raise MAX31850Fault('thermocouple fault: open circuit or shorted to GND/VDD')
        return (raw >> 2) * 0.25

    def read_detail(self, rom):
        """Whole scratchpad decoded: (thermocouple degC or None on fault, cold-junction degC,
        fault flags dict, AD3..AD0 address value)."""
        buf = self.ds.read_scratch(rom)  # raises on CRC error
        tc = buf[1] << 8 | buf[0]
        if tc & 0x8000:
            tc -= 0x10000
        cj = buf[3] << 8 | buf[2]
        if cj & 0x8000:
            cj -= 0x10000
        faults = {'open': bool(buf[2] & 0x01), 'short_gnd': bool(buf[2] & 0x02), 'short_vdd': bool(buf[2] & 0x04)}
        tc_c = None if tc & 0x01 else (tc >> 2) * 0.25
        return tc_c, (cj >> 4) * 0.0625, faults, buf[4] & 0x0F
