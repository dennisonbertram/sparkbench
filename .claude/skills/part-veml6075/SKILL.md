---
name: part-veml6075
description: Pinout, electrical limits, wiring and MicroPython driver for the VEML6075 UVA/UVB light sensor (Vishay VEML6075). Use when designing, wiring, simulating or writing code for a VEML6075 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# VEML6075 UVA/UVB light sensor (VEML6075)

## Overview
The **VEML6075** from Vishay measures UVA (peak 365 nm) and UVB (peak 330 nm) light as 16-bit counts. It also has two compensation channels, UVcomp1 for visible light and UVcomp2 for infrared. You subtract these from the UV channels and combine the results into a **UV index**. It talks I2C. Hobbyists buy it on the **Adafruit VEML6075 UVA UVB and UV Index Sensor Breakout (product 3964)**. That board has a MIC5225 3.3 V regulator, a 2N7002 I2C level shifter and 10 kΩ pull-ups, so it runs from 3–5 V. Vishay has marked the chip end-of-life, so boards may be hard to find.

## Pinout (Adafruit 3964, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (feeds the on-board 3.3 V regulator) |
| 3Vo | 3.3 V regulator output (up to about 100 mA). Leave it unconnected |
| GND | Ground |
| SCL | I2C clock (pull-up and level shifter on the board) |
| SDA | I2C data (pull-up and level shifter on the board) |

## Electrical limits
- Chip supply: 1.7–3.6 V (absolute max 3.6 V). The breakout's VIN takes 3–5 V.
- Current: about 480–500 µA while measuring, 800 nA in shutdown (SD = 1).
- I2C at up to 400 kHz.

## Interface details
- **I2C address 0x10**, fixed. You can have only one per bus.
- Every register is 16 bits wide and goes **low byte first**. To write: address, command code, data low, data high. To read: write the command code, send a repeated start, then read the data low and data high bytes.
- `UV_CONF` (0x00) low byte: bits 6:4 UV_IT (0 = 50 ms, 1 = 100, 2 = 200, 3 = 400, 4 = 800 ms), bit 3 HD, bit 2 UV_TRIG, bit 1 UV_AF (active force mode), bit 0 SD (1 = shut down). Write `0x10 0x00` for continuous mode at 100 ms.
- Data registers: UVA 0x07, UVB 0x09, UVcomp1 0x0A, UVcomp2 0x0B. The ID register is 0x0C, and its low byte reads 0x26.
- UV index (Vishay application note "Designing the VEML6075 into an Application", open air, IT = 100 ms):
  - UVAcalc = UVA − 2.22 × UVcomp1 − 1.33 × UVcomp2
  - UVBcalc = UVB − 2.95 × UVcomp1 − 1.74 × UVcomp2
  - UVI = (UVAcalc × 0.001461 + UVBcalc × 0.002591) / 2
- A PTFE diffuser changes these coefficients. The application note has a table of values for each diffuser.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from veml6075 import VEML6075
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
uv = VEML6075(i2c)            # powers on, IT = 100 ms
uva, uvb, c1, c2 = uv.raw()   # raw counts
print('UVI=%.2f' % uv.uv_index())
```

## Gotchas
- Glass and most clear plastics block UVB. Indoors behind a window the UV index reads close to 0.
- After you power it on or change the integration time, wait two integration times before you trust the first reading.
- The responsivity numbers in the formula are for IT = 100 ms. The driver scales them for other integration times.
- Bright visible or IR light with no UV can make UVAcalc or UVBcalc slightly negative, so the driver clamps the UV index at 0.

## Datasheet
https://www.vishay.com/docs/84304/veml6075.pdf (application note: https://www.vishay.com/docs/84339/designingveml6075.pdf)
