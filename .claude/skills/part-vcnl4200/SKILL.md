---
name: part-vcnl4200
description: Pinout, electrical limits, wiring and MicroPython driver for the VCNL4200 long-distance proximity & ambient light sensor (Vishay VCNL4200, Adafruit #6064). Use when designing, wiring, simulating or writing code for a VCNL4200 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# VCNL4200 long-range proximity & light sensor (VCNL4200)

## Overview
The **VCNL4200** from Vishay combines a long-distance IR proximity sensor (940 nm IR LED, 12- or 16-bit reading, specified up to 1.5 m; 50-100 cm is realistic), a 16-bit ambient light sensor (0.003 to 1573 lx) and a white channel, on I2C at the fixed address 0x51, with an interrupt output. Hobbyists buy it on the **Adafruit VCNL4200 Long Distance IR Proximity and Light Sensor - STEMMA QT / Qwiic (#6064)**, which adds a 3.3 V regulator, I2C level shifters and pull-ups, and a MOSFET that pulses the IR LED from VIN, so it runs from 3.3-5 V.

## Pinout (Adafruit #6064, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3.3-5 V |
| 3Vo | 3.3 V output of the board's regulator; not an input, leave unconnected |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up and level shifter on board) |
| SDA | I2C data (10 kΩ pull-up and level shifter on board) |
| INT | Interrupt output, open-drain, active low, 10 kΩ pull-up to VIN; optional |

The two STEMMA QT / Qwiic connectors carry the same GND, VIN, SDA and SCL.

## Electrical limits
- Board supply (VIN): 3.3-5 V. The bare chip needs 2.5-3.6 V (absolute max 5.0 V); the regulator handles that.
- The IR LED is pulsed from VIN through a P-MOSFET and a 2.7 Ω resistor: short peaks of a few hundred mA, a few mA on average at the default duty (1/160).
- I2C logic follows VIN thanks to the level shifters. **INT is not level shifted**: its pull-up goes to VIN, so with VIN = 5 V it idles at 5 V. Power from 3.3 V if a 3.3 V board reads INT.
- Current: about 0.35 mA for the chip plus the IR LED average and the green power LED; 0.2 µA shut down.
- I2C 10-400 kHz.

## Interface details
- **I2C address 0x51**, fixed.
- 16-bit registers ("command codes"), **LSB first**: write = [command, low byte, high byte]; read = command code, repeated start, low byte, high byte.
- 0x00 L ALS_CONF: bits 7:6 ALS_IT (00 50 ms, 01 100 ms, 10 200 ms, 11 400 ms), bit 5 ALS_INT_SWITCH (0 ALS, 1 white), 3:2 persistence, bit 1 INT enable, bit 0 ALS_SD. **H byte reserved, keep 0x01.**
- 0x03 L PS_CONF1: bits 7:6 IR duty (1/160, 1/320, 1/640, 1/1280), 5:4 persistence, 3:1 PS_IT (1T, 1.5T, 2T, 4T, 8T, 9T), bit 0 PS_SD. H PS_CONF2: bit 3 PS_HD (1 = 16-bit output), bits 1:0 PS interrupt mode.
- 0x04 L PS_CONF3 (multi-pulse, smart persistence, active force mode, sunlight cancel); H PS_MS: bit 5 logic-output mode, 4 PS_SP, 3 PS_SPO, bits 2:0 LED_I (50-200 mA; with the board's MOSFET this only drives the gate, 50 mA is enough).
- 0x01/0x02 ALS thresholds, 0x05 PS cancellation, 0x06/0x07 PS thresholds.
- 0x08 PS data, 0x09 ALS data, 0x0A white data, 0x0D H INT_Flag (cleared by reading), 0x0E ID = 0x1058.
- **Both ALS and PS power up shut down** (ALS_CONF = 0x01, PS_CONF1 = 0x01).
- Lux = ALS counts x resolution (table 14):

| ALS_IT | lx/step | max lx |
|---|---|---|
| 50 ms | 0.024 | 1573 |
| 100 ms | 0.012 | 786 |
| 200 ms | 0.006 | 393 |
| 400 ms | 0.003 | 197 |

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22 (INT → any GPIO if you use interrupts).
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from vcnl4200 import VCNL4200
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = VCNL4200(i2c, als_it_ms=50)
print('Lux=%.1f Prox=%d' % (sensor.lux(), sensor.proximity()))
```
The driver checks the ID, powers on both sensors, sets 16-bit proximity, PS_IT 8T, duty 1/160 and LED_I 50 mA, and has `lux()`, `als_raw()`, `proximity()`, `white()`, `configure_als(it_ms)`, `interrupt_flags()` and `shutdown()`. In the simulator the sensor is modelled at the 50 ms setting (0.024 lx/step, up to 1573 lx) with 16-bit proximity.

## Gotchas
- It starts shut down: without writing ALS_CONF and PS_CONF1 every reading is 0. The driver powers it on.
- Bytes come LSB first, unlike most sensors: swapping them gives wildly wrong values.
- The register map differs from the VCNL4040 (address 0x51 not 0x60, INT_Flag at 0x0D, ID at 0x0E, different ALS_IT and PS_IT tables): don't reuse a VCNL4040 driver.
- Proximity is unitless counts (bigger = closer), not millimetres; dark targets reflect far less IR than white ones. Calibrate the "near" threshold in place.
- The ALS has a narrow viewing angle: it reads correctly only for light from roughly straight above.
- A count of 65535 means saturated: shorten ALS_IT (lux) or reduce PS_IT / duty (proximity). INT_Flag bit 7 flags PS saturation.
- The address is fixed: only one per I2C bus without a multiplexer.

## Datasheet
https://www.vishay.com/docs/84430/vcnl4200.pdf
