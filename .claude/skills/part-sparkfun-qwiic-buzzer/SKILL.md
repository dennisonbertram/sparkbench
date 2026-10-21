---
name: part-sparkfun-qwiic-buzzer
description: Pinout, electrical limits, wiring and MicroPython driver for the SparkFun Qwiic Buzzer (BOB-24474; ATtiny84 I2C controller + CUI CBT-09427 magnetic buzzer, address 0x34). Use when designing, wiring, simulating or writing code for a Qwiic Buzzer in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SparkFun Qwiic Buzzer (BOB-24474)

## Overview
The **SparkFun Qwiic Buzzer** is a small magnetic buzzer (CUI **CBT-09427-SMT-TR**, 2730 Hz resonant, 16 Ω coil) driven by an **ATtiny84** running SparkFun's QwiicBuzzerFirmware. Over I2C you set a tone frequency in Hz, a duration in ms (0 = until stopped) and one of 4 volume levels, then switch it on. A blue STAT LED lights while it buzzes. Connect it with a Qwiic cable or the 0.1" headers; the headers sit on two opposite edges, so wire it with jumper leads rather than plugging it into a breadboard.

## Pinout (as printed on the board)
I2C header (one edge, J1):
| Pin | Function |
|---|---|
| SCL | I2C clock (2.2 kΩ pull-up to 3.3 V, I2C jumper) |
| SDA | I2C data (2.2 kΩ pull-up to 3.3 V, I2C jumper) |
| 3V3 | Supply, 3.3 V |
| GND | Ground |

Opposite edge (J6), optional:
| Pin | Function |
|---|---|
| RST | ATtiny84 reset, active low, 10 kΩ pull-up on board |
| TRIG | Trigger, active low (internal pull-up): low = buzz with stored settings, no I2C needed |
| GND | Ground (named GND2 in Sparkbench) |

## Electrical limits
- Supply: 3.3 V recommended (3.0–3.6 V; the buzzer itself needs 2.5 V after the transistor driver). No regulator; the I2C pull-ups go to 3V3, so never feed 5 V.
- Current: about 95 mA buzzing at full volume (buzzer rated 110 mA max at 3.6 V), a few mA idle.
- Volume is set by NPN transistors switching the buzzer's ground return through 330/100/0 Ω or the 2.2 kΩ (USER) resistor.

## Interface details
- **I2C address 0x34**, or any 0x08–0x77 written to register 0x0A (kept in EEPROM).
- Register map (write the register number, then read; writes store data from that register on):
  - `0x00` ID = **0x5E**; `0x01` firmware minor, `0x02` major (1.0).
  - `0x03`/`0x04` tone frequency in Hz, MSB/LSB (0 = rest, silent). Default 2730 Hz.
  - `0x05` volume 0 (off) … 4 (loudest). Default 4.
  - `0x06`/`0x07` duration in ms, MSB/LSB; 0 = buzz until turned off.
  - `0x08` active: write 1 to start, 0 to stop; the firmware clears it when a duration ends.
  - `0x09` save: write 1 to store frequency/volume/duration as power-on defaults.
- Changing frequency/volume/duration while active retriggers the tone with the new settings (used for melodies and sweeps).

## Wiring
- ESP32: 3.3V → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3.3V → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3.3V → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from qwiic_buzzer import QwiicBuzzer
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
bz = QwiicBuzzer(i2c)            # 0x34
bz.configure(1000, 0, 3)         # 1 kHz, until off, volume 3
bz.on(); bz.off()
bz.tone(440, 250)                # one A4 note for 250 ms (blocks)
```

## Gotchas
- Full volume is really loud; volume 1 is the quiet "USER" resistor level.
- Holding TRIG low for 1 s at power-up factory-resets frequency, volume, duration and address.
- With a duration set, `is_active()` drops back to False by itself when the note ends (the simulator keeps it on until `off()`).
- Many pulled-up Qwiic boards on one bus: cut the I2C jumper on all but one.

## Datasheet
https://github.com/sparkfun/SparkFun_Qwiic_Buzzer/blob/main/docs/assets/board_files/SparkFun_Qwiic_Buzzer_Schematic_V10.pdf (schematic) ·
https://docs.sparkfun.com/SparkFun_Qwiic_Buzzer/hardware_overview/ ·
https://github.com/sparkfun/SparkFun_Qwiic_Buzzer/tree/main/Firmware/QwiicBuzzerFirmware (firmware / register map) ·
https://github.com/sparkfun/SparkFun_Qwiic_Buzzer/blob/main/docs/assets/component_documentation/cbt-09427-smt-tr.pdf (buzzer)
