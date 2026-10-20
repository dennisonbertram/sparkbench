// A fake USB board for Playwright: implements navigator.serial with a MicroPython raw-REPL
// state machine. Files written over the REPL are kept; "exec(open('selftest.py')...)" answers with
// the simulator's self-test output for the open project (what a correctly wired board prints),
// or window.__selftestOverride if a test sets one (e.g. a wiring fault).
(() => {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let push = null;
  const say = (s) => push && push(enc.encode(s));
  let raw = false;
  let code = '';
  const files = {};
  window.__fakeBoardFiles = files;
  async function selftestOutput() {
    if (window.__selftestOverride) return window.__selftestOverride;
    const project = window.__sparkbench.getState().project;
    const d = await fetch('/api/selftest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project }) }).then((r) => r.json());
    return d.expected.replace('[program finished]', '').trim() + '\n';
  }
  async function run(src) {
    say('OK');
    let out = '';
    const m = /open\("([^"]+)", 'wb'\)/.exec(src);
    if (m) window.__open = m[1], (files[m[1]] = '');
    const w = /w\(binascii\.a2b_base64\("([^"]*)"\)\)/.exec(src);
    if (w) files[window.__open] += atob(w[1]);
    if (src.includes('sys.implementation')) out = 'micropython 1.29.0\nESP32 module with ESP32\nesp32\n';
    if (src.includes("exec(open('selftest.py')")) {
      let text = '';
      try {
        text = await selftestOutput();
      } catch (e) {
        say('\x04Traceback: fake board failed: ' + e + '\x04>');
        return;
      }
      for (const line of text.split('\n')) {
        say(line + '\r\n');
        await new Promise((r) => setTimeout(r, 15));
      }
    }
    say(out + '\x04\x04>');
  }
  const port = {
    async open() {},
    async close() {},
    readable: new ReadableStream({ start(c) { push = (d) => c.enqueue(d); } }),
    writable: new WritableStream({
      async write(chunk) {
        for (const ch of dec.decode(chunk)) {
          if (ch === '\x01') { raw = true; code = ''; say('raw REPL; CTRL-B to exit\r\n>'); }
          else if (ch === '\x02') raw = false;
          else if (ch === '\x03') {}
          else if (ch === '\x04') {
            if (raw) { const src = code; code = ''; await run(src); }
            else say('MPY: soft reboot\r\nStarting main.py\r\n');
          } else if (raw) code += ch;
        }
      },
    }),
    getInfo: () => ({ usbVendorId: 0x10c4, usbProductId: 0xea60 }),
  };
  Object.defineProperty(navigator, 'serial', { value: { requestPort: async () => port, getPorts: async () => [port] } });
})();
