import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Banner, ButtonLink, Disclosure, Field, Segmented, Tabs } from '../../src/ui/ds';

const html = (el: JSX.Element) => renderToStaticMarkup(el);

describe('ds: core components', () => {
  it('renders tabs with a roving tabindex, badges, test ids and trailing content outside the tablist', () => {
    const out = html(
      <Tabs variant="underline" className="console-tabs" value="tests" onChange={() => {}} items={[{ id: 'serial', label: 'Serial' }, { id: 'tests', label: 'Tests', badge: <span className="count ok">3 ✓</span>, testId: 'tests-tab' }]}>
        <span className="sim-time">1.2 s simulated</span>
      </Tabs>,
    );
    expect(out).toContain('class="tabs console-tabs"');
    expect(out).toMatch(/aria-selected="false" tabindex="-1"[^>]*>Serial/);
    expect(out).toMatch(/aria-selected="true" tabindex="0" class="active"[^>]*data-testid="tests-tab"/);
    expect(out).toContain('<span class="ds-tab-badge"><span class="count ok">3 ✓</span></span>');
    expect(out).toMatch(/<\/div><div class="ds-tabs-trail"><span class="sim-time">/);
  });

  it('names the segmented and file variants', () => {
    expect(html(<Tabs variant="segmented" tone="dark" value="a" onChange={() => {}} items={[{ id: 'a', label: 'A' }]} />)).toContain('class="ds-tabs ds-tabs-segmented dark"');
    expect(html(<Tabs variant="file" value="a" onChange={() => {}} items={[{ id: 'a', label: 'A' }]} />)).toContain('class="ds-tabs ds-tabs-file"');
  });

  it('gives ButtonLink the Button variants', () => {
    expect(html(<ButtonLink variant="primary" href="/x.zip">Get</ButtonLink>)).toBe('<a class="ds-button-link primary" href="/x.zip">Get</a>');
  });

  it('folds a Disclosure and opens it by default when asked', () => {
    const out = html(<Disclosure summary="Power" defaultOpen data-testid="p">Body</Disclosure>);
    expect(out).toMatch(/^<details class="ds-disclosure" open="" data-testid="p"><summary>/);
    expect(out).toContain('<div class="ds-disclosure-body">Body</div>');
    expect(html(<Disclosure summary="x" variant="plain">y</Disclosure>)).not.toContain(' open=');
  });

  it('makes Segmented a radio group with one option in the Tab order', () => {
    const out = html(<Segmented label="Case style" value="b" onChange={() => {}} options={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} />);
    expect(out).toContain('role="radiogroup" aria-label="Case style" class="ds-segmented"');
    expect(out).toMatch(/aria-checked="false" tabindex="-1"[^>]*>A/);
    expect(out).toMatch(/aria-checked="true" tabindex="0" class="is-on"[^>]*>B/);
  });

  it('has an inline Banner and a row Field', () => {
    expect(html(<Banner tone="error" variant="inline">Bad</Banner>)).toBe('<div role="alert" class="banner inline error">Bad</div>');
    expect(html(<Field label="Pin" layout="row"><input /></Field>)).toContain('class="ds-field row"');
  });
});
