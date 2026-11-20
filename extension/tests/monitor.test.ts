// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { applyCheck, createMonitor, elementText, extractText, isDue, listMonitors, validateMonitor, type Monitor } from '../src/monitor/monitor';
import { installSelectorBuilder, readSelector } from '../src/monitor/selector';
import { freshDb } from './helpers';

const sel = (el: Element) => (globalThis as unknown as { __eideticSelector: (e: Element) => string }).__eideticSelector(el);

describe('selector building', () => {
  beforeEach(() => installSelectorBuilder());
  it('uses a stable id', () => {
    document.body.innerHTML = '<main><div id="price-box"><span>$20</span></div></main>';
    expect(sel(document.getElementById('price-box')!)).toBe('#price-box');
  });
  it('skips generated ids and classes, and stays unique', () => {
    document.body.innerHTML = '<div id="app-83749283"><ul class="list css-1x9fk2a"><li class="item">A</li><li class="item">B</li><li class="item">C</li></ul></div>';
    const b = document.querySelectorAll('li')[1]!;
    const s = sel(b);
    expect(s).not.toMatch(/83749283|css-1x9/);
    expect(document.querySelectorAll(s)).toHaveLength(1);
    expect(document.querySelector(s)).toBe(b);
  });
  it('prefers test attributes', () => {
    document.body.innerHTML = '<section><p data-testid="fee">Fee</p><p>Other</p></section>';
    expect(sel(document.querySelector('[data-testid=fee]')!)).toBe('p[data-testid="fee"]');
  });
  it('finds the same element in a fresh copy of the page', () => {
    const html = '<table><tr><td>Plan</td><td>Price</td></tr><tr><td>Basic</td><td>$5</td></tr></table><table><tr><td>x</td></tr></table>';
    document.body.innerHTML = html;
    const target = document.querySelectorAll('table')[0]!.querySelectorAll('td')[3]!;
    const s = sel(target);
    expect(extractText(`<html><body>${html}</body></html>`, s)).toBe('$5');
    expect(readSelector(s)).toBe('$5');
    expect(readSelector('<<bad')).toBeNull();
  });
});

describe('reading fetched pages', () => {
  it('keeps line breaks for blocks and <br>, skips scripts', () => {
    const d = new DOMParser().parseFromString('<div id="t">Fees<br>Tuition: $1,200<p>Lab   fee</p><script>evil()</script><ul><li>a</li><li>b</li></ul></div>', 'text/html');
    expect(elementText(d.getElementById('t')!)).toBe('Fees\nTuition: $1,200\nLab fee\na\nb');
  });
  it('returns null when the part is missing or the selector is invalid', () => {
    expect(extractText('<p>hi</p>', '#nope')).toBeNull();
    expect(extractText('<p>hi</p>', '[[')).toBeNull();
  });
});

const mon = (p: Partial<Monitor> = {}): Monitor => ({ id: 'm', url: 'https://uni.example/fees', title: 'Fees', site: 'uni.example', selector: '#t', text: 'Tuition: $1,200', intervalMin: 60, createdAt: 0, lastCheckedAt: 0, lastChangedAt: 0, status: 'ok', changes: [], unread: 0, ...p });

describe('checks', () => {
  it('records a change with categories and counts it as unread', () => {
    const { next, changed } = applyCheck(mon(), { text: 'Tuition:   $1,350\nLate fee applies' }, 1000);
    expect(changed).toBe(true);
    expect(next).toMatchObject({ text: 'Tuition: $1,350\nLate fee applies', lastChangedAt: 1000, lastCheckedAt: 1000, unread: 1, status: 'ok' });
    expect(next.changes[0]!.summary.numbers).toEqual([{ label: 'Tuition', from: '$1,200', to: '$1,350' }]);
    expect(next.changes[0]!.line).toMatch(/1 number changed/);
  });
  it('does not record unchanged text, missing parts or errors as changes', () => {
    expect(applyCheck(mon(), { text: ' Tuition: $1,200 ' }).changed).toBe(false);
    expect(applyCheck(mon(), { notFound: true }).next.status).toBe('not-found');
    const e = applyCheck(mon(), { error: 'No access', permission: true }).next;
    expect(e).toMatchObject({ status: 'needs-permission', error: 'No access', text: 'Tuition: $1,200' });
  });
  it('knows when a check is due', () => {
    expect(isDue(mon({ lastCheckedAt: 0, intervalMin: 60 }), 3_600_000)).toBe(true);
    expect(isDue(mon({ lastCheckedAt: 0, intervalMin: 60 }), 1_000_000)).toBe(false);
    expect(isDue(mon({ status: 'needs-permission' }), 9e12)).toBe(false);
  });
  it('validates stored or imported monitors', () => {
    expect(validateMonitor({ ...mon(), url: 'javascript:alert(1)' })).toBeNull();
    expect(validateMonitor({ ...mon(), selector: '' })).toBeNull();
    const v = validateMonitor({ ...mon(), intervalMin: 1, status: 'weird', changes: [{ at: 1, line: 'x', summary: { added: ['a', 3], numbers: [{ from: '1', to: '2' }] } }, 'junk'] })!;
    expect(v.intervalMin).toBe(60);
    expect(v.status).toBe('new');
    expect(v.changes[0]!.summary).toEqual({ added: ['a'], removed: [], changed: [], numbers: [{ label: '', from: '1', to: '2' }], same: false });
  });
});

describe('monitor store', () => {
  beforeEach(freshDb);
  it('saves a monitor for the chosen part', async () => {
    await createMonitor({ url: 'https://uni.example/fees', title: 'Fees', selector: '#t', text: 'Tuition:  $1,200\n\n' });
    const [m] = await listMonitors();
    expect(m).toMatchObject({ site: 'uni.example', text: 'Tuition: $1,200', intervalMin: 60, unread: 0 });
    await expect(createMonitor({ url: 'file:///x', title: '', selector: '#t', text: 'x' })).rejects.toThrow(/http/);
  });
});
