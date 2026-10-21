---
name: part-veml6030
description: Pinout, electrical limits, wiring and MicroPython driver for the VEML6030 ambient light sensor (Vishay VEML6030). Use when designing, wiring, simulating or writing code for a VEML6030 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# VEML6030 ambient light sensor (VEML6030)

## Overview
The **VEML6030** from Vishay is a 16-bit ambient light sensor with a human-eye-like response. It measures about 0.0042 lx to 140 klx using a programmable gain and integration time, and has a second WHITE channel. It talks I2C. Hobbyists buy it on the **SparkFun Ambient Light Sensor - VEML6030 (Qwiic), SEN-15436**. That board has 4.7 k pull-ups on SDA/SCL, a 10 k pull-up on INT and a power LED. It has **no regulator**.

## Pinout (SparkFun SEN-15436, 5-pin header order)
| Pin | Function |
|---|---|
| GND | Ground |
| 3V3 | Supply, 2.5–3.6 V (3.3 V only) |
| SDA | I2C data |
| SCL | I2C clock |
| INT | Threshold interrupt, open-drain, active low (optional) |

The two Qwiic connectors carry GND, 3V3, SDA and SCL as well.

## Electrical limits
- Supply: 2.5–3.6 V (absolute max 4 V). Do not power it from 5 V.
- Current: about 45 µA while measuring (PSM off), 0.5 µA when shut down. The board's power LED draws more than that.
- I2C 10–400 kHz. Bus high level 1.3–3.6 V.

## Interface details
- **I2C address 0x48** as shipped (ADDR high). Close the ADR jumper to get **0x10** (ADDR low).
- Registers are 16 bits, **sent LSB first**. To write: [cmd, LSB, MSB]. To read: write cmd, repeated start, then read LSB and MSB.
- 0x00 ALS_CONF: gain bits 12:11 (00 = x1, 01 = x2, 10 = x1/8, 11 = x1/4), IT bits 9:6 (1100 = 25, 1000 = 50, 0000 = 100, 0001 = 200, 0010 = 400, 0011 = 800 ms), bit 1 INT_EN, bit 0 ALS_SD (1 = shut down, which is the power-up default).
- 0x03 power-saving mode, 0x04 ALS counts, 0x05 WHITE counts, 0x06 interrupt status, 0x07 ID (low byte 0x81; high byte 0xD4 at 0x48, 0xC4 at 0x10).
- After clearing ALS_SD, wait 4 ms plus one integration time before the first reading.
- **Lux = ALS counts × resolution.** The resolution is 0.0042 lx/count at gain x2 and 800 ms, and doubles for each halving of the integration time or step down in gain. At gain 1/8 and 100 ms it is 0.5376 lx/count, for up to 35 232 lx.
- Above about 1000 lx (gain 1/4 or 1/8), apply the app note's correction: lux = 6.0135e-13·x⁴ − 9.3924e-9·x³ + 8.1488e-5·x² + 1.0023·x.

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3V3 → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from veml6030 import VEML6030, GAIN_1_8
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
s = VEML6030(i2c, addr=0x48, gain=GAIN_1_8, it_ms=100)
print('Lux=%.1f White=%d' % (s.lux(), s.white()))
```
Use `lux_corrected()` for bright light (above about 1000 lx).

## Gotchas
- The chip powers up shut down (ALS_SD = 1), so it reads 0 until ALS_CONF is written.
- The data is LSB first. Swapping the bytes gives wildly wrong lux.
- Start with gain 1/8 or 1/4. Gains 1 and 2 saturate and turn non-linear above about 100 lx.
- Older SparkFun tables use 0.0036 lx/count as the base resolution. Vishay's current datasheet (rev 1.8) and app note give 0.0042.
- The board's red power LED can light the sensor. Cut the LED jumper for dark-room readings.

## Datasheet
https://www.vishay.com/docs/84366/veml6030.pdf (app note: https://www.vishay.com/docs/84367/designingveml6030.pdf)
