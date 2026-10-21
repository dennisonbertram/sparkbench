---
name: part-lc709203f
description: Pinout, electrical limits, wiring and MicroPython driver for the LC709203F LiPo/Li-ion battery fuel gauge (onsemi LC709203F, Adafruit 4712 breakout). Use when designing, wiring, simulating or writing code for an LC709203F battery monitor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LC709203F LiPo fuel gauge (LC709203F)

## Overview
The **LC709203F** from onsemi measures a single Li-ion/LiPo cell and reports its voltage (1 mV steps, ±7.5 mV at 25 °C) and state of charge (RSOC 0–100 %, ITE 0.0–100.0 %) without a sense resistor. Hobbyists buy it as the **Adafruit LC709203F LiPoly / LiIon Fuel Gauge and Battery Monitor (product 4712)**: two JST-PH battery connectors (battery in, battery through to the project), STEMMA QT sockets, 10 kΩ pull-ups on SDA/SCL/INT, and a 6-pin header.

## Pinout (Adafruit 4712, header order)
| Pin | Function |
|---|---|
| VIN | Logic supply for the pull-ups and LED, 3–5 V |
| GND | Ground (shared with the battery's −) |
| SCL | I2C clock (10 kΩ pull-up) |
| SDA | I2C data (10 kΩ pull-up) |
| INT | ALARMB alarm, open drain, 10 kΩ pull-up to VIN (optional) |
| Therm | 10 kΩ NTC thermistor input (optional) |

## Electrical limits
- The chip is powered **from the battery** (VDD 2.5–4.5 V, 6.5 V absolute max); with no battery plugged in it does not answer on I2C.
- VIN 3–5 V only feeds the pull-ups and power LED. SDA/SCL tolerate 5.5 V max.
- Chip current about 3 µA operating, 1 µA sleep. I2C up to 400 kHz; the chip may stretch the clock.

## Interface details
- **I2C address 0x0B** (0x16 write / 0x17 read).
- SMBus words, **low byte first**, each followed by **CRC-8-ATM** (poly 0x07, init 0x00).
  - Read: write command, repeated start, read low, high, CRC over `0x16, cmd, 0x17, low, high` (datasheet: 0x16 0x09 0x17 0xC2 0x0E → 0x86 = 3778 mV).
  - Write: `cmd, low, high, CRC` over `0x16, cmd, low, high` (0x16 0x09 0x55 0xAA → 0x3B). Without a correct CRC the write is ignored.
- Registers: 0x09 cell voltage (1 mV), 0x0D RSOC (1 %), 0x0F ITE (0.1 %), 0x08 cell temperature (0.1 K, 0x0AAC = 0 °C), 0x0B APA, 0x12 battery profile, 0x15 power mode (1 operational, 2 sleep), 0x16 temperature source (0 I2C, 1 thermistor), 0x13/0x14 alarm thresholds, 0x07 = 0xAA55 initialise RSOC.
- Start-up flow: 0x15 = 0x0001 (twice: the first transfer may only wake it), 0x0B = APA (500 mAh → 0x10, 1000 → 0x19, 2000 → 0x2D), 0x12 = profile (1 for 3.7 V/4.2 V cells), wait 100 ms (re-init up to 90 ms), 0x07 = 0xAA55.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22; LiPo into a JST-PH socket.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from lc709203f import LC709203F
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
gauge = LC709203F(i2c, capacity_mah=500)
print('V=%.3fV RSOC=%d%%' % (gauge.voltage(), gauge.percent()))
```

## Gotchas
- No battery = no I2C answer (OSError ENODEV): the gauge runs from the cell, not from VIN.
- A CRC mismatch means a loose wire or bus noise; just read again.
- Pick the APA that matches your battery's capacity, and the right profile, or the percentage will be off.
- The percentage needs a few minutes to settle after start-up or after plugging in a battery under load.
- In the simulator the chip answers as soon as VIN is powered and the voltage/charge come from the sliders.

## Datasheet
https://www.onsemi.com/pdf/datasheet/lc709203f-d.pdf
