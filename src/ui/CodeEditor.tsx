// CodeMirror 6 editor for the firmware files.
import React, { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { python } from '@codemirror/lang-python';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet } from '@codemirror/view';

const setErrorLine = StateEffect.define<number | null>();
const errorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setErrorLine)) {
        if (e.value === null || e.value < 1 || e.value > tr.state.doc.lines) return Decoration.none;
        const line = tr.state.doc.line(e.value);
        return Decoration.set([Decoration.line({ class: 'cm-error-line' }).range(line.from)]);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

let active: EditorView | null = null;
/** The text the user has selected in the code editor (for "change this part" AI requests). */
export function getEditorSelection(): string {
  if (!active) return '';
  const r = active.state.selection.main;
  return r.empty ? '' : active.state.sliceDoc(r.from, r.to);
}

export function CodeEditor({ value, onChange, errorLine, fileKey }: { value: string; onChange(v: string): void; errorLine?: number | null; fileKey: string }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          python(),
          errorField,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
          EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { fontFamily: 'var(--mono)', fontSize: '13px' } }),
        ],
      }),
    });
    view.current = v;
    active = v;
    return () => {
      if (active === v) active = null;
      v.destroy();
    };
  }, [fileKey]);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ effects: setErrorLine.of(errorLine ?? null) });
    if (errorLine && errorLine <= v.state.doc.lines) {
      const line = v.state.doc.line(errorLine);
      v.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
    }
  }, [errorLine, fileKey]);

  return <div className="code-host" ref={host} />;
}
