---
name: part-ltr-559
description: Pinout, electrical limits, wiring and MicroPython driver for the LTR-559 ambient light & proximity sensor (Lite-On LTR-559ALS-01, Pimoroni PIM413 breakout). Use when designing, wiring, simulating or writing code for an LTR-559 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LTR-559 light & proximity sensor (LTR-559ALS-01)

## Overview
The **LTR-559ALS-01** from Lite-On combines a digital ambient light sensor (two 16-bit channels: **CH0** visible + infrared, **CH1** infrared only; 0.01 to 64k lux) with an **11-bit proximity sensor** that has its own infrared LED (about 5 cm range). It talks I2C at the fixed address 0x23. Hobbyists buy it on the **Pimoroni LTR-559 Light & Proximity Sensor Breakout (PIM413)**, which adds a 3.3 V regulator and I2C level shifting, so it runs from 3.3 V or 5 V (Pimoroni: "3.3V or 5V compatible").

## Pinout (Pimoroni PIM413, header order)
| Pin | Function |
|---|---|
| 3-6V | Supply: 3.3 V or 5 V (label reads 3-6V; 3.3 V regulator on board) |
| SDA | I2C data (level shifted, pull-up on board) |
| SCL | I2C clock (level shifted, pull-up on board) |
| INT | Interrupt output, open-drain, active low (optional) |
| GND | Ground |

The order matches Raspberry Pi header pins 1, 3, 5, 7, 9 (INT lands on GPIO4).

## Electrical limits
- Chip supply 2.4-3.6 V (absolute max 3.8 V); the breakout is rated 3.3 V or 5 V (stay within 3.3-5 V even though the silkscreen says 3-6V).
- Current: about 250 µA active plus the proximity LED pulses (up to 100 mA peak, very short), 5 µA standby.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x23** (fixed). PART_ID 0x86 = 0x92, MANUFAC_ID 0x87 = 0x05.
- Power-up: wait ≥ 100 ms. Optional soft reset: ALS_CONTR 0x80 = 0x02, wait until bit 1 reads 0.
- INTERRUPT 0x8F must be set before active mode (0 = INT off).
- **ALS_CONTR 0x80 = (gain << 2) | 1**; gain codes 0-3 = 1x/2x/4x/8x, 6 = 48x, 7 = 96x.
- **PS_CONTR 0x81 = 0x03** (active), | 0x20 to enable the saturation flag.
- PS_LED 0x82 (default 0x7F: 60 kHz, 100 % duty, 100 mA), PS_N_PULSES 0x83 (1-15), PS_MEAS_RATE 0x84 (default 100 ms).
- ALS_MEAS_RATE 0x85 = (integration code << 3) | repeat code; default 100 ms every 500 ms.
- **ALS_PS_STATUS 0x8C**: bit 7 ALS data invalid, bit 2 new ALS data, bit 0 new PS data.
- ALS data: 4 bytes from **0x88**: CH1 low, CH1 high, CH0 low, CH0 high (read CH1 first).
- PS data: 2 bytes from **0x8D**: count = b0 | (b1 & 0x07) << 8 (0-2047, higher = closer); b1 bit 7 = saturated.
- Lux (Lite-On Appendix A), ratio = CH1 / (CH0 + CH1):
  - ratio < 0.45: (1.7743·CH0 + 1.1059·CH1) / gain / (Tint/100 ms)
  - ratio < 0.64: (4.2785·CH0 − 1.9548·CH1) / gain / (Tint/100 ms)
  - ratio < 0.85: (0.5926·CH0 + 0.1185·CH1) / gain / (Tint/100 ms)
  - otherwise 0

## Wiring
- ESP32: 3-6V → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3-6V → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: plug onto pins 1, 3, 5, 7, 9 (3.3 V, SDA, SCL, GPIO4, GND).

## Using the driver
```python
from machine import I2C, Pin
from ltr559 import LTR559, GAIN_4X, INT_100MS, RATE_500MS
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = LTR559(i2c, gain=GAIN_4X, integration=INT_100MS, rate=RATE_500MS)
ch0, ch1 = sensor.channels()
print('Lux=%.1f Prox=%d' % (sensor.lux(ch0, ch1), sensor.proximity()))
```

## Gotchas
- A channel at 65535 is saturated (`lux()` returns None): lower the gain or integration time.
- Proximity counts are relative: they depend on the target's colour, the LED current and any cover glass. Calibrate a threshold rather than expecting centimetres.
- 0x23 is also the BH1750's default address: only one of them per I2C bus.
- Some later Pimoroni batches carry a Qw/ST connector that is not functional (a wiring error); use the 5-pin header.

## Datasheet
https://web.archive.org/web/2020/http://optoelectronics.liteon.com/upload/download/ds86-2013-0003/ltr-559als-01_ds_v1.pdf
