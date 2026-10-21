---
name: part-adafruit-stemma-soil-sensor
description: Pinout, electrical limits, wiring and MicroPython driver for the Adafruit STEMMA Soil Sensor (#4026), an I2C capacitive soil moisture probe with an ATSAMD10 running seesaw firmware. Use when designing, wiring, simulating or writing code for this soil sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Adafruit STEMMA Soil Sensor (Adafruit 4026)

## Overview
A capacitive soil moisture probe. An **ATSAMD10** running Adafruit's **seesaw** firmware measures the capacitance of the probe and reports a moisture count (about **200 very dry** to **2000 very wet**) plus the chip temperature (about ±2 °C) over I2C. Because it is capacitive, no bare metal touches the soil, so the probe does not corrode the way resistive probes do.

## Pinout (4-pin JST PH STEMMA connector, top to bottom)
| Pin | Function |
|---|---|
| GND | Power and logic ground (black) |
| VIN | Supply 3-5 V DC, same as your I2C logic voltage (red) |
| SDA | I2C data, 10 kΩ pull-up to VIN (blue) |
| SCL | I2C clock, 10 kΩ pull-up to VIN (yellow) |

The board has no header pins. Connect it with a JST PH 4-pin to jumper cable.

## Electrical limits
- Supply: 3-5 V. On a 3.3 V board (ESP32, Pico) power it from **3.3 V**. The pull-ups go to VIN, so 5 V on VIN would put 5 V on the GPIOs.
- I2C at 100 kHz is recommended (up to 400 kHz).

## Interface details (seesaw)
- **I2C address 0x36**. Short AD0 to add 1 and AD1 to add 2 (0x36-0x39).
- Every read is a write of `[base, function]`, a pause of about 5 ms, then a **separate** read transaction.
- HW_ID: `00 01` → 1 byte, 0x55.
- Moisture: `0F 10` → 2 bytes, big-endian count. Values above 4095 are bad reads, so read again.
- Temperature: `00 04` → 4 bytes, a signed 32-bit value in 16.16 fixed point: °C = raw / 65536.
- Soft reset: write `00 7F FF`, then wait 500 ms.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from stemma_soil import StemmaSoil
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
soil = StemmaSoil(i2c)
print('moisture=%d temp=%.1fC' % (soil.moisture(), soil.temperature()))
```

## Gotchas
- The moisture count is relative. Record the dry and wet counts in your own soil and pot to set thresholds.
- Push the probe in only up to the line and keep the electronics dry.
- Leave the 5 ms pause between the write and the read. Reading too soon gives garbage such as 0xFFFF.
- The temperature comes from the chip's internal sensor, so it is only a rough reading.

## Datasheet
https://learn.adafruit.com/adafruit-seesaw-atsamd09-breakout/reading-and-writing-data
(board: https://learn.adafruit.com/adafruit-stemma-soil-sensor-i2c-capacitive-moisture-sensor/pinouts)
