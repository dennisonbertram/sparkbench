---
name: part-pca9685
description: Pinout, electrical limits, wiring and MicroPython driver for the PCA9685 16-channel 12-bit PWM / servo driver (NXP PCA9685). Use when designing, wiring, simulating or writing code for a PCA9685 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# PCA9685 16-channel PWM / servo driver (PCA9685)

## Overview
The **NXP PCA9685** generates 16 independent 12-bit PWM outputs from an internal 25 MHz oscillator, controlled over I2C. All channels share one frequency (24–1526 Hz), so it suits 50 Hz hobby servos or LED dimming (not both at once). Hobbyists buy it on the **Adafruit 16-Channel 12-bit PWM/Servo Driver (#815)** or its many clones: a 6-pin control header, 16 three-pin servo outputs, a V+ screw terminal and A0–A5 address jumpers.

## Pinout (Adafruit #815 control header, header order)
| Pin | Function |
|---|---|
| GND | Ground (logic and servos), must be connected |
| OE | Output enable, active low; pulled low on the board (optional) |
| SCL | I2C clock (10 kΩ pull-up to VCC on board) |
| SDA | I2C data (10 kΩ pull-up to VCC on board) |
| VCC | Logic supply 3–5 V for the chip; also feeds the pull-ups |
| V+ | Servo power in, 5–6 V, not used by the chip (optional) |

The same header is repeated on the opposite edge for chaining boards. Each of the 16 outputs is PWM / V+ / GND with a 220 Ω series resistor on PWM.

## Electrical limits
- Chip supply 2.3–5.5 V; the board's VCC is specified 3–5 V. Supply current about 6 mA (10 mA max).
- Outputs sink up to 25 mA each (400 mA total through ground), 5.5 V tolerant.
- V+ is only routed to the servo connectors: 5–6 V typically, never tie it to VCC.
- I2C up to 1 MHz (Fm+).

## Interface details
- **I2C address 0x40** default (A0–A5 jumpers give 0x40–0x7F); LED All Call address 0x70.
- Registers: MODE1 0x00 (power-on 0x11: asleep, ALLCALL), MODE2 0x01 (0x04, totem-pole), channel n at **0x06 + 4n**: ON_L, ON_H, OFF_L, OFF_H (12-bit counts out of 4096). Bit 4 of ON_H = fully on, bit 4 of OFF_H = fully off (power-on default). ALL_LED at 0xFA–0xFD. PRE_SCALE at 0xFE.
- **Frequency**: prescale = round(25 MHz / (4096 × f)) − 1, clamped to 3..255 (50 Hz → 121, power-on 30 = 200 Hz). PRE_SCALE can only be written while MODE1 SLEEP (bit 4) is set.
- After clearing SLEEP, wait **500 µs** before writing PWM registers. Set MODE1 AI (bit 5) to auto-increment through the four channel bytes.
- Servo pulse counts = pulse_µs × f × 4096 / 1 000 000 (1.5 ms at 50 Hz → 307).

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22; servo supply 5–6 V → V+, its ground → GND.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5; servo supply → V+.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from pca9685 import PCA9685
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
pwm = PCA9685(i2c, freq=50)
pwm.pulse_us(0, 1500)   # servo on channel 0 to centre
pwm.servo(1, 90)        # or by angle (default 500-2500 us range)
pwm.duty(2, 2048)       # 50 % on channel 2
pwm.off(3)
```

## Gotchas
- Never power servos from the microcontroller's 3.3 V pin: use a separate 5–6 V supply on V+ with a shared GND.
- The internal oscillator is only nominally 25 MHz (real chips are often a few % off): measure and pass `osc=` if servo timing must be exact.
- Writing PRE_SCALE while awake is silently ignored; the driver sleeps, writes, wakes and waits 500 µs.
- Every channel shares one frequency: LEDs and servos on the same board both run at the servo frequency.
- Check your servo's pulse range before driving it to the ends; 500–2500 µs is wider than many servos accept.

## Datasheet
https://www.nxp.com/docs/en/data-sheet/PCA9685.pdf
