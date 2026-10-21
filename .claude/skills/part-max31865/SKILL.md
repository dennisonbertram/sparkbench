---
name: part-max31865
description: Pinout, electrical limits, wiring and MicroPython driver for the MAX31865 PT100/PT1000 RTD amplifier (MAX31865). Use when designing, wiring, simulating or writing code for a MAX31865 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MAX31865 PT100 RTD amplifier (MAX31865)

## Overview
The **MAX31865** from Analog Devices (formerly Maxim) is a resistance-to-digital converter for platinum RTDs. Its 15-bit ADC measures the ratio of the RTD's resistance to a precision reference resistor (RREF), and it detects open or shorted probe wires. It talks SPI. Hobbyists buy it on the **Adafruit PT100 RTD Temperature Sensor Amplifier - MAX31865 (product 3328)**, which has a 3.3 V regulator, level shifting for 3-5 V logic, a 430 Ω 0.1 % RREF and screw terminals for 2-, 3- or 4-wire probes.

## Pinout (Adafruit 3328, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3-5 V (into the on-board regulator) |
| GND | Ground |
| 3V3 | 3.3 V regulator output (up to 100 mA). Not an input: leave unconnected |
| CLK | SPI clock |
| SDO | SPI data out of the chip (MISO) |
| SDI | SPI data into the chip (MOSI) |
| CS | Chip select, active low |
| RDY | Data ready (DRDY), active low; optional |

## Electrical limits
- Chip: VDD/DVDD 3.0-3.6 V. The breakout: VIN 3-5 V.
- RREF on the board: 430 Ω (PT100 version), 4300 Ω (PT1000 version, product 3648).
- RTD inputs are protected to ±45 V.
- SPI up to 5 MHz, modes 1 and 3 only (CPHA = 1).

## Interface details
- Registers are read at address **0Xh** and written at **8Xh**. Config 00h/80h, RTD MSB/LSB 01h-02h, fault thresholds 03h-06h, Fault Status 07h.
- Config bits: D7 VBIAS, D6 auto conversion, D5 1-shot, D4 3-wire, D3:D2 fault-detect cycle, D1 fault clear, D0 50 Hz filter (0 = 60 Hz).
- 1-shot reading: write 80h = 0x80 (VBIAS on), wait about 10 ms, write 80h = 0xA0 (VBIAS + 1-shot). The conversion starts when CS goes high and takes 52 ms (60 Hz) or 62.5 ms (50 Hz). Then read 01h-02h.
- RTD data: bits 15..1 = 15-bit code, bit 0 = fault. **RRTD = code × RREF / 32768**.
- Temperature: use the Callendar-Van Dusen equation R(T) = R0(1 + aT + bT² + c(T − 100)T³) with a = 3.9083e-3, b = −5.775e-7, c = −4.183e-12 below 0 °C (0 above), R0 = 100 Ω for PT100.

## Wiring
- ESP32: VIN → 3V3, GND → GND, CLK → GPIO18, SDO → GPIO19, SDI → GPIO23, CS → GPIO5.
- Pico: VIN → 3V3(OUT), GND → GND, CLK → GP18, SDI → GP19, SDO → GP16, CS → GP17 (SPI0 pins).
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, CLK → pin 23 (SCLK), SDO → pin 21 (MISO), SDI → pin 19 (MOSI), CS → pin 24 (CE0).
- Probe: PT100 to the terminal blocks. The board ships wired for 4-wire probes. For 3-wire, change the solder jumpers as Adafruit describes and pass `wires=3`.

## Using the driver
```python
from machine import Pin, SoftSPI
from max31865 import MAX31865
spi = SoftSPI(baudrate=1000000, polarity=0, phase=1, sck=Pin(18), mosi=Pin(23), miso=Pin(19))
rtd = MAX31865(spi, 5, rref=430.0, r0=100.0, wires=4)
r, t = rtd.read()
print('R=%.2f T=%.2fC' % (r, t))
```

## Gotchas
- SPI mode 0 does not work. Use `phase=1`.
- Set `rref` to the resistor that is actually fitted: 430 Ω on Adafruit boards (marked "4300" or "431"). Clone boards may fit a different value (some fit 400 Ω, marked "4000" or "401"), so check the board before trusting the reading.
- A fault bit (OSError from the driver) usually means an open probe wire, or that the 2/3/4-wire jumpers don't match the probe.
- 2-wire probes read high by the lead resistance (0.4 Ω ≈ 1 °C). Use 3- or 4-wire probes for long cables.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/MAX31865.pdf
