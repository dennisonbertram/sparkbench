---
name: part-vl53l1x
description: Pinout, electrical limits, wiring and MicroPython driver for the VL53L1X time-of-flight distance sensor (VL53L1X). Use when designing, wiring, simulating or writing code for a VL53L1X in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# VL53L1X time-of-flight distance sensor (VL53L1X)

## Overview
The **VL53L1X** from STMicroelectronics is a FlightSense time-of-flight ranging sensor. It fires 940 nm infrared laser pulses (Class 1, eye-safe) and times the reflections, giving an absolute distance in millimetres from about 4 cm up to 4 m (long mode, dark, white target).
- Distance modes: short (up to about 1.3 m, better in sunlight) and long (up to 3.6–4 m in the dark, but only about 0.73 m in strong ambient light).
- Timing budget 20–1000 ms per range (33 ms is the minimum for long mode); up to 50 Hz.
- Field of view 27° (programmable down to 15° with a smaller ROI).
- Modelled board: **Adafruit VL53L1X Time of Flight Distance Sensor (product 3967)**. It has an LP5907 2.8 V regulator, BSS138 level shifting on SDA/SCL/XSHUT, 10 kΩ pull-ups and two STEMMA QT connectors.

## Pinout (Adafruit 3967, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (regulated to 2.8 V on the board) |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up, level shifted) |
| SDA | I2C data (10 kΩ pull-up, level shifted) |
| GPIO | Interrupt output (GPIO1), 2.8 V logic, data-ready |
| XSHUT | Shutdown input, active low, level shifted |

## Electrical limits
- Bare chip AVDD: 2.6–3.5 V (typ. 2.8 V). Never put more than 3.5 V on a bare module; the Adafruit board's regulator takes 3–5 V on VIN.
- Current: 16 mA typical, 18 mA max while ranging; peaks up to 40 mA. HW standby (XSHUT low) about 5 µA.
- I2C up to 400 kHz. Operating temperature −20 to 85 °C. Boot takes up to 1.2 ms after XSHUT goes high.

## Interface details
- **I2C address 0x29** (7-bit; the datasheet gives the 8-bit form 0x52). Change it in software through register 0x0001; it resets on power-up or XSHUT.
- **16-bit register addresses**, sent MSB first; data is big-endian.
- ID: 0x010F = **0xEA** (model ID), 0x0110 = 0xCC (module type), 0x0111 = 0x10 (mask revision).
- Init (ST Ultra Lite Driver): wait for 0x00E5 bit 0 = 1 (booted), write the 91-byte default configuration to 0x002D–0x0087, start ranging (0x0086 = 0x01, 0x0087 = 0x40), wait for data ready, clear the interrupt, stop (0x0087 = 0x00), then 0x0008 = 0x09 and 0x000B = 0x00.
- Data ready: GPIO__TIO_HV_STATUS 0x0031 bit 0 equals the interrupt polarity (active high when 0x0030 bit 4 is 0, the default).
- Result: 0x0096–0x0097 = distance in **mm** (16-bit unsigned, big-endian). 0x0089 bits 4:0 = range status; 9 means valid.
- After each reading write 0x01 to SYSTEM__INTERRUPT_CLEAR (0x0086); the next result is not updated until you do.
- ST publishes no full register map; the driver follows ST's ULD API (STSW-IMG009) as used by Adafruit's library.

## Wiring
| Breakout | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VIN | 3V3 | 3V3(OUT) pin 36 | 3.3 V pin 1 |
| GND | GND | GND pin 38 | GND pin 6 |
| SDA | GPIO21 | GP4 (pin 6) | GPIO2 SDA pin 3 |
| SCL | GPIO22 | GP5 (pin 7) | GPIO3 SCL pin 5 |
| XSHUT | optional GPIO | optional GPIO | optional GPIO |
| GPIO | optional GPIO (IRQ) | optional GPIO | optional GPIO |

On a Raspberry Pi 4 running Linux use `adafruit-circuitpython-vl53l1x` instead of this MicroPython driver.

## Using the driver
```python
from machine import I2C, Pin
import time
from vl53l1x import VL53L1X

i2c = I2C(0, sda=Pin(4), scl=Pin(5), freq=400000)   # Pico
tof = VL53L1X(i2c)          # long mode, 50 ms timing budget
tof.start_ranging()
while True:
    mm = tof.read()          # None when the range status is not valid
    print('out of range' if mm is None else 'D=%d mm' % mm)
    time.sleep_ms(200)
```
`tof.set_distance_mode(1)` switches to short mode; `tof.set_timing_budget(100)` trades speed for range and repeatability. `tof.range_status` holds the last ULD status (0 = valid, 1 = sigma fail, 2 = signal fail, 4 = out of bounds, 7 = wrap-around).

**Several sensors on one bus:** hold every XSHUT low, release one, create `VL53L1X(i2c)` and call `set_address(0x30)`, then release the next and give it another address.

## Gotchas
- **Peel off the protective film** over the sensor window first.
- Below 4 cm the sensor still detects a target but the distance is not accurate.
- Sunlight and other IR shorten long-mode range sharply (to about 73 cm); use short mode outdoors.
- The address returns to 0x29 at every power cycle or XSHUT reset.
- No offset or crosstalk calibration is done here; a cover glass needs ST's calibration flow.
- The driver uses `writeto`/`readfrom` with a two-byte register address, so it works on MicroPython ports whose `readfrom_mem` lacks `addrsize=16`.

## Datasheet
https://www.st.com/resource/en/datasheet/vl53l1x.pdf (mirror used: https://www.pololu.com/file/0J1506/vl53l1x.pdf)
