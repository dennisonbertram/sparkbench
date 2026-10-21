---
name: part-at24c32
description: Pinout, electrical limits, wiring and MicroPython driver for the AT24C32 32 Kbit (4 KB) I2C serial EEPROM (Atmel/Microchip AT24C32, DIP-8). Use when designing, wiring, simulating or writing code for an AT24C32 / 24C32 EEPROM in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build, e.g. to keep settings or counters with the power off.
---

# AT24C32 32 Kbit I2C EEPROM (AT24C32)

## Overview
The **AT24C32** (Atmel, now Microchip) is a 32 Kbit = 4096 × 8 byte non-volatile memory on the I2C bus. Data stays put with the power off (100 years retention, about 1,000,000 writes per byte). Hobbyists buy it as a **bare DIP-8 chip** (AT24C32-10PU-2.7 / AT24C32N) that plugs straight into a breadboard; the same chip sits on DS3231/DS1307 RTC modules.

## Pinout (DIP-8, pin order)
| Pin | Name | Function |
|---|---|---|
| 1 | A0 | Address input, tie to GND (or VCC for another address) |
| 2 | A1 | Address input, tie to GND |
| 3 | A2 | Address input, tie to GND |
| 4 | GND | Ground |
| 5 | SDA | I2C data, open-drain: needs a pull-up |
| 6 | SCL | I2C clock: needs a pull-up |
| 7 | WP | Write protect: GND = normal writes, VCC = writes to 0xC00-0xFFF blocked |
| 8 | VCC | Supply |

## Electrical limits
- Supply: 2.7–5.5 V (-2.7 version; -1.8 version 1.8–5.5 V). Absolute max 6.25 V.
- Current: up to 3 mA while writing, about 1 mA reading, a few µA standby.
- I2C: 100 kHz below 4.5 V, 400 kHz at 5 V (the datasheet's ratings).
- SDA/SCL pull-ups to VCC are required, 10 kΩ or less (4.7 kΩ is a good value). The chip has none of its own.

## Interface details
- **I2C address 0x50** with A2 A1 A0 = GND (0b1010 A2 A1 A0 → 0x50–0x57).
- Word address is 12 bits (0x000–0xFFF), sent as two bytes after the device address: (A11–A8), then (A7–A0).
- **Write**: address bytes + up to 32 data bytes, all inside one 32-byte page (pages start at multiples of 0x20). Past the page end the address wraps to the start of the same page and overwrites it.
- After the Stop the chip runs a self-timed write cycle, **tWR ≤ 10 ms** (20 ms on 1.8 V parts) and does not acknowledge its address until it is done: acknowledge polling (`writeto(addr, b'')` until no OSError).
- **Read**: write the two address bytes without a Stop, then a repeated-start read of any length. Reads roll over from 0xFFF to 0x000.
- A new chip reads 0xFF everywhere.

## Wiring
- ESP32: VCC → 3V3, GND/A0/A1/A2/WP → GND, SDA → D21, SCL → D22, 4.7 kΩ from SDA and from SCL to 3V3.
- Pico: VCC → 3V3(OUT), GND/A0/A1/A2/WP → GND, SDA → GP4, SCL → GP5, 4.7 kΩ pull-ups to 3V3.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5 (the Pi has 1.8 kΩ pull-ups built in).

## Using the driver
```python
from machine import I2C, Pin
from at24c32 import AT24C32
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
ee = AT24C32(i2c)            # 0x50
ee.write(0x0000, b'hello')   # split at page edges, waits out each write cycle
print(ee.read(0x0000, 5))    # b'hello'
```

## Gotchas
- Never let a single write cross a 32-byte page boundary: the driver splits writes for you, raw `writeto` does not.
- Do not access the chip within 10 ms of a write without polling for the ACK: it NACKs (OSError) while busy.
- Each byte wears out after about a million writes: save on change, not in a fast loop.
- Use `writeto(addr, addr_bytes, False)` + `readfrom` for reads: some MicroPython ports ignore `addrsize=16` in `readfrom_mem`.
- On a DS3231/DS1307 RTC module the EEPROM is often at 0x57 (A0–A2 pulled high), not 0x50: run `i2c.scan()`.
- In the Sparkbench simulator the memory starts at 0x00 rather than 0xFF and writes are instant; the page wrap is not modelled.

## Datasheet
https://ww1.microchip.com/downloads/en/DeviceDoc/doc0336.pdf
