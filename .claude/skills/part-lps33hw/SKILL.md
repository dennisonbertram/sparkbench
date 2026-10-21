---
name: part-lps33hw
description: Pinout, electrical limits, wiring and MicroPython driver for the LPS33HW water-resistant barometric pressure & temperature sensor (STMicroelectronics LPS33HW, Adafruit #4414). Use when designing, wiring, simulating or writing code for an LPS33HW in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# LPS33HW water-resistant pressure & temperature sensor (LPS33HW)

## Overview
The **LPS33HW** from STMicroelectronics is a MEMS absolute pressure sensor (260–1260 hPa, 24-bit, 4096 LSB/hPa, ±1 hPa absolute accuracy after one-point calibration) with a built-in temperature sensor (16-bit, 100 LSB/°C). The sensing element sits in a cylindrical metal port filled with water-resistant gel, so a tube or O-ring can be sealed over it and it survives wet or humid places. It talks I2C or SPI. Hobbyists buy it on the **Adafruit LPS33HW Water Resistant Pressure Sensor - STEMMA QT (#4414)**, which adds a 3.3 V regulator (AP2112K), BSS138 I2C level shifting with 10 kΩ pull-ups, two STEMMA QT connectors and an 8-pin header.

## Pinout (Adafruit #4414, header order as printed)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V (on-board 3.3 V regulator; use your board's logic voltage) |
| 3Vo | 3.3 V regulator output; leave unconnected |
| GND | Ground |
| SCK (part pin SCL) | I2C clock (SCL); SPI clock |
| SDO | I2C address select: open = 0x5D (10 kΩ pull-up), tied to GND = 0x5C; SPI data out |
| SDI (part pin SDA) | I2C data (SDA); SPI data in |
| CS | SPI chip select; leave open for I2C (pulled high on the board) |
| INT | Interrupt / data-ready output (3.3 V push-pull), optional |

Sparkbench names the SCK and SDI pins SCL and SDA (their I2C roles); on the board they are printed SCK and SDI.

## Electrical limits
- Chip VDD: 1.7–3.6 V (absolute max 4.8 V); the breakout's regulator takes 3–5 V on VIN.
- Current: about 15 µA at 1 Hz (3 µA in low-current mode), 1 µA power-down (plus the board's power LED).
- I2C up to 400 kHz.
- Pressure range 260–1260 hPa; operating temperature −40 to +85 °C.

## Interface details
- **I2C address 0x5D** (SDO/SA0 high, the Adafruit default); 0x5C with SDO tied to GND.
- WHO_AM_I (0x0F) reads **0xB1**.
- The chip powers up in power-down mode (CTRL_REG1 0x10 = 0x00). Write an output data rate to CTRL_REG1 bits 6:4 (1/10/25/50/75 Hz = codes 1-5) for continuous mode; the driver writes 0x22 (10 Hz + BDU). Bit 7 must stay 0.
- STATUS (0x27): bit 0 P_DA, bit 1 T_DA = new pressure / temperature sample ready.
- Output registers: PRESS_OUT_XL/L/H at 0x28-0x2A, TEMP_OUT_L/H at 0x2B-0x2C. ST recommends single-byte reads with BDU = 1, reading PRESS_OUT_H last; the driver does exactly that.
- Pressure: 24-bit two's complement; **P = raw / 4096 hPa** (minus the RPDS offset in 0x18/0x19, 0 by default).
- Temperature: 16-bit two's complement; **T = raw / 100 °C**.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDI → D21 (SDA), SCK → D22 (SCL).
- Pico: VIN → 3V3(OUT), GND → GND, SDI → GP4 (SDA), SCK → GP5 (SCL).
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDI → pin 3 (SDA), SCK → pin 5 (SCL).
- Or just plug in a STEMMA QT / Qwiic cable.

## Using the driver
```python
from machine import I2C, Pin
from lps33hw import LPS33HW
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = LPS33HW(i2c)          # 0x5D, continuous at 10 Hz
p, t = sensor.read()
print('P=%.2fhPa T=%.2fC' % (p, t))
```
`altitude(sea_level_hpa)` gives an approximate height in metres.

## Gotchas
- Silkscreen uses SPI names: **SCK is SCL and SDI is SDA** in I2C mode.
- Leave CS unconnected (or high) for I2C; pulling it low switches the chip to SPI.
- No reading / `OSError` at 0x5D: check whether SDO is tied to GND (then use addr=0x5C).
- WHO_AM_I is 0xB1 on the LPS33HW, LPS35HW and LPS22HB alike, so it cannot tell them apart.
- The breakout itself is not waterproof: only the sensor port is gel-protected. Seal a tube/O-ring over the port or pot the board if it will get wet.
- Under water the reading includes the water column (about 98 hPa per metre of fresh water).

## Datasheet
https://www.st.com/resource/en/datasheet/lps33hw.pdf
