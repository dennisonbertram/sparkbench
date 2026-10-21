---
name: part-mcp3004
description: Pinout, electrical limits, wiring and MicroPython driver for the MCP3004 4-channel 10-bit SPI analog-to-digital converter (Microchip MCP3004, DIP-14). Use when designing, wiring, simulating or writing code for an MCP3004 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MCP3004 4-channel 10-bit SPI ADC (MCP3004)

## Overview
The **MCP3004** from Microchip is a 10-bit SAR analog-to-digital converter with 4 single-ended inputs (or 2 pseudo-differential pairs) and an SPI interface, up to 200 ksps at 5 V (75 ksps at 2.7 V). Hobbyists buy the bare **MCP3004-I/P in a DIP-14 package** and plug it straight into a breadboard. It is the 4-channel sibling of the MCP3008 and uses the same command frame.

## Pinout (DIP-14, pin 1 next to the notch)
| Pin | Name | Function |
|---|---|---|
| 1-4 | CH0-CH3 | Analog inputs, 0 V to VREF |
| 5, 6 | NC | Not connected |
| 7 | DGND | Digital ground |
| 8 | CS/SHDN | Chip select / shutdown, active low |
| 9 | DIN | SPI data in (MOSI) |
| 10 | DOUT | SPI data out (MISO) |
| 11 | CLK | SPI clock |
| 12 | AGND | Analog ground |
| 13 | VREF | Reference voltage input (full scale) |
| 14 | VDD | Supply, 2.7-5.5 V |

## Electrical limits
- Supply: 2.7-5.5 V; about 425 uA running at 5 V (225 uA at 2.7 V), 5 nA standby.
- Inputs: VSS to VREF for valid codes; never more than VDD + 0.6 V or below -0.6 V.
- SPI clock: 1.35 MHz max at VDD 2.7 V, 3.6 MHz at 5 V; keep it above about 10 kHz so the sample doesn't droop.
- Source impedance: high-impedance sources need a slower clock or a buffer (datasheet Section 4.1).

## Interface details
- SPI mode 0,0 (or 1,1), MSB first. Each conversion starts on a CS falling edge; CS must go high between conversions.
- Datasheet 8-bit-aligned transfer (Figure 6-1), 3 bytes:
  - send `0x01`, `0x80 | (ch << 4)`, `0x00` for single-ended channel ch (`ch << 4` without 0x80 for pseudo-differential, Table 5-1);
  - receive: byte 1 = `? ? ? ? ? 0 B9 B8`, byte 2 = `B7..B0`, so code = `(rx[1] & 0x03) << 8 | rx[2]`.
- Code = 1024 x VIN / VREF (Equation 4-2); volts = code x VREF / 1024.

## Wiring
- ESP32: VDD and VREF -> 3V3, AGND and DGND -> GND, CLK -> D18, DOUT -> D19, DIN -> D23, CS/SHDN -> D5.
- Pico: VDD and VREF -> 3V3(OUT), AGND and DGND -> GND, CLK -> GP18, DOUT -> GP16, DIN -> GP19, CS/SHDN -> GP17.
- Raspberry Pi 4: VDD and VREF -> pin 1 (3.3 V), grounds -> pin 6, CLK -> pin 23, DOUT -> pin 21, DIN -> pin 19, CS/SHDN -> pin 24 (CE0).
- 1 uF ceramic from VDD to AGND right at the chip. Leave pins 5 and 6 unconnected.

## Using the driver
```python
from machine import Pin, SPI
from mcp3004 import MCP3004
spi = SPI(1, baudrate=1000000, polarity=0, phase=0, sck=Pin(18), mosi=Pin(23), miso=Pin(19))
adc = MCP3004(spi, 5, vref=3.3)
raw = adc.read_raw(0)
print('CH0=%d %.3fV' % (raw, adc.raw_to_volts(raw)))
```

## Gotchas
- Powered at 5 V, DOUT swings to 5 V: run it from 3.3 V with an ESP32 or Pico.
- Mask the reply: only the low two bits of the second byte are data (the rest are high-Z and the null bit).
- VREF sets the scale; if it isn't tied to anything, readings are garbage.
- If it was powered up with CS low, CS must go high and low again before the first conversion.
- Only channels 0-3 exist; MCP3008 code asking for CH4-CH7 reads CH0-CH3 again (D2 is ignored).

## Datasheet
https://ww1.microchip.com/downloads/en/DeviceDoc/21295d.pdf
