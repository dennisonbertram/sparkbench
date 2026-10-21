---
name: part-ltr-329
description: Pinout, electrical limits, wiring and MicroPython driver for the LTR-329 ambient light sensor (Lite-On LTR-329ALS-01). Use when designing, wiring, simulating or writing code for an LTR-329 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LTR-329 ambient light sensor (LTR-329ALS-01)

## Overview
The **LTR-329ALS-01** from Lite-On is a digital ambient light sensor with two 16-bit ADC channels: **CH0** (visible + infrared) and **CH1** (infrared only). Six gains (1x, 2x, 4x, 8x, 48x, 96x) and integration times of 50-400 ms cover about 0.01 to 64k lux. It talks I2C at the fixed address 0x29. Hobbyists buy it on the **Adafruit LTR-329 Light Sensor - STEMMA QT / Qwiic (#5591)**, which has a 3.3 V regulator, I2C level shifting and 10 k pull-ups, so it runs from 3-5 V.

## Pinout (Adafruit #5591, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3-5 V |
| 3Vo | 3.3 V regulator output (up to 100 mA), leave unconnected |
| GND | Ground |
| SCL | I2C clock (10 k pull-up, level shifted) |
| SDA | I2C data (10 k pull-up, level shifted) |

## Electrical limits
- Chip supply 2.4-3.6 V (absolute max 3.8 V); the breakout's VIN takes 3-5 V.
- Current: about 250 µA active, 5 µA standby.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x29** (fixed). PART_ID 0x86 = 0xA0, MANUFAC_ID 0x87 = 0x05.
- Power-up: wait ≥ 100 ms, then write **ALS_CONTR 0x80 = (gain << 2) | 1** (active mode); wake-up takes up to 10 ms.
- **ALS_MEAS_RATE 0x85** = (integration code << 3) | rate code; default 0x03 = 100 ms integration, 500 ms repeat.
- **ALS_STATUS 0x8C**: bit 2 = new data, bit 7 = data invalid.
- Data: read 4 bytes from **0x88**: CH1 low, CH1 high, CH0 low, CH0 high. CH1 must be read first; the registers stay locked until 0x8B is read.
- Lux (Lite-On Appendix A), ratio = CH1 / (CH0 + CH1):
  - ratio < 0.45: lux = (1.7743·CH0 + 1.1059·CH1) / gain / (Tint/100 ms)
  - ratio < 0.64: lux = (4.2785·CH0 − 1.9548·CH1) / gain / (Tint/100 ms)
  - ratio < 0.85: lux = (0.5926·CH0 + 0.1185·CH1) / gain / (Tint/100 ms)
  - otherwise 0

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from ltr329 import LTR329, GAIN_1X, INT_100MS, RATE_500MS
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = LTR329(i2c, gain=GAIN_1X, integration=INT_100MS, rate=RATE_500MS)
ch0, ch1 = sensor.channels()
print('CH0=%d CH1=%d Lux=%.1f' % (ch0, ch1, sensor.lux(ch0, ch1)))
```

## Gotchas
- A channel reading 65535 is saturated (`lux()` returns None): lower the gain or the integration time.
- Integration time must be ≤ the repeat rate, or the chip shortens it to the rate.
- 0x29 is also used by the TSL2591 and VL53L0X: only one of them per I2C bus.
- Don't feed 5 V into 3Vo; it is an output.

## Datasheet
https://optoelectronics.liteon.com/upload/download/DS86-2014-0006/LTR-329ALS-01_DS_V1.pdf
