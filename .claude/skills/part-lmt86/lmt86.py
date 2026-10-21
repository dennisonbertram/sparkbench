# LMT86 analog temperature sensor (Texas Instruments), MicroPython driver.
# Datasheet SNIS169F (May 2024): VDD = 2.2-5.5 V, 5.4 uA, push-pull output, power-on time 1.9 ms max.
# The output FALLS as temperature rises: 2616 mV at -50 C, 2100 mV at 0 C, 1831 mV at 25 C,
# 420 mV at 150 C (average gain -10.9 mV/C). The response is slightly parabolic, so the driver
# interpolates the datasheet's Transfer Table (Table 7-1), which TI gives for host look-up tables
# and which is the reference the accuracy specs are stated against.
from machine import ADC, Pin

# Table 7-1: VOUT in mV for every whole degree from -50 C to +150 C.
_T0 = -50
_MV = (
    2616, 2607, 2598, 2589, 2580, 2571, 2562, 2553, 2543, 2533,  # -50..-41 C
    2522, 2512, 2501, 2491, 2481, 2470, 2460, 2449, 2439, 2429,  # -40..-31 C
    2418, 2408, 2397, 2387, 2376, 2366, 2355, 2345, 2334, 2324,  # -30..-21 C
    2313, 2302, 2292, 2281, 2271, 2260, 2250, 2239, 2228, 2218,  # -20..-11 C
    2207, 2197, 2186, 2175, 2164, 2154, 2143, 2132, 2122, 2111,  # -10..-1 C
    2100, 2089, 2079, 2068, 2057, 2047, 2036, 2025, 2014, 2004,  # 0..9 C
    1993, 1982, 1971, 1961, 1950, 1939, 1928, 1918, 1907, 1896,  # 10..19 C
    1885, 1874, 1864, 1853, 1842, 1831, 1820, 1810, 1799, 1788,  # 20..29 C
    1777, 1766, 1756, 1745, 1734, 1723, 1712, 1701, 1690, 1679,  # 30..39 C
    1668, 1657, 1646, 1635, 1624, 1613, 1602, 1591, 1580, 1569,  # 40..49 C
    1558, 1547, 1536, 1525, 1514, 1503, 1492, 1481, 1470, 1459,  # 50..59 C
    1448, 1436, 1425, 1414, 1403, 1391, 1380, 1369, 1358, 1346,  # 60..69 C
    1335, 1324, 1313, 1301, 1290, 1279, 1268, 1257, 1245, 1234,  # 70..79 C
    1223, 1212, 1201, 1189, 1178, 1167, 1155, 1144, 1133, 1122,  # 80..89 C
    1110, 1099, 1088, 1076, 1065, 1054, 1042, 1031, 1020, 1008,  # 90..99 C
    997, 986, 974, 963, 951, 940, 929, 917, 906, 895,  # 100..109 C
    883, 872, 860, 849, 837, 826, 814, 803, 791, 780,  # 110..119 C
    769, 757, 745, 734, 722, 711, 699, 688, 676, 665,  # 120..129 C
    653, 642, 630, 618, 607, 595, 584, 572, 560, 549,  # 130..139 C
    537, 525, 514, 502, 490, 479, 467, 455, 443, 432,  # 140..149 C
    420,  # 150..150 C
)


def mv_to_celsius(mv):
    """Convert an LMT86 output voltage (mV) to C by linear interpolation of Table 7-1."""
    if mv >= _MV[0]:
        return float(_T0)          # at or below -50 C (end of the specified range)
    if mv <= _MV[-1]:
        return float(_T0 + len(_MV) - 1)  # at or above 150 C
    lo, hi = 0, len(_MV) - 1       # binary search on the falling table
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if _MV[mid] > mv:
            lo = mid
        else:
            hi = mid
    v1, v2 = _MV[lo], _MV[hi]
    return _T0 + lo + (v1 - mv) / (v1 - v2)


class LMT86:
    def __init__(self, pin, samples=32, vref=3.3):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: 0-3.1 V range covers the 0.42-2.62 V output
        except AttributeError:
            pass
        self.samples = samples
        self.vref = vref  # ADC reference used when read_uv() is not available (e.g. Pico)

    def millivolts(self):
        """Average several ADC samples and return the output voltage in mV."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref * 1000 / 65535
        return total / self.samples

    def temperature(self):
        """Temperature in C from the datasheet transfer table."""
        return mv_to_celsius(self.millivolts())
