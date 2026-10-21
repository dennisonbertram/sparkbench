# Pimoroni MICS6814 3-in-1 Gas Sensor Breakout (PIM569), MicroPython driver.
# The board puts an SGX/Amphenol MiCS-6814 behind a Nuvoton MS51XB9AE running Pimoroni's "IO Expander"
# firmware (I2C address 0x19, chip id 0xE26A). The firmware exposes the MS51 special function registers
# over I2C (SFR address - 0x40), as used by Pimoroni's ioe-python / mics6814-python libraries:
#   ADCRL 0x82 (result bits 3:0), ADCRH 0x83 (result bits 11:4), ADCCON1 0xA1 (bit 0 ADCEN),
#   ADCCON0 0xA8 (bit 7 ADCF done, bit 6 ADCS start, bits 3:0 ADCHS channel), AINDIDS0 0xB6,
#   P0M1/P0M2 0x71/0x72, P1M1/P1M2 0x73/0x74, P1 0x50 (bit-addressed: write 0b1000|bit to set, bit to clear).
# Board wiring (schematic PIM569): each sensing resistor Rs runs from its *_SENSE node to GND, with a
# 56 kOhm resistor from the on-board 3.3 V LDO rail (SENSOR_3V3) to the node:
#     V_sense = V_rail * Rs / (Rs + 56k)
# SENSOR_3V3 itself is read on AIN0, and the ADC reference is the MCU supply, so the ratio of the two
# 12-bit readings gives Rs without knowing either voltage:
#     Rs = 56k * raw / (raw_rail - raw)
# Channels: RED (reducing, CO) P0.7 AIN2, NH3 P0.6 AIN3, OX (oxidising, NO2) P0.5 AIN4, rail P1.7 AIN0.
# Heater enable: P1.5 drives a P-MOSFET, LOW = heaters on (about 88 mA).
# Readings are resistances; gas concentrations need Rs/R0 against the MiCS-6814 datasheet curves and your
# own clean-air R0. Not a safety device.
import time

ADDR = 0x19
CHIP_ID = 0xE26A

_REG_CHIP_ID_L = 0xFA
_REG_ADCRL = 0x82
_REG_ADCCON1 = 0xA1
_REG_ADCCON0 = 0xA8
_REG_AINDIDS0 = 0xB6
_REG_P1 = 0x50
_REG_M1 = (0x71, 0x73)  # P0M1, P1M1
_REG_M2 = (0x72, 0x74)  # P0M2, P1M2

# (port, pin, adc channel)
_RAIL = (1, 7, 0)
_RED = (0, 7, 2)
_NH3 = (0, 6, 3)
_OX = (0, 5, 4)
_HEATER = (1, 5)  # P1.5, active low
_LEDS = ((1, 2), (1, 1), (1, 0))  # red, green, blue cathodes (LED anodes on the supply): LOW = on

LOAD_OHMS = 56000


class MICS6814:
    def __init__(self, i2c, address=ADDR, heater=True):
        self.i2c = i2c
        self.addr = address
        cid = self._read(_REG_CHIP_ID_L, 2)
        cid = cid[0] | (cid[1] << 8)
        if cid != CHIP_ID:
            raise OSError('MICS6814 breakout not found (chip id 0x%04x, expected 0x%04x)' % (cid, CHIP_ID))
        # ADC on, then the four analog pins as input-only (PxM1 = 1, PxM2 = 0).
        self._w(_REG_ADCCON1, self._r(_REG_ADCCON1) | 0x01)
        for port, pin, _ in (_RAIL, _RED, _NH3, _OX):
            self._mode(port, pin, 1, 0)
        self.r0 = None
        self.heater(heater)

    # --- register access ---
    def _read(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _r(self, reg):
        return self._read(reg, 1)[0]

    def _w(self, reg, value):
        self.i2c.writeto_mem(self.addr, reg, bytes((value & 0xFF,)))

    def _mode(self, port, pin, m1, m2):
        a = self._r(_REG_M1[port]) & ~(1 << pin)
        b = self._r(_REG_M2[port]) & ~(1 << pin)
        self._w(_REG_M1[port], a | (m1 << pin))
        self._w(_REG_M2[port], b | (m2 << pin))

    def _out(self, pin, high):
        # P1 is bit-addressed by the firmware: 0b1000 | bit sets the bit, bit alone clears it.
        self._w(_REG_P1, (0x08 if high else 0x00) | pin)

    # --- heater and LED ---
    def heater(self, on=True):
        """Switch the three sensor heaters on (default) or off. Readings need several minutes of heating."""
        self._mode(1, _HEATER[1], 0, 1)  # push-pull output
        self._out(_HEATER[1], not on)    # LOW = heaters on
        self.heating = bool(on)

    def led(self, r=False, g=False, b=False):
        """Switch the RGB LED colours on/off (full brightness; Pimoroni's library adds PWM dimming)."""
        for (port, pin), on in zip(_LEDS, (r, g, b)):
            self._mode(port, pin, 0, 1)
            self._out(pin, not on)

    # --- ADC ---
    def raw(self, channel, timeout_ms=1000):
        """One 12-bit conversion of AIN<channel> (0-4095, full scale = the board's supply)."""
        self._w(_REG_AINDIDS0, 1 << channel)
        con = self._r(_REG_ADCCON0)
        con = (con & ~0x0F) | channel
        con = (con & ~0x80) | 0x40  # clear ADCF, set ADCS (start)
        self._w(_REG_ADCCON0, con)
        t0 = time.ticks_ms()
        while not (self._r(_REG_ADCCON0) & 0x80):
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('MICS6814 ADC conversion timed out')
            time.sleep_ms(1)
        lo, hi = self._read(_REG_ADCRL, 2)
        return (hi << 4) | (lo & 0x0F)

    def _rs(self, ch, rail):
        v = self.raw(ch)
        if v >= rail:
            return float('inf')  # open circuit or Rs far above the 56k load
        return LOAD_OHMS * v / (rail - v)

    def resistances(self):
        """(Rs_RED, Rs_NH3, Rs_OX) in ohms, from the ratio to the SENSOR_3V3 rail reading."""
        rail = self.raw(_RAIL[2])
        if rail == 0:
            raise OSError('MICS6814 sensor rail reads 0')
        return self._rs(_RED[2], rail), self._rs(_NH3[2], rail), self._rs(_OX[2], rail)

    def rail_fraction(self):
        """SENSOR_3V3 as a fraction of the supply (about 1.0 on 3.3 V, about 0.66 on 5 V)."""
        return self.raw(_RAIL[2]) / 4095

    def calibrate(self):
        """Store the present Rs of each channel as R0 (clean air, after a long warm-up)."""
        self.r0 = self.resistances()
        return self.r0

    def ratios(self):
        """(Rs/R0 RED, NH3, OX): the y axis of the MiCS-6814 datasheet charts. Needs calibrate() first."""
        if not self.r0:
            raise ValueError('call calibrate() first')
        return tuple(r / r0 for r, r0 in zip(self.resistances(), self.r0))
