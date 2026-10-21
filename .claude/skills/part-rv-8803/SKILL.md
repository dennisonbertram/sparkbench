---
name: part-rv-8803
description: Pinout, electrical limits, wiring and MicroPython driver for the RV-8803 temperature-compensated real-time clock (Micro Crystal RV-8803-C7, SparkFun Real Time Clock Module - RV-8803 (Qwiic) BOB-16281). Use when designing, wiring, simulating or writing code for an RV-8803 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# RV-8803 real-time clock breakout (RV-8803-C7)

## Overview
The **RV-8803-C7** from Micro Crystal is a real-time clock with a 32.768 kHz crystal and digital temperature compensation built into the package (+/-1.5 ppm from 0 to 50 C, about 0.13 s a day, factory calibrated). It counts hundredths of seconds, seconds, minutes, hours (24-hour only), weekday, date, month and year in BCD with leap years from 2000 to 2099, and adds an alarm, a countdown timer, a periodic update interrupt, a time-stamped external event input (EVI) and a programmable clock output. It draws about 240 nA while timekeeping and talks I2C at up to 400 kHz. Hobbyists buy it as the **SparkFun Real Time Clock Module - RV-8803 (Qwiic), BOB-16281**: two Qwiic connectors, an 8-pin 0.1" header, 4.7 kOhm SDA/SCL pull-ups, a power LED, an EVI push button and a **CR1225 backup cell** that takes over automatically through a diode.

## Pinout (SparkFun BOB-16281, header order as printed)
| Pin | Function |
|---|---|
| GND | Ground |
| 3V3 | Supply, 3.3 V |
| SDA | I2C data (4.7 kOhm pull-up to 3V3 on board, I2C jumper) |
| SCL | I2C clock (4.7 kOhm pull-up to 3V3 on board) |
| EVI | External event input, 100 kOhm pull-up + push button (optional) |
| INT | Interrupt, open-drain, active LOW, 100 kOhm pull-up (optional) |
| CLKOUT | Clock output, only active while CLKOE is high (optional) |
| CLKOE | Clock output enable, 100 kOhm pull-down: CLKOUT off (optional) |

## Electrical limits
- Chip VDD: 1.5-5.5 V (2.0 V minimum for 400 kHz I2C); absolute max 6.0 V. On the SparkFun board VDD comes from 3V3 through a BAS70-05 diode, so feed 3V3 with 3.3 V (2.0-3.6 V).
- Inputs must stay within VDD + 0.3 V; the on-board pull-ups go to 3V3, so the bus sits at 3.3 V, safe for ESP32/Pico.
- Current: about 240 nA timekeeping, a few uA during I2C, plus about 1-3 mA for the board's power LED (cut the LED jumper to save it).
- Backup: CR1225 3 V lithium cell, diode-ORed with 3V3: no setting is needed for switchover.

## Interface details
- **I2C address 0x32**, fixed.
- **00h-06h time**: seconds, minutes, hours (24 h), weekday, date, month, year 00-99, same order as the DS1307/DS3231 (mirrored at 11h-17h, with 10h = hundredths of seconds, read only). Address auto-increments.
- Weekday (03h) is **one-hot**: exactly one bit set, bit n = weekday n. This driver uses bit 0 = Sunday.
- 08h-0Ah alarm: minutes, hours, weekday/date (bit 7 AE = 1 disables a field; 0Ah is a date alarm when WADA = 1 in 0Dh bit 6).
- 0Dh extension register (TEST bit 7 must always be written 0), 0Eh flags (UF, TF, AF bit 3, EVF, V2F bit 1, V1F bit 0; write 0 to clear), 0Fh control (UIE, TIE, AIE bit 3, EIE, RESET bit 0).
- The counters **cannot be frozen** during a read. Burst-read 00h-06h; if seconds read 59, read again and use the second burst if the seconds changed (App. Manual 4.12).
- To set the time: RESET = 1, write 00h-06h, RESET = 0 (App. Manual 4.13). RESET also clears the hundredths.

## Wiring
- ESP32: 3V3 -> 3V3, GND -> GND, SDA -> D21, SCL -> D22 (no extra pull-ups needed). Or use a Qwiic cable.
- Pico: 3V3 -> 3V3(OUT), GND -> GND, SDA -> GP4, SCL -> GP5.
- Raspberry Pi: 3V3 -> pin 1, SDA -> pin 3, SCL -> pin 5, GND -> pin 6 (or 9).
- Leave EVI, INT, CLKOUT and CLKOE unconnected unless you use them.

## Using the driver
```python
from machine import I2C, Pin
from rv8803 import RV8803
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
rtc = RV8803(i2c)
if rtc.lost_power():
    rtc.datetime((2026, 10, 21, 12, 0, 0))  # year, month, day, hour, minute, second
y, mo, d, wd, h, mi, s = rtc.datetime()      # wd: 0 = Sunday
print('%04d-%02d-%02d %02d:%02d:%02d.%02d' % (y, mo, d, h, mi, s, rtc.hundredths()))
rtc.set_alarm(minute=30, hour=7)             # INT goes low at 07:30 every day
```

## Gotchas
- V2F/V1F are set at power-up (and if the supply drops below about 1.2 V with no cell); `lost_power()` stays True until you set the time.
- The hours register is always 24-hour; there is no 12-hour mode.
- The weekday register is one-hot, not 0-6 like the DS3231 or RV-3028. The driver writes it correctly and returns the weekday worked out from the date.
- Never write 1 to the TEST bit (0Dh bit 7).
- Years are 2000-2099 only.

## Datasheet
https://www.microcrystal.com/fileadmin/Media/Products/RTC/App.Manual/RV-8803-C7_App-Manual.pdf
