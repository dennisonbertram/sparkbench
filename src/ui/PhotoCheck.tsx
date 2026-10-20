// "Check my build": the user uploads a photo of their breadboard and Claude compares it with the design.
import React, { useRef, useState } from 'react';
import { useStore } from './store';
import { shrinkImage as shrink } from './images';

interface Issue { parts: string[]; problem: string; fix: string; confidence: 'high' | 'medium' | 'low' }
interface Result { verdict: 'looks-right' | 'problems' | 'cant-tell'; summary: string; issues: Issue[]; could_not_check: string[]; photo_tips: string | null }

export function PhotoCheck() {
  const project = useStore((s) => s.project)!;
  const ai = useStore((s) => s.aiStatus);
  const input = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<{ data: string; mediaType: 'image/jpeg'; preview: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    setResult(null);
    try {
      setPhotos((await Promise.all([...files].slice(0, 4).map(shrink))));
    } catch {
      setError("That file couldn't be opened as a picture. Try a JPEG or PNG.");
    }
  }

  async function check() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const r = await fetch('/api/ai/photo-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project, images: photos.map(({ data, mediaType }) => ({ data, mediaType })) }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'The check failed.');
      setResult(d);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="photo-check" data-testid="photo-check">
      <div className="pc-head">
        <div>
          <strong>Check my build from a photo</strong>
          <p>Built it on a breadboard? Take a photo from straight above in good light and Claude will compare it with this design: LEDs the wrong way round, legs one hole off, jumpers on the wrong pin, missing wires.</p>
        </div>
        <div className="pc-actions">
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => pick(e.target.files)} data-testid="photo-input" />
          <button onClick={() => input.current?.click()}>{photos.length ? 'Choose other photos' : 'Choose photo'}</button>
          {photos.length > 0 && (
            <button className="primary" disabled={busy || !ai?.enabled} onClick={check} title={ai?.enabled ? '' : 'Needs Claude: log in to Claude Code or set ANTHROPIC_API_KEY'}>
              {busy ? 'Checking… (about 30 s)' : 'Check wiring'}
            </button>
          )}
        </div>
      </div>
      {photos.length > 0 && (
        <div className="pc-thumbs">
          {photos.map((p, i) => <img key={i} src={p.preview} alt={`Your build, photo ${i + 1}`} />)}
        </div>
      )}
      {!ai?.enabled && photos.length > 0 && <p className="pc-note">Photo checks need Claude. Log in to Claude Code or set ANTHROPIC_API_KEY, then reload.</p>}
      {error && <div className="banner error">{error}</div>}
      {result && (
        <div className={`pc-result ${result.verdict}${result.verdict === 'looks-right' && result.could_not_check.length ? ' partial' : ''}`} data-testid="photo-result">
          <p className="pc-verdict">{result.verdict === 'looks-right' ? (result.could_not_check.length ? `No problems seen, but ${result.could_not_check.length === 1 ? 'one thing' : `${result.could_not_check.length} things`} to check by eye` : '✓ Looks right') : result.verdict === 'problems' ? `${result.issues.length} problem${result.issues.length === 1 ? '' : 's'} found` : "Couldn't check this photo"}</p>
          <p>{result.summary}</p>
          {result.issues.length > 0 && (
            <ol>
              {result.issues.map((x, i) => (
                <li key={i}>
                  <span className="pc-parts">{x.parts.join(', ')}</span> {x.problem}
                  <div className="pc-fix">Fix: {x.fix}{x.confidence !== 'high' ? ` (${x.confidence} confidence: double-check this one)` : ''}</div>
                </li>
              ))}
            </ol>
          )}
          {result.could_not_check.length > 0 && (
            <div className="pc-unchecked">
              <p>Couldn't see from this photo, so check these yourself:</p>
              <ul>{result.could_not_check.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {result.photo_tips && <p className="pc-note">Photo tip: {result.photo_tips}</p>}
          <p className="pc-note">An AI check from a photo can miss things or be wrong. Before you power up, check the board pins against the wiring table below.</p>
        </div>
      )}
    </section>
  );
}
