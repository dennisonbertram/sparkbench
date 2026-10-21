---
name: part-mcp3208
description: Pinout, electrical limits, wiring and MicroPython driver for the MCP3208 8-channel 12-bit SPI analog-to-digital converter (Microchip MCP3208, DIP-16). Use when designing, wiring, simulating or writing code for an MCP3208 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MCP3208 8-channel 12-bit SPI ADC (MCP3208)

## Overview
The **MCP3208** from Microchip is a 12-bit SAR analog-to-digital converter with 8 single-ended inputs (or 4 pseudo-differential pairs) and an SPI interface, up to 100 ksps at 5 V (50 ksps at 2.7 V). Hobbyists buy the bare **MCP3208-CI/P in a DIP-16 package** and plug it straight into a breadboard. It is the 12-bit big brother of the MCP3008; the command is the same but the reply has 12 bits instead of 10.

## Pinout (DIP-16, pin 1 next to the notch)
| Pin | Name | Function |
|---|---|---|
| 1-8 | CH0-CH7 | Analog inputs, 0 V to VREF |
| 9 | DGND | Digital ground |
| 10 | CS/SHDN | Chip select / shutdown, active low |
| 11 | DIN | SPI data in (MOSI) |
| 12 | DOUT | SPI data out (MISO) |
| 13 | CLK | SPI clock |
| 14 | AGND | Analog ground |
| 15 | VREF | Reference voltage input (full scale) |
| 16 | VDD | Supply, 2.7-5.5 V |

## Electrical limits
- Supply: 2.7-5.5 V; about 320 uA running at 5 V, 0.5 uA standby.
- Inputs: VSS to VREF for valid codes; never more than VDD + 0.6 V or below -0.6 V.
- SPI clock: 1 MHz max at VDD 2.7 V, 2 MHz at 5 V; keep it above about 10 kHz so the sample doesn't droop.
- Source impedance: above about 1 kohm, lower the clock (datasheet Figure 4-2) or buffer the signal.

## Interface details
- SPI mode 0,0 (or 1,1), MSB first. Each conversion starts on a CS falling edge; take CS high after it.
- Datasheet 8-bit-aligned transfer (Figure 6-1), 3 bytes:
  - send `0x06 | (ch >> 2)`, `(ch & 3) << 6`, `0x00` for single-ended channel ch (0x04 | (ch >> 2) for pseudo-differential, Table 5-2);
  - receive: byte 1 = `? ? ? 0 B11 B10 B9 B8`, byte 2 = `B7..B0`, so code = `(rx[1] & 0x0F) << 8 | rx[2]`.
- Code = 4096 x VIN / VREF (Equation 4-1); volts = code x VREF / 4096.

## Wiring
- ESP32: VDD and VREF -> 3V3, AGND and DGND -> GND, CLK -> D18, DOUT -> D19, DIN -> D23, CS/SHDN -> D5.
- Pico: VDD and VREF -> 3V3(OUT), AGND and DGND -> GND, CLK -> GP18, DOUT -> GP16, DIN -> GP19, CS/SHDN -> GP17.
- Raspberry Pi 4: VDD and VREF -> pin 1 (3.3 V), grounds -> pin 6, CLK -> pin 23, DOUT -> pin 21, DIN -> pin 19, CS/SHDN -> pin 24 (CE0).
- 1 uF ceramic from VDD to AGND right at the chip.

## Using the driver
```python
from machine import Pin, SPI
from mcp3208 import MCP3208
spi = SPI(1, baudrate=1000000, polarity=0, phase=0, sck=Pin(18), mosi=Pin(23), miso=Pin(19))
adc = MCP3208(spi, 5, vref=3.3)
raw = adc.read_raw(0)
print('CH0=%d %.3fV' % (raw, adc.raw_to_volts(raw)))
```

## Gotchas
- Powered at 5 V, DOUT swings to 5 V: run it from 3.3 V with an ESP32 or Pico.
- Mask the reply: the top three bits of the second byte are undefined (high-Z), only the low nibble is data.
- VREF sets the scale; if it isn't tied to anything, readings are garbage.
- If it was powered up with CS low, CS must go high and low again before the first conversion.

## Datasheet
https://ww1.microchip.com/downloads/en/DeviceDoc/21298e.pdf
