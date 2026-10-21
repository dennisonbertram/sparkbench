---
name: part-dps310
description: Pinout, electrical limits, wiring and MicroPython driver for the DPS310 barometric pressure & altitude sensor (Infineon DPS310). Use when designing, wiring, simulating or writing code for a DPS310 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DPS310 barometric pressure & altitude sensor (DPS310)

## Overview
The **DPS310** from Infineon (XENSIV family) measures air pressure (300–1200 hPa, ±1 hPa absolute, ±0.06 hPa relative) and temperature (−40 to 85 °C, ±0.5 °C). Its pressure precision (down to 0.2 Pa RMS) resolves height changes of a few centimetres, so it is used as an altimeter. It talks I2C or SPI. Hobbyists buy it on the **Adafruit DPS310 Precision Barometric Pressure / Altitude Sensor breakout (#4494)**, which has a 3.3 V regulator, level shifting on SCK/SDI, 10 kΩ pull-ups and two STEMMA QT sockets.

## Pinout (Adafruit DPS310 #4494, header order)
The board prints the SPI names; Sparkbench calls the two I2C pins SCL and SDA.

| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (on-board AP2112K 3.3 V regulator) |
| 3Vo | 3.3 V output of the regulator; leave unconnected |
| GND | Ground |
| SCK (SCL) | I2C clock SCL (SPI SCK), level shifted, 10 kΩ pull-up |
| SDO | Address select: open = 0x77 (pulled up), GND = 0x76 (SPI data out / interrupt); 3.3 V only |
| SDI (SDA) | I2C data SDA (SPI SDI), level shifted, 10 kΩ pull-up |
| CS | SPI chip select; pulled up = I2C. Leave unconnected |

## Electrical limits
- Chip: VDD 1.7–3.6 V, VDDIO 1.2–3.6 V, absolute maximum 4 V on any pin. The breakout takes 3–5 V on VIN.
- Current: about 0.35 mA peak while measuring, 0.5 µA standby (plus the board's power LED).
- SDO and CS connect straight to the chip (3.3 V): never tie them to 5 V.

## Interface details
- **I2C address 0x77** on the Adafruit board (SDO high); 0x76 with SDO to GND or the jumper on the back shorted.
- ID register 0x0D = **0x10** (REV_ID 1, PROD_ID 0).
- Soft reset: write 0x09 to RESET (0x0C). Wait until MEAS_CFG (0x08) bits 7 COEF_RDY and 6 SENSOR_RDY are set (≤ 40 ms).
- Coefficients (0x10–0x21, two's complement): c0, c1 12-bit; c00, c10 20-bit; c01, c11, c20, c21, c30 16-bit (datasheet table 18).
- PRS_CFG (0x06): PM_PRC bits 3:0 oversampling (0 = 1×, 4 = 16× Standard, 6 = 64× High Precision). TMP_CFG (0x07): bit 7 TMP_EXT must equal COEF_SRCE (0x28) bit 7; TMP_PRC bits 3:0.
- CFG_REG (0x09): set P_SHIFT (bit 2) / T_SHIFT (bit 3) when that oversampling is above 8×.
- Command mode: write 0x02 to MEAS_CFG for one temperature measurement (TMP_RDY bit 5), 0x01 for one pressure measurement (PRS_RDY bit 4). Results: pressure 0x00–0x02, temperature 0x03–0x05, 24-bit two's complement, MSB first. Times: 3.6 ms (1×), 14.8 ms (8×), 27.6 ms (16×), 104.4 ms (64×).
- Scale factor kP / kT (table 9): 1× 524288, 2× 1572864, 4× 3670016, 8× 7864320, 16× 253952, 32× 516096, 64× 1040384, 128× 2088960.
- Temperature: Tcomp = c0 × 0.5 + c1 × Traw/kT (°C).
- Pressure (Pa): with P = Praw/kP, T = Traw/kT: c00 + P(c10 + P(c20 + P·c30)) + T·c01 + T·P(c11 + P·c21).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDI/SDA → D21, SCK/SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDI/SDA → GP4, SCK/SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDI/SDA → pin 3, SCK/SCL → pin 5.
- Leave 3Vo, SDO and CS unconnected for basic I2C use (address 0x77).

## Using the driver
```python
from machine import I2C, Pin
from dps310 import DPS310
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = DPS310(i2c, addr=0x77)          # pressure 16x, temperature 1x
t, p = sensor.read()                     # degC, hPa
print('T=%.2fC P=%.2fhPa' % (t, p))
print('Altitude %.1f m' % sensor.altitude(1013.25))
```

## Gotchas
- The pins are labelled for SPI: **SDI is SDA and SCK is SCL** in I2C mode.
- Pulling CS low even once switches the chip to SPI until power is cycled.
- Use the right kP/kT for the oversampling you set, and enable the result shift above 8×, or the numbers come out wildly wrong.
- Some DPS310 units report about twice the real temperature after start-up; the driver writes Infineon's published fix-up sequence (0x0E/0x0F/0x62) at start.
- Compute temperature before pressure: pressure compensation uses the latest raw temperature.
- For altitude, pass today's sea-level pressure from a local weather report; the default 1013.25 hPa can be off by tens of metres.

## Datasheet
https://community.infineon.com/gfawx74859/attachments/gfawx74859/KnowledgeBaseArticles/10104/3/Infineon-DPS310-DataSheet.pdf
