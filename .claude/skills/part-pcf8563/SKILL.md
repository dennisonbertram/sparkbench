---
name: part-pcf8563
description: Pinout, electrical limits, wiring and MicroPython driver for the PCF8563 real-time clock module (NXP PCF8563, HW-689 board). Use when designing, wiring, simulating or writing code for a PCF8563 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# PCF8563 real-time clock module (PCF8563)

## Overview
The **PCF8563** from NXP is a low-power real-time clock/calendar: seconds, minutes, hours, day, weekday, month and year in BCD, with automatic leap years, an alarm, a countdown timer, an interrupt output and a programmable CLKOUT square wave. It talks I2C at up to 400 kHz. Hobbyists buy it on the blue **HW-689 / HZ-8563 PCF8563 RTC module**, which has a coin-cell holder for backup, a 32.768 kHz crystal and a single 6-pin header. It has **no I2C pull-ups**.

## Pinout (HW-689 module, header J1 order)
| Pin | Function |
|---|---|
| INT | Alarm/timer interrupt, open-drain, active LOW (optional, needs 10 kOhm pull-up if used) |
| COT | CLKOUT square wave, open-drain, 32.768 kHz at power-on (optional) |
| SCL | I2C clock (fit 4.7 kOhm pull-up to 3.3 V) |
| SDA | I2C data (fit 4.7 kOhm pull-up to 3.3 V) |
| GND | Ground |
| VCC | Supply, 2.2-5.5 V (3.3 V recommended) |

## Electrical limits
- Chip supply: 1.8-5.5 V with the I2C bus in use (timekeeping alone down to 1.0 V); absolute max 6.5 V.
- The module feeds the chip through an OR-ing diode with the backup cell, so allow about 0.4 V drop: VCC 2.2-5.5 V.
- Current: about 0.25 uA timekeeping (CLKOUT off), under 1 mA while talking I2C.
- I2C inputs: VIH = 0.7 x VDD. With VCC at 5 V a 3.3 V bus is marginal, so power the module from 3.3 V on ESP32/Pico.

## Interface details
- **I2C address 0x51** (8-bit A2h write / A3h read), fixed.
- Registers: 00h control/status 1 (reset 0x08), 01h control/status 2, **02h-08h time**: seconds (bit 7 = VL), minutes, hours (24 h), days, weekdays (0 = Sunday ... 6 = Saturday), months (bit 7 = century), years 00-99. Note the order: day comes **before** weekday (unlike the DS1307/DS3231).
- 09h-0Ch alarms (bit 7 AE = 1 disables a field), 0Dh CLKOUT control (FE bit 7, FD1..0: 32768/1024/32/1 Hz), 0Eh/0Fh countdown timer.
- Address pointer auto-increments; read 02h-08h in one burst, the chip freezes its counters during the access.
- VL = 1 means the supply dropped below the low-voltage threshold (or first power-up): time is invalid until set.
- Control/status 2: writing AF/TF as 0 clears them, writing 1 leaves them unchanged.

## Wiring
- ESP32: VCC -> 3V3, GND -> GND, SDA -> D21, SCL -> D22, plus 4.7 kOhm from SDA and SCL to 3V3.
- Pico: VCC -> 3V3(OUT), GND -> GND, SDA -> GP4, SCL -> GP5, plus 4.7 kOhm pull-ups to 3V3.
- Raspberry Pi 4: VCC -> pin 1 (3.3 V), GND -> pin 6, SDA -> pin 3, SCL -> pin 5 (the Pi has on-board pull-ups).

## Using the driver
```python
from machine import I2C, Pin
from pcf8563 import PCF8563
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
rtc = PCF8563(i2c)
if rtc.lost_power():
    rtc.datetime((2026, 10, 21, 12, 0, 0))  # year, month, day, hour, minute, second
y, mo, d, wd, h, mi, s = rtc.datetime()      # wd: 0 = Sunday
print('%04d-%02d-%02d %02d:%02d:%02d' % (y, mo, d, h, mi, s))
rtc.clkout(0)  # switch CLKOUT off to save current
```

## Gotchas
- No pull-ups on the module: without them the bus reads garbage or raises OSError (ENODEV / ETIMEDOUT).
- The weekday register is not computed by the chip; the driver works it out from the date when you set the time.
- The century bit is ignored by the driver; years are 2000-2099.
- INT is open-drain and sits LOW when an alarm/timer flag is active; it reads LOW with no pull-up.
- Many listings ship without a coin cell; without one the time is lost (VL set) whenever VCC is removed.

## Datasheet
https://www.nxp.com/docs/en/data-sheet/PCF8563.pdf
