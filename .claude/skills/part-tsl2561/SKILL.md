---
name: part-tsl2561
description: Pinout, electrical limits, wiring and MicroPython driver for the TSL2561 luminosity (lux) sensor (TAOS/ams TSL2561). Use when designing, wiring, simulating or writing code for a TSL2561 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TSL2561 luminosity (lux) sensor (TSL2561)

## Overview
The **TSL2561** from TAOS (now ams) is a light-to-digital converter with two photodiodes: channel 0 sees visible plus infrared light, channel 1 mostly infrared. Two integrating 16-bit ADCs measure them, and the datasheet's formula turns the pair into lux that roughly matches the human eye, from about 0.1 to 40,000 lux. It talks I2C (up to 400 kHz). Hobbyists buy it on the **Adafruit TSL2561 Digital Luminosity/Lux/Light Sensor Breakout (#439, 7-pin header version)**. That board adds a MIC5225 3.3 V regulator, BSS138 I2C level shifters and 10k pull-ups, so it runs from 3-5 V.

## Pinout (Adafruit #439 header version, header order)
| Pin | Function |
|---|---|
| Vin | Supply, 3-5 V (regulated to 3.3 V on board) |
| GND | Ground |
| 3vo | 3.3 V output of the regulator. It is not an input: leave it unconnected |
| Addr | Address select, wired straight to the chip: floating = 0x39, GND = 0x29, 3vo = 0x49 (optional) |
| Int | Interrupt output: open-drain, active low, no pull-up, 3.3 V max (optional) |
| SDA | I2C data (level shifter, 10k pull-up to Vin) |
| SCL | I2C clock (level shifter, 10k pull-up to Vin) |

## Electrical limits
- Board supply (Vin): 3-5 V. The bare chip needs 2.7-3.6 V (absolute max 3.8 V), and the regulator provides it.
- Current: 0.24 mA typical (0.6 mA max) while active, 3.2 µA powered down, plus the regulator.
- Addr and Int connect straight to the chip, so never put more than 3.6 V on them.
- I2C 0-400 kHz.

## Interface details
- **I2C address 0x39** (Addr floating), 0x29 (Addr to GND), 0x49 (Addr to 3.3 V).
- Command byte: bit 7 CMD = 1, bit 6 CLEAR (clears the interrupt), bit 5 WORD, bit 4 BLOCK, bits 3:0 register.
- 0x0 CONTROL: write 0x03 to power up and 0x00 to power down. It reads back 0x03 when powered, which is a handy connection check.
- 0x1 TIMING: bit 4 GAIN (0 = 1x, 1 = 16x), bits 1:0 INTEG (00 = 13.7 ms, 01 = 101 ms, 10 = 402 ms). The power-on value is 0x02.
- 0xA ID: the upper nibble is the part number.
- 0xC/0xD DATA0 (channel 0) and 0xE/0xF DATA1 (channel 1), **low byte first**. Read each pair with the Read Word protocol, command **0xAC** for channel 0 and **0xAE** for channel 1.
- Full scale: 65535 counts at 402 ms, 37177 at 101 ms and 5047 at 13.7 ms.
- Lux for the T/FN/CL package (counts scaled to 16x gain and 402 ms; low gain counts ×16, 101 ms ×322/81, 13.7 ms ×322/11):
  - CH1/CH0 ≤ 0.50: lux = 0.0304·CH0 − 0.062·CH0·(CH1/CH0)^1.4
  - ≤ 0.61: lux = 0.0224·CH0 − 0.031·CH1
  - ≤ 0.80: lux = 0.0128·CH0 − 0.0153·CH1
  - ≤ 1.30: lux = 0.00146·CH0 − 0.00112·CH1
  - above 1.30: lux = 0
  The driver uses the datasheet's integer `CalculateLux()` routine, which approximates this curve piecewise.

## Wiring
- ESP32: Vin → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: Vin → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: Vin → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from tsl2561 import TSL2561
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = TSL2561(i2c, gain=1, integration_ms=402)
ch0, ch1 = sensor.raw()
print('CH0=%d CH1=%d Lux=%s' % (ch0, ch1, sensor.lux()))
```
`lux()` returns `None` when a channel is saturated. The driver also has `configure(gain, integration_ms)`, `power_down()`, `power_up()`, `clear_interrupt()` and the stand-alone `calculate_lux(ch0, ch1, gain16, integ)`. In the simulator, the two sliders set the raw channel counts.

## Gotchas
- The chip starts powered down, so nothing reads until 0x03 is written to CONTROL. After powering up or changing the timing, wait one full integration time before reading.
- Channel 0 alone is not lux: an incandescent bulb gives far more channel-0 counts per lux than daylight.
- A full-scale count means the channel is saturated. Use 1x gain or a shorter integration time in bright light, and 16x gain in dim rooms.
- The pull-ups go to Vin. With Vin on 5 V, SDA and SCL idle at 5 V, which is unsafe for an ESP32 or Pico, so power the board from 3.3 V for those.
- Tie Addr to 3vo, never to Vin, to select address 0x49.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/TSL2561.pdf (TAOS059N). Board files: https://github.com/adafruit/TSL2561-breakout-board-PCB
