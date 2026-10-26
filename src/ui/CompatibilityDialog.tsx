import { useEffect, useRef, useState } from 'react';
import { canonicalJson, type CompatibilityJob, type CompatibilityReport } from '../core/compatibility';
import { useStore } from './store';
import { Banner, Button, Field, Modal, TextInput } from './ds';
import { download } from './exporters';

export function CompatibilityDialog({ onClose }: { onClose(): void }) {
  const project = useStore((s) => s.project)!;
  const [availability, setAvailability] = useState<{ enabled: boolean; reason?: string } | null>(null);
  const [token, setToken] = useState('');
  const [state, setState] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState<CompatibilityReport | null>(null);
  const [snapshot, setSnapshot] = useState('');
  const controller = useRef<AbortController | null>(null);
  const busy = state === 'queued' || state === 'running' || state === 'submitting';
  const stale = !!snapshot && snapshot !== canonicalJson(project);

  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/compatibility/status', { signal: abort.signal })
      .then(async (r) => { if (!r.ok) throw new Error('Lab API is unavailable on this deployment'); return r.json(); })
      .then(setAvailability)
      .catch((err) => { if (!abort.signal.aborted) setAvailability({ enabled: false, reason: String(err) }); });
    return () => { abort.abort(); controller.current?.abort(); };
  }, []);

  async function run() {
    const abort = new AbortController();
    controller.current = abort;
    setState('submitting'); setError(''); setReport(null);
    const captured = canonicalJson(project);
    setSnapshot(captured);
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const request = async (url: string, method = 'GET', body?: string): Promise<CompatibilityJob> => {
      const response = await fetch(url, { method, body, headers, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Compatibility request failed');
      return result;
    };
    try {
      let job = await request('/api/compatibility/jobs', 'POST', `{"project":${captured}}`);
      const deadline = Date.now() + 16 * 60_000;
      while (job.state === 'queued' || job.state === 'running') {
        setState(job.state);
        await new Promise<void>((resolve) => setTimeout(resolve, 1500));
        if (abort.signal.aborted) return;
        if (Date.now() > deadline) throw new Error('Stopped waiting for the job. The server worker has its own time limit.');
        job = await request(`/api/compatibility/jobs/${job.id}`);
      }
      if (!job.report) throw new Error(job.error ?? 'No compatibility report returned');
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(captured));
      const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
      if (hash !== job.report.project.sha256) throw new Error('Report snapshot does not match the submitted project');
      setReport(job.report); setState('finished');
    } catch (err) { if (!abort.signal.aborted) { setError(String(err)); setState('failed'); } }
  }

  return <Modal title="Check compatibility" onClose={onClose} className="compatibility-dialog" closeLabel="Close compatibility report">
    <p>Verify a schematic with real KiCad tools, not just Sparkbench’s exporter.</p>
    <p className="compatibility-muted">This sends the current project snapshot to your configured Sparkbench server. Nothing is uploaded to Flux or other hosted design tools. Closing this window stops polling; an accepted job still finishes within its server time limit.</p>
    {!availability ? <p>Checking lab availability…</p> : !availability.enabled ? <Banner tone="warn" className="compatibility-notice"><strong>Lab unavailable</strong><p>{availability.reason}</p><a href="https://github.com/dennisonbertram/sparkbench/blob/main/docs/compatibility-lab.md" target="_blank" rel="noreferrer">Self-hosted lab setup</a></Banner> : <div className="compatibility-controls">
      <Field label="Lab access token"><TextInput type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" placeholder="From your lab operator" disabled={busy} /></Field>
      <Button variant="primary" onClick={run} disabled={busy || token.length < 32}>{busy ? `KiCad: ${state}…` : 'Send snapshot & check KiCad'}</Button>
      <small>Kept in memory only; never saved in your project or browser storage.</small>
    </div>}
    <div aria-live="polite">
      {error && <Banner tone="error" className="compatibility-notice">{error}</Banner>}
      {stale && <Banner tone="warn" className="compatibility-notice"><strong>Project changed.</strong> This check applies only to the submitted snapshot. Run again for the current design.</Banner>}
      {report && <>
        <h3>KiCad {report.tool.version ?? '(unavailable)'} — {report.status}</h3>
        <p className="compatibility-muted">Measured schematic checks only. “Passed” does not certify interactive editing, PCB routing, firmware or real hardware.</p>
        <p className="compatibility-hash">Snapshot SHA-256: <code>{report.project.sha256}</code><br />Completed: {new Date(report.finishedAt).toLocaleString()}</p>
        {report.checks.map((check) => <details className="compatibility-check" key={check.id} open={check.status !== 'passed'}>
          <summary><strong>{check.label}</strong><span data-status={check.status}>{check.status}</span></summary><p>{check.detail}</p>
        </details>)}
        <h4>Limits & warnings</h4><ul>{report.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        <Button onClick={() => download('compatibility-report.json', JSON.stringify(report, null, 2), 'application/json')}>Download report (.json)</Button>
      </>}
    </div>
    <h3>Other destinations</h3>
    <p>Flux, EasyEDA, Altium, Wokwi and ngspice: <strong>not tested by this lab</strong>. A successful KiCad check does not verify their importers.</p>
  </Modal>;
}
