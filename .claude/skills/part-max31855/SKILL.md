---
name: part-max31855
description: Pinout, electrical limits, wiring and MicroPython driver for the MAX31855 K-type thermocouple amplifier (MAX31855K). Use when designing, wiring, simulating or writing code for a MAX31855 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MAX31855 K-type thermocouple amplifier (MAX31855)

## Overview
The **MAX31855K** (Maxim / Analog Devices) is a cold-junction-compensated thermocouple-to-digital converter. It reads a K-type thermocouple from about −200 °C to +1350 °C with 0.25 °C resolution, measures its own die temperature (the cold junction) with 0.0625 °C resolution, and flags an open, shorted-to-GND or shorted-to-VCC thermocouple. It is read-only SPI. Hobbyists buy it on the **Adafruit MAX31855 Thermocouple Amplifier breakout (#269, v2)**, which adds a 3.3 V regulator, level shifting on CLK/CS, a 2-pin screw terminal for the thermocouple and a 6-pin header.

## Pinout (Adafruit #269 v2, header order as printed)
| Pin | Function |
|---|---|
| Vin | Supply, 3–5 V DC (on-board 3.3 V regulator) |
| 3Vo | 3.3 V output of the regulator (up to 100 mA); leave unconnected |
| GND | Ground |
| DO | Data out (SPI MISO) |
| CS | Chip select, active low |
| CLK | SPI clock |

The thermocouple goes in the screw terminal: **yellow (+) and red (−)** for US-coloured K-type wire.

## Electrical limits
- Chip VCC: 3.0–3.6 V (absolute max 4.0 V); the breakout's regulator accepts 3–5 V on Vin.
- Current: 0.9 mA typical, 1.5 mA max.
- SCK up to 5 MHz. DO swings 0–3.3 V, safe for ESP32 / Pico / Pi GPIOs.
- K-type thermocouples only (the MAX31855K is trimmed for K).

## Interface details
- SPI mode 0 (CPOL 0, CPHA 0), MSB first, read only (no MOSI). Pull CS low and clock out 32 bits:
  - D31–D18: signed 14-bit thermocouple temperature, **0.25 °C/LSB**
  - D17: reserved (0); D16: fault (1 if any of the three fault bits is set)
  - D15–D4: signed 12-bit internal (cold-junction) temperature, **0.0625 °C/LSB**
  - D3: reserved (0); D2: SCV (short to VCC); D1: SCG (short to GND); D0: OC (open circuit)
- Conversions run continuously (70 ms typical, 100 ms max) and only update while CS is high, so don't read faster than every 100 ms.
- Allow 200 ms after power-up before the first valid thermocouple reading.

## Wiring
- ESP32: Vin → 3V3, GND → GND, CLK → GPIO18, DO → GPIO19, CS → GPIO5.
- Pico: Vin → 3V3(OUT), GND → GND, CLK → GP18 (SPI0 SCK), DO → GP16 (SPI0 RX), CS → GP17.
- Raspberry Pi 4: Vin → pin 1 (3.3 V), GND → pin 6, CLK → pin 23 (SCLK), DO → pin 21 (MISO), CS → pin 29 (GPIO5).

## Using the driver
```python
from machine import Pin, SPI
from max31855 import MAX31855
spi = SPI(1, baudrate=1000000, polarity=0, phase=0, sck=Pin(18), mosi=None, miso=Pin(19))
tc = MAX31855(spi, 5)
t, cj = tc.read()
print('TC=%.2fC CJ=%.4fC' % (t, cj))
```
`read()` raises `OSError` naming the fault (open circuit, short to GND, short to VCC).

## Gotchas
- An "open circuit" fault almost always means the thermocouple isn't screwed in tightly.
- Readings that fall as the probe heats mean the thermocouple wires are swapped: yellow to +, red to −.
- Grounded-tip probes touching grounded metal cause SCG faults and noisy readings; use an insulated (ungrounded) probe.
- Keep the board away from heat sources: it measures the cold junction on the chip itself.
- Several MAX31855s can share CLK and DO; give each its own CS pin.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/MAX31855.pdf
