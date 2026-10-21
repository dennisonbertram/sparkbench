---
name: part-max44009
description: Pinout, electrical limits, wiring and MicroPython driver for the MAX44009 ambient light sensor (GY-49 module). Use when designing, wiring, simulating or writing code for a MAX44009 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MAX44009 ambient light sensor (MAX44009)

## Overview
The **MAX44009** from Maxim (now Analog Devices) measures ambient light from 0.045 to 188,000 lux with a response matched to the human eye. It ranges automatically and reports each reading as a 4-bit exponent and an 8-bit mantissa over I2C, drawing under 1 µA. Hobbyists buy it on the purple **GY-49** module.

## Pinout (GY-49 module, header order)
| Pin | Function |
|---|---|
| VIN | Supply: use 3.3 V |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |

There are two more unlabelled pads on the opposite edge: the address pin (A0) and INT, an open-drain output that is active low and needs a pull-up.

## Electrical limits
- Supply: 1.7 to 3.6 V for the chip. Power the GY-49 from 3.3 V.
- Absolute maximum is 4 V on SDA, SCL, A0 and VCC. **Never use 5 V logic.**
- Current: 0.65 µA typical.
- I2C up to 400 kHz. The datasheet requires pull-ups on SDA and SCL (10 kΩ in its application circuit).

## Interface details
- **I2C address 0x4A** with A0 low, or 0x4B with A0 high.
- Registers are 8 bits wide: 0x00 interrupt status, 0x01 interrupt enable, 0x02 configuration (CONT, MANUAL, CDR, TIM[2:0]; 0x03 at power-on), 0x03 lux high byte (E3..E0 M7..M4), 0x04 lux low byte (M3..M0 in bits 3..0), 0x05 and 0x06 upper and lower thresholds, 0x07 threshold timer.
- Lux = 2^E × M × 0.045, where M is the full 8-bit mantissa. Using the high byte only, lux = 2^E × M[7:4] × 0.72. An exponent of 15 means overrange.
- Read 0x03 and 0x04 with a **Repeated START** between them (no STOP), so both bytes come from the same conversion.
- In default mode the chip converts once every 800 ms. Set CONT (bit 7 of register 0x02) to convert continuously.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from max44009 import MAX44009
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = MAX44009(i2c)
print('Lux=%.2f' % sensor.lux())
```

## Gotchas
- If the reading comes and goes, the address pin may be floating. Tie the A0 pad to GND (0x4A).
- The result reads 0 for about the first 800 ms after power-up.
- The simulator only reproduces the chip's bytes for 368.64 to 734.4 lux, the range where automatic ranging uses exponent 6. The real chip covers the full range by changing the exponent on its own.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/MAX44009.pdf
