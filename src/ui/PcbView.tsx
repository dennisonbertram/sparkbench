// "Circuit board" tab: turns the design into a real, routed printed circuit board (KiCad +
// Freerouting on the local server) and hands over the files a PCB factory needs.
import { BOARDS } from '../core/boards';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store';
import { slug } from './exporters';
import { Revisions } from './Revisions';
import { CostHint } from './CostHint';
import { CaseSection } from './CaseSection';
import { BoardEditor, type PlacedPart } from './BoardEditor';

interface DrcItem { severity: string; type: string; description: string }
interface Result {
  name: string;
  widthMm: number;
  heightMm: number;
  routed: boolean;
  tracks: number;
  vias: number;
  drc: { errors: DrcItem[]; warnings: DrcItem[]; unconnected: number };
  files: string[];
  problems: string[];
  fab: { id: string; name: string; track: number; drill: number; quote: string };
  placement: PlacedPart[];
  panel: { rows: number; cols: number; drcErrors: number } | null;
  variant: 'prototype' | 'product';
  productNotes: string[];
  sourcing: {
    lines: { ref: string; item: string; quantity: number; lcsc: string | null; mfr: string | null; stock: number; basic: boolean; unit: number | null; url: string | null }[];
    cost: { boards: number; parts: number; perBoard: number; missing: number }[];
    dfm: { level: 'ok' | 'note' | 'warn'; text: string }[];
  } | null;
}
interface Status { log: string[]; done: boolean; error?: string; result?: Result }

const PLAIN: Record<string, string> = {
  clearance: 'Two pieces of copper are closer together than the factory can reliably make.',
  unconnected_items: 'A connection still needs a track.',
  shorting_items: 'Two different signals touch, which would be a short circuit.',
  tracks_crossing: 'Two tracks cross on the same layer.',
  courtyards_overlap: 'Two parts are placed too close to each other to solder.',
  silk_overlap: 'Some printed labels overlap. That only affects looks.',
  silk_over_copper: 'A printed label runs over a solder pad. That only affects looks.',
  silk_edge_clearance: 'A printed label runs off the edge of the board, so part of it may be cut off.',
  text_height: 'Some printed text is very small and may be hard to read.',
  text_thickness: 'Some printed text is very thin and may print faintly.',
  hole_clearance: 'A hole is very close to copper; the factory can usually still make it.',
  copper_edge_clearance: 'Some copper is very close to the board edge.',
  lib_footprint_mismatch: 'A footprint differs slightly from the library version. This is harmless.',
  'schematic_parity:net_conflict': 'A pad is connected differently from the schematic.',
  'schematic_parity:missing_footprint': 'A part in the schematic is missing from the board.',
  'schematic_parity:extra_footprint': 'The board has a part that is not in the schematic.',
};

const jobKey = (id: string) => `sb-pcb-job-${id}`;
/** Which design (and revision) the remembered board was built from, so it is known after a reload too. */
const builtKey = (id: string) => `sb-pcb-built-${id}`;
const sentence = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);

export function PcbView() {
  const project = useStore((s) => s.project)!;
  const tools = useStore((s) => s.aiStatus.pcb);
  const [job, setJob] = useState<string | null>(() => {
    try {
      return localStorage.getItem(jobKey(project.id));
    } catch {
      return null;
    }
  });
  const [status, setStatus] = useState<Status | null>(null);
  const [side, setSide] = useState<'top' | 'bottom' | 'copper'>('top');
  const [fab, setFab] = useState<'jlcpcb' | 'pcbway' | 'oshpark'>('jlcpcb');
  const [qrUrl, setQrUrl] = useState('');
  const [editing, setEditing] = useState(false);
  const [variant, setVariant] = useState<'prototype' | 'product'>('prototype');
  const [panel, setPanel] = useState('1x1');
  const [error, setError] = useState('');
  const designKey = useMemo(() => JSON.stringify([project.board, project.parts.map((p) => [p.id, p.type, p.props]), project.wires.map((w) => [w.a, w.b])]), [project]);
  const [builtFor, setBuiltFor] = useState<{ job: string; design: string; rev: string | null } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(builtKey(project.id)) ?? 'null');
    } catch {
      return null;
    }
  });
  const [started, setStarted] = useState(0);
  const [now, setNow] = useState(Date.now());
  const retried = useRef(false);
  const rebuild = useRef<(() => void) | null>(null);

  // Poll the job until it finishes.
  useEffect(() => {
    if (!job) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/pcb/status?id=${job}`);
        if (r.status === 404) {
          // The server forgot this build (it restarted). Start a build you are watching again, once.
          setJob(null);
          if (stop || !started) return;
          if (!retried.current) {
            retried.current = true;
            rebuild.current?.();
          } else setError('The board builder restarted before your board was finished. Click the button above to try again.');
          return;
        }
        const s: Status = await r.json();
        if (stop) return;
        setStatus(s);
        if (s.done) retried.current = false;
        else setTimeout(tick, 900);
      } catch {
        if (!stop) setTimeout(tick, 2000);
      }
    };
    tick();
    return () => {
      stop = true;
    };
  }, [job]);

  async function build(fixed?: Record<string, { x: number; y: number; rot: number }>) {
    setError('');
    setStatus(null);
    setEditing(false);
    rebuild.current = () => build(fixed);
    try {
      const r = await fetch('/api/pcb/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project, fab, qrUrl, fixed, variant, panel: { rows: Number(panel[0]), cols: Number(panel[2]) } }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Could not start the board design.');
      setJob(d.id);
      setStarted(Date.now());
      const built = { job: d.id, design: designKey, rev: project.revision ?? null };
      setBuiltFor(built);
      try {
        localStorage.setItem(builtKey(project.id), JSON.stringify(built));
        localStorage.setItem(jobKey(project.id), d.id);
      } catch {
        /* not remembered across reloads */
      }
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }

  const res = status?.result;
  // When a build finishes while you watch, bring its result into view (the progress list is above it).
  const running = !!job && !!status && !status.done;
  const watching = useRef(false);
  if (running) watching.current = true;
  useEffect(() => {
    if (!res || !watching.current) return;
    watching.current = false;
    document.querySelector('[data-testid=pcb-result]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [!!res]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  const known = builtFor && builtFor.job === job ? builtFor : null;
  // A board remembered from before this was tracked: we can't tell what it was built from, so treat it as out of date.
  const stale = !!res && (!known || known.design !== designKey);
  const revStale = !!res && !stale && (known?.rev ?? null) !== (project.revision ?? null);
  const label = (r: string | null | undefined) => (r ? `Rev ${r}` : 'Draft');
  const file = (path: string) => `/api/pcb/file?id=${job}&path=${encodeURIComponent(path)}`;
  const name = slug(project.name);
  const ok = res && res.routed && res.drc.errors.length === 0 && res.drc.unconnected === 0 && res.problems.length === 0;

  if (tools && !tools.kicad)
    return (
      <div className="docview">
        <div className="pcb-view">
          <h2>Circuit board</h2>
          <p>Designing a circuit board needs <a href="https://www.kicad.org/download/" target="_blank" rel="noreferrer">KiCad</a> (free) installed on this computer. Install it and reload this page.</p>
        </div>
      </div>
    );

  return (
    <div className="docview" data-testid="pcb-view">
      <div className="pcb-view">
        <div className="pcb-head">
          <div>
            <h2>Circuit board</h2>
            <p>Turn this design into a real printed circuit board: a sturdy, permanent version of your breadboard that a factory makes for you. Sparkbench places the parts, draws the copper tracks, checks everything against the factory's rules, and gives you the files to order it.</p>
          </div>
          {!running && <CostHint kind="pcb" />}
          {!running && (
            <button className="primary" onClick={() => build()} data-testid="pcb-build">
              {res ? (stale ? 'Update the board for the changed design' : revStale ? `Rebuild so the board prints ${label(project.revision)}` : 'Design it again') : 'Design my circuit board'}
            </button>
          )}
        </div>

        <Revisions />
        {!running && (
          <div className="pcb-options">
            <fieldset className="pcb-variant" data-testid="pcb-variant">
              <legend>Version</legend>
              <label className={variant === 'prototype' ? 'on' : ''}>
                <input type="radio" name="variant" checked={variant === 'prototype'} onChange={() => setVariant('prototype')} />
                <strong>Prototype</strong> <span>Your dev board and modules plug into sockets. You solder it yourself.</span>
              </label>
              <label className={variant === 'product' ? 'on' : ''}>
                <input type="radio" name="variant" checked={variant === 'product'} onChange={() => setVariant('product')} data-testid="pcb-variant-product" />
                <strong>Product</strong> <span>The chips go on the board{project.board === 'esp32' ? ' (bare ESP32 module, USB, regulator)' : ''}, with small surface-mount parts the factory assembles.</span>
              </label>
            </fieldset>
            <label>
              Made by
              <select value={fab} onChange={(e) => setFab(e.target.value as any)} data-testid="pcb-fab">
                <option value="jlcpcb">JLCPCB</option>
                <option value="pcbway">PCBWay</option>
                <option value="oshpark">OSH Park</option>
              </select>
            </label>
            <label>
              Boards per panel
              <select value={panel} onChange={(e) => setPanel(e.target.value)} data-testid="pcb-panel">
                <option value="1x1">Single boards</option>
                <option value="2x2">Panel of 4 (2×2, snap apart)</option>
                <option value="3x3">Panel of 9 (3×3, snap apart)</option>
              </select>
            </label>
            <label className="grow">
              QR code on the board (optional)
              <input value={qrUrl} onChange={(e) => setQrUrl(e.target.value)} placeholder="https://… your blog post or repo" data-testid="pcb-qr" />
            </label>
          </div>
        )}
        {error && <div className="banner error">{error}</div>}
        {tools && !tools.freerouting && <div className="banner">Automatic track routing needs Java and Freerouting. Without them you get the placed board and you route it yourself in KiCad.</div>}

        {(running || (status && !res && !status.error)) && (
          <>
          <p className="pcb-elapsed" role="status">Working… {started ? `${Math.max(0, Math.round((now - started) / 1000))} s so far · ` : ''}usually 15–40 s, longer for big boards.</p>
          <ol className="pcb-steps" data-testid="pcb-progress">
            {[
              { label: 'Placing the parts and routing the copper tracks', at: 1 },
              { label: 'Checking design rules (KiCad DRC)', at: 3 },
              { label: 'Exporting manufacturing files', at: 4 },
              { label: 'Rendering the board in 3D', at: 5 },
            ].map((st, i, all) => {
              const n = status?.log.length ?? 0;
              const last = i === all.length - 1;
              // The last step stays "running" until the finished board actually arrives.
              const done = !!status?.done || (!last && (n > st.at || n >= all[i + 1].at));
              const current = !done && (n >= st.at || (last && n > all[i - 1].at));
              return (
                <li key={st.label} className={done ? 'done' : current ? 'current' : ''}>
                  {i === 0 && status?.log[1] ? `${st.label}: ${status.log[1].toLowerCase()}` : st.label}
                </li>
              );
            })}
          </ol>
          </>
        )}
        {status?.error && <div className="banner error">The board design failed: {status.error}</div>}

        {res && (
          <div className="pcb-result" data-testid="pcb-result">
            {stale && <div className="banner warn" data-testid="pcb-stale">{known ? 'You changed the design since this board was made.' : 'This board was made earlier and may not match your current design.'} Click <strong>Update the board</strong> to redo it before you order: the files below are for the old design.</div>}
            {revStale && <div className="banner" data-testid="pcb-rev-stale">Your design hasn’t changed, but you released {label(project.revision)}. This board still prints “{label(known?.rev)}”. Click <strong>Rebuild</strong> so the board and its documents say {label(project.revision)}.</div>}
            {res.variant === 'product' && res.productNotes.length > 0 && (
              <div className="pcb-product-notes" data-testid="pcb-product-notes">
                <strong>Product version: what changed</strong>
                <ul>{res.productNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                <p className="muted">The program stays the same. The KiCad project in "All board files" has the full product schematic.</p>
              </div>
            )}
            <div className={`pcb-verdict ${ok ? 'ok' : 'bad'}`}>
              <strong>{ok ? '✓ Ready to order' : 'Needs attention before ordering'}</strong>
              <p>
                {res.widthMm} × {res.heightMm} mm, 2 copper layers, {res.tracks} tracks{res.vias ? ` and ${res.vias} vias (small holes that pass a track to the other side)` : ''}, ground fill on both sides, 4 M3 mounting holes.{' '}
                {ok ? `KiCad’s design rule check found no errors against ${res.fab.name}’s standard limits (tracks and gaps at least ${res.fab.track} mm, holes at least ${res.fab.drill} mm). KiCad also confirmed that every pad matches the schematic and every connection has a track.` : ''}
              </p>
              {!ok && (
                <ul>
                  {!res.routed && <li>Automatic routing didn't finish. Open the KiCad board file and route the remaining connections.</li>}
                  {res.drc.unconnected > 0 && <li>{res.drc.unconnected} connection{res.drc.unconnected === 1 ? '' : 's'} still need a track.</li>}
                  {res.drc.errors.map((e, i) => <li key={i}>{PLAIN[e.type] ?? e.description} <span className="pcb-tech">({e.type})</span></li>)}
                  {res.problems.map((p, i) => <li key={`p${i}`}>{p}</li>)}
                </ul>
              )}
              {res.panel && <p data-testid="pcb-panel-note">Panel: {res.panel.rows * res.panel.cols} boards on one sheet with V-score lines to snap them apart, rails with fiducials and tooling holes for assembly. {res.panel.drcErrors ? `KiCad found ${res.panel.drcErrors} problem${res.panel.drcErrors > 1 ? 's' : ''} on the panel.` : 'KiCad’s rule check on the panel found no errors.'}</p>}
              {res.drc.warnings.length > 0 &&
                (() => {
                  const notes = [...new Set(res.drc.warnings.map((w) => sentence(PLAIN[w.type] ?? w.description)))];
                  return (
                    <div className="pcb-note" data-testid="pcb-minor">
                      {notes.length === 1 ? `Minor note: ${notes[0]}` : `${notes.length} minor notes:`}
                      {notes.length > 1 && <ul>{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
                    </div>
                  );
                })()}
            </div>

            <div className={`pcb-downloads${stale ? ' stale' : ''}`} title={stale ? 'These files are for the old design: update the board first' : undefined}>
              <a className="button primary" href={`/api/pcb/zip?id=${job}&kind=fab&name=${name}`} data-testid="pcb-gerbers">Download files for the factory (.zip)</a>
              <a className="button" href="#pcb-order" onClick={(e) => (e.preventDefault(), document.getElementById('pcb-order')?.scrollIntoView({ behavior: 'smooth' }))}>How to order it</a>
              <a className="button" href={`/api/pcb/zip?id=${job}&kind=all&name=${name}`}>All board files: KiCad, 3D, assembly (.zip)</a>
              <a className="button" href={file(`fab/bom-jlcpcb.csv`)}>Assembly parts list (BOM)</a>
              <a className="button" href={file(`fab/cpl-jlcpcb.csv`)}>Part positions (CPL)</a>
              {res.panel && <a className="button" href={`/api/pcb/zip?id=${job}&kind=panel&name=${name}`} data-testid="pcb-panel-zip">Panel of {res.panel.rows * res.panel.cols} for the factory (.zip)</a>}
              <a className="button" href={`${file('fab/assembly.pdf')}&view`} target="_blank" rel="noreferrer">Assembly drawing (PDF)</a>
              <a className="button" href={`${file('TEST.md')}&view`} target="_blank" rel="noreferrer">Test procedure</a>
              <a className="button" href={`${file('COMPLIANCE.md')}&view`} target="_blank" rel="noreferrer">Selling it? Compliance checklist</a>
            </div>

            <div className="pcb-arrange">
              <button onClick={() => setEditing((e) => !e)} data-testid="pcb-arrange">{editing ? 'Close the editor' : 'Arrange the parts myself'}</button>
            </div>
            {editing && res.placement?.length > 0 && <BoardEditor parts={res.placement} width={res.widthMm} height={res.heightMm} busy={running} onApply={(f) => build(f)} />}

            <div className="pcb-picture">
              <div className="pcb-toggle" role="tablist">
                {(['top', 'bottom', 'copper', ...(res.panel ? ['panel'] : [])] as const).map((s) => (
                  <button key={s} role="tab" aria-selected={side === s} className={side === s ? 'active' : ''} onClick={() => setSide(s as any)}>
                    {s === 'top' ? 'Top' : s === 'bottom' ? 'Bottom' : s === 'copper' ? 'Copper tracks' : `Panel of ${res.panel!.rows * res.panel!.cols}`}
                  </button>
                ))}
              </div>
              <img src={file(side === 'top' ? 'board-top.png' : side === 'bottom' ? 'board-bottom.png' : (side as string) === 'panel' ? 'fab/panel/panel-top.png' : 'board.svg')} alt={`Circuit board, ${side} view`} className={side === 'copper' ? 'copper' : ''} />
            </div>

            {res.sourcing ? (
              <div className="pcb-sourcing" data-testid="pcb-sourcing">
                <h3>Before you order</h3>
                <ul className="pcb-dfm">
                  {res.sourcing.dfm.map((d, i) => (
                    <li key={i} className={d.level}>{d.level === 'ok' ? '✓' : d.level === 'warn' ? '!' : 'ℹ'} {d.text}</li>
                  ))}
                </ul>
                <h3>What the parts cost (parts only)</h3>
                <table className="bom pcb-cost">
                  <thead><tr><th>Boards</th><th className="num">Parts for all boards (LCSC, live)</th><th className="num">Parts per board</th></tr></thead>
                  <tbody>
                    {res.sourcing.cost.map((c) => (
                      <tr key={c.boards}><td>{c.boards}</td><td className="num">${c.parts.toFixed(2)}</td><td className="num">${c.perBoard.toFixed(2)}</td></tr>
                    ))}
                  </tbody>
                </table>
                <p className="pcb-note">
                  Not included: the circuit boards themselves, assembly and shipping
                  {res.variant === 'prototype' && project.board !== 'none' ? `, and the ${project.board === 'esp32' ? 'ESP32 board' : project.board === 'pico' ? 'Pico' : project.board === 'rpi4' ? 'Raspberry Pi' : BOARDS[project.board].name} and modules that plug into the sockets (the sockets are included)` : ''}
                  {res.sourcing.cost[0].missing ? `, and ${res.sourcing.cost[0].missing} part${res.sourcing.cost[0].missing > 1 ? 's' : ''} LCSC doesn’t stock (marked “buy separately” below)` : ''}. The bare boards are priced by the maker when you upload the files: <a href={res.fab.quote} target="_blank" rel="noreferrer">get a {res.fab.name} quote</a>.
                </p>
                <details>
                  <summary>Parts for the board ({res.sourcing.lines.length})</summary>
                  <table className="bom">
                    <thead><tr><th>Ref</th><th>What</th><th>Qty</th><th>LCSC</th><th className="num">Stock</th><th className="num">Each</th></tr></thead>
                    <tbody>
                      {res.sourcing.lines.map((l, i) => (
                        <tr key={i}>
                          <td>{l.ref}</td><td>{l.item}</td><td>{l.quantity}</td>
                          <td>{l.lcsc ? <a href={l.url ?? '#'} target="_blank" rel="noreferrer">{l.lcsc}</a> : <span className="muted">buy separately</span>}{l.lcsc && (l.basic ? ' · basic' : ' · extended')}</td>
                          <td className="num">{l.lcsc ? l.stock.toLocaleString() : ''}</td>
                          <td className="num">{l.unit !== null ? `$${l.unit.toFixed(3)}` : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </div>
            ) : (
              <p className="pcb-note">Live part prices were unavailable (no internet?). The BOM file still lists every part.</p>
            )}

            {job && <CaseSection jobId={job} />}

            <div className="prose pcb-order" id="pcb-order">
              <h3>How to order it</h3>
              <ol>
                <li>Click <strong>Download files for the factory</strong>. The zip holds the Gerber and drill files, the standard format every PCB maker accepts.</li>
                <li>Go to <a href={res.fab.quote} target="_blank" rel="noreferrer">{res.fab.name}</a> (or any PCB maker) and upload the zip. It reads the size and layers by itself. Keep the defaults: 2 layers, 1.6 mm thick, any colour you like.</li>
                <li>Most makers produce at least 5 boards. Small 2-layer boards usually cost a few dollars plus shipping; their website shows the exact price before you pay.</li>
                <li>Want them assembled? Upload the <strong>parts list (BOM)</strong> and <strong>part positions (CPL)</strong> too, and choose each part's stock number on their site.</li>
              </ol>
              <h3>When the boards arrive</h3>
              <ol>
                <li>Solder the lowest parts first (resistors), then the taller ones. Each part's outline and name is printed on the board.</li>
                <li>LEDs: the <strong>square pad</strong> is for the short leg (−). Electrolytic capacitors: the square pad is +.</li>
                <li>Solder female header sockets where the {project.board === 'none' ? 'chips' : 'board and modules'} go, so you can unplug them later.</li>
                <li>Plug in USB and run the same program as on the breadboard. It's the same circuit, so it behaves the same way.</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
