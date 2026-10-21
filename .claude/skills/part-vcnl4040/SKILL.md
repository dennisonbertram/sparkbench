---
name: part-vcnl4040
description: Pinout, electrical limits, wiring and MicroPython driver for the VCNL4040 proximity & ambient light sensor (Vishay VCNL4040). Use when designing, wiring, simulating or writing code for a VCNL4040 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# VCNL4040 proximity & ambient light sensor (VCNL4040)

## Overview
The **VCNL4040** from Vishay combines an IR proximity sensor (built-in 940 nm IR LED, 12- or 16-bit reading, up to about 200 mm), a 16-bit ambient light sensor (0.0125 to 6553 lx) and a white channel, on I2C at the fixed address 0x60, with an interrupt output. Hobbyists buy it on the **Adafruit VCNL4040 Proximity and Lux Sensor - STEMMA QT / Qwiic (#4161)**, which adds a 3.3 V regulator, I2C level shifters and pull-ups, so it runs from 3-5 V.

## Pinout (Adafruit #4161, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3-5 V |
| 3Vo | 3.3 V output of the board's regulator (up to 100 mA); not an input, leave unconnected |
| GND | Ground |
| SCL | I2C clock (pull-up and level shifter on board) |
| SDA | I2C data (pull-up and level shifter on board) |
| INT | Interrupt output, open-drain, active low; optional |

The two STEMMA QT / Qwiic connectors carry the same GND, VIN, SDA and SCL.

## Electrical limits
- Board supply (VIN): 3-5 V. The bare chip needs 2.5-3.6 V (absolute max 3.6 V); the regulator handles that.
- I2C logic follows VIN thanks to the level shifters, so a 3.3 V ESP32/Pico and a 5 V Arduino both work.
- Current: about 0.3 mA for the chip plus the IR LED's average (peak current x duty, e.g. 100 mA / 40 = 2.5 mA), 0.2 µA shut down, plus the board's power LED.
- I2C 10-400 kHz.

## Interface details
- **I2C address 0x60**, fixed.
- 16-bit registers ("command codes"), **LSB first**: write = [command, low byte, high byte]; read = command code, repeated start, low byte, high byte.
- 0x00 L ALS_CONF: bits 7:6 ALS_IT (00 80 ms, 01 160 ms, 10 320 ms, 11 640 ms), 3:2 persistence, bit 1 INT enable, bit 0 ALS_SD. H byte reserved (0x00).
- 0x03 L PS_CONF1: bits 7:6 IR duty (1/40..1/320), 5:4 persistence, 3:1 PS_IT (1T..8T), bit 0 PS_SD. H PS_CONF2: bit 3 PS_HD (1 = 16-bit output), bits 1:0 PS interrupt mode.
- 0x04 L PS_CONF3 (multi-pulse, active force mode, sunlight cancel); H PS_MS: bit 7 White_EN (0 = on), bit 6 logic-output mode, bits 2:0 LED current (50-200 mA).
- 0x01/0x02 ALS thresholds, 0x05 PS cancellation, 0x06/0x07 PS thresholds.
- 0x08 PS data, 0x09 ALS data, 0x0A white data, 0x0B H INT_Flag (cleared by reading), 0x0C ID = 0x0186.
- **Both ALS and PS power up shut down** (ALS_CONF = 0x01, PS_CONF1 = 0x01).
- Lux = ALS counts x resolution:

| ALS_IT | lx/step | max lx |
|---|---|---|
| 80 ms | 0.1 | 6553.5 |
| 160 ms | 0.05 | 3276.8 |
| 320 ms | 0.025 | 1638.4 |
| 640 ms | 0.0125 | 819.2 |

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22 (INT → any GPIO if you use interrupts).
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from vcnl4040 import VCNL4040
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = VCNL4040(i2c, als_it_ms=80)
print('Lux=%.1f Prox=%d' % (sensor.lux(), sensor.proximity()))
```
The driver powers on both sensors, sets 16-bit proximity, PS_IT 8T, 100 mA LED, and has `lux()`, `als_raw()`, `proximity()`, `white()`, `configure_als(it_ms)`, `interrupt_flags()` and `shutdown()`. In the simulator the sensor is modelled at the 80 ms setting (0.1 lx/step, up to 6553.5 lx) with 16-bit proximity.

## Gotchas
- It starts shut down: without writing ALS_CONF and PS_CONF1 every reading is 0. The driver powers it on.
- Bytes come LSB first, unlike most sensors: swapping them gives wildly wrong values.
- Proximity is unitless counts (bigger = closer), not millimetres; dark targets reflect far less IR than white ones. Calibrate the "near" threshold in place.
- A count of 65535 means saturated: shorten ALS_IT (lux) or lower LED current / PS_IT (proximity).
- PS output defaults to 12-bit (0-4095); set PS_HD for 16-bit (the driver does).
- The address is fixed: only one per I2C bus without a multiplexer.

## Datasheet
https://www.vishay.com/docs/84274/vcnl4040.pdf
