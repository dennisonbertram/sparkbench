---
name: part-veml6035
description: Pinout, electrical limits, wiring and MicroPython driver for the VEML6035 low-lux ambient light sensor (Vishay VEML6035, MikroE Ambient 11 Click). Use when designing, wiring, simulating or writing code for a VEML6035 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# VEML6035 low-lux ambient light sensor (VEML6035)

## Overview
The **VEML6035** from Vishay is a 16-bit, low-power, high-sensitivity ambient light sensor with a human-eye-like response. It resolves down to 0.0004 lx/count and reads up to about 6.7 klx, using programmable gain, sensitivity and integration time. It has a second WHITE channel and talks I2C. Hobbyists buy it on the **MikroElektronika Ambient 11 Click (MIKROE-3990)**, a mikroBUS board with 2.2 k pull-ups on SDA/SCL, a 47 k pull-up on INT and a power LED. It has **no regulator**.

## Pinout (Ambient 11 Click, two 8-pin mikroBUS headers)
| Left header | Function | Right header | Function |
|---|---|---|---|
| AN | not connected | PWM | not connected |
| RST | not connected | INT | Threshold interrupt, open-drain, active low (optional) |
| CS | not connected | RX | not connected |
| SCK | not connected | TX | not connected |
| MISO | not connected | SCL | I2C clock |
| MOSI | not connected | SDA | I2C data |
| 3V3 | Supply, 3.3 V | 5V | not connected (do not use) |
| GND | Ground | GND | Ground |

Only 3V3, GND, SCL, SDA and INT are used. Wire them with jumper leads.

## Electrical limits
- Supply: 1.7–3.6 V (absolute max 4 V). The board is made for 3.3 V. Do not power it from 5 V.
- Current: about 170 µA while measuring the ALS channel (225 µA with WHITE too), 0.5 µA when shut down. The board's power LED draws more than that.
- I2C 10–400 kHz. Logic is 3.3 V only.

## Interface details
- **Fixed I2C address 0x29.** There is no ID register; use `i2c.scan()` to find it.
- Registers are 16 bits, **sent LSB first**. To write: [cmd, LSB, MSB]. To read: write cmd, repeated start, then read LSB and MSB.
- 0x00 ALS_CONF: bit 12 SENS (0 = 1x, 1 = 1/8x), bit 11 DG (1 = double), bit 10 GAIN (1 = double), IT bits 9:6 (1100 = 25, 1000 = 50, 0000 = 100, 0001 = 200, 0010 = 400, 0011 = 800 ms), bits 5:4 persistence, bit 3 INT_CHANNEL, bit 2 CHANNEL_EN (1 = ALS and WHITE), bit 1 INT_EN, bit 0 SD (1 = shut down, the power-up default 0x0001).
- 0x01/0x02 high/low thresholds, 0x03 power-saving mode (PSM_WAIT bits 2:1, PSM_EN bit 0), 0x04 ALS counts, 0x05 WHITE counts, 0x06 interrupt flags (bit 15 low, bit 14 high).
- After clearing SD, wait one integration time (±30 %) before the first reading.
- **Lux = ALS counts × resolution**, with resolution = 0.0004 × (800/IT) × (2 if DG = 0) × (2 if GAIN = 0) × (8 if SENS = 1) lx/count.
- Driver default GAIN = 0, DG = 0, SENS = 1, IT = 100 ms gives 0.1024 lx/count, up to about 6711 lx. The most sensitive setting (GAIN = 1, DG = 1, SENS = 0, 800 ms) gives 0.0004 lx/count but saturates at about 26 lx.

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3V3 → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from veml6035 import VEML6035
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
s = VEML6035(i2c, gain=0, dg=0, sens=1, it_ms=100)  # 0.1024 lx/count
print('Lux=%.1f White=%d' % (s.lux(), s.white()))
```
For a dark room use `s.configure(gain=1, dg=1, sens=0, it_ms=800)` (0.0004 lx/count, up to about 26 lx).

## Gotchas
- The chip powers up shut down (SD = 1), so it reads 0 until ALS_CONF is written.
- The data is LSB first. Swapping the bytes gives wildly wrong lux.
- WHITE only updates when CHANNEL_EN is set.
- Below 100 ms integration time the counts no longer reach the full 16 bits, so the range does not keep doubling.
- The power LED on the Click can light the sensor. Shade it for dark-room readings.
- The 5V pin on the header is not connected and the board has no level shifting: use 3.3 V logic only.

## Datasheet
https://www.vishay.com/docs/84889/veml6035.pdf (app note: https://www.vishay.com/docs/84944/designingveml6035.pdf)
