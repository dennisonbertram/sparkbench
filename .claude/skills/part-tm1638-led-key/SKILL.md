---
name: part-tm1638-led-key
description: Pinout, electrical limits, wiring and MicroPython driver for the TM1638 LED&KEY module (Titan Micro TM1638, 8 seven-segment digits, 8 LEDs, 8 push buttons, STB/CLK/DIO). Use when designing, wiring, simulating or writing code for a TM1638 LED&KEY board in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TM1638 LED&KEY module (TM1638)

## Overview
The **TM1638** from Titan Micro drives up to 10 segments x 8 grids of LEDs with 8 brightness steps and scans a 3 x 8 key matrix, over a three-wire STB/CLK/DIO serial bus. Hobbyists buy it as the blue **"LED&KEY"** clone module: eight 0.36" red common-cathode digits, eight red LEDs (LED1-LED8) and eight buttons (S1-S8), with a 5-pin header J1.

## Pinout (J1, header order)
| Pin | Function |
|---|---|
| VCC | Supply 5 V (datasheet VDD 4.5-5.5 V) |
| GND | Ground |
| STB | Strobe / chip select, low during a transfer (10k pull-up to VCC) |
| CLK | Clock, idles high, data latched on rising edge (10k pull-up to VCC) |
| DIO | Data in/out, LSB first; open-drain output when reading keys (10k pull-up to VCC) |

## Electrical limits
- Chip datasheet: VDD 5 V +/-10 % (4.5-5.5 V), absolute maximum 7 V; logic high needs >= 0.7 x VDD (3.5 V at 5 V). The datasheet says the TM1638 "should be used in 5V" because the LEDs need about 3 V to turn on; 3.3 V operation is outside the datasheet and not guaranteed.
- The board pulls STB, CLK and DIO up to VCC with 10k: with a 3.3 V board (ESP32, Pico, Raspberry Pi) power the module from **5 V** and put a bidirectional level shifter (BSS138 type) on STB, CLK and DIO so the GPIOs never see 5 V.
- Current: over 100 mA with all digits and LEDs lit at full brightness (about 150 mA budget).
- Timing: clock pulse width >= 400 ns (max 1 MHz), STB high >= 1 us, >= 1 us between the 0x42 read command and the first clock of the key data.

## Interface details
- STB falling starts a transfer; the first byte is a command. Bytes go **LSB first**, latched on CLK rising.
- Data command **0x40** (write, auto-increment), **0x44** (write, fixed address), **0x42** (read keys).
- Address command **0xC0 | addr** (00H-0FH) followed by data bytes.
- Display control **0x88 | brightness** (0-7 = 1/16 ... 14/16 pulse width); **0x80** = display off. Nothing lights until it is sent.
- RAM: even addresses 0x00, 0x02 ... 0x0E = digits 1-8 left to right (bit0 = a ... bit6 = g, bit7 = DP); odd addresses 0x01 ... 0x0F = LED1-LED8 (bit 0, wired to SEG9).
- Keys: 4 bytes after 0x42. Every button is on K3: S1-S4 sit on KS1/KS3/KS5/KS7 (bit 0 of bytes 1-4), S5-S8 on KS2/KS4/KS6/KS8 (bit 4 of bytes 1-4).

## Wiring
All three boards use 3.3 V logic: STB, CLK and DIO go through a bidirectional level shifter (LV side 3.3 V, HV side 5 V).
- ESP32: VCC -> 5V/VIN, GND -> GND, STB -> D25, CLK -> D26, DIO -> D27 (via the shifter).
- Pico: VCC -> VBUS (5 V, pin 40), GND -> GND, STB -> GP2, CLK -> GP3, DIO -> GP6 (via the shifter).
- Raspberry Pi 4: VCC -> pin 2 (5 V), GND -> pin 6, STB -> GPIO23 (pin 16), CLK -> GPIO24 (pin 18), DIO -> GPIO25 (pin 22) (via the shifter).

## Using the driver
```python
from tm1638 import TM1638
tm = TM1638(25, 26, 27, brightness=3)  # STB, CLK, DIO GPIO numbers
tm.number(2026)            # right aligned, -9999999..99999999
tm.show('HELLO')           # letters it can draw, '.' lights a decimal point
tm.led(4, 1)               # LED5 on (index 0-7)
tm.leds(0b10101010)        # all LEDs from a mask, bit 0 = LED1
print(hex(tm.keys()))      # bit 0 = S1 ... bit 7 = S8
tm.brightness(1)
```

## Gotchas
- Not SPI: DIO is one bidirectional line. Release it (input) before clocking in key data, and drive it again afterwards.
- Keep STB low between the 0x42 command and the four key bytes; read all four bytes in order (the chip allows no more).
- Several modules can share CLK and DIO with a separate STB each.
- Wiring a 5 V module straight to a 3.3 V board puts 5 V on the GPIOs through the board's pull-ups, and 3.3 V is below the 3.5 V logic-high threshold at 5 V: use the level shifter.
- Other TM1638 boards (QYF "16 KEY", LKM1638 bi-colour) wire the RAM and keys differently; this driver is for LED&KEY.

## Datasheet
https://raw.githubusercontent.com/mcauser/micropython-tm1638/master/docs/TM1638.pdf
