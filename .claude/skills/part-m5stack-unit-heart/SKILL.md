---
name: part-m5stack-unit-heart
description: Pinout, electrical limits, wiring and MicroPython driver for the M5Stack Unit Heart (SKU U029, Maxim/Analog Devices MAX30100 pulse oximeter & heart-rate sensor, Grove I2C). Use when designing, wiring, simulating or writing code for an M5Stack Unit Heart in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# M5Stack Unit Heart (MAX30100)

## Overview
The **M5Stack Unit Heart** (SKU U029) carries a **MAX30100**: a red (660 nm) and an IR (880 nm) LED, a photodetector and a 16-bit ADC. Each sample (one IR and one red reading) goes into a **16-sample FIFO** that you read over I2C; your program finds the heartbeat in the IR signal (blood volume rises with each beat, so less light comes back). It also has a die temperature sensor. On the unit an HT7533 makes 3.3 V for the LEDs, an RT9193 makes 1.8 V for the chip, and two AO3400A MOSFETs level-shift the I2C lines.

## Pinout (HY2.0-4P Grove connector, pin order)
| Pin | Wire | Function |
|---|---|---|
| GND | black | Ground |
| 5V | red | Supply (feeds the HT7533 and the SDA/SCL pull-ups) |
| SDA | yellow | I2C data, 4.7 kΩ pull-up to the supply pin |
| SCL | white | I2C clock, 4.7 kΩ pull-up to the supply pin |

## Electrical limits
- Chip: VDD 1.7–2.0 V, LED+ 3.1–5.0 V (both made on the unit).
- Unit supply: M5Stack feeds 5 V, but the SDA/SCL pull-ups (R3, R4) go to that pin, so with a 3.3 V microcontroller feed **3.3 V** (the LED supply then sits just under 3.3 V, still above the 3.1 V minimum).
- Current about 0.6 mA plus the LEDs (pulses up to 50 mA, average a few to ~20 mA). I2C up to 400 kHz.

## Interface details
- **I2C address 0x57**, fixed. PART_ID (0xFF) reads **0x11**.
- Registers: 0x00 interrupt status (A_FULL b7, TEMP_RDY b6, HR_RDY b5, SPO2_RDY b4, PWR_RDY b0), 0x01 interrupt enable, 0x02 FIFO_WR_PTR, 0x03 OVF_COUNTER, 0x04 FIFO_RD_PTR, 0x05 FIFO_DATA, 0x06 MODE_CONFIG (SHDN b7, RESET b6, TEMP_EN b3, MODE[2:0]: 010 HR only, 011 SpO2), 0x07 SPO2_CONFIG (SPO2_HI_RES_EN b6, SPO2_SR[4:2] = 50/100/167/200/400/600/800/1000 sps, LED_PW[1:0] = 200/400/800/1600 µs = 13/14/15/16-bit), 0x09 LED_CONFIG (RED_PA[7:4], IR_PA[3:0]; 0x0 = 0 mA … 0xF = 50 mA), 0x16/0x17 temperature.
- Start: soft reset (0x06 = 0x40, wait for the bit to clear), set 0x07 and 0x09, clear 0x02/0x03/0x04, then MODE = 0x03.
- FIFO: samples available = (WR_PTR − RD_PTR) mod 16. Read 4 bytes per sample from 0x05 (IR MSB, IR LSB, red MSB, red LSB); the register pointer stays on 0x05 while the read pointer advances. Data is left-justified.
- Temperature: set TEMP_EN (self-clearing, ~29 ms), then T = TINT (two's complement °C) + TFRAC × 0.0625.

## Wiring
- ESP32: 5V (red) → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 5V (red) → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 5V (red) → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from max30100 import MAX30100
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=400000)
s = MAX30100(i2c)
s.setup(sample_rate=100, pulse_width=1600, ir_current=0x6, red_current=0x6)
for ir, red in s.read_fifo():   # call at least every 100 ms
    print(ir, red)
print('T=%.2fC' % s.temperature())
```

## Gotchas
- Do not feed 5 V to the red wire when SDA/SCL go to a 3.3 V board: the unit's pull-ups would hold the bus at 5 V.
- The FIFO is only 16 samples deep; at 100 sps read it at least every 160 ms or samples are lost (OVF_COUNTER counts them).
- Very high LED current (50 mA) saturates the ADC on many fingers and loads the 3.3 V supply; start around 0x6 (20.8 mA).
- A sample rate too high for the pulse width is silently lowered by the chip.
- Not a medical device; SpO2 needs a calibrated ratio-of-ratios algorithm.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/MAX30100.pdf
