// "Circuit board" tab: turns the design into a real, routed printed circuit board (KiCad +
// Freerouting on the local server) and hands over the files a PCB factory needs.
import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from './store';
import { slug } from './exporters';

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
  lib_footprint_mismatch: 'A footprint differs slightly from the library version. This is harmless.',
  'schematic_parity:net_conflict': 'A pad is connected differently from the schematic.',
  'schematic_parity:missing_footprint': 'A part in the schematic is missing from the board.',
  'schematic_parity:extra_footprint': 'The board has a part that is not in the schematic.',
};

const jobKey = (id: string) => `sb-pcb-job-${id}`;

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
  const [error, setError] = useState('');
  const designKey = useMemo(() => JSON.stringify([project.parts.map((p) => [p.id, p.type, p.props]), project.wires.map((w) => [w.a, w.b])]), [project]);
  const [builtFor, setBuiltFor] = useState<string | null>(null);

  // Poll the job until it finishes.
  useEffect(() => {
    if (!job) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/pcb/status?id=${job}`);
        if (r.status === 404) {
          setJob(null);
          return;
        }
        const s: Status = await r.json();
        if (stop) return;
        setStatus(s);
        if (!s.done) setTimeout(tick, 900);
      } catch {
        if (!stop) setTimeout(tick, 2000);
      }
    };
    tick();
    return () => {
      stop = true;
    };
  }, [job]);

  async function build() {
    setError('');
    setStatus(null);
    try {
      const r = await fetch('/api/pcb/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Could not start the board design.');
      setJob(d.id);
      setBuiltFor(designKey);
      try {
        localStorage.setItem(jobKey(project.id), d.id);
      } catch {
        /* not remembered across reloads */
      }
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }

  const res = status?.result;
  const running = !!job && !!status && !status.done;
  const stale = res && builtFor && builtFor !== designKey;
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
          {!running && (
            <button className="primary" onClick={build} data-testid="pcb-build">
              {res ? (stale ? 'Update the board for the changed design' : 'Design it again') : 'Design my circuit board'}
            </button>
          )}
        </div>

        {error && <div className="banner error">{error}</div>}
        {tools && !tools.freerouting && <div className="banner">Automatic track routing needs Java and Freerouting. Without them you get the placed board and you route it yourself in KiCad.</div>}

        {(running || (status && !res && !status.error)) && (
          <ol className="pcb-steps" data-testid="pcb-progress">
            {[
              { label: 'Placing the parts and routing the copper tracks', at: 1 },
              { label: 'Checking design rules (KiCad DRC)', at: 3 },
              { label: 'Exporting manufacturing files', at: 4 },
              { label: 'Rendering the board in 3D', at: 5 },
            ].map((st, i, all) => {
              const n = status?.log.length ?? 0;
              const done = status?.done || n > st.at || (i < all.length - 1 && n >= all[i + 1].at);
              const current = !done && n >= st.at;
              return (
                <li key={st.label} className={done ? 'done' : current ? 'current' : ''}>
                  {i === 0 && status?.log[1] ? `${st.label}: ${status.log[1].toLowerCase()}` : st.label}
                </li>
              );
            })}
          </ol>
        )}
        {status?.error && <div className="banner error">The board design failed: {status.error}</div>}

        {res && (
          <div className="pcb-result" data-testid="pcb-result">
            {stale && <div className="banner">You changed the design since this board was made. Click <strong>Update the board</strong> to redo it.</div>}
            <div className={`pcb-verdict ${ok ? 'ok' : 'bad'}`}>
              <strong>{ok ? '✓ Ready to order' : 'Needs attention before ordering'}</strong>
              <p>
                {res.widthMm} × {res.heightMm} mm, 2 copper layers, {res.tracks} tracks{res.vias ? ` and ${res.vias} vias (small holes that pass a track to the other side)` : ''}, ground fill on both sides, 4 M3 mounting holes.{' '}
                {ok ? 'KiCad’s design rule check found no errors against common factory limits (tracks and gaps at least 0.15 mm, holes at least 0.3 mm). KiCad also confirmed that every pad matches the schematic and every connection has a track.' : ''}
              </p>
              {!ok && (
                <ul>
                  {!res.routed && <li>Automatic routing didn't finish. Open the KiCad board file and route the remaining connections.</li>}
                  {res.drc.unconnected > 0 && <li>{res.drc.unconnected} connection{res.drc.unconnected === 1 ? '' : 's'} still need a track.</li>}
                  {res.drc.errors.map((e, i) => <li key={i}>{PLAIN[e.type] ?? e.description} <span className="pcb-tech">({e.type})</span></li>)}
                  {res.problems.map((p, i) => <li key={`p${i}`}>{p}</li>)}
                </ul>
              )}
              {res.drc.warnings.length > 0 && <p className="pcb-note">{res.drc.warnings.length} minor note{res.drc.warnings.length === 1 ? '' : 's'}: {[...new Set(res.drc.warnings.map((w) => PLAIN[w.type] ?? w.description))].join(' ')}</p>}
            </div>

            <div className="pcb-downloads">
              <a className="button primary" href={`/api/pcb/zip?id=${job}&kind=fab&name=${name}`} data-testid="pcb-gerbers">Download files for the factory (.zip)</a>
              <a className="button" href={`/api/pcb/zip?id=${job}&kind=all&name=${name}`}>All board files: KiCad, 3D, assembly (.zip)</a>
              <a className="button" href={file(`fab/bom-jlcpcb.csv`)}>Assembly parts list (BOM)</a>
              <a className="button" href={file(`fab/cpl-jlcpcb.csv`)}>Part positions (CPL)</a>
            </div>

            <div className="pcb-picture">
              <div className="pcb-toggle" role="tablist">
                {(['top', 'bottom', 'copper'] as const).map((s) => (
                  <button key={s} role="tab" aria-selected={side === s} className={side === s ? 'active' : ''} onClick={() => setSide(s)}>
                    {s === 'top' ? 'Top' : s === 'bottom' ? 'Bottom' : 'Copper tracks'}
                  </button>
                ))}
              </div>
              <img src={file(side === 'top' ? 'board-top.png' : side === 'bottom' ? 'board-bottom.png' : 'board.svg')} alt={`Circuit board, ${side} view`} className={side === 'copper' ? 'copper' : ''} />
            </div>

            {res.sourcing ? (
              <div className="pcb-sourcing" data-testid="pcb-sourcing">
                <h3>Before you order</h3>
                <ul className="pcb-dfm">
                  {res.sourcing.dfm.map((d, i) => (
                    <li key={i} className={d.level}>{d.level === 'ok' ? '✓' : d.level === 'warn' ? '!' : 'ℹ'} {d.text}</li>
                  ))}
                </ul>
                <h3>What the parts cost</h3>
                <table className="bom pcb-cost">
                  <thead><tr><th>Boards</th><th className="num">Parts (LCSC, live)</th><th className="num">Per board</th></tr></thead>
                  <tbody>
                    {res.sourcing.cost.map((c) => (
                      <tr key={c.boards}><td>{c.boards}</td><td className="num">${c.parts.toFixed(2)}</td><td className="num">${c.perBoard.toFixed(2)}</td></tr>
                    ))}
                  </tbody>
                </table>
                <p className="pcb-note">Live LCSC prices for the parts that go on the board (sockets for plug-in boards and modules; buy those separately{res.sourcing.cost[0].missing ? `, plus ${res.sourcing.cost[0].missing} part${res.sourcing.cost[0].missing > 1 ? 's' : ''} not stocked at LCSC` : ''}). The bare boards are priced by the maker when you upload the files: <a href="https://cart.jlcpcb.com/quote" target="_blank" rel="noreferrer">JLCPCB quote</a>, <a href="https://www.pcbway.com/orderonline.aspx" target="_blank" rel="noreferrer">PCBWay quote</a>.</p>
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

            <div className="prose pcb-order">
              <h3>How to order it</h3>
              <ol>
                <li>Click <strong>Download files for the factory</strong>. The zip holds the Gerber and drill files, the standard format every PCB maker accepts.</li>
                <li>Go to a PCB maker such as JLCPCB, PCBWay or OSH Park and upload the zip. It reads the size and layers by itself. Keep the defaults: 2 layers, 1.6 mm thick, any colour you like.</li>
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
