---
name: part-ltr390
description: Pinout, electrical limits, wiring and MicroPython driver for the LTR390 UV & ambient light sensor (Lite-On LTR-390UV-01). Use when designing, wiring, simulating or writing code for an LTR390 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LTR390 UV & ambient light sensor (LTR-390UV-01)

## Overview
The **LTR-390UV-01** from Lite-On measures ambient light (lux, close to the human eye's response) and ultraviolet light (reported as a UV index) with one 13-20 bit ADC and gain 1-18. It talks I2C at a fixed address. Hobbyists buy it on the **Adafruit LTR390 UV Light Sensor (#4831)**, which adds a 3.3 V regulator, BSS138 level shifters with 10 k pull-ups on SDA/SCL, and STEMMA QT / Qwiic connectors.

## Pinout (Adafruit #4831, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3-5 V (regulated to 3.3 V on the board) |
| 3Vo | 3.3 V regulator output (up to 100 mA); leave unconnected |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |
| INT | Interrupt output, open-drain, active low, 10 k pull-up to 3.3 V (optional) |

## Electrical limits
- Chip supply 1.7-3.6 V (absolute max 4.0 V); the Adafruit board takes 3-5 V on VIN.
- Current: about 110 µA measuring light, 100 µA measuring UV, 1 µA in standby.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x53** (fixed). PART_ID (0x06) reads 0xB2: high nibble 0xB = part, low nibble = silicon revision.
- Powers up in standby. MAIN_CTRL (0x00): **0x02** = ALS (light) active, **0x0A** = UVS (UV) active, 0x00 = standby. Only one mode runs at a time; writing MAIN_CTRL restarts the conversion.
- ALS_UVS_MEAS_RATE (0x04): bits 6:4 resolution (0 = 20-bit/400 ms, 1 = 19-bit/200 ms, 2 = 18-bit/100 ms default, 3 = 17-bit/50 ms, 4 = 16-bit/25 ms, 5 = 13-bit/12.5 ms), bits 2:0 rate (25 ms ... 2000 ms, default 100 ms).
- ALS_UVS_GAIN (0x05): 0 = 1x, 1 = 3x (default), 2 = 6x, 3 = 9x, 4 = 18x.
- MAIN_STATUS (0x07): bit 3 = new data (cleared on read), bit 5 = power-on event.
- Data are 20-bit, LSB first: **ALS 0x0D-0x0F**, **UVS 0x10-0x12**.
- **Lux = 0.6 × ALS / (GAIN × INT) × WFAC**, INT = 4 / 2 / 1 / 0.5 / 0.25 for 20 / 19 / 18 / 17 / 16-bit. Gain 3, 18-bit gives 0.2 lx per count.
- **UVI = UVS / 2300 × WFAC**, with 2300 counts/UVI specified at gain 18, 20-bit. WFAC = 1 with no window.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from ltr390 import LTR390, GAIN_3, RES_18BIT
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = LTR390(i2c, als_gain=GAIN_3, als_res=RES_18BIT)
print('Lux=%.1f UVI=%.2f' % (sensor.lux(), sensor.uvi()))
```
`lux()` takes about 110 ms and `uvi()` about 410 ms, because each switches the chip into that mode and waits for a fresh conversion.

## Gotchas
- Ordinary window glass and most plastics block UV: indoors the UV index reads near 0.
- In bright sunlight, gain 3 at 18-bit saturates at about 52 klx; use GAIN_1 for direct sun.
- The address is fixed, so use an I2C multiplexer for more than one sensor.
- Keep the board's green power LED and wires from shading or lighting the sensor window.

## Datasheet
https://optoelectronics.liteon.com/upload/download/DS86-2015-0004/LTR-390UV_Final_%20DS_V1%201.pdf
