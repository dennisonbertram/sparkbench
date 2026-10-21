// Python modules that stand in for the hardware inside the simulator. User code imports
// `machine`, `time`, `dht`, `neopixel` (MicroPython) or `gpiozero`, `smbus2`,
// `adafruit_dht`, `board`, `neopixel` (Raspberry Pi) exactly as on the real device; these
// shims forward every operation to the JS `_hw` module, which runs the circuit model.

export const SIMTIME_PY = `import _hw

def ticks_ms():
    return int(_hw.ticks_us() // 1000)

def ticks_us():
    return int(_hw.ticks_us())

def ticks_cpu():
    return int(_hw.ticks_us())

def ticks_diff(a, b):
    return a - b

def ticks_add(a, b):
    return a + b

def sleep_us(us):
    _sleep(us)

def sleep_ms(ms):
    _sleep(ms * 1000)

def sleep(s):
    _sleep(s * 1000000)

_hooks = []
_next_fns = []


def _sleep(us):
    end = _hw.ticks_us() + us
    while True:
        for h in _hooks:
            h()
        left = end - _hw.ticks_us()
        if left <= 0:
            break
        step = left if left < 20000 else 20000
        for f in _next_fns:
            n = f()
            if n is not None and n < step:
                step = n
        _hw.sleep_us(step)

def time():
    return int(_hw.epoch())

def time_ns():
    return int(_hw.epoch() * 1000000) * 1000

def monotonic():
    return _hw.ticks_us() / 1000000

def perf_counter():
    return _hw.ticks_us() / 1000000

def localtime(secs=None):
    if secs is None:
        secs = time()
    secs = int(secs)
    days, rem = divmod(secs, 86400)
    wday = (days + 3) % 7  # 1970-01-01 was a Thursday; 0 = Monday
    h, rem = divmod(rem, 3600)
    m, s = divmod(rem, 60)
    y = 1970
    while True:
        yd = 366 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 365
        if days < yd:
            break
        days -= yd
        y += 1
    mdays = [31, 29 if yd == 366 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    yday = days + 1
    mo = 0
    while days >= mdays[mo]:
        days -= mdays[mo]
        mo += 1
    return (y, mo + 1, days + 1, h, m, s, wday, yday)

gmtime = localtime

def mktime(t):
    y, mo, d, h, mi, sec = t[0], t[1], t[2], t[3], t[4], t[5]
    days = 0
    for yy in range(1970, y):
        days += 366 if (yy % 4 == 0 and (yy % 100 != 0 or yy % 400 == 0)) else 365
    mdays = [31, 29 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    days += sum(mdays[: mo - 1]) + d - 1
    return days * 86400 + h * 3600 + mi * 60 + sec
`;

export const MACHINE_PY = `# Simulated machine module (MicroPython API subset)
import _hw

_timers = []


def _service():
    # Deliver pin interrupts and due timer callbacks between program statements.
    ev = _hw.irq_events()
    if ev:
        for i in range(0, len(ev), 2):
            p = Pin._irqs.get(ev[i])
            if p is not None:
                h, trig = p
                edge = ev[i + 1]
                if (edge == 1 and trig & Pin.IRQ_RISING) or (edge == 0 and trig & Pin.IRQ_FALLING):
                    h(Pin(ev[i]))
    if _timers:
        now = _hw.ticks_us()
        for t in list(_timers):
            if now >= t._due:
                if t._mode == Timer.PERIODIC:
                    t._due += t._period
                else:
                    _timers.remove(t)
                t._cb(t)


def _next_timer_us():
    if not _timers:
        return None
    now = _hw.ticks_us()
    return max(1, min(t._due for t in _timers) - now)


class Pin:
    IN = 1
    OUT = 3
    OPEN_DRAIN = 7
    PULL_UP = 1
    PULL_DOWN = 2
    IRQ_FALLING = 1
    IRQ_RISING = 2
    _irqs = {}

    def __init__(self, id, mode=-1, pull=-1, value=None, **kw):
        if isinstance(id, str):
            id = _hw.pin_by_name(id)
        self._id = id
        if mode != -1 or pull != -1 or value is not None:
            self.init(mode, pull, value)

    def init(self, mode=-1, pull=-1, value=None, **kw):
        if mode == -1:
            mode = Pin.IN
        if pull == -1 or pull is None:
            pull = 0
        r = _hw.pin_init(self._id, mode, pull, -1 if value is None else int(bool(value)))
        if r < 0:
            raise ValueError("invalid pin %d for this board" % self._id)

    def value(self, v=None):
        if v is None:
            return _hw.pin_read(self._id)
        _hw.pin_write(self._id, 1 if v else 0)

    def __call__(self, v=None):
        return self.value(v)

    def on(self):
        self.value(1)

    def off(self):
        self.value(0)

    def high(self):
        self.value(1)

    def low(self):
        self.value(0)

    def toggle(self):
        self.value(0 if _hw.pin_read(self._id) else 1)

    def irq(self, handler=None, trigger=3, **kw):
        Pin._irqs[self._id] = (handler, trigger)
        _hw.irq_watch(self._id)

    def __repr__(self):
        return "Pin(%d)" % self._id


class Signal:
    def __init__(self, pin, invert=False):
        self.pin = pin
        self.invert = invert

    def value(self, v=None):
        if v is None:
            return self.pin.value() ^ int(self.invert)
        self.pin.value(int(bool(v)) ^ int(self.invert))

    def on(self):
        self.value(1)

    def off(self):
        self.value(0)


class ADC:
    ATTN_0DB = 0
    ATTN_2_5DB = 1
    ATTN_6DB = 2
    ATTN_11DB = 3
    WIDTH_9BIT = 9
    WIDTH_10BIT = 10
    WIDTH_11BIT = 11
    WIDTH_12BIT = 12

    def __init__(self, pin, atten=3):
        self._id = pin._id if isinstance(pin, Pin) else (26 + pin if isinstance(pin, int) and pin < 5 and _hw.board() == "pico" else pin)
        self._atten = atten
        self._bits = 12
        r = _hw.adc_init(self._id)
        if r < 0:
            raise ValueError("Pin(%d) has no ADC on this board" % self._id)

    def atten(self, a):
        self._atten = a

    def width(self, w):
        self._bits = w

    def read_u16(self):
        return _hw.adc_read(self._id, self._atten)

    def read(self):
        return self.read_u16() >> (16 - self._bits)

    def read_uv(self):
        return int(self.read_u16() * 3300000 // 65535)


class PWM:
    def __init__(self, pin, freq=5000, duty=None, duty_u16=None, duty_ns=None, **kw):
        self._id = pin._id
        self._freq = freq
        self._duty = 0
        if duty is not None:
            self._duty = int(duty * 65535 // 1023)
        if duty_u16 is not None:
            self._duty = duty_u16
        if duty_ns is not None:
            self._duty = int(duty_ns * freq * 65535 // 1000000000)
        self._apply()

    def _apply(self):
        _hw.pwm(self._id, self._freq, self._duty)

    def init(self, freq=None, duty_u16=None, duty_ns=None, **kw):
        if freq is not None:
            self._freq = freq
        if duty_u16 is not None:
            self._duty = duty_u16
        if duty_ns is not None:
            self._duty = int(duty_ns * self._freq * 65535 // 1000000000)
        self._apply()

    def freq(self, f=None):
        if f is None:
            return self._freq
        self._freq = int(f)
        self._apply()

    def duty_u16(self, d=None):
        if d is None:
            return self._duty
        self._duty = max(0, min(65535, int(d)))
        self._apply()

    def duty(self, d=None):
        if d is None:
            return self._duty * 1023 // 65535
        self.duty_u16(int(d) * 65535 // 1023)

    def duty_ns(self, ns=None):
        if ns is None:
            return int(self._duty * 1000000000 // (65535 * self._freq))
        self.duty_u16(int(ns * self._freq * 65535 // 1000000000))

    def deinit(self):
        _hw.pwm(self._id, self._freq, -1)


class I2C:
    def __init__(self, id=0, scl=None, sda=None, freq=400000, **kw):
        if scl is None or sda is None:
            scl_d, sda_d = _hw.i2c_default(id)
            scl = scl or Pin(scl_d)
            sda = sda or Pin(sda_d)
        self._bus = _hw.i2c_open(sda._id, scl._id)
        self.freq = freq

    def scan(self):
        return list(_hw.i2c_scan(self._bus))

    def _chk(self, r):
        if r < 0:
            raise OSError(-r)
        return r

    def writeto(self, addr, buf, stop=True):
        return self._chk(_hw.i2c_write(self._bus, addr, bytes(buf).hex()))

    def writevto(self, addr, vector, stop=True):
        return self._chk(_hw.i2c_write(self._bus, addr, b"".join(bytes(b) for b in vector).hex()))

    def readfrom(self, addr, n, stop=True):
        r = _hw.i2c_read(self._bus, addr, n)
        if not r or r[0] == "-":
            raise OSError(int(r[1:]) if r else 19)
        return bytes.fromhex(r)

    def readfrom_into(self, addr, buf, stop=True):
        d = self.readfrom(addr, len(buf))
        for i in range(len(buf)):
            buf[i] = d[i]

    def writeto_mem(self, addr, reg, buf, addrsize=8):
        return self.writeto(addr, bytes([reg]) + bytes(buf))

    def readfrom_mem(self, addr, reg, n, addrsize=8):
        self.writeto(addr, bytes([reg]))
        return self.readfrom(addr, n)

    def readfrom_mem_into(self, addr, reg, buf, addrsize=8):
        self.writeto(addr, bytes([reg]))
        self.readfrom_into(addr, buf)


SoftI2C = I2C


class SPI:
    MSB = 0
    LSB = 1

    def __init__(self, id=1, baudrate=1000000, polarity=0, phase=0, bits=8, firstbit=0, sck=None, mosi=None, miso=None, **kw):
        d = _hw.spi_default(id)
        g = lambda p, i: p._id if p is not None else d[i]
        self._bus = _hw.spi_open(g(sck, 0), g(mosi, 1), g(miso, 2))

    def init(self, *a, **kw):
        pass

    def deinit(self):
        pass

    def write(self, buf):
        _hw.spi_write(self._bus, bytes(buf).hex())

    def read(self, n, write=0):
        return bytes.fromhex(_hw.spi_xfer(self._bus, bytes([write] * n).hex()))

    def readinto(self, buf, write=0):
        r = bytes.fromhex(_hw.spi_xfer(self._bus, bytes([write] * len(buf)).hex()))
        for i in range(len(buf)):
            buf[i] = r[i]

    def write_readinto(self, w, r):
        got = bytes.fromhex(_hw.spi_xfer(self._bus, bytes(w).hex()))
        for i in range(len(r)):
            r[i] = got[i]


SoftSPI = SPI


class UART:
    def __init__(self, id, baudrate=9600, tx=None, rx=None, **kw):
        self._h = _hw.uart_open(id, tx._id if tx is not None else -1, rx._id if rx is not None else -1, baudrate)
        if self._h < 0:
            raise ValueError('bad TX/RX pin for UART(%d)' % id)

    def init(self, *a, **kw):
        pass

    def deinit(self):
        pass

    def write(self, b):
        if isinstance(b, str):
            b = b.encode()
        _hw.uart_write(self._h, bytes(b).hex())
        return len(b)

    def any(self):
        return _hw.uart_any(self._h)

    def read(self, n=None):
        h = _hw.uart_read(self._h, -1 if n is None else n)
        return bytes.fromhex(h) if h else None

    def readline(self):
        h = _hw.uart_readline(self._h)
        return bytes.fromhex(h) if h else None

    def readinto(self, buf, n=None):
        d = self.read(len(buf) if n is None else n)
        if not d:
            return None
        for i in range(len(d)):
            buf[i] = d[i]
        return len(d)


class I2S:
    RX = 0
    TX = 1
    MONO = 0
    STEREO = 1

    def __init__(self, id, *, sck=None, ws=None, sd=None, mck=None, mode=None, bits=None, format=None, rate=None, ibuf=None):
        if None in (sck, ws, sd, mode, bits, format, rate, ibuf):
            raise TypeError("I2S needs sck, ws, sd, mode, bits, format, rate and ibuf")
        self._bits = bits
        self._h = _hw.i2s_open(id, sck._id, ws._id, sd._id, mode, bits, format, rate, ibuf)
        if self._h == -2:
            raise ValueError("invalid ws (must be sck+1)")
        if self._h == -3:
            raise ValueError("invalid bits")
        if self._h == -4:
            raise ValueError("I2S RX (microphones) is not simulated")
        if self._h < 0:
            raise ValueError("invalid I2S id or pin")

    def init(self, **kw):
        pass

    def deinit(self):
        _hw.i2s_close(self._h)

    def write(self, buf):
        return _hw.i2s_write(self._h, bytes(buf).hex())

    def readinto(self, buf):
        raise OSError("I2S RX is not simulated")

    def irq(self, handler):
        raise OSError("non-blocking I2S (irq) is not simulated")

    @staticmethod
    def shift(*, buf, bits, shift):
        out = bytes.fromhex(_hw.i2s_shift(bytes(buf).hex(), bits, shift))
        for i in range(len(out)):
            buf[i] = out[i]


class Timer:
    ONE_SHOT = 0
    PERIODIC = 1

    def __init__(self, id=-1, mode=1, period=-1, freq=None, callback=None):
        if callback is not None:
            self.init(mode=mode, period=period, freq=freq, callback=callback)

    def init(self, mode=1, period=-1, freq=None, callback=None):
        self.deinit()
        if freq:
            period = 1000 / freq
        self._mode = mode
        self._period = int(period * 1000)
        self._cb = callback
        self._due = _hw.ticks_us() + self._period
        _timers.append(self)

    def deinit(self):
        if self in _timers:
            _timers.remove(self)


class RTC:
    def datetime(self, dt=None):
        import time
        t = time.localtime()
        return (t[0], t[1], t[2], 0, t[3], t[4], t[5], 0)


class WDT:
    def __init__(self, id=0, timeout=5000):
        pass

    def feed(self):
        pass


def time_pulse_us(pin, level, timeout_us=1000000):
    return int(_hw.pulse_in(pin._id, level, timeout_us))


def freq(f=None):
    return 240000000


def reset():
    raise SystemExit("machine.reset()")


def soft_reset():
    raise SystemExit("machine.soft_reset()")


def unique_id():
    return b"\\x5b\\x0c\\x1a\\xbe\\xe5\\x01"


def idle():
    import time
    time.sleep_ms(1)


def lightsleep(ms=0):
    import time
    time.sleep_ms(ms)


deepsleep = lightsleep


def disable_irq():
    return 0


def enable_irq(state=0):
    pass


def _next_edge_us():
    n = _hw.edge_next_us()
    return None if n < 0 else n


import _simtime
_simtime._hooks.append(_service)
_simtime._next_fns.append(_next_timer_us)
_simtime._next_fns.append(_next_edge_us)
`;

export const ESP32_PY = `# Simulated esp32 module (wake sources and sensors are accepted but have no effect).
WAKEUP_ALL_LOW = 0
WAKEUP_ANY_HIGH = 1


def wake_on_ext0(pin, level):
    pass


def wake_on_ext1(pins, level):
    pass


def wake_on_touch(wake):
    pass


def raw_temperature():
    return 120


def hall_sensor():
    return 0


class NVS:
    def __init__(self, namespace):
        self._d = {}

    def set_i32(self, k, v):
        self._d[k] = v

    def get_i32(self, k):
        if k not in self._d:
            raise OSError(-4354)
        return self._d[k]

    def set_blob(self, k, v):
        self._d[k] = bytes(v)

    def get_blob(self, k, buf):
        b = self._d.get(k, b"")
        buf[: len(b)] = b
        return len(b)

    def erase_key(self, k):
        self._d.pop(k, None)

    def commit(self):
        pass
`;

export const DHT_PY = `import _hw


class DHTBase:
    def __init__(self, pin):
        self._id = pin._id
        self._t = 0
        self._h = 0

    def measure(self):
        r = _hw.dht_read(self._id)
        if r[0] < 0:
            raise OSError(int(-r[0]))
        self._t, self._h = r[1], r[2]


class DHT11(DHTBase):
    def temperature(self):
        return int(self._t)

    def humidity(self):
        return int(self._h)


class DHT22(DHTBase):
    def temperature(self):
        return round(self._t * 10) / 10

    def humidity(self):
        return round(self._h * 10) / 10
`;

export const NEOPIXEL_MP_PY = `import _hw


# Same buffer layout as MicroPython's neopixel.py: bytes in wire order (GRB, or GRBW with bpp=4).
class NeoPixel:
    ORDER = (1, 0, 2, 3)

    def __init__(self, pin, n, bpp=3, timing=1):
        self._id = pin._id
        self.pin = pin
        self.n = n
        self.bpp = bpp
        self.timing = timing
        self.buf = bytearray(n * bpp)

    def __len__(self):
        return self.n

    def __setitem__(self, i, v):
        offset = i * self.bpp
        for k in range(self.bpp):
            self.buf[offset + self.ORDER[k]] = v[k]

    def __getitem__(self, i):
        offset = i * self.bpp
        return tuple(self.buf[offset + self.ORDER[k]] for k in range(self.bpp))

    def fill(self, v):
        for i in range(self.n):
            self[i] = v

    def write(self):
        _hw.neopixel_write(self._id, bytes(self.buf).hex())
`;

export const NETWORK_PY = `# Simulated Wi-Fi. Connects if the board's "Wi-Fi network in range" switch is on.
import _hw
STA_IF = 0
AP_IF = 1
STAT_IDLE = 0
STAT_CONNECTING = 1
STAT_WRONG_PASSWORD = 202
STAT_NO_AP_FOUND = 201
STAT_CONNECT_FAIL = 203
STAT_GOT_IP = 1010


class WLAN:
    def __init__(self, i=0):
        self._active = False

    def active(self, a=None):
        if a is None:
            return self._active
        self._active = bool(a)

    def connect(self, ssid=None, key=None, **kw):
        if not self._active:
            raise OSError("Wi-Fi Internal Error: call wlan.active(True) first")
        _hw.wifi_connect(str(ssid))

    def isconnected(self):
        return _hw.wifi_status() == STAT_GOT_IP

    def status(self, *a):
        if a and a[0] == "rssi":
            return -52
        return _hw.wifi_status()

    def ifconfig(self, *a):
        return ("192.168.1.42", "255.255.255.0", "192.168.1.1", "8.8.8.8") if self.isconnected() else ("0.0.0.0",) * 4

    def ipconfig(self, *a):
        return self.ifconfig()[0]

    def config(self, *a, **kw):
        return "sparkbench-sim"

    def disconnect(self):
        _hw.wifi_disconnect()

    def scan(self):
        return [(b"MyHomeWiFi", b"\\x00" * 6, 6, -48, 3, False)] if _hw.wifi_available() else []
`;

export const REQUESTS_PY = `# Simulated HTTP client (urequests / requests). Requests go out from the simulator to the real
# internet when possible; tests use built-in sample responses.
import _hw
import json as _json


class Response:
    def __init__(self, status, text, url):
        self.status_code = status
        self.text = text
        self.url = url
        self.reason = "OK" if status == 200 else ""
        self.ok = 200 <= status < 300

    @property
    def content(self):
        return self.text.encode()

    def json(self):
        return _json.loads(self.text)

    def raise_for_status(self):
        if not self.ok:
            raise OSError("HTTP %d for %s" % (self.status_code, self.url))

    def close(self):
        pass


class ConnectionError(OSError):
    pass


def request(method, url, data=None, json=None, headers=None, timeout=None, params=None, **kw):
    if params:
        url += ("&" if "?" in url else "?") + "&".join("%s=%s" % (k, v) for k, v in params.items())
    body = _json.dumps(json) if json is not None else (data if isinstance(data, str) else (data.decode() if data else ""))
    r = _hw.http(method, url, body)
    status = int(r[0])
    if status < 0:
        raise ConnectionError("network unreachable: is Wi-Fi connected?" if status == -118 else "request failed (%d)" % status)
    return Response(status, r[1], url)


def get(url, **kw):
    return request("GET", url, **kw)


def post(url, **kw):
    return request("POST", url, **kw)


def put(url, **kw):
    return request("PUT", url, **kw)
`;

export const NTPTIME_PY = `# Simulated ntptime: sets the board clock from the internet (needs Wi-Fi).
import _hw
host = "pool.ntp.org"
timeout = 1


def time():
    return int(_hw.epoch())


def settime():
    if _hw.ntp_sync() < 0:
        raise OSError(110)
`;

// ------------------------------------------------------------------ Raspberry Pi (CPython) shims

export const GPIOZERO_PY = `# Simulated gpiozero (subset). Pin numbers are BCM GPIO numbers, as in real gpiozero.
import _hw
import time as _time


class GPIOZeroError(Exception):
    pass


def _pin(p):
    if isinstance(p, str):
        p = int(p.replace("GPIO", "").replace("BCM", ""))
    if _hw.pin_init(p, 1, 0, -1) < 0:
        raise GPIOZeroError("GPIO%d is not a valid pin" % p)
    return p


class Device:
    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


class InputDevice(Device):
    def __init__(self, pin, pull_up=False, active_state=None, bounce_time=None):
        self.pin = _pin(pin)
        self._pull_up = pull_up
        _hw.pin_init(self.pin, 1, 1 if pull_up else (2 if pull_up is False else 0), -1)
        self._active_high = (not pull_up) if active_state is None else bool(active_state)
        self.when_pressed = None
        self.when_released = None
        self.when_activated = None
        self.when_deactivated = None
        self._last = self.is_active
        _watch.append(self)

    @property
    def value(self):
        v = _hw.pin_read(self.pin)
        return int(v == 1) if self._active_high else int(v == 0)

    @property
    def is_active(self):
        return bool(self.value)

    def _poll(self):
        a = self.is_active
        if a != self._last:
            self._last = a
            cb = (self.when_pressed or self.when_activated) if a else (self.when_released or self.when_deactivated)
            if cb:
                try:
                    cb(self)
                except TypeError:
                    cb()

    def wait_for_active(self, timeout=None):
        t0 = _time.monotonic()
        while not self.is_active:
            _time.sleep(0.01)
            if timeout and _time.monotonic() - t0 > timeout:
                return False
        return True

    def wait_for_inactive(self, timeout=None):
        t0 = _time.monotonic()
        while self.is_active:
            _time.sleep(0.01)
            if timeout and _time.monotonic() - t0 > timeout:
                return False
        return True


_watch = []
_blinkers = {}


def _service():
    for d in _watch:
        d._poll()
    if _blinkers:
        now = _time.monotonic()
        for dev, b in list(_blinkers.items()):
            dev._blink_step(now, b)


def _start_blink(dev, on_time, off_time, n, fade_in=0, fade_out=0, background=True):
    _blinkers[dev] = {"on": on_time, "off": off_time, "fi": fade_in, "fo": fade_out, "n": n, "t0": _time.monotonic()}
    if not background:
        total = (on_time + off_time + fade_in + fade_out) * (n or 1)
        _time.sleep(total)
        _blinkers.pop(dev, None)
        dev._set(0)


import _simtime
_simtime._hooks.append(_service)


class Button(InputDevice):
    def __init__(self, pin, pull_up=True, active_state=None, bounce_time=None, hold_time=1, hold_repeat=False):
        InputDevice.__init__(self, pin, pull_up=pull_up, active_state=active_state)

    @property
    def is_pressed(self):
        return self.is_active

    wait_for_press = InputDevice.wait_for_active
    wait_for_release = InputDevice.wait_for_inactive


class MotionSensor(InputDevice):
    def __init__(self, pin, pull_up=False, **kw):
        InputDevice.__init__(self, pin, pull_up=None if pull_up is False else pull_up)
        self._active_high = True

    @property
    def motion_detected(self):
        return self.is_active

    wait_for_motion = InputDevice.wait_for_active
    wait_for_no_motion = InputDevice.wait_for_inactive


class LineSensor(MotionSensor):
    pass


class OutputDevice(Device):
    def __init__(self, pin, active_high=True, initial_value=False):
        self.pin = _pin(pin)
        self.active_high = active_high
        self._v = 0
        _hw.pin_init(self.pin, 3, 0, -1)
        self.value = 1 if initial_value else 0

    @property
    def value(self):
        return self._v

    @value.setter
    def value(self, v):
        _blinkers.pop(self, None)
        self._set(v)

    def _set(self, v):
        self._v = 1 if v else 0
        _hw.pin_write(self.pin, self._v if self.active_high else 1 - self._v)

    def _blink_step(self, now, b):
        period = b["on"] + b["off"]
        k = (now - b["t0"]) / period if period > 0 else 0
        if b["n"] is not None and k >= b["n"]:
            _blinkers.pop(self, None)
            self._set(0)
            return
        self._set(1 if (k - int(k)) * period < b["on"] else 0)

    @property
    def is_active(self):
        return bool(self._v)

    def on(self):
        self.value = 1

    def off(self):
        self.value = 0

    def toggle(self):
        self.value = 0 if self._v else 1

    def blink(self, on_time=1, off_time=1, n=None, background=True):
        _start_blink(self, on_time, off_time, n, background=background)


DigitalOutputDevice = OutputDevice


class LED(OutputDevice):
    @property
    def is_lit(self):
        return self.is_active


class Buzzer(OutputDevice):
    def beep(self, on_time=1, off_time=1, n=None, background=True):
        _start_blink(self, on_time, off_time, n, background=background)


class PWMOutputDevice(Device):
    def __init__(self, pin, active_high=True, initial_value=0, frequency=100):
        self.pin = _pin(pin)
        self._freq = frequency
        self._v = 0.0
        self.value = initial_value

    def _apply(self):
        _hw.pwm(self.pin, int(self._freq), int(self._v * 65535))

    @property
    def value(self):
        return self._v

    @value.setter
    def value(self, v):
        _blinkers.pop(self, None)
        self._set(v)

    def _set(self, v):
        self._v = max(0.0, min(1.0, float(v)))
        self._apply()

    def _blink_step(self, now, b):
        period = b["fi"] + b["on"] + b["fo"] + b["off"]
        k = (now - b["t0"]) / period if period > 0 else 0
        if b["n"] is not None and k >= b["n"]:
            _blinkers.pop(self, None)
            self._set(0)
            return
        t = (k - int(k)) * period
        if t < b["fi"]:
            self._set(t / b["fi"])
        elif t < b["fi"] + b["on"]:
            self._set(1)
        elif t < b["fi"] + b["on"] + b["fo"]:
            self._set(1 - (t - b["fi"] - b["on"]) / b["fo"])
        else:
            self._set(0)

    def blink(self, on_time=1, off_time=1, fade_in_time=0, fade_out_time=0, n=None, background=True):
        _start_blink(self, on_time, off_time, n, fade_in_time, fade_out_time, background)

    @property
    def frequency(self):
        return self._freq

    @frequency.setter
    def frequency(self, f):
        self._freq = f
        self._apply()

    @property
    def is_active(self):
        return self._v > 0

    def on(self):
        self.value = 1

    def off(self):
        self.value = 0

    def toggle(self):
        self.value = 1 - self._v

    def pulse(self, fade_in_time=1, fade_out_time=1, n=None, background=True):
        _start_blink(self, 0, 0, n, fade_in_time, fade_out_time, background)


class PWMLED(PWMOutputDevice):
    def __init__(self, pin, active_high=True, initial_value=0, frequency=100):
        PWMOutputDevice.__init__(self, pin, active_high, initial_value, frequency)

    @property
    def is_lit(self):
        return self._v > 0


class TonalBuzzer(PWMOutputDevice):
    def __init__(self, pin, **kw):
        PWMOutputDevice.__init__(self, pin, frequency=440)

    def play(self, tone):
        self.frequency = float(tone)
        self.value = 0.5

    def stop(self):
        self.value = 0


class RGBLED(Device):
    def __init__(self, red, green, blue, active_high=True, initial_value=(0, 0, 0), pwm=True):
        self._leds = (PWMLED(red), PWMLED(green), PWMLED(blue))

    @property
    def color(self):
        return tuple(l.value for l in self._leds)

    @color.setter
    def color(self, c):
        for l, v in zip(self._leds, c):
            l.value = v

    value = color

    def on(self):
        self.color = (1, 1, 1)

    def off(self):
        self.color = (0, 0, 0)


class Servo(Device):
    def __init__(self, pin, initial_value=0, min_pulse_width=0.001, max_pulse_width=0.002, frame_width=0.02):
        self.pin = _pin(pin)
        self._minp, self._maxp, self._frame = min_pulse_width, max_pulse_width, frame_width
        self.value = initial_value

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, v):
        self._value = v
        if v is None:
            _hw.pwm(self.pin, 50, 0)
            return
        pulse = self._minp + (v + 1) / 2 * (self._maxp - self._minp)
        _hw.pwm(self.pin, int(1 / self._frame), int(pulse / self._frame * 65535))

    def min(self):
        self.value = -1

    def mid(self):
        self.value = 0

    def max(self):
        self.value = 1

    def detach(self):
        self.value = None


class AngularServo(Servo):
    def __init__(self, pin, initial_angle=0, min_angle=-90, max_angle=90, min_pulse_width=0.001, max_pulse_width=0.002, frame_width=0.02):
        self._amin, self._amax = min_angle, max_angle
        Servo.__init__(self, pin, None, min_pulse_width, max_pulse_width, frame_width)
        self.angle = initial_angle

    @property
    def angle(self):
        return self._angle

    @angle.setter
    def angle(self, a):
        self._angle = a
        if a is None:
            self.value = None
        else:
            self.value = (a - self._amin) / (self._amax - self._amin) * 2 - 1


class DistanceSensor(Device):
    def __init__(self, echo=None, trigger=None, max_distance=1, threshold_distance=0.3, queue_len=9, partial=True):
        self.echo = _pin(echo)
        self.trigger = _pin(trigger)
        self.max_distance = max_distance
        self.threshold_distance = threshold_distance
        _hw.pin_init(self.trigger, 3, 0, 0)
        _hw.pin_init(self.echo, 1, 0, -1)

    @property
    def distance(self):
        _hw.pin_write(self.trigger, 1)
        _hw.sleep_us(10)
        _hw.pin_write(self.trigger, 0)
        t = _hw.pulse_in(self.echo, 1, 30000)
        if t < 0:
            return self.max_distance
        return min(self.max_distance, t / 58 / 100)

    @property
    def value(self):
        return self.distance / self.max_distance

    @property
    def in_range(self):
        return self.distance < self.threshold_distance


class MCP3008(Device):
    def __init__(self, channel=0, differential=False, max_voltage=3.3, **kw):
        self.channel = channel
        self.max_voltage = max_voltage

    @property
    def raw_value(self):
        r = _hw.mcp3008_read(self.channel)
        if r < 0:
            raise GPIOZeroError("MCP3008 not responding — check the SPI wiring (CLK, DIN, DOUT, CS) and power")
        return r

    @property
    def value(self):
        return self.raw_value / 1023

    @property
    def voltage(self):
        return self.value * self.max_voltage


class CPUTemperature(Device):
    temperature = 48.3
`;

export const SMBUS2_PY = `# Simulated smbus2 (I2C on the Raspberry Pi: bus 1 = GPIO2 SDA / GPIO3 SCL)
import _hw


class i2c_msg:
    def __init__(self, addr, data, read=False):
        self.addr = addr
        self.buf = bytes(data)
        self.len = len(self.buf)
        self.is_read = read

    @staticmethod
    def write(addr, data):
        return i2c_msg(addr, data)

    @staticmethod
    def read(addr, length):
        return i2c_msg(addr, bytes(length), True)

    def __iter__(self):
        return iter(self.buf)


class SMBus:
    def __init__(self, bus=1):
        sda, scl = (2, 3) if bus == 1 else (0, 1)
        self._bus = _hw.i2c_open(sda, scl)

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass

    def _w(self, addr, data):
        r = _hw.i2c_write(self._bus, addr, bytes(data).hex())
        if r < 0:
            raise OSError(-r, "I2C device 0x%02x not responding" % addr)

    def _r(self, addr, n):
        r = _hw.i2c_read(self._bus, addr, n)
        if not r or r[0] == "-":
            raise OSError(121, "Remote I/O error (I2C device 0x%02x not responding)" % addr)
        return list(bytes.fromhex(r))

    def write_byte(self, addr, value):
        self._w(addr, [value & 255])

    def read_byte(self, addr):
        return self._r(addr, 1)[0]

    def write_byte_data(self, addr, reg, value):
        self._w(addr, [reg & 255, value & 255])

    def read_byte_data(self, addr, reg):
        self._w(addr, [reg & 255])
        return self._r(addr, 1)[0]

    def write_i2c_block_data(self, addr, reg, data):
        self._w(addr, [reg & 255] + list(data))

    def read_i2c_block_data(self, addr, reg, length):
        self._w(addr, [reg & 255])
        return self._r(addr, length)

    def i2c_rdwr(self, *msgs):
        for m in msgs:
            if m.is_read:
                m.buf = bytes(self._r(m.addr, m.len))
            else:
                self._w(m.addr, m.buf)
`;

export const BOARD_PY = `# Simulated Adafruit Blinka 'board' module: board.D4 == GPIO4
class _P:
    def __init__(self, n):
        self.id = n

    def __repr__(self):
        return "board.D%d" % self.id


for _n in range(28):
    globals()["D%d" % _n] = _P(_n)
SCL = _P(3)
SDA = _P(2)
SCK = _P(11)
MOSI = _P(10)
MISO = _P(9)
`;

export const ADAFRUIT_DHT_PY = `# Simulated adafruit_dht (CircuitPython DHT driver)
import _hw


class DHTBase:
    def __init__(self, pin, use_pulseio=True):
        self._id = pin.id
        _hw.pin_init(self._id, 1, 1, -1)

    def _read(self):
        r = _hw.dht_read(self._id)
        if r[0] < 0:
            raise RuntimeError("DHT sensor not found, check wiring")
        return r

    @property
    def temperature(self):
        return round(self._read()[1] * 10) / 10

    @property
    def humidity(self):
        return round(self._read()[2] * 10) / 10

    def exit(self):
        pass


class DHT22(DHTBase):
    pass


class DHT11(DHTBase):
    pass
`;

export const NEOPIXEL_PI_PY = `# Simulated Adafruit neopixel library (Raspberry Pi): colours go out in pixel_order (GRB / GRBW by default).
import _hw
RGB = "RGB"
GRB = "GRB"
RGBW = "RGBW"
GRBW = "GRBW"


class NeoPixel:
    def __init__(self, pin, n, bpp=3, brightness=1.0, auto_write=True, pixel_order=None):
        self._id = pin.id
        self.n = n
        self.order = pixel_order or (GRBW if bpp == 4 else GRB)
        self.bpp = len(self.order)
        self.brightness = brightness
        self.auto_write = auto_write
        self._buf = [(0,) * self.bpp] * n

    def __len__(self):
        return self.n

    def _colour(self, v):
        if isinstance(v, int):
            v = ((v >> 16) & 255, (v >> 8) & 255, v & 255) if self.bpp == 3 else ((v >> 16) & 255, (v >> 8) & 255, v & 255, (v >> 24) & 255)
        v = tuple(int(x) & 255 for x in v)
        return v + (0,) * (self.bpp - len(v))

    def __setitem__(self, i, v):
        self._buf[i] = self._colour(v)
        if self.auto_write:
            self.show()

    def __getitem__(self, i):
        return self._buf[i]

    def fill(self, v):
        aw = self.auto_write
        self.auto_write = False
        for i in range(self.n):
            self[i] = v
        self.auto_write = aw
        if aw:
            self.show()

    def show(self):
        flat = []
        for c in self._buf:
            by = dict(zip("RGBW", c))
            flat.extend(int(by[ch] * self.brightness) for ch in self.order)
        _hw.neopixel_write(self._id, bytes(flat).hex())

    def deinit(self):
        pass
`;

export const SIGNAL_PY = `# Simulated signal module: pause() waits forever while gpiozero callbacks keep running.
import time

SIGINT = 2
SIGTERM = 15


def pause():
    while True:
        time.sleep(0.05)


def signal(sig, handler):
    return None
`;

/** Time module for the Pi (CPython-style API on top of the simulated clock). */
export const PITIME_EXTRA_PY = `
def strftime(fmt, t=None):
    t = t or localtime()
    return fmt.replace("%H", "%02d" % t[3]).replace("%M", "%02d" % t[4]).replace("%S", "%02d" % t[5]).replace("%Y", str(t[0])).replace("%m", "%02d" % t[1]).replace("%d", "%02d" % t[2])
`;

/** Bootstrap executed before user code: installs the simulated time module. */
export function bootstrapPy(platform: 'mp' | 'pi', board = ''): string {
  // MicroPython boards report themselves in os.uname() (drivers such as mfrc522 pick their SPI setup from sysname).
  const uname = board === 'pico' ? ['rp2', 'Raspberry Pi Pico with RP2040'] : board === 'esp32' ? ['esp32', 'Generic ESP32 module with ESP32'] : null;
  return `import sys
sys.path.insert(0, "/project")
import _simtime
sys.modules["time"] = _simtime
sys.modules["utime"] = _simtime
${platform === 'mp' && uname ? `import _simos
_simos._board("${uname[0]}", "${uname[1]}")
sys.modules["os"] = _simos
sys.modules["uos"] = _simos
` : ''}`;
}

/** The os module with os.uname() describing the simulated board, as on the real port. */
export const SIMOS_PY = `import os as _os
import sys as _sys

for _k in dir(_os):
    if not _k.startswith("__"):
        globals()[_k] = getattr(_os, _k)

try:
    from collections import namedtuple as _nt
    _U = _nt("uname_result", ("sysname", "nodename", "release", "version", "machine"))
except ImportError:
    _U = lambda *a: tuple(a)

_u = None


def _board(sysname, machine):
    global _u
    rel = ".".join(str(x) for x in _sys.implementation.version[:3])
    _u = _U(sysname, sysname, rel, "v" + rel, machine)


def uname():
    return _u
`;

/** MicroPython's built-in onewire module, backed by the simulated bus (scan + ROM select). */
export const ONEWIRE_PY = `import _hw


class OneWireError(Exception):
    pass


class OneWire:
    SEARCH_ROM = 0xF0
    MATCH_ROM = 0x55
    SKIP_ROM = 0xCC

    def __init__(self, pin):
        self.pin = pin
        self._id = pin._id
        self._rom = None

    def reset(self, required=False):
        ok = len(_hw.ow_scan(self._id)) > 0
        if required and not ok:
            raise OneWireError
        return ok

    def scan(self):
        return [bytearray(bytes.fromhex(h)) for h in _hw.ow_scan(self._id)]

    def select_rom(self, rom):
        self.reset()
        self._rom = bytes(rom)

    def writebyte(self, value):
        pass

    def write(self, buf):
        pass

    def readbyte(self):
        return 0xFF

    def crc8(self, data):
        crc = 0
        for b in data:
            for _ in range(8):
                mix = (crc ^ b) & 1
                crc >>= 1
                if mix:
                    crc ^= 0x8C
                b >>= 1
        return crc
`;

/** MicroPython's built-in ds18x20 module (same API), reading the simulated thermometers. */
export const DS18X20_PY = `import _hw
from onewire import OneWireError


class DS18X20:
    def __init__(self, onewire):
        self.ow = onewire

    def scan(self):
        return [rom for rom in self.ow.scan() if rom[0] in (0x10, 0x22, 0x28)]

    def convert_temp(self):
        if not self.ow.reset():
            raise OneWireError

    def read_temp(self, rom):
        t = _hw.ow_temp(self.ow._id, bytes(rom).hex())
        if t is None:
            raise OneWireError
        return t
`;
