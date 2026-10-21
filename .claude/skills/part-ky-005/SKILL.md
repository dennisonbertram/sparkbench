---
name: part-ky-005
description: Pinout, electrical limits, wiring and MicroPython code for the KY-005 infrared LED transmitter module (940 nm IR LED, also sold as HW-489). Use when designing, wiring, simulating or writing code for a KY-005 IR transmitter in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# KY-005 infrared transmitter module (KY-005)

## Overview
The **KY-005** is a single 5 mm **940 nm infrared LED** with a series current-limiting resistor on an 18.5 x 15 mm board. There is no driver transistor: the GPIO on S powers the LED. Drive S high and it emits invisible IR; low turns it off. To control a TV or air-conditioner you send **38 kHz carrier bursts** in the remote's protocol timing (NEC, Sony, RC5...). Hobbyists buy it as the **Keyes / HW-489 KY-005 infrared transmitter module** in the 37-in-1 sensor kits, usually paired with the KY-022 IR receiver.

## Pinout (KY-005 module, header order)
| Pin | Function |
|---|---|
| S | Signal: high = IR LED on, low = off. Supplies the LED current. |
| (middle) | Unlabelled VCC, 3.3-5 V. Not needed for the LED to emit. |
| - | Ground (LED cathode) |

## Electrical limits
- 3.3-5 V logic on S.
- LED forward current 30-60 mA maximum, about 90 mW; from a GPIO expect 20-30 mA.
- Working temperature -10 to 50 C.

## Interface details
- Plain digital output: `Pin.value(1)` = on, `Pin.value(0)` = off. No driver needed.
- Real remotes modulate at 38 kHz (about 1/3 duty). Receivers ignore unmodulated IR, so a steady "on" will not control a device.
- NEC frame: 9 ms burst, 4.5 ms space, then 32 bits LSB first (address, ~address, command, ~command); each bit is a 562.5 us burst followed by 562.5 us (0) or 1687.5 us (1) space; ends with a 562.5 us burst.

## Wiring
- ESP32: S -> D25, - -> GND, middle -> 3V3 (optional).
- Pico: S -> GP2, - -> GND (short range only; a Pico pin is rated for about 12 mA). For range use an NPN transistor (2N2222, 1 kOhm base resistor from GP2), LED fed from 5 V (VBUS).
- Raspberry Pi 4: same transistor circuit, base resistor from pin 18 (GPIO24), S -> pin 2 (5 V).

## Using it
```python
from machine import Pin, PWM
import time

# NEC transmit with a 38 kHz PWM carrier gated on and off (ESP32; Python timing is close enough for most TVs,
# esp32.RMT gives exact timing)
ir = PWM(Pin(25), freq=38000, duty_u16=0)
ON = 21845  # ~1/3 duty

def burst(us):
    ir.duty_u16(ON); time.sleep_us(us); ir.duty_u16(0)

def nec(addr, cmd):
    burst(9000); time.sleep_us(4500)
    data = addr | ((addr ^ 0xFF) << 8) | (cmd << 16) | ((cmd ^ 0xFF) << 24)
    for i in range(32):
        burst(562)
        time.sleep_us(1687 if (data >> i) & 1 else 562)
    burst(562)

nec(0x04, 0x08)
```

## Gotchas
- Some clone boards omit the series resistor: if there is no resistor next to the LED, add 100-220 Ohm in series or you will overload the GPIO.
- Infrared is invisible; check it works with a phone camera (front cameras often lack an IR filter).
- Short range (1-3 m) from a GPIO is normal; use a transistor for more.
- The LED must point straight at the device's receiver window.
- Codes differ between brands and models: capture the original remote with a KY-022 to get them.

## Datasheet
No manufacturer datasheet exists for this generic module; specifications and pinout from https://arduinomodules.info/ky-005-infrared-transmitter-sensor-module/
