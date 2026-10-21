---
name: part-pimoroni-mics6814-breakout
description: Pinout, electrical limits, wiring and MicroPython driver for the Pimoroni MICS6814 3-in-1 Gas Sensor Breakout (PIM569, CO / NO2 / NH3, SGX MiCS-6814 read over I2C by a Nuvoton MS51 running Pimoroni's IO Expander firmware at 0x19). Use when designing, wiring, simulating or writing code for this I2C MICS6814 board in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Pimoroni MICS6814 3-in-1 Gas Sensor Breakout (PIM569)

## Overview
The **MiCS-6814** (SGX Sensortech, now Amphenol) holds three metal-oxide gas sensors, each with its own heater:
- **RED** (reducing gases: CO 1–1000 ppm, ethanol, H2, hydrocarbons). Rs **falls** with gas. R0 in air 100–1500 kΩ.
- **OX** (oxidising gases: NO2 0.05–10 ppm). Rs **rises** with NO2. R0 in air 0.8–20 kΩ.
- **NH3** (ammonia 1–300 ppm). Rs **falls** with gas. R0 in air 10–1500 kΩ.

On Pimoroni's Breakout Garden board a **Nuvoton MS51XB9AE** microcontroller runs Pimoroni's *IO Expander* firmware: it reads the three sensor nodes with its 12-bit ADC, switches the heaters, and drives an RGB LED, all over **I2C at 0x19**. It gives resistances and relative changes, **not calibrated ppm**.

This is a different board from the analog CJMCU-6814 (part-mics-6814), which has no microcontroller.

## Pinout (header, left to right as printed)
| Pin | Name | Function |
|-----|------|----------|
| 1 | 3-5V | Supply 3–5 V (MS51 VDD + 3.3 V LDO for sensor and heaters) |
| 2 | SDA | I2C data (no pull-up on the board) |
| 3 | SCL | I2C clock (no pull-up on the board) |
| 4 | INT | Interrupt output (P1.3), not needed |
| 5 | GND | Ground |

The order matches Raspberry Pi header pins 1, 3, 5, 7, 9.

## Electrical limits
- Supply **3–5 V** (silkscreen "3-5V"; MS51 VDD 2.4–5.5 V, its ADC 2.7–5.5 V). About **95 mA** with the heaters on: 26 + 32 + 30 mA through the board's 62 Ω / 28 Ω / 36.5 Ω heater resistors from the AP7333 3.3 V LDO, plus the MCU.
- The MS51 runs **straight from the supply pin**, so SDA, SCL and INT are logic at that voltage. Use **3.3 V** with an ESP32 or Pico.
- **No I2C pull-ups** on the board: fit 4.7 kΩ from SDA and SCL to 3.3 V (a Raspberry Pi already has 1.8 kΩ).

## Interface details
- I2C address **0x19**, chip id **0xE26A** (registers 0xFA low, 0xFB high).
- The firmware maps the MS51's SFRs to I2C registers (SFR − 0x40): ADCRL 0x82 (result bits 3:0), ADCRH 0x83 (bits 11:4), ADCCON1 0xA1 (bit 0 ADCEN), ADCCON0 0xA8 (bit 7 ADCF done, bit 6 ADCS start, bits 3:0 channel), AINDIDS0 0xB6, P0M1/P0M2 0x71/0x72, P1M1/P1M2 0x73/0x74. P1 (0x50) is bit-addressed: write `0b1000 | bit` to set a bit, `bit` to clear it.
- One reading: write `1 << ch` to AINDIDS0, read ADCCON0, write it back with the channel in bits 3:0, ADCF cleared and ADCS set, poll ADCF, then read 0x82–0x83: `raw = ADCRH << 4 | ADCRL & 0x0F`.
- Channels: RED = AIN2 (P0.7), NH3 = AIN3 (P0.6), OX = AIN4 (P0.5), SENSOR_3V3 rail = AIN0 (P1.7).
- Board circuit (schematic): 56 kΩ from the 3.3 V rail to each node, Rs from the node to GND:
```
V = Vrail × Rs / (Rs + 56k)          Rs = 56k × raw / (raw_rail − raw)
```
  Taking the ratio to the rail reading cancels both the rail voltage and the ADC reference (= the supply).
- Heater enable: P1.5 drives a P-MOSFET, **LOW = heaters on**. RGB LED cathodes on P1.2 (red), P1.1 (green), P1.0 (blue), LOW = on.

## Wiring
| Breakout | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| 3-5V | 3V3 | 3V3(OUT) (pin 36) | 3.3 V (pin 1) |
| SDA | GPIO21 + 4.7 kΩ to 3V3 | GP4 + 4.7 kΩ to 3V3 | pin 3 |
| SCL | GPIO22 + 4.7 kΩ to 3V3 | GP5 + 4.7 kΩ to 3V3 | pin 5 |
| INT | not connected | not connected | pin 7 (optional) |
| GND | GND | GND | pin 9 |

## Using the driver
```python
from machine import I2C, Pin
import time
from mics6814_i2c import MICS6814
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
gas = MICS6814(i2c)          # checks the chip id, enables the ADC, heaters on
time.sleep(600)              # warm-up
gas.calibrate()              # R0 = Rs now (clean air)
while True:
    red, nh3, ox = gas.resistances()      # ohms
    print('RED %.0fk NH3 %.0fk OX %.1fk' % (red / 1000, nh3 / 1000, ox / 1000), gas.ratios())
    time.sleep(1)
```
`gas.heater(False)` turns the heaters off; `gas.led(r, g, b)` switches the LED colours (on/off; Pimoroni's Python library adds PWM dimming). `gas.raw(ch)` gives one 12-bit conversion.

## Gotchas
- **No pull-ups on SDA/SCL.** Without them an ESP32 or Pico gets no ACK at 0x19.
- **Power it at 3.3 V** with 3.3 V boards: at 5 V the MS51's I2C and INT levels follow 5 V.
- **Warm-up**: the heaters need minutes (ideally hours the first time) before readings settle.
- **Not selective, not calibrated, not a safety device.** Use Rs/R0 trends; calibrate R0 in clean air.
- **OX is inverted**: NO2 raises its resistance while RED and NH3 fall with gas.
- Pimoroni's Python library uses a fixed 3.3 V reference; this driver uses the rail channel (AIN0) instead, which stays right on a 5 V supply or a sagging LDO.
- Simulator: the heater and LED are not shown; conversions finish at once (ADCF reads 1), as they do on the chip before the next I2C transfer.

## Datasheet
https://www.sgxsensortech.com/content/uploads/2015/02/1143_Datasheet-MiCS-6814-rev-8.pdf

Board schematic: https://cdn.shopify.com/s/files/1/0174/1800/files/MICS6814_breakout_schematic.pdf?v=1628772412

---
*Generated by Sparkbench from the datasheet: https://www.sgxsensortech.com/content/uploads/2015/02/1143_Datasheet-MiCS-6814-rev-8.pdf. Machine-readable definition: `part.json`.*
