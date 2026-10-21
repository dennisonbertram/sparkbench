---
name: part-sparkfun-qwiic-pir
description: Pinout, electrical limits, wiring and MicroPython driver for the SparkFun Qwiic PIR 170 uA (SEN-17374, Panasonic EKMC4607112K PIR read over I2C by an ATtiny84). Use when designing, wiring, simulating or writing code for a Qwiic PIR motion sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SparkFun Qwiic PIR - 170uA (EKMC4607112K) (SEN-17374)

## Overview
A Panasonic **EKMC4607112K** passive-infrared motion sensor (digital output, 170 uA, people detected up to about 5-7 m) on a 1" x 1" Qwiic board. An **ATtiny84** running SparkFun's Qwiic PIR firmware reads the PIR output and exposes it as an I2C register map: the live PIR output, debounced object-detected / object-removed events, time-stamped event queues and an active-low INT output. No soldering needed with Qwiic cables; a 0.1" header row is also broken out.

## Pinout (0.1" header, as printed: INT, SCL, SDA, 3V3, GND)
| Pin | Function |
|---|---|
| INT | Interrupt output, active low, 10 kΩ pull-up to 3.3 V on the board (optional) |
| SCL | I2C clock (2.2 kΩ pull-up on the board) |
| SDA | I2C data (2.2 kΩ pull-up on the board) |
| 3V3 | Supply, 3.3 V |
| GND | Ground |

The two Qwiic (JST-SH) connectors carry GND, 3.3V, SDA, SCL.

## Electrical limits
- Supply: 3.3 V (no regulator; the EKMC4607112K needs 3.0-6.0 V and the ATtiny84 ≥ 2.7 V; the Qwiic system is 3.3 V). Do not feed 5 V: the pull-ups would put 5 V on your SDA/SCL.
- Current: about 170 uA for the PIR plus the ATtiny and the power/status LEDs, a few mA in total (cut the PWR jumper to drop the power LED).
- Warm-up: the PIR output is undefined for up to **30 s** after power is applied.
- I2C 100/400 kHz.

## Interface details
- **I2C address 0x12**; cut the ADR jumper for 0x13. The address can also be set in software (register 0x19, kept in EEPROM).
- Read: write the register number, then read. 16/32-bit registers are **little-endian**.
- Registers: 0x00 ID = **0x72**; 0x01/0x02 firmware minor/major (1.1); **0x03 status** (bit 0 raw PIR output, bit 1 eventAvailable, bit 2 objectRemoved, bit 3 objectDetected); 0x04 interrupt enable (bit 0); 0x05-0x06 debounce ms; 0x07 detected-queue status (bit 0 pop request, bit 1 empty, bit 2 full); 0x08 / 0x0C ms since newest / oldest detection; 0x10, 0x11, 0x15 the same for removals; 0x19 I2C address.

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22 (INT → any input pin if used).
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3V3 → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from qwiic_pir import QwiicPIR
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
pir = QwiicPIR(i2c)              # checks ID 0x72
if pir.raw_reading():
    print('motion')
if pir.available():              # debounced event waiting
    if pir.object_detected(): print('someone arrived')
    if pir.object_removed():  print('they left')
    pir.clear_event_bits()
```
`set_debounce_ms()`, `enable_interrupt()`, `pop_detected_queue()` / `pop_removed_queue()` (ms ago) cover the rest.

## Gotchas
- Wait about 30 s after power-up before trusting readings.
- Clear eventAvailable / objectDetected / objectRemoved yourself (`clear_event_bits()`); they stay set and keep INT low until you do.
- Many Qwiic boards on one bus all add 2.2 kΩ pull-ups; cut the I2C jumper on some if the bus gets too strong.
- In the Sparkbench simulator only the live PIR bit (status bit 0) follows the "Motion in view" toggle; the debounced event latches and queues are not simulated.

## Datasheet
https://cdn.sparkfun.com/assets/7/2/a/4/3/EKMC460711xK_Spec.pdf (PIR), schematic https://cdn.sparkfun.com/assets/6/0/b/7/6/Qwiic_PIR-Schematic.pdf, firmware register map https://github.com/sparkfun/Qwiic_PIR/blob/master/Firmware/Qwiic_PIR/registers.h
