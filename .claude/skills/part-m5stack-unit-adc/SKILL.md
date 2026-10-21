---
name: part-m5stack-unit-adc
description: Pinout, electrical limits, wiring and MicroPython driver for the M5Stack Unit ADC (SKU U013), a 0-12 V 16-bit I2C voltage meter built on the TI ADS1100 with a ÷4 input divider and LM358 buffer. Use when designing, wiring, simulating or writing code for a Unit ADC in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# M5Stack Unit ADC (U013, ADS1100)

## Overview
The **M5Stack Unit ADC (SKU U013)** measures a voltage of **0-12 V** on a 2-pin screw terminal and reports it over I2C with 16-bit resolution. From the M5Stack V1.0 schematic:
- **+** terminal -> **R4 300 kΩ** -> node -> **R5 100 kΩ** -> GND. The node (Vin / 4) feeds an **LM358** voltage follower (powered from the 5 V pin), then **R1 1 kΩ** into the ADS1100 **VIN+**.
- **-** terminal, ADS1100 **VIN-** and GND are joined (R6 is a 0 Ω link): it is single-ended, not a floating differential input.
- An **HT7533** makes 3.3 V from the 5 V pin. It powers the **ADS1100**, whose reference **is its supply**, and the **4.7 kΩ SDA/SCL pull-ups**.

## Pinout
| Connector | Pin | Function |
|---|---|---|
| Grove HY2.0-4P (black) | GND | Ground |
| Grove (red) | 5V | Supply 5 V (LM358 + HT7533) |
| Grove (yellow) | SDA | I2C data, 4.7 kΩ pull-up to the unit's 3.3 V |
| Grove (white) | SCL | I2C clock, 4.7 kΩ pull-up to the unit's 3.3 V |
| HT3.96 terminal | IN+ (+) | Voltage to measure, 0-12 V |
| HT3.96 terminal | IN- (-) | Ground (same net as GND) |

Sources: M5Stack docs PinMap (Black GND, Red 5V, Yellow SDA, White SCL, PORT.A), the label on the unit (SCL SDA 5V GND, "0-12V"), the U013 schematic and the "+ / -" marks on the terminal.

## Electrical limits
- Supply: 5 V (4.5-5.5 V). On 3.3 V the LM358 output stops near 1.8 V, so readings above about 7 V are lost.
- Input: 0-12 V (about 13 V reads full scale at PGA 1). Input load about 400 kΩ. Negative inputs read near 0 (single-supply buffer).
- SDA/SCL pull-ups go to the unit's 3.3 V: safe for 3.3 V GPIOs with a 5 V supply. About 2 mA.

## Interface details
- **I2C address 0x48**, fixed (ADS1100A0).
- No register pointer. A **write is one config byte** `ST/BSY 0 0 SC DR1 DR0 PGA1 PGA0` (default 0x8C = continuous, 8 SPS, PGA 1). SC=1 single conversion; ST/BSY=1 starts it. DR 11/10/01/00 = 8/16/32/128 SPS = 16/15/14/12 bits. PGA 00..11 = 1/2/4/8.
- A **read returns 3 bytes**: code high, code low (two's complement, sign-extended), config byte. ST/BSY reads 0 when the single conversion is done.
- Code = -MinCode x PGA x (VIN+ - VIN-) / VDD, MinCode = -32768 at 8 SPS. On this unit VDD = 3.3 V and VIN+ = Vin / 4, so **Vin = code x 3.3 x 4 / 32768** (≈ 0.403 mV per code).

## Wiring
| Unit ADC | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| 5V (red) | 5V / VIN | VBUS (pin 40) | 5 V (pin 2) |
| GND (black) | GND | GND | GND (pin 6) |
| SDA (yellow) | GPIO21 | GP4 | GPIO2 (pin 3) |
| SCL (white) | GPIO22 | GP5 | GPIO3 (pin 5) |
| + / - | the voltage to measure and its ground | | |

## Using the driver
```python
from machine import I2C, Pin
from m5_unit_adc import UnitADC
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
adc = UnitADC(i2c)            # 8 SPS, 16 bits, PGA 1
print('%.3f V' % adc.read_volts())
```
`read_raw()` runs one single-shot conversion (write 0x9C, wait ~154 ms, read until ST/BSY = 0). `adc_volts()` gives the voltage at the chip, `read_volts()` at the terminal.

## Gotchas
- The reference is the 3.3 V regulator (±2 %): calibrate `vdd` against a multimeter for better accuracy.
- **-** is ground. Do not use it to measure across a part that is not referenced to your board's ground.
- Higher PGA only helps small voltages: full scale at the chip is 3.3 V / PGA, i.e. 13.2 / PGA V at the terminal.
- 0x48 clashes with an ADS1115 / ADS1015 at its default address.
- Right after power-up the output register reads 0 until the first conversion ends.

## Datasheet
https://www.ti.com/lit/ds/symlink/ads1100.pdf. Product page: https://docs.m5stack.com/en/unit/adc. Schematic: https://m5stack-doc.oss-cn-shenzhen.aliyuncs.com/736/U013_UNIT_ADC_SCHE.pdf
