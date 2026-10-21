---
name: part-max30105
description: Pinout, electrical limits, wiring and MicroPython driver for the MAX30105 particle / heart-rate sensor (Maxim MAX30105, SparkFun Particle Sensor Breakout SEN-14045). Use when designing, wiring, simulating or writing code for a MAX30105 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build, e.g. smoke detection, presence sensing or fingertip pulse.
---

# MAX30105 particle / heart-rate sensor (MAX30105)

## Overview
The **Maxim MAX30105** is an optical module with red, infrared and green LEDs, a photodetector and an 18-bit ADC. It measures how much light comes back: smoke or particles in the air, an object in front of it, or the pulse in a fingertip (photoplethysmography). Samples go into a 32-entry FIFO read over I2C. It also has a die temperature sensor. Hobbyists buy it on the **SparkFun Particle Sensor Breakout - MAX30105 (SEN-14045)**. That board has a 1.8 V regulator for the chip, MOSFET I2C level shifters, and 4.7 kΩ pull-ups on SDA, SCL and INT. All three pull-ups go to the board's **5V** pin.

## Pinout (SparkFun SEN-14045, header order pad 1-5)
| Pin | Function |
|---|---|
| SCL | I2C clock (level-shifted, 4.7 kΩ pull-up to 5V pin) |
| SDA | I2C data (level-shifted, 4.7 kΩ pull-up to 5V pin) |
| 5V | Supply for LEDs + 1.8 V regulator, 3.3-5 V; also the I2C logic level |
| GND | Ground |
| INT | Interrupt, active low, open-drain (optional) |

## Electrical limits
- Board supply: 3.3-5 V. Chip: VDD 1.7-2.0 V (from the on-board regulator), VLED+ 3.1-5.25 V. Red and IR are guaranteed at 3.3 V. The green LED may need about 3.5 V to be bright.
- Current: about 0.6-1.1 mA for the chip, plus LED pulses of up to 50 mA each (the average depends on LED current, pulse width and sample rate).
- I2C up to 400 kHz, fixed address **0x57**.

## Interface details
- Part ID (0xFF) = **0x15**. Soft reset: write 0x40 to MODE_CONFIG 0x09. The bit clears itself when the reset is done.
- MODE[2:0] (0x09): 0b010 red only, 0b011 red + IR, 0b111 multi-LED (slots in 0x11/0x12: 1 = red, 2 = IR, 3 = green). Bit 7 = shutdown.
- 0x0A: ADC_RGE[6:5] (2048/4096/8192/16384 nA), SR[4:2] (50…3200 sps), LED_PW[1:0] (69/118/215/411 µs = 15/16/17/18-bit).
- 0x08: SMP_AVE[7:5] (1…32 averaged), FIFO_ROLLOVER_EN bit 4, FIFO_A_FULL[3:0]. LED currents: 0x0C red, 0x0D IR, 0x0E green (0x00-0xFF = 0-50 mA).
- FIFO: clear 0x04/0x05/0x06 before starting. Unread = (FIFO_WR_PTR − FIFO_RD_PTR) & 0x1F. Burst-read 0x07 (it does not auto-increment): 3 bytes per active LED per sample, MSB first, 18-bit left-justified (`& 0x3FFFF`).
- Die temperature: write 1 to 0x21 (TEMP_EN, self-clearing), wait about 29 ms, then T = TINT (0x1F, signed) + TFRAC (0x20, low 4 bits) × 0.0625 °C.

## Wiring
- ESP32: 5V → **3V3**, GND → GND, SDA → D21, SCL → D22.
- Pico: 5V → **3V3(OUT)**, GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 5V → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Feed the 5V pin from 5 V only when the microcontroller uses 5 V logic. The pull-ups would otherwise put 5 V on 3.3 V-only I2C pins.

## Using the driver
```python
from machine import I2C, Pin
from max30105 import MAX30105
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=400000)
s = MAX30105(i2c)
s.setup(leds=3, led_current=0x1F, sample_rate=100, pulse_width=411, adc_range=4096, average=1)
red, ir, green = s.read()          # newest sample, raw 18-bit counts
samples = s.read_fifo()            # every unread sample, for pulse / smoke algorithms
print(red, ir, green, s.temperature())
```

## Gotchas
- With a 3.3 V board, power the 5V pin from 3.3 V (see Wiring). Green readings may be weak at 3.3 V.
- Readings at 262143 mean the ADC is saturated. Lower the LED current or raise ADC_RGE.
- In multi-LED mode the sample size is 3 bytes × the number of enabled slots. Enable slots in order (SLOT1 first).
- Heart rate: rest a fingertip lightly on the sensor and use IR samples at 100 sps or more. The pulse is a 1-3 % dip in the reflected light.
- Cut the PU jumper if another board on the bus already pulls SDA/SCL up.
- Maxim lists the MAX30105 as not recommended for new designs (the MAX30101 is its successor). The SparkFun board is still common.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/MAX30105.pdf
