---
name: part-vcnl4010
description: Pinout, electrical limits, wiring and MicroPython driver for the VCNL4010 proximity & ambient light sensor (Vishay VCNL4010, Adafruit #466). Use when designing, wiring, simulating or writing code for a VCNL4010 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# VCNL4010 proximity & ambient light sensor (VCNL4010)

## Overview
The **VCNL4010** from Vishay combines an IR proximity sensor (built-in IR LED with 10-200 mA programmable pulse current, 16-bit reading, up to about 200 mm) and a 16-bit ambient light sensor (0.25 lx per count, up to about 16 klx), on I2C at the fixed address 0x13, with an open-drain interrupt output. Hobbyists buy it on the **Adafruit VCNL4010 Proximity/Light sensor (#466)**, which adds a 3.3 V regulator and pull-ups, so it runs from 3.3-5 V.

## Pinout (Adafruit #466, header order)
| Pin | Function |
|---|---|
| Vin | Supply, 3.3-5 V (use the same voltage as your microcontroller's logic) |
| 3Vo | 3.3 V output of the board's regulator (up to 50 mA); not an input, leave unconnected |
| GND | Ground |
| SCL | I2C clock (weak pull-up to Vin on board) |
| SDA | I2C data (weak pull-up to Vin on board) |
| INT | Interrupt output, open-drain, active low; optional |

## Electrical limits
- Board supply (Vin): 3.3-5 V (Adafruit: 5 V is ideal since Vin also powers the IR LED). The bare chip needs 2.5-3.6 V on VDD (absolute max 5.5 V); the regulator handles that.
- I2C and INT high level: 1.7-5 V, so the bus works at 3.3 V or 5 V logic.
- Current: 1.5 µA standby; proximity averages 5 µA (2/s, 20 mA LED) up to 4 mA (250/s, 200 mA LED); ALS 2.5-640 µA depending on rate and averaging; plus the board's regulator.
- I2C up to 3.4 MHz (use 100-400 kHz).

## Interface details
- **I2C address 0x13**, fixed.
- Seventeen **8-bit registers at 0x80-0x90**; reading auto-increments, 16-bit results are **high byte first**.
- 0x80 command: b7 config_lock (reads 1), b6 als_data_rdy, b5 prox_data_rdy, b4 als_od, b3 prox_od, b2 als_en, b1 prox_en, b0 selftimed_en.
- 0x81 product ID / revision = 0x21.
- 0x82 proximity rate (bits 2:0): 1.95, 3.9, 7.8, 16.6, 31.25, 62.5, 125, 250 /s (default 1.95).
- 0x83 IR LED current = value x 10 mA (0-20, default 2 = 20 mA).
- 0x84 ALS parameters: b7 continuous conversion, b6:4 rate (1, 2, 3, 4, 5, 6, 8, 10 /s; default 2), b3 auto offset (default on), b2:0 averaging 2^n (default 32).
- 0x85/0x86 ALS result, 0x87/0x88 proximity result, 0x89 interrupt control, 0x8A-0x8D thresholds, 0x8E interrupt status (write 1 to clear), 0x8F modulator timing (keep 0x01).
- **Lux = ALS counts x 0.25 lx.** One ALS reading takes a 100 ms frame in standard mode.
- Measurement modes: self-timed (0x80 = 0x07, results refresh at the set rates) or on-demand (0x80 = 0x18, then poll bits 6 and 5). Change rates only while selftimed_en = 0.

## Wiring
- ESP32: Vin → 3V3, GND → GND, SDA → D21, SCL → D22 (INT → any GPIO if you use interrupts).
- Pico: Vin → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: Vin → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from vcnl4010 import VCNL4010
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = VCNL4010(i2c)
print('Lux=%.2f Prox=%d' % (sensor.lux(), sensor.proximity()))
```
The driver checks the product ID, sets the IR LED to 200 mA, proximity at 16.6/s, ALS at 10/s with 32x averaging, and starts self-timed measurement. It has `lux()`, `als_raw()`, `proximity()`, `read_on_demand()`, `set_led_current(ma)`, `interrupt_status()`, `start()` and `stop()`. In the simulator the light level and the proximity counts come from sliders.

## Gotchas
- The registers start at 0x80, not 0x00: reading 0x00-0x7F returns nothing useful.
- It measures nothing until the command register asks for it; every reading is 0 otherwise. The driver starts self-timed mode.
- Bytes come high byte first (unlike the VCNL4040, which is LSB first).
- Proximity is unitless counts (bigger = closer), not millimetres; dark targets reflect far less IR. Calibrate the "near" threshold in place.
- A count of 65535 means saturated: lower the LED current.
- The address is fixed: only one per I2C bus without a multiplexer.

## Datasheet
https://www.vishay.com/docs/83462/vcnl4010.pdf
