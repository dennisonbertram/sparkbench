---
name: part-mcp3002
description: Pinout, electrical limits, wiring and MicroPython driver for the MCP3002 2-channel 10-bit SPI analog-to-digital converter (Microchip MCP3002, DIP-8). Use when designing, wiring, simulating or writing code for an MCP3002 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MCP3002 2-channel 10-bit SPI ADC (MCP3002)

## Overview
The **MCP3002** from Microchip is a 10-bit SAR analog-to-digital converter with 2 single-ended inputs (or 1 pseudo-differential pair) and an SPI interface, up to 200 ksps at 5 V (75 ksps at 2.7 V). Hobbyists buy the bare **MCP3002-I/P in a DIP-8 package** and plug it straight into a breadboard. It is the 2-channel little brother of the MCP3008, but its command is different (it has an MSBF bit) and it has **no separate VREF pin**: VDD is the reference.

## Pinout (DIP-8, pin 1 next to the notch)
| Pin | Name | Function |
|---|---|---|
| 1 | CS/SHDN | Chip select / shutdown, active low |
| 2 | CH0 | Analog input 0 |
| 3 | CH1 | Analog input 1 |
| 4 | VSS | Ground |
| 5 | DIN | SPI data in (MOSI) |
| 6 | DOUT | SPI data out (MISO) |
| 7 | CLK | SPI clock |
| 8 | VDD/VREF | Supply and reference, 2.7-5.5 V |

## Electrical limits
- Supply: 2.7-5.5 V (7 V absolute max); 525 uA typ / 650 uA max running at 5 V, about 5 nA standby.
- Inputs: VSS to VDD for valid codes; never more than VDD + 0.6 V or below -0.6 V.
- Pseudo-differential: IN- must stay within +-100 mV of VSS.
- SPI clock: 1.2 MHz max at VDD 2.7 V, 3.2 MHz at 5 V; keep it above about 10 kHz so the sample doesn't droop.
- Source impedance: above about 1 kohm, lower the clock (datasheet Figure 4-2) or buffer the signal.

## Interface details
- SPI mode 0,0 (or 1,1), MSB first. Each conversion starts on a CS falling edge; CS must go high between conversions.
- Datasheet 8-bit-aligned transfer (Figure 6-1), 2 bytes:
  - send `0 1 SGL/DIFF ODD/SIGN MSBF 0 0 0`, then `0x00`: `0x68` = CH0 single-ended, `0x78` = CH1 single-ended (`0x48` / `0x58` for pseudo-differential CH0-CH1 / CH1-CH0, Table 5-1);
  - receive: byte 0 = `? ? ? ? ? 0 B9 B8`, byte 1 = `B7..B0`, so code = `(rx[0] & 0x03) << 8 | rx[1]`.
- Keep MSBF = 1: with MSBF = 0 the chip appends the result again LSB first.
- Code = 1024 x VIN / VDD (Section 4.2); volts = code x VDD / 1024.

## Wiring
- ESP32: VDD/VREF -> 3V3, VSS -> GND, CLK -> D18, DOUT -> D19, DIN -> D23, CS/SHDN -> D5.
- Pico: VDD/VREF -> 3V3(OUT), VSS -> GND, CLK -> GP18, DOUT -> GP16, DIN -> GP19, CS/SHDN -> GP17.
- Raspberry Pi 4: VDD/VREF -> pin 1 (3.3 V), VSS -> pin 6, CLK -> pin 23, DOUT -> pin 21, DIN -> pin 19, CS/SHDN -> pin 24 (CE0).
- 1 uF ceramic from VDD/VREF to VSS right at the chip.

## Using the driver
```python
from machine import Pin, SPI
from mcp3002 import MCP3002
spi = SPI(1, baudrate=1000000, polarity=0, phase=0, sck=Pin(18), mosi=Pin(23), miso=Pin(19))
adc = MCP3002(spi, 5, vdd=3.3)
raw = adc.read_raw(0)
print('CH0=%d %.3fV' % (raw, adc.raw_to_volts(raw)))
```

## Gotchas
- VDD is the reference: readings scale with the supply, so a sagging or noisy 3.3 V rail shows up in every reading.
- Powered at 5 V, DOUT swings to 5 V: run it from 3.3 V with an ESP32 or Pico.
- Not command-compatible with the MCP3008/MCP3208: copying their 3-byte command gives wrong readings.
- Mask the reply: only the low 2 bits of the first byte are data.
- If it was powered up with CS low, CS must go high and low again before the first conversion.

## Datasheet
https://ww1.microchip.com/downloads/en/DeviceDoc/21294E.pdf
