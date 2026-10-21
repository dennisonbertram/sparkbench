---
name: part-hih6130
description: Pinout, electrical limits, wiring and MicroPython driver for the HIH6130 humidity & temperature sensor (Honeywell HumidIcon HIH6130/6131, SparkFun SEN-11295 breakout). Use when designing, wiring, simulating or writing code for an HIH6130 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# HIH6130 humidity & temperature sensor (HIH6130)

## Overview
The **Honeywell HumidIcon HIH6130** measures relative humidity (0–100 %, ±4 %RH accuracy, 14-bit) and temperature (14-bit, ±1 °C over 5–50 °C; operates −25 to 85 °C). It talks I2C at the fixed address **0x27**. Hobbyists buy it on the **SparkFun Humidity and Temperature Sensor Breakout - HIH6130 (SEN-11295)**, which has the chip, its decoupling capacitors and 2.2 kΩ pull-ups on SDA/SCL, with no regulator.

## Pinout (SparkFun SEN-11295, header order)
| Pin | Function |
|---|---|
| SDA | I2C data (2.2 kΩ pull-up to VDD) |
| SCL | I2C clock (2.2 kΩ pull-up to VDD) |
| AL_L | Low alarm output (optional) |
| AL_H | High alarm output (optional) |
| VDD | Supply, 2.3–5.5 V (calibrated at 3.3 V) |
| GND | Ground |

## Electrical limits
- Supply: 2.3–5.5 V; accuracy is specified at 3.3 V.
- Current: about 0.65 mA typical (1 mA max) while measuring, 0.6 µA asleep.
- I2C up to 400 kHz. Start-up (power-on to data ready): 60 ms max.

## Interface details
- **I2C address 0x27** (fixed on the -021 part used on the breakout).
- **Measurement Request**: send the address with the WRITE bit and no data (`i2c.writeto(0x27, b'')`). The sensor wakes, converts humidity and temperature (typically 36.65 ms) and sleeps again.
- **Data Fetch**: read 4 bytes: `[S1 S0 H13..H8] [H7..H0] [T13..T6] [T5..T0 x x]`.
- Status S1S0: 00 = new valid data, 01 = stale (already read, or the conversion is not finished), 10 = command mode, 11 = diagnostic fault.
- Humidity: RH = count × 100 / (2^14 − 1) %. Temperature: T = count × 165 / (2^14 − 1) − 40 °C.
- No CRC: check the status bits instead.

## Wiring
- ESP32: VDD → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VDD → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from hih6130 import HIH6130
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
t, h = HIH6130(i2c).read()
print('T=%.1fC H=%.0f%%' % (t, h))
```

## Gotchas
- Reading without a Measurement Request first returns the old reading flagged stale (status 01); the driver always requests a new measurement and retries while the data is stale.
- VDD powers the 2.2 kΩ pull-ups too, so power the board from 3.3 V on 3.3 V microcontrollers.
- The address is fixed, so only one sensor fits on a bus (use a second I2C bus or a multiplexer).
- Keep it away from the regulator and the microcontroller, which warm the air nearby; avoid condensation.

## Datasheet
http://cdn.sparkfun.com/datasheets/Prototyping/1443945.pdf (plus Honeywell's I2C technical note: https://www.embeddedadventures.com/datasheets/hih-6130%20I2C.pdf)
