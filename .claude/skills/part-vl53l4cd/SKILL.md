---
name: part-vl53l4cd
description: Pinout, electrical limits, wiring and MicroPython driver for the VL53L4CD time-of-flight distance sensor (ST VL53L4CD, Adafruit 5396 breakout). Use when designing, wiring, simulating or writing code for a VL53L4CD in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# VL53L4CD time-of-flight distance sensor (VL53L4CD)

## Overview
The **VL53L4CD** from STMicroelectronics is a FlightSense time-of-flight sensor for short distances. It fires 940 nm infrared laser pulses (Class 1, eye-safe) and times the reflections, giving an absolute distance in millimetres from **1 mm up to about 1.3 m** (white target, indoors). It is a short-range relative of the VL53L1X with better accuracy close up.
- Max range with a 33 ms timing budget: about 1200 mm (white, indoors), 450 mm (grey 17 %), about 550 mm outdoors (overcast).
- Linear response from 1 mm; field of view 18°.
- Timing budget 10–200 ms; back-to-back (continuous) or autonomous low-power mode with an inter-measurement period.
- Modelled board: **Adafruit VL53L4CD Time of Flight Distance Sensor (product 5396)**. It has an LP5907 2.8 V regulator, BSS138 level shifting on SDA/SCL/XSHUT, 10 kΩ pull-ups, a green power LED and two STEMMA QT connectors.

## Pinout (Adafruit 5396, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (regulated to 2.8 V on the board) |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up, level shifted) |
| SDA | I2C data (10 kΩ pull-up, level shifted) |
| GPIO | Interrupt output (GPIO1), 2.8 V logic, data ready (active low by default) |
| XSHUT | Shutdown input, active low, level shifted |

## Electrical limits
- Bare chip AVDD: 2.6–3.5 V (typ. 2.8 V). Never put more than 3.5 V on a bare module; the Adafruit board's regulator takes 3–5 V on VIN.
- Current: 22 mA typical, 24 mA max while ranging (average); peaks up to 40 mA. HW standby (XSHUT low) about 5 µA.
- I2C up to 1 MHz (Fast mode plus). Boot takes up to 1.2 ms after XSHUT goes high.

## Interface details
- **I2C address 0x29** (7-bit; the datasheet gives the 8-bit form 0x52). Change it in software through register 0x0001; it resets on power-up or XSHUT.
- **16-bit register addresses**, sent MSB first; multi-byte data is big-endian.
- ID: 0x010F = **0xEB** (model ID), 0x0110 = **0xAA** (module type).
- Init (ST Ultra Lite Driver, STSW-IMG026): wait for 0x00E5 = 0x03 (booted), write the 91-byte default configuration to 0x002D–0x0087, start VHV (0x0087 = 0x40), wait for data ready, clear the interrupt (0x0086 = 0x01), stop (0x0087 = 0x00), then 0x0008 = 0x09, 0x000B = 0x00, 0x0024 = 0x0500 and set the range timing (50 ms).
- Start ranging: 0x0087 = 0x21 when the inter-measurement period (0x006C, 32-bit) is 0, else 0x40. Stop: 0x0087 = 0x00.
- Data ready: 0x0031 bit 0 equals the interrupt polarity. The default config sets 0x0030 bit 4, so the interrupt is **active low** and data is ready when bit 0 reads 0.
- Result: 0x0096–0x0097 = distance in **mm** (16-bit unsigned). 0x0089 bits 4:0 = range status (9 = valid); 0x008C = SPAD count × 256 (0 means no result); 0x0092 = sigma × 4 mm; 0x008E = signal rate / 8 kcps.
- After each reading write 0x01 to 0x0086, or the next result does not arrive.
- ST publishes no full register map; the driver follows the ULD source exactly.

## Wiring
| Breakout | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VIN | 3V3 | 3V3(OUT) pin 36 | 3.3 V pin 1 |
| GND | GND | GND pin 38 | GND pin 6 |
| SDA | GPIO21 | GP4 (pin 6) | GPIO2 SDA pin 3 |
| SCL | GPIO22 | GP5 (pin 7) | GPIO3 SCL pin 5 |
| XSHUT | optional GPIO | optional GPIO | optional GPIO |
| GPIO | optional GPIO (IRQ) | optional GPIO | optional GPIO |

On a Raspberry Pi 4 running Linux use `adafruit-circuitpython-vl53l4cd` instead of this MicroPython driver.

## Using the driver
```python
from machine import I2C, Pin
import time
from vl53l4cd import VL53L4CD

i2c = I2C(0, sda=Pin(4), scl=Pin(5), freq=400000)   # Pico
tof = VL53L4CD(i2c)          # 50 ms timing budget, continuous
tof.start_ranging()
while True:
    mm = tof.read()           # None when the range status is not valid
    print('out of range' if mm is None else 'D=%d mm' % mm)
    time.sleep_ms(200)
```
`tof.set_range_timing(100, 0)` (call before `start_ranging()`) trades speed for repeatability; `tof.set_range_timing(50, 200)` ranges every 200 ms in low-power autonomous mode. `tof.range_status` holds the last ULD status (0 = valid, 1 = sigma above threshold, 2 = signal too low, 3 = below detection threshold, 4 = phase out of limits, 7 = wrap-around, 255 = no result); `tof.sigma_mm` and `tof.signal_kcps` hold the quality figures.

**Several sensors on one bus:** hold every XSHUT low, release one, create `VL53L4CD(i2c)` and call `set_address(0x30)`, then release the next and give it another address.

## Gotchas
- **Peel off the protective film** over the sensor window first.
- Maximum range is only about 1.3 m; for longer distances use a VL53L1X.
- Sunlight and other IR shorten range (about 0.55 m outdoors); a cover glass needs ST's offset/crosstalk calibration (`set_offset`).
- The address returns to 0x29 at every power cycle or XSHUT reset.
- The driver uses `writeto`/`readfrom` with a two-byte register address, so it works on MicroPython ports whose `readfrom_mem` lacks `addrsize=16`.

## Datasheet
https://www.st.com/resource/en/datasheet/vl53l4cd.pdf (DS13812; mirror used: https://cdn-learn.adafruit.com/assets/assets/000/109/710/original/vl53l4cd.pdf)
