---
name: part-sht85
description: Pinout, electrical limits, wiring and MicroPython driver for the Sensirion SHT85 high-accuracy humidity & temperature sensor (SHT85, pin-type package). Use when designing, wiring, simulating or writing code for an SHT85 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SHT85 humidity & temperature sensor (SHT85)

## Overview
The **SHT85** from Sensirion is an SHT3x-family sensor on a small pin-type carrier with a PTFE membrane (IP67). It measures relative humidity (0–100 %RH, ±1.5 %RH typical) and temperature (−40 to 105 °C, ±0.1 °C typical) over I2C. Hobbyists buy the **bare Sensirion SHT85**: a 4-pin, **1.27 mm pitch** single-in-line part meant to plug into a socket. It has a 100 nF decoupling capacitor on board but **no pull-up resistors**.

## Pinout (SHT85, pin 1 to pin 4, transparent top view)
| Pin | Name | Function |
|---|---|---|
| 1 | SCL | I2C clock (input only), needs 10 kΩ pull-up to VDD |
| 2 | VDD | Supply, 2.15–5.5 V (3.3 V recommended) |
| 3 | VSS | Ground |
| 4 | SDA | I2C data, needs 10 kΩ pull-up to VDD |

## Electrical limits
- Supply: 2.15–5.5 V (absolute max 6 V); SDA/SCL must stay within −0.3 V to VDD + 0.3 V.
- Current: 0.6 mA typical (1.5 mA max) while measuring, 0.2 µA idle.
- I2C up to 1 MHz (400 kHz fast mode standard).
- Operating range −40 to 105 °C (the connector limits it to 105 °C).

## Interface details
- **I2C address 0x44**, fixed (no address pin): one SHT85 per bus.
- Single-shot, high repeatability, no clock stretching: write **0x24 0x00**, wait ≥ 15.5 ms, read 6 bytes: T MSB, T LSB, CRC, RH MSB, RH LSB, CRC.
- CRC-8: polynomial 0x31, initial value 0xFF (datasheet example: 0xBEEF → 0x92).
- Temperature: T = −45 + 175 × raw / 65535 °C. Humidity: RH = 100 × raw / 65535 %RH.
- Wait at least 1 ms between commands.

## Wiring
The 1.27 mm pins do not fit a breadboard: use a 1.27 mm socket (e.g. Preci-Dip 851 series) with jumper leads. Add 10 kΩ from SDA to VDD and from SCL to VDD.
- ESP32: VDD → 3V3, VSS → GND, SDA → D21, SCL → D22.
- Pico: VDD → 3V3(OUT), VSS → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), VSS → pin 6, SDA → pin 3, SCL → pin 5 (the Pi has 1.8 kΩ pull-ups on these, so the external ones are optional there).

## Using the driver
```python
from machine import I2C, Pin
from sht85 import SHT85
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = SHT85(i2c).read()
print('T=%.1fC H=%.0f%%' % (t, h))
```

## Gotchas
- Pin order is SCL, VDD, VSS, SDA, not the usual VCC/GND first: reversing the part swaps VDD and VSS and can kill it.
- No pull-ups on the sensor: without them the bus scan finds nothing.
- A CRC mismatch nearly always means a loose SDA/SCL wire or missing pull-ups.
- Measure at most 10 % of the time to keep self-heating below 0.1 °C; keep it away from the regulator and the microcontroller.
- When soldering, don't melt the joints between the pins and the sensor's own PCB.

## Datasheet
https://sensirion.com/media/documents/4B40CEF3/640B2346/Sensirion_Humidity_Sensors_SHT85_Datasheet.pdf
