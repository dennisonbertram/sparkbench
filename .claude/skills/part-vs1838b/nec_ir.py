# NEC IR remote decoder for a 38 kHz demodulating IR receiver (VS1838B, TSOP38238, ...).
# MicroPython. The receiver's OUT idles high and is low while a 38 kHz burst is seen.
#
# NEC frame (as sent by the common 21-key "Car MP3" remote): 9 ms mark, 4.5 ms space,
# then 32 bits LSB first: address, ~address, command, ~command. Every bit starts with a
# 562.5 us mark; the space after it is 562.5 us for 0 and 1687.5 us for 1. A final
# 562.5 us mark ends the frame (67.5 ms in total). While the button is held, a repeat
# code (9 ms mark, 2.25 ms space, 562.5 us mark) follows every 108 ms.
#
# A pin interrupt records the time of every edge; read() decodes once the line has
# been quiet for QUIET_US. Call read() often (every 10-20 ms) from your main loop.

from machine import Pin
from array import array
from utime import ticks_us, ticks_diff

QUIET_US = 12000      # longest gap inside a frame is 4.5 ms; frames are >= 40 ms apart
NEDGES = 68           # 2 leader edges + 32 bits x 2 + final mark (2)


class NEC:
    REPEAT = -1       # read() result kinds
    ERROR = -2

    def __init__(self, pin, extended=False):
        self._pin = pin
        self._ext = extended
        self._t = array('i', [0] * (NEDGES + 1))
        self._n = 0
        self._last = ticks_us()
        self._busy = False
        self.addr = 0
        pin.irq(handler=self._edge, trigger=Pin.IRQ_FALLING | Pin.IRQ_RISING)

    def _edge(self, _):
        t = ticks_us()
        if self._busy:
            return
        if self._n and ticks_diff(t, self._last) > QUIET_US:
            self._n = 0   # stale partial burst: start again
        if self._n <= NEDGES:
            self._t[self._n] = t
            self._n += 1
        self._last = t

    def close(self):
        self._pin.irq(handler=None)

    def read(self):
        """None if nothing new; (addr, cmd) for a frame; (addr, NEC.REPEAT) for a
        held button; (0, NEC.ERROR) for a garbled burst. addr is 8-bit, or 16-bit
        for extended-NEC remotes when extended=True."""
        n = self._n
        if not n or ticks_diff(ticks_us(), self._last) < QUIET_US:
            return None
        self._busy = True
        t = self._t
        try:
            res = self._decode(t, n)
        finally:
            self._n = 0
            self._busy = False
        return res

    def _decode(self, t, n):
        bad = (0, NEC.ERROR)
        if n < 4 or ticks_diff(t[1], t[0]) < 7000:     # 9 ms leader mark
            return bad
        space = ticks_diff(t[2], t[1])
        if 1700 < space < 3000:                          # 2.25 ms: repeat code
            return (self.addr, NEC.REPEAT) if n == 4 else bad
        if space < 3500 or n != NEDGES:                  # 4.5 ms: data frame
            return bad
        v = 0
        for i in range(32):
            sp = ticks_diff(t[3 + 2 * i + 1], t[3 + 2 * i])
            if sp > 1120:                                # 1687.5 us = 1, 562.5 us = 0
                v |= 1 << i
        a, ai, c, ci = v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF
        if c ^ ci != 0xFF:
            return bad
        if a ^ ai != 0xFF:
            if not self._ext:
                return bad
            a = v & 0xFFFF
        self.addr = a
        return (a, c)
