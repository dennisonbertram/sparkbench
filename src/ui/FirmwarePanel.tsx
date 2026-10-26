import React, { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { stopSim } from './simClient';
import { Button, Chip, FilePicker, Select } from './ds';

type RuntimeStatus = { available: boolean; demoAvailable: boolean; reason?: string; capabilities: string[] };

export function FirmwarePanel() {
  const project = useStore((s) => s.project)!;
  const runtime = useStore((s) => s.runtime);
  const firmware = useStore((s) => s.firmware);
  const artifact = useStore((s) => s.firmwareArtifact);
  const simStatus = useStore((s) => s.sim.status);
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const running = simStatus === 'running' || simStatus === 'booting';

  async function refresh() {
    try {
      const response = await fetch('/api/esp32/status');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Cannot reach the local firmware runtime.');
      setStatus(data);
    } catch (e) {
      setStatus({ available: false, demoAvailable: false, capabilities: [], reason: e instanceof Error ? e.message : String(e) });
    }
  }
  useEffect(() => { if (runtime === 'esp32-qemu') void refresh(); }, [runtime]);
  useEffect(() => {
    generation.current++;
    setError('');
    setBusy(false);
  }, [project.id, runtime]);

  async function loadFile(file?: File) {
    if (!file) return;
    const version = ++generation.current;
    setError('');
    setBusy(true);
    try {
      if (!file.name.toLowerCase().endsWith('.bin') || file.size !== 4 * 1024 * 1024) {
        useStore.getState().set({ firmware: null, firmwareArtifact: null });
        throw new Error('Choose an exactly 4 MiB merged ESP32 .bin flash image (not an ELF or app-only image).');
      }
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Could not read the firmware file.'));
        reader.readAsDataURL(file);
      });
      if (version !== generation.current) return;
      stopSim(true);
      useStore.getState().set({ firmware: { name: file.name, base64 }, firmwareArtifact: null });
    } catch (e) {
      if (version === generation.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }

  async function loadDemo() {
    const version = ++generation.current;
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/esp32/demo');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Build the demo firmware first.');
      if (version !== generation.current) return;
      stopSim(true);
      useStore.getState().setProject(data.project);
      useStore.getState().set({ runtime: 'esp32-qemu', firmware: 'demo', firmwareArtifact: null, bottomTab: 'serial', tab: 'breadboard', tourStep: null });
    } catch (e) {
      if (version === generation.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }

  return (
    <section className="firmware-panel" aria-label="Simulation runtime">
      <div className="firmware-row">
        <label>Runtime <Select aria-label="Simulation runtime" value={runtime} onChange={(e) => {
          stopSim(true);
          useStore.getState().resetSim();
          useStore.getState().set({ runtime: e.target.value as 'python' | 'esp32-qemu', firmwareArtifact: null });
        }}>
          <option value="python">Python model</option>
          <option value="esp32-qemu" disabled={project.board !== 'esp32'}>ESP32 firmware (QEMU)</option>
        </Select></label>
        {runtime === 'python' ? <span className="muted">Python hardware APIs — not chip emulation.</span> : <>
          <Chip>Local firmware emulator</Chip>
          <span className="muted">GPIO + serial · classic ESP32 · experimental</span>
        </>}
      </div>
      {runtime === 'esp32-qemu' && <>
        <div className="firmware-row">
          <FilePicker className="firmware-upload" accept=".bin" aria-label="ESP32 flash image" disabled={running || busy} onChange={(e) => { void loadFile(e.target.files?.[0]); e.target.value = ''; }}>Choose flash image (.bin)…</FilePicker>
          <Button onClick={() => void loadDemo()} disabled={running || busy || !status?.demoAvailable}>Open LED/button demo</Button>
          <Button variant="ghost" onClick={() => void refresh()} disabled={busy}>Check setup</Button>
        </div>
        <div className="firmware-row" aria-live="polite">
          <strong>{busy ? 'Loading…' : firmware === 'demo' ? 'LED/button demo selected' : firmware?.name ?? 'No firmware selected'}</strong>
          {artifact && <code title={`SHA-256: ${artifact.sha256}`}>SHA-256 {artifact.sha256.slice(0, 16)}…</code>}
          {status && !status.available && <span className="firmware-error">{status.reason ?? 'Native runtime not installed.'}</span>}
          {status?.available && !status.demoAvailable && <span className="muted">Runtime ready; build the demo or load your own image.</span>}
        </div>
        <p className="muted">Run boots the selected binary, not the Python editor. Reset reboots a fresh copy; edits to the circuit stop the run. Images stay in this tab, not saved projects. See <a href="https://github.com/dennisonbertram/sparkbench/blob/main/docs/esp32-runtime.md" target="_blank" rel="noreferrer">setup and limits</a>.</p>
        {firmware === 'demo' && <p>Press Run: the LED blinks. Hold the circuit’s button to keep it on; release to resume blinking.</p>}
        {error && <p className="firmware-error" role="alert">{error}</p>}
      </>}
    </section>
  );
}
