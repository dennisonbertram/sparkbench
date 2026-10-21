from machine import Pin
import time

# Low level trigger: IN low = relay on, IN high = relay off.
# Start every input HIGH so no relay clicks on at boot.
PINS = ({IN1}, {IN2}, {IN3}, {IN4}, {IN5}, {IN6}, {IN7}, {IN8},
        {IN9}, {IN10}, {IN11}, {IN12}, {IN13}, {IN14}, {IN15}, {IN16})
relays = [Pin(n, Pin.OUT, value=1) for n in PINS]
while True:
    for i, r in enumerate(relays):
        r.value(0 if i % 2 == 0 else 1)   # relays 1,3,5...15 on
    print('odd relays ON, even relays OFF')
    time.sleep(2)
    for i, r in enumerate(relays):
        r.value(1 if i % 2 == 0 else 0)   # relays 2,4,6...16 on
    print('odd relays OFF, even relays ON')
    time.sleep(2)
