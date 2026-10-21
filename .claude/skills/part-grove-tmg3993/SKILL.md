---
name: part-grove-tmg3993
description: Pinout, electrical limits, wiring and MicroPython driver for the Seeed Grove Light & Gesture & Color & Proximity Sensor (ams TMG39931). Use when designing, wiring, simulating or writing code for a TMG3993 / Grove gesture-colour-proximity sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Grove TMG3993 light, colour, proximity & gesture sensor (TMG39931)

## Overview
The **ams TMG39931** combines an IR-LED proximity sensor (8-bit count), clear/red/green/blue ambient light channels (16-bit counts each) and a gesture engine. It talks I2C at the fixed address **0x39**. Hobbyists buy it as the **Seeed Studio Grove - Light & Gesture & Color & Proximity Sensor (TMG39931), SKU 101020580**. The board adds a 3.0 V LDO (XC6206P302), 2N7002 I2C level shifters with 4.7 kΩ pull-ups to VCC, and a boost + buck supply (MP3120 + ETA3410, 4.2 V) for the IR LED.

## Pinout (Grove connector, pin 1 first)
| Pin | Function |
|---|---|
| SCL | I2C clock (yellow), 4.7 kΩ pull-up to VCC |
| SDA | I2C data (white), 4.7 kΩ pull-up to VCC |
| VCC | Supply 3.3-5 V (red) |
| GND | Ground (black) |

The chip's INT output only goes to a solder pad (J1). It is not on the connector.

## Electrical limits
- Module supply: 3.3-5 V (Seeed). Chip VDD is 2.4-3.6 V (3.8 V abs max); the regulator feeds it 3.0 V.
- The SDA/SCL pull-ups go to VCC, so **power the module from 3.3 V** with a 3.3 V microcontroller.
- Current: about 0.2-0.3 mA with colour running, plus short IR LED pulses (100 mA at LDRIVE 100 %).

## Interface details
- I2C address 0x39 (TMG39931). ID register 0x92: bits 7:2 = 0x2A, so it reads 0xA8.
- Configure with ENABLE (0x80) = 0, set PON, wait ~6 ms, then ENABLE = 0x07 (PON | AEN | PEN).
- CONFIG1 (0x8D) must keep reserved bits 6:5 = 1 (0x60); CONFIG2 (0x90) must keep bit 0 = 1.
- ATIME (0x81): integration 2.78 ms × (256 − ATIME); max count min(65535, 1024 × cycles + 1). 0xDB = 103 ms, 37888.
- CONTROL (0x8F): LDRIVE 7:6, PGAIN 3:2 (1/2/4/8×), AGAIN 1:0 (1/4/16/64×).
- STATUS (0x93): AVALID bit 0, PVALID bit 1. Read 8 bytes from 0x94: C, R, G, B, low byte first (reading CDATAL latches all eight). PDATA (0x9C) is the proximity count, 0-255.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from tmg3993 import TMG3993
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
s = TMG3993(i2c)
p = s.proximity()
c, r, g, b = s.color_raw()
print('P=%d C=%d R=%d G=%d B=%d' % (p, c, r, g, b))
```

## Gotchas
- 0x39 is also the APDS-9960 and TSL2561 default address: do not share a bus with them.
- Don't change control registers while the engines run; turn ENABLE off first.
- Clear at max_count() means the colour channels are saturated: lower AGAIN or ATIME.
- Gesture mode needs ams' algorithm and the FIFO at 0xFC-0xFF; neither this driver nor the simulator covers it.

## Datasheet
https://files.seeedstudio.com/wiki/Grove-Light-Gesture-Color-Proximity_Sensor-TMG39931/res/TMG3993.pdf
