---
name: part-ec11-rotary-encoder
description: Pinout, electrical limits, wiring and MicroPython driver for the bare EC11 rotary encoder with push switch (Alps Alpine EC11E15244B2, 5 pins A/C/B + D/E, quadrature, 30 detents / 15 pulses). Use when designing, wiring, simulating or writing code for a bare EC11 encoder in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# EC11 rotary encoder with push switch (Alps Alpine EC11E15244B2)

## Overview
The **EC11** is the 11 mm metal-shaft incremental rotary encoder that most knob modules (KY-040 and friends) are
built around. Bought bare it is **just switch contacts, no electronics**:
- Two encoder contacts **A–C** and **B–C** (C = common) that open and close in **2-phase Gray code (quadrature)**
- A momentary **push switch D–E** (SPST, closes when the shaft is pressed)
- EC11E15244B2: **30 detents (clicks) and 15 pulses per turn**, switch travel 1.5 mm, 360° continuous
- Ratings: encoder **10 mA max / 1 mA min at 5 V DC**; switch 0.1 A 5 V DC, **500 µA min**
- Chattering 3 ms max, bounce 2 ms max (measured with R = 5 kΩ)

## Pinout (as printed on the Alps drawing)
Viewed from the mounting side: A, C, B in a row at 2.5 mm pitch; D and E 5 mm apart on the opposite side
(7.5 mm away), plus two mounting tabs. It does not sit in one breadboard row: wire it with jumper leads
(or solder leads and panel-mount it).

| Pin | Name | Function |
|-----|------|----------|
| 1 | A | Encoder contact A, closes to C. GPIO with 3.3 kΩ pull-up to 3.3 V; reads 0 while closed |
| 2 | C | Encoder common: connect to GND |
| 3 | B | Encoder contact B, closes to C. GPIO with 3.3 kΩ pull-up to 3.3 V |
| 4 | D | Push switch terminal: GPIO with pull-up (4.7 kΩ); reads 0 while pressed |
| 5 | E | Other push switch terminal: connect to GND |

## Electrical limits
- No supply pin. The pull-up voltage sets the signal level: pull up to **3.3 V** on an ESP32 / Pico, never 5 V.
- Encoder contacts: 1–10 mA. With 3.3 V, 3.3 kΩ gives 1 mA; the GPIO's internal ~50 kΩ pull-up alone gives
  about 66 µA, below the datasheet minimum, so contacts can read unreliably as they wear or oxidise.
- Switch: at least 0.5 mA (4.7 kΩ at 3.3 V = 0.7 mA).
- Do not run loads through the contacts.

## Interface details
Datasheet output wave, CW direction (seen from the shaft): **A changes before B**. Detent stability points alternate
between both open (A=1, B=1) and both closed (A=0, B=0), so each click is **half a quadrature cycle (2 edges)**:
`(A,B) 11 → 01 → 00 → 10 → 11` = two clockwise clicks. Counter-clockwise is the reverse.
- Decode every edge of both lines with a state table: a bounce goes forward then back and cancels out.
- Alps' example filter: 10 kΩ pull-up, then 10 kΩ series + 0.01 µF to GND on each of A and B (optional, cuts chatter).
- Push switch: reads 0 while pressed.

## Wiring
| Encoder | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| A (+3.3 kΩ to 3V3) | GPIO32 | GP14 (pin 19) | GPIO17 (pin 11) |
| C | GND | GND | GND |
| B (+3.3 kΩ to 3V3) | GPIO33 | GP15 (pin 20) | GPIO27 (pin 13) |
| D (+4.7 kΩ to 3V3) | GPIO25 | GP13 (pin 17) | GPIO22 (pin 15) |
| E | GND | GND | GND |

## Using the driver
```python
from ec11 import EC11
import time
enc = EC11(32, 33, 25)      # GPIOs wired to A, B, D
while True:
    print('pos=%d btn=%d' % (enc.position(), enc.pressed()))
    time.sleep_ms(200)
```
The driver uses pin interrupts on both edges of A and B and a full Gray-code state table. `position()` returns
clicks turned (clockwise positive), `reset()` zeroes it, `pressed()` is True while the shaft is pushed.
Default `steps_per_detent=2` matches the 30-detent / 15-pulse EC11E15244B2; use 4 for encoders with one full
pulse per click (e.g. 20 detents / 20 pulses). `use_irq=False` plus frequent `update()` calls polls instead.

## Gotchas
- **Never pull the contacts up to 5 V** on a 3.3 V board.
- **Floating pins**: without pull-ups A, B and D float when open. Fit the resistors (or at least `Pin.PULL_UP`).
- **Counts jump by 2 per click or need two clicks per count**: wrong `steps_per_detent` for your encoder.
- Direction backwards? Swap A and B (or negate the position).
- C and E are separate: the switch is not connected to the encoder common inside the part; ground both.
- Long `sleep`s in a polling loop lose steps when turned fast: use the interrupt mode.

## Datasheet
Alps Alpine EC11E series catalog: https://tech.alpsalpine.com/cms.media/product_catalog_ec_01_ec11e_en_611f078659.pdf
Product page (output wave, ratings): https://tech.alpsalpine.com/e/products/detail/EC11E15244B2/
