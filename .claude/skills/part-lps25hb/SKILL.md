---
name: part-lps25hb
description: Pinout, electrical limits, wiring and MicroPython driver for the LPS25HB barometric pressure & temperature sensor (STMicroelectronics LPS25HB, Adafruit LPS25 #4530). Use when designing, wiring, simulating or writing code for an LPS25HB in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LPS25HB barometric pressure & temperature sensor (LPS25HB)

## Overview
The **LPS25HB** from STMicroelectronics is a MEMS absolute pressure sensor (260–1260 hPa, 24-bit, 4096 LSB/hPa, ±0.1 hPa relative accuracy, ±1 hPa absolute) with a built-in temperature sensor (16-bit, 480 LSB/°C around a 42.5 °C zero point). It talks I2C or SPI. Hobbyists buy it on the **Adafruit LPS25 Pressure Sensor - STEMMA QT / Qwiic (#4530)**, which adds a 3.3 V regulator, I2C level shifting with 10 kΩ pull-ups, two STEMMA QT connectors and an 8-pin header.

## Pinout (Adafruit #4530, header order as printed)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (on-board 3.3 V regulator; use your board's logic voltage) |
| 3Vo | 3.3 V regulator output (up to 100 mA); leave unconnected |
| GND | Ground |
| SCK (part pin SCL) | I2C clock (SCL); SPI clock |
| SDO | I2C address select: open = 0x5D, tied to GND = 0x5C; SPI data out |
| SDI (part pin SDA) | I2C data (SDA); SPI data in |
| CS | SPI chip select; leave open for I2C (pulled high on the board) |
| INT | Interrupt / data-ready output, optional |

Sparkbench names the SCK and SDI pins SCL and SDA (their I2C roles); on the board they are printed SCK and SDI.

## Electrical limits
- Chip VDD: 1.7–3.6 V (absolute max 4.8 V); the breakout's regulator takes 3–5 V on VIN.
- Current: about 4 µA at 1 Hz in low-resolution mode, 25 µA at 1 Hz with the default high-resolution averaging, 0.5 µA power-down.
- I2C up to 400 kHz.
- Pressure range 260–1260 hPa; operating temperature −30 to +105 °C.

## Interface details
- **I2C address 0x5D** (SDO/SA0 high, the Adafruit default); 0x5C with SDO tied to GND.
- WHO_AM_I (0x0F) reads **0xBD**.
- The chip powers up in power-down mode (CTRL_REG1 0x20 = 0x00). Set PD (bit 7) and an output data rate in bits 6:4: 0x90 = 1 Hz, 0xA0 = 7 Hz, 0xB0 = 12.5 Hz, 0xC0 = 25 Hz.
- STATUS_REG (0x27): bit 1 P_DA, bit 0 T_DA = new pressure / temperature sample ready.
- **Auto-increment over I2C needs bit 7 of the register address set**: burst-read 5 bytes from **0xA8** (= 0x28 | 0x80): PRESS_OUT_XL, _L, _H, TEMP_OUT_L, _H.
- Pressure: 24-bit two's complement, low byte first; **P = raw / 4096 hPa**.
- Temperature: 16-bit two's complement, low byte first; **T = 42.5 + raw / 480 °C**.
- RES_CONF (0x10) sets internal averaging (default 0x0F = 512 pressure / 64 temperature samples, lowest noise).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDI → D21 (SDA), SCK → D22 (SCL).
- Pico: VIN → 3V3(OUT), GND → GND, SDI → GP4 (SDA), SCK → GP5 (SCL).
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDI → pin 3 (SDA), SCK → pin 5 (SCL).
- Or just plug in a STEMMA QT / Qwiic cable.

## Using the driver
```python
from machine import I2C, Pin
from lps25hb import LPS25HB
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = LPS25HB(i2c)          # 0x5D, continuous at 7 Hz
p, t = sensor.read()
print('P=%.2fhPa T=%.2fC' % (p, t))
```
`altitude(sea_level_hpa)` gives an approximate height in metres.

## Gotchas
- Silkscreen uses SPI names: **SCK is SCL and SDI is SDA** in I2C mode.
- Leave CS unconnected (or high) for I2C; pulling it low switches the chip to SPI.
- Reading several bytes from 0x28 without the 0x80 bit returns the same register repeatedly: garbage pressure.
- Forgetting PD=1 in CTRL_REG1 leaves the chip asleep and data-ready never comes.
- Temperature is **not** raw/100 like the LPS22HB: it is 42.5 + raw/480.
- No reading / `OSError` at 0x5D: check whether SDO is tied to GND (then use addr=0x5C).
- The temperature sensor reads the die, a little warmer than the air while powered.

## Datasheet
https://www.st.com/resource/en/datasheet/lps25hb.pdf
