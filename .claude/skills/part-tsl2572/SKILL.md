---
name: part-tsl2572
description: Pinout, electrical limits, wiring and MicroPython driver for the TSL2572 ambient light sensor (TAOS/ams TSL25721, Akizuki AE-TSL25721 module). Use when designing, wiring, simulating or writing code for a TSL2572 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TSL2572 ambient light sensor (TSL25721)

## Overview
The **TSL2572** from TAOS (now ams) is a two-channel ambient light sensor: Ch0 sees visible + IR, Ch1 sees IR, each a 16-bit count, turned into lux with the datasheet equation (up to 60,000 lux with the low-gain AGL mode). It talks I2C at the fixed address 0x39. Hobbyists buy it on the **Akizuki Denshi AE-TSL25721** module (K-15536), which adds a 3.3 V regulator (NJM12888) and an FXMA2102 I2C level shifter, so it runs from 2.4-5.0 V.

## Pinout (AE-TSL25721, header order pin 1-7)
| Pin | Function |
|---|---|
| VIN | Supply 2.4-5.0 V; also the host-side I2C logic level |
| GND | Ground |
| 3V3 | Sensor 3.3 V rail: on 3.3 V systems tie to 3.3 V with VIN (optional) |
| OE | Level shifter enable: leave open or high |
| INT | Interrupt, open-drain, active low, not 5 V tolerant (optional) |
| SDA | I2C data (pull-up only when J1 is bridged) |
| SCL | I2C clock (pull-up only when J1 is bridged) |

## Electrical limits
- Module VIN 2.4-5.0 V. Chip VDD 2.4-3.6 V (TSL25721), absolute max 3.8 V.
- Current: about 0.2 mA active, 90 µA in wait, a few µA asleep.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x39** (fixed). ID register 0x12 = **0x34** (TSL25721; 0x3D for TSL25723).
- Every access starts with a command byte: **0xA0 | reg** (auto-increment), 0x80 | reg (repeated byte), **0xE6** clears the ALS interrupt.
- Start-up: ENABLE (0x00) = 0, ATIME (0x01), CONFIG (0x0D, AGL bit 2), CONTROL (0x0F, AGAIN 00/01/10/11 = 1x/8x/16x/120x), then ENABLE = 0x03 (PON | AEN). First result after 2.73 ms + one integration.
- Integration time = 2.73 ms × (256 − ATIME); max count = min(65535, 1024 × (256 − ATIME)). After STATUS (0x13) bit 0 AVALID, read 4 bytes from 0x14: C0, C1, low byte first.
- Lux: CPL = ATIME_ms × AGAINx / (GA × 60); Lux1 = (C0 − 1.87·C1)/CPL; Lux2 = (0.63·C0 − C1)/CPL; Lux = max(Lux1, Lux2, 0). GA = 1 in open air. AGL scales 1x/8x by 0.16.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22, plus 10 kΩ pull-ups from SDA and SCL to 3V3.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5, plus 10 kΩ pull-ups to 3V3.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5 (the Pi has its own pull-ups).

## Using the driver
```python
from machine import I2C, Pin
from tsl2572 import TSL2572
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
s = TSL2572(i2c)            # ATIME 0xDB (101 ms), gain 1x
ch0, ch1 = s.raw()
print('CH0=%d CH1=%d LUX=%.1f' % (ch0, ch1, s.lux(ch0, ch1)))
```

## Gotchas
- J1 is open from the factory: without external pull-ups (or J1 bridged) the bus does not work.
- VIN sets the host-side logic level: with a 3.3 V microcontroller feed VIN 3.3 V, not 5 V, especially if J1 is bridged (its pull-ups go to VIN).
- INT is not 5 V tolerant.
- Do not use AGL with 16x or 120x gain. If Ch0 reaches the max count, lower the gain or ATIME.
- Use ATIME multiples of 50 ms (0xED, 0xDB) to reject 50/60 Hz lamp flicker.
- Behind a window, set GA or derive new coefficients (ams application note).

## Datasheet
https://e2e.ti.com/cfs-file/__key/communityserver-discussions-components-files/1023/TSL2572.pdf
