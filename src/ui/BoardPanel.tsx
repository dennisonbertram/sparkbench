// "Your board": everything you do with the real hardware, in one place — connect over USB, install
// MicroPython, copy the program, run the self-test (compared with the simulator), watch the serial
// output, and ask the AI what's wrong.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store';
import { RawRepl } from '../board/rawrepl';
import { SerialLink, serialSupported } from '../board/webserial';
import { installEsp32, installPico } from '../board/install';
import { parseSelfTest, type SelfTestLine } from '../core/selftest';
import { download, slug } from './exporters';
import { MultimeterGuide } from './MultimeterGuide';
import { otaPy, otaBootPy, otaToken } from '../core/ota';

type Phase = 'idle' | 'connecting' | 'connected' | 'busy';

interface DebugAnswer {
  summary: string;
  causes: { cause: string; check: string; fix: string; confidence: string }[];
  next_step: string;
}

export function BoardPanel({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)!;
  const ai = useStore((s) => s.aiStatus);
  const [phase, setPhase] = useState<Phase>('idle');
  const [info, setInfo] = useState('');
  const [needsMp, setNeedsMp] = useState(false);
  const [log, setLog] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [selftest, setSelftest] = useState('');
  const [expected, setExpected] = useState('');
  const [looked, setLooked] = useState<Record<number, boolean>>({});
  const [symptom, setSymptom] = useState('');
  const [answer, setAnswer] = useState<DebugAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [ota, setOta] = useState(false);
  const [ssid, setSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [otaHost, setOtaHost] = useState('');
  const [otaLog, setOtaLog] = useState('');
  const link = useRef<SerialLink | null>(null);
  const repl = useRef<RawRepl | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const kind = project.board;
  const micro = kind === 'esp32' || kind === 'pico';

  const append = (t: string) => setLog((l) => (l + t).slice(-20000));
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);
  useEffect(() => () => void link.current?.close(), []);

  // What a correct build prints, from the simulator, to compare against.
  useEffect(() => {
    if (kind === 'none') return;
    fetch('/api/selftest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project }) })
      .then((r) => r.json())
      .then((d) => setExpected(d.expected ?? ''))
      .catch(() => {});
  }, [project.id, kind]);

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setError('');
    setPhase('busy');
    try {
      return await fn();
    } catch (e: any) {
      setError(`${label}: ${e?.message ?? e}`);
    } finally {
      setPhase(link.current ? 'connected' : 'idle');
      setProgress(null);
    }
  }

  async function connect() {
    setError('');
    setPhase('connecting');
    try {
      const l = await SerialLink.request();
      await l.open(115200);
      l.onClose = () => {
        link.current = null;
        repl.current = null;
        setPhase('idle');
        setInfo('');
      };
      link.current = l;
      const r = new RawRepl(l);
      r.onText = append;
      repl.current = r;
      try {
        await r.enter();
        const i = await r.info();
        setInfo(`${i.version.replace('micropython', 'MicroPython')} on ${i.machine || i.platform}`);
        setNeedsMp(false);
        await r.exit();
      } catch {
        setNeedsMp(true);
        setInfo('Connected, but MicroPython did not answer.');
      }
      setPhase('connected');
    } catch (e: any) {
      setPhase('idle');
      if (!/No port selected/i.test(String(e?.message))) setError(`Couldn't connect: ${e?.message ?? e}`);
    }
  }

  async function disconnect() {
    await link.current?.close();
    link.current = null;
    repl.current = null;
    setPhase('idle');
    setInfo('');
  }

  async function install() {
    if (kind === 'esp32') {
      const port = link.current?.port;
      if (!port) return;
      await link.current!.close();
      link.current = null;
      await run('Installing MicroPython', () => installEsp32(port, (s) => append(`${s}\n`), setProgress));
      setInfo('MicroPython installed. Click Connect again.');
      setNeedsMp(false);
    } else await run('Installing MicroPython', () => installPico((s) => append(`${s}\n`)));
  }

  async function copyProgram() {
    const r = repl.current;
    if (!r) return;
    await run('Copying the program', async () => {
      await r.enter();
      const extra: Record<string, string> = {};
      if (ota && kind === 'esp32') {
        extra['ota.py'] = otaPy(otaToken(project.id));
        extra['boot.py'] = otaBootPy();
        if (!project.files['secrets.py'] && ssid) extra['secrets.py'] = `WIFI_SSID = ${JSON.stringify(ssid)}\nWIFI_PASSWORD = ${JSON.stringify(wifiPass)}\n`;
      }
      const files = Object.entries({ ...project.files, ...extra });
      for (const [i, [name, src]] of files.entries()) {
        append(`Copying ${name} (${i + 1}/${files.length})…\n`);
        await r.writeFile(name, src, (d, t) => setProgress(Math.round(((i + d / t) / files.length) * 100)));
      }
      await r.exit();
      append('Restarting the board to run main.py…\n');
      await r.softReset();
    });
  }

  async function runSelfTest() {
    const r = repl.current;
    if (!r) return;
    setSelftest('');
    setLooked({});
    await run('Running the self-test', async () => {
      const d = await fetch('/api/selftest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project }) }).then((x) => x.json());
      await r.enter();
      await r.writeFile('selftest.py', d.code);
      await r.exec("exec(open('selftest.py').read())", { timeoutMs: 180000, onOutput: (t) => setSelftest((s) => s + t) });
      await r.exit();
    });
  }

  async function stop() {
    const r = repl.current;
    if (r) await run('Stopping', async () => (await r.enter(), await r.exit()));
  }

  async function askAi() {
    setAsking(true);
    setError('');
    setAnswer(null);
    try {
      const res = await fetch('/api/ai/debug', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project, symptom, serial: log, selftest }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'The AI could not answer');
      setAnswer(d);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setAsking(false);
    }
  }

  const parsed = useMemo(() => parseSelfTest(selftest), [selftest]);
  const want = useMemo(() => parseSelfTest(expected), [expected]);
  /** The simulator's result for the same check: the k-th PASS/FAIL line of the same part. */
  const expectFor = (l: SelfTestLine) => {
    const checks = (ls: SelfTestLine[]) => ls.filter((x) => x.part === l.part && (x.kind === 'PASS' || x.kind === 'FAIL'));
    return checks(want.lines)[checks(parsed.lines).indexOf(l)];
  };
  const connected = phase === 'connected' || phase === 'busy';
  const busy = phase === 'busy' || phase === 'connecting';

  return (
    <aside className="board-panel" data-testid="board-panel" aria-label="Your board">
      <header className="panel-head">
        <h2>Your board</h2>
        <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
      </header>
      <div className="bp-body">
        {kind === 'none' && (
          <>
            <p>This circuit has no microcontroller, so there's no program to load. Build it from the Build guide, then use the multimeter checks below if something doesn't work.</p>
            <MultimeterGuide />
          </>
        )}
        {kind === 'rpi4' && (
          <>
            <p>A Raspberry Pi runs your program itself, so you copy the files over the network rather than over USB:</p>
            <ol className="bp-steps">
              <li>Click <strong>Export → Everything (.zip)</strong> and unzip it.</li>
              <li>Copy the <code>firmware</code> folder to the Pi, for example <code>scp -r firmware pi@raspberrypi.local:~/{slug(project.name)}</code>.</li>
              <li>On the Pi, run <code>python3 selftest.py</code> in that folder and paste what it prints below.</li>
              <li>Then start your program with <code>python3 main.py</code>.</li>
            </ol>
            <button onClick={() => fetch('/api/selftest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project }) }).then((r) => r.json()).then((d) => download('selftest.py', d.code, 'text/x-python'))}>Download selftest.py</button>
            <label className="bp-paste">
              Self-test output from the Pi
              <textarea value={selftest} onChange={(e) => setSelftest(e.target.value)} rows={5} placeholder="Paste what python3 selftest.py printed" />
            </label>
          </>
        )}
        {micro && (
          <>
            {!serialSupported() ? (
              <div className="banner">Connecting a board needs Chrome or Edge on a computer (they support Web Serial). You can still download the files from <strong>Export</strong> and follow the Build guide.</div>
            ) : (
              <ol className="bp-steps">
                <li className={connected ? 'done' : ''}>
                  <strong>Plug the {kind === 'esp32' ? 'ESP32' : 'Pico'} into this computer with a USB data cable</strong>, then
                  {connected ? (
                    <span className="bp-row">
                      <span className="bp-ok" data-testid="board-info">✓ {info}</span>
                      <button className="link" onClick={disconnect}>Disconnect</button>
                    </span>
                  ) : (
                    <span className="bp-row">
                      <button className="primary" onClick={connect} disabled={busy} data-testid="board-connect">{phase === 'connecting' ? 'Connecting…' : 'Connect board'}</button>
                      <span className="muted">Pick the port called {kind === 'esp32' ? '"CP2102" or "USB Serial"' : '"Board in FS mode" or "Pico"'}.</span>
                    </span>
                  )}
                </li>
                <li>
                  <strong>Install MicroPython</strong> {needsMp ? <span className="bp-warn">(needed: the board didn't answer)</span> : <span className="muted">(only once per board)</span>}
                  {kind === 'esp32' ? (
                    <span className="bp-row">
                      <button onClick={install} disabled={!connected || busy}>Install MicroPython (erases the board)</button>
                      <span className="muted">If it can't connect: hold the BOOT button while clicking.</span>
                    </span>
                  ) : (
                    <span className="bp-row">
                      <span className="muted">Unplug the Pico, hold its BOOTSEL button while plugging it back in, then</span>
                      <button onClick={install} disabled={busy}>Choose the RPI-RP2 drive</button>
                    </span>
                  )}
                </li>
                <li>
                  <strong>Copy your program</strong>
                  {kind === 'esp32' && (
                    <label className="bp-ota-opt">
                      <input type="checkbox" checked={ota} onChange={(e) => setOta(e.target.checked)} data-testid="board-ota" /> Also set up updates over Wi-Fi (next time, no cable needed)
                    </label>
                  )}
                  {ota && kind === 'esp32' && !project.files['secrets.py'] && (
                    <span className="bp-row">
                      <input value={ssid} onChange={(e) => setSsid(e.target.value)} placeholder="Wi-Fi name" aria-label="Wi-Fi name" />
                      <input value={wifiPass} onChange={(e) => setWifiPass(e.target.value)} placeholder="Wi-Fi password" type="password" aria-label="Wi-Fi password" />
                    </span>
                  )}
                  <span className="bp-row">
                    <button className="primary" onClick={copyProgram} disabled={!connected || busy || needsMp} data-testid="board-copy">Copy to the board and run it</button>
                  </span>
                </li>
                <li>
                  <strong>Check every part</strong>
                  <span className="bp-row">
                    <button onClick={runSelfTest} disabled={!connected || busy || needsMp} data-testid="board-selftest">Run the self-test</button>
                    <span className="muted">It asks you to press buttons and watch LEDs.</span>
                  </span>
                </li>
              </ol>
            )}
            {progress !== null && <div className="bp-progress"><span style={{ width: `${progress}%` }} /></div>}
          </>
        )}

        {error && <div className="banner error">{error}</div>}

        {kind === 'esp32' && (
          <details className="bp-ota" data-testid="board-ota-section">
            <summary>Update over Wi-Fi</summary>
            <p className="muted">After you’ve copied the program once with “Also set up updates over Wi-Fi”, the board prints its address when it starts (e.g. “OTA: send updates to http://192.168.1.42:8266”). Type it here to send a new version without the cable.</p>
            <span className="bp-row">
              <input value={otaHost} onChange={(e) => setOtaHost(e.target.value)} placeholder="Board address, e.g. 192.168.1.42" aria-label="Board address" />
              <button
                disabled={!otaHost.trim() || busy}
                onClick={async () => {
                  setOtaLog('Sending…');
                  const r = await fetch('/api/ota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: otaHost.replace(/^https?:\/\//, '').replace(/:\d+.*$/, ''), project }) });
                  const d = await r.json();
                  setOtaLog(r.ok ? d.log.join('\n') : d.error);
                }}
              >
                Send the program over Wi-Fi
              </button>
            </span>
            {otaLog && <pre className="bp-monitor">{otaLog}</pre>}
          </details>
        )}

        {parsed.lines.length > 0 && (
          <div className="selftest" data-testid="selftest-results">
            <h3>Self-test {parsed.done ? (parsed.done.failed ? `— ${parsed.done.failed} problem${parsed.done.failed > 1 ? 's' : ''}` : '— all automatic checks passed') : '— running…'}</h3>
            <ul>
              {parsed.lines.map((l, i) =>
                l.kind === 'START' || l.kind === 'DONE' ? null : (
                  <li key={i} className={`st-${l.kind.toLowerCase()}${l.kind === 'ACTION' && parsed.lines.slice(i + 1).some((x) => x.part === l.part && (x.kind === 'PASS' || x.kind === 'FAIL')) ? ' st-answered' : ''}`}>
                    <span className="st-mark">{{ PASS: '✓', FAIL: '✗', ACTION: '👉', LOOK: '👀', INFO: 'ℹ' }[l.kind as 'PASS']}</span>
                    <span className="st-part">{l.part}</span> {l.text}
                    {l.kind === 'LOOK' && (
                      <span className="st-look">
                        Did it?{' '}
                        <button className={looked[i] === true ? 'on' : ''} onClick={() => setLooked((x) => ({ ...x, [i]: true }))}>Yes</button>
                        <button className={looked[i] === false ? 'on' : ''} onClick={() => setLooked((x) => ({ ...x, [i]: false }))}>No</button>
                      </span>
                    )}
                    {(l.kind === 'PASS' || l.kind === 'FAIL') && expectFor(l) && expectFor(l)!.text !== l.text && <div className="st-sim">In the simulator: {expectFor(l)!.text}</div>}
                  </li>
                ),
              )}
            </ul>
          </div>
        )}

        {micro && (
          <>
            <div className="bp-monitor-head">
              <h3>Serial monitor</h3>
              <button className="link" onClick={stop} disabled={!connected || busy}>Stop the program</button>
              <button className="link" onClick={() => repl.current?.softReset()} disabled={!connected || busy}>Restart it</button>
              <button className="link" onClick={() => setLog('')}>Clear</button>
            </div>
            <pre className="bp-monitor" ref={logRef} data-testid="board-monitor">{log || 'Output from the real board appears here.'}</pre>
          </>
        )}

        {kind !== 'none' && (
          <div className="bp-debug">
            <h3>Something not working?</h3>
            <textarea value={symptom} onChange={(e) => setSymptom(e.target.value)} rows={2} placeholder='Describe it, e.g. "the screen stays black" or "the LED never lights"' aria-label="Describe the problem" />
            <button className="primary" onClick={askAi} disabled={!ai.enabled || asking || !symptom.trim()} data-testid="board-ask">{asking ? 'Thinking… (about 30 s)' : 'Ask AI what is wrong'}</button>
            {!ai.enabled && <span className="muted"> Needs Claude.</span>}
            <p className="muted">It looks at your description, the serial output and self-test above, what the simulator expects, and the wiring.</p>
            {answer && (
              <div className="bp-answer" data-testid="board-answer">
                <p><strong>{answer.summary}</strong></p>
                <ol>
                  {answer.causes.map((c, i) => (
                    <li key={i}>
                      {c.cause} <span className="muted">({c.confidence} confidence)</span>
                      <div><em>Check:</em> {c.check}</div>
                      <div><em>Fix:</em> {c.fix}</div>
                    </li>
                  ))}
                </ol>
                <p><strong>Next:</strong> {answer.next_step}</p>
              </div>
            )}
            {kind !== 'rpi4' && <MultimeterGuide />}
          </div>
        )}
      </div>
    </aside>
  );
}
