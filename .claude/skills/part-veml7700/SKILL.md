---
name: part-veml7700
description: Pinout, electrical limits, wiring and MicroPython driver for the VEML7700 ambient light (lux) sensor (Vishay VEML7700). Use when designing, wiring, simulating or writing code for a VEML7700 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# VEML7700 ambient light sensor (VEML7700)

## Overview
The **VEML7700** from Vishay measures ambient light in lux with a response close to the human eye, from 0 lx to about 120-140 klx, with a 16-bit result and resolution down to 0.0042 lx/count. It also has a second, unfiltered WHITE channel. It talks I2C at the fixed address 0x10. Hobbyists buy it on the **Adafruit VEML7700 Lux Sensor - STEMMA QT / Qwiic (#4162)**, which adds a 3.3 V regulator (AP2112K), BSS138 I2C level shifters and pull-ups, so it runs from 3-5 V.

## Pinout (Adafruit #4162, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3-5 V |
| 3Vo | 3.3 V output of the board's regulator (up to 100 mA); not an input, leave unconnected |
| GND | Ground |
| SCL | I2C clock (pull-up and level shifter on board) |
| SDA | I2C data (pull-up and level shifter on board) |

The two STEMMA QT / Qwiic connectors carry the same GND, VIN, SDA and SCL.

## Electrical limits
- Board supply (VIN): 3-5 V. The bare chip needs 2.5-3.6 V (absolute max 4 V); the regulator handles that.
- I2C logic follows VIN thanks to the level shifters, so a 3.3 V ESP32/Pico and a 5 V Arduino both work.
- Current: about 45 µA while measuring every 100 ms, 0.5 µA in shutdown, plus the regulator and the green "on" LED.
- I2C 10-400 kHz.

## Interface details
- **I2C address 0x10**, fixed.
- 16-bit registers ("command codes"), **LSB first**: write = [command, LSB, MSB]; read = command code, repeated start, LSB, MSB.
- 0x00 ALS_CONF_0: bits 12:11 ALS_GAIN (00 x1, 01 x2, 10 x1/8, 11 x1/4), bits 9:6 ALS_IT (1100 25 ms, 1000 50 ms, 0000 100 ms, 0001 200 ms, 0010 400 ms, 0011 800 ms), bits 5:4 persistence, bit 1 INT enable, bit 0 ALS_SD. **Powers up as 0x0001 = shut down.**
- 0x03 power saving (PSM), 0x04 ALS result, 0x05 WHITE result, 0x06 interrupt status, 0x07 ID (low byte 0x81, high byte 0xC4).
- Lux = ALS counts x resolution. Resolution is 0.0042 lx/count at gain x2 / 800 ms and doubles for each halving of gain or integration time:

| IT | x2 | x1 | x1/4 | x1/8 |
|---|---|---|---|---|
| 800 ms | 0.0042 | 0.0084 | 0.0336 | 0.0672 |
| 100 ms | 0.0336 | 0.0672 | 0.2688 | 0.5376 |
| 25 ms | 0.1344 | 0.2688 | 1.0752 | 2.1504 |

- Above about 1000 lx (gain 1/4 or 1/8) the app note's correction applies: lux = 6.0135e-13 x^4 - 9.3924e-9 x^3 + 8.1488e-5 x^2 + 1.0023 x.
- After setting ALS_SD = 0 wait at least 2.5 ms, then one integration time, before the first result is valid.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from veml7700 import VEML7700, GAIN_1_4
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = VEML7700(i2c, gain=GAIN_1_4, it_ms=100)
print('Lux=%.2f' % sensor.lux())
```
The driver also has `raw()`, `white()`, `lux_corrected()`, `configure(gain, it_ms)` and `shutdown()`. In the simulator the sensor is modelled at the default gain 1/4, 100 ms setting (0.2688 lx/count, up to 17 616 lx).

## Gotchas
- It starts shut down: reading without writing ALS_CONF first returns 0 lx. The driver powers it on.
- Bytes come LSB first, unlike most sensors: swapping them gives wildly wrong lux.
- Gain x1 and x2 saturate and go non-linear above about 100 lx; start at 1/4 or 1/8 when you don't know the light level, and step up for dim rooms.
- A count of 65535 means saturated: lower the gain or the integration time.
- The address is fixed: only one per I2C bus without a multiplexer.

## Datasheet
https://www.vishay.com/docs/84286/veml7700.pdf (application note: https://www.vishay.com/docs/84323/designingveml7700.pdf)
