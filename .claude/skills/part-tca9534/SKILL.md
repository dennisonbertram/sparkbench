---
name: part-tca9534
description: Pinout, electrical limits, wiring and MicroPython driver for the TCA9534 8-bit I2C I/O expander (Texas Instruments TCA9534, SparkFun Qwiic GPIO DEV-17047). Use when designing, wiring, simulating or writing code for a TCA9534 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TCA9534 8-bit I/O expander (TCA9534)

## Overview
The **TCA9534** from Texas Instruments adds 8 general-purpose pins (P0–P7) over I2C. Each pin is a high-impedance input or a push-pull output, and an open-drain INT output flags input changes. Unlike the TCA9554/PCF8574 it has **no internal pull-ups**, so inputs float unless you add a resistor. The modelled board is the **SparkFun Qwiic GPIO (DEV-17047)**: two Qwiic connectors, a 0.1" PTH row (GND, 3.3V, SDA, SCL) with a separate INT pad, and four 4-pin 5 mm latch terminals carrying P0–P7, INT, 3.3V and GND. Jumpers: I2C pull-ups (closed), INT 10 kΩ pull-up (closed), PWR LED (closed), ADR0–ADR2 (closed = address bit tied to 3.3V; opening lets a 2.2 kΩ pull-down make it 0).

## Pinout (header by header, from the SparkFun Eagle board file)
| Header | Pins in order |
|---|---|
| PTH row (J9) + INT pad (J7) | GND, 3V3, SDA, SCL, INT |
| Latch terminal J5 | INT, P0 ("0"), P1 ("1"), GND |
| Latch terminal J8 | GND, P2 ("2"), P3 ("3"), 3.3V |
| Latch terminal J1 | 3.3V, P4 ("4"), P5 ("5"), GND |
| Latch terminal J6 | GND, P6 ("6"), P7 ("7"), 3.3V |

- The GPIOs are silk-labelled just "0"–"7"; Sparkbench calls them P0–P7 (datasheet names). Repeated GND/3.3V/INT terminal pins are numbered (GND2, 3V3_2, INT2 …) and are the same nets.
- Connectors on several edges, so Sparkbench wires the board with jumper leads.

## Electrical limits
- Supply: 1.65–5.5 V (absolute max 6 V); SparkFun recommends 3.3 V (Qwiic). P-port pins are 5 V tolerant.
- Chip current: 8 µA typ / 19 µA max at 5.5 V with 400 kHz I2C; standby ~1.5 µA. The board's power LED adds about 1–2 mA.
- Per pin: 25 mA sink (Tj ≤ 65 °C), 10 mA source. Chip total: 200 mA through GND, 80 mA through VCC.

## Interface details
- **I2C address 0x20 + (A2 A1 A0)** → 0x20–0x27. The SparkFun board ships with ADR0–ADR2 closed → **0x27**. Cut a jumper to clear that bit (e.g. cut ADR0 → 0x26). 100 or 400 kHz.
- Command byte selects one register (datasheet Table 3):
  - 0x00 Input Port: pin levels (read-only)
  - 0x01 Output Port: output latches, power-up 0xFF
  - 0x02 Polarity Inversion: 1 = invert that input, power-up 0x00
  - 0x03 Configuration: 1 = input (power-up 0xFF), 0 = output
- Write: address, command byte, data. Read: write the command byte, repeated start, read 1 byte.
- INT goes low when an input differs from the last Input Port read; reading the Input Port clears it.

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22 (or a Qwiic cable).
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3V3 → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5.
- LED on an output: P0 → 330 Ω → LED → GND (use a terminal GND).
- Button on an input: P4 → button → GND **plus a 10 kΩ pull-up from P4 to a 3.3V terminal** (the chip has none). Released reads 1, pressed reads 0.

## Using the driver
```python
from machine import I2C, Pin
from tca9534 import TCA9534, INPUT, OUTPUT
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
io = TCA9534(i2c)        # 0x27 on the SparkFun board
io.value(0, 0)           # latch P0 low first...
io.pin_mode(0, OUTPUT)   # ...then make it an output
io.pin_mode(4, INPUT)    # P4
io.value(0, 1)           # P0 high
print(io.value(4))       # 0 while a button to GND is pressed (with external pull-up)
```
`read_port()` / `write_port()` / `config_port()` work on all 8 bits; `invert()` sets polarity inversion.

## Gotchas
- No internal pull-ups: an unconnected input floats and reads random values. Always add a pull-up or pull-down.
- Output latches power up at 1: set the level before switching a pin to output, or it glitches high.
- Default address is 0x27 on this board, not 0x20.
- The board's SDA/SCL pull-ups go to its 3.3V rail: power it from 3.3 V.
- The TCA9534A is a different chip with base address 0x38; the driver works for it with addr=0x38+A2A1A0.

## Datasheet
https://www.ti.com/lit/ds/symlink/tca9534.pdf
