---
name: part-mcp23008
description: Pinout, electrical limits, wiring and MicroPython driver for the MCP23008 8-bit I2C I/O expander (MCP23008-E/P). Use when designing, wiring, simulating or writing code for an MCP23008 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MCP23008 8-bit I/O expander (MCP23008-E/P)

## Overview
The Microchip **MCP23008** adds eight general-purpose I/O pins (GP0–GP7) over I2C. Each pin is an input (with an optional weak pull-up) or an output that can light an LED. An INT pin can signal input changes. Hobbyists buy it as the bare **18-pin DIP chip** (Adafruit product 593, SparkFun COM-15099). It plugs straight into a breadboard. There is no common pre-made breakout board, so you add the few parts the chip needs yourself (see Wiring).

## Pinout (PDIP-18, pin 1 next to the notch, counting anticlockwise from the top)
| Pin | Name | Function |
|---|---|---|
| 1 | SCL | I2C clock |
| 2 | SDA | I2C data |
| 3 | A2 | Address bit 2: tie to GND or VDD |
| 4 | A1 | Address bit 1: tie to GND or VDD |
| 5 | A0 | Address bit 0: tie to GND or VDD |
| 6 | RESET | Active-low reset: tie to VDD |
| 7 | NC | Not connected |
| 8 | INT | Interrupt output (optional) |
| 9 | VSS | Ground |
| 10–17 | GP0–GP7 | I/O pins |
| 18 | VDD | Supply |

## Electrical limits
- Supply: 1.8–5.5 V (2.7 V or more for 400 kHz I2C; Adafruit specifies 2.7–5.5 V). The I/O pins swing to VDD, so at 3.3 V the chip is safe to connect to an ESP32 or a Pico.
- Supply current ≤ 1 mA; standby ≤ 1 µA.
- Each pin: 25 mA max (absolute), VDD pin 125 mA, VSS pin 150 mA in total.
- Weak pull-ups: 40–115 µA (75 µA typical at 5 V).

## Interface details
- **I2C address 0b0100 A2 A1 A0**: 0x20 with A0–A2 on GND, up to 0x27. Up to 8 chips can share one bus.
- Registers: IODIR 0x00 (1 = input, resets to 0xFF), IPOL 0x01, GPINTEN 0x02, DEFVAL 0x03, INTCON 0x04, IOCON 0x05, GPPU 0x06 (1 = pull-up on), INTF 0x07, INTCAP 0x08, GPIO 0x09 (read the pin levels), OLAT 0x0A (output latch).
- Write a register: [reg, value]. Read one: write [reg], then read (the address pointer auto-increments unless IOCON.SEQOP = 1).
- Writing GPIO also writes OLAT. Reading OLAT returns the latch, not the pins, so do read-modify-write on OLAT.

## Wiring
- Always: A0, A1, A2 → GND (address 0x20); RESET → VDD; 0.1 µF from VDD to VSS; 4.7 kΩ pull-ups from SDA and SCL to VDD (the bare chip has none).
- ESP32: VDD → 3V3, VSS → GND, SDA → D21, SCL → D22.
- Pico: VDD → 3V3(OUT), VSS → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), VSS → pin 6, SDA → pin 3, SCL → pin 5 (the Pi already has 1.8 kΩ pull-ups).
- LED: GPn → 330 Ω → LED → GND. Button: GPn → button → GND, with the pull-up turned on.

## Using the driver
```python
from machine import I2C, Pin
from mcp23008 import MCP23008, INPUT, OUTPUT
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
io = MCP23008(i2c, 0x20)
io.setup(0, OUTPUT)
io.setup(7, INPUT, pullup=True)
io.output(0, io.input(7) == 0)   # LED on while the button is pressed
```

## Gotchas
- If A0–A2 or RESET float, the chip drops off the bus or resets at random. Tie them to a rail.
- If the chip is missing from `i2c.scan()`, check the pull-ups, the address pins and that RESET is high.
- A pressed button with the pull-up on reads 0.
- In Sparkbench's simulator, GP0–GP7 show their OLAT bits and a toggle drives GP7. Reading GPIO back for an output pin is not modelled, so read outputs from OLAT.

## Datasheet
https://ww1.microchip.com/downloads/en/DeviceDoc/MCP23008-MCP23S08-Data-Sheet-20001919F.pdf
