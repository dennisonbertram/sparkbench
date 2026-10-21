---
name: part-max31856
description: Pinout, electrical limits, wiring and MicroPython driver for the MAX31856 universal thermocouple amplifier (Analog Devices / Maxim MAX31856, Adafruit #3263). Use when designing, wiring, simulating or writing code for a MAX31856 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MAX31856 universal thermocouple amplifier (MAX31856)

## Overview
The **MAX31856** (Maxim / Analog Devices) is a thermocouple-to-digital converter that works with **B, E, J, K, N, R, S and T** thermocouples. It measures its own die temperature for cold-junction compensation, linearizes the reading on chip and reports the hot-junction temperature in °C with 0.0078125 °C resolution (19 bits), plus the cold-junction temperature with 0.015625 °C resolution. It has 50/60 Hz mains filtering, open-thermocouple and over/undervoltage detection, and ±45 V input protection. Hobbyists buy it on the **Adafruit Universal Thermocouple Amplifier MAX31856 Breakout (#3263)**, which adds a 3.3 V regulator, level shifting, a 2-pin screw terminal for the thermocouple and a 9-pin header.

## Pinout (Adafruit #3263, header order as printed)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V DC (on-board 3.3 V regulator) |
| 3Vo | 3.3 V output of the regulator (up to 100 mA); leave unconnected |
| GND | Ground |
| SCK | SPI clock |
| SDO | SPI data out (to MISO) |
| SDI | SPI data in (from MOSI) |
| CS | Chip select, active low |
| FLT | Fault output, active low (optional) |
| DRDY | Data ready, active low (optional) |

The thermocouple goes in the screw terminal (+ and −). US-coloured K-type: **yellow to +, red to −**.

## Electrical limits
- Chip AVDD/DVDD: 3.0–3.6 V (absolute max 4.0 V); the breakout's regulator accepts 3–5 V on VIN, and its level shifters follow VIN.
- Current: 1.2 mA typical (2 mA max) while converting, 5 µA standby.
- SCK up to 5 MHz.
- Thermocouple inputs withstand ±45 V, but keep the probe isolated from mains.

## Interface details
- SPI with **CPHA = 1** (mode 1 or mode 3; the chip detects the clock polarity at CS fall), MSB first.
- First byte is the address: **0Xh = read, 8Xh = write**; the address auto-increments while CS stays low.
- Setup: CR0 (80h) = 0x10 (normally-off, open-circuit detection on, 60 Hz filter; set bit 0 for 50 Hz). CR1 (81h) = averaging in bits 6:4, type in bits 3:0 (B=0, E=1, J=2, **K=3**, N=4, R=5, S=6, T=7).
- 1-shot reading: write CR0 with bit 6 (1SHOT) set; the conversion starts when CS goes high and takes up to **155 ms (60 Hz)** or **185 ms (50 Hz)**, plus up to 15 ms open-circuit test and 33 ms / 40 ms per extra averaged sample.
- Thermocouple: read 0Ch–0Eh in one transfer; 19-bit two's complement in bits 23..5, **T = code × 0.0078125 °C**.
- Cold junction: read 0Ah–0Bh; 14-bit two's complement in bits 15..2, **T = code × 0.015625 °C**.
- Fault Status 0Fh: bit 0 open thermocouple, bit 1 input over/undervoltage, bits 2–7 range/threshold faults.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SCK → GPIO18, SDO → GPIO19, SDI → GPIO23, CS → GPIO5.
- Pico: VIN → 3V3(OUT), GND → GND, SCK → GP18, SDO → GP16, SDI → GP19, CS → GP17.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SCK → pin 23, SDO → pin 21 (MISO), SDI → pin 19 (MOSI), CS → pin 29 (GPIO5).

## Using the driver
```python
from machine import Pin, SPI
from max31856 import MAX31856
spi = SPI(1, baudrate=1000000, polarity=0, phase=1, sck=Pin(18), mosi=Pin(23), miso=Pin(19))
tc = MAX31856(spi, 5, tc_type='K', filter_hz=60)
t, cj = tc.read()
print('TC=%.2fC CJ=%.2fC' % (t, cj))
```
`read()` runs one conversion (about 0.2 s). `thermocouple()` raises `OSError` on an open thermocouple or input over/undervoltage.

## Gotchas
- SPI **phase must be 1**; mode 0 reads shifted garbage.
- Tell the driver the right thermocouple type: a J probe read as K gives a wrong temperature with no error.
- "Thermocouple open" almost always means the probe is not screwed in tightly.
- Readings that fall as the probe heats mean the thermocouple wires are swapped.
- Keep the board away from heat sources; the cold junction is measured on the chip.
- Several MAX31856s can share SCK/SDO/SDI; give each its own CS pin.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/MAX31856.pdf
