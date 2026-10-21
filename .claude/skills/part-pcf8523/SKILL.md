---
name: part-pcf8523
description: Pinout, electrical limits, wiring and MicroPython driver for the PCF8523 real-time clock breakout (NXP PCF8523, Adafruit 5189 STEMMA QT board). Use when designing, wiring, simulating or writing code for a PCF8523 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# PCF8523 real-time clock breakout (PCF8523)

## Overview
The **PCF8523** from NXP is a low-power real-time clock/calendar: seconds, minutes, hours, day, weekday, month and year in BCD, automatic leap years, an alarm (minute/hour/day/weekday), two timers, an offset register for trimming, battery switch-over with a low-battery flag, and a programmable square-wave output. It talks I2C at up to 1 MHz at the fixed address **0x68**. The board modelled here is the **Adafruit PCF8523 Real Time Clock Breakout - STEMMA QT / Qwiic (product 5189)**: no regulator, 10 kOhm I2C pull-ups to VIN, power LED, 32.768 kHz crystal, CR1220 holder (battery not included) and two STEMMA QT sockets. The older Adafruit 3295 has the same pins in a different order (SQW, SCL, SDA, VCC, GND).

## Pinout (Adafruit 5189, as printed on the board, left to right)
| Pin | Function |
|---|---|
| VIN | Supply 3-5 V, straight to the chip and the I2C pull-ups |
| GND | Ground |
| SCL | I2C clock (10 kOhm pull-up to VIN on board) |
| SDA | I2C data (10 kOhm pull-up to VIN on board) |
| SQW | INT1/CLKOUT: square wave or alarm interrupt, open-drain, **no pull-up** on the board (optional) |

## Electrical limits
- Chip: 1.6-5.5 V with I2C active, 1.8-5.5 V with battery switch-over; absolute max 6.5 V. Board silkscreen: "VLogic/Vcc: 3-5V".
- Current: chip up to 200 uA with I2C at 1 MHz, about 1.2 uA timekeeping with switch-over on; the power LED adds a fraction of a mA.
- The I2C pull-ups go to VIN: with a 3.3 V board (ESP32, Pico) power VIN from 3.3 V, never 5 V.
- Battery switch-over threshold about 2.5 V; coin cell CR1220.

## Interface details
- **I2C address 0x68** (D0h write / D1h read), fixed; clashes with DS1307/DS3231/MPU-6050.
- 00h Control_1: CAP_SEL (7), T (6, write 0), STOP (5), SR (4), 12_24 (3, 0 = 24 h), SIE (2), AIE (1), CIE (0). Writing 58h = software reset.
- 01h Control_2: WTAF, CTAF, CTBF, SF, AF (3), WTAIE, CTAIE, CTBIE. Flags clear by writing 0; writing 1 leaves them unchanged.
- 02h Control_3: PM[2:0] (7-5; power-on 111 = switch-over **off**, 000 = switch-over + battery-low detection on), BSF (3), BLF (2), BSIE, BLIE.
- **03h-09h time**: seconds (bit 7 = OS oscillator-stop flag), minutes, hours, days, weekdays (0 = Sunday ... 6 = Saturday), months, years 00-99. Day comes before weekday (like the PCF8563), block starts at 03h.
- 0Ah-0Dh alarms: minute, hour, day, weekday (bit 7 AEN_x = 1 disables a field; no seconds alarm).
- 0Eh Offset, 0Fh Tmr_CLKOUT_ctrl: COF[2:0] in bits 5-3 (000 32768, 001 16384, 010 8192, 011 4096, 100 1024, 101 32, 110 1 Hz, 111 off).
- Address pointer auto-increments; read or write 03h-09h in one access finished within 1 s.

## Wiring
- ESP32: VIN -> 3V3, GND -> GND, SDA -> D21, SCL -> D22 (pull-ups are on the board).
- Pico: VIN -> 3V3(OUT), GND -> GND, SDA -> GP4, SCL -> GP5.
- Raspberry Pi 4: VIN -> pin 1 (3.3 V), GND -> pin 6, SDA -> pin 3, SCL -> pin 5.
- Or use a STEMMA QT / Qwiic cable.
- SQW (optional): to a GPIO with `Pin.PULL_UP` or an external 10 kOhm pull-up.

## Using the driver
```python
from machine import I2C, Pin
from pcf8523 import PCF8523
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
rtc = PCF8523(i2c)
if rtc.lost_power():
    rtc.datetime((2026, 10, 21, 12, 0, 0))  # year, month, day, hour, minute, second
y, mo, d, wd, h, mi, s = rtc.datetime()      # wd: 0 = Sunday
print('%04d-%02d-%02d %02d:%02d:%02d' % (y, mo, d, h, mi, s))
rtc.clkout(0)  # square wave off (saves current, frees SQW for the alarm interrupt)
```

## Gotchas
- **Battery backup is off at power-on** (PM = 111). Without PM = 000 the coin cell is ignored and the time is lost when VIN is removed. The driver enables it whenever it sets the time (`battery_switchover(True)`).
- Not a drop-in for DS1307/DS3231 code despite the same address: the time block starts at 03h and day comes before weekday.
- OS reads 1 at power-up (200 ms-2 s while the crystal starts) and after a software reset; set the time to clear it.
- The weekday register is not computed by the chip; the driver works it out from the date.
- Years are 2000-2099; every year divisible by 4 is treated as a leap year.
- SQW carries 32.768 kHz from power-up; the alarm only appears on it after `clkout(0)`.
- Not temperature compensated: up to about 2 s/day drift; trim with the Offset register (0Eh) or use a DS3231 for precision.

## Datasheet
https://www.nxp.com/docs/en/data-sheet/PCF8523.pdf
