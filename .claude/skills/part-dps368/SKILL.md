---
name: part-dps368
description: Pinout, electrical limits, wiring and MicroPython driver for the DPS368 waterproof barometric pressure & temperature sensor (Infineon XENSIV DPS368, S2GO PRESSURE DPS368 Shield2Go). Use when designing, wiring, simulating or writing code for a DPS368 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DPS368 waterproof barometric pressure & temperature sensor (DPS368)

## Overview
The **DPS368** from Infineon (XENSIV family) measures air pressure (300–1200 hPa, ±1 hPa absolute, ±0.06 hPa relative, ±0.002 hPa precision in high-precision mode) and temperature (−40 to 85 °C, ±0.5 °C). Its package is IPx8 water- and dust-resistant. It talks I2C or SPI and is register-compatible with the DPS310. Hobbyists buy it as Infineon's **XENSIV DPS368 Pressure Shield2Go (S2GO PRESSURE DPS368)**: a 3.3 V-only board with 10 kΩ I2C pull-ups, 0 Ω links set for I2C, a red power LED and a break-off sensor head.

## Pinout (Shield2Go, header by header)
Header 1 (pins 1–9):

| Pin | Name | Function |
|---|---|---|
| 1 | NC | not connected |
| 2 | NC | not connected |
| 3 | NC | not connected |
| 4 | SDA | I2C data, 10 kΩ pull-up to 3.3 V |
| 5 | SCL | I2C clock, 10 kΩ pull-up to 3.3 V |
| 6 | GND | Ground |
| 7 | 3V3 | Power 3.3 V (straight to the chip's VDD and VDDIO) |
| 8 | INT/GPIO3 | Interrupt (chip SDO) only with solder bridge J2 closed |
| 9 | NC | not connected |

Header 2 (pins 10–17): NC, NC, NC, NC, CS, SCLK, MOSI, MISO. The SPI pins are only connected after moving the 0 Ω links to the SPI positions; leave them unconnected for I2C.

The break-off head (pins 18–25: GND, SDO, SCK, SDI / VDD, VDDIO, CSB, GND) is only used once the head is snapped off.

## Electrical limits
- Supply: VDD 1.7–3.6 V, VDDIO 1.2–3.6 V; absolute maximum **4 V on any pin**. The board has no regulator or level shifter: 3.3 V only.
- Current: about 1.7 µA average at 1 pressure reading per second, 0.5 µA standby, plus about 2 mA for the power LED.
- I2C up to 3.4 MHz.

## Interface details
- **I2C address 0x77** (SDO floating); 0x76 when solder bridge J1 is closed (100 kΩ pull-down on SDO).
- ID register 0x0D = **0x10** (REV_ID 1, PROD_ID 0) — the same as a DPS310.
- Soft reset: write 0x09 to RESET (0x0C). Wait until MEAS_CFG (0x08) bits 7 COEF_RDY and 6 SENSOR_RDY are set (≤ 40 ms).
- Coefficients (0x10–0x21, two's complement): c0, c1 12-bit; c00, c10 20-bit; c01, c11, c20, c21, c30 16-bit (datasheet table 18).
- PRS_CFG (0x06): PM_PRC bits 3:0 oversampling (0 = 1×, 4 = 16× Standard, 6 = 64× High Precision). TMP_CFG (0x07): bit 7 TMP_EXT must equal TMP_COEF_SRCE (0x28) bit 7; TMP_PRC bits 3:0.
- CFG_REG (0x09): set P_SHIFT (bit 2) / T_SHIFT (bit 3) when that oversampling is above 8×.
- Command mode: write 0x02 to MEAS_CFG for one temperature measurement (TMP_RDY bit 5), 0x01 for one pressure measurement (PRS_RDY bit 4). Results: pressure 0x00–0x02, temperature 0x03–0x05, 24-bit two's complement, MSB first. Times: 3.6 ms (1×), 14.8 ms (8×), 27.6 ms (16×), 104.4 ms (64×).
- Scale factor kP / kT (table 9): 1× 524288, 2× 1572864, 4× 3670016, 8× 7864320, 16× 253952, 32× 516096, 64× 1040384, 128× 2088960.
- Temperature: Tcomp = c0 × 0.5 + c1 × Traw/kT (°C).
- Pressure (Pa): with P = Praw/kP, T = Traw/kT: c00 + P(c10 + P(c20 + P·c30)) + T·c01 + T·P(c11 + P·c21).

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3V3 → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- The board's two headers do not fit a breadboard row-wise; use jumper leads to header 1 pins 4–7.

## Using the driver
```python
from machine import I2C, Pin
from dps368 import DPS368
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = DPS368(i2c, addr=0x77)          # pressure 16x, temperature 1x
t, p = sensor.read()                     # degC, hPa
print('T=%.2fC P=%.2fhPa' % (t, p))
print('Altitude %.1f m' % sensor.altitude(1013.25))
```

## Gotchas
- **Never 5 V**: the 3V3 pin and the I2C lines go straight to the chip (absolute maximum 4 V). An Arduino Uno needs a level shifter.
- The ID register cannot tell a DPS368 from a DPS310.
- Some units have a fuse-bit fault that gives a wrong temperature; the driver writes the fix-up sequence (0x0E/0x0F/0x62) that Infineon's own DPS3xx library runs at start-up for both chips. It does nothing on good units.
- Use the right kP/kT for the oversampling you set, and enable the result shift above 8×, or the numbers come out wildly wrong.
- Compute temperature before pressure: pressure compensation uses the latest raw temperature.
- For altitude, pass today's sea-level pressure from a local weather report; the default 1013.25 hPa can be off by tens of metres.

## Datasheet
https://cdn.sparkfun.com/assets/d/6/1/9/3/DPS368-DataSheet.pdf
