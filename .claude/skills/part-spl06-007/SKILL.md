---
name: part-spl06-007
description: Pinout, electrical limits, wiring and MicroPython driver for the SPL06-007 barometric pressure sensor module (Goertek SPL06-007, Jaycar / Duinotech XC3702). Use when designing, wiring, simulating or writing code for an SPL06-007 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SPL06-007 barometric pressure sensor module (SPL06-007)

## Overview
The **SPL06-007** from Goertek measures air pressure (300–1100 hPa, ±1 hPa absolute, ±0.06 hPa relative, about ±0.5 m) and temperature (−40 to 85 °C, ±0.5 °C). It has 24-bit results, a 32-sample FIFO and factory calibration coefficients that the host uses to compute pressure and temperature. It talks I2C or SPI. Hobbyists buy it on the **Jaycar / Duinotech XC3702 Barometric Pressure Sensor Module**, a GY-68-style 4-pin board with a 3.3 V regulator and 4.7 kΩ I2C pull-ups. Some GY-BMEP boards sold as BMP280 also carry this chip.

## Pinout (Jaycar XC3702, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3.3–5 V (on-board 3.3 V regulator) |
| GND | Ground |
| SCL | I2C clock, 4.7 kΩ pull-up on the board |
| SDA | I2C data, 4.7 kΩ pull-up on the board |

## Electrical limits
- Chip: VDD 1.7–3.6 V, VDDIO 1.2–3.6 V, absolute maximum 4 V on any pin. The module takes 3.3–5 V on VIN.
- Current: 400–500 µA peak while converting, 3–40 µA average at 1 reading per second, under 1 µA standby.
- The pull-ups go to the module's 3.3 V, so SDA/SCL are safe for 3.3 V boards.

## Interface details
- **I2C address 0x76** on the XC3702 (SDO tied low). A board with SDO high or open answers at 0x77.
- ID register 0x0D = **0x10** (the same value as the Infineon DPS310, which shares this register map).
- Soft reset: write 0x09 to RESET (0x0C). Wait until MEAS_CFG (0x08) bits 7 COEF_RDY and 6 SENSOR_RDY are set (≤ 40 ms).
- Coefficients (0x10–0x21, two's complement): c0, c1 12-bit; c00, c10 20-bit; c01, c11, c20, c21, c30 16-bit (datasheet table 10).
- PRS_CFG (0x06): PM_PRC bits 3:0 oversampling (0 = 1×, 1 = 2× Low Power, 4 = 16× Standard, 6 = 64× High Precision). TMP_CFG (0x07): bit 7 TMP_EXT = 1 (the datasheet says to use the external sensor), TMP_PRC bits 2:0 (single is the default).
- CFG_REG (0x09): set P_SHIFT (bit 2) / T_SHIFT (bit 3) when that oversampling is above 8×.
- Command mode: write 0x02 to MEAS_CFG for one temperature measurement (TMP_RDY bit 5), 0x01 for one pressure measurement (PRS_RDY bit 4). Results: pressure 0x00–0x02, temperature 0x03–0x05, 24-bit two's complement, MSB first. Times: 3.6 ms (1×), 14.8 ms (8×), 27.6 ms (16×), 104.4 ms (64×).
- Scale factor kP / kT (table 4): 1× 524288, 2× 1572864, 4× 3670016, 8× 7864320, 16× 253952, 32× 516096, 64× 1040384, 128× 2088960.
- Temperature: Tcomp = c0 × 0.5 + c1 × Traw/kT (°C).
- Pressure (Pa): with P = Praw/kP, T = Traw/kT: c00 + P(c10 + P(c20 + P·c30)) + T·c01 + T·P(c11 + P·c21).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from spl06_007 import SPL06
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = SPL06(i2c, addr=0x76)           # pressure 16x, temperature 1x
t, p = sensor.read()                     # degC, hPa
print('T=%.2fC P=%.2fhPa' % (t, p))
print('Altitude %.1f m' % sensor.altitude(1013.25))
```

## Gotchas
- Jaycar's listing and older manuals call the XC3702 a BMP180 board; current stock carries the SPL06-007 (printed on the PCB). A BMP180/BMP280 library will not work: read ID 0x0D, which is 0x10 on the SPL06.
- The address is 0x76 on the XC3702, not the chip's default 0x77. Run an I2C scan if unsure.
- Use the right kP/kT for the oversampling you set, and enable the result shift above 8×, or the numbers come out wildly wrong.
- Compute temperature before pressure: pressure compensation uses the latest raw temperature.
- On 8-bit Arduino code the 24-bit and 20-bit values overflow 16-bit ints; MicroPython integers have no such problem.
- For altitude, pass today's sea-level pressure from a local weather report; the default 1013.25 hPa can be off by tens of metres.

## Datasheet
https://raw.githubusercontent.com/rv701/SPL06-007/master/datasheets/1912111437_Goertek-SPL06-007_C233787.pdf
