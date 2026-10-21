---
name: part-veml6040
description: Pinout, electrical limits, wiring and MicroPython driver for the VEML6040 RGBW colour sensor (Vishay VEML6040). Use when designing, wiring, simulating or writing code for a VEML6040 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# VEML6040 RGBW colour sensor (VEML6040)

## Overview
The **VEML6040** from Vishay measures red, green, blue and white light, each as a 16-bit count. The green channel is matched to the human eye, so it gives ambient light in lux. The R, G and B counts together give the colour temperature (CCT) of a light source. It talks I2C at the fixed address 0x10. Hobbyists buy it on the **purple 4-pin clone module** (the same PCB as the VEML6075 board, with "6075/6040" on the silkscreen). The module adds a 3.3 V regulator, I2C level shifting with pull-ups and, on many versions, a white LED, so it runs from 3.3-5 V. Vishay marks the chip "not for new designs" (it suggests the VEML3328), but modules are still widely sold.

## Pinout (purple VEML6040 module, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3.3-5 V (regulated to 3.3 V on the board) |
| GND | Ground |
| SCL | I2C clock (pull-up and level shifter on board) |
| SDA | I2C data (pull-up and level shifter on board) |

## Electrical limits
- Board supply (VIN): 3.3-5 V. The bare chip needs 2.5-3.6 V (absolute max 3.6 V), so never feed 5 V to a bare chip or a board without a regulator.
- Current: about 200 µA while measuring, 0.8 µA shut down, plus the regulator and the LED.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x10**, fixed (the same as the VEML7700 and VEML6075).
- 16-bit registers ("command codes"), **LSB first**: write = [command, LSB, MSB]; read = command code, **repeated start** (no stop), LSB, MSB.
- 0x00 CONF, low byte: bits 6:4 IT (000 40 ms, 001 80 ms, 010 160 ms, 011 320 ms, 100 640 ms, 101 1280 ms), bit 2 TRIG (one measurement in force mode), bit 1 AF (0 auto, 1 force), bit 0 SD (1 = shut down). The high byte is reserved, write 0x00.
- 0x08 R, 0x09 G, 0x0A B, 0x0B W result counts. Registers 0x01-0x07 are reserved.
- Lux = G counts x G sensitivity (datasheet table 6):

| IT | lx/count | max lx |
|---|---|---|
| 40 ms | 0.25168 | 16 496 |
| 80 ms | 0.12584 | 8248 |
| 160 ms | 0.06292 | 4124 |
| 320 ms | 0.03146 | 2062 |
| 640 ms | 0.01573 | 1031 |
| 1280 ms | 0.007865 | 515.4 |

- Colour temperature (app note 84331, empirical method): CCT = 4278.6 x ((R − B) / G + 0.5)^−1.2455 K. The offset is 0.5 in open air; a cover glass changes it. The app note also gives a more accurate McCamy method, which needs a calibration matrix.
- Start-up as in the app note: write CONF with SD = 1, then with SD = 0. In auto mode, wait one integration time before the first reading. In force mode (AF = 1), set TRIG = 1 for each measurement and wait one integration time.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from veml6040 import VEML6040
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = VEML6040(i2c, it_ms=160)
r, g, b, w = sensor.rgbw()
print('Lux=%.2f CCT=%s' % (sensor.lux(g), VEML6040.cct(r, g, b)))
```
The driver also has `red()`, `green()`, `blue()`, `white()`, `configure(it_ms, force)`, `measure()` (force mode) and `shutdown()`. In the simulator the sensor is modelled at 160 ms (0.06292 lx per G count, up to 4124 lx). The R, B and W sliders hold raw counts.

## Gotchas
- Bytes come LSB first, unlike most sensors. Swapping them gives wildly wrong values.
- The read must use a repeated start. MicroPython's `readfrom_mem` does this.
- A count of 65535 means the channel is saturated: use a shorter integration time.
- There is no ID register, so a missing sensor only shows up as an I2C error (ENODEV/ETIMEDOUT).
- The lux sensitivity is specified with a white LED source, so other light sources read somewhat differently.
- The board's own LED can light the sensor or the object and change the reading.
- The address is fixed, so you can have only one VEML6040, VEML6075 or VEML7700 per bus without a multiplexer.

## Datasheet
https://www.vishay.com/docs/84276/veml6040.pdf (application note: https://www.vishay.com/docs/84331/designingveml6040.pdf)
