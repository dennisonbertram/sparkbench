// Over-the-air updates for Wi-Fi boards (ESP32 with MicroPython): ota.py runs a tiny HTTP server in a
// background thread; Sparkbench sends new files to it (with the project's secret token) and the board
// restarts with the new program. boot.py connects to Wi-Fi and starts it.

export const OTA_PORT = 8266;

/** A stable per-project secret, so nobody else on the network can replace the program. */
export function otaToken(projectId: string): string {
  let h = 2166136261;
  for (const ch of `sparkbench-ota:${projectId}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  let h2 = h ^ 0x9e3779b9;
  for (const ch of projectId) h2 = Math.imul(h2 ^ ch.charCodeAt(0), 2246822519) >>> 0;
  return (h.toString(36) + h2.toString(36)).slice(0, 16);
}

export function otaPy(token: string): string {
  return `# Over-the-air updates (Sparkbench). Lets Sparkbench send a new program over Wi-Fi.
# Only requests carrying this project's token are accepted.
import socket
import os
try:
    import _thread
except ImportError:
    _thread = None

TOKEN = ${JSON.stringify(token)}
PORT = ${OTA_PORT}


def _reply(conn, code, text):
    conn.send(('HTTP/1.0 %d OK\\r\\nContent-Type: text/plain\\r\\nAccess-Control-Allow-Origin: *\\r\\n\\r\\n%s' % (code, text)).encode())


def _handle(conn):
    req = conn.recv(1024)
    head, _, body = req.partition(b'\\r\\n\\r\\n')
    lines = head.decode().split('\\r\\n')
    method, path = lines[0].split(' ')[:2]
    headers = {}
    for l in lines[1:]:
        k, _, v = l.partition(':')
        headers[k.strip().lower()] = v.strip()
    if headers.get('x-token') != TOKEN:
        _reply(conn, 403, 'wrong token')
        return False
    if method == 'GET' and path == '/info':
        _reply(conn, 200, 'sparkbench-ota ok')
        return False
    if method == 'POST' and path.startswith('/upload?name='):
        name = path.split('=', 1)[1]
        if '/' in name or name.startswith('.') or not name.endswith('.py'):
            _reply(conn, 400, 'bad file name')
            return False
        length = int(headers.get('content-length', '0'))
        data = body
        while len(data) < length:
            chunk = conn.recv(1024)
            if not chunk:
                break
            data += chunk
        tmp = name + '.new'
        with open(tmp, 'wb') as f:
            f.write(data[:length])
        try:
            os.remove(name)
        except OSError:
            pass
        os.rename(tmp, name)
        _reply(conn, 200, 'saved %s (%d bytes)' % (name, length))
        return False
    if method == 'POST' and path == '/reset':
        _reply(conn, 200, 'restarting')
        return True
    _reply(conn, 404, 'unknown')
    return False


def serve(port=PORT, once=False):
    addr = socket.getaddrinfo('0.0.0.0', port)[0][-1]
    s = socket.socket()
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(addr)
    s.listen(2)
    print('OTA ready on port %d' % port)
    while True:
        conn, _ = s.accept()
        restart = False
        try:
            restart = _handle(conn)
        except Exception as e:
            print('OTA error:', e)
        finally:
            conn.close()
        if restart:
            try:
                import machine
                machine.reset()
            except ImportError:
                return
        if once:
            return


def start():
    """Run the update server in the background so main.py keeps running."""
    if _thread:
        _thread.start_new_thread(serve, ())
    else:
        print('OTA needs threads; run ota.serve() instead')
`;
}

/** boot.py: connect to Wi-Fi (secrets.py) and start the OTA server, then main.py runs as usual. */
export function otaBootPy(): string {
  return `# boot.py (Sparkbench): connect to Wi-Fi and start over-the-air updates, then main.py runs.
import network
import time
try:
    from secrets import WIFI_SSID, WIFI_PASSWORD
except ImportError:
    WIFI_SSID = WIFI_PASSWORD = None
if WIFI_SSID:
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if not wlan.isconnected():
        wlan.connect(WIFI_SSID, WIFI_PASSWORD)
        t = time.ticks_ms()
        while not wlan.isconnected() and time.ticks_diff(time.ticks_ms(), t) < 10000:
            time.sleep_ms(200)
    if wlan.isconnected():
        import ota
        print('OTA: send updates to http://%s:%d' % (wlan.ifconfig()[0], ota.PORT))
        ota.start()
`;
}
