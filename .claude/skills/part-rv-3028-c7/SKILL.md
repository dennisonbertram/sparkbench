---
name: part-rv-3028-c7
description: Pinout, electrical limits, wiring and MicroPython driver for the RV-3028-C7 extreme low power real-time clock (Micro Crystal RV-3028-C7, Pimoroni RV3028 RTC breakout PIM449). Use when designing, wiring, simulating or writing code for an RV-3028 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# RV-3028-C7 low-power RTC breakout (RV-3028-C7)

## Overview
The **RV-3028-C7** from Micro Crystal is a real-time clock with a factory-calibrated 32.768 kHz crystal built into the package (+/-1 ppm at 25 C). It keeps seconds, minutes, hours, weekday, date, month and year in BCD with leap years from 2000 to 2099, and adds an alarm, a countdown timer, a 32-bit UNIX time counter, automatic backup switchover, a trickle charger and user EEPROM. It draws about 45 nA while timekeeping and talks I2C at up to 400 kHz. Hobbyists buy it as the **Pimoroni RV3028 Real-Time Clock (RTC) Breakout (PIM449)**: a 19 x 19 mm board with a 5-pin header, a 337 silver-oxide backup cell and **on-board 10 kOhm pull-ups** on SDA, SCL and INT. (SparkFun does not make an RV-3028 board; its Qwiic RTCs use the RV-1805 and RV-8803.)

## Pinout (Pimoroni PIM449, header order as printed)
| Pin | Function |
|---|---|
| 2-5V | Supply, 2-5 V (3.3 V with ESP32/Pico) |
| SDA | I2C data (10 kOhm pull-up to 2-5V on board) |
| SCL | I2C clock (10 kOhm pull-up to 2-5V on board) |
| INT | Interrupt, open-drain, active LOW, 10 kOhm pull-up on board (optional) |
| GND | Ground |

## Electrical limits
- Chip VDD: 1.2-5.5 V with I2C active (timekeeping down to 1.1 V); absolute max 6.0 V. The board is labelled 2-5V.
- Current: about 45 nA timekeeping, 5-7 uA during I2C bursts.
- I2C inputs need VIH = 0.8 x VDD: at VDD = 5 V a 3.3 V bus is not high enough, and the board's pull-ups would pull SDA/SCL to 5 V. Power it from 3.3 V on ESP32/Pico.
- Backup cell: 337 / SR416 silver oxide, 1.55 V.

## Interface details
- **I2C address 0x52**, fixed.
- **00h-06h time**: seconds, minutes, hours (24 h by default), weekday (0-6, meaning chosen by you), date, month, year 00-99. Same order as the DS1307/DS3231. Address pointer auto-increments.
- 07h-09h alarm (bit 7 AE = 1 disables a field; 09h is weekday or date, chosen by WADA in 0Fh bit 5).
- 0Eh status: EEbusy (bit 7), AF (bit 2), PORF (bit 0). Flags clear when you write 0 to them.
- 0Fh control 1 (EERD bit 3 stops the EEPROM auto-refresh, WADA bit 5), 10h control 2 (AIE bit 3, 12_24 bit 1).
- 27h EE command, 37h EEPROM backup: BSM bits 3:2 select the backup switchover mode (00 = off on delivery, 01 = Direct, 11 = Level).
- During a time read or write the chip blocks the 1 Hz increment and applies it after STOP, so burst-read 00h-06h.

## Wiring
- ESP32: 2-5V -> 3V3, GND -> GND, SDA -> D21, SCL -> D22 (no extra pull-ups needed).
- Pico: 2-5V -> 3V3(OUT), GND -> GND, SDA -> GP4, SCL -> GP5.
- Raspberry Pi: the header fits pins 1, 3, 5, 7, 9 (3V3, SDA, SCL, GPIO4, GND).

## Using the driver
```python
from machine import I2C, Pin
from rv3028 import RV3028
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
rtc = RV3028(i2c)
rtc.backup_mode(1)                           # once: let the coin cell take over when power is removed
if rtc.lost_power():
    rtc.datetime((2026, 10, 21, 12, 0, 0))  # year, month, day, hour, minute, second
y, mo, d, wd, h, mi, s = rtc.datetime()      # wd: 0 = Sunday
print('%04d-%02d-%02d %02d:%02d:%02d' % (y, mo, d, h, mi, s))
```

## Gotchas
- **Backup switchover is disabled on delivery**: without `backup_mode(1)` the time is lost whenever power is removed, battery or not. The setting lives in EEPROM, so it only needs doing once.
- Use Direct Switching Mode (1) with the 1.55 V cell; Level Switching Mode (3) only switches when VBACKUP is above 2.0 V.
- PORF is set after power-up; `lost_power()` stays True until you set the time.
- The weekday register is just a 0-6 counter; the driver works it out from the date (0 = Sunday).
- Years are 2000-2099 only.

## Datasheet
https://www.microcrystal.com/fileadmin/Media/Products/RTC/App.Manual/RV-3028-C7_App-Manual.pdf
