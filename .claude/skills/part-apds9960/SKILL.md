---
name: part-apds9960
description: Pinout, electrical limits, wiring and MicroPython driver for the APDS-9960 proximity, gesture & colour sensor (Broadcom/Avago APDS-9960). Use when designing, wiring, simulating or writing code for an APDS-9960 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# APDS-9960 proximity, gesture & colour sensor (APDS-9960)

## Overview
The **APDS-9960** from Broadcom (Avago) combines an IR-LED proximity sensor (8-bit count, higher = closer), clear/red/green/blue ambient-light channels (16-bit counts) and a four-direction gesture engine. It talks I2C at the fixed address 0x39. Hobbyists buy it on the **SparkFun RGB and Gesture Sensor (SEN-12787)** or the purple **GY-9960-3.3** clone, which share the same 6-pin header and have no regulator: they are 3.3 V only.

## Pinout (SparkFun SEN-12787 / GY-9960 clone, header order)
| Pin | Function |
|---|---|
| VL | IR LED supply (3.0-4.5 V), only if the PS jumper is opened; leave unconnected as shipped |
| GND | Ground |
| VCC | Sensor supply, 2.4-3.6 V (use 3.3 V) |
| SDA | I2C data (10k pull-up on board) |
| SCL | I2C clock (10k pull-up on board) |
| INT | Interrupt, open-drain, active low (optional) |

## Electrical limits
- VDD 2.4-3.6 V, absolute max 3.8 V on VDD and on every pin. **Never 5 V.**
- The IR LED needs VLEDA 3.0-4.5 V; with the PS jumper closed it runs from VCC, so use 3.3 V.
- Current: about 0.2 mA with colour on, plus IR LED pulses of up to 100 mA (a few mA average).
- I2C standard or fast mode (up to 400 kHz).

## Interface details
- **I2C address 0x39** (fixed). ID register 0x92 = **0xAB** (some clone chips: 0x9C or 0xA8).
- Set up with ENABLE = 0, write ATIME (0x81), CONTROL (0x8F: LDRIVE, PGAIN, AGAIN), PPULSE (0x8E), then ENABLE (0x80) = PON|AEN|PEN = 0x07. Power-on init takes 5.7 ms.
- Colour: integration = 2.78 ms x (256 - ATIME); max count = min(65535, 1025 x (256 - ATIME)). Poll STATUS (0x93) bit 0 AVALID, then read 8 bytes from 0x94: C, R, G, B, each 16-bit **little-endian** (reading CDATAL latches all eight bytes).
- Proximity: poll STATUS bit 1 PVALID, read PDATA (0x9C), 0-255.
- Gesture: FIFO at 0xFC-0xFF (not covered by this driver or the simulator).

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from apds9960 import APDS9960
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
s = APDS9960(i2c)
print('P=%d' % s.proximity())
c, r, g, b = s.color_raw()
print('C=%d R=%d G=%d B=%d' % (c, r, g, b))
```

## Gotchas
- 5 V on VCC or the I2C lines will kill it: the board has no regulator or level shifter.
- Proximity counts depend on the target's colour and the LED settings, not just distance; calibrate thresholds for your object.
- If clear reads the max count, the sensor is saturated: lower the gain or ATIME.
- Only one APDS-9960 per I2C bus (address is fixed).

## Datasheet
https://cdn.sparkfun.com/assets/learn_tutorials/3/2/1/Avago-APDS-9960-datasheet.pdf
