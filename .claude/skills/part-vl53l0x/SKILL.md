---
name: part-vl53l0x
description: Pinout, electrical limits, wiring and MicroPython driver for the VL53L0X time-of-flight laser distance sensor (VL53L0X). Use when designing, wiring, simulating or writing code for a VL53L0X in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# VL53L0X time-of-flight distance sensor (VL53L0X)

## Overview
The **VL53L0X** from STMicroelectronics is a FlightSense time-of-flight ranging sensor. It fires 940 nm infrared laser pulses (Class 1, eye-safe) and times the reflections. It gives an absolute distance in millimetres up to about 2 m, whatever the target's colour.
- Default mode: about 33 ms per range, up to about 1.2 m. Long range: up to 2 m in the dark. High accuracy: 200 ms budget, within ±3 % at 1.2 m.
- Field of view 25°.
- Modelled board: **GY-530 / GY-VL53L0XV2 module** (purple, 6-pin header). It has a 2.8 V LDO, MOSFET level shifters on SDA/SCL with 10 kΩ pull-ups to VIN, and 47 kΩ pull-ups to 2.8 V on XSHUT and GPIO1. The circuit is a copy of Pololu's #2490 carrier.

## Pinout (GY-530, header order as printed on the board)
| Pin | Function |
|---|---|
| VIN | Supply, 3.3-5 V (regulated to 2.8 V on the board) |
| GND | Ground |
| SCL | I2C clock (level shifted, 10 kΩ pull-up) |
| SDA | I2C data (level shifted, 10 kΩ pull-up) |
| GPIO1 | Interrupt output, open drain, 2.8 V pull-up, goes low on new range (optional) |
| XSHUT | Shutdown input, active low, 2.8 V pull-up, **not** level shifted (optional) |

## Electrical limits
- Bare chip AVDD: 2.6-3.5 V (typ. 2.8 V), absolute max 3.6 V on any pin. The module's LDO takes 3.3-5 V on VIN.
- Current: 19 mA average while ranging, peaks up to 40 mA. HW standby (XSHUT low) about 5 µA.
- I2C up to 400 kHz. Boot takes up to 1.2 ms after XSHUT goes high.

## Interface details
- **I2C address 0x29** (7-bit; the datasheet gives the 8-bit form 0x52). Change it in software through register 0x8A; it resets on power-up or XSHUT.
- 8-bit register index; multi-byte values are MSB first.
- Reference registers (datasheet table 4): 0xC0 = **0xEE**, 0xC1 = 0xAA, 0xC2 = 0x10.
- ST publishes no register map. Init must replay ST's API: stop variable from 0x91, SPAD info from NVM (poll 0x83, count/type from 0x92), the reference SPAD map at 0xB0-0xB5, the default tuning table, GPIO interrupt config, timing budget, then VHV (0x41) and phase (0x01) reference calibrations. The driver is a port of Pololu's library, which does exactly this.
- Continuous mode: write 0x02 to SYSRANGE_START (0x00); for timed mode write the period to 0x04 and 0x04 to 0x00.
- Result: wait until RESULT_INTERRUPT_STATUS (0x13) bits 2:0 are non-zero, then read the 16-bit range in **mm** at 0x1E (RESULT_RANGE_STATUS 0x14 + 10). Write 0x01 to SYSTEM_INTERRUPT_CLEAR (0x0B) after each read.
- 0x14 bits 6:3 = device range status; 11 means a valid range. 8190/8191 mm means nothing in range.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VIN | 3V3 | 3V3(OUT) pin 36 | 3.3 V pin 1 |
| GND | GND | GND pin 38 | GND pin 6 |
| SDA | GPIO21 | GP4 (pin 6) | GPIO2 SDA pin 3 |
| SCL | GPIO22 | GP5 (pin 7) | GPIO3 SCL pin 5 |
| XSHUT | leave open (or an open-drain GPIO) | leave open | leave open |
| GPIO1 | optional GPIO (IRQ) | optional GPIO | optional GPIO |

On a Raspberry Pi 4 running Linux use `adafruit-circuitpython-vl53l0x` instead of this MicroPython driver.

## Using the driver
```python
from machine import I2C, Pin
import time
from vl53l0x import VL53L0X

i2c = I2C(0, sda=Pin(4), scl=Pin(5), freq=400000)   # Pico
tof = VL53L0X(i2c)
tof.start_continuous()
while True:
    mm = tof.read()          # None when nothing is in range
    print('out of range' if mm is None else 'D=%d mm' % mm)
    time.sleep_ms(200)
```
`tof.read_single()` takes one range without continuous mode. `tof.long_range()` reaches about 2 m. `tof.set_timing_budget_us(200000)` gives better accuracy, and `20000` gives faster readings. `tof.range_status` holds the last device range status (11 = valid).

**Several sensors on one bus:** hold every XSHUT low, release one, create `VL53L0X(i2c)` and call `set_address(0x30)`, then release the next and give it another address.

## Gotchas
- **Peel off the protective film** over the sensor window first.
- XSHUT and GPIO1 are 2.8 V signals and not level shifted. Pull XSHUT low with an open-drain output or leave it floating. Never drive it high from a 5 V board.
- Sunlight and other IR shorten the range sharply. Shiny or dark targets also reduce it.
- The address returns to 0x29 at every power cycle or XSHUT reset.
- No offset or crosstalk calibration is done here; a cover glass needs ST's calibration flow.
- The simulator has no ranging timing: in Sparkbench a new range is always ready.

## Datasheet
https://www.st.com/resource/en/datasheet/vl53l0x.pdf (mirror used: https://www.pololu.com/file/0J1187/VL53L0X.pdf)
