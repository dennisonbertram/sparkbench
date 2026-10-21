---
name: part-apds-9301
description: Pinout, electrical limits, wiring and MicroPython driver for the APDS-9301 ambient light (lux) sensor (Broadcom/Avago APDS-9301, SparkFun SEN-14350). Use when designing, wiring, simulating or writing code for an APDS-9301 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# APDS-9301 ambient light (lux) sensor (APDS-9301)

## Overview
The **APDS-9301** from Broadcom (formerly Avago) is a light-to-digital converter with two photodiodes. Channel 0 sees visible plus infrared light and channel 1 sees mostly infrared. Two integrating 16-bit ADCs measure them, and the datasheet's empirical formula turns the pair into lux that roughly matches the human eye. It talks I2C at up to 400 kHz. Hobbyists buy it on the **SparkFun Ambient Light Sensor Breakout - APDS-9301 (SEN-14350)**. That board has 4.7k pull-ups on SDA/SCL and a 10k pull-up on INT, but **no regulator and no level shifting**, so it runs from 3.3 V only.

## Pinout (SparkFun SEN-14350, header order)
| Pin | Function |
|---|---|
| INT | Interrupt output: open-drain, active low, 10k pull-up to 3.3V on the board (optional) |
| GND | Ground |
| 3.3V | Supply, 2.7-3.6 V. Never connect it to 5 V |
| SDA | I2C data (4.7k pull-up to 3.3V) |
| SCL | I2C clock (4.7k pull-up to 3.3V) |

## Electrical limits
- Supply: 2.7-3.6 V (3.0 V typical), absolute max 3.8 V. Every pin connects straight to the chip.
- Current: 0.24 mA typical (0.6 mA max) while active, 3.2 µA powered down.
- SDA/SCL high level 2.1-3.6 V. A 5 V microcontroller needs a level translator.
- I2C 0-400 kHz.

## Interface details
- **I2C address 0x39** (jumper open). The datasheet gives ADDR SEL to GND = 0x29 and to VDD = 0x49. SparkFun's labels for the two sides of the back jumper disagree with this, so run an I2C scan after closing one.
- Command byte: bit 7 CMD = 1, bit 6 CLEAR (clears the interrupt), bit 5 WORD, bit 4 reserved (0), bits 3:0 register.
- 0x0 CONTROL: write 0x03 to power up and 0x00 to power down. It reads back 0x03 when powered, which is a handy connection check.
- 0x1 TIMING: bit 4 GAIN (0 = 1x, 1 = 16x), bits 1:0 INTEG (00 = 13.7 ms, 01 = 101 ms, 10 = 402 ms). The power-on value is 0x02.
- 0x2-0x5 interrupt thresholds for channel 0 (written with Write Word). 0x6 INTERRUPT: bits 5:4 = 01 enables the level interrupt, bits 3:0 set the persistence.
- 0xA ID: the upper nibble is 0101.
- 0xC/0xD DATA0 (channel 0) and 0xE/0xF DATA1 (channel 1), **low byte first**. Read each pair with the Read Word protocol, command **0xAC** for channel 0 and **0xAE** for channel 1.
- Full scale: 65535 counts at 402 ms, 37177 at 101 ms and 5047 at 13.7 ms.
- Lux, with counts scaled to 16x gain and 402 ms (low gain ×16, 101 ms ×322/81, 13.7 ms ×322/11):
  - CH1/CH0 ≤ 0.50: lux = 0.0304·CH0 − 0.062·CH0·(CH1/CH0)^1.4
  - ≤ 0.61: lux = 0.0224·CH0 − 0.031·CH1
  - ≤ 0.80: lux = 0.0128·CH0 − 0.0153·CH1
  - ≤ 1.30: lux = 0.00146·CH0 − 0.00112·CH1
  - above 1.30: lux = 0

## Wiring
- ESP32: 3.3V → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3.3V → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3.3V → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from apds9301 import APDS9301
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = APDS9301(i2c, gain=1, integration_ms=402)
ch0, ch1 = sensor.raw()
print('CH0=%d CH1=%d Lux=%s' % (ch0, ch1, sensor.lux()))
```
`lux()` returns `None` when a channel is saturated. The driver also has `configure(gain, integration_ms)`, `set_thresholds(low, high)`, `enable_interrupt(persist)`, `disable_interrupt()`, `clear_interrupt()`, `power_down()`, `power_up()` and the stand-alone `calculate_lux(ch0, ch1, gain16, integ)`. In the simulator, the two sliders set the raw channel counts.

## Gotchas
- The chip starts powered down, so nothing reads until 0x03 is written to CONTROL. After powering up or changing the timing, wait one full integration time before reading.
- Channel 0 alone is not lux: an incandescent bulb gives far more channel-0 counts per lux than fluorescent light.
- A full-scale count means the channel is saturated. Use 1x gain or a shorter integration time in bright light, and 16x gain in dim rooms.
- 3.3 V only. A 5 V board on VCC or on SDA/SCL can destroy the sensor.
- INT stays low until you clear it by writing a command byte with the CLEAR bit set (0xC0).

## Datasheet
https://docs.broadcom.com/doc/AV02-2315EN (AV02-2315EN). Board files: https://github.com/sparkfun/APDS-9301_Breakout
