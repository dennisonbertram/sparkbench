// "Your board": everything you do with the real hardware, in one place — connect over USB, install
// MicroPython, copy the program, run the self-test (compared with the simulator), watch the serial
// output, and ask the AI what's wrong.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store';
import { useDialog } from './useDialog';
import { RawRepl } from '../board/rawrepl';
import { SerialLink, serialSupported } from '../board/webserial';
import { installEsp32, installPico } from '../board/install';
import { parseSelfTest, pinWords, type SelfTestLine } from '../core/selftest';
import { download, slug } from './exporters';
import { MultimeterGuide } from './MultimeterGuide';
import { CostHint } from './CostHint';
import { otaPy, otaBootPy, otaToken } from '../core/ota';
import { Elapsed } from './Elapsed';
import { Banner, Button, Checkbox, Disclosure, IconButton, PanelHead, TextArea, TextInput } from './ds';

type Phase = 'idle' | 'connecting' | 'connected' | 'busy';

/** Turn browser / esptool errors into advice a beginner can act on. */
export function friendlyError(label: string, e: unknown): string {
  const msg = String((e as any)?.message ?? e ?? '');
  if (/setSignals|Failed to connect|Timed out|timeout|Wrong boot mode|No serial data|sync/i.test(msg))
    return `${label} didn't work: the board didn't answer its USB connection. Hold the BOOT button on the board, click again, and let go once the progress bar moves. If it still fails, try another USB cable (some only carry power) or another USB port.`;
  if (/already open|InvalidStateError|Failed to open|busy/i.test(msg)) return `${label} didn't work: another program (Thonny, the Arduino IDE or another browser tab) is using the board. Close it and try again.`;
  if (/lost|disconnected|NetworkError|device has been/i.test(msg)) return `${label} didn't work: the board was unplugged or restarted part-way. Plug it back in, click Connect board, and try again.`;
  if (/No port selected|NotFoundError/i.test(msg)) return 'No board was chosen. Click Connect board and pick the board in the list.';
  if (/fetch|download|firmware/i.test(msg)) return `${label} didn't work: MicroPython couldn't be downloaded. Check this computer's internet connection and try again.`;
  return `${label} didn't work (${msg}). Unplug the board, plug it back in, and try again.`;
}

/** What the self-test will ask the user to do, for this project. */
function selfTestAsks(project: { features?: { kind: string }[] }): string {
  const kinds = new Set((project.features ?? []).map((f) => f.kind));
  const act = [kinds.has('button') && 'press buttons', kinds.has('pot') && 'turn the knob', kinds.has('switch') && 'flip the switch', kinds.has('pir') && 'wave at the motion sensor'].filter(Boolean) as string[];
  const see = [(kinds.has('led') || kinds.has('rgb') || kinds.has('neopixel')) && 'lights', (kinds.has('oled') || kinds.has('lcd') || kinds.has('epaper')) && 'the screen', kinds.has('buzzer') && 'the buzzer', kinds.has('servo') && 'the servo', kinds.has('relay') && 'the relay'].filter(Boolean) as string[];
  const join = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  if (!act.length && !see.length) return 'It checks each part and says what to fix.';
  return `It checks each part${act.length ? `, asks you to ${join(act)}` : ''}${see.length ? `${act.length ? ' and' : ','} has you watch ${join(see)}` : ''}.`;
}

interface DebugAnswer {
  summary: string;
  causes: { cause: string; check: string; fix: string; confidence: string }[];
  next_step: string;
}

export function BoardPanel({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)!;
  const ai = useStore((s) => s.aiStatus);
  const panelRef = useDialog<HTMLElement>(onClose, { trap: false });
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
  const [confirmErase, setConfirmErase] = useState(false);
  const [stale, setStale] = useState(false);
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
  // Wide screens: make room for the panel instead of covering the canvas and the tabs.
  useEffect(() => {
    document.body.classList.add('board-panel-open');
    return () => document.body.classList.remove('board-panel-open');
  }, []);

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
      setError(friendlyError(label, e));
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
      if (!/No port selected/i.test(String(e?.message))) setError(friendlyError('Connecting', e));
    }
  }

  async function disconnect() {
    if (selftest) setStale(true);
    await link.current?.close();
    link.current = null;
    repl.current = null;
    setPhase('idle');
    setInfo('');
  }

  async function install() {
    setConfirmErase(false);
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
      const files = Object.entries({ ...project.files, ...extra }).filter(([n]) => /^[\w.-]+\.py$/.test(n));
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
    setStale(false);
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
    if (r) await run('Stopping', async () => (await r.enter(), await r.exit(), append('\n[program stopped — click Restart it to run main.py again]\n')));
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
  const wifiMissing = ota && kind === 'esp32' && !project.files['secrets.py'] && !ssid.trim();
  const problems = (parsed.done?.failed ?? 0) + parsed.lines.filter((l, i) => l.kind === 'LOOK' && looked[i] === false).length;
  const lookPin = (label: string) => {
    const f = project.features?.find((x) => x.label === label);
    return f ? Object.values(f.pins).map(pinWords).join(' / ') : '';
  };
  const busy = phase === 'busy' || phase === 'connecting';

  return (
    <aside className="board-panel" data-testid="board-panel" aria-label="Your board" ref={panelRef}>
      <PanelHead title="Your board">
        <IconButton label="Close" onClick={onClose}>✕</IconButton>
      </PanelHead>
      <div className="bp-body">
        {kind === 'none' && (
          <>
            <p>This circuit has no microcontroller, so there's no program to load. Build it from the Build guide, then use the multimeter checks below if something doesn't work.</p>
            <MultimeterGuide />
          </>
        )}
        {kind === 'rpi4' && (
          <>
            <p>A Raspberry Pi runs your program itself, so you copy the files to it rather than over a USB cable:</p>
            <ol className="bp-steps">
              <li>Click <strong>Export → Everything (.zip)</strong> and unzip it. The <code>firmware</code> folder holds your program and <code>selftest.py</code>.</li>
              <li>Copy the <code>firmware</code> folder to the Pi: with a keyboard and screen on the Pi, use a USB stick; from this computer, run <code>scp -r firmware pi@raspberrypi.local:~/{slug(project.name)}</code> in a terminal (Terminal on a Mac, PowerShell on Windows).</li>
              <li>Open a terminal on the Pi (the black <code>&gt;_</code> icon in its top bar, or <code>ssh pi@raspberrypi.local</code> from this computer), go into the folder with <code>cd ~/{slug(project.name)}</code>, run <code>python3 selftest.py</code> and paste what it prints below.</li>
              <li>Then start your program with <code>python3 main.py</code>.</li>
            </ol>
            <Button variant="link" onClick={() => fetch('/api/selftest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project }) }).then((r) => r.json()).then((d) => download('selftest.py', d.code, 'text/x-python'))}>Or download just selftest.py</Button>
            <label className="bp-paste">
              Self-test output from the Pi
              <TextArea value={selftest} onChange={(e) => setSelftest(e.target.value)} rows={5} placeholder="Paste what python3 selftest.py printed" />
            </label>
          </>
        )}
        {micro && (
          <>
            {!serialSupported() ? (
              <Banner>Connecting a board needs Chrome or Edge on a computer (they support Web Serial). You can still download the files from <strong>Export</strong> and follow the Build guide.</Banner>
            ) : (
              <ol className="bp-steps">
                <li className={connected ? 'done' : ''}>
                  <strong>Plug the {kind === 'esp32' ? 'ESP32' : 'Pico'} into this computer with a USB data cable</strong>, then
                  {connected ? (
                    <span className="bp-row">
                      <span className="bp-ok" data-testid="board-info">✓ {info}</span>
                      <Button variant="link" onClick={disconnect}>Disconnect</Button>
                    </span>
                  ) : (
                    <span className="bp-row">
                      <Button variant="primary" onClick={connect} disabled={busy} data-testid="board-connect">{phase === 'connecting' ? 'Connecting…' : 'Connect board'}</Button>
                      <span className="muted">Pick the port called {kind === 'esp32' ? '"CP2102" or "USB Serial"' : '"Board in FS mode" or "Pico"'}.{kind === 'esp32' && ' If it can’t connect, hold the BOOT button on the board while you click.'}</span>
                    </span>
                  )}
                </li>
                <li className={connected && !needsMp ? 'done' : ''}>
                  <strong>Install MicroPython</strong> {needsMp ? <span className="bp-warn">(needed: the board didn't answer)</span> : connected ? <span className="bp-ok" data-testid="mp-installed">✓ already installed — skip this step</span> : <span className="muted">(only once per board)</span>}
                  {kind === 'esp32' ? (
                    confirmErase ? (
                      <Banner variant="inline" tone="warn" role="alert" className="bp-row bp-confirm">
                        <span>This erases everything on the board, including any program already on it. Continue?</span>
                        <Button variant="primary" onClick={install} data-testid="board-install-confirm">Erase and install</Button>
                        <Button variant="link" onClick={() => setConfirmErase(false)}>Cancel</Button>
                      </Banner>
                    ) : (
                      <span className="bp-row">
                        <Button variant={needsMp ? 'primary' : connected ? 'link' : 'default'} onClick={() => setConfirmErase(true)} disabled={!connected || busy} data-testid="board-install">{needsMp || !connected ? 'Install MicroPython (erases the board)' : 'Reinstall MicroPython anyway…'}</Button>
                      </span>
                    )
                  ) : (
                    <span className="bp-row">
                      <span className="muted">Unplug the Pico, hold its BOOTSEL button while plugging it back in, then</span>
                      <Button onClick={install} disabled={busy}>Choose the RPI-RP2 drive</Button>
                    </span>
                  )}
                </li>
                <li>
                  <strong>Copy your program</strong>
                  {kind === 'esp32' && (
                    <Checkbox className="bp-ota-opt" checked={ota} onChange={(e) => setOta(e.target.checked)} data-testid="board-ota" label="Also set up updates over Wi-Fi (next time, no cable needed)" />
                  )}
                  {ota && kind === 'esp32' && !project.files['secrets.py'] && (
                    <span className="bp-row">
                      <TextInput value={ssid} onChange={(e) => setSsid(e.target.value)} placeholder="Wi-Fi name" aria-label="Wi-Fi name" />
                      <TextInput value={wifiPass} onChange={(e) => setWifiPass(e.target.value)} placeholder="Wi-Fi password" type="password" aria-label="Wi-Fi password" />
                    </span>
                  )}
                  <span className="bp-row">
                    <Button variant="primary" onClick={copyProgram} disabled={!connected || busy || needsMp || wifiMissing} data-testid="board-copy">Copy to the board and run it</Button>
                    {wifiMissing && <span className="bp-warn">Type your Wi-Fi name (and password) first, or untick the Wi-Fi option.</span>}
                  </span>
                </li>
                <li>
                  <strong>Check every part</strong>
                  <span className="bp-row">
                    <Button onClick={runSelfTest} disabled={!connected || busy || needsMp} data-testid="board-selftest">Run the self-test</Button>
                    <span className="muted">{selfTestAsks(project)}</span>
                  </span>
                </li>
              </ol>
            )}
            {progress !== null && <div className="bp-progress"><span style={{ width: `${progress}%` }} /></div>}
          </>
        )}

        {error && <Banner tone="error">{error}</Banner>}

        {kind === 'esp32' && (
          <Disclosure className="bp-ota" summary="Update over Wi-Fi" data-testid="board-ota-section">
            <p className="muted">After you’ve copied the program once with “Also set up updates over Wi-Fi”, the board prints its network address in the serial monitor when it starts, e.g. “OTA: send updates to http://192.168.1.42:8266” (OTA means “over the air”, i.e. over Wi-Fi). Type the address here to send a new version without the cable.</p>
            <span className="bp-row">
              <TextInput value={otaHost} onChange={(e) => setOtaHost(e.target.value)} placeholder="e.g. 192.168.1.42" aria-label="Board address" />
              <Button
                disabled={!otaHost.trim() || busy}
                onClick={async () => {
                  setOtaLog('Sending…');
                  const r = await fetch('/api/ota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: otaHost.replace(/^https?:\/\//, '').replace(/:\d+.*$/, ''), project: { ...project, files: Object.fromEntries(Object.entries(project.files).filter(([n]) => /^[\w.-]+\.py$/.test(n))) } }) });
                  const d = await r.json();
                  setOtaLog(r.ok ? d.log.join('\n') : d.error);
                }}
              >
                Send the program over Wi-Fi
              </Button>
            </span>
            {otaLog && <pre className="bp-monitor">{otaLog}</pre>}
          </Disclosure>
        )}

        {parsed.lines.length > 0 && (
          <div className={`selftest${stale ? ' stale' : ''}`} data-testid="selftest-results">
            <h3>Self-test {parsed.done ? (problems ? `— ${problems} problem${problems > 1 ? 's' : ''}` : '— all automatic checks passed') : stale ? '' : '— running…'}{stale && <span className="muted"> (from before you disconnected)</span>}</h3>
            <ul>
              {parsed.lines.map((l, i) =>
                l.kind === 'START' || l.kind === 'DONE' ? null : (
                  <li key={i} className={`st-${l.kind.toLowerCase()}${l.kind === 'ACTION' && parsed.lines.slice(i + 1).some((x) => x.part === l.part && (x.kind === 'PASS' || x.kind === 'FAIL')) ? ' st-answered' : ''}`}>
                    <span className="st-mark">{{ PASS: '✓', FAIL: '✗', ACTION: '👉', LOOK: '👀', INFO: 'ℹ' }[l.kind as 'PASS']}</span>
                    <span className="st-part">{l.part}</span> {l.text}
                    {l.kind === 'LOOK' && (
                      <span className="st-look">
                        Did it?{' '}
                        <Button on={looked[i] === true} onClick={() => setLooked((x) => ({ ...x, [i]: true }))}>Yes</Button>
                        <Button
                          on={looked[i] === false}
                          onClick={() => {
                            setLooked((x) => ({ ...x, [i]: false }));
                            setSymptom((s) => s || `The self-test asked me to check that the ${l.part} ${l.text.replace(/\s*\(.*\)\s*$/, '')}, and it didn't.`);
                          }}
                        >
                          No
                        </Button>
                      </span>
                    )}
                    {l.kind === 'LOOK' && looked[i] === false && <div className="st-hint">Check its power and GND wires{lookPin(l.part) ? ` and its signal wire to ${lookPin(l.part)}` : ''}, and that it's the right way round. Still stuck? Click <strong>Ask AI what is wrong</strong> below — your answer is already filled in.</div>}
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
              <Button variant="link" onClick={stop} disabled={!connected || busy}>Stop the program</Button>
              <Button variant="link" onClick={() => repl.current?.softReset()} disabled={!connected || busy}>Restart it</Button>
              <Button variant="link" onClick={() => setLog('')}>Clear</Button>
            </div>
            <pre className="bp-monitor" ref={logRef} data-testid="board-monitor">{log || 'Output from the real board appears here.'}</pre>
          </>
        )}

        {kind !== 'none' && (
          <div className="bp-debug">
            <h3>Something not working?</h3>
            <TextArea value={symptom} onChange={(e) => setSymptom(e.target.value)} rows={2} placeholder='Describe it, e.g. "the screen stays black" or "the LED never lights"' aria-label="Describe the problem" />
            <Button variant="primary" onClick={askAi} disabled={!ai.enabled || asking || !symptom.trim()} data-testid="board-ask">{asking ? <Elapsed label="Thinking…" usual={30} /> : 'Ask AI what is wrong'}</Button>
            {!ai.enabled ? <span className="muted"> Needs Claude.</span> : <CostHint kind="debug" />}
            <p className="muted">{kind === 'rpi4' ? 'It looks at your description, the self-test output you pasted above, what the simulator expects, and the wiring.' : 'It looks at your description, the serial monitor and self-test above, what the simulator expects, and the wiring.'}</p>
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
            <MultimeterGuide />
          </div>
        )}
      </div>
    </aside>
  );
}
