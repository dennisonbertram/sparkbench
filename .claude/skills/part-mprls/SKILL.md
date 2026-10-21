---
name: part-mprls
description: Pinout, electrical limits, wiring and MicroPython driver for the Adafruit MPRLS ported pressure sensor breakout, 0-25 psi (Honeywell MPRLS0025PA00001A, Adafruit product 3965). Use when designing, wiring, simulating or writing code for an MPRLS in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MPRLS ported pressure sensor, 0-25 psi (MPRLS0025PA00001A)

## Overview
The **Honeywell MicroPressure MPRLS0025PA00001A** is an absolute pressure sensor with a 2.5 mm hose port. It measures 0 to 25 psi (0 to 1724 hPa) and returns a compensated 24-bit reading over I2C. Hobbyists buy it as the **Adafruit MPRLS Ported Pressure Sensor Breakout (product 3965)**. The board has a 3.3 V regulator, SDA/SCL level shifters and a 10 kΩ pull-up on each line to VIN.

## Pinout (Adafruit 3965, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3-5 V (feeds the on-board 3.3 V regulator) |
| 3Vo | 3.3 V regulator output. Leave it unconnected. |
| GND | Ground |
| SCL | I2C clock, 10 kΩ pull-up to VIN |
| SDA | I2C data, 10 kΩ pull-up to VIN |
| EOC | End of conversion, 3.3 V output, high when a reading is ready (optional) |
| RST | Reset input, active low, pulled up on the board (optional) |

## Electrical limits
- Breakout supply: 3-5 V. The chip itself takes 1.8-3.6 V (absolute maximum 3.6 V).
- Power: about 10 mW (around 3 mA) while measuring, and tens of nA in standby.
- I2C at up to 400 kHz. Logic high is at least 80 % of the supply.
- Pressure: overpressure limit 60 psi, burst 120 psi.

## Interface details
- **I2C address 0x18.**
- To start a measurement, write **0xAA 0x00 0x00**. Then wait for one of these: the busy flag (status bit 5) clears, at least 5 ms passes, or EOC goes high.
- Read 4 bytes: the status byte, then the pressure counts as 24 bits, MSB first.
- Status byte: bit 6 = powered (must be 1), bit 5 = busy, bit 2 = memory integrity error, bit 0 = math saturation.
- Transfer function A (10 % to 90 % of 2^24 counts): **P = (counts − 1677722) × 25 / (15099494 − 1677722) psi**. 1 psi = 68.947572932 hPa.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from mprls import MPRLS
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
s = MPRLS(i2c)
print('%.2f psi, %.1f hPa' % (s.pressure_psi(), s.pressure_hpa()))
```
To wait on the EOC pin instead of polling the status byte, pass `eoc=Pin(n, Pin.IN)`.

## Gotchas
- The I2C pull-ups go to VIN. If you power the board from 5 V, SDA and SCL idle at 5 V, so with an ESP32 or Pico use 3.3 V.
- This is an absolute sensor. Open to air it reads about 14.7 psi (1013 hPa) at sea level, not 0.
- The die is light sensitive, so use opaque tubing when you can.
- If math saturation is set, the pressure is outside 0-25 psi and the reading is not valid.

## Datasheet
https://prod-edam.honeywell.com/content/dam/honeywell-edam/sps/siot/en-us/products/sensors/pressure-sensors/board-mount-pressure-sensors/micropressure-mpr-series/documents/sps-siot-mpr-series-datasheet-32332628-ciid-172626.pdf
